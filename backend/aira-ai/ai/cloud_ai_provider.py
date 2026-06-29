import base64
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
ENV_PATHS = [BASE_DIR / ".env", BASE_DIR.parent / ".env"]


def load_local_env():
    for env_path in ENV_PATHS:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


load_local_env()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip()
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openrouter/free").strip()
OPENROUTER_APP_URL = os.environ.get("OPENROUTER_APP_URL", "http://localhost:3000").strip()
OPENROUTER_APP_NAME = os.environ.get("OPENROUTER_APP_NAME", "AIRA").strip()


class CloudAIError(RuntimeError):
    pass


def cloud_ai_available():
    return bool(GEMINI_API_KEY or OPENROUTER_API_KEY)


def generate_json(prompt, image_path=None, timeout=120):
    errors = []
    deadline = time.monotonic() + max(20, timeout)

    def attempt_timeout(preferred):
        remaining = int(deadline - time.monotonic())
        if remaining < 5:
            raise CloudAIError("The overall AI request deadline was reached.")
        return max(5, min(preferred, remaining))

    if GEMINI_API_KEY:
        gemini_models = list(dict.fromkeys([GEMINI_MODEL, "gemini-2.5-flash-lite"]))
        for model_name in gemini_models:
            try:
                result = call_gemini(
                    prompt,
                    image_path=image_path,
                    timeout=attempt_timeout(60),
                    model_name=model_name,
                )
                return result, f"Gemini ({model_name})"
            except Exception as error:
                errors.append(f"Gemini ({model_name}): {error}")

    if OPENROUTER_API_KEY:
        try:
            return call_openrouter(
                prompt,
                image_path=image_path,
                timeout=attempt_timeout(55),
            ), "OpenRouter"
        except Exception as error:
            errors.append(f"OpenRouter: {error}")

    if not errors:
        raise CloudAIError("No cloud AI provider is configured.")
    raise CloudAIError(" | ".join(errors))


def call_gemini(prompt, image_path=None, timeout=120, model_name=None):
    parts = [{"text": prompt}]
    if image_path:
        mime_type, encoded = encode_image(image_path)
        parts.append({"inline_data": {"mime_type": mime_type, "data": encoded}})

    model = urllib.parse.quote(model_name or GEMINI_MODEL, safe="-_.")
    key = urllib.parse.quote(GEMINI_API_KEY, safe="")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.15,
            "responseMimeType": "application/json",
            "maxOutputTokens": 16384,
        },
    }
    result = post_json(url, payload, timeout=timeout)
    candidates = result.get("candidates") if isinstance(result, dict) else None
    if not candidates:
        raise CloudAIError(extract_provider_error(result) or "Gemini returned no candidate.")
    response_parts = candidates[0].get("content", {}).get("parts", [])
    text = "\n".join(str(part.get("text") or "") for part in response_parts if isinstance(part, dict))
    return parse_json_response(text)


def call_openrouter(prompt, image_path=None, timeout=120):
    content = [{"type": "text", "text": prompt}]
    if image_path:
        mime_type, encoded = encode_image(image_path)
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{encoded}"},
        })

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.15,
        "max_tokens": 16384,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": OPENROUTER_APP_URL,
        "X-Title": OPENROUTER_APP_NAME,
    }
    result = post_json(
        "https://openrouter.ai/api/v1/chat/completions",
        payload,
        headers=headers,
        timeout=timeout,
    )
    choices = result.get("choices") if isinstance(result, dict) else None
    if not choices:
        raise CloudAIError(extract_provider_error(result) or "OpenRouter returned no choice.")
    return parse_json_response(choices[0].get("message", {}).get("content", ""))


def post_json(url, payload, headers=None, timeout=120):
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=request_headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="ignore")
        raise CloudAIError(f"HTTP {error.code}: {extract_provider_error(body) or body[:300]}")
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        raise CloudAIError(str(error))


def encode_image(image_path):
    path = Path(image_path)
    suffix = path.suffix.lower()
    mime_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
    }.get(suffix, "image/png")
    return mime_type, base64.b64encode(path.read_bytes()).decode("ascii")


def parse_json_response(value):
    if isinstance(value, dict):
        return value
    text = str(value or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if not match:
            raise CloudAIError("Provider did not return valid JSON.")
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise CloudAIError("Provider JSON response must be an object.")
    return parsed


def extract_provider_error(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return value.strip()
    if not isinstance(value, dict):
        return ""
    error = value.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("status") or "")
    return str(error or value.get("message") or "")

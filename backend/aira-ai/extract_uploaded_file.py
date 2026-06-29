import base64
import html
import json
import re
import sys
import tempfile
import zlib
from pathlib import Path
from zipfile import ZipFile

from ai.uml_image_to_text import extract_text_from_uml


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        file_name = str(payload.get("fileName") or "uploaded-file")
        mime_type = str(payload.get("mimeType") or "")
        raw = decode_data_url(str(payload.get("fileData") or ""))
        extension = Path(file_name).suffix.lower()

        text = extract_text(file_name, mime_type, extension, raw)
        text = normalize_text(text)
        print(json.dumps({
            "fileName": file_name,
            "mimeType": mime_type,
            "title": infer_title(text, file_name),
            "text": text[:8000],
        }, ensure_ascii=True))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


def decode_data_url(value):
    match = re.match(r"^data:[^;]+;base64,(.+)$", value, flags=re.S)
    data = match.group(1) if match else value
    return base64.b64decode(data)


def extract_text(file_name, mime_type, extension, raw):
    if extension == ".txt" or mime_type.startswith("text/"):
        return raw.decode("utf-8", errors="ignore")
    if extension == ".docx":
        return extract_docx_text(raw)
    if extension == ".doc":
        return extract_legacy_doc_text(raw)
    if extension == ".pdf":
        return extract_pdf_text(raw)
    if extension in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".avif"} or mime_type.startswith("image/"):
        return extract_image_text(raw, extension)
    return ""


def extract_docx_text(raw):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as temp:
        temp.write(raw)
        temp_path = Path(temp.name)

    try:
        with ZipFile(temp_path) as archive:
            xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
        text = re.sub(r"</w:p>", "\n", xml)
        text = re.sub(r"<[^>]+>", " ", text)
        return html.unescape(text)
    finally:
        temp_path.unlink(missing_ok=True)


def extract_legacy_doc_text(raw):
    """Best-effort text recovery for old binary .doc files.

    This is not a full Word parser, but it prevents uploaded .doc files from
    becoming completely blank when the document contains recoverable text.
    """
    candidates = []
    for encoding in ("utf-16-le", "latin1"):
        try:
            decoded = raw.decode(encoding, errors="ignore")
        except Exception:
            continue
        chunks = re.findall(r"[A-Za-z0-9][A-Za-z0-9\s.,;:!?()/_&%#@'\"+-]{3,}", decoded)
        candidates.extend(chunks)

    cleaned = []
    seen = set()
    for chunk in candidates:
        value = re.sub(r"\s+", " ", chunk).strip()
        if len(value) < 4 or value in seen:
            continue
        if sum(ch.isalpha() for ch in value) < 3:
            continue
        seen.add(value)
        cleaned.append(value)

    return "\n".join(cleaned[:400])


def extract_pdf_text(raw):
    streams = [raw]
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", raw, flags=re.S):
        stream = match.group(1)
        streams.append(stream)
        try:
            streams.append(zlib.decompress(stream))
        except zlib.error:
            pass

    parts = []
    for stream in streams:
        data = stream.decode("latin1", errors="ignore")
        parts.extend(extract_pdf_text_operators(data))
    return "\n".join(part for part in parts if part.strip())


def extract_pdf_text_operators(data):
    parts = []
    for match in re.finditer(r"\((?:\\.|[^\\)])*\)\s*(?:Tj|'|\")", data, flags=re.S):
        value = match.group(0).rsplit(")", 1)[0][1:]
        parts.append(unescape_pdf_text(value))

    for array in re.findall(r"\[(.*?)\]\s*TJ", data, flags=re.S):
        values = re.findall(r"\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>", array, flags=re.S)
        literal_values = re.findall(r"\(((?:\\.|[^\\)])*)\)", array, flags=re.S)
        parts.extend(unescape_pdf_text(value) for value in literal_values)
        for hex_value in values:
            if hex_value:
                parts.append(decode_pdf_hex(hex_value))
    return parts


def decode_pdf_hex(value):
    compact = re.sub(r"\s+", "", value)
    if len(compact) % 2:
        compact += "0"
    try:
        raw = bytes.fromhex(compact)
    except ValueError:
        return ""
    if raw.startswith(b"\xfe\xff"):
        return raw[2:].decode("utf-16-be", errors="ignore")
    return raw.decode("latin1", errors="ignore")


def unescape_pdf_text(value):
    text = re.sub(
        r"\\([0-7]{1,3})",
        lambda match: chr(int(match.group(1), 8)),
        value,
    )
    replacements = {
        r"\(": "(",
        r"\)": ")",
        r"\\": "\\",
        r"\n": "\n",
        r"\r": "\n",
        r"\t": "\t",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return text


def extract_image_text(raw, extension):
    suffix = extension if extension else ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        temp.write(raw)
        temp_path = Path(temp.name)

    try:
        return extract_text_from_uml(str(temp_path))
    finally:
        temp_path.unlink(missing_ok=True)


def normalize_text(value):
    text = re.sub(r"[ \t]+", " ", str(value or ""))
    text = remove_table_of_contents(text)
    text = re.sub(r"\bTOC\s+\\o.+?(?=Chapter\s+1\b|Introduction\s*:)", " ", text, flags=re.I | re.S)
    text = re.sub(r"PAGEREF\s+_Toc\d+\s+\\h\s+\d+", " ", text, flags=re.I)
    text = re.sub(r"\\h|\\z|\\u", " ", text)
    text = re.sub(r"\n\s+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = fix_spaced_words(text)
    return text.strip()


def infer_title(text, file_name):
    for line in str(text or "").splitlines()[:20]:
        cleaned = fix_spaced_words(line.strip(" :-"))
        if re.search(r"artificial intelligence requirement analyzer|AIRA", cleaned, re.I):
            return "Artificial Intelligence Requirement Analyzer (AIRA)"
        if re.search(r"project\s+name", cleaned, re.I):
            title = re.sub(r"project\s+name\s*[:\-]?", "", cleaned, flags=re.I).strip()
            if title:
                return title[:100]
        if 8 <= len(cleaned) <= 100 and not re.search(r"table of contents|software requirements specification", cleaned, re.I):
            return cleaned[:100]

    return Path(file_name).stem.replace("_", " ").replace("-", " ").strip()


def fix_spaced_words(value):
    replacements = {
        r"\bA\s+rtificial\b": "Artificial",
        r"\bT\s+he\b": "The",
        r"\bU\s+niversity\b": "University",
        r"\bo\s+f\b": "of",
        r"\bC\s+hakwal\b": "Chakwal",
        r"\bP\s+urpose\b": "Purpose",
        r"\bPro\s+posed\b": "Proposed",
        r"\bS\s+olution\b": "Solution",
    }
    text = str(value or "")
    for pattern, replacement in replacements.items():
        text = re.sub(pattern, replacement, text, flags=re.I)
    return text


def remove_table_of_contents(value):
    text = str(value or "")
    text = re.sub(
        r"Table of Contents\s+.*?(?=\n\s*(?:Chapter\s+1\b|1\.\s*Introduction\b|Introduction\s*:))",
        "\n",
        text,
        flags=re.I | re.S,
    )
    return text


if __name__ == "__main__":
    raise SystemExit(main())

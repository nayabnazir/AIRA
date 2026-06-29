import json
import sys

from ai.srs_generation_service import generate_srs


def write_response(response):
    print(json.dumps(response, ensure_ascii=True), flush=True)


def main():
    for line in sys.stdin:
        try:
            payload = json.loads(line or "{}")
            request_id = payload.get("id")
            data = payload.get("payload") or {}
            result = generate_srs(
                str(data.get("title") or "The Proposed System").strip(),
                str(data.get("project_description") or "").strip(),
                top_n=int(data.get("top_n") or 16),
                language=str(data.get("language") or "English").strip(),
            )
            write_response({"id": request_id, "ok": True, "result": result})
        except Exception as error:
            write_response({"id": payload.get("id") if "payload" in locals() else None, "ok": False, "error": str(error)})


if __name__ == "__main__":
    main()

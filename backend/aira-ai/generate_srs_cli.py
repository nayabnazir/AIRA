import json
import sys

from ai.srs_generation_service import generate_srs


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        title = str(payload.get("title") or "The Proposed System").strip()
        description = str(payload.get("project_description") or "").strip()
        top_n = int(payload.get("top_n") or 35)
        result = generate_srs(title, description, top_n=top_n)
        print(json.dumps(result, ensure_ascii=True))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

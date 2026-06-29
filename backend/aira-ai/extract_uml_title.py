import json
import re
import sys

from ai.uml_image_to_text import extract_text_from_uml


GENERIC_TERMS = {
    "uml",
    "diagram",
    "use case",
    "class",
    "sequence",
    "activity",
    "erd",
    "actor",
    "system boundary",
    "user",
    "admin",
}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"title": "", "text": "", "error": "Image path is required."}))
        return 1

    text = extract_text_from_uml(sys.argv[1])
    title = infer_title(text)
    print(json.dumps({"title": title, "text": text}, ensure_ascii=True))
    return 0


def infer_title(text):
    lines = [
        (index, clean_line(line))
        for index, line in enumerate(str(text or "").splitlines())
    ]
    lines = [(index, line) for index, line in lines if is_title_candidate(line)]

    if not lines:
        return ""

    lines.sort(key=lambda item: score_title_candidate(item[1], item[0]), reverse=True)
    return title_case(lines[0][1][:80])


def clean_line(line):
    value = str(line or "").replace("|", " ")
    value = re.sub(r"[^A-Za-z0-9&/(). -]+", " ", value)
    return re.sub(r"\s+", " ", value).strip(" -_:;,.")


def is_title_candidate(line):
    value = line.strip()
    if len(value) < 3 or len(value) > 90:
        return False
    if len(re.findall(r"[A-Za-z]", value)) < 3:
        return False
    if value.lower() in GENERIC_TERMS:
        return False
    return True


def score_title_candidate(line, index):
    lower = line.lower()
    score = 0

    if index <= 2:
        score += 8 - index
    elif index <= 5:
        score += 2

    if any(term in lower for term in ("system", "management", "application", "portal", "platform", "store", "library", "hospital", "healthcare")):
        score += 6
    if any(term in lower for term in ("use case", "class", "sequence", "activity", "erd")):
        score += 2
    if 12 <= len(line) <= 60:
        score += 3
    if re.search(r"\b(login|register|delete|update|search|view|generate|download|upload|manage|place|cancel|change)\b", lower):
        score -= 3
    if line.count(" ") >= 2:
        score += 2

    return score


def title_case(value):
    small_words = {"and", "or", "of", "for", "to", "the", "a", "an", "in", "on"}
    words = []

    for index, word in enumerate(str(value).split()):
        lower = word.lower()
        if index and lower in small_words:
            words.append(lower)
        else:
            words.append(lower[:1].upper() + lower[1:])

    return " ".join(words)


if __name__ == "__main__":
    raise SystemExit(main())

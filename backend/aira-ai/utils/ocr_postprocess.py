import re

COMMON_FIXES = {
    "mothod": "method",
    "mothodt": "method",
    "meth0d": "method",
    "tnterface": "interface",
    "interac": "interface",
    "tnterlace": "interface",
    "ype": "type",
    "tyee": "type",
    "typ9": "type"
}

def clean_ocr_text(text: str) -> str:
    text = text.lower()

    for wrong, correct in COMMON_FIXES.items():
        text = text.replace(wrong, correct)

    text = re.sub(r"[^a-z0-9+():.\n ]", " ", text)

    text = re.sub(r"[ \t]+", " ", text)

    return text.strip()



def extract_clean_lines(text: str):
    lines = text.split("\n")
    clean_lines = []

    for line in lines:
        line = line.strip()
        if len(line) < 3:
            continue
        if "class" in line or "interface" in line or line.startswith("+"):
            clean_lines.append(line)

    return clean_lines

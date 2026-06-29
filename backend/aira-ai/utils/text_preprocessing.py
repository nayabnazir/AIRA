import re

def clean_text(text: str) -> str:
    """
    Clean SRS / prompt text before AI processing
    """

    # Lowercase
    text = text.lower()

    # Remove special characters except basic punctuation
    text = re.sub(r"[^a-z0-9.,:;()\n ]", " ", text)

    # Remove extra spaces
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def split_sentences(text: str):
    """
    Split text into sentences for ambiguity & classification
    """
    sentences = re.split(r"[.]\s*", text)
    return [s.strip() for s in sentences if len(s.strip()) > 5]

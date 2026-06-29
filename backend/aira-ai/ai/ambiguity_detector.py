AMBIGUOUS_WORDS = [
    "fast", "efficient", "user friendly", "easy",
    "secure", "robust", "better", "improved",
    "quick", "reliable", "scalable", "optimized"
]

def detect_ambiguity(sentences):
    """
    Detect ambiguous sentences based on vague terms
    """
    ambiguous = []

    for sentence in sentences:
        for word in AMBIGUOUS_WORDS:
            if word in sentence:
                ambiguous.append({
                    "sentence": sentence,
                    "ambiguous_word": word
                })
                break

    return ambiguous

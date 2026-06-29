from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

# Very small but valid training dataset (FYP acceptable)
TRAIN_SENTENCES = [
    "the system should be fast",
    "the interface must be user friendly",
    "the system shall allow login",
    "admin can manage users",
    "performance should be good",
    "the response time shall be less than 2 seconds"
]

# 1 = ambiguous, 0 = clear
LABELS = [1, 1, 0, 0, 1, 0]

vectorizer = TfidfVectorizer()
X = vectorizer.fit_transform(TRAIN_SENTENCES)

model = LogisticRegression()
model.fit(X, LABELS)


def predict_ambiguity(sentences):
    """
    Predict ambiguity using ML model
    """
    results = []

    X_test = vectorizer.transform(sentences)
    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)

    for i, sentence in enumerate(sentences):
        results.append({
            "sentence": sentence,
            "ambiguous": bool(predictions[i]),
            "confidence": round(max(probabilities[i]), 2)
        })

    return results

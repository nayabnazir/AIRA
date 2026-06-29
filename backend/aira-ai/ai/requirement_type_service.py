from pathlib import Path

import joblib


MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "requirement_type_pipeline.joblib"


def load_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Requirement type model not found: {MODEL_PATH}")
    return joblib.load(MODEL_PATH)


def split_requirements(text):
    requirements = []
    for line in str(text).replace("\r", "\n").split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = [part.strip() for part in line.split(".") if part.strip()]
        requirements.extend(parts)
    return requirements


def classify_requirement_types(text):
    model = load_model()
    requirements = split_requirements(text)
    if not requirements:
        return []

    predictions = model.predict(requirements)

    results = []
    for index, requirement in enumerate(requirements):
        rule_type = classify_by_rules(requirement)
        results.append(
            {
                "requirement": requirement,
                "type": rule_type or str(predictions[index]),
                "method": "rules+ml" if rule_type else "ml",
            }
        )

    return results


def classify_by_rules(requirement):
    text = requirement.lower()

    non_functional_keywords = [
        "within",
        "seconds",
        "minutes",
        "encrypt",
        "password",
        "secure",
        "security",
        "unauthorized",
        "available",
        "uptime",
        "responsive",
        "browser",
        "performance",
        "scalable",
        "reliable",
        "usable",
        "user-friendly",
        "compatible",
    ]
    functional_keywords = [
        "allow",
        "create",
        "add",
        "update",
        "delete",
        "search",
        "view",
        "upload",
        "download",
        "generate report",
        "generate monthly report",
        "manage",
        "submit",
        "approve",
        "reject",
    ]

    if any(keyword in text for keyword in non_functional_keywords):
        return "Non-Functional"
    if any(keyword in text for keyword in functional_keywords):
        return "Functional"

    return None

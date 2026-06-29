from ai.requirement_type_service import classify_requirement_types
from ai.srs_ambiguity_service import analyze_srs_ambiguity, split_requirements


REQUIRED_SRS_SECTIONS = [
    "introduction",
    "purpose",
    "scope",
    "overall description",
    "functional requirements",
    "non-functional requirements",
    "security requirements",
    "performance requirements",
    "data requirements",
    "acceptance criteria",
]


MEASURABLE_WORDS = [
    "within",
    "seconds",
    "minutes",
    "percent",
    "%",
    "at least",
    "no more than",
    "minimum",
    "maximum",
    "shall",
]


def analyze_srs_quality(text):
    requirements = split_requirements(text)
    ambiguity = analyze_srs_ambiguity(text)
    types = classify_requirement_types(text)
    completeness = analyze_completeness(text, requirements, types)
    correctness = analyze_correctness(requirements)

    ambiguous_count = sum(1 for item in ambiguity if item["ambiguous"])
    correctness_issues = len(correctness["issues"])
    missing_sections = len(completeness["missing_sections"])

    total = max(len(requirements), 1)
    ambiguity_score = round(100 - (ambiguous_count / total) * 100, 2)
    correctness_score = round(max(0, 100 - correctness_issues * 8), 2)
    completeness_score = round(max(0, 100 - missing_sections * 8), 2)

    return {
        "summary": {
            "total_requirements": len(requirements),
            "ambiguous_requirements": ambiguous_count,
            "functional_requirements": sum(1 for item in types if item["type"] == "Functional"),
            "non_functional_requirements": sum(1 for item in types if item["type"] == "Non-Functional"),
            "ambiguity_score": ambiguity_score,
            "correctness_score": correctness_score,
            "completeness_score": completeness_score,
        },
        "ambiguity": ambiguity,
        "requirement_types": types,
        "correctness": correctness,
        "completeness": completeness,
        "recommendations": build_recommendations(ambiguity, correctness, completeness),
    }


def analyze_completeness(text, requirements, types):
    lowered = text.lower()
    missing_sections = [section for section in REQUIRED_SRS_SECTIONS if section not in lowered]
    has_functional = any(item["type"] == "Functional" for item in types)
    has_non_functional = any(item["type"] == "Non-Functional" for item in types)

    issues = []
    if missing_sections:
        issues.append("Some standard SRS sections are missing.")
    if not has_functional:
        issues.append("No functional requirements were detected.")
    if not has_non_functional:
        issues.append("No non-functional requirements were detected.")
    if len(requirements) < 5:
        issues.append("The SRS contains too few requirement statements.")

    return {
        "missing_sections": missing_sections,
        "has_functional_requirements": has_functional,
        "has_non_functional_requirements": has_non_functional,
        "issues": issues,
    }


def analyze_correctness(requirements):
    issues = []

    for requirement in requirements:
        lowered = requirement.lower()
        if not any(word in lowered for word in ["shall", "must", "will"]):
            issues.append({
                "requirement": requirement,
                "issue": "Requirement should use a clear mandatory term such as shall or must.",
            })
        if len(requirement.split()) < 5:
            issues.append({
                "requirement": requirement,
                "issue": "Requirement is too short to be specific.",
            })
        if any(word in lowered for word in ["fast", "easy", "good", "better", "user friendly"]):
            issues.append({
                "requirement": requirement,
                "issue": "Requirement contains vague wording and should be measurable.",
            })
        if "within" in lowered and not any(char.isdigit() for char in requirement):
            issues.append({
                "requirement": requirement,
                "issue": "Requirement mentions a limit but does not provide a measurable value.",
            })

    return {
        "issues": issues,
        "issue_count": len(issues),
    }


def build_recommendations(ambiguity, correctness, completeness):
    recommendations = []

    if any(item["ambiguous"] for item in ambiguity):
        recommendations.append("Replace vague words with measurable values, such as exact time, limit, quantity, or condition.")
    if correctness["issues"]:
        recommendations.append("Rewrite weak requirements using clear mandatory wording such as 'The system shall...'.")
    if completeness["missing_sections"]:
        recommendations.append("Add missing SRS sections before final submission.")
    if not recommendations:
        recommendations.append("The SRS is generally clear, but it should still be reviewed by stakeholders.")

    return recommendations

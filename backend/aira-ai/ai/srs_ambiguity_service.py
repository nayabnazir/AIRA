from pathlib import Path
import re

import joblib


MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "srs_ambiguity_pipeline.joblib"

VAGUE_TERMS = [
    "fast",
    "quick",
    "quickly",
    "easy",
    "user friendly",
    "secure",
    "reliable",
    "robust",
    "scalable",
    "efficient",
    "optimized",
    "better",
    "modern",
    "simple",
    "good",
    "high quality",
    "many users",
    "reasonable time",
    "as soon as possible",
    "most of the time",
    "approximately",
    "adequate",
    "appropriate",
    "normal",
    "minimal",
    "maximum",
    "etc",
    "and so on",
    "if necessary",
    "when possible",
    "as needed",
    "periodically",
    "regular intervals",
    "over time",
    "minimal clicks",
    "modern",
    "high-performance",
    "real-time",
    "live updates",
    "relevant",
    "timely",
    "responsive",
    "accessible",
    "stable",
]

AMBIGUITY_PATTERNS = [
    ("Vague pronoun", r"^(it|they|these|those)\b", "Name the exact system component, actor, data item, or requirement being referenced."),
    ("Undefined quantity", r"\b(some|several|few|many|multiple|various|enough|large|small)\b", "Replace the undefined quantity with an exact number, range, or measurable threshold."),
    ("Optional behavior", r"\b(may|might|could|where appropriate|if possible)\b", "State whether the behavior is mandatory and define the exact condition that triggers it."),
    ("Unbounded timing", r"\b(immediately|timely|promptly|without delay|soon)\b", "Define a measurable response-time limit and the conditions under which it applies."),
    ("Unclear frequency", r"\b(regularly|periodically|frequently|occasionally|rarely)\b", "Specify an exact frequency or scheduling rule."),
    ("Subjective quality", r"\b(intuitive|convenient|flexible|seamless|satisfactory|acceptable)\b", "Replace the subjective quality with measurable usability or acceptance criteria."),
]


def load_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"SRS ambiguity model not found: {MODEL_PATH}")
    return joblib.load(MODEL_PATH)


def split_requirements(text):
    sentences = []
    cleaned_text = focus_requirement_text(text)
    cleaned_text = strip_section_headings(cleaned_text)
    cleaned_text = re.sub(r"\n(?=[a-z])", " ", cleaned_text)
    candidates = re.split(r"(?<=[.!?])\s+|\n+", str(cleaned_text).replace("\r", "\n"))
    for candidate in candidates:
        line = normalize_requirement(candidate)
        if not line or should_skip_line(line):
            continue
        if is_requirement_like(line) and line not in sentences:
            sentences.append(line)
    return sentences


def focus_requirement_text(text):
    value = str(text or "")
    lowered = value.lower()
    specific_matches = list(re.finditer(r"\b3\s*\.?\s*specific requirements\b", lowered))
    appendix_matches = list(re.finditer(r"\b6\s*\.?\s*appendix\b", lowered))
    if specific_matches:
        specific_start = specific_matches[-1]
        appendix_start = next(
            (match for match in appendix_matches if match.start() > specific_start.start()),
            None,
        )
        end = appendix_start.start() if appendix_start else len(value)
        return value[specific_start.start():end]

    ranges = [
        ("4. functional requirements", "5. non-functional requirements"),
        ("5. non-functional requirements", "6. external interface requirements"),
        ("6. external interface requirements", "7. data requirements"),
        ("7. data requirements", "8. security requirements"),
        ("8. security requirements", "9. performance requirements"),
        ("9. performance requirements", "10. reliability"),
        ("11. acceptance criteria", "12. out of scope"),
    ]
    chunks = []
    for start_label, end_label in ranges:
        start = lowered.rfind(start_label)
        if start < 0:
            continue
        end = lowered.find(end_label, start + len(start_label))
        chunks.append(value[start:end if end > start else len(value)])
    return "\n".join(chunks) if chunks else value


def strip_section_headings(value):
    text = str(value or "")
    text = re.sub(
        r"\b\d+(?:\.\d+){0,3}\s+(?:Specific Requirements|Functional Requirements|Non-Functional Requirements|"
        r"Performance Requirements|Security Requirements|Usability Requirements|Hardware and Software Requirements|"
        r"Hardware Requirements|Software Requirements|Other Requirements|Interface Requirements|Operational Requirements|"
        r"User Authentication|News Aggregation|User Preferences|Personalized Feed|Filtering and Sorting)\b",
        ". ",
        text,
        flags=re.I,
    )
    return text


def normalize_requirement(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip(" .:-")
    text = re.sub(r"\s+-\s+", "-", text)
    return text


def should_skip_line(line):
    return bool(re.match(
        r"^(software requirements specification|for|project members?|table of contents|tested by table|page\s+\d+|tester name|role|test date|signature|laiba arshad|alishba rustam|nayab nazir)$",
        line,
        flags=re.I,
    ))


def is_requirement_like(text):
    value = str(text or "").strip()
    if len(value) < 12:
        return False
    if re.match(r"^\d+(?:\.\d+)*\s+[A-Za-z ]+$", value):
        return False
    return bool(re.search(r"\b(shall|should|must|may|might|could)\b", value, flags=re.I))


def analyze_srs_ambiguity(text):
    model = load_model()
    requirements = split_requirements(text)
    explicit_requirements = set(requirements)
    requirements.extend(
        statement for statement in split_quality_statements(text)
        if statement not in explicit_requirements
    )
    if not requirements:
        return []

    predictions = model.predict(requirements)
    scores = None
    if hasattr(model, "decision_function"):
        scores = model.decision_function(requirements)

    results = []
    for index, requirement in enumerate(requirements):
        matched_terms = find_vague_terms(requirement)
        findings = find_ambiguity_findings(requirement, matched_terms)
        is_ambiguous = bool(predictions[index]) or bool(findings)
        result = {
            "requirement": requirement,
            "source": "Specific Requirement" if requirement in explicit_requirements else "Capability / Scope Statement",
            "ambiguous": is_ambiguous,
            "detected_terms": matched_terms,
            "findings": findings,
            "method": "rules+ml" if findings else "ml",
        }
        if scores is not None:
            result["score"] = float(scores[index])
        results.append(result)

    return results


def split_quality_statements(text):
    value = focus_capability_text(remove_table_of_contents(str(text or "")))
    value = re.sub(r"\n(?=[a-z])", " ", value)
    candidates = re.split(r"(?<=[.!?])\s+|\n+", value.replace("\r", "\n"))
    statements = []
    for candidate in candidates:
        statement = normalize_requirement(candidate)
        if len(statement) < 20 or should_skip_line(statement) or is_requirement_like(statement):
            continue
        terms = find_vague_terms(statement)
        findings = find_ambiguity_findings(statement, terms)
        substantive_findings = [
            finding for finding in findings
            if finding.get("type") not in {"Vague pronoun", "Compound requirement"}
        ]
        if substantive_findings and re.search(
            r"\b(system|platform|application|service|feature|function|user|interface|feed|data|news|"
            r"update|source|recommend|provide|deliver|collect|display|support|enable|allow)\b",
            statement,
            flags=re.I,
        ):
            statements.append(statement)
    return statements


def focus_capability_text(value):
    text = str(value or "")
    specific_matches = list(re.finditer(r"\b3\s*\.?\s*specific requirements\b", text, flags=re.I))
    if specific_matches:
        return text[:specific_matches[-1].start()]
    return text


def remove_table_of_contents(value):
    text = str(value or "")
    starts = list(re.finditer(r"\btable of contents\b", text, flags=re.I))
    introductions = list(re.finditer(r"\b1\s*\.?\s*introduction\b", text, flags=re.I))
    if starts and len(introductions) > 1:
        return text[:starts[0].start()] + "\n" + text[introductions[-1].start():]
    return text


def find_vague_terms(requirement):
    lowered = requirement.lower()
    matches = [
        term for term in sorted(VAGUE_TERMS, key=len, reverse=True)
        if re.search(rf"\b{re.escape(term)}\b", lowered)
    ]
    return [
        term for term in matches
        if not any(term != longer and term in longer for longer in matches)
    ]


def find_ambiguity_findings(requirement, matched_terms):
    findings = []
    if matched_terms:
        findings.append({
            "type": "Vague wording",
            "terms": matched_terms,
            "explanation": f"The wording {', '.join(matched_terms)} is not objectively measurable.",
            "recommendation": "Replace vague wording with explicit limits, conditions, and acceptance criteria.",
        })

    for issue_type, pattern, recommendation in AMBIGUITY_PATTERNS:
        matches = sorted(set(match.lower() for match in re.findall(pattern, requirement, flags=re.I)))
        if matches:
            findings.append({
                "type": issue_type,
                "terms": matches,
                "explanation": f"The wording {', '.join(matches)} can be interpreted in more than one way.",
                "recommendation": recommendation,
            })

    if len(re.findall(r"\b(and|or)\b", requirement, flags=re.I)) >= 2:
        findings.append({
            "type": "Compound requirement",
            "terms": ["and/or"],
            "explanation": "The statement combines several independently testable behaviors.",
            "recommendation": "Split the statement into separate atomic requirements with one testable outcome each.",
        })
    return findings

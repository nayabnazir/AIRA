import base64
import json
import re
import sys
import tempfile
from pathlib import Path

from ai.srs_ambiguity_service import analyze_srs_ambiguity
from ai.uml_image_description_service import describe_confirmed_uml_structure, describe_uml_image, describe_uml_project
from ai.uml_image_generation_service import generate_uml_image


IMAGE_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
}


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        action = str(payload.get("action") or "").strip()

        if action == "check_ambiguity":
            text = require_text(payload.get("text"), "SRS text is required for ambiguity checking.")
            result = analyze_srs_ambiguity(text)
            print_success({
                "results": result,
                "summary": summarize_ambiguity(result),
                "professional_report": build_srs_professional_report(result, text),
            })
            return 0

        if action == "generate_uml":
            diagram_reference = payload.get("diagramReference") if isinstance(payload.get("diagramReference"), dict) else {}
            image_data = str(diagram_reference.get("imageData") or "")
            project_json = str(diagram_reference.get("projectJson") or "").strip()
            text = str(payload.get("text") or "").strip()
            if project_json:
                text = (text + "\n\nAttached editable AIRA UML project JSON:\n" + project_json[:30000]).strip()
            if not text and not image_data:
                raise ValueError("System description, SRS text, or a UML diagram image is required for UML generation.")
            diagram_type = normalize_diagram_type(payload.get("diagramType") or payload.get("diagram_type") or "auto")

            # The cloud provider builds its own strict modeling prompt. Keep the
            # original source clean so the local fallback never turns prompt
            # instructions into diagram elements.
            image_path = None
            if image_data:
                mime_type = str(diagram_reference.get("mimeType") or infer_mime_type(image_data) or "image/png")
                suffix = IMAGE_EXTENSIONS.get(mime_type.lower(), ".png")
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
                    temp.write(decode_data_url(image_data))
                    image_path = Path(temp.name)
            try:
                result = generate_uml_image(text, diagram_type, image_path=image_path)
            finally:
                if image_path:
                    image_path.unlink(missing_ok=True)
            result = sanitize_uml_result(result, diagram_type)
            print_success(result)
            return 0

        if action == "describe_uml_image":
            result = describe_uploaded_uml_image(payload)
            print_success(result)
            return 0

        raise ValueError("Unsupported AI action.")
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=True))
        return 1


def require_text(value, message):
    text = str(value or "").strip()
    if not text:
        raise ValueError(message)
    return text[:60000]

def normalize_diagram_type(value):
    diagram_type = str(value or "auto").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "usecase": "use_case",
        "use_case_diagram": "use_case",
        "class_diagram": "class",
        "sequence_diagram": "sequence",
        "erd_diagram": "erd",
        "entity_relationship": "erd",
        "activity_diagram": "activity",
    }
    diagram_type = aliases.get(diagram_type, diagram_type)
    return diagram_type if diagram_type in {"auto", "use_case", "class", "sequence", "erd", "activity"} else "auto"


def build_uml_generation_input(text, diagram_type):
    source_text = str(text or "").strip()
    functional_requirements = extract_functional_requirements(source_text)
    user_roles = extract_user_roles(source_text)

    common_rules = """
You are a senior UML analyst.
Generate a UML diagram from the SRS below.
Use ONLY information that is supported by the SRS.
Ignore document structure such as headings, page labels, table headers, table column names, references, appendices, hardware/software requirements, and formatting text.
Never create UML elements from these words when they are only headings/labels: Function, Summary, Description, Requirement, Requirements, Purpose, Scope, References, Overall Description, Hardware, Software, Appendix.
Return only valid PlantUML code and the diagram metadata expected by the application.
""".strip()

    if diagram_type == "use_case":
        diagram_rules = """
USE CASE DIAGRAM RULES:
1. Actors must be real external roles from the SRS, for example Member, Librarian, Administrator, Customer, Student, Staff, Admin.
2. Use cases must be verb-based system actions, for example Search Catalog, Manage Members, Issue Book, Return Book.
3. Use cases must come mainly from Functional Requirements / FR statements, not from table headings or section titles.
4. Do NOT create use cases named Function, Summary, Description, Requirement, Scope, Purpose, Product Functions, User Characteristics, Hardware Requirements, Software Requirements, or Appendix.
5. Connect each actor only to actions that actor can perform according to the SRS.
6. Keep the diagram clean: 3 to 5 actors and 6 to 18 use cases are usually enough.
7. Use a system boundary rectangle with a clear project/system name.
8. Do not draw repeated <<include>> arrows from every use case to Login or Authenticate User. If authentication is needed, show it as one normal use case associated with the relevant actors, or use at most two include relationships.
9. Prefer left-to-right layout with short, direct actor-to-use-case associations. Avoid curved crossing connectors.
""".strip()
    elif diagram_type == "class":
        diagram_rules = """
CLASS DIAGRAM RULES:
Create domain classes only from real entities, records, objects, and data concepts in the SRS.
Do not create classes from headings or table column names.
Include useful attributes and relationships where supported by the SRS.
""".strip()
    elif diagram_type == "sequence":
        diagram_rules = """
SEQUENCE DIAGRAM RULES:
Choose the main user flow from the SRS and show lifelines, messages, validations, and system responses.
Do not use headings or table labels as participants.
""".strip()
    elif diagram_type == "erd":
        diagram_rules = """
ERD RULES:
Create entities only from persistent data concepts in the SRS.
Do not create entities from headings or table column names.
Show keys and relationships where supported by the SRS.
""".strip()
    elif diagram_type == "activity":
        diagram_rules = """
ACTIVITY DIAGRAM RULES:
Create a workflow from a real business process described in the SRS.
Use decisions, actions, and end states.
Do not use headings or table labels as activities.
""".strip()
    else:
        diagram_rules = """
AUTO DIAGRAM RULES:
First infer the most suitable UML type from the user's selected intent and SRS.
Do not use headings or table labels as UML elements.
""".strip()

    extracted_part = ""
    if user_roles:
        extracted_part += "\n\nDetected user roles from SRS:\n" + "\n".join(f"- {role}" for role in user_roles)
    if functional_requirements:
        extracted_part += "\n\nFunctional requirements to prioritize:\n" + "\n".join(f"- {req}" for req in functional_requirements[:30])

    return f"{common_rules}\n\n{diagram_rules}{extracted_part}\n\nSRS TEXT:\n{source_text}"


def extract_functional_requirements(text):
    source = str(text or "")
    # Prefer explicit FR-01 style requirements.
    fr_matches = re.findall(r"\bFR[- ]?\d+\s*:\s*([^\n\r]+(?:\n(?!\s*(?:FR[- ]?\d+|\d+\.\d+|[A-Z][A-Za-z ]{2,}:))[^\n\r]+)*)", source, flags=re.I)
    cleaned = [clean_requirement(item) for item in fr_matches]
    cleaned = [item for item in cleaned if item]
    if cleaned:
        return cleaned

    # Fallback: use text inside a Functional Requirements section.
    section_match = re.search(
        r"(?:functional requirements|specific requirements)(.*?)(?:non[- ]functional requirements|hardware requirements|software requirements|other requirements|appendix|$)",
        source,
        flags=re.I | re.S,
    )
    section = section_match.group(1) if section_match else source
    candidates = re.findall(r"(?:^|\n)\s*(?:[-•*]|\d+[.)])\s*(.+)", section)
    cleaned = [clean_requirement(item) for item in candidates]
    return [item for item in cleaned if is_requirement_like(item)][:30]


def extract_user_roles(text):
    source = str(text or "")
    known_roles = [
        "Administrator", "Admin", "Librarian", "Member", "Student", "Faculty", "Patron",
        "Customer", "User", "Staff", "Manager", "Teacher", "Patient", "Doctor",
        "Receptionist", "Seller", "Buyer", "Employee",
    ]
    found = []
    for role in known_roles:
        if re.search(rf"\b{re.escape(role)}\b", source, flags=re.I):
            canonical = "Administrator" if role.lower() == "admin" else role
            if canonical not in found:
                found.append(canonical)
    # Avoid using generic User alone when specific roles are present.
    if len(found) > 1 and "User" in found:
        found.remove("User")
    return found[:6]


def clean_requirement(value):
    value = re.sub(r"\s+", " ", str(value or "")).strip(" -•*\t\r\n")
    return value.rstrip(" .")


def is_requirement_like(value):
    value = str(value or "")
    if not value or len(value.split()) < 4:
        return False
    if re.fullmatch(r"(?i)(function|summary|description|requirement|requirements|purpose|scope|references|appendix)", value.strip()):
        return False
    return bool(re.search(r"\b(shall|must|should|can|able to|allow|support|manage|create|update|delete|view|search|generate|send|calculate|record|configure|track)\b", value, flags=re.I))


def sanitize_uml_result(result, diagram_type):
    if not isinstance(result, dict):
        return result
    if diagram_type != "use_case":
        return result

    diagram = result.get("diagram")
    if not isinstance(diagram, dict):
        return result

    plantuml = str(diagram.get("plantuml") or "")
    if plantuml:
        diagram["plantuml"] = sanitize_use_case_plantuml(plantuml)
    return result


def sanitize_use_case_plantuml(plantuml):
    forbidden_exact = {
        "function", "summary", "description", "requirement", "requirements",
        "purpose", "scope", "references", "overall description", "product functions",
        "user characteristics", "hardware requirements", "software requirements", "appendix",
    }
    cleaned_lines = []
    include_lines_seen = 0
    for line in str(plantuml or "").splitlines():
        lower = line.lower()
        if "handwritten" in lower:
            continue
        labels = re.findall(r"\(([^()]+)\)|usecase\s+\"([^\"]+)\"|actor\s+\"([^\"]+)\"", line, flags=re.I)
        flat_labels = [part.strip().lower() for tup in labels for part in tup if part]
        if any(label in forbidden_exact for label in flat_labels):
            continue
        # Also remove associations to forbidden generated nodes.
        if any(re.search(rf"\b{re.escape(label)}\b", lower) for label in forbidden_exact):
            if "--" in line or "-->" in line or "..>" in line:
                continue
        # Repeated include arrows to authentication/login make use-case diagrams
        # unreadable and are better described in text than drawn everywhere.
        if "include" in lower and re.search(r"\b(authenticate|authentication|login|log in)\b", lower):
            continue
        if "include" in lower:
            include_lines_seen += 1
            if include_lines_seen > 3:
                continue
        cleaned_lines.append(line)

    source = "\n".join(cleaned_lines)
    if "@startuml" in source and "left to right direction" not in source.lower():
        source = source.replace("@startuml", "@startuml\nleft to right direction", 1)
    if "@startuml" in source and "skinparam linetype" not in source.lower():
        source = source.replace("@startuml", "@startuml\nskinparam linetype ortho", 1)
    return source



def summarize_ambiguity(results):
    total = len(results)
    ambiguous = sum(1 for item in results if item.get("ambiguous"))
    return {
        "total": total,
        "ambiguous": ambiguous,
        "clear": max(total - ambiguous, 0),
    }


def build_srs_professional_report(results, document_text=""):
    summary = summarize_ambiguity(results)
    issue_rows = []
    for item in results:
        if not item.get("ambiguous"):
            continue
        terms = item.get("detected_terms") or []
        findings = item.get("findings") or []
        issue = " ".join(
            f"{finding.get('type')}: {finding.get('explanation')}"
            for finding in findings
            if finding
        )
        issue_rows.append({
            "Severity": ambiguity_severity(item),
            "Source": str(item.get("source") or "Requirement"),
            "Requirement": str(item.get("requirement") or ""),
            "Issue": issue or "The requirement may not be sufficiently measurable or testable.",
            "Recommended Correction": build_requirement_correction(item),
        })

    if not issue_rows:
        issue_rows.append({
            "Severity": "Low",
            "Source": "All reviewed statements",
            "Requirement": "All detected requirements",
            "Issue": "No ambiguous requirement was detected automatically.",
            "Recommended Correction": "Continue with stakeholder review and acceptance-test validation.",
        })

    quality_metrics = calculate_srs_quality_metrics(document_text, results)
    quality = quality_metrics["clarity"]
    clear_verb = "was" if summary["clear"] == 1 else "were"
    ambiguous_verb = "requires" if summary["ambiguous"] == 1 else "require"
    capability_rows = identify_srs_capabilities(document_text, results)
    strength_rows = identify_srs_strengths(document_text)
    explicit_count = sum(1 for item in results if item.get("source") == "Specific Requirement")
    scope_count = len(results) - explicit_count
    tables = [
        {
            "title": "Analysis Summary",
            "columns": ["Metric", "Result"],
            "rows": [
                {"Metric": "Statements Reviewed", "Result": str(summary["total"])},
                {"Metric": "Specific Requirements Reviewed", "Result": str(explicit_count)},
                {"Metric": "Capability / Scope Statements Reviewed", "Result": str(scope_count)},
                {"Metric": "Clear Statements", "Result": str(summary["clear"])},
                {"Metric": "Ambiguous Statements", "Result": str(summary["ambiguous"])},
                {"Metric": "Clarity Score", "Result": f"{quality}%"},
                {"Metric": "Completeness Score", "Result": f"{quality_metrics['completeness']}%"},
                {"Metric": "Consistency Score", "Result": f"{quality_metrics['consistency']}%"},
                {"Metric": "Testability Score", "Result": f"{quality_metrics['testability']}%"},
            ],
        },
        {
            "title": "Quality Metric Explanation",
            "columns": ["Metric", "Calculation / Justification"],
            "rows": quality_metrics["explanations"],
        },
        {
            "title": "Recognized System Capabilities",
            "columns": ["Capability", "Evidence from SRS", "Related Quality Issue", "Assessment"],
            "rows": capability_rows,
        },
        {
            "title": "Positive Aspects and Strengths",
            "columns": ["Strength", "Why It Is Valuable"],
            "rows": strength_rows,
        },
        {
            "title": "Problems Detected and Recommendations",
            "columns": ["Severity", "Source", "Requirement", "Issue", "Recommended Correction"],
            "rows": issue_rows,
        },
    ]
    should_count = sum(
        1 for item in results
        if re.search(r"\bshould\b", str(item.get("requirement") or ""), flags=re.I)
    )
    if should_count:
        tables.append({
            "title": "Document-Level Quality Notes",
            "columns": ["Observation", "Impact", "Recommendation"],
            "rows": [{
                "Observation": f"{should_count} requirement(s) use 'should'.",
                "Impact": "The statements may be read as recommendations instead of mandatory contractual requirements.",
                "Recommendation": "Use 'shall' or 'must' for mandatory requirements and retain 'should' only for intentionally optional goals.",
            }],
        })

    return {
        "title": "Professional SRS Quality Analysis",
        "summary": (
            f"The analysis reviewed {summary['total']} requirement and capability/scope statement(s). "
            f"{summary['clear']} {clear_verb} classified as clear and "
            f"{summary['ambiguous']} {ambiguous_verb} clarification."
        ),
        "tables": tables,
        "overall_assessment": (
            f"The SRS defines {len(capability_rows)} recognized capability area(s) and contains useful functional and "
            "non-functional coverage. Capability statements and specific requirements were assessed together so that "
            "scope-level ambiguity is reflected in the clarity and testability results. Identified ambiguities and "
            "incomplete quality criteria should be corrected before the document becomes the final implementation and "
            "acceptance-test baseline."
            if summary["ambiguous"]
            else "The detected requirements are generally clear. A final stakeholder and acceptance-test review is still recommended."
        ),
    }


def ambiguity_severity(item):
    requirement = str(item.get("requirement") or "").lower()
    findings = item.get("findings") or []
    if re.search(r"\b(password|security|secure|encrypt|authentication|authorization|privacy|gdpr|personal data)\b", requirement):
        return "High"
    if len(findings) > 1:
        return "High"
    return "Medium" if findings or item.get("detected_terms") else "Low"


def calculate_srs_quality_metrics(document_text, results):
    text = str(document_text or "")
    total = max(len(results), 1)
    clear = sum(1 for item in results if not item.get("ambiguous"))
    clarity = round(clear / total * 100)

    expected_sections = [
        "purpose", "scope", "overall description", "functional requirements",
        "non-functional requirements", "security", "performance", "interface",
    ]
    present_sections = [section for section in expected_sections if section in text.lower()]
    completeness = round(len(present_sections) / len(expected_sections) * 100)

    contradictions = detect_requirement_contradictions(results)
    consistency = max(0, 100 - len(contradictions) * 20)

    testable = sum(1 for item in results if is_testable_statement(item))
    testability = round(testable / total * 100)
    return {
        "clarity": clarity,
        "completeness": completeness,
        "consistency": consistency,
        "testability": testability,
        "explanations": [
            {
                "Metric": "Clarity",
                "Calculation / Justification": (
                    f"{clear} of {len(results)} reviewed specific requirements and capability/scope statements "
                    "contained no detected ambiguity."
                ),
            },
            {
                "Metric": "Completeness",
                "Calculation / Justification": (
                    f"{len(present_sections)} of {len(expected_sections)} expected SRS quality areas were found: "
                    f"{', '.join(present_sections) or 'none'}."
                ),
            },
            {
                "Metric": "Consistency",
                "Calculation / Justification": (
                    f"{len(contradictions)} potential contradictory requirement pair(s) were detected."
                ),
            },
            {
                "Metric": "Testability",
                "Calculation / Justification": (
                    f"{testable} of {len(results)} reviewed statements are sufficiently specific or measurable "
                    "for direct acceptance-test design."
                ),
            },
        ],
    }


def is_testable_statement(item):
    requirement = str(item.get("requirement") or "")
    if item.get("ambiguous"):
        return False
    return bool(
        re.search(r"\b(shall|must|should)\b", requirement, flags=re.I)
        and re.search(r"\b(system|platform|user|administrator|interface|feed|password|data)\b", requirement, flags=re.I)
    )


def detect_requirement_contradictions(results):
    positives = []
    negatives = []
    for item in results:
        requirement = str(item.get("requirement") or "").lower()
        normalized = re.sub(r"\b(shall|must|should|not|never|no)\b|[^a-z0-9 ]", " ", requirement)
        keywords = set(word for word in normalized.split() if len(word) > 4)
        if re.search(r"\b(shall not|must not|should not|never)\b", requirement):
            negatives.append((requirement, keywords))
        else:
            positives.append((requirement, keywords))
    return [
        (positive, negative)
        for positive, positive_words in positives
        for negative, negative_words in negatives
        if len(positive_words & negative_words) >= 4
    ]


def identify_srs_capabilities(document_text, results=None):
    text = re.sub(r"\s+", " ", str(document_text or ""))
    definitions = [
        (
            "Personalized and Relevant News Feed",
            r"(?:customized|personalized).{0,100}(?:feed|news)|relevant and timely news",
            {"relevant", "timely", "over time"},
            "The platform tailors news using user interests, preferences, and reading behavior.",
            "Core value proposition is clearly recognized; define measurable relevance and timeliness targets.",
        ),
        (
            "Real-Time News Updates",
            r"real[- ]time updates|live updates|breaking news",
            {"real-time", "live updates", "periodically", "regular intervals", "timely"},
            "The SRS includes live or real-time updates for breaking news.",
            "Important capability is present; specify latency, polling/push mechanism, and failure behavior.",
        ),
        (
            "Aggregation from Various Online Sources",
            r"various online sources|multiple sources|multiple news sources|various sources",
            {"various", "multiple"},
            "The system collects news articles from multiple or various online sources through APIs.",
            "Aggregation scope is recognized; identify approved sources or a minimum source count.",
        ),
        (
            "Machine-Learning Recommendations",
            r"machine learning|recommendation engine|recommend articles",
            {"over time", "relevant"},
            "Machine-learning algorithms recommend articles from preferences and reading history.",
            "Strong personalization capability; define evaluation metrics and retraining rules.",
        ),
        (
            "Filtering and Sorting",
            r"filter articles|filtering and sorting|sort articles",
            set(),
            "Users can filter and sort articles by category, source, relevance, or date.",
            "Useful content-discovery controls are clearly specified.",
        ),
        (
            "User Authentication and Recovery",
            r"user authentication|register and log in|password recovery",
            {"secure", "password", "authentication"},
            "The SRS includes account registration, login, and password recovery.",
            "Essential account-management coverage is present.",
        ),
    ]
    rows = []
    for capability, pattern, related_terms, evidence, assessment in definitions:
        if re.search(pattern, text, flags=re.I):
            related = [
                item for item in list(results or [])
                if item.get("ambiguous")
                and (
                    re.search(pattern, str(item.get("requirement") or ""), flags=re.I)
                    or related_terms.intersection(get_item_issue_terms(item))
                )
                and (not related_terms or related_terms.intersection(get_item_issue_terms(item)))
            ]
            related_issue = "; ".join(
                f"{ambiguity_severity(item)}: {', '.join(sorted(get_item_issue_terms(item)))}"
                for item in related[:3]
            )
            rows.append({
                "Capability": capability,
                "Evidence from SRS": evidence,
                "Related Quality Issue": related_issue or "No directly linked ambiguity detected.",
                "Assessment": (
                    f"{assessment} This capability is linked to {len(related)} ambiguity finding(s)."
                    if related else assessment
                ),
            })
    if rows:
        return rows

    generated_rows = []
    for item in list(results or [])[:8]:
        requirement = str(item.get("requirement") or "").strip()
        if not requirement:
            continue
        label = re.sub(
            r"^(?:the system|the platform|users?|administrators?)\s+(?:shall|must|should|may)\s+(?:be able to\s+)?",
            "",
            requirement,
            flags=re.I,
        ).strip()
        label = " ".join(label.split()[:8]).rstrip(".,").capitalize()
        generated_rows.append({
            "Capability": label or "Document-specific capability",
            "Evidence from SRS": requirement,
            "Related Quality Issue": (
                f"{ambiguity_severity(item)}: {', '.join(item.get('detected_terms') or ['clarification required'])}"
                if item.get("ambiguous") else "No directly linked ambiguity detected."
            ),
            "Assessment": (
                "Capability is recognized but requires clarification before implementation."
                if item.get("ambiguous")
                else "Capability is stated clearly enough for the next review stage."
            ),
        })
    return generated_rows or [{
        "Capability": "No major capability automatically recognized",
        "Evidence from SRS": "The document requires a manual feature review.",
        "Related Quality Issue": "Capability coverage could not be traced automatically.",
        "Assessment": "Clarify the product scope and explicitly list primary system capabilities.",
    }]


def identify_srs_strengths(document_text):
    text = re.sub(r"\s+", " ", str(document_text or ""))
    definitions = [
        ("Clear product purpose and scope", r"\bpurpose\b.*?\bscope\b", "The document explains the platform objective, target users, and major features."),
        ("Measurable performance targets", r"within 3 seconds|every 5 minutes", "The SRS includes concrete response-time and feed-update examples that support testing."),
        ("Security awareness", r"encrypted|hashing algorithm|gdpr|data privacy", "The document recognizes encryption, password protection, privacy, and GDPR concerns."),
        ("External API and dependency awareness", r"news api|third-party news api|external news api", "External news providers and their availability are acknowledged as system dependencies."),
        ("Responsive and accessible interface goal", r"responsive web design|desktop and mobile", "The interface is intended to support both desktop and mobile users."),
        ("Operational continuity", r"daily backup|backup of user data", "Daily backup requirements support recovery and operational reliability."),
    ]
    rows = [
        {"Strength": strength, "Why It Is Valuable": value}
        for strength, pattern, value in definitions
        if re.search(pattern, text, flags=re.I | re.S)
    ]
    return rows or [{
        "Strength": "Structured SRS organization",
        "Why It Is Valuable": "The document separates functional and non-functional requirements for easier review.",
    }]


def get_item_issue_terms(item):
    terms = set(item.get("detected_terms") or [])
    for finding in item.get("findings") or []:
        terms.update(finding.get("terms") or [])
    return terms


def build_requirement_correction(item):
    requirement = str(item.get("requirement") or "")
    terms = item.get("detected_terms") or []
    lowered = requirement.lower()
    if re.search(r"\bnews sources are accessible\b", lowered, flags=re.I):
        return "Specify source authentication, licensing, availability targets, and behavior when an external news API cannot be reached."
    if re.search(r"\badjust their preferences over time\b", lowered, flags=re.I):
        return "State that users may update preferences at any time and define when the updated preferences take effect."
    targeted = [
        (r"\brelevant and timely news\b", "Define relevance using an agreed recommendation metric and define the maximum permitted delay between source publication and feed availability."),
        (r"\breal[- ]time\b|\blive updates\b", "Define the maximum update latency, the update mechanism such as polling or push notifications, and behavior when a source is unavailable."),
        (r"\bvarious online sources\b|\bvarious sources\b", "Identify approved news sources or specify the minimum source count, source-selection rules, and unavailable-source behavior."),
        (r"\bmultiple news sources\b", "Name the required news APIs or specify a minimum number of approved sources and failure behavior when a source is unavailable."),
        (r"\bperiodically\b|\bregular intervals\b", "Specify one mandatory update interval, such as every 5 minutes, plus retry and stale-feed behavior."),
        (r"\bover time\b", "Define the evaluation period, measurable recommendation-quality metric, minimum improvement target, and retraining schedule."),
        (r"\bsecure hashing algorithm\b", "Specify an approved password-hashing algorithm such as Argon2id or bcrypt, including work-factor and salt requirements."),
        (r"\bintuitive\b", "Define measurable usability criteria, such as task-completion rate, maximum error rate, and usability-test acceptance threshold."),
        (r"\bminimal clicks\b", "Specify the maximum permitted number of clicks for each named navigation task."),
        (r"\bresponsive\b|\baccessible\b", "Specify supported viewport sizes and an accessibility standard such as WCAG 2.1 AA."),
        (r"\bstable internet connection\b", "Define the network conditions under which the 3-second performance target must be met."),
    ]
    targeted_recommendations = [
        correction for pattern, correction in targeted if re.search(pattern, lowered, flags=re.I)
    ]
    if targeted_recommendations:
        return " ".join(dict.fromkeys(targeted_recommendations))
    findings = item.get("findings") or []
    recommendations = []
    for finding in findings:
        recommendation = str(finding.get("recommendation") or "").strip()
        if recommendation and recommendation not in recommendations:
            recommendations.append(recommendation)
    if recommendations:
        return " ".join(recommendations)
    if terms:
        return (
            f"Replace {', '.join(terms)} with measurable values, explicit conditions, "
            "expected outputs, and acceptance criteria."
        )
    if not re.search(r"\b(shall|must)\b", requirement, flags=re.I):
        return "Rewrite the statement using 'shall' or 'must' and define a measurable expected result."
    return "Add measurable limits, failure behavior, and acceptance criteria."


def describe_uploaded_uml_image(payload):
    confirmed_structure = payload.get("confirmedStructure")
    if isinstance(confirmed_structure, dict):
        return describe_confirmed_uml_structure(confirmed_structure)

    diagram_project = payload.get("diagramProject")
    if isinstance(diagram_project, dict):
        result = describe_uml_project(diagram_project)
        context = str(payload.get("context") or "").strip()
        if context:
            result["user_context"] = context[:2000]
        return result

    image_data = str(payload.get("imageData") or payload.get("fileData") or "")
    if not image_data:
        raise ValueError("UML image is required for description.")

    mime_type = str(payload.get("mimeType") or infer_mime_type(image_data) or "image/png")
    suffix = IMAGE_EXTENSIONS.get(mime_type.lower(), Path(str(payload.get("fileName") or "")).suffix or ".png")
    raw = decode_data_url(image_data)

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        temp.write(raw)
        temp_path = Path(temp.name)

    try:
        result = describe_uml_image(temp_path, payload.get("diagramType") or "")
        context = str(payload.get("context") or "").strip()
        if context:
            result["user_context"] = context[:2000]
        result.pop("image_path", None)
        return result
    finally:
        temp_path.unlink(missing_ok=True)


def infer_mime_type(data_url):
    match = re.match(r"^data:([^;]+);base64,", data_url)
    return match.group(1) if match else ""


def decode_data_url(value):
    match = re.match(r"^data:[^;]+;base64,(.+)$", value, flags=re.S)
    data = match.group(1) if match else value
    return base64.b64decode(data)


def print_success(result):
    print(json.dumps({"ok": True, "result": result}, ensure_ascii=True))


if __name__ == "__main__":
    raise SystemExit(main())

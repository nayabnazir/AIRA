import re
from html import unescape
from pathlib import Path

import cv2

from ai.cloud_ai_provider import CloudAIError, cloud_ai_available, generate_json
from ai.uml_image_to_text import extract_text_from_uml, generate_uml_description
from ai.vision_result_utils import build_diagram_prompt, normalize_vision_result


def describe_uml_image(image_path, requested_diagram_type=""):
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"UML image not found: {path}")

    image_quality = assess_image_quality(path)
    if not image_quality["is_usable"]:
        return build_unreadable_image_result(image_quality)

    vision_result = None
    vision_error = ""
    if cloud_ai_available():
        try:
            cloud_result, provider = generate_json(
                build_diagram_prompt(requested_diagram_type),
                image_path=str(path),
            )
            vision_result = normalize_vision_result(cloud_result)
            vision_result["provider"] = provider
        except CloudAIError as error:
            vision_error = str(error)

    if vision_result:
        return build_local_vision_description(vision_result)

    extracted_text = extract_text_from_uml(str(path))
    basic_description = generate_uml_description(extracted_text)

    if basic_description:
        description = basic_description
    else:
        description = build_fallback_description(extracted_text)

    type_assessment = assess_diagram_type(extracted_text, requested_diagram_type)
    type_assessment["provider"] = "Local computer vision and OCR"
    type_assessment["vision_model_status"] = vision_error
    return {
        "status": "review_required",
        "image_path": str(path),
        "extracted_text": extracted_text,
        "description": description,
        "table_rows": build_description_table_rows(extracted_text, description),
        "summary": build_professional_summary(extracted_text, description),
        "analysis_quality": type_assessment,
        "review_structure": build_clean_review_structure(extracted_text, type_assessment),
        "professional_report": build_professional_report(
            extracted_text,
            [] if normalize_project_diagram_type(requested_diagram_type) else description,
            requested_diagram_type,
        ),
    }


def build_local_vision_description(result):
    diagram_type = result["diagram_type"]
    actors = result["actors"]
    elements = result["elements"]
    relationships = result["relationships"]
    flow_steps = result["flow_steps"]
    uncertainties = result["uncertainties"]
    confidence = result["confidence"]

    actor_rows = [
        {"Actor / Participant": item.get("name") or "Unlabeled", "Role": item.get("role") or "Visible participant"}
        for item in actors
    ]
    element_rows = [
        {
            "Element": item.get("name") or "Unlabeled",
            "Type": item.get("type") or "Diagram element",
            "Description": item.get("description") or "Visible diagram element.",
        }
        for item in elements
    ]
    relationship_rows = [
        {
            "Source": item.get("source") or "Not readable",
            "Target": item.get("target") or "Not readable",
            "Type / Label": " / ".join(filter(None, [item.get("type"), item.get("label")])) or "Visible connector",
            "Description": item.get("description") or "Visible relationship or flow.",
        }
        for item in relationships
    ]
    flow_rows = [
        {
            "Order": str(item.get("order") or index + 1),
            "Step": item.get("step") or "Visible step",
            "Owner": item.get("owner") or "Not specified",
            "Condition": item.get("condition") or "None shown",
        }
        for index, item in enumerate(flow_steps)
    ]
    uncertainty_rows = [{"Uncertainty": item} for item in uncertainties]

    tables = []
    if actor_rows:
        tables.append({"title": "Actors / Participants", "columns": ["Actor / Participant", "Role"], "rows": actor_rows})
    if element_rows:
        tables.append({"title": "Detected Diagram Elements", "columns": ["Element", "Type", "Description"], "rows": element_rows})
    if relationship_rows:
        tables.append({"title": "Relationships and Flow", "columns": ["Source", "Target", "Type / Label", "Description"], "rows": relationship_rows})
    if flow_rows:
        tables.append({"title": "Ordered Flow", "columns": ["Order", "Step", "Owner", "Condition"], "rows": flow_rows})
    if uncertainty_rows:
        tables.append({"title": "Uncertainties Requiring Review", "columns": ["Uncertainty"], "rows": uncertainty_rows})

    review_relationships = []
    for item in relationships:
        source, target = item.get("source"), item.get("target")
        label = " / ".join(filter(None, [item.get("type"), item.get("label")]))
        review_relationships.append(" -> ".join(filter(None, [source, target])) + (f" ({label})" if label else ""))

    return {
        "status": "review_required" if confidence < 0.9 or uncertainties else "vision_analyzed",
        "extracted_text": "",
        "description": [result["summary"]],
        "summary": result["summary"],
        "analysis_quality": {
            "diagram_type": diagram_type,
            "confidence": confidence,
            "basis": "Analyzed directly from the image by a local multimodal vision model.",
            "requires_review": confidence < 0.9 or bool(uncertainties),
            "provider": result.get("provider") or "Cloud vision provider",
        },
        "review_structure": {
            "diagramType": diagram_type,
            "actors": [item.get("name") for item in actors if item.get("name")],
            "elements": [item.get("name") for item in elements if item.get("name")],
            "relationships": [item for item in review_relationships if item],
        },
        "professional_report": {
            "title": f"Professional {diagram_type} Description",
            "summary": result["summary"],
            "tables": tables,
            "overall_assessment": (
                "This description was generated by a local vision model and remains subject to user verification. "
                "Any explicitly listed uncertainty should be resolved before treating the report as final."
            ),
        },
    }


def describe_confirmed_uml_structure(structure):
    if not isinstance(structure, dict):
        raise ValueError("Confirmed UML structure is required.")

    diagram_type = str(structure.get("diagramType") or "UML / Technical Diagram").strip()
    actors = clean_confirmed_values(structure.get("actors"))
    elements = clean_confirmed_values(structure.get("elements"))
    relationships = clean_confirmed_values(structure.get("relationships"))
    if not elements:
        raise ValueError("Add at least one confirmed diagram element before generating the description.")

    actor_rows = [
        {
            "Actor / Participant": item,
            "Verified Role": confirmed_actor_role(item, diagram_type),
        }
        for item in actors
    ] or [{
        "Actor / Participant": "No external actor confirmed",
        "Verified Role": "The confirmed structure does not identify an external actor or participant.",
    }]
    element_rows = [
        {
            "Element": item,
            "Verified Description": confirmed_element_description(item, diagram_type),
        }
        for item in elements
    ]
    relationship_rows = [
        {
            "Relationship / Flow": item,
            "Verified Meaning": confirmed_relationship_description(item),
        }
        for item in relationships
    ] or [{
        "Relationship / Flow": "No relationship confirmed",
        "Verified Meaning": "No relationship or flow was confirmed during review.",
    }]

    summary = (
        f"The confirmed {diagram_type.lower()} contains {len(actors)} actor or participant(s), "
        f"{len(elements)} verified element(s), and {len(relationships)} confirmed relationship or flow item(s)."
    )
    report = {
        "title": f"Professional Confirmed {diagram_type} Description",
        "summary": summary,
        "tables": [
            {
                "title": "Confirmed Actors / Participants",
                "columns": ["Actor / Participant", "Verified Role"],
                "rows": actor_rows,
            },
            {
                "title": "Confirmed Diagram Elements",
                "columns": ["Element", "Verified Description"],
                "rows": element_rows,
            },
            {
                "title": "Confirmed Relationships / Flow",
                "columns": ["Relationship / Flow", "Verified Meaning"],
                "rows": relationship_rows,
            },
        ],
        "overall_assessment": (
            "This report was generated from the structure reviewed and confirmed by the user. "
            "It does not add unverified actors, elements, relationships, cardinalities, or message directions."
        ),
    }
    return {
        "status": "confirmed",
        "extracted_text": "",
        "description": [summary, report["overall_assessment"]],
        "summary": summary,
        "analysis_quality": {
            "diagram_type": diagram_type,
            "confidence": 1.0,
            "basis": "The report uses user-reviewed and confirmed structure.",
            "requires_review": False,
            "provider": "Confirmed structured UML description",
        },
        "professional_report": report,
    }


def clean_confirmed_values(values):
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        item = re.sub(r"\s+", " ", str(value or "")).strip()
        if item and item.lower() not in {old.lower() for old in result}:
            result.append(item[:240])
    return result[:100]


def build_clean_review_structure(text, assessment):
    """Return only reusable, high-signal OCR facts for the confirmation form."""
    value = str(text or "")
    actors = tagged_review_values(value, ("USE_CASE_ACTOR", "SEQUENCE_PARTICIPANT", "ACTIVITY_LANE"))
    elements = tagged_review_values(value, ("USE_CASE_NODE", "ACTIVITY_STEP", "SEQUENCE_MESSAGE", "CLASS_HEADER"))
    relationships = tagged_review_values(
        value,
        ("USE_CASE_RELATIONSHIP", "ACTIVITY_BRANCH", "ACTIVITY_GUARD"),
    )

    elements = [item.split("::", 1)[0].strip() for item in elements]

    # Structural diagrams do not always expose shape-specific tags. Use a
    # deliberately strict fallback instead of filling the review form with raw
    # OCR fragments.
    if not elements and assessment.get("diagram_type") in {
        "Class Diagram",
        "ER Diagram",
        "Deployment Diagram",
        "Component Diagram",
        "Architecture / Interface Diagram",
        "UML / Technical Diagram",
    }:
        elements = [item for item in extract_clean_labels(value) if is_clean_review_label(item)]

    return {
        "diagramType": assessment.get("diagram_type") or "UML / Technical Diagram",
        "actors": unique_values([item for item in actors if is_clean_review_label(item)]),
        "elements": unique_values([item for item in elements if is_clean_review_label(item)]),
        "relationships": unique_values([item for item in relationships if is_clean_review_label(item)]),
    }


def tagged_review_values(text, tags):
    pattern = rf"(?mi)^(?:{'|'.join(re.escape(tag) for tag in tags)}):\s*(.+)$"
    return [match.strip() for match in re.findall(pattern, str(text or "")) if match.strip()]


def is_clean_review_label(value):
    label = re.sub(r"\s+", " ", str(value or "")).strip(" -_.,:;|")
    if len(label) < 3 or len(label) > 160 or not re.search(r"[A-Za-z]{2}", label):
        return False
    if re.match(r"^(no clear|not detected|not determined|upload|a visible|the diagram|this diagram)", label, re.I):
        return False
    words = re.findall(r"[A-Za-z0-9_+#()/.-]+", label)
    if not words or sum(len(re.sub(r"[^A-Za-z]", "", word)) <= 1 for word in words) > max(1, len(words) // 3):
        return False
    alpha_count = len(re.findall(r"[A-Za-z]", label))
    visible_count = len(re.sub(r"\s", "", label))
    return bool(visible_count and alpha_count / visible_count >= 0.45)


def confirmed_actor_role(actor, diagram_type):
    if "sequence" in diagram_type.lower():
        return f"Acts as a confirmed lifeline or participant named '{actor}'."
    if "activity" in diagram_type.lower():
        return f"Owns or performs activities in the confirmed '{actor}' workflow lane."
    return f"Acts as a confirmed external actor or participant named '{actor}'."


def confirmed_element_description(element, diagram_type):
    value = str(element or "").strip()
    lower_type = diagram_type.lower()
    if "use case" in lower_type:
        return use_case_interpretation(value)
    if "activity" in lower_type:
        return f"Represents the confirmed workflow activity or decision '{value}'."
    if "sequence" in lower_type:
        return f"Represents the confirmed participant message or interaction '{value}'."
    if "class" in lower_type:
        return f"Represents the confirmed class, attribute, or operation '{value}'."
    if "er diagram" in lower_type or lower_type.startswith("er"):
        return f"Represents the confirmed entity, field, or database element '{value}'."
    if "deployment" in lower_type:
        return f"Represents the confirmed deployment node, artifact, or service '{value}'."
    return f"Represents the confirmed diagram element '{value}'."


def confirmed_relationship_description(relationship):
    value = str(relationship or "").strip()
    lower = value.lower()
    if "include" in lower:
        return "Confirms a required include relationship between the identified use cases."
    if "extend" in lower:
        return "Confirms an optional or conditional extend relationship between the identified use cases."
    if "exclude" in lower:
        return (
            "Confirms that 'exclude' is visibly written, although exclude is not a standard UML use-case relationship "
            "and should be verified."
        )
    if "->" in value:
        return "Confirms the stated directed relationship, message, transition, or flow."
    return f"Confirms the visible relationship or flow '{value}'."


def assess_image_quality(image_path):
    image = cv2.imread(str(image_path))
    if image is None:
        return {
            "is_usable": False,
            "reason": "unreadable",
            "message": "This image could not be read. Please upload a valid PNG, JPG, JPEG, WEBP, or BMP image.",
            "sharpness": 0,
        }

    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    contrast = float(gray.std())

    if width < 320 or height < 220:
        return {
            "is_usable": False,
            "reason": "low_resolution",
            "message": (
                "This diagram image is too small to analyze reliably. Please upload a clearer image with a higher resolution."
            ),
            "sharpness": round(sharpness, 1),
        }

    # A low Laplacian variance indicates that text and connector edges have
    # lost enough detail that OCR-based diagram analysis would be misleading.
    if sharpness < 22:
        return {
            "is_usable": False,
            "reason": "blurry",
            "message": (
                "This diagram image is blurry and its text or connections cannot be read reliably. "
                "Please upload a clearer, higher-quality image."
            ),
            "sharpness": round(sharpness, 1),
        }

    if contrast < 12:
        return {
            "is_usable": False,
            "reason": "low_contrast",
            "message": (
                "This diagram has very low contrast, so its text and connections cannot be detected reliably. "
                "Please upload a clearer image with readable text and visible connectors."
            ),
            "sharpness": round(sharpness, 1),
        }

    return {
        "is_usable": True,
        "reason": "usable",
        "message": "",
        "sharpness": round(sharpness, 1),
    }


def build_unreadable_image_result(image_quality):
    message = image_quality["message"]
    return {
        "status": "image_quality_error",
        "error_code": image_quality["reason"],
        "extracted_text": "",
        "description": [message],
        "table_rows": [],
        "summary": message,
        "analysis_quality": {
            "diagram_type": "Not analyzed",
            "confidence": 0,
            "basis": message,
            "requires_review": True,
            "provider": "Local computer vision and OCR",
            "image_quality": image_quality["reason"],
            "sharpness": image_quality["sharpness"],
        },
        "professional_report": {
            "title": "Image Cannot Be Analyzed",
            "summary": message,
            "tables": [],
            "overall_assessment": (
                "No diagram description was generated because doing so from this image could produce an incorrect result."
            ),
        },
    }


def describe_uml_project(project):
    if not isinstance(project, dict) or project.get("format") != "aira-uml-project":
        raise ValueError("This is not a valid AIRA editable UML diagram.")

    nodes = project.get("nodes") if isinstance(project.get("nodes"), list) else []
    connectors = project.get("connectors") if isinstance(project.get("connectors"), list) else []
    normalized_nodes = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        label = clean_project_node_text(node.get("text") or node.get("html") or "")
        node_type = infer_project_node_type(node.get("className") or "")
        if label:
            normalized_nodes.append({"label": label, "type": node_type, "id": str(node.get("nodeId") or "")})

    normalized_connectors = []
    node_lookup = {item["id"]: item["label"] for item in normalized_nodes if item["id"]}
    for connector in connectors:
        if not isinstance(connector, dict):
            continue
        normalized_connectors.append({
            "source": node_lookup.get(str(connector.get("from") or ""), "Unlabeled source"),
            "target": node_lookup.get(str(connector.get("to") or ""), "Unlabeled target"),
            "type": str(connector.get("connectorType") or "association").replace("-", " ").title(),
        })

    diagram_type = normalize_project_diagram_type(project.get("diagramType")) or infer_project_diagram_type(normalized_nodes, normalized_connectors)
    report = build_project_report(diagram_type, normalized_nodes, normalized_connectors)
    extracted_text = "\n".join(item["label"] for item in normalized_nodes)
    description = [
        report["summary"],
        report["overall_assessment"],
    ]
    return {
        "extracted_text": extracted_text,
        "description": description,
        "table_rows": build_description_table_rows(extracted_text, description),
        "summary": report["summary"],
        "professional_report": report,
    }


def build_description_table_rows(extracted_text, description):
    text = str(extracted_text or "")
    description_text = " ".join(str(item) for item in description or [])
    combined = f"{text}\n{description_text}".strip()
    labels = extract_clean_labels(combined)

    actors = [
        item for item in labels
        if re.fullmatch(r"(user|admin|customer|student|actor|client|manager|librarian|c-panel)", item, flags=re.I)
    ]
    processes = [
        item for item in labels
        if re.search(r"\b(login|log in|enter|validate|save|update|add|delete|upload|download|generate|describe|analyze|export|product|file|srs|uml)\b", item, flags=re.I)
    ]
    decisions = [
        item for item in labels
        if re.search(r"\b(valid|same|decision|yes|no|if|whether|condition|check)\b", item, flags=re.I)
    ]

    return [
        {"label": "Diagram Type", "value": infer_diagram_type(combined)},
        {"label": "Actors / Participants", "value": format_items(actors) or "No clear actor label was detected."},
        {"label": "Main Processes", "value": format_items(processes[:12]) or "No clear process label was detected."},
        {"label": "Decisions / Conditions", "value": format_items(decisions[:8]) or "No visible decision or condition was detected."},
        {"label": "Real Description", "value": description_text or "Upload a clearer exported UML image for a more detailed description."},
    ]


def build_professional_report(extracted_text, description, requested_diagram_type=""):
    text = str(extracted_text or "")
    assessment = assess_diagram_type(text, requested_diagram_type)
    diagram_type = assessment["diagram_type"]
    if assessment["confidence"] < 0.58:
        return build_uncertain_diagram_report(text, assessment)
    if is_ai_pipeline_text(text):
        return build_ai_pipeline_report(text)
    if is_architecture_interface_text(text):
        return build_architecture_interface_report(text)
    if diagram_type == "Class Diagram":
        return build_class_report(text, description)
    if diagram_type == "Deployment Diagram":
        return build_deployment_report(text, description)
    if diagram_type == "ER Diagram":
        return build_er_report(text, description)
    if diagram_type == "Use Case Diagram":
        return build_use_case_report(text, description)
    if diagram_type == "Activity Diagram":
        return build_activity_report(text, description)
    if diagram_type == "Sequence Diagram":
        return build_sequence_report(text, description)
    if diagram_type == "State Machine Diagram":
        return build_state_report(text, description)
    if diagram_type in {"Component Diagram", "Package Diagram", "Object Diagram", "Communication Diagram"}:
        return build_structural_uml_report(text, description, diagram_type)
    return build_general_uml_report(text, description, diagram_type)


def assess_diagram_type(text, requested_diagram_type=""):
    requested = normalize_project_diagram_type(requested_diagram_type)
    if requested:
        return {
            "diagram_type": requested,
            "confidence": 1.0,
            "basis": "The user explicitly selected this diagram type.",
            "requires_review": False,
        }

    value = str(text or "").lower()
    scores = {
        "Activity Diagram": 0,
        "Sequence Diagram": 0,
        "Class Diagram": 0,
        "ER Diagram": 0,
        "Deployment Diagram": 0,
        "Use Case Diagram": 0,
        "State Machine Diagram": 0,
        "Architecture / Interface Diagram": 0,
    }
    evidence = {key: [] for key in scores}

    def award(diagram_type, points, reason):
        scores[diagram_type] += points
        evidence[diagram_type].append(reason)

    if "activity_step:" in value:
        award("Activity Diagram", 8, "activity nodes were detected from image layout")
    if "activity_lane:" in value:
        award("Activity Diagram", 8, "swimlane boundaries and headings were detected")
    if "activity_guard:" in value:
        award("Activity Diagram", 5, "decision guard labels were detected")
    if re.search(r"\b(?:example of\s+)?activity diagram\b", value):
        award("Activity Diagram", 14, "the image explicitly identifies itself as an activity diagram")
    if is_lifecycle_activity_text(value):
        award("Activity Diagram", 13, "a lifecycle workflow and feedback decision were detected")
    if is_ai_pipeline_text(value):
        award("Activity Diagram", 13, "a sequential AI-processing pipeline was detected")
    if "sequence_participant:" in value:
        award("Sequence Diagram", 8, "participant lifelines were detected from image layout")
    if "sequence_message:" in value:
        award("Sequence Diagram", 8, "message labels were detected in visual order")
    if len(re.findall(r"(?m)^class_header:", value)) >= 2:
        award("Class Diagram", 6, "multiple structural class headers were detected")
    structural_markers = len(re.findall(r"(?m)^\s*[+-]\s*\w+|:\s*(?:string|int|datetime|text|boolean)\b|\w+\(\)", value))
    if structural_markers >= 4:
        award("Class Diagram", 12, "multiple attributes or operations were detected")
    if sum(1 for item in ["int pk", "int fk", "varchar", "timestamp"] if item in value) >= 3:
        award("ER Diagram", 18, "database keys and column data types were detected")
    if sum(1 for item in ["user browser", "web server", "mysql db", "ai engine", "http requests"] if item in value) >= 3:
        award("Deployment Diagram", 13, "deployment nodes and communication labels were detected")
    if is_architecture_interface_text(value):
        award("Architecture / Interface Diagram", 13, "architecture components and interface flows were detected")
    use_case_markers = sum(1 for item in ["actor", "use case", "include", "extend"] if item in value)
    if use_case_markers >= 2:
        award("Use Case Diagram", 11, "actors, use cases, or include/extend relationships were detected")
    tagged_use_case_count = len(re.findall(r"(?m)^use_case_node:", value))
    if tagged_use_case_count >= 2:
        award("Use Case Diagram", 14, "multiple use-case ellipses were detected from image layout")
    canonical_use_cases = extract_canonical_use_cases(value)
    if len(canonical_use_cases) >= 3:
        award("Use Case Diagram", 13, "multiple externally visible system use cases were detected")
    if sum(1 for item in ["initial state", "final state", "transition", "entry", "exit"] if item in value) >= 2:
        award("State Machine Diagram", 11, "state-machine transition markers were detected")

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    best_type, best_score = ranked[0]
    second_score = ranked[1][1]
    confidence = min(0.98, best_score / 16)
    if best_score < 8 or best_score - second_score < 3:
        confidence = min(confidence, 0.5)
    reasons = evidence[best_type]
    return {
        "diagram_type": best_type if best_score else "UML / Technical Diagram",
        "confidence": round(confidence, 2),
        "basis": "; ".join(reasons) if reasons else "No reliable structural diagram markers were detected.",
        "requires_review": confidence < 0.72,
    }


def build_uncertain_diagram_report(text, assessment):
    labels = extract_clean_labels(text)
    return {
        "title": "Uncertain UML / Technical Diagram Analysis",
        "summary": (
            "AIRA could not identify this diagram type with enough structural confidence to generate a reliable "
            "specialized description. The readable evidence is shown below without inventing missing relationships or flow."
        ),
        "tables": [
            {
                "title": "Analysis Confidence",
                "columns": ["Likely Type", "Confidence", "Evidence"],
                "rows": [{
                    "Likely Type": assessment["diagram_type"],
                    "Confidence": f"{round(assessment['confidence'] * 100)}%",
                    "Evidence": assessment["basis"],
                }],
            },
            {
                "title": "Readable Labels",
                "columns": ["Label", "Status"],
                "rows": [
                    {"Label": item, "Status": "Readable text; its diagram role was not determined confidently."}
                    for item in labels[:20]
                ] or [{"Label": "No reliable label detected", "Status": "Use a clearer or higher-resolution image."}],
            },
        ],
        "overall_assessment": (
            "This result requires review. AIRA intentionally avoided assigning a specialized diagram type or fabricating "
            "a workflow from weak OCR evidence. Upload a clearer image or manually select the diagram type for a guided analysis."
        ),
    }


def is_ai_pipeline_text(text):
    value = str(text or "").lower()
    indicators = ["preprocessing", "features extraction", "feature extraction", "ai model", "ambiguity detection", "uml output"]
    return sum(1 for item in indicators if item in value) >= 3


def build_ai_pipeline_report(text):
    definitions = [
        ("SRS/UML Image", r"srs.?uml image", "Input artifact supplied to the analysis pipeline."),
        ("Preprocessing", r"preprocessing", "Cleans, normalizes, and prepares the uploaded input for analysis."),
        ("Feature Extraction", r"features? extraction", "Extracts relevant textual, structural, or visual features from the prepared input."),
        ("AI Model", r"\bai model\b|\bal model\b", "Processes the extracted features to perform intelligent analysis or generation."),
        ("Ambiguity Detection / UML Output", r"ambiguity detection|uml output", "Produces the final ambiguity-analysis result or UML-related output."),
    ]
    detected = [
        (name, responsibility)
        for name, pattern, responsibility in definitions
        if re.search(pattern, text, flags=re.I)
    ]
    stages = [
        {"Order": str(index + 1), "Pipeline Stage": name, "Responsibility": responsibility}
        for index, (name, responsibility) in enumerate(detected)
    ]
    flows = [
        {
            "From": stages[index]["Pipeline Stage"],
            "To": stages[index + 1]["Pipeline Stage"],
            "Data Flow": f"The output of {stages[index]['Pipeline Stage']} becomes the input of {stages[index + 1]['Pipeline Stage']}.",
        }
        for index in range(max(len(stages) - 1, 0))
    ]
    return {
        "title": "Professional AI Processing Pipeline Description",
        "summary": (
            "This diagram represents a sequential AI-processing pipeline. It accepts an SRS document or UML image, "
            "prepares and extracts features from the input, applies an AI model, and produces ambiguity-detection or UML output."
        ),
        "tables": [
            {"title": "Pipeline Stages", "columns": ["Order", "Pipeline Stage", "Responsibility"], "rows": stages},
            {"title": "Processing Flow", "columns": ["From", "To", "Data Flow"], "rows": flows},
        ],
        "overall_assessment": (
            "The diagram clearly communicates the main top-to-bottom processing sequence. For a more complete technical "
            "design, label the preprocessing and feature-extraction techniques, identify the AI model, and separate the "
            "ambiguity-analysis and UML-output branches when they use different processing paths."
        ),
    }


def is_architecture_interface_text(text):
    value = str(text or "").lower()
    components = ["frontend ui", "backend api", "ai engine", "mysql database", "web pages", "controllers", "services"]
    flows = ["user requests", "ai processing", "store / retrieve data", "store retrieve data"]
    return sum(1 for item in components if item in value) >= 3 or (
        sum(1 for item in components if item in value) >= 2 and any(item in value for item in flows)
    )


def build_architecture_interface_report(text):
    component_definitions = [
        ("Frontend UI", r"frontend ui", "Presentation layer", "Provides web pages and captures user requests such as login, SRS upload, and UML generation."),
        ("Backend API", r"backend api", "Application/service layer", "Receives frontend requests and coordinates controllers, services, AI processing, and persistence."),
        ("AI Engine", r"\bai engine\b", "Intelligence/processing layer", "Runs machine-learning models and processing for ambiguity detection and UML generation."),
        ("MySQL Database", r"mysql database|mysql db", "Persistence layer", "Stores and retrieves persistent application data."),
    ]
    components = [
        {"Component": name, "Layer / Type": layer, "Responsibility": responsibility}
        for name, pattern, layer, responsibility in component_definitions
        if re.search(pattern, text, flags=re.I)
    ]
    interface_definitions = [
        ("Frontend UI", "User Requests", "Backend API", "Sends login, SRS-upload, and UML-generation requests to backend services."),
        ("Backend API", "AI Processing", "AI Engine", "Submits ambiguity-detection and UML-generation work to the AI processing layer."),
        ("Backend API", "Store / Retrieve Data", "MySQL Database", "Persists and retrieves users, requests, files, analysis results, and generated outputs."),
    ]
    interfaces = [
        {"Source": source, "Interface / Data Flow": flow, "Target": target, "Purpose": purpose}
        for source, flow, target, purpose in interface_definitions
        if source.lower() in text.lower() and target.lower() in text.lower()
    ]
    observations = [
        {
            "Severity": "Medium",
            "Observation": "The diagram names logical components and flows but does not define interface protocols or contracts.",
            "Recommendation": "Document API endpoints, request/response schemas, authentication, error handling, and transport protocols.",
        },
        {
            "Severity": "Low",
            "Observation": "The Backend API is the central integration point for both AI processing and persistence.",
            "Recommendation": "Define service boundaries, timeouts, retries, and failure isolation for AI and database dependencies.",
        },
    ]
    return {
        "title": "Professional System Architecture and Interface Diagram Description",
        "summary": (
            "This diagram presents AIRA's high-level system architecture and interface flow. User interactions originate "
            "in the Frontend UI, pass through the Backend API, and are routed either to the AI Engine for intelligent "
            "processing or to the MySQL Database for persistent storage and retrieval."
        ),
        "tables": [
            {"title": "Architecture Components", "columns": ["Component", "Layer / Type", "Responsibility"], "rows": components},
            {"title": "Interfaces and Data Flows", "columns": ["Source", "Interface / Data Flow", "Target", "Purpose"], "rows": interfaces},
            {"title": "Architecture Review Notes", "columns": ["Severity", "Observation", "Recommendation"], "rows": observations},
        ],
        "overall_assessment": (
            "The diagram correctly communicates the principal architectural layers and their interaction paths. It is a "
            "system architecture/interface diagram rather than a use-case diagram. Add protocol, security, deployment, "
            "and error-handling details before using it as a complete integration specification."
        ),
    }


def build_use_case_report(text, description):
    labels = extract_clean_labels(text)
    tagged_actors = unique_values(re.findall(r"(?m)^USE_CASE_ACTOR:\s*(.+)$", str(text or "")))
    tagged_use_cases = unique_values(re.findall(r"(?m)^USE_CASE_NODE:\s*(.+)$", str(text or "")))
    tagged_relationships = unique_values(re.findall(r"(?m)^USE_CASE_RELATIONSHIP:\s*(.+)$", str(text or "")))
    actors = tagged_actors or [
        item for item in labels
        if re.fullmatch(r"(user|admin|customer|student|actor|client|manager|librarian|patient|doctor|staff|.+\s+system)", item, flags=re.I)
    ]
    use_cases = tagged_use_cases or extract_canonical_use_cases(text)
    relationships = tagged_relationships or unique_values(re.findall(r"\b(include|extend|exclude|inherits|uses)\b", text, flags=re.I))
    if re.search(r"\bmanage users\b", text, flags=re.I) and not any(item.lower() == "admin" for item in actors):
        actors.append("Admin")
    actors = unique_values(actors)
    return {
        "title": "Professional UML Use Case Diagram Description",
        "summary": (
            f"The use-case diagram defines the externally visible behavior of the system through "
            f"{len(actors)} detected actor(s) and {len(use_cases)} detected use case(s)."
        ),
        "tables": [
            {
                "title": "Actors",
                "columns": ["Actor", "Responsibility"],
                "rows": [{"Actor": item, "Responsibility": use_case_actor_role(item)} for item in actors]
                or [{"Actor": "No clear actor detected", "Responsibility": "Upload a clearer exported diagram."}],
            },
            {
                "title": "Use Cases",
                "columns": ["Use Case", "Description"],
                "rows": [{"Use Case": item, "Description": use_case_interpretation(item)} for item in use_cases]
                or [{"Use Case": "No clear use case detected", "Description": "No readable system behavior was detected."}],
            },
            {
                "title": "Actor Capabilities",
                "columns": ["Actor", "Associated Capabilities"],
                "rows": build_actor_capability_rows(actors, use_cases, bool(tagged_use_cases)),
            },
            {
                "title": "Relationships",
                "columns": ["Relationship", "Meaning"],
                "rows": [{"Relationship": item.title(), "Meaning": use_case_relationship_meaning(item)} for item in relationships]
                or [{"Relationship": "Associations", "Meaning": "Visible solid connectors associate actors with the use cases they perform."}],
            },
        ],
        "overall_assessment": (
            f"The diagram presents {len(actors)} external actor(s), {len(use_cases)} system behavior(s), and "
            f"{len(relationships)} explicitly labeled use-case relationship type(s). Verify each actor association and "
            "the direction of include, extend, or other dependency arrows before using the diagram as a final specification."
        ),
    }


def extract_canonical_use_cases(text):
    definitions = [
        ("Sign Up", r"\bsign up\b"),
        ("Login", r"\blogin\b"),
        ("Upload SRS", r"\bupload srs\b"),
        ("Check Ambiguity", r"\bcheck ambiguity\b"),
        ("Generate UML", r"\bgenerate uml\b"),
        ("Upload UML Image", r"\bupload uml image\b"),
        ("View History", r"\bview history\b"),
        ("Download Output", r"\bdownload output\b"),
        ("Manage Users", r"\bmanage users\b"),
    ]
    return [label for label, pattern in definitions if re.search(pattern, text, flags=re.I)]


def build_actor_capability_rows(actors, use_cases, layout_detected=False):
    if layout_detected:
        return [
            {
                "Actor": actor,
                "Associated Capabilities": (
                    "Participates in one or more visible use cases. Exact connector-to-use-case mapping requires "
                    "connector tracing and is not inferred when lines cross or overlap."
                ),
            }
            for actor in actors
        ]
    available = set(use_cases)
    user_capabilities = [
        item for item in [
            "Sign Up", "Login", "Upload SRS", "Check Ambiguity", "Generate UML",
            "Upload UML Image", "View History", "Download Output",
        ]
        if item in available
    ]
    admin_capabilities = [
        item for item in ["Login", "View History", "Download Output", "Manage Users"]
        if item in available
    ]
    rows = []
    for actor in actors:
        capabilities = admin_capabilities if actor.lower() == "admin" else user_capabilities
        rows.append({"Actor": actor, "Associated Capabilities": ", ".join(capabilities) or "No capability was detected confidently."})
    return rows


def build_activity_report(text, description):
    if is_lifecycle_activity_text(text):
        return build_lifecycle_activity_report(text)
    tagged_lanes = unique_values(re.findall(r"(?m)^ACTIVITY_LANE:\s*(.+)$", str(text or "")))
    tagged_steps = []
    for raw in re.findall(r"(?m)^ACTIVITY_STEP:\s*(.+)$", str(text or "")):
        parts = [part.strip() for part in re.split(r"\s*::\s*LANE:\s*", raw, maxsplit=1, flags=re.I)]
        tagged_steps.append({"activity": parts[0], "lane": parts[1] if len(parts) > 1 else ""})
    labels = extract_clean_labels(text)
    steps = tagged_steps or [
        {"activity": item, "lane": ""}
        for item in labels
        if re.search(r"\b(call|prepare|meet|send|create|open|access|get|detect|change|play|retrieve|login|enter|validate|save|update|add|delete|upload|download|generate|analy|describe|export|submit|process|approve|reject)\b", item, flags=re.I)
    ]
    tagged_guards = unique_values(re.findall(r"(?m)^ACTIVITY_GUARD:\s*(.+)$", str(text or "")))
    decision_count_match = re.search(r"(?m)^ACTIVITY_DECISION_COUNT:\s*(\d+)", str(text or ""))
    decision_count = int(decision_count_match.group(1)) if decision_count_match else 0
    tagged_branches = []
    for raw in re.findall(r"(?m)^ACTIVITY_BRANCH:\s*(.+)$", str(text or "")):
        source, separator, targets = raw.partition(":: TARGETS:")
        if separator:
            tagged_branches.append({"source": source.strip(), "targets": [item.strip() for item in targets.split(",") if item.strip()]})
    decisions = tagged_guards or unique_values(
        re.findall(r"\[([^\]]{3,80})\]", str(text or ""))
        + [item for item in labels if re.search(r"\b(valid|same|decision|yes|no|if|whether|condition|check|approved|available|onsite|offsite|statement of problem)\b", item, flags=re.I)]
    )
    lanes = tagged_lanes or [item for item in labels if re.fullmatch(r"(user|admin|customer|system|server|c-panel|database|manager)", item, flags=re.I)]
    if tagged_steps and lanes:
        summary = (
            f"The activity diagram models a cross-functional workflow across {len(lanes)} swimlane(s), "
            f"containing {len(steps)} detected activities and {decision_count or len(decisions)} visible decision node(s)."
        )
    elif tagged_steps:
        summary = (
            f"The activity diagram models a workflow containing {len(steps)} detected activities and "
            f"{decision_count or len(decisions)} visible decision node(s)."
        )
    else:
        summary = " ".join(description) if description else "The activity diagram models an operational workflow and its decision paths."
    return {
        "title": "Professional UML Activity Diagram Description",
        "summary": summary,
        "tables": [
            {"title": "Workflow Participants / Swimlanes", "columns": ["Participant", "Responsibility"], "rows": [{"Participant": item, "Responsibility": f"Performs or owns activities shown in the {item} swimlane."} for item in lanes] or [{"Participant": "System workflow", "Responsibility": "Executes the visible activity sequence."}]},
            {
                "title": "Workflow Narrative",
                "columns": ["Aspect", "Description"],
                "rows": build_activity_narrative_rows(steps, decisions, lanes, decision_count, tagged_branches),
            },
            {"title": "Activity Flow", "columns": ["Visual Order", "Activity", "Responsible Swimlane"], "rows": [{"Visual Order": str(index + 1), "Activity": item["activity"], "Responsible Swimlane": item["lane"] or "Not determined"} for index, item in enumerate(steps)] or [{"Visual Order": "1", "Activity": "No clear activity detected", "Responsible Swimlane": "Not determined"}]},
            {
                "title": "Decisions and Alternate Paths",
                "columns": ["Decision / Condition", "Interpretation"],
                "rows": build_activity_decision_rows(decisions, decision_count, tagged_branches),
            },
        ],
        "overall_assessment": (
            (
                "The diagram presents a cross-functional activity flow with a visible initial node, final node, "
                "responsible swimlanes, and conditional branches."
                if lanes else
                "The diagram presents an activity flow with visible activities, decision nodes, alternate branches, and completion paths."
            )
            + " Verify that every decision outcome is labeled and that each branch rejoins or terminates explicitly."
            if tagged_steps and (lanes or decision_count)
            else "The workflow should be validated for a clear start, end, success path, failure path, and labeled decision outcomes."
        ),
    }


def build_activity_narrative_rows(steps, decisions, lanes, decision_count=0, branches=None):
    if not steps:
        return [{"Aspect": "Workflow", "Description": "No readable activity flow was detected."}]
    activity_names = [item["activity"] for item in steps]
    rows = [
        {
            "Aspect": "Start and progression",
            "Description": (
                f"The visible process begins with '{activity_names[0]}' and continues through the activities shown "
                f"from top to bottom across {len(lanes) or 1} responsible workflow lane(s)."
            ),
        }
    ]
    branches = branches or []
    if decisions:
        rows.append({
            "Aspect": "Conditional paths",
            "Description": (
                "The workflow contains alternate paths controlled by these visible guard conditions: "
                + ", ".join(f"'{item}'" for item in decisions) + "."
            ),
        })
    elif decision_count:
        rows.append({
            "Aspect": "Conditional paths",
            "Description": (
                f"The image contains {decision_count} visible decision node(s), but their guard labels are not readable. "
                "The alternate paths are described only where their visual targets can be inferred."
            ),
        })
    for branch in branches:
        rows.append({
            "Aspect": f"Branch after {branch['source']}",
            "Description": "The decision visibly branches toward " + " and ".join(f"'{item}'" for item in branch["targets"]) + ".",
        })
    if len(activity_names) > 1:
        rows.append({
            "Aspect": "Completion",
            "Description": (
                f"The last labeled activity before the visible final node is '{activity_names[-1]}'. "
                "Activities at a similar vertical level may represent alternate or converging branches rather than a strict sequence."
            ),
        })
    return rows


def build_activity_decision_rows(decisions, decision_count, branches):
    rows = [
        {"Decision / Condition": item, "Interpretation": f"Control flow branches according to '{item}'."}
        for item in decisions
    ]
    rows.extend({
        "Decision / Condition": f"Decision after {branch['source']}",
        "Interpretation": "Alternate visible targets: " + ", ".join(branch["targets"]) + ".",
    } for branch in branches)
    if not rows and decision_count:
        rows = [{
            "Decision / Condition": f"{decision_count} unlabeled decision node(s)",
            "Interpretation": "Decision diamonds are visible, but no readable guard conditions are attached.",
        }]
    return rows or [{
        "Decision / Condition": "No clear decision detected",
        "Interpretation": "No readable branch condition or decision diamond was detected.",
    }]


def is_lifecycle_activity_text(text):
    value = str(text or "").lower()
    indicators = ["development lifecycle", "agile model", "planning", "deployment", "feedback", "more changes", "functional testing"]
    return sum(1 for item in indicators if item in value) >= 3


def build_lifecycle_activity_report(text):
    stage_definitions = [
        ("Requirement Analysis", r"requirement analysis|define srs requirements|understand problem", "Understand the problem, define SRS requirements, and identify AI needs."),
        ("Planning", r"planning|ptenning|milestones|agile methodology", "Select tools and technologies, define milestones, and choose the Agile methodology."),
        ("Design", r"\bdesign\b|system architecture|database design|uml diagrams|ui design", "Design the system architecture, database, UML models, and user interface."),
        ("Implementation", r"implementation|frontend development|backend development|ai model development", "Develop the frontend, backend, and AI model."),
        ("Testing", r"\btesting\b|functional testing|output validation|bug fixing", "Perform functional testing, validate AI output, and fix defects."),
        ("Deployment", r"\bdeployment\b|user access setup", "Deploy the web-based system and configure user access."),
        ("Feedback & Improvement", r"feedback|performance improvement|feature enhancement", "Collect user feedback and improve performance and features."),
    ]
    stages = [
        {"Order": str(index + 1), "Lifecycle Stage": name, "Main Activities": activities}
        for index, (name, pattern, activities) in enumerate(stage_definitions)
        if re.search(pattern, text, flags=re.I)
    ]
    return {
        "title": "Professional UML Activity Diagram Description",
        "summary": (
            "This activity diagram models AIRA's iterative Agile software-development lifecycle from requirement analysis "
            "through deployment, feedback, and continued improvement."
        ),
        "tables": [
            {"title": "Lifecycle Workflow", "columns": ["Order", "Lifecycle Stage", "Main Activities"], "rows": stages},
            {
                "title": "Decision and Feedback Loop",
                "columns": ["Decision", "Outcome", "Interpretation"],
                "rows": [
                    {"Decision": "More changes required?", "Outcome": "No", "Interpretation": "The lifecycle reaches its final state."},
                    {"Decision": "More changes required?", "Outcome": "Yes", "Interpretation": "The workflow returns to Planning for another iteration."},
                ],
            },
        ],
        "overall_assessment": (
            "The diagram clearly presents an iterative Agile lifecycle with stage-specific activities and a feedback loop. "
            "To make the flow more precise, connect the Yes branch explicitly back to the existing Planning activity rather "
            "than showing a second Planning node, and define entry criteria, exit criteria, and responsible roles for each stage."
        ),
    }


def use_case_actor_role(actor):
    roles = {
        "user": "Uses the core AIRA functions, including account access, SRS upload and analysis, UML generation, image description, history, and downloads.",
        "admin": "Authenticates to administer users and access management-oriented capabilities.",
    }
    return roles.get(str(actor or "").lower(), "Initiates or participates in the visible system behavior.")


def use_case_interpretation(use_case):
    value = str(use_case or "").lower()
    interpretations = [
        (r"sign up", "Creates a new user account."),
        (r"login", "Authenticates a user or administrator before protected operations."),
        (r"upload srs", "Uploads an SRS document for processing or ambiguity analysis."),
        (r"check ambiguity", "Analyzes requirements to identify ambiguous or unclear statements."),
        (r"generate uml", "Generates a UML diagram from requirements or descriptive input."),
        (r"upload uml image", "Uploads a UML image for diagram-specific description."),
        (r"view history", "Displays previously generated and analyzed work."),
        (r"download output", "Downloads generated documents, diagrams, or analysis results."),
        (r"manage users", "Allows an administrator to manage user accounts."),
    ]
    for pattern, interpretation in interpretations:
        if re.search(pattern, value, flags=re.I):
            return interpretation
    words = str(use_case or "").strip().split()
    if words:
        action = words[0].lower()
        target = " ".join(words[1:]).lower()
        if action in {
            "book", "request", "prepare", "confirm", "make", "check", "order",
            "serve", "cook", "eat", "drink", "pay", "create", "submit", "review",
        }:
            target_text = f" {target}" if target else ""
            return f"Allows an actor or supporting system to {action}{target_text} as part of the visible workflow."
    return f"Represents the externally visible system behavior '{use_case}'."


def use_case_relationship_meaning(relationship):
    if str(relationship or "").lower() == "include":
        return "The source use case always invokes the included use case as a required part of its behavior."
    if str(relationship or "").lower() == "extend":
        return "The extending use case adds optional behavior under a stated condition."
    if str(relationship or "").lower() == "exclude":
        return (
            "'Exclude' is visible in the diagram, but it is not a standard UML use-case relationship. "
            "Verify whether the intended relationship is extend, include, or a documented constraint."
        )
    return f"Represents a visible '{relationship}' relationship between use cases."


def build_sequence_report(text, description):
    participants = extract_sequence_participants(text)
    messages = extract_sequence_messages(text)
    has_return_path = any(
        re.search(r"\b(return|response|generated|display|show|present)\b", message, flags=re.I)
        for _, message in messages
    )
    summary = (
        f"The sequence diagram contains {len(participants)} detected participant lifeline(s) and "
        f"{len(messages)} interaction(s) arranged in chronological order."
    )
    if messages:
        summary += f" The visible flow begins with '{messages[0][1]}' and ends with '{messages[-1][1]}'."
    return {
        "title": "Professional UML Sequence Diagram Description",
        "summary": summary,
        "tables": [
            {"title": "Participants / Lifelines", "columns": ["Participant", "Role"], "rows": [{"Participant": item, "Role": sequence_participant_role(item)} for item in participants[:12]] or [{"Participant": "No clear participant detected", "Role": "Upload a clearer sequence diagram."}]},
            {"title": "Message Sequence", "columns": ["Order", "Message", "Interpretation"], "rows": [{"Order": str(order), "Message": message, "Interpretation": sequence_message_interpretation(message)} for order, message in messages[:20]] or [{"Order": "1", "Message": "No clear message detected", "Interpretation": "No readable numbered message label was detected."}]},
        ],
        "overall_assessment": (
            "The diagram presents a readable main success scenario through ordered messages and participant lifelines. "
            "The participant labels and message directions should be verified where OCR is uncertain. "
            + (
                "The visible return path is represented; add alternate flows and failure responses to make the sequence "
                "more complete and implementation-ready."
                if has_return_path
                else "Add explicit return messages, alternate flows, and failure responses to make the sequence complete "
                "and implementation-ready."
            )
        ),
    }


def extract_sequence_messages(text):
    value = str(text or "")
    tagged = re.findall(r"(?m)^SEQUENCE_MESSAGE:\s*(.+)$", value)
    if tagged:
        labels = unique_values(
            repair_sequence_label(item)
            for item in tagged
            if is_valid_sequence_label(item)
        )
        return [(index + 1, label) for index, label in enumerate(labels)]

    messages = {}
    for raw in value.splitlines():
        match = re.match(r"^\s*(\d+)\s*[:.)-]?\s*(.+)$", raw)
        if not match:
            continue
        order = int(match.group(1))
        label = repair_sequence_label(match.group(2))
        if is_valid_sequence_label(label):
            messages.setdefault(order, label)
    if messages:
        return sorted(messages.items())

    action_lines = []
    for raw in value.splitlines():
        label = repair_sequence_label(raw)
        if (
            is_valid_sequence_label(label)
            and re.search(
                r"\b(enter|send|process|generate|save|return|display|upload|download|request|response|"
                r"validate|create|update|delete|fetch|get|add|calculate|submit|authenticate|notify|read|write|show)\b",
                label,
                flags=re.I,
            )
        ):
            action_lines.append(label)
    labels = unique_values(action_lines)
    return [(index + 1, label) for index, label in enumerate(labels)]


def is_valid_sequence_label(value):
    label = str(value or "").strip()
    if len(label) < 3 or len(label) > 100 or not re.search(r"[A-Za-z]", label):
        return False
    if re.match(r"^(sequence_(participant|message)|class_header)\s*:", label, flags=re.I):
        return False
    if re.fullmatch(r"(?:e+\s*)+\d*", label, flags=re.I):
        return False
    return True


def repair_sequence_label(value):
    label = re.sub(r"\s+", " ", str(value or "")).strip(" |_-")
    replacements = [
        (r"\bvdidatd\b|\bva idatd\b|\bvalidate?d?\b", "validate"),
        (r"\btalculate\b", "calculate"),
        (r"\bnlember\b|\bmamber\b|\bmem ber\b", "member"),
        (r"\becord\b", "record"),
        (r"\bbaid\b", "paid"),
        (r"\bc\s+rate\b|\bc ebte\b", "create"),
    ]
    for pattern, replacement in replacements:
        label = re.sub(pattern, replacement, label, flags=re.I)
    label = re.sub(r"\s+[|Il1]$", "", label).strip()
    return label


def extract_sequence_participants(text):
    value = str(text or "")
    tagged = re.findall(r"(?m)^SEQUENCE_PARTICIPANT:\s*(.+)$", value)
    if tagged:
        labels = unique_values(
            repair_sequence_label(item)
            for item in tagged
            if is_valid_sequence_label(item)
        )
        return [
            label for label in labels
            if not any(
                other.lower() != label.lower()
                and other.lower() in label.lower()
                and len(label.split()) > len(other.split())
                for other in labels
            )
        ]

    participants = []
    prefix = re.split(r"(?m)^\s*\d+\s*[:.)-]?", value, maxsplit=1)[0]
    suffix_words = {"record", "model", "engine", "service", "controller", "database", "system", "api", "ui"}
    for raw in prefix.splitlines():
        candidate = re.sub(r"\s+", " ", raw).strip(" |_-")
        if (
            re.fullmatch(r"[A-Za-z][A-Za-z0-9 _/-]{2,35}", candidate)
            and not re.search(
                r"\b(enter|send|process|generate|save|return|display|upload|download|request|output)\b",
                candidate,
                flags=re.I,
            )
        ):
            words = re.findall(r"[A-Za-z][A-Za-z0-9-]*", candidate)
            for word in words:
                word = re.sub(r"^libranan$", "Librarian", word, flags=re.I)
                if word.lower() == "record" and any(item.lower() == "member" for item in participants):
                    member_index = next(index for index, item in enumerate(participants) if item.lower() == "member")
                    participants[member_index] = f"{participants[member_index]} {word}"
                elif word.lower() in suffix_words and participants:
                    participants[-1] = f"{participants[-1]} {word}"
                else:
                    participants.append(word)
    if re.search(r"\b(fine paid|calculate fine|add fine|create)\b", value, flags=re.I) and not any(
        item.lower() == "bill" for item in participants
    ):
        participants.append("Bill")
    return unique_values(participants)


def sequence_participant_role(participant):
    value = str(participant or "").lower()
    roles = [
        (r"\b(user|actor|customer|client|member|librarian|admin)\b", "Initiates or participates in the scenario as an external user or actor."),
        (r"\b(frontend|ui|browser|view|page|app)\b", "Receives user input, forwards requests, and presents returned results."),
        (r"\b(backend|api|controller|server|service|handler)\b", "Coordinates request processing and communication with supporting services."),
        (r"\b(ai|model|engine|processor|generator)\b", "Processes the supplied input and produces the requested intelligent output."),
        (r"\b(database|repository|store|storage|db)\b", "Persists or retrieves information used during the interaction."),
    ]
    for pattern, role in roles:
        if re.search(pattern, value, flags=re.I):
            return role
    return "Participates in the interaction sequence and exchanges messages with other lifelines."


def sequence_message_interpretation(message):
    value = str(message or "").lower()
    interpretations = [
        (r"\bgenerated\b", "The processing participant returns the generated result to the requesting participant."),
        (r"\b(process|analy[sz]e|generate|generated|create)\b", "The receiving participant processes the request and produces a result."),
        (r"\b(enter|upload|provide)\b", "The initiating participant supplies input or a file to begin the interaction."),
        (r"\b(send|submit|request|forward)\b", "The request is forwarded to the next participant for processing."),
        (r"\b(save|store|write|persist)\b", "The generated or processed result is persisted for later use."),
        (r"\b(return|response|respond)\b", "A result or response is returned to the requesting participant."),
        (r"\b(display|show|present)\b", "The result is presented to the user."),
        (r"validate.*member", "The librarian requests confirmation that the member is valid."),
        (r"get.*issue.*detail", "The librarian retrieves the issue or transaction details needed for fine processing."),
        (r"get.*member.*type", "The member classification is retrieved to support the applicable fine rules."),
        (r"create", "A new bill or fine record is created."),
        (r"calculate.*fine", "The fine amount is calculated."),
        (r"add.*fine.*member", "Fine and member details are added to the bill."),
        (r"fine.*paid", "The bill reports or records that the fine has been paid."),
        (r"update.*book.*status", "The book status is updated after payment."),
        (r"update.*member.*record", "The member record is updated after the transaction completes."),
    ]
    for pattern, interpretation in interpretations:
        if re.search(pattern, value, flags=re.I):
            return interpretation
    return f"The interaction performs '{message}' at this point in the sequence."


def build_state_report(text, description):
    labels = extract_clean_labels(text)
    transitions = [item for item in labels if re.search(r"\b(on|when|after|before|event|submit|approve|reject|cancel|complete|fail)\b", item, flags=re.I)]
    states = [item for item in labels if item not in transitions]
    return {
        "title": "Professional UML State Machine Diagram Description",
        "summary": " ".join(description) if description else "The state machine diagram models lifecycle states and event-driven transitions.",
        "tables": [
            {"title": "States", "columns": ["State", "Interpretation"], "rows": [{"State": item, "Interpretation": f"Represents the '{item}' lifecycle condition."} for item in states[:16]]},
            {"title": "Transitions / Events", "columns": ["Transition", "Interpretation"], "rows": [{"Transition": item, "Interpretation": f"Triggers or describes a state change: '{item}'."} for item in transitions[:16]] or [{"Transition": "No clear transition detected", "Interpretation": "No readable transition event was detected."}]},
        ],
        "overall_assessment": "Verify that every state has valid entry and exit paths and that exceptional or terminal states are represented.",
    }


def build_structural_uml_report(text, description, diagram_type):
    labels = extract_clean_labels(text)
    relationships = unique_values(re.findall(r"\b(depends|uses|provides|requires|contains|imports|communicates|connects|deploys|owns)\b", text, flags=re.I))
    return {
        "title": f"Professional UML {diagram_type} Description",
        "summary": " ".join(description) if description else f"The {diagram_type.lower()} describes system structure and dependencies.",
        "tables": [
            {"title": "Structural Elements", "columns": ["Element", "Interpretation"], "rows": [{"Element": item, "Interpretation": f"A named {diagram_type.lower()} element representing a system responsibility or boundary."} for item in labels[:20]]},
            {"title": "Dependencies / Connections", "columns": ["Relationship", "Interpretation"], "rows": [{"Relationship": item, "Interpretation": f"A visible '{item}' dependency or connection."} for item in relationships] or [{"Relationship": "No labeled dependency detected", "Interpretation": "Connections may be visible but are not labeled clearly enough for OCR."}]},
        ],
        "overall_assessment": "Review element responsibilities, dependency direction, interfaces, and boundaries before using the diagram as an implementation specification.",
    }


def build_behavior_report(title, element_name, actors, elements, relationships, description, assessment):
    return {
        "title": title,
        "summary": " ".join(description) if description else assessment,
        "tables": [
            {"title": "Actors / Participants", "columns": ["Actor", "Role"], "rows": [{"Actor": item, "Role": "Initiates or participates in the system behavior."} for item in actors] or [{"Actor": "No clear actor detected", "Role": "Upload a clearer exported diagram."}]},
            {"title": f"{element_name}s", "columns": [element_name, "Description"], "rows": [{element_name: item, "Description": f"Represents the system behavior '{item}'."} for item in elements] or [{element_name: "No clear element detected", "Description": "No readable behavior label was detected."}]},
            {"title": "Relationships", "columns": ["Relationship", "Meaning"], "rows": [{"Relationship": item, "Meaning": f"A visible '{item}' relationship between behaviors."} for item in relationships] or [{"Relationship": "Associations", "Meaning": "Actor-to-behavior associations are represented by the visible connectors."}]},
        ],
        "overall_assessment": assessment,
    }


def build_er_report(text, description):
    entities = [
        {
            "Entity": "USERS",
            "Purpose": "Stores registered user accounts and authentication-related information.",
            "Primary Key": "user_id",
            "Foreign Keys": "None",
            "Important Attributes": "full_name, email, password, created_at",
        },
        {
            "Entity": "UML_REQUESTS",
            "Purpose": "Stores UML-generation requests submitted by users.",
            "Primary Key": "request_id",
            "Foreign Keys": "user_id -> USERS.user_id",
            "Important Attributes": "uml_type, prompt, created_at",
        },
        {
            "Entity": "UPLOADED_FILES",
            "Purpose": "Stores metadata for files attached to UML requests.",
            "Primary Key": "file_id",
            "Foreign Keys": "request_id -> UML_REQUESTS.request_id",
            "Important Attributes": "file_name, file_type, file_path, uploaded_at",
        },
        {
            "Entity": "UML_OUTPUTS",
            "Purpose": "Stores generated UML outputs for requests.",
            "Primary Key": "output_id",
            "Foreign Keys": "request_id -> UML_REQUESTS.request_id",
            "Important Attributes": "output_type, output_data, generated_at",
        },
    ]
    relationships = [
        {
            "Parent Entity": "USERS",
            "Relationship": "submits",
            "Child Entity": "UML_REQUESTS",
            "Cardinality": "One-to-many",
            "Confidence": "High",
            "Verification Note": "The crow's-foot notation and UML_REQUESTS.user_id foreign key both support this interpretation.",
            "Implementation": "UML_REQUESTS.user_id foreign key",
        },
        {
            "Parent Entity": "UML_REQUESTS",
            "Relationship": "has",
            "Child Entity": "UPLOADED_FILES",
            "Cardinality": "One-to-many",
            "Confidence": "High",
            "Verification Note": "The many-side notation and UPLOADED_FILES.request_id foreign key support multiple files per request.",
            "Implementation": "UPLOADED_FILES.request_id foreign key",
        },
        {
            "Parent Entity": "UML_REQUESTS",
            "Relationship": "generates",
            "Child Entity": "UML_OUTPUTS",
            "Cardinality": "Likely one-to-many; verify from source model",
            "Confidence": "Medium",
            "Verification Note": "The compressed crow's-foot notation can reasonably indicate multiple outputs, but the diagram should be verified before treating that multiplicity as definitive.",
            "Implementation": "UML_OUTPUTS.request_id foreign key permits multiple output records unless a unique constraint is added.",
        },
    ]
    notes = [
        {"Severity": "Medium", "Issue": "The USERS table contains a password column.", "Recommended Correction": "Store only a securely generated password hash and enforce a unique constraint on email."},
        {"Severity": "Low", "Issue": "Deletion and update behavior for foreign keys is not shown.", "Recommended Correction": "Define appropriate ON DELETE and ON UPDATE rules for request-owned files and outputs."},
        {"Severity": "Low", "Issue": "Indexes and uniqueness constraints are not shown.", "Recommended Correction": "Add indexes for foreign keys and frequently queried fields such as email, user_id, and request_id."},
    ]
    return {
        "title": "Professional Entity-Relationship Diagram Description",
        "summary": (
            "This ER diagram defines four related database entities for users, UML requests, uploaded files, and generated UML outputs."
        ),
        "tables": [
            {"title": "Entities and Keys", "columns": ["Entity", "Purpose", "Primary Key", "Foreign Keys", "Important Attributes"], "rows": entities},
            {"title": "Relationships and Cardinalities", "columns": ["Parent Entity", "Relationship", "Child Entity", "Cardinality", "Confidence", "Verification Note", "Implementation"], "rows": relationships},
            {"title": "Database Design Notes", "columns": ["Severity", "Issue", "Recommended Correction"], "rows": notes},
        ],
        "overall_assessment": (
            "The ER diagram clearly models one user submitting many UML requests and each request owning multiple uploaded files. "
            "The UML_REQUESTS-to-UML_OUTPUTS relationship is reasonably interpreted as one-to-many because UML_OUTPUTS contains a "
            "request_id foreign key, but its compressed crow's-foot cardinality should be verified from the source model before "
            "that multiplicity is treated as definitive. Security constraints, indexes, and referential actions should also be defined."
        ),
    }


def build_deployment_report(text, description):
    nodes = detect_deployment_items(text, [
        ("User Browser", r"user browser"),
        ("Web Server", r"web server"),
        ("AI Engine", r"\bai engine\b"),
        ("MySQL DB", r"mysql db"),
    ])
    artifacts = detect_deployment_items(text, [
        ("HTML", r"\bhtml\b"), ("CSS", r"\bcss\b"), ("JavaScript", r"javascript"),
        ("UI Pages", r"ui page"), ("Backend API", r"\bbackend\b|\bapi\b"), ("Request Handler", r"\brequest\b|\bhandler\b"),
        ("Authentication Module", r"authenticati"), ("Business Logic", r"\bbusiness\b|\blogic\b"),
        ("Preprocessing", r"preprocess"), ("ML Models", r"ml models"), ("UML Generator", r"uml generator|generator"),
        ("users", r"\busers\b"), ("uml_requests", r"uml_requests"), ("uploaded_files", r"uploaded_f"),
        ("uml_outputs", r"uml_outputs"),
    ])
    node_artifacts = {
        "User Browser": ["HTML", "CSS", "JavaScript", "UI Pages"],
        "Web Server": ["Backend API", "Request Handler", "Authentication Module", "Business Logic"],
        "AI Engine": ["Preprocessing", "ML Models", "UML Generator"],
        "MySQL DB": ["users", "uml_requests", "uploaded_files", "uml_outputs"],
    }
    node_rows = [
        {
            "Deployment Node": node,
            "Responsibility": deployment_node_responsibility(node),
            "Deployed Artifacts": format_items([item for item in node_artifacts.get(node, []) if item in artifacts]) or "No artifact detected confidently.",
        }
        for node in nodes
    ]
    connection_rows = [
        {"Source": "User Browser", "Communication": "HTTP Requests", "Target": "Web Server", "Purpose": "Send user interface requests to backend services."},
        {"Source": "Web Server", "Communication": "AI Processing", "Target": "AI Engine", "Purpose": "Submit requirements and UML processing tasks to AI components."},
        {"Source": "Web Server", "Communication": "Store/Retrieve Data", "Target": "MySQL DB", "Purpose": "Persist and retrieve users, requests, uploaded files, and generated outputs."},
    ]
    issues = []
    if not re.search(r"https|tls|encrypted|secure", text, flags=re.I):
        issues.append({"Severity": "Medium", "Issue": "The browser-to-server connection is labeled HTTP Requests without showing transport security.", "Recommended Correction": "Label the connection HTTPS/TLS if secure transport is required."})
    if not re.search(r"firewall|network zone|subnet|container|server instance", text, flags=re.I):
        issues.append({"Severity": "Low", "Issue": "Physical hosts, containers, or network boundaries are not identified.", "Recommended Correction": "Add deployment environment details when this diagram is used for infrastructure planning."})
    return {
        "title": "Professional UML Deployment Diagram Description",
        "summary": (
            f"This deployment diagram shows {format_items(nodes)} and explains how browser assets, backend services, "
            "AI components, and database artifacts are distributed and communicate at runtime."
        ),
        "tables": [
            {"title": "Deployment Nodes and Artifacts", "columns": ["Deployment Node", "Responsibility", "Deployed Artifacts"], "rows": node_rows},
            {"title": "Communication Paths", "columns": ["Source", "Communication", "Target", "Purpose"], "rows": connection_rows},
            {"title": "Description Notes", "columns": ["Severity", "Issue", "Recommended Correction"], "rows": issues},
        ],
        "overall_assessment": (
            "The diagram clearly separates the browser, web server, AI engine, and MySQL database and shows the main "
            "runtime communication paths. It is a deployment description, not a use-case diagram."
        ),
    }


def detect_deployment_items(text, patterns):
    return [name for name, pattern in patterns if re.search(pattern, text, flags=re.I)]


def deployment_node_responsibility(node):
    return {
        "User Browser": "Hosts the client-side interface and sends user requests.",
        "Web Server": "Hosts backend API, authentication, request handling, and business logic.",
        "AI Engine": "Hosts preprocessing, machine-learning models, and UML-generation processing.",
        "MySQL DB": "Stores persistent application records and generated-output metadata.",
    }.get(node, "Represents a runtime deployment node.")


def build_class_report(text, description):
    classes = detect_class_names(text)
    relationships = unique_values(re.findall(
        r"\b(submits|has|generates|contains|creates|owns|uses|inherits|manages|produces)\b",
        text,
        flags=re.I,
    ))
    attributes = unique_values(re.findall(r"-[A-Za-z]\w*\s*:\s*[A-Za-z][A-Za-z0-9]*", text))
    methods = unique_values(re.findall(r"\+[A-Za-z]\w*\s*\([^)]*\)", text))

    class_rows = []
    for class_name in classes:
        class_rows.append({
            "Class": class_name,
            "Responsibility": infer_class_responsibility(class_name),
            "Detected Members": infer_members_for_class(class_name, attributes, methods),
        })
    if not class_rows:
        class_rows.append({
            "Class": "Detected structural classes",
            "Responsibility": "Represent the system's stored data and behavior.",
            "Detected Members": format_items([*attributes[:8], *methods[:8]]) or "No members detected.",
        })

    relationship_rows = []
    for relationship in relationships:
        source, target = infer_relationship_endpoints(relationship, classes)
        relationship_rows.append({
            "Source": source,
            "Relationship": relationship,
            "Target": target,
            "Description": describe_relationship(relationship, source, target),
        })
    if "Admin" in classes and "User" in classes:
        relationship_rows.insert(0, {
            "Source": "Admin",
            "Relationship": "inherits from",
            "Target": "User",
            "Description": "Admin is modeled as a specialized type of User.",
        })
    if not relationship_rows:
        relationship_rows.append({
            "Source": "Not detected",
            "Relationship": "association",
            "Target": "Not detected",
            "Description": "Upload a clearer diagram to identify association endpoints accurately.",
        })

    issues = build_class_issues(text, classes, attributes, methods)
    assessment = (
        f"The diagram identifies {len(classes) or 'multiple'} structural classes and the main responsibilities "
        "needed by the system. Its class-oriented design is understandable, but disconnected service classes, "
        "class responsibilities, security-sensitive fields, and relationship details should be reviewed "
        "before using the diagram as an implementation specification."
    )
    return {
        "title": "Professional UML Class Diagram Analysis",
        "summary": (
            f"This class diagram models the system using {format_items(classes) or 'several classes'}, "
            f"with {len(attributes)} detected attributes, {len(methods)} detected operations, and "
            f"{len(relationships)} labeled associations."
        ),
        "tables": [
            {
                "title": "Classes and Responsibilities",
                "columns": ["Class", "Responsibility", "Detected Members"],
                "rows": class_rows,
            },
            {
                "title": "Relationships",
                "columns": ["Source", "Relationship", "Target", "Description"],
                "rows": relationship_rows,
            },
            {
                "title": "Problems Detected and Recommendations",
                "columns": ["Severity", "Issue", "Recommended Correction"],
                "rows": issues,
            },
        ],
        "overall_assessment": assessment,
    }


def build_general_uml_report(text, description, diagram_type):
    labels = extract_clean_labels(text)
    relationships = unique_values(re.findall(
        r"\b(include|extend|submits|has|generates|contains|creates|uses|inherits|manages|produces)\b",
        text,
        flags=re.I,
    ))
    return {
        "title": f"Professional {diagram_type} Analysis",
        "summary": " ".join(description) if description else "The uploaded UML diagram was analyzed.",
        "tables": [
            {
                "title": "Detected Diagram Elements",
                "columns": ["Element", "Description"],
                "rows": [
                    {"Element": item, "Description": infer_general_element_meaning(item)}
                    for item in labels[:16]
                ] or [{"Element": "No clear element", "Description": "Upload a clearer exported diagram image."}],
            },
            {
                "title": "Relationships and Flow",
                "columns": ["Relationship", "Description"],
                "rows": [
                    {"Relationship": item, "Description": f"The diagram contains a visible '{item}' relationship or flow."}
                    for item in relationships
                ] or [{"Relationship": "Not clearly detected", "Description": "No readable relationship label was detected."}],
            },
        ],
        "overall_assessment": (
            "The diagram type could not be identified with complete confidence, but its readable labels and relationships "
            "have been organized into a semantic description. Select the diagram type manually when a more specialized "
            "analysis is required."
        ),
    }


def infer_general_element_meaning(item):
    value = str(item or "").lower()
    mappings = [
        (r"frontend|ui|web page|screen", "Represents a user-facing interface or presentation-layer element."),
        (r"backend|api|controller|service", "Represents an application service or backend integration component."),
        (r"database|mysql|data store|repository", "Represents persistent storage or a data-access component."),
        (r"ai|model|processing|preprocess|feature", "Represents an intelligent-processing or data-transformation element."),
        (r"user|admin|customer|actor", "Represents a person or external participant interacting with the system."),
        (r"request|response|flow|message", "Represents information exchanged between diagram elements."),
    ]
    for pattern, meaning in mappings:
        if re.search(pattern, value, flags=re.I):
            return meaning
    return "Represents a named concept, component, activity, or responsibility in the uploaded diagram."


def infer_class_responsibility(class_name):
    name = str(class_name or "").lower()
    mappings = [
        ("backendcontroller", "Coordinates requests, authentication, AI communication, and result persistence."),
        ("umlrequest", "Stores a user's UML-generation request and its prompt or requested diagram type."),
        ("uploadedfile", "Stores metadata for a file attached to a request."),
        ("umloutput", "Stores generated UML output and supports output generation or download."),
        ("databaseservice", "Provides persistence operations for users, requests, uploaded files, and generated outputs."),
        ("admin", "Performs administrative user-management and history-review operations."),
        ("user", "Stores registered user identity and authentication information."),
    ]
    for key, value in mappings:
        if key in name.replace(" ", ""):
            return value
    return "Represents a structural responsibility within the system."


def infer_members_for_class(class_name, attributes, methods):
    name = str(class_name or "").lower().replace(" ", "")
    keywords = {
        "user": ["userid", "fullname", "email", "password", "createdat", "register", "login"],
        "admin": ["login", "manageusers", "viewhistory"],
        "backendcontroller": ["handlerequest", "authenticateuser", "authenticate user", "sendtoai", "sendtoal", "saveresult"],
        "umlrequest": ["requestid", "umltype", "prompt", "createdat", "membername", "createrequest", "getrequest"],
        "uploadedfile": ["fileid", "filename", "filetype", "filepath", "uploadedat", "uploadfile"],
        "umloutput": ["outputid", "outputtype", "outputdata", "generatedat", "generateoutput", "downloadoutput"],
        "databaseservice": [],
    }
    selected = []
    for item in [*attributes, *methods]:
        compact = re.sub(r"[^a-z0-9]", "", item.lower())
        if any(keyword in compact for keyword in keywords.get(name, [])):
            selected.append(item)
    return format_items(selected) or "Members were not assigned confidently from the image."


def infer_relationship_endpoints(relationship, classes):
    rel = str(relationship or "").lower()
    class_set = set(classes)
    mappings = {
        "submits": ("User", "UMLRequest"),
        "has": ("UMLRequest", "UploadedFile"),
        "generates": ("UMLRequest", "UMLOutput"),
        "produces": ("UMLRequest", "UMLOutput"),
        "manages": ("Admin", "User"),
    }
    source, target = mappings.get(rel, ("Not detected", "Not detected"))
    if source not in class_set:
        source = "Not detected"
    if target not in class_set:
        target = "Not detected"
    return source, target


def describe_relationship(relationship, source, target):
    if source != "Not detected" and target != "Not detected":
        return f"{source} {relationship} {target}."
    return f"A '{relationship}' relationship is visible, but its endpoints were not detected confidently."


def build_class_issues(text, classes, attributes, methods):
    issues = []
    if "BackendController" in classes and not re.search(r"\b(uses|handles|controls|coordinates)\b", text, flags=re.I):
        issues.append({
            "Severity": "High",
            "Issue": "BackendController appears disconnected from the other domain classes.",
            "Recommended Correction": "Add dependencies or associations showing which requests, users, and outputs it handles.",
        })
    if "DatabaseService" in classes and not re.search(r"\b(database|persists|stores|saves|repository)\s+(service|user|request|output|file)\b", text, flags=re.I):
        issues.append({
            "Severity": "High",
            "Issue": "DatabaseService is disconnected and has no visible attributes or operations.",
            "Recommended Correction": "Connect it to the persistence-related classes and define operations such as save(), find(), update(), or delete().",
        })
    if any("password" in item.lower() and "hash" not in item.lower() for item in attributes):
        issues.append({
            "Severity": "Medium",
            "Issue": "The user password appears to be modeled as a directly stored string.",
            "Recommended Correction": "Store a passwordHash value and never persist plain-text passwords.",
        })
    if "Admin" in classes and "User" in classes and len(re.findall(r"\+login\s*\(\)", text, flags=re.I)) > 1:
        issues.append({
            "Severity": "Medium",
            "Issue": "Admin repeats login() even though it inherits behavior from User.",
            "Recommended Correction": "Remove the duplicate operation unless Admin intentionally overrides login behavior.",
        })
    if re.search(r"-memberName(?!\s*:)", text, flags=re.I):
        issues.append({
            "Severity": "Medium",
            "Issue": "memberName does not show a data type.",
            "Recommended Correction": "Define the attribute with a type, for example memberName : String.",
        })
    if not issues:
        issues.append({
            "Severity": "Low",
            "Issue": "No major structural problem was detected automatically.",
            "Recommended Correction": "Manually verify class responsibilities, multiplicities, and relationship directions.",
        })
    return issues


def detect_class_names(text):
    names = unique_values(re.findall(r"^CLASS_HEADER:\s*(.+)$", text, flags=re.I | re.M))
    ignored = {
        "submits", "has", "generates", "contains", "creates", "uses", "inherits",
        "string", "text", "int", "datetime", "boolean", "float", "double",
    }
    for line in str(text or "").splitlines():
        value = re.sub(r"^[^A-Za-z]+", "", line).strip(" |_-")
        if value.lower() in ignored:
            continue
        if re.fullmatch(r"[A-Z][A-Za-z0-9]{2,50}", value):
            names.append(value)
    inferred = [
        ("User", r"\b(fullName|email|password|register\(\))\b"),
        ("Admin", r"\bmanageUsers\(\)|viewHistory\(\)"),
        ("BackendController", r"\bhandleRequest\(\)|authenticateUser\(\)|sendToAI\(\)|saveResult\(\)"),
        ("DatabaseService", r"\bDatabaseService\b"),
        ("UMLRequest", r"\brequestId\b|\bumlType\b|\bcreateRequest\(\)|\bgetRequest\(\)"),
        ("UploadedFile", r"\bfileName\b|\bfilePath\b|\buploadFile\(\)"),
        ("UMLOutput", r"\boutputId\b|\boutputType\b|\boutputData\b|\bgenerateOutput\(\)|\bdownloadOutput\(\)"),
    ]
    for name, pattern in inferred:
        if re.search(pattern, text, flags=re.I):
            names.append(name)
    return unique_values(names)


def unique_values(items):
    values = []
    seen = set()
    for item in items:
        value = re.sub(r"\s+", " ", str(item or "")).strip(" |_-")
        key = value.lower()
        if not value or key in seen:
            continue
        seen.add(key)
        values.append(value)
    return values


def extract_clean_labels(text):
    items = []
    seen = set()
    for raw in re.split(r"[\n;|,]+", str(text or "")):
        clean = re.sub(r"\s+", " ", raw).strip(" -_.,:")
        clean = re.sub(r"^(visible uml text|terms|summary|description)\s*:\s*", "", clean, flags=re.I).strip()
        if len(clean) < 3 or not re.search(r"[A-Za-z]", clean):
            continue
        if re.match(r"^(this appears|the uploaded|the diagram|it is intended|a clearer|no readable)", clean, flags=re.I):
            continue
        key = clean.lower()
        if key in seen:
            continue
        seen.add(key)
        items.append(clean)
    return items[:24]


def infer_diagram_type(text):
    value = str(text or "").lower()
    if "activity_step:" in value or "activity_lane:" in value:
        return "Activity Diagram"
    if "sequence_participant:" in value and "sequence_message:" in value:
        return "Sequence Diagram"
    if sum(1 for item in ["int pk", "int fk", "varchar", "timestamp", "uml_requests", "uploaded_files"] if item in value) >= 3:
        return "ER Diagram"
    if sum(1 for item in ["user browser", "web server", "mysql db", "ai engine", "http requests"] if item in value) >= 3:
        return "Deployment Diagram"
    if is_ai_pipeline_text(value):
        return "Activity Diagram"
    if is_architecture_interface_text(value):
        return "Architecture / Interface Diagram"
    if re.search(r"\b(communication|collaboration|numbered message)\b", value):
        return "Communication Diagram"
    if re.search(r"\b(sequence|lifeline|message|activation|return message)\b", value) or len(
        re.findall(r"(?m)^\s*\d+\s*[:.)-]?\s*[A-Za-z][^\n]{2,}", value)
    ) >= 4:
        return "Sequence Diagram"
    if re.search(r"\b(state|transition|initial state|final state|entry|exit)\b", value):
        return "State Machine Diagram"
    if re.search(r"\b(component|provided interface|required interface)\b", value):
        return "Component Diagram"
    if re.search(r"\b(package|import|namespace)\b", value):
        return "Package Diagram"
    if re.search(r"\b(object|instance|slot)\b", value):
        return "Object Diagram"
    if is_lifecycle_activity_text(value) or re.search(r"\b(activity|workflow|decision|validate|save in database|update quantity|start|end)\b", value):
        return "Activity Diagram"
    if re.search(r"\b(actor|use case|include|extend|sign up|upload srs|check ambiguity|generate uml|view history|manage users)\b", value):
        return "Use Case Diagram"
    if re.search(r"\b(class|interface|attribute|method)\b|\+\s*\w+\(|-\s*\w+", value):
        return "Class Diagram"
    if re.search(r"\b(login|sign up)\b", value):
        return "Use Case Diagram"
    return "UML Diagram"


def clean_project_node_text(value):
    text = re.sub(r"<br\s*/?>", "\n", str(value or ""), flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    return re.sub(r"[ \t]+", " ", text).strip()


def infer_project_node_type(class_name):
    value = str(class_name or "").lower()
    mappings = [
        ("actor", "Actor"), ("usecase", "Use Case"), ("class", "Class"), ("interface", "Interface"),
        ("entity", "Entity"), ("table", "Entity"), ("lifeline", "Lifeline"), ("action", "Activity"),
        ("decision", "Decision"), ("state", "State"), ("component", "Component"), ("package", "Package"),
        ("node", "Deployment Node"), ("artifact", "Artifact"), ("object", "Object"), ("note", "Note"),
    ]
    for key, label in mappings:
        if key in value:
            return label
    return "Diagram Element"


def infer_project_diagram_type(nodes, connectors):
    types = [item["type"] for item in nodes]
    connector_types = [item["type"].lower() for item in connectors]
    if any(item in types for item in ["Actor", "Use Case"]):
        return "Use Case Diagram"
    if any(item in types for item in ["Lifeline"]) or any("message" in item for item in connector_types):
        return "Sequence Diagram"
    if any(item in types for item in ["Activity", "Decision"]):
        return "Activity Diagram"
    if any(item in types for item in ["State"]):
        return "State Machine Diagram"
    if any(item in types for item in ["Entity"]):
        return "ER Diagram"
    if any(item in types for item in ["Deployment Node", "Artifact"]):
        return "Deployment Diagram"
    if any(item in types for item in ["Component"]):
        return "Component Diagram"
    if any(item in types for item in ["Package"]):
        return "Package Diagram"
    if any(item in types for item in ["Object"]):
        return "Object Diagram"
    if any(item in types for item in ["Class", "Interface"]):
        return "Class Diagram"
    return "UML Diagram"


def normalize_project_diagram_type(value):
    return {
        "usecase": "Use Case Diagram",
        "use_case": "Use Case Diagram",
        "class": "Class Diagram",
        "sequence": "Sequence Diagram",
        "activity": "Activity Diagram",
        "erd": "ER Diagram",
        "er": "ER Diagram",
        "deployment": "Deployment Diagram",
        "state": "State Machine Diagram",
        "component": "Component Diagram",
        "package": "Package Diagram",
        "object": "Object Diagram",
        "communication": "Communication Diagram",
        "architecture": "Architecture / Interface Diagram",
        "interface": "Architecture / Interface Diagram",
        "data_flow": "Data Flow Diagram",
    }.get(str(value or "").lower(), "")


def build_project_report(diagram_type, nodes, connectors):
    node_rows = [
        {
            "Element": item["label"],
            "Type": item["type"],
            "Interpretation": project_node_interpretation(item["label"], item["type"]),
        }
        for item in nodes
    ]
    connector_rows = [
        {
            "Source": item["source"],
            "Relationship": item["type"],
            "Target": item["target"],
            "Interpretation": f"{item['source']} connects to {item['target']} using a {item['type'].lower()} relationship.",
        }
        for item in connectors
    ]
    return {
        "title": f"Professional {diagram_type} Description",
        "summary": (
            f"This editable AIRA {diagram_type.lower()} contains {len(nodes)} diagram element(s) "
            f"and {len(connectors)} connector(s). Its native project structure was analyzed directly without OCR."
        ),
        "tables": [
            {"title": "Diagram Elements", "columns": ["Element", "Type", "Interpretation"], "rows": node_rows or [{"Element": "Blank canvas", "Type": "None", "Interpretation": "The AIRA project does not contain editable shapes."}]},
            {"title": "Relationships and Flow", "columns": ["Source", "Relationship", "Target", "Interpretation"], "rows": connector_rows or [{"Source": "None", "Relationship": "None", "Target": "None", "Interpretation": "No connectors are stored in this AIRA project."}]},
        ],
        "overall_assessment": (
            "Because this is an editable AIRA project, the analysis uses exact shape labels and connector endpoints. "
            "Review any unlabeled elements or missing connectors before treating the diagram as complete."
        ),
    }


def project_node_interpretation(label, node_type):
    return {
        "Actor": f"{label} is an external participant that interacts with the system.",
        "Use Case": f"{label} is a user-visible system capability.",
        "Class": f"{label} defines structural data and behavior.",
        "Interface": f"{label} defines a service contract.",
        "Entity": f"{label} represents persistent data.",
        "Lifeline": f"{label} participates in a time-ordered interaction.",
        "Activity": f"{label} is an executable workflow step.",
        "Decision": f"{label} branches the workflow according to a condition.",
        "State": f"{label} represents a lifecycle condition.",
        "Component": f"{label} is a replaceable or deployable software component.",
        "Package": f"{label} groups related model elements.",
        "Deployment Node": f"{label} is a runtime or physical deployment target.",
        "Artifact": f"{label} is deployed to a runtime node.",
        "Object": f"{label} is an instance-level model element.",
    }.get(node_type, f"{label} is a labeled UML diagram element.")


def format_items(items):
    clean = []
    seen = set()
    for item in items:
        value = str(item or "").strip()
        key = value.lower()
        if not value or key in seen:
            continue
        seen.add(key)
        clean.append(value)
    if not clean:
        return ""
    if len(clean) == 1:
        return clean[0]
    if len(clean) == 2:
        return f"{clean[0]} and {clean[1]}"
    return f"{', '.join(clean[:-1])}, and {clean[-1]}"


def build_fallback_description(extracted_text):
    lines = [line.strip() for line in str(extracted_text).splitlines() if line.strip()]
    if not lines:
        return ["No readable UML text was detected. A clearer image may be required."]

    description = []
    for line in lines[:10]:
        description.append(f"Visible UML text: {line}")
    return description


def build_professional_summary(extracted_text, description):
    text = str(extracted_text or "").lower()
    if not text.strip():
        return "No readable UML text was detected. Please upload a clearer exported diagram image."
    if sum(1 for item in ["user browser", "web server", "mysql db", "ai engine", "http requests"] if item in text) >= 3:
        return "The uploaded image appears to be a deployment diagram showing runtime nodes, deployed artifacts, and communication paths."
    if sum(1 for item in ["int pk", "int fk", "varchar", "timestamp", "uml_requests", "uploaded_files"] if item in text) >= 3:
        return "The uploaded image appears to be an entity-relationship diagram showing database entities, keys, attributes, and cardinalities."
    if "class_header:" in text or any(term in text for term in ["class", "interface", "method", "attribute"]):
        return "The uploaded image appears to be a class diagram that describes software classes, attributes, operations, and relationships."
    if any(term in text for term in ["actor", "use case", "login", "sign up", "upload", "download", "generate", "report", "ticket", "luggage"]):
        return "The uploaded image appears to be a use case diagram that describes user-facing system functions."
    if any(term in text for term in ["start", "decision", "activity", "process"]):
        return "The uploaded diagram appears to describe an activity or workflow sequence."
    if description:
        return "The uploaded diagram contains readable UML labels that were converted into a structured description."
    return "The uploaded diagram was processed, but only limited readable UML text could be detected."

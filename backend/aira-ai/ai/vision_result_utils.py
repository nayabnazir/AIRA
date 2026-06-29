import re


def build_diagram_prompt(requested_diagram_type):
    type_hint = str(requested_diagram_type or "").strip() or "Auto-detect from visual notation"
    return f"""
You are a careful technical-diagram analyst. Analyze only what is visibly supported by the image.
Never assume a UML type before inspecting shapes, connectors, labels, arrows, lanes, lifelines, and boundaries.

Requested type hint: {type_hint}

Supported categories include use case, activity/swimlane, sequence, class, ER/database,
deployment, component, state machine, architecture/interface, data-flow, flowchart, and other.

Return ONLY one JSON object with this exact structure:
{{
  "diagram_type": "specific detected type or Other",
  "confidence": 0.0,
  "summary": "factual description grounded in visible evidence",
  "actors": [{{"name": "...", "role": "..."}}],
  "elements": [{{"name": "...", "type": "...", "description": "..."}}],
  "relationships": [{{"source": "...", "target": "...", "type": "...", "label": "...", "description": "..."}}],
  "flow_steps": [{{"order": 1, "step": "...", "owner": "...", "condition": "..."}}],
  "uncertainties": ["..."]
}}

Rules:
- Preserve exact readable labels.
- Describe arrow direction and relationship semantics only when visible.
- Do not invent actors, classes, messages, cardinalities, branches, or connections.
- If text or a relationship is unreadable, put that limitation in uncertainties.
- Confidence must reflect both diagram-type certainty and readable-content certainty.
""".strip()


def normalize_vision_result(content):
    if not isinstance(content, dict):
        content = {}
    return {
        "diagram_type": clean_text(content.get("diagram_type")) or "Other / Technical Diagram",
        "confidence": clamp_confidence(content.get("confidence")),
        "summary": clean_text(content.get("summary")),
        "actors": normalize_objects(content.get("actors"), ("name", "role")),
        "elements": normalize_objects(content.get("elements"), ("name", "type", "description")),
        "relationships": normalize_objects(content.get("relationships"), ("source", "target", "type", "label", "description")),
        "flow_steps": normalize_objects(content.get("flow_steps"), ("order", "step", "owner", "condition")),
        "uncertainties": clean_list(content.get("uncertainties")),
    }


def normalize_objects(values, fields):
    result = []
    for value in values if isinstance(values, list) else []:
        if not isinstance(value, dict):
            continue
        item = {field: clean_text(value.get(field)) for field in fields}
        if any(item.values()):
            result.append(item)
    return result[:100]


def clean_list(values):
    return [clean_text(value) for value in values if clean_text(value)][:50] if isinstance(values, list) else []


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:1000]


def clamp_confidence(value):
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0

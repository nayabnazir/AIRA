import base64
import io
import re
from pathlib import Path

import joblib
from PIL import Image, ImageDraw, ImageFont

from ai.cloud_ai_provider import CloudAIError, cloud_ai_available, generate_json
from ai.uml_generation_service import generate_uml_from_text, normalize_diagram_type


BASE_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE_DIR / "models"
TYPE_MODEL_PATH = MODELS_DIR / "uml_diagram_type_pipeline.joblib"
RETRIEVER_PATH = MODELS_DIR / "uml_structure_retriever.joblib"

_type_model = None
_retriever = None


def load_type_model():
    global _type_model
    if _type_model is None and TYPE_MODEL_PATH.exists():
        _type_model = joblib.load(TYPE_MODEL_PATH)
    return _type_model


def load_retriever():
    global _retriever
    if _retriever is None and RETRIEVER_PATH.exists():
        _retriever = joblib.load(RETRIEVER_PATH)
    return _retriever


def generate_uml_image(text, diagram_type="auto", image_path=None):
    detected_type = predict_diagram_type(text, diagram_type)
    structure_hint = retrieve_structure_hint(text, detected_type)
    provider = "Local structured generator"
    diagram = None
    if cloud_ai_available():
        try:
            cloud_result, provider = generate_json(
                build_uml_generation_prompt(text, detected_type, has_image=bool(image_path)),
                image_path=image_path,
                timeout=120,
            )
            diagram = normalize_cloud_diagram(cloud_result, detected_type)
            if diagram and detected_type == "class" and class_relationships_are_sparse(diagram):
                repaired_result, repaired_provider = generate_json(
                    build_class_relationship_repair_prompt(text, diagram)
                )
                repaired = normalize_cloud_diagram(repaired_result, detected_type)
                if repaired and not class_relationships_are_sparse(repaired):
                    diagram = repaired
                    provider = repaired_provider
        except CloudAIError:
            diagram = None
    if not diagram and image_path and not str(text or "").strip():
        raise CloudAIError("Diagram image generation needs Gemini/OpenRouter. Please check your API key or add a short text description with the image.")
    if not diagram:
        diagram = generate_uml_from_text(text, detected_type)
    if detected_type == "class":
        diagram = ensure_class_relationships(diagram)
    diagram["plantuml"] = apply_professional_plantuml_theme(diagram.get("plantuml"), detected_type)
    png_bytes = render_diagram_png(diagram, text)
    image_base64 = base64.b64encode(png_bytes).decode("ascii")
    return {
        "diagram_type": detected_type,
        "diagram": diagram,
        "mime_type": "image/png",
        "image_base64": image_base64,
        "image_data_url": f"data:image/png;base64,{image_base64}",
        "matched_pattern_score": structure_hint.get("score", 0.0) if structure_hint else 0.0,
        "provider": provider,
    }


def build_uml_generation_prompt(text, diagram_type, has_image=False):
    image_instruction = """
An input diagram image is attached. First read the attached diagram visually:
- identify its type, actors/classes/entities/lifelines/actions, labels, and relationships;
- convert it into a clean professional UML diagram of the selected type;
- preserve the real meaning of the attached diagram instead of producing generic sample content.
If both text and image are provided, combine them and prefer concrete labels visible in the image.
""" if has_image else ""

    return f"""
You are a senior UML architect. Create a professional, accurate {diagram_type.replace('_', ' ')} diagram
strictly from the supplied system description. Do not invent unrelated actors, entities, messages, or features.
{image_instruction}

Return ONLY one JSON object containing:
diagram_type, plantuml, actors, use_cases, links, classes, class_details,
entities, entity_details, messages, actions, and relationships. Use empty arrays
when a field does not apply.

Structured field rules:
- links: objects with actor, use_case, and optional relationship_type.
- class_details: objects with name, attributes, and methods.
- entity_details: objects with name and attributes.
- messages: chronological objects with from, to, action, and optional message_type.
- actions: concise action labels in workflow order.
- relationships: objects with from, to, type, label, and optional multiplicity_from
  and multiplicity_to.

PlantUML quality rules:
- Produce complete valid PlantUML beginning with @startuml and ending with @enduml.
- Generate the selected diagram type exactly. Never answer with a different UML type.
- The PlantUML must be complete enough to render as the primary deliverable, not a sketch or metadata sample.
- Model every clearly supported actor, action, class, entity, participant, message, and relationship from the input.
- Do not connect unrelated elements and do not leave clearly related elements disconnected.
- Use standard UML notation, readable aliases, exact labels, and meaningful connectors.
- Show arrow directions, relationship labels, multiplicities, and decisions only when supported.
- Use a clear system boundary for use-case diagrams.
- Use standard actor symbols and oval use cases for use-case diagrams.
- For use-case diagrams, do not draw repeated <<include>> arrows from every use case to Login or Authenticate User. If authentication is relevant, show Login/Authenticate User as one normal use case connected to the relevant actors, or use at most two include arrows.
- Keep use-case diagrams readable with left-to-right actor associations and minimal crossing connectors.
- Use compartments, visibility markers, typed attributes, methods, and supported
  association/generalization/composition notation for class diagrams.
- For class diagrams, connect every class whose attributes, responsibilities, or workflow
  clearly reference another class. A diagram with many classes and only one relationship is incomplete.
- Use lifelines, activation bars, chronological messages, return messages, and
  alt/loop blocks only where supported for sequence diagrams.
- Use start/end nodes, actions, guarded decisions, merges, forks, joins, and
  swimlanes only where supported for activity diagrams.
- Use entities, keys, attributes, labeled relationships, and supported cardinalities
  for ER diagrams.
- Keep the layout balanced and avoid unnecessary connector crossings.
- Never return placeholder nodes such as User, System, Record, Report, or Use System
  unless those concepts are explicitly supported by the supplied description.
- Before returning, check the PlantUML for valid aliases, balanced blocks, complete arrows,
  readable labels, and a coherent left-to-right or top-to-bottom flow.

SYSTEM DESCRIPTION:
{str(text or '').strip()[:50000]}
""".strip()


def build_class_relationship_repair_prompt(text, diagram):
    return f"""
You are repairing an incomplete UML class diagram. Return ONLY one JSON object with the same
fields as the supplied JSON. Preserve all valid classes, attributes, and methods, but repair the
relationships and PlantUML.

Rules:
- Infer associations from foreign-key-like attributes such as member_id, book_id, userId, and requestId.
- Infer supported associations from responsibilities and system workflow.
- Use association, aggregation, composition, dependency, or inheritance only when justified.
- Add readable labels and multiplicities where supported.
- Do not invent unrelated classes.
- Ensure clearly related domain classes are not left disconnected.
- Return complete PlantUML from @startuml through @enduml.

SYSTEM DESCRIPTION:
{str(text or '').strip()[:30000]}

INCOMPLETE DIAGRAM JSON:
{diagram}
""".strip()


def class_relationships_are_sparse(diagram):
    classes = diagram.get("class_details") or diagram.get("classes") or diagram.get("elements") or []
    if len(classes) < 3:
        return False
    relationships = diagram.get("relationships") or []
    plantuml = str(diagram.get("plantuml") or "")
    connector_lines = [
        line for line in plantuml.splitlines()
        if re.search(r"(?:--|<\||\|>|o--|\*--|\.\.>|<\.\.)", line)
        and not line.lstrip().startswith("skinparam")
    ]
    relationship_count = max(len(relationships), len(connector_lines))
    return relationship_count < max(2, len(classes) // 2)


def ensure_class_relationships(diagram):
    if not isinstance(diagram, dict):
        return diagram
    details = diagram.get("class_details") or diagram.get("classes") or diagram.get("elements") or []
    details = [
        item for item in details
        if isinstance(item, dict) and (item.get("attributes") is not None or item.get("methods") is not None)
    ]
    names = [str(item.get("name") or "").strip() for item in details if isinstance(item, dict)]
    names = [name for name in names if name]
    if len(names) < 2:
        return diagram

    relationships = list(diagram.get("relationships") or [])
    existing_pairs = {
        tuple(sorted((str(item.get("from") or "").lower(), str(item.get("to") or "").lower())))
        for item in relationships if isinstance(item, dict)
    }
    normalized_names = {normalize_class_reference(name): name for name in names}

    for item in details:
        source = str(item.get("name") or "").strip()
        if not source:
            continue
        for attribute in item.get("attributes") or []:
            reference = attribute_reference(attribute)
            target = normalized_names.get(reference)
            if not target or target == source:
                continue
            pair = tuple(sorted((source.lower(), target.lower())))
            if pair in existing_pairs:
                continue
            relationships.append({
                "from": target,
                "to": source,
                "type": "association",
                "label": f"has {source}",
                "multiplicity_from": "1",
                "multiplicity_to": "0..*",
            })
            existing_pairs.add(pair)

    if relationships:
        diagram["relationships"] = relationships
        diagram["plantuml"] = add_relationships_to_plantuml(diagram.get("plantuml"), relationships)
    return diagram


def normalize_class_reference(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def attribute_reference(attribute):
    value = str(attribute or "").strip()
    value = re.sub(r"^[+\-#~]\s*", "", value)
    name = re.split(r"\s*:\s*|\s+", value, maxsplit=1)[0]
    name = re.sub(r"(?:_id|Id|ID)$", "", name)
    return normalize_class_reference(name)


def add_relationships_to_plantuml(source, relationships):
    plantuml = str(source or "").strip()
    if not plantuml.startswith("@startuml") or "@enduml" not in plantuml:
        return plantuml
    additions = []
    for item in relationships:
        source_name = str(item.get("from") or "").strip()
        target_name = str(item.get("to") or "").strip()
        if not source_name or not target_name:
            continue
        if relationship_already_in_source(plantuml, source_name, target_name):
            continue
        left = str(item.get("multiplicity_from") or "").strip()
        right = str(item.get("multiplicity_to") or "").strip()
        label = str(item.get("label") or "").strip()
        connector = relationship_connector(item.get("type"))
        line = plantuml_reference(source_name)
        if left:
            line += f' "{left}"'
        line += f" {connector}"
        if right:
            line += f' "{right}"'
        line += f" {plantuml_reference(target_name)}"
        if label:
            line += f" : {label}"
        additions.append(line)
    if not additions:
        return plantuml
    return plantuml.replace("@enduml", "\n".join(additions) + "\n@enduml", 1)


def plantuml_reference(name):
    value = str(name or "").strip()
    if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", value):
        return value
    return f'"{value.replace(chr(34), chr(92) + chr(34))}"'


def relationship_already_in_source(source, first, second):
    for line in str(source or "").splitlines():
        lowered = line.lower()
        if first.lower() in lowered and second.lower() in lowered and re.search(r"--|\.\.", line):
            return True
    return False


def relationship_connector(kind):
    value = str(kind or "association").lower()
    if "inherit" in value or "general" in value:
        return "--|>"
    if "composition" in value:
        return "*--"
    if "aggregation" in value:
        return "o--"
    if "dependency" in value:
        return "..>"
    return "-->"


def apply_professional_plantuml_theme(source, diagram_type):
    plantuml = str(source or "").strip()
    if not plantuml.startswith("@startuml") or "@enduml" not in plantuml:
        return plantuml

    diagram_type = normalize_diagram_type(diagram_type)
    plantuml = sanitize_professional_plantuml_source(plantuml, diagram_type)
    layout = "left to right direction" if diagram_type in {"use_case", "class", "erd"} else ""
    theme = f"""
' AIRA professional UML rendering defaults
{layout}
skinparam backgroundColor #FFFFFF
skinparam shadowing false
skinparam roundcorner 10
skinparam defaultFontName Arial
skinparam defaultFontSize 14
skinparam ArrowColor #235784
skinparam ArrowThickness 1.5
skinparam ActorBorderColor #235784
skinparam ActorFontColor #102A43
skinparam UsecaseBorderColor #235784
skinparam UsecaseBackgroundColor #F4F9FF
skinparam UsecaseFontColor #102A43
skinparam ClassBorderColor #235784
skinparam ClassBackgroundColor #F8FBFF
skinparam ClassHeaderBackgroundColor #DCEEFF
skinparam ClassFontColor #102A43
skinparam ActivityBorderColor #235784
skinparam ActivityBackgroundColor #F4F9FF
skinparam ActivityDiamondBackgroundColor #DCEEFF
skinparam ParticipantBorderColor #235784
skinparam ParticipantBackgroundColor #F4F9FF
skinparam SequenceLifeLineBorderColor #6B8299
skinparam EntityBorderColor #235784
skinparam EntityBackgroundColor #F8FBFF
""".strip()

    return plantuml.replace("@startuml", f"@startuml\n{theme}", 1)


def sanitize_professional_plantuml_source(source, diagram_type):
    lines = []
    include_count = 0
    for line in str(source or "").splitlines():
        lower = line.lower()
        if "handwritten" in lower:
            continue
        if diagram_type == "use_case" and "include" in lower:
            if re.search(r"\b(authenticate|authentication|login|log in)\b", lower):
                continue
            include_count += 1
            if include_count > 3:
                continue
        lines.append(line)
    cleaned = "\n".join(lines)
    if diagram_type == "use_case" and "@startuml" in cleaned and "skinparam linetype" not in cleaned.lower():
        cleaned = cleaned.replace("@startuml", "@startuml\nskinparam linetype ortho", 1)
    return cleaned


def normalize_cloud_diagram(value, diagram_type):
    if not isinstance(value, dict):
        return None
    diagram = value.get("diagram") if isinstance(value.get("diagram"), dict) else value
    plantuml = str(diagram.get("plantuml") or "").strip()
    if not plantuml.startswith("@startuml") or "@enduml" not in plantuml:
        return None
    # Provider labels vary (for example, "use_case_diagram"). The selected
    # detected type is already canonical and keeps the frontend renderer stable.
    diagram["diagram_type"] = normalize_diagram_type(diagram_type)
    for key in (
        "actors", "use_cases", "links", "classes", "class_details",
        "entities", "entity_details", "messages", "actions", "relationships",
    ):
        if not isinstance(diagram.get(key), list):
            diagram[key] = []
    return diagram


def predict_diagram_type(text, diagram_type="auto"):
    if diagram_type and str(diagram_type).lower() not in ["auto", "detect"]:
        return normalize_diagram_type(diagram_type)
    model = load_type_model()
    if model is None:
        return fallback_diagram_type(text)
    return normalize_diagram_type(model.predict([str(text)])[0])


def retrieve_structure_hint(text, diagram_type):
    retriever = load_retriever()
    if retriever is None:
        return {}
    query = retriever["vectorizer"].transform([str(text)])
    scores = (query @ retriever["matrix"].T).toarray()[0]
    ranked = scores.argsort()[::-1]
    for index in ranked:
        row = retriever["rows"][int(index)]
        if row["diagram_type"] == diagram_type:
            return {"score": float(scores[index]), **row}
    return {}


def fallback_diagram_type(text):
    lowered = str(text).lower()
    if any(term in lowered for term in ["database", "table", "entity", "primary key", "foreign key", "erd"]):
        return "erd"
    if any(term in lowered for term in ["class", "object", "attribute", "method", "inheritance"]):
        return "class"
    if any(term in lowered for term in ["sequence", "message", "lifeline", "step by step"]):
        return "sequence"
    if any(term in lowered for term in ["activity", "workflow", "decision", "process"]):
        return "activity"
    return "use_case"


def render_diagram_png(diagram, source_text):
    diagram_type = diagram["diagram_type"]
    fonts = load_fonts()
    if diagram_type == "use_case":
        image = draw_use_case_sample_style(diagram, source_text, fonts)
    elif diagram_type == "class":
        image = draw_class_sample_style(diagram, source_text, fonts)
    elif diagram_type == "sequence":
        image = draw_sequence_sample_style(source_text, fonts)
    elif diagram_type == "erd":
        image = draw_erd_sample_style(diagram, source_text, fonts)
    elif diagram_type == "activity":
        image = draw_activity_sample_style(source_text, fonts)
    else:
        image = Image.new("RGB", (1000, 560), "white")
        draw = ImageDraw.Draw(image)
        draw.text((40, 40), "Unsupported diagram type", fill="#111827", font=fonts["title"])
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def load_fonts():
    def font(size, bold=False, italic=False):
        names = ["arialbd.ttf" if bold else "arial.ttf", "Arial.ttf", "DejaVuSans.ttf"]
        if italic:
            names.insert(0, "ariali.ttf")
        for name in names:
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                continue
        return ImageFont.load_default()

    return {
        "title": font(22, bold=True),
        "heading": font(16, bold=True),
        "body": font(14),
        "small": font(11),
        "tiny": font(9),
        "italic": font(13, italic=True),
    }


def draw_use_case_sample_style(diagram, source_text, fonts):
    actors = extract_people(source_text) or (diagram.get("actors") or []) or ["User"]
    if len(actors) > 1 and "User" in actors:
        actors = [actor for actor in actors if actor != "User"]
    use_cases = extract_actions(source_text) or (diagram.get("use_cases") or []) or ["Use System"]
    actors = actors[:3]
    use_cases = use_cases[:7]
    width = 1180
    height = max(720, 220 + len(use_cases) * 82)
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    boundary = (420, 60, 850, height - 60)
    draw.rectangle(boundary, outline="#3f3f46", width=2)
    draw_center(draw, (boundary[0], 72, boundary[2], 102), infer_system_name(source_text), fonts["heading"], "#27272a")

    actor_slots = distribute(len(actors), 170, height - 220)
    for index, actor in enumerate(actors):
        x = 160 if index != 1 else 980
        y = actor_slots[index]
        draw_stick_actor(draw, x, y, actor, fonts, color="#262626" if index != 1 else "#9f5f58")

    case_slots = distribute(len(use_cases), 160, height - 165)
    case_boxes = []
    for use_case, y in zip(use_cases, case_slots):
        box = (500, y - 26, 760, y + 26)
        draw.ellipse(box, fill="#fff4ce", outline="#b8a26a", width=2)
        draw_center(draw, box, use_case, fonts["body"], "#27272a")
        case_boxes.append((use_case, box))

    for index, (_, box) in enumerate(case_boxes):
        actor = actors[index % len(actors)]
        actor_x = 160 if actors.index(actor) != 1 else 980
        actor_anchor = (actor_x + (45 if actor_x < boundary[0] else -45), actor_slots[actors.index(actor)] + 35)
        case_anchor = (box[0] if actor_x < boundary[0] else box[2], (box[1] + box[3]) // 2)
        draw.line((*actor_anchor, *case_anchor), fill="#44403c", width=2)

    if len(case_boxes) >= 2 and any(case.lower() in ["login", "log in", "sign in"] for case, _ in case_boxes):
        login_box = case_boxes[-1][1]
        for source_case, box in case_boxes[: min(3, len(case_boxes) - 1)]:
            draw_dashed_line(draw, (box[2], (box[1] + box[3]) // 2), (login_box[0], (login_box[1] + login_box[3]) // 2), "#71717a")
            mid = ((box[2] + login_box[0]) // 2, ((box[1] + box[3] + login_box[1] + login_box[3]) // 4) - 10)
            draw.text(mid, "<<include>>", fill="#27272a", font=fonts["small"])
    return image


def draw_class_sample_style(diagram, source_text, fonts):
    classes = unique(extract_domain_items(source_text) + (diagram.get("classes") or [])) or ["User", "Project", "Report"]
    classes = classes[:6]
    image = Image.new("RGB", (1180, 720), "#fbfbfb")
    draw = ImageDraw.Draw(image)
    draw_grid(draw, image.size, 18, "#e4e4e7")
    positions = layout_tree_positions(len(classes), 1180, 720)
    boxes = []
    for item, box in zip(classes, positions):
        draw_class_box(draw, box, item, fonts)
        boxes.append((item, box))
    labels = ["Manages", "Controls", "Assigns", "Uses", "Creates"]
    for index in range(1, len(boxes)):
        start = box_anchor(boxes[0][1], boxes[index][1])
        end = box_anchor(boxes[index][1], boxes[0][1])
        draw_orthogonal_arrow(draw, start, end, "#00a86b", width=3)
        mid = ((start[0] + end[0]) // 2, (start[1] + end[1]) // 2 - 18)
        draw.text(mid, labels[(index - 1) % len(labels)], fill="#111827", font=fonts["body"])
    return image


def draw_erd_sample_style(diagram, source_text, fonts):
    entities = unique(extract_domain_items(source_text) + (diagram.get("entities") or [])) or ["User", "Project", "Record", "Report"]
    entities = entities[:10]
    image = Image.new("RGB", (1120, 760), "white")
    draw = ImageDraw.Draw(image)
    positions = grid_positions(len(entities), 40, 45, 245, 160, 4)
    boxes = []
    for entity, box in zip(entities, positions):
        draw_erd_table(draw, box, entity, fonts)
        boxes.append((entity, box))
    for index in range(len(boxes) - 1):
        a = boxes[index][1]
        b = boxes[index + 1][1]
        start = box_anchor(a, b)
        end = box_anchor(b, a)
        draw_dashed_line(draw, start, end, "#27272a", width=2)
        draw_crow_foot(draw, end, start, "#27272a")
        draw_cardinality(draw, start, "||", fonts)
        draw_cardinality(draw, end, "o<", fonts)
    return image


def draw_sequence_sample_style(source_text, fonts):
    participants = unique(extract_people(source_text) + ["System", "Database"])[:7]
    actions = extract_actions(source_text)[:8] or ["Emergency call", "Operation", "Approach", "Request", "Response"]
    width = max(900, 140 + len(participants) * 130)
    height = max(520, 140 + len(actions) * 58)
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    xs = distribute(len(participants), 70, width - 70)
    for x, participant in zip(xs, participants):
        box = (x - 55, 28, x + 55, 52)
        draw.rectangle(box, outline="#1f2937", width=1)
        draw_center(draw, box, participant, fonts["tiny"], "#111827")
        draw_dashed_line(draw, (x, 52), (x, height - 45), "#a1a1aa", width=1)
        draw.rectangle((x - 5, 110, x + 5, height - 90), outline="#71717a", fill="#f8fafc")
    y = 88
    for index, action in enumerate(actions):
        left = xs[index % (len(xs) - 1)]
        right = xs[(index % (len(xs) - 1)) + 1]
        if index % 3 == 2:
            left, right = right, left
        draw_arrow(draw, (left, y), (right, y), "#111827", width=1)
        draw.text(((left + right) // 2 - 42, y - 17), shorten(action, 24), fill="#111827", font=fonts["tiny"])
        y += 55
    return image


def draw_activity_sample_style(source_text, fonts):
    people = extract_people(source_text)[:2] or ["User", "System"]
    if len(people) == 1:
        people.append("System")
    actions = extract_actions(source_text)[:8] or ["Show Ticket", "Verify Ticket", "Check Luggage", "Accept Luggage", "Issue Pass"]
    image = Image.new("RGB", (760, 760), "white")
    draw = ImageDraw.Draw(image)
    outer = (28, 22, 732, 728)
    draw.rounded_rectangle(outer, radius=34, outline="#111827", width=2)
    draw.line((28, 82, 732, 82), fill="#111827", width=2)
    draw.line((380, 22, 380, 728), fill="#111827", width=2)
    draw_center(draw, (28, 42, 380, 78), people[0], fonts["italic"], "#111827")
    draw_center(draw, (380, 42, 732, 78), people[1], fonts["italic"], "#111827")
    draw.ellipse((72, 104, 90, 122), fill="#111827")
    draw.ellipse((650, 676, 675, 701), outline="#111827", width=2)
    draw.ellipse((657, 683, 668, 694), fill="#111827")

    y_positions = [150, 230, 312, 392, 480, 568]
    boxes = []
    for index, action in enumerate(actions[:6]):
        lane_left = 72 if index in [0, 2, 4] else 445
        y = y_positions[index]
        if index in [1, 3]:
            diamond = [(lane_left + 90, y - 28), (lane_left + 145, y), (lane_left + 90, y + 28), (lane_left + 35, y)]
            draw.polygon(diamond, outline="#111827", fill="white")
            draw_center(draw, (lane_left + 42, y - 14, lane_left + 138, y + 14), "Decision", fonts["small"], "#111827")
            boxes.append((lane_left + 90, y, "decision"))
        else:
            box = (lane_left, y - 24, lane_left + 190, y + 24)
            draw.rounded_rectangle(box, radius=22, outline="#111827", width=2, fill="#ffffff")
            draw_center(draw, box, shorten(action, 25), fonts["small"], "#111827")
            boxes.append(((box[0] + box[2]) // 2, y, "action"))
    for index in range(len(boxes) - 1):
        start = (boxes[index][0], boxes[index][1] + 28)
        end = (boxes[index + 1][0], boxes[index + 1][1] - 28)
        draw_arrow(draw, start, end, "#111827", width=2)
        if boxes[index][2] == "decision":
            draw.text((min(start[0], end[0]) + 10, (start[1] + end[1]) // 2 - 18), "[Else]", fill="#111827", font=fonts["small"])
    return image


def draw_class_box(draw, box, name, fonts):
    x1, y1, x2, y2 = box
    attrs = infer_attributes(name)
    y2 = max(y2, y1 + 74 + len(attrs) * 28)
    box = (x1, y1, x2, y2)
    draw.rounded_rectangle(box, radius=14, outline="#00a86b", width=3, fill="#ccf3df")
    draw.line((x1, y1 + 52, x2, y1 + 52), fill="#00a86b", width=3)
    draw_center(draw, (x1, y1 + 8, x2, y1 + 44), name, fonts["heading"], "#17433a")
    y = y1 + 68
    for attr in attrs:
        draw.text((x1 + 18, y), f"o  {attr}", fill="#17433a", font=fonts["body"])
        y += 28


def draw_erd_table(draw, box, entity, fonts):
    x1, y1, x2, y2 = box
    header_h = 28
    key_col = 42
    draw.rectangle(box, outline="#3f3f46", width=2, fill="#ffffff")
    draw.rectangle((x1, y1, x2, y1 + header_h), outline="#3f3f46", fill="#d4d4d8")
    draw.text((x1 + 10, y1 + 7), table_name(entity), fill="#111827", font=fonts["small"])
    draw.line((x1 + key_col, y1 + header_h, x1 + key_col, y2), fill="#3f3f46", width=1)
    rows = [("PK", primary_key(entity)), ("", "name"), ("", "description"), ("FK1", "user_id")]
    row_y = y1 + header_h
    for label, value in rows:
        draw.line((x1, row_y, x2, row_y), fill="#a1a1aa", width=1)
        draw.text((x1 + 8, row_y + 8), label, fill="#111827", font=fonts["small"])
        draw.text((x1 + key_col + 8, row_y + 8), value, fill="#111827", font=fonts["small"])
        row_y += 28


def draw_stick_actor(draw, x, y, label, fonts, color="#111827"):
    draw.ellipse((x - 12, y, x + 12, y + 24), outline=color, width=2)
    draw.line((x, y + 24, x, y + 76), fill=color, width=2)
    draw.line((x - 35, y + 45, x + 35, y + 45), fill=color, width=2)
    draw.line((x, y + 76, x - 28, y + 116), fill=color, width=2)
    draw.line((x, y + 76, x + 28, y + 116), fill=color, width=2)
    draw_center(draw, (x - 70, y + 122, x + 70, y + 150), label, fonts["body"], color)


def draw_grid(draw, size, step, color):
    width, height = size
    for x in range(0, width, step):
        draw.line((x, 0, x, height), fill=color, width=1)
    for y in range(0, height, step):
        draw.line((0, y, width, y), fill=color, width=1)


def draw_center(draw, box, text, font, fill):
    text = shorten(text, 34)
    bbox = draw.textbbox((0, 0), text, font=font)
    x = box[0] + ((box[2] - box[0]) - (bbox[2] - bbox[0])) / 2
    y = box[1] + ((box[3] - box[1]) - (bbox[3] - bbox[1])) / 2
    draw.text((x, y), text, font=font, fill=fill)


def draw_arrow(draw, start, end, color, width=2):
    draw.line((*start, *end), fill=color, width=width)
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = max((dx * dx + dy * dy) ** 0.5, 1)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    size = 12
    points = [
        end,
        (end[0] - ux * size + px * size * 0.45, end[1] - uy * size + py * size * 0.45),
        (end[0] - ux * size - px * size * 0.45, end[1] - uy * size - py * size * 0.45),
    ]
    draw.polygon(points, fill=color)


def draw_orthogonal_arrow(draw, start, end, color, width=2):
    mid = (end[0], start[1])
    draw.line((*start, *mid), fill=color, width=width)
    draw_arrow(draw, mid, end, color, width=width)


def draw_dashed_line(draw, start, end, color, width=1, dash=8):
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = max((dx * dx + dy * dy) ** 0.5, 1)
    steps = int(length // dash)
    for i in range(0, steps, 2):
        a = i / steps
        b = min((i + 1) / steps, 1)
        draw.line((start[0] + dx * a, start[1] + dy * a, start[0] + dx * b, start[1] + dy * b), fill=color, width=width)


def draw_crow_foot(draw, point, source, color):
    dx = point[0] - source[0]
    dy = point[1] - source[1]
    length = max((dx * dx + dy * dy) ** 0.5, 1)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    base = (point[0] - ux * 18, point[1] - uy * 18)
    draw.line((*point, base[0] + px * 10, base[1] + py * 10), fill=color, width=2)
    draw.line((*point, *base), fill=color, width=2)
    draw.line((*point, base[0] - px * 10, base[1] - py * 10), fill=color, width=2)


def draw_cardinality(draw, point, label, fonts):
    draw.text((point[0] - 12, point[1] - 18), label, fill="#111827", font=fonts["small"])


def layout_tree_positions(count, width, height):
    boxes = []
    top_box = (width // 2 - 130, 70, width // 2 + 130, 220)
    boxes.append(top_box)
    lower = grid_positions(max(0, count - 1), 90, 360, 300, 210, 3)
    boxes.extend(lower)
    return boxes[:count]


def grid_positions(count, start_x, start_y, cell_w, cell_h, columns):
    positions = []
    for index in range(count):
        row = index // columns
        col = index % columns
        x = start_x + col * cell_w
        y = start_y + row * cell_h
        positions.append((x, y, x + 210, y + 132))
    return positions


def distribute(count, start, end):
    if count <= 1:
        return [(start + end) // 2]
    step = (end - start) / (count - 1)
    return [int(start + index * step) for index in range(count)]


def box_anchor(source, target):
    sx = (source[0] + source[2]) // 2
    sy = (source[1] + source[3]) // 2
    tx = (target[0] + target[2]) // 2
    ty = (target[1] + target[3]) // 2
    if abs(tx - sx) > abs(ty - sy):
        return (source[2] if tx > sx else source[0], sy)
    return (sx, source[3] if ty > sy else source[1])


def infer_system_name(text):
    lowered = str(text).lower()
    if "store" in lowered or "order" in lowered:
        return "Online Store"
    if "library" in lowered or "book" in lowered:
        return "Library System"
    if "health" in lowered or "patient" in lowered:
        return "Healthcare System"
    if "forecast" in lowered:
        return "Forecasting System"
    return "System"


def extract_people(text):
    people = []
    for actor in ["visitor", "admin", "student", "user", "customer", "patient", "doctor", "librarian", "analyst", "manager", "teacher", "seller", "employee", "ceo", "passenger"]:
        if re.search(rf"\b{re.escape(actor)}\b", str(text), flags=re.IGNORECASE):
            people.append(actor.title())
    return unique(people)


def extract_actions(text):
    actions = []
    patterns = [
        "place order", "cancel order", "manage order", "change order status", "update products",
        "log in", "sign up", "upload srs", "check ambiguity", "generate uml", "view history",
        "download output", "search books", "borrow books", "return books", "manage catalog",
        "book appointment", "verify ticket", "check luggage", "pay fee", "issue boarding pass",
        "send data", "store retrieve", "show ticket", "accept luggage", "upload files",
        "download reports", "generate reports", "train model", "view charts", "validate data",
    ]
    lowered = str(text).lower()
    for pattern in patterns:
        if pattern in lowered:
            actions.append(pattern.title())
    if actions:
        return unique(actions)
    parts = re.split(r"[.\n,;]+", str(text))
    return [shorten(part.strip().title(), 32) for part in parts if len(part.strip()) > 3][:8]


def extract_domain_items(text):
    items = []
    candidates = [
        "CEO", "Project", "Report", "Employee", "User", "Admin", "Student", "Book", "Member",
        "Borrow Record", "Fine", "Order", "Product", "Payment", "Customer", "Shipment", "Cart",
        "Patient", "Doctor", "Appointment", "Prescription", "Medical Record", "Dataset",
        "Forecast", "Prediction", "Category", "Contact", "Contact Cat", "Type", "Calendar",
        "Equipment", "Status", "Hire Rate", "Project Equipment", "Project Hr", "Record",
    ]
    lowered = str(text).lower()
    for item in candidates:
        if item.lower() in lowered:
            items.append(item)
    if len(items) < 3:
        after_for = re.search(r"\b(?:for|with|tables for|entities)\b(.+?)(?:\.|$)", str(text), flags=re.IGNORECASE)
        fragment = after_for.group(1) if after_for else str(text)
        raw_parts = re.split(r",|\band\b|\bwith\b|\brelationships\b|\bpk\b|\bfk\b", fragment, flags=re.IGNORECASE)
        stop_words = {"create", "erd", "database", "tables", "table", "diagram", "system", "relationships", "primary", "foreign", "key", "keys"}
        for part in raw_parts:
            words = [word for word in re.findall(r"[A-Za-z]+", part) if word.lower() not in stop_words]
            if not words:
                continue
            label = " ".join(words[:3]).title()
            if label and len(label) > 2:
                items.append(label)
    return unique(items)


def infer_attributes(name):
    mapping = {
        "CEO": ["Login: String", "Password: String"],
        "Project": ["ID: Number", "TasksId: Number[]", "Access: Number[]", "Name: String"],
        "Report": ["Time: Number", "Date: Date", "Task: String", "Project: String"],
        "Employee": ["ID: Number", "Login: String", "Password: String"],
        "Book": ["ID: Number", "Title: String", "Status: String"],
        "Order": ["ID: Number", "Date: Date", "Status: String"],
        "Payment": ["ID: Number", "Amount: Number", "Status: String"],
    }
    return mapping.get(name, ["ID: Number", "Name: String", "Status: String"])


def table_name(entity):
    clean = re.sub(r"[^a-zA-Z0-9]+", "_", str(entity)).strip("_").upper()
    return f"tbl{clean or 'ENTITY'}"


def primary_key(entity):
    clean = re.sub(r"[^a-zA-Z0-9]+", "_", str(entity)).strip("_").lower()
    return f"{clean or 'entity'}_id"


def unique(items):
    result = []
    for item in items:
        if item and item not in result:
            result.append(item)
    return result


def shorten(text, limit):
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 3].rstrip() + "..."

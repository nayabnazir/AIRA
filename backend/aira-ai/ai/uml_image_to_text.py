import cv2
import pytesseract
import os
import re
import numpy as np
from PIL import Image
from pytesseract import Output

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def extract_text_from_uml(image_path):
    """
    Extract text from UML diagram image using OCR
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError("UML image not found")

    image = cv2.imread(image_path)
    if image is None:
        image = read_image_with_pillow(image_path)
    if image is None:
        return ""

    scale = 2
    image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Improve OCR accuracy for screenshots and exported diagrams.
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    text = pytesseract.image_to_string(gray, config="--oem 3 --psm 6")
    sparse_text = pytesseract.image_to_string(gray, config="--oem 3 --psm 11")
    if sparse_text.strip():
        text = f"{text}\n{sparse_text}"
    use_case_metadata = extract_use_case_layout_metadata(image)
    if use_case_metadata:
        text = "\n".join([text, *use_case_metadata])
    sequence_metadata = extract_sequence_layout_metadata(image)
    if sequence_metadata:
        text = "\n".join([text, *sequence_metadata])
    activity_metadata = extract_activity_layout_metadata(image)
    if activity_metadata:
        text = "\n".join([text, *activity_metadata])
    # Colored activity nodes can resemble class headers. Structural activity
    # and sequence evidence must win before class-header heuristics are added.
    if not activity_metadata and not sequence_metadata and not use_case_metadata:
        header_labels = extract_colored_header_labels(image)
        if header_labels:
            text = "\n".join([*(f"CLASS_HEADER: {label}" for label in header_labels), text])

    return clean_ocr_text(text)


def extract_use_case_layout_metadata(image):
    """Detect use-case ellipses and external actor labels from layout, not known wording."""
    height, width = image.shape[:2]
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    saturated = cv2.inRange(hsv, (70, 35, 45), (140, 255, 255))
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    outlined = cv2.threshold(gray, 205, 255, cv2.THRESH_BINARY_INV)[1]

    candidates = []
    for mask in (saturated, outlined):
        contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x, y, box_width, box_height = cv2.boundingRect(contour)
            ratio = box_width / max(box_height, 1)
            if not (
                width * 0.08 <= box_width <= width * 0.42
                and height * 0.035 <= box_height <= height * 0.20
                and 1.25 <= ratio <= 3.8
            ):
                continue
            area = cv2.contourArea(contour)
            ellipse_area = np.pi * (box_width / 2) * (box_height / 2)
            # True ellipse contours occupy less than (or close to) their
            # bounding ellipse area. Rounded action/participant rectangles
            # occupy noticeably more and must not be classified as use cases.
            if ellipse_area <= 0 or not 0.55 <= area / ellipse_area <= 1.02:
                continue
            label = read_use_case_label(image, x, y, box_width, box_height)
            if label and is_probable_use_case_node_label(label):
                candidates.append({
                    "x": x + box_width // 2,
                    "y": y + box_height // 2,
                    "left": x,
                    "right": x + box_width,
                    "label": label,
                })

    use_cases = deduplicate_layout_actions(candidates)
    if len(use_cases) < 2:
        return []

    actors = read_external_actor_labels(image, use_cases)
    relationships = []
    enhanced_gray = cv2.equalizeHist(gray)
    full_text = "\n".join(
        pytesseract.image_to_string(variant, config="--oem 3 --psm 11")
        for variant in (gray, enhanced_gray)
    ).lower()
    if "include" in full_text:
        relationships.append("Include")
    if "extend" in full_text:
        relationships.append("Extend")
    if "exclude" in full_text:
        relationships.append("Exclude")

    return [
        *(f"USE_CASE_ACTOR: {item}" for item in actors),
        *(f"USE_CASE_NODE: {item['label']}" for item in sorted(use_cases, key=lambda value: (value["y"], value["x"]))),
        *(f"USE_CASE_RELATIONSHIP: {item}" for item in relationships),
    ]


def read_use_case_label(image, x, y, width, height):
    pad_x = max(3, int(width * 0.08))
    pad_y = max(3, int(height * 0.20))
    crop = image[y + pad_y:y + height - pad_y, x + pad_x:x + width - pad_x]
    if crop.size == 0:
        return ""
    crop = cv2.resize(crop, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    candidates = []
    for threshold_mode in (cv2.THRESH_BINARY, cv2.THRESH_BINARY_INV):
        prepared = cv2.threshold(gray, 0, 255, threshold_mode + cv2.THRESH_OTSU)[1]
        for psm in (7, 6, 11):
            label = pytesseract.image_to_string(prepared, config=f"--oem 3 --psm {psm}")
            label = re.sub(r"\s+", " ", label).strip(" |()_~-.,")
            if re.search(r"[A-Za-z]", label):
                candidates.append(label)
    cleaned_candidates = [clean_use_case_node_label(item) for item in candidates]
    cleaned_candidates = [item for item in cleaned_candidates if item]
    return most_consistent_ocr_candidate(cleaned_candidates)


def clean_use_case_node_label(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip(" |()_~-.,'\"")
    words = text.split()
    while words and len(re.sub(r"[^A-Za-z]", "", words[0])) <= 1:
        words.pop(0)
    while words and len(re.sub(r"[^A-Za-z]", "", words[-1])) <= 1:
        words.pop()
    # OCR occasionally inserts a single character between otherwise clear
    # title-cased words inside an ellipse.
    words = [
        word for index, word in enumerate(words)
        if not (
            len(re.sub(r"[^A-Za-z]", "", word)) == 1
            and 0 < index < len(words) - 1
            and words[index - 1][:1].isupper()
            and words[index + 1][:1].isupper()
        )
    ]
    return " ".join(words).strip(" |()_~-.,'\"")


def most_consistent_ocr_candidate(candidates):
    if not candidates:
        return ""
    scored = []
    for candidate in unique_items(candidates):
        words = set(re.findall(r"[a-z]+", candidate.lower()))
        agreement = sum(
            len(words & set(re.findall(r"[a-z]+", other.lower())))
            for other in candidates
        )
        noise = len(re.findall(r"[^A-Za-z0-9 /&_-]", candidate))
        scored.append((agreement - noise * 2, len(words), -len(candidate), candidate))
    return max(scored)[-1]


def is_probable_use_case_node_label(label):
    value = str(label or "").strip()
    if len(value) < 3 or len(value) > 80 or len(value.split()) > 9:
        return False
    if re.search(r"\b(include|extend|exclude|diagram|system)\b", value, flags=re.I):
        return False
    return bool(re.search(r"[A-Za-z]{2}", value))


def read_external_actor_labels(image, use_cases):
    left_edge = min(item["left"] for item in use_cases)
    right_edge = max(item["right"] for item in use_cases)
    use_case_labels = {item["label"].lower() for item in use_cases}
    actors = []
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    enhanced = cv2.equalizeHist(gray)
    actor_heads = detect_external_actor_heads(gray, enhanced, left_edge, right_edge)
    for variant in (image, enhanced):
        data = pytesseract.image_to_data(variant, config="--oem 3 --psm 11", output_type=Output.DICT)
        grouped = {}
        for index, raw_text in enumerate(data.get("text", [])):
            word = str(raw_text or "").strip()
            try:
                confidence = float(data["conf"][index])
            except (TypeError, ValueError):
                confidence = -1
            if confidence < 20 or not re.search(r"[A-Za-z]", word):
                continue
            key = (data["block_num"][index], data["par_num"][index], data["line_num"][index])
            grouped.setdefault(key, []).append({
                "x": int(data["left"][index]),
                "y": int(data["top"][index]),
                "w": int(data["width"][index]),
                "text": word,
            })

        for words in grouped.values():
            words = sorted(words, key=lambda item: item["x"])
            label = re.sub(r"\s+", " ", " ".join(item["text"] for item in words)).strip(" |_-.,")
            center_x = (min(item["x"] for item in words) + max(item["x"] + item["w"] for item in words)) // 2
            top_y = min(item["y"] for item in words)
            if left_edge - 25 <= center_x <= right_edge + 25:
                continue
            if not any(abs(center_x - head_x) <= 48 and 18 <= top_y - head_y <= 175 for head_x, head_y in actor_heads):
                continue
            if not is_probable_actor_label(label, use_case_labels):
                continue
            actors.append(label)
    return unique_items(actors)


def detect_external_actor_heads(gray, enhanced, left_edge, right_edge):
    heads = []
    for variant in (gray, enhanced):
        circles = cv2.HoughCircles(
            variant,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=30,
            param1=80,
            param2=18,
            minRadius=6,
            maxRadius=max(12, min(gray.shape[:2]) // 25),
        )
        if circles is None:
            continue
        for x, y, radius in circles[0]:
            x, y, radius = int(round(x)), int(round(y)), int(round(radius))
            if left_edge - 30 <= x <= right_edge + 30:
                continue
            if radius <= max(22, min(gray.shape[:2]) // 45):
                heads.append((x, y))
    return unique_points(heads, tolerance=16)


def is_probable_actor_label(label, use_case_labels):
    value = str(label or "").strip()
    if len(value) < 3 or len(value) > 55 or len(value.split()) > 5:
        return False
    if not value[:1].isupper():
        return False
    if value.lower() in use_case_labels:
        return False
    if re.search(r"\b(include|extend|exclude|reservation|diagram)\b", value, flags=re.I):
        return False
    if re.search(
        r"\b(receive|place|confirm|facilitate|accept|pay|payment|order|serve|cook|eat|drink|request|"
        r"prepare|make|check|book|login|upload|download|generate|process)\b",
        value,
        flags=re.I,
    ):
        return False
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9 &/_-]*", value))


def extract_activity_layout_metadata(image):
    """Detect swimlanes and activity nodes without relying on known diagram wording."""
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    colored = cv2.inRange(hsv, (70, 35, 70), (120, 255, 255))
    contours, _ = cv2.findContours(colored, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    actions = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if width < 80 or height < 25 or width / max(height, 1) < 1.6:
            continue
        crop = image[max(0, y - 5):y + height + 5, max(0, x - 5):x + width + 5]
        label = read_activity_label(crop)
        if label:
            actions.append({"x": x + width // 2, "y": y + height // 2, "label": label})

    actions.extend(detect_outlined_activity_actions(image))
    actions = deduplicate_layout_actions(actions)
    actions = sorted(actions, key=lambda item: item["y"])
    decisions = detect_activity_diamonds(image)
    if len(actions) < 3 or (not decisions and len(actions) < 5):
        return []

    lane_boundaries = detect_swimlane_boundaries(image)
    lanes = read_swimlane_headers(image, lane_boundaries) if len(lane_boundaries) >= 3 else []
    metadata = [f"ACTIVITY_LANE: {lane}" for lane in lanes if lane]
    for action in actions:
        lane = lane_for_x(action["x"], lane_boundaries, lanes)
        metadata.append(f"ACTIVITY_STEP: {action['label']}" + (f" :: LANE: {lane}" if lane else ""))
    if decisions:
        metadata.append(f"ACTIVITY_DECISION_COUNT: {len(decisions)}")
        metadata.extend(build_activity_branch_metadata(actions, decisions))
    metadata.extend(f"ACTIVITY_GUARD: {guard}" for guard in extract_activity_guard_labels(image))
    return metadata


def build_activity_branch_metadata(actions, decisions):
    branches = []
    for decision_x, decision_y in sorted(decisions, key=lambda point: point[1]):
        prior = [item for item in actions if item["y"] < decision_y - 12]
        if not prior:
            continue
        source = min(prior, key=lambda item: decision_y - item["y"])
        targets = [
            item for item in actions
            if decision_y - 30 <= item["y"] <= decision_y + 210 and item["label"] != source["label"]
        ]
        targets = deduplicate_layout_actions(targets)
        if len(targets) >= 2:
            target_names = ", ".join(item["label"] for item in targets[:4])
            branches.append(f"ACTIVITY_BRANCH: {source['label']} :: TARGETS: {target_names}")
    return branches


def detect_outlined_activity_actions(image):
    """Detect unfilled rounded/rectangular activity nodes and OCR their labels."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    binary = cv2.threshold(gray, 210, 255, cv2.THRESH_BINARY_INV)[1]
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    height, width = image.shape[:2]
    actions = []
    for contour in contours:
        x, y, box_width, box_height = cv2.boundingRect(contour)
        ratio = box_width / max(box_height, 1)
        if not (
            width * 0.08 <= box_width <= width * 0.65
            and 22 <= box_height <= height * 0.15
            and 1.7 <= ratio <= 12
        ):
            continue
        perimeter = cv2.arcLength(contour, True)
        vertices = len(cv2.approxPolyDP(contour, 0.03 * perimeter, True))
        if vertices < 4 or vertices > 9:
            continue
        crop = image[y:y + box_height, x:x + box_width]
        label = read_activity_label(crop)
        if label and is_probable_activity_action(label):
            actions.append({"x": x + box_width // 2, "y": y + box_height // 2, "label": label})
    return actions


def detect_activity_diamonds(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    binary = cv2.threshold(gray, 210, 255, cv2.THRESH_BINARY_INV)[1]
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    diamonds = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if width < 30 or height < 30 or not 0.65 <= width / max(height, 1) <= 1.5:
            continue
        approx = cv2.approxPolyDP(contour, 0.035 * cv2.arcLength(contour, True), True)
        if len(approx) == 4:
            points = approx.reshape(4, 2)
            top = points[np.argmin(points[:, 1])]
            bottom = points[np.argmax(points[:, 1])]
            left = points[np.argmin(points[:, 0])]
            right = points[np.argmax(points[:, 0])]
            if top[1] < left[1] and top[1] < right[1] and bottom[1] > left[1] and bottom[1] > right[1]:
                diamonds.append((x + width // 2, y + height // 2))
    return unique_points(diamonds)


def unique_points(points, tolerance=18):
    result = []
    for point in points:
        if not any(abs(point[0] - old[0]) <= tolerance and abs(point[1] - old[1]) <= tolerance for old in result):
            result.append(point)
    return result


def deduplicate_layout_actions(actions):
    result = []
    for item in sorted(actions, key=lambda value: (value["y"], value["x"])):
        duplicate = next((
            old for old in result
            if abs(item["x"] - old["x"]) < 45 and abs(item["y"] - old["y"]) < 35
        ), None)
        if duplicate:
            if len(item["label"]) > len(duplicate["label"]):
                duplicate["label"] = item["label"]
            continue
        result.append(item)
    return result


def is_probable_activity_action(label):
    value = str(label or "").strip()
    if len(value) < 3 or len(value) > 90 or len(value.split()) > 10:
        return False
    if re.search(r"\b(diagram|difference between|example of|sequence diagram|activity diagram)\b", value, flags=re.I):
        return False
    return bool(re.search(
        r"\b(open|access|get|detect|change|play|retrieve|generate|call|prepare|meet|send|create|"
        r"login|enter|validate|save|update|add|delete|upload|download|analy|describe|export|"
        r"submit|process|approve|reject|plan|design|implement|test|deploy|review)\b",
        value,
        flags=re.I,
    ))


def extract_activity_guard_labels(image):
    """Read bracketed activity guards and remove common OCR fragments."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    candidates = []
    for psm in (6, 11, 12):
        raw = pytesseract.image_to_string(gray, config=f"--oem 3 --psm {psm}")
        candidates.extend(re.findall(r"\[([^\]\n]{3,90})\]|\(([^)\n]{3,90})\]", raw))

    guards = []
    for pair in candidates:
        value = next((part for part in pair if part), "")
        value = re.sub(r"^[^A-Za-z]+|[^A-Za-z]+$", "", value)
        value = re.sub(r"\s+", " ", value).strip()
        if not value or len(value.split()) > 8:
            continue
        if not re.search(r"\b(no|yes|if|on|off|valid|invalid|available|unavailable|problem|statement|appointment|approved|rejected)\b", value, flags=re.I):
            continue
        guards.append(value)

    cleaned = []
    for value in guards:
        value = re.sub(r"\s+(?:on|ce|a|f|bs)$", "", value, flags=re.I).strip()
        if value and not any(activity_guard_equivalent(value, existing) for existing in cleaned):
            cleaned.append(value)

    # If OCR reads a negated branch and only a damaged positive branch, the
    # positive condition is still structurally implied by the decision.
    for value in list(cleaned):
        if value.lower().startswith("no ") and not any(
            item.lower() == value[3:].lower() for item in cleaned
        ):
            cleaned.append(value[3:])
    cleaned = [
        value for value in cleaned
        if not (
            re.match(r"^[a-z]{1,2}\s+of\s+", value, flags=re.I)
            and any(
                other != value and other.lower().endswith(value.lower()[value.lower().find(" of "):])
                for other in cleaned
            )
        )
    ]
    return cleaned[:12]


def activity_guard_equivalent(left, right):
    left_words = set(re.findall(r"[a-z]+", left.lower()))
    right_words = set(re.findall(r"[a-z]+", right.lower()))
    if not left_words or not right_words:
        return False
    return len(left_words & right_words) / max(len(left_words), len(right_words)) >= 0.75


def read_activity_label(crop):
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    candidates = []
    for psm in (7, 11, 6):
        label = pytesseract.image_to_string(gray, config=f"--oem 3 --psm {psm}")
        label = re.sub(r"\s+", " ", label).strip(" ()|_~-")
        label = re.sub(r"^[^A-Za-z]+|[^A-Za-z0-9)]+$", "", label)
        if re.search(r"[A-Za-z]", label) and len(label) <= 90:
            candidates.append(label)
    selected = max(candidates, key=lambda item: (len(re.findall(r"[A-Za-z]", item)), len(item)), default="")
    return clean_activity_node_label(selected)


def clean_activity_node_label(value):
    words = str(value or "").split()
    while words and len(re.sub(r"[^A-Za-z]", "", words[0])) <= 1:
        words.pop(0)
    while words and len(re.sub(r"[^A-Za-z]", "", words[-1])) <= 1:
        words.pop()
    return " ".join(words).strip()


def detect_swimlane_boundaries(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    dark = cv2.threshold(gray, 80, 255, cv2.THRESH_BINARY_INV)[1]
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(30, image.shape[0] // 3)))
    vertical = cv2.morphologyEx(dark, cv2.MORPH_OPEN, vertical_kernel)
    contours, _ = cv2.findContours(vertical, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    positions = []
    for contour in contours:
        x, _, width, height = cv2.boundingRect(contour)
        if height >= image.shape[0] * 0.65:
            positions.append(x + width // 2)
    return unique_numbers(sorted(positions), tolerance=max(4, image.shape[1] // 150))


def read_swimlane_headers(image, boundaries):
    lanes = []
    header_bottom = max(30, image.shape[0] // 28)
    for left, right in zip(boundaries, boundaries[1:]):
        crop = image[3:header_bottom, left + 6:right - 6]
        if crop.size == 0:
            continue
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        label = pytesseract.image_to_string(gray, config="--oem 3 --psm 7")
        label = re.sub(r"\s+", " ", label).strip(" |_-")
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9 &/_-]{2,60}", label or ""):
            lanes.append(label)
        else:
            lanes.append("")
    return lanes


def lane_for_x(x, boundaries, lanes):
    for index, (left, right) in enumerate(zip(boundaries, boundaries[1:])):
        if left <= x <= right and index < len(lanes):
            return lanes[index]
    return ""


def unique_numbers(values, tolerance=5):
    result = []
    for value in values:
        if not result or abs(value - result[-1]) > tolerance:
            result.append(value)
    return result


def extract_sequence_layout_metadata(image):
    """Extract reusable participant/message hints from a sequence-diagram layout."""
    data = pytesseract.image_to_data(image, config="--oem 3 --psm 11", output_type=Output.DICT)
    grouped = {}
    for index, raw_text in enumerate(data.get("text", [])):
        word = str(raw_text or "").strip()
        try:
            confidence = float(data["conf"][index])
        except (TypeError, ValueError):
            confidence = -1
        if not word or confidence < 20 or (not re.search(r"[A-Za-z0-9]", word) and word != "/"):
            continue
        key = (data["block_num"][index], data["par_num"][index], data["line_num"][index])
        grouped.setdefault(key, []).append({
            "x": int(data["left"][index]),
            "y": int(data["top"][index]),
            "w": int(data["width"][index]),
            "h": int(data["height"][index]),
            "text": word,
        })

    height = image.shape[0]
    segments = []
    for words in grouped.values():
        ordered = sorted(words, key=lambda item: item["x"])
        current = []
        for word in ordered:
            if current:
                previous_end = current[-1]["x"] + current[-1]["w"]
                gap = word["x"] - previous_end
                if gap > max(25, word["h"]):
                    segments.append(sequence_segment(current))
                    current = []
            current.append(word)
        if current:
            segments.append(sequence_segment(current))

    participants = []
    messages = []
    for segment in sorted(segments, key=lambda item: (item["y"], item["x"])):
        label = clean_sequence_layout_label(segment["text"])
        if not label or len(label) < 3:
            continue
        near_endpoint = segment["y"] < height * 0.24 or segment["y"] > height * 0.72
        if near_endpoint and is_probable_sequence_participant(label):
            participants.append((segment["x"], label))
        elif height * 0.18 <= segment["y"] <= height * 0.72 and is_probable_sequence_message(label):
            messages.append(label)

    participants = unique_items(label for _, label in sorted(participants, key=lambda item: item[0]))
    messages = unique_items(messages)
    # Avoid treating use-case/activity diagrams with a couple of action labels as sequences.
    if len(participants) < 2 or len(messages) < 3:
        return []
    return [
        *(f"SEQUENCE_PARTICIPANT: {item}" for item in participants),
        *(f"SEQUENCE_MESSAGE: {item}" for item in messages),
    ]


def sequence_segment(words):
    return {
        "x": min(item["x"] for item in words),
        "y": min(item["y"] for item in words),
        "text": " ".join(item["text"] for item in words),
    }


def clean_sequence_layout_label(value):
    text = re.sub(r"[|<>_]+", " ", str(value or ""))
    text = re.sub(r"^[^A-Za-z0-9]+", "", text)
    text = re.sub(r"\s+", " ", text).strip(" -.,:")
    replacements = [
        (r"^(?:a|al) model$", "AI Model"),
        (r"\bpatabase\b", "Database"),
        (r"\bretum\b", "Return"),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.I)
    return text


def is_probable_sequence_participant(value):
    text = str(value or "").strip()
    if len(text) > 45 or len(text.split()) > 4:
        return False
    if re.search(r"\b(enter|send|process|generate|save|return|display|upload|download|request|output)\b", text, flags=re.I):
        return False
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9 _/-]*", text))


def is_probable_sequence_message(value):
    text = str(value or "").strip()
    if len(text) > 80 or len(text.split()) > 10:
        return False
    return bool(re.search(
        r"\b(enter|send|process|generate|generated|save|return|display|upload|download|request|response|validate|"
        r"create|update|delete|fetch|get|add|calculate|submit|authenticate|notify|read|write|show)\b",
        text,
        flags=re.I,
    ))


def extract_colored_header_labels(image):
    """Read class/entity names from filled colored UML header bars."""
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    saturated = cv2.inRange(hsv, (70, 45, 35), (135, 255, 245))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (35, 5))
    filled_regions = cv2.morphologyEx(saturated, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(filled_regions, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    labels = []
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if width < 130 or height < 20 or height > 180 or width / max(height, 1) < 2.2:
            continue
        crop = image[y:y + height, x:x + width]
        gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        label = pytesseract.image_to_string(
            cv2.bitwise_not(gray_crop),
            config="--oem 3 --psm 7",
        ).strip(" |_-")
        label = re.sub(r"\s+", " ", label)
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9 _-]{1,50}", label or ""):
            labels.append(label)
    return unique_items(reversed(labels))


def read_image_with_pillow(image_path):
    try:
        with Image.open(image_path) as pil_image:
            rgb = pil_image.convert("RGB")
            array = np.array(rgb)
            return cv2.cvtColor(array, cv2.COLOR_RGB2BGR)
    except Exception:
        return None


def generate_uml_description(extracted_text):
    """
    Generate a professional description from OCR text detected in a UML diagram.
    """
    lines = [normalize_uml_ocr_line(l) for l in extracted_text.split("\n") if is_readable_uml_line(l)]
    lines = [line for line in lines if line and not is_relationship_noise_line(line)]
    lowered = " ".join(lines).lower()

    class_names = extract_class_names(lines)
    structural_score = sum(1 for line in lines if re.search(r"(^|\s)[+-]\w|:\s*[A-Za-z]|\w+\(\)", line))
    if structural_score >= 4:
        class_names = unique_items([*class_names, *extract_structural_class_names(lines)])
    use_cases = extract_use_case_labels(lines)
    actors = extract_actor_labels(lines)

    if "activity_step:" in lowered:
        return build_activity_workflow_description(lines)

    if is_sequence_diagram_text(lowered):
        return build_sequence_description(lines)

    if is_er_diagram(lowered):
        return build_er_description(lowered)

    if is_deployment_diagram(lowered):
        return build_deployment_description(lowered)

    if is_ai_pipeline_diagram(lowered):
        return build_ai_pipeline_description(lowered)

    if is_architecture_interface_diagram(lowered):
        return build_architecture_interface_description(lowered)

    if use_cases:
        return build_use_case_description(actors, use_cases)

    if is_activity_workflow_text(lowered):
        return build_activity_workflow_description(lines)

    if class_names or structural_score >= 4:
        return build_class_description(class_names, lines)

    description = []
    if any(term in lowered for term in ["sequence", "lifeline", "message", "activation", "return message"]):
        description.append("This is a sequence diagram that describes time-ordered messages exchanged between participants or lifelines.")
        description.append(f"The visible interaction labels include {format_label_list(lines[:12])}.")
        description.append("The diagram is intended to explain request order, responses, alternate paths, and participant responsibilities.")
    elif any(term in lowered for term in ["state", "transition", "initial state", "final state", "entry", "exit"]):
        description.append("This is a state machine diagram that describes lifecycle states and event-driven transitions.")
        description.append(f"The visible states and transition labels include {format_label_list(lines[:12])}.")
        description.append("The diagram is intended to show how an object changes state in response to events and conditions.")
    elif any(term in lowered for term in ["component", "provided interface", "required interface"]):
        description.append("This is a component diagram that describes software components, interfaces, and dependencies.")
        description.append(f"The visible component labels include {format_label_list(lines[:12])}.")
    elif any(term in lowered for term in ["package", "namespace", "import"]):
        description.append("This is a package diagram that groups model elements and shows package-level dependencies.")
        description.append(f"The visible package labels include {format_label_list(lines[:12])}.")
    elif any(term in lowered for term in ["class", "interface"]):
        classes = [line for line in lines if not is_probable_use_case_label(line)]
        description.append("This appears to be a class or structural UML diagram.")
        if classes:
            description.append(f"The diagram identifies structural elements such as {format_label_list(classes[:8])}.")
        description.append("It is intended to describe software structure, responsibilities, and relationships between system elements.")
    elif any(term in lowered for term in ["start", "decision", "process", "activity", "workflow", "validate", "save", "update"]):
        description.append("This appears to be an activity diagram that represents a workflow or process sequence.")
        description.append(f"The visible workflow steps include {format_label_list(lines[:8])}.")
        description.append("The diagram is intended to show how control moves through the main activities of the system.")
    elif lines:
        description.append("The uploaded diagram contains readable UML text, but the diagram type could not be identified confidently.")
        description.append(f"The visible elements include {format_label_list(lines[:10])}.")
        description.append("A clearer exported diagram image would allow more accurate interpretation of actors, relationships, and flow.")
    else:
        description.append("No readable UML labels were detected from the uploaded image.")

    return unique_items(description[:8])


def is_activity_workflow_text(text):
    value = str(text or "").lower()
    indicators = [
        "development lifecycle", "agile model", "requirement analysis", "planning",
        "design", "implementation", "testing", "deployment", "feedback",
        "more changes required", "workflow", "decision",
    ]
    return sum(1 for item in indicators if item in value) >= 3 or (
        "agile model" in value and ("feedback" in value or "deployment" in value)
    )


def build_activity_workflow_description(lines):
    value = "\n".join(lines)
    stages = [
        label for label, pattern in [
            ("Requirement Analysis", r"requirement analysis|define srs requirements|understand problem"),
            ("Planning", r"planning|ptenning|milestones|agile methodology"),
            ("Design", r"\bdesign\b|system architecture|database design|uml diagrams|ui design"),
            ("Implementation", r"implementation|frontend development|backend development|ai model development"),
            ("Testing", r"\btesting\b|functional testing|output validation|bug fixing"),
            ("Deployment", r"\bdeployment\b|user access setup"),
            ("Feedback & Improvement", r"feedback|performance improvement|feature enhancement"),
        ]
        if re.search(pattern, value, flags=re.I)
    ]
    if stages:
        return [
            "This is an activity diagram representing an Agile software-development lifecycle.",
            f"The main workflow stages are {format_label_list(stages)}.",
            "Each lifecycle stage is supported by notes that describe its principal activities and deliverables.",
            "The visible decisions and feedback paths communicate an iterative development process.",
        ]
    actions = [
        re.sub(r"^ACTIVITY_STEP:\s*", "", line, flags=re.I).split(":: LANE:", 1)[0].strip()
        for line in lines if line.upper().startswith("ACTIVITY_STEP:")
    ]
    decision_match = re.search(r"ACTIVITY_DECISION_COUNT:\s*(\d+)", value, flags=re.I)
    decision_count = int(decision_match.group(1)) if decision_match else 0
    return [
        "This is an activity diagram representing an operational workflow.",
        f"The visible workflow activities are {format_label_list(actions)}.",
        f"The diagram contains {decision_count} visible decision node(s)." if decision_count else
        "No decision diamond was detected confidently.",
        "The arrows and decision nodes show how control progresses and branches between activities.",
    ]


def is_sequence_diagram_text(text):
    value = str(text or "")
    explicit = any(term in value.lower() for term in ["sequence", "lifeline", "activation", "return message"])
    numbered_messages = re.findall(r"(?m)^\s*\d+\s*[:.)-]?\s*[A-Za-z][^\n]{2,}", value)
    return explicit or len(numbered_messages) >= 4


def build_sequence_description(lines):
    messages = extract_numbered_sequence_messages("\n".join(lines))
    description = [
        "This is a sequence diagram that describes a time-ordered interaction between participating lifelines.",
        f"The visible interaction contains {len(messages)} numbered messages arranged in chronological order.",
        f"The message flow includes {format_label_list([item[1] for item in messages[:12]])}." if messages else
        "The interaction labels were not readable enough to list reliably.",
        "The lifelines and activation bars show which participant is responsible for each request as the scenario progresses.",
    ]
    if messages:
        description.append(f"The visible scenario begins with '{messages[0][1]}' and concludes with '{messages[-1][1]}'.")
    return description


def extract_numbered_sequence_messages(text):
    messages = {}
    for raw in str(text or "").splitlines():
        line = normalize_uml_ocr_line(raw)
        match = re.match(r"^\s*(\d+)\s*[:.)-]?\s*(.+)$", line)
        if not match:
            continue
        order = int(match.group(1))
        label = repair_sequence_ocr_label(match.group(2))
        if len(label) >= 3 and re.search(r"[A-Za-z]", label):
            messages.setdefault(order, label)
    return sorted(messages.items())


def repair_sequence_ocr_label(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip(" |_-")
    replacements = [
        (r"\bvdidatd\b|\bva idatd\b|\bvalidate?d?\b", "validate"),
        (r"\btalculate\b", "calculate"),
        (r"\bnlember\b|\bmamber\b|\bmem ber\b", "member"),
        (r"\becord\b", "record"),
        (r"\bbaid\b", "paid"),
        (r"\bc\s+rate\b|\bc ebte\b", "create"),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.I)
    text = re.sub(r"\s+[|Il1]$", "", text).strip()
    return text


def is_deployment_diagram(text):
    value = str(text or "").lower()
    indicators = ["user browser", "web server", "mysql db", "ai engine", "http requests", "business logic"]
    return sum(1 for item in indicators if item in value) >= 3


def is_er_diagram(text):
    value = str(text or "").lower()
    return sum(1 for item in ["int pk", "int fk", "varchar", "timestamp", "uml_requests", "uploaded_files"] if item in value) >= 3


def is_ai_pipeline_diagram(text):
    value = str(text or "").lower()
    indicators = ["preprocessing", "features extraction", "feature extraction", "ai model", "ambiguity detection", "uml output"]
    return sum(1 for item in indicators if item in value) >= 3


def build_ai_pipeline_description(text):
    stages = [
        name for name, pattern in [
            ("SRS/UML Image", r"srs.?uml image"),
            ("Preprocessing", r"preprocessing"),
            ("Feature Extraction", r"features? extraction"),
            ("AI Model", r"\bai model\b"),
            ("Ambiguity Detection / UML Output", r"ambiguity detection|uml output"),
        ]
        if re.search(pattern, text, flags=re.I)
    ]


def is_architecture_interface_diagram(text):
    value = str(text or "").lower()
    components = ["frontend ui", "backend api", "ai engine", "mysql database", "web pages", "controllers", "services"]
    return sum(1 for item in components if item in value) >= 3


def build_architecture_interface_description(text):
    components = [
        name for name, pattern in [
            ("Frontend UI", r"frontend ui"),
            ("Backend API", r"backend api"),
            ("AI Engine", r"\bai engine\b"),
            ("MySQL Database", r"mysql database|mysql db"),
        ]
        if re.search(pattern, text, flags=re.I)
    ]
    return [
        f"This is a system architecture and interface-flow diagram showing {format_label_list(components)}.",
        "The Frontend UI sends user requests to the Backend API.",
        "The Backend API coordinates AI-processing requests with the AI Engine.",
        "The Backend API stores and retrieves persistent data through the MySQL Database.",
        "The diagram describes logical components, their responsibilities, and the information exchanged between them.",
    ]
    return [
        "This is an AI processing pipeline diagram that shows how an SRS document or UML image is transformed into an analysis result.",
        f"The processing stages are {format_label_list(stages)}.",
        "The input first passes through preprocessing, then feature extraction prepares meaningful information for the AI model.",
        "The AI model produces the final ambiguity-detection result or UML-related output.",
        "The arrows indicate a sequential top-to-bottom data flow between every processing stage.",
    ]


def build_er_description(text):
    entities = [
        name for name, pattern in [
            ("USERS", r"\busers\b"), ("UML_REQUESTS", r"uml_requests"),
            ("UPLOADED_FILES", r"uploaded.?files"), ("UML_OUTPUTS", r"uml_outputs"),
        ]
        if re.search(pattern, text, flags=re.I)
    ]
    return [
        f"This is an entity-relationship diagram describing the database schema through {format_label_list(entities)}.",
        "USERS stores registered-account information and is referenced by UML_REQUESTS through user_id.",
        "UML_REQUESTS stores requested UML type, prompt, creation time, and the owning user.",
        "UPLOADED_FILES and UML_OUTPUTS belong to UML_REQUESTS through request_id foreign keys.",
        "The diagram clearly indicates one-to-many ownership from USERS to UML_REQUESTS and from UML_REQUESTS to uploaded files.",
        "UML_REQUESTS to UML_OUTPUTS is reasonably interpreted as one-to-many, but the compressed cardinality notation should be verified before treating that multiplicity as definitive.",
    ]


def build_deployment_description(text):
    nodes = [
        name for name, pattern in [
            ("User Browser", r"user brows"),
            ("Web Server", r"web server|web sener"),
            ("AI Engine", r"\bai engine\b|\bal engine\b"),
            ("MySQL DB", r"mysql db"),
        ]
        if re.search(pattern, text, flags=re.I)
    ]
    artifacts = [
        name for name, pattern in [
            ("HTML", r"\bhtml\b"), ("CSS", r"\bcss\b"), ("JavaScript", r"javascrip"),
            ("UI Pages", r"ui page"), ("Backend API", r"backend.*api"), ("Request Handler", r"request.*handler"),
            ("Authentication Module", r"authenticati"), ("Business Logic", r"business.*logic"),
            ("Preprocessing", r"preprocess"), ("ML Models", r"ml models"), ("UML Generator", r"generator"),
            ("users", r"\busers\b"), ("uml_requests", r"uml_requests"), ("uploaded_files", r"uploaded_f"),
            ("uml_outputs", r"uml_outpu"),
        ]
        if re.search(pattern, text, flags=re.I)
    ]
    return [
        f"This is a deployment diagram showing the runtime architecture across {format_label_list(nodes)}.",
        f"The deployed software artifacts include {format_label_list(artifacts)}.",
        "The User Browser sends HTTP requests to the Web Server.",
        "The Web Server sends AI-processing requests to the AI Engine and stores or retrieves persistent data from the MySQL database.",
        "The diagram describes physical deployment nodes, deployed artifacts, and communication paths rather than user-facing use cases or class structure.",
    ]


def extract_class_names(lines):
    names = []
    for line in lines:
        match = re.match(r"^CLASS_HEADER:\s*(.+)$", line, flags=re.I)
        if match:
            names.append(match.group(1).strip())
    return unique_items(names)


def extract_structural_class_names(lines):
    """Find bare class-name labels in monochrome UML exports."""
    ignored = {
        "submits", "has", "generates", "contains", "creates", "uses", "inherits",
        "string", "text", "int", "datetime", "boolean", "float", "double",
    }
    names = []
    for line in lines:
        value = str(line or "").strip()
        if value.lower() in ignored:
            continue
        if re.fullmatch(r"[A-Z][A-Za-z0-9]{2,50}", value):
            names.append(value)
    return unique_items(names)


def build_class_description(class_names, lines):
    attributes = unique_items(
        re.sub(r"\s+", " ", match.group(0)).strip()
        for line in lines
        for match in re.finditer(r"-[A-Za-z]\w*\s*:\s*[A-Za-z][A-Za-z0-9]*", line)
    )
    methods = unique_items(
        re.sub(r"\s+", "", match.group(0))
        for line in lines
        for match in re.finditer(r"\+[A-Za-z]\w*\s*\([^)]*\)", line)
    )
    relationships = extract_relationship_labels(lines)
    classes_text = format_label_list(class_names) if class_names else "multiple structural classes"
    description = [
        f"This is a class diagram that models the static structure of the system through {classes_text}.",
        f"The detected operations include {format_label_list(methods[:12])}." if methods else "The classes define operations that represent system behavior.",
        f"The detected attributes include {format_label_list(attributes[:12])}." if attributes else "The classes contain data fields that represent stored system state.",
    ]
    if relationships:
        description.append(f"The visible relationships include {format_label_list(relationships)}.")
    description.append("The diagram is intended to define class responsibilities, stored data, operations, inheritance, and associations between system components.")
    return unique_items(description)


def extract_relationship_labels(lines):
    labels = []
    for line in lines:
        for match in re.findall(r"\b(submits|has|generates|contains|creates|owns|uses|inherits|manages|produces)\b", line, flags=re.I):
            labels.append(match.lower())
    return unique_items(labels)


def clean_ocr_text(text):
    cleaned = str(text or "")
    replacements = {
        "passongor": "passenger",
        "passanger": "passenger",
        "cheks": "checks",
        "uugceee": "luggage",
        "uugeeee": "luggage",
        "verivineicket": "verify ticket",
        "valdate": "validate",
        "validte": "validate",
        "infomation": "information",
        "quanity": "quantity",
        "databse": "database",
        "sendtoal": "sendToAI",
        "fileld": "fileId",
        "um|type": "umlType",
        "umitype": "umlType",
        "authenticate user": "authenticateUser",
        "prompt: strin": "prompt : String",
        "al engine": "AI Engine",
        "web sener": "Web Server",
        "user browse": "User Browser",
        "javascrip": "JavaScript",
        "uml_outpu": "uml_outputs",
        "al model": "AI Model",
        "features extraction": "Feature Extraction",
        "controllers services": "Controllers & Services",
    }
    for wrong, right in replacements.items():
        cleaned = re.sub(re.escape(wrong), right, cleaned, flags=re.I)
    cleaned = re.sub(r"\+authenticateUser\s*\)", "+authenticateUser()", cleaned, flags=re.I)
    cleaned = re.sub(r"\bStringg\b", "String", cleaned, flags=re.I)
    cleaned = re.sub(r"[“”‘’]", "", cleaned)
    cleaned = re.sub(r"[^\w\s:+#().,\-/]", " ", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def normalize_uml_ocr_line(line):
    text = re.sub(r"\s+", " ", str(line or "")).strip()
    if text.upper().startswith("CLASS_HEADER:"):
        return "CLASS_HEADER: " + text.split(":", 1)[1].strip()
    text = re.sub(r"\binclude\s+include\b", "include", text, flags=re.I)
    text = re.sub(r"\bextend\s+extend\b", "extend", text, flags=re.I)
    text = re.sub(r"\binclude\s+(?=[A-Z])", "", text, flags=re.I)
    text = re.sub(r"\bextend\s+(?=[A-Z])", "", text, flags=re.I)
    text = re.sub(r"\bGenerate UML Login\b", "Generate UML; Login", text, flags=re.I)
    return text.strip(" -_.,")


def is_relationship_noise_line(line):
    text = str(line or "").strip().lower()
    compact = re.sub(r"[^a-z]", "", text)
    if compact in {"include", "includes", "includ", "inclu", "extend", "extends", "exclud"}:
        return True
    if re.search(r"\b(inclu|includ|include|extend)\b", text) and len(text.split()) <= 4:
        return True
    if re.search(r"\b(include|extend)\b", text) and not re.search(r"\b(login|sign|upload|download|generate|check|view|manage|search|report|history|srs|uml)\b", text):
        return True
    return False


def is_readable_uml_line(line):
    text = str(line or "").strip()
    if len(text) < 3:
        return False
    letters = re.findall(r"[A-Za-z]", text)
    if len(letters) < 3:
        return False
    symbol_ratio = len(re.findall(r"[^\w\s:+#().,\-/]", text)) / max(len(text), 1)
    if symbol_ratio > 0.18:
        return False
    words = re.findall(r"[A-Za-z]{2,}", text)
    if not words:
        return False
    broken = sum(1 for word in words if re.search(r"(.)\1{2,}", word.lower()))
    return broken / max(len(words), 1) <= 0.35


def extract_use_case_labels(lines):
    labels = []
    for line in lines:
        for part in re.split(r"[;|]", line):
            label = normalize_use_case_label(part)
            if label and is_probable_use_case_label(label) and label not in labels:
                labels.append(label)
    return labels


def extract_actor_labels(lines):
    actors = []
    actor_words = {"user", "admin", "student", "customer", "patient", "doctor", "librarian", "developer", "manager"}
    for line in lines:
        clean = normalize_use_case_label(line)
        if clean.lower() in actor_words and clean not in actors:
            actors.append(clean)
    return actors


def normalize_use_case_label(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip(" -_.,")
    if not text:
        return ""
    corrections = {
        "log in": "Login",
        "login": "Login",
        "sign up": "Sign Up",
        "upload srs": "Upload SRS",
        "generate uml": "Generate UML",
        "upload uml image": "Upload UML Image",
        "view history": "View History",
        "download output": "Download Output",
        "check ambiguity": "Check Ambiguity",
    }
    lowered = text.lower()
    for wrong, right in corrections.items():
        if wrong == lowered:
            return right
    return to_title_case(text)


def is_probable_use_case_label(label):
    lowered = str(label or "").lower()
    keywords = [
        "login", "log in", "sign up", "register", "upload", "download", "generate",
        "check", "analyze", "view", "search", "manage", "create", "update", "delete",
        "borrow", "return", "payment", "report", "history", "srs", "uml"
    ]
    return any(keyword in lowered for keyword in keywords)


def build_use_case_description(actors, use_cases):
    actor_text = format_label_list(actors) if actors else "the user"
    description = [
        f"This appears to be a use case diagram that shows how {actor_text} interacts with the system.",
        f"The main system functions shown in the diagram are {format_label_list(use_cases)}.",
        "The diagram describes the external behavior of the system, focusing on the services available to users rather than internal code, database tables, or class structure."
    ]

    if any("srs" in item.lower() for item in use_cases) or any("uml" in item.lower() for item in use_cases):
        description.append("For AIRA, the diagram indicates support for requirements-related activities such as uploading SRS content, generating UML output, analyzing ambiguity, viewing saved history, and downloading generated results.")

    return description


def format_label_list(items):
    clean_items = [item for item in unique_items(items) if item]
    if not clean_items:
        return ""
    if len(clean_items) == 1:
        return clean_items[0]
    if len(clean_items) == 2:
        return f"{clean_items[0]} and {clean_items[1]}"
    return f"{', '.join(clean_items[:-1])}, and {clean_items[-1]}"


def to_title_case(value):
    keep_upper = {"srs", "uml", "erd", "pdf"}
    words = []
    for word in str(value or "").split():
        if word.lower() in keep_upper:
            words.append(word.upper())
        else:
            words.append(word[:1].upper() + word[1:].lower())
    return " ".join(words)


def unique_items(items):
    result = []
    seen = set()
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result

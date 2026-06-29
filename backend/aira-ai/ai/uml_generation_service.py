import re


def generate_uml_from_text(text, diagram_type="use_case"):
    diagram_type = normalize_diagram_type(diagram_type)
    text = clean_modeling_text(text, diagram_type)
    requirements = split_sentences(text)

    if diagram_type == "use_case":
        return generate_use_case(requirements)
    if diagram_type == "class":
        return generate_class_diagram(requirements)
    if diagram_type == "sequence":
        return generate_sequence_diagram(requirements)
    if diagram_type == "erd":
        return generate_erd(requirements)
    if diagram_type == "activity":
        return generate_activity_diagram(requirements)

    raise ValueError(f"Unsupported diagram type: {diagram_type}")


def normalize_diagram_type(diagram_type):
    value = str(diagram_type).lower().replace("-", "_").replace(" ", "_")
    if value in ["usecase", "use_case"]:
        return "use_case"
    return value


def split_sentences(text):
    actor_words = r"(?:admin|customer|user|system|student|doctor|librarian|passenger|staff|employee|manager|patient)"
    initial_parts = re.split(
        rf"[.\n;]+|,\s+(?={actor_words}\b)|\s+\band\s+(?={actor_words}\b)|\s+\band\s+(?=(?:allows?|shall allow)\s+{actor_words}\b)",
        str(text),
        flags=re.I,
    )
    return [part.strip() for part in initial_parts if is_useful_requirement_sentence(part)]


def is_useful_requirement_sentence(sentence):
    value = re.sub(r"\s+", " ", str(sentence or "")).strip()
    lowered = value.lower().strip(":-•* ")
    if len(value) < 4:
        return False
    if lowered.startswith(("and ", "or ", "for ")):
        return False

    # Ignore document headings, table headings, and prompt/instruction text.
    noise_exact = {
        "function", "summary", "description", "priority", "requirement",
        "requirements", "purpose", "scope", "references", "term", "definition",
        "user class", "characteristics", "minimum", "recommended requirement",
        "layer", "suitable technology", "interface", "operational requirements",
        "hardware requirements", "software requirements", "non-functional requirements",
        "functional requirements", "table of contents", "document information details",
        "project name", "prepared by", "date", "department", "document status",
        "important rules", "use case diagram rules", "class diagram rules",
        "sequence diagram rules", "erd diagram rules", "activity diagram rules",
        "srs / system description"
    }
    if lowered in noise_exact:
        return False

    if re.match(r"^(software requirements specification|project members?|table of contents)\b", lowered):
        return False
    if re.match(r"^(page\s+\d+|\d+(?:\.\d+)*\.?\s*)$", lowered):
        return False
    if re.match(r"^(fr-?\d+|nfr-?\d+)\s*$", lowered):
        return False
    if lowered in {"class", "sequence", "erd", "activity", "use case", "diagram"}:
        return False
    return True


def clean_modeling_text(text, diagram_type):
    value = str(text or "").replace("\r", "\n")
    focused = extract_relevant_srs_section(value, diagram_type)
    lines = []
    skip_patterns = [
        r"^software requirements specification",
        r"^srs$",
        r"^for$",
        r"^project members?:?$",
        r"^tested by table:?$",
        r"^table of contents$",
        r"^page\s+\d+$",
        r"^tester name$",
        r"^role$",
        r"^test date$",
        r"^signature$",
        r"^(?:\d+(?:\.\d+)?\.?\s+)?functional requirements$",
        r"^(?:\d+(?:\.\d+)?\.?\s+)?non-functional requirements$",
        r"^(?:\d+(?:\.\d+)?\.?\s+)?system features$",
        r"^(?:\d+(?:\.\d+)?\.?\s+)?overall description$",
        r"^(?:\d+(?:\.\d+)?\.?\s+)?product functions$",
        r"^(description|priority|inputs|processing|outputs):?.*$",
        r"^high$",
        r"^laiba arshad$",
        r"^alishba rustam$",
        r"^nayab nazir$",
    ]

    for raw_line in focused.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        if any(re.match(pattern, line, flags=re.I) for pattern in skip_patterns):
            continue
        if is_noisy_modeling_line(line):
            continue
        if re.match(r"^\d+(?:\.\d+)*\.?\s*$", line):
            continue
        lines.append(line)

    return "\n".join(lines) or value


def is_noisy_modeling_line(line):
    value = str(line or "").lower()
    if re.search(r"\b(ww|hb|wa)\b", value) and not re.search(r"\b(shall allow|system shall)\b", value):
        return True
    if "visitor" in value and "shall" in value and len(value.split()) > 10:
        return True
    return False


def extract_relevant_srs_section(text, diagram_type):
    value = str(text or "")
    sections = []
    if diagram_type == "use_case":
        sections = [
            ("3.1 Functional Requirements", "3.2 Non-Functional Requirements"),
            ("3. Specific Requirements", "3.2 Non-Functional Requirements"),
            ("4. Functional Requirements", "5. Non-Functional Requirements"),
            ("Functional Requirements", "Non-Functional Requirements"),
            ("3. System Features", "4. Functional Requirements"),
            ("2.2 Product Functions", "2.3 User Characteristics"),
            ("2.2 Product Functions", "2.3 User Classes"),
        ]
    elif diagram_type in {"class", "erd"}:
        sections = [
            ("5.3 Data Requirements", "6. Appendix"),
            ("7. Data Requirements", "8. Security Requirements"),
            ("3.1 Functional Requirements", "3.2 Non-Functional Requirements"),
            ("Functional Requirements", "Non-Functional Requirements"),
            ("2.2 Product Functions", "2.3 User Characteristics"),
            ("2.2 Product Functions", "2.3 User Classes"),
        ]
    elif diagram_type == "activity":
        sections = [
            ("3.1 Functional Requirements", "3.2 Non-Functional Requirements"),
            ("Functional Requirements", "Non-Functional Requirements"),
            ("3. System Features", "4. Functional Requirements"),
        ]
    else:
        sections = [
            ("3.1 Functional Requirements", "3.2 Non-Functional Requirements"),
            ("Functional Requirements", "Non-Functional Requirements"),
            ("3. System Features", "5. Non-Functional Requirements"),
        ]

    lowered = value.lower()
    for start_label, end_label in sections:
        start = lowered.rfind(start_label.lower())
        if start < 0:
            continue
        end = lowered.find(end_label.lower(), start + len(start_label))
        section = value[start:end if end > start else len(value)]
        if len(section.strip()) > 40:
            return section

    return value

def singular_actor(actor):
    actor = re.sub(r"\s+", " ", str(actor or "")).strip().title()
    mapping = {
        "Users": "User",
        "Members": "Member",
        "Librarians": "Librarian",
        "Administrators": "Administrator",
        "Admins": "Admin",
        "Customers": "Customer",
        "Patients": "Patient",
        "Doctors": "Doctor",
        "Students": "Student",
        "Staff": "Librarian" if "librar" else "Staff",
    }
    return mapping.get(actor, actor)


def detect_actor(sentence):
    lowered = str(sentence or "").lower()

    # SRS style: "Members shall be able to...", "Librarians shall..."
    direct = re.match(
        r"^\s*(members?|librarians?|administrators?|admins?|customers?|students?|patients?|doctors?|users?|staff)\s+shall\b",
        lowered,
        flags=re.I,
    )
    if direct:
        return singular_actor(direct.group(1))

    allow_match = re.search(r"(?:shall\s+)?allow[s]? ([a-zA-Z ]{2,40}?)(?:s)? to\b", lowered)
    if allow_match:
        actor = allow_match.group(1).strip()
        actor = re.sub(r"\b(authori[sz]ed|registered|eligible|system)\b", "", actor).strip()
        if actor:
            return singular_actor(actor)

    actor_map = [
        ("administrator", "Administrator"),
        ("admin", "Admin"),
        ("librarian", "Librarian"),
        ("member", "Member"),
        ("customer", "Customer"),
        ("patient", "Patient"),
        ("doctor", "Doctor"),
        ("student", "Student"),
        ("staff", "Librarian"),
        ("passenger", "Passenger"),
        ("employee", "Employee"),
        ("manager", "Manager"),
        ("user", "User"),
    ]
    for keyword, actor in actor_map:
        if re.search(rf"\b{keyword}s?\b", lowered):
            return actor
    return "User"


def detect_actions(sentence):
    lowered = str(sentence or "").lower()
    actions = []

    # Strong domain-aware patterns for Library Management SRS.
    action_patterns = [
        (["authenticate", "log in", "login", "sign in"], "Log In"),
        (["register", "update, suspend", "suspend", "reactivate", "search member"], "Manage Members"),
        (["view their profile", "current loans", "reservations, fines", "history"], "View Account Details"),
        (["create and update records", "bibliographic records", "library materials"], "Manage Catalog"),
        (["physical copy", "accession number", "barcode and status"], "Track Physical Copies"),
        (["search and filter", "search catalog", "title, author", "isbn", "availability"], "Search Catalog"),
        (["issue and return", "issue items", "issue item", "issue book", "borrow"], "Issue Item"),
        (["return items", "return item", "return book"], "Return Item"),
        (["calculate due dates", "borrowing limits", "account restrictions"], "Validate Borrowing Rules"),
        (["renew loans", "renewal", "renew"], "Renew Loan"),
        (["reserve unavailable", "reserve book", "reserve item", "queue status"], "Reserve Item"),
        (["overdue fines", "calculate overdue", "calculate fine"], "Calculate Fine"),
        (["fine payments", "waivers", "adjustments"], "Record Fine Payment"),
        (["send due-date", "overdue", "reservation-available", "membership-expiry", "notices", "notifications"], "Send Notifications"),
        (["configure loan periods", "limits", "fines", "holidays", "staff roles", "configure policies"], "Configure Policies"),
        (["stock verification", "lost", "damaged", "withdrawn", "under repair"], "Manage Inventory"),
        (["generate circulation", "generate reports", "reports"], "Generate Reports"),
        (["payment", "pay fine", "process payment"], "Process Payment"),
    ]

    for keywords, action in action_patterns:
        if any(keyword in lowered for keyword in keywords) and action not in actions:
            actions.append(action)

    # Generic ecommerce / other system patterns.
    generic_patterns = [
        (["generate srs", "srs document", "requirements specification"], "Generate SRS Document"),
        (["generate editable use case", "generate uml", "uml diagram", "diagram generation"], "Generate UML Diagram"),
        (["ambiguity", "correctness", "completeness"], "Analyze Requirements Quality"),
        (["extract readable text", "uml image", "image description", "describe uploaded"], "Describe UML Image"),
        (["upload file", "upload files", "uploaded documents", "uploaded diagram"], "Upload File"),
        (["preview file", "preview files", "preview uploaded"], "Preview Uploaded File"),
        (["edit generated", "editable"], "Edit Generated Output"),
        (["export", "download", "pdf", "word", "png"], "Export Output"),
        (["sign up"], "Register"),
        (["cart"], "Manage Cart"),
        (["inventory"], "Manage Inventory"),
        (["track order", "track orders"], "Track Order"),
        (["place order", "places order"], "Place Order"),
        (["verify ticket", "ticket"], "Verify Ticket"),
        (["check-in", "check in"], "Check In Passenger"),
        (["luggage", "baggage"], "Record Luggage"),
    ]
    for keywords, action in generic_patterns:
        if any(keyword in lowered for keyword in keywords) and action not in actions:
            actions.append(action)

    if actions:
        return actions

    # If sentence is in "shall be able to..." format, convert the actual verb phrase.
    return [detect_action(sentence)]


def detect_action(sentence):
    lowered = str(sentence or "").lower()

    # Ignore headings and table labels.
    if lowered.strip(" :-•*") in {"function", "summary", "description", "requirement", "scope", "purpose"}:
        return "Use System"

    ability_match = re.search(
        r"(?:shall|must|should)\s+(?:be able to\s+)?(.+)",
        str(sentence),
        flags=re.I,
    )
    if ability_match:
        return action_to_label(ability_match.group(1))

    allow_match = re.search(r"shall allow [a-zA-Z ]{2,40}?s? to ([^.]+)", str(sentence), flags=re.I)
    if allow_match:
        return action_to_label(allow_match.group(1))

    patterns = [
        (["search catalog", "search and filter", "search"], "Search Catalog"),
        (["manage members", "register", "suspend", "reactivate"], "Manage Members"),
        (["manage catalog", "bibliographic", "library materials"], "Manage Catalog"),
        (["issue"], "Issue Item"),
        (["return"], "Return Item"),
        (["renew"], "Renew Loan"),
        (["reserve"], "Reserve Item"),
        (["fine"], "Calculate Fine"),
        (["payment", "pay"], "Process Payment"),
        (["report"], "Generate Reports"),
        (["configure"], "Configure Policies"),
        (["inventory", "stock"], "Manage Inventory"),
        (["view", "display", "show"], "View Information"),
        (["create", "add"], "Create Record"),
        (["update", "edit"], "Update Record"),
        (["delete", "remove"], "Delete Record"),
        (["predict"], "Generate Prediction"),
        (["forecast"], "Generate Forecast"),
        (["upload"], "Upload File"),
        (["download", "export"], "Download Output"),
    ]
    for keywords, action in patterns:
        if any(keyword in lowered for keyword in keywords):
            return action

    words = re.findall(r"[a-zA-Z]+", str(sentence))
    return " ".join(words[:4]).title() if words else "Use System"

def action_to_label(action):
    text = re.sub(r"\s+", " ", str(action or "")).strip()
    text = re.sub(r"^(allow|support|provide|display|record|process)\s+", "", text, flags=re.I)
    text = re.split(r"\s+\b(before|after|using|with|when|if|through|for|unless|according)\b\s+", text, maxsplit=1, flags=re.I)[0]

    lowered = text.lower()
    combined_patterns = [
        (["register", "update", "suspend", "reactivate", "member"], "Manage Members"),
        (["create", "update", "records", "books", "library materials"], "Manage Catalog"),
        (["issue", "return"], "Manage Circulation"),
        (["record", "fine payments", "waivers"], "Record Fine Payment"),
        (["configure", "loan periods"], "Configure Policies"),
        (["generate", "circulation", "overdue", "inventory", "membership", "fine reports"], "Generate Reports"),
    ]
    for keywords, label in combined_patterns:
        if all(keyword in lowered for keyword in keywords[:2]) or any(keyword in lowered for keyword in keywords):
            if label != "Manage Catalog" or ("record" in lowered or "book" in lowered or "material" in lowered):
                return label

    replacements = [
        (r"\btheir profile.*", "View Account Details"),
        (r"\bcurrent loans.*", "View Current Loans"),
        (r"\breservations.*", "View Reservations"),
        (r"\bfines.*", "View Fines"),
        (r"\bhistory.*", "View History"),
        (r"\bsearch.*", "Search Catalog"),
        (r"\brenew.*", "Renew Loan"),
        (r"\breserve.*", "Reserve Item"),
        (r"\bcalculate.*fine.*", "Calculate Fine"),
        (r"\bsend.*notice.*", "Send Notifications"),
    ]
    for pattern, label in replacements:
        if re.search(pattern, lowered, flags=re.I):
            return label

    words = re.findall(r"[A-Za-z0-9]+", text)
    stop = {"the", "a", "an", "and", "or", "with", "before", "after", "using", "through", "from", "to", "their", "be", "able"}
    label_words = [word for word in words if word.lower() not in stop][:5]
    label = " ".join(label_words).title() if label_words else "Use System"

    bad = {"Function", "Summary", "Description", "Requirement", "Scope", "Purpose"}
    return "Use System" if label in bad else label

def generate_use_case(requirements):
    actors = []
    links = []
    use_cases = []

    for sentence in requirements:
        actor = detect_actor(sentence)
        if actor == "User" and not re.search(r"\buser\b", sentence, flags=re.I) and actors:
            actor = actors[-1]
        if actor not in actors:
            actors.append(actor)
        for action in detect_actions(sentence):
            if is_weak_diagram_action(action):
                continue
            if action not in use_cases:
                use_cases.append(action)
            if (actor, action) not in links:
                links.append((actor, action))

    lines = ["@startuml", "left to right direction"]
    for actor in actors:
        lines.append(f"actor {actor}")
    lines.append("rectangle System {")
    for use_case in use_cases:
        lines.append(f"  ({use_case})")
    lines.append("}")
    for actor, use_case in links:
        lines.append(f"{actor} --> ({use_case})")
    lines.append("@enduml")

    return {
        "diagram_type": "use_case",
        "plantuml": "\n".join(lines),
        "actors": actors,
        "use_cases": use_cases,
        "links": [{"actor": actor, "use_case": use_case} for actor, use_case in links],
    }


def generate_class_diagram(requirements):
    nouns = extract_domain_nouns(requirements)
    if not nouns:
        nouns = ["User", "Record", "Report"]
    class_details = build_class_details(nouns)

    lines = ["@startuml"]
    for item in class_details[:8]:
        lines.extend([
            f"class {item['name']} {{",
            *[f"  +{attribute}" for attribute in item["attributes"]],
            *[f"  +{method}" for method in item["methods"]],
            "}",
        ])
    relationships = infer_class_relationships(class_details[:8])
    if not relationships and len(nouns) >= 2:
        relationships = [{"from": nouns[0], "to": nouns[1], "type": "association", "label": "manages"}]
    for relationship in relationships:
        lines.append(f"{relationship['from']} --> {relationship['to']} : {relationship['label']}")
    lines.append("@enduml")

    return {
        "diagram_type": "class",
        "plantuml": "\n".join(lines),
        "classes": nouns[:8],
        "class_details": class_details[:8],
        "relationships": relationships,
    }


def infer_class_relationships(class_details):
    names = [item["name"] for item in class_details]
    normalized = {re.sub(r"[^a-z0-9]", "", name.lower()): name for name in names}
    relationships = []
    seen = set()
    for item in class_details:
        source = item["name"]
        for attribute in item.get("attributes", []):
            raw_name = re.split(r"\s*:\s*|\s+", str(attribute).strip(), maxsplit=1)[0]
            reference = re.sub(r"(?:_id|Id|ID)$", "", raw_name)
            target = normalized.get(re.sub(r"[^a-z0-9]", "", reference.lower()))
            if not target or target == source:
                continue
            pair = tuple(sorted((source, target)))
            if pair in seen:
                continue
            seen.add(pair)
            relationships.append({
                "from": target,
                "to": source,
                "type": "association",
                "label": f"has {source}",
            })
    return relationships


def generate_sequence_diagram(requirements):
    actors = []
    messages = []
    for sentence in requirements:
        actor = detect_actor(sentence)
        if actor not in actors:
            actors.append(actor)

    lines = ["@startuml"]
    for actor in actors:
        lines.append(f"actor {actor}")
    lines.extend(["participant Frontend", "participant Backend", "database Database"])

    useful_sentences = [sentence for sentence in requirements if not all(is_weak_diagram_action(action) for action in detect_actions(sentence))]
    for sentence in useful_sentences[:6]:
        actor = detect_actor(sentence)
        for action in detect_actions(sentence):
            if is_weak_diagram_action(action):
                continue
            if any(message["actor"] == actor and message["action"] == action for message in messages):
                continue
            messages.append({"actor": actor, "action": action})
            lines.append(f"{actor} -> Frontend : {action}")
            lines.append("Frontend -> Backend : submit request")
            lines.append("Backend -> Database : read/write data")
            lines.append("Database --> Backend : result")
            lines.append("Backend --> Frontend : response")
            if len(messages) >= 8:
                break
        if len(messages) >= 8:
            break
    lines.append("@enduml")

    return {"diagram_type": "sequence", "plantuml": "\n".join(lines), "actors": actors, "messages": messages}


def generate_erd(requirements):
    entities = extract_domain_nouns(requirements)
    if not entities:
        entities = ["User", "Project", "Record", "Report"]
    entity_details = build_entity_details(entities)

    lines = ["@startuml"]
    for item in entity_details[:8]:
        lines.extend([
            f"entity {item['name']} {{",
            f"  * {item['attributes'][0]}",
            "  --",
            *[f"  {attribute}" for attribute in item["attributes"][1:]],
            "}",
        ])
    for entity in entities[1:6]:
        lines.append(f"{entities[0]} ||--o{{ {entity}")
    lines.append("@enduml")

    return {"diagram_type": "erd", "plantuml": "\n".join(lines), "entities": entities[:8], "entity_details": entity_details[:8]}


def generate_activity_diagram(requirements):
    lines = ["@startuml", "start"]
    actions = []
    useful_sentences = [sentence for sentence in requirements if not all(is_weak_diagram_action(action) for action in detect_actions(sentence))]
    for sentence in useful_sentences[:10]:
        for action in detect_actions(sentence):
            if is_weak_diagram_action(action):
                continue
            if action in actions:
                continue
            actions.append(action)
            lines.append(f":{action};")
            if len(actions) >= 10:
                break
        if len(actions) >= 10:
            break
    lines.extend(["stop", "@enduml"])

    return {"diagram_type": "activity", "plantuml": "\n".join(lines), "actions": actions}


def is_weak_diagram_action(action):
    value = str(action or "").strip().lower()
    if not value:
        return True
    weak_values = {
        "software requirements specification for",
        "and uml diagram images",
        "and activity diagrams",
        "correctness",
        "and completeness",
        "class",
        "sequence",
        "erd",
        "activity",
        "function",
        "summary",
        "description",
        "requirement",
        "scope",
        "purpose",
        "use system",
    }
    return value in weak_values


def extract_domain_nouns(requirements):
    text = " ".join(requirements).lower()
    candidates = {
        "user": "User",
        "admin": "Admin",
        "administrator": "Administrator",
        "student": "Student",
        "member": "Member",
        "librarian": "Librarian",
        "book": "Book",
        "catalog": "Catalog",
        "copy": "BookCopy",
        "accession": "BookCopy",
        "loan": "Loan",
        "borrow": "Loan",
        "return": "ReturnRecord",
        "reservation": "Reservation",
        "fine": "Fine",
        "payment": "Payment",
        "notification": "Notification",
        "report": "Report",
        "order": "Order",
        "product": "Product",
        "patient": "Patient",
        "doctor": "Doctor",
        "appointment": "Appointment",
        "report": "Report",
        "dataset": "Dataset",
        "forecast": "Forecast",
        "prediction": "Prediction",
        "inventory": "Inventory",
        "srs": "SRSDocument",
        "requirement": "Requirement",
        "uml": "UMLDiagram",
        "diagram": "UMLDiagram",
        "upload": "UploadedFile",
        "file": "UploadedFile",
        "history": "ActivityHistory",
        "analysis": "AnalysisReport",
        "ambiguity": "AmbiguityReport",
        "output": "GeneratedOutput",
        "project": "Project",
        "cart": "Cart",
        "checkout": "Checkout",
        "ticket": "Ticket",
        "passenger": "Passenger",
        "luggage": "Luggage",
    }
    detected = []
    for keyword, name in candidates.items():
        if keyword in text and name not in detected:
            detected.append(name)
    return detected


def build_class_details(classes):
    details = []
    for name in classes:
        base = re.sub(r"(?<!^)([A-Z])", r"_\1", name).lower()
        attributes = [f"{base}_id", "name"]
        methods = ["create()", "update()"]
        if name == "User":
            attributes = ["user_id", "full_name", "email", "role"]
            methods = ["login()", "updateProfile()"]
        elif name in {"SRSDocument", "UMLDiagram", "GeneratedOutput"}:
            attributes = [f"{base}_id", "project_id", "title", "created_at"]
            methods = ["generate()", "export()"]
        elif name == "UploadedFile":
            attributes = ["file_id", "original_name", "file_type", "file_path"]
            methods = ["validate()", "extractText()"]
        elif name in {"AnalysisReport", "AmbiguityReport"}:
            attributes = ["report_id", "score", "findings", "created_at"]
            methods = ["analyze()", "summarize()"]
        elif name == "Member":
            attributes = ["member_id", "full_name", "email", "status"]
            methods = ["register()", "updateProfile()"]
        elif name == "Librarian":
            attributes = ["librarian_id", "full_name", "email", "role"]
            methods = ["issueItem()", "returnItem()"]
        elif name == "Book":
            attributes = ["book_id", "title", "author", "isbn"]
            methods = ["createRecord()", "updateRecord()"]
        elif name == "BookCopy":
            attributes = ["copy_id", "accession_number", "barcode", "status"]
            methods = ["markLost()", "markDamaged()"]
        elif name == "Loan":
            attributes = ["loan_id", "member_id", "copy_id", "due_date"]
            methods = ["issue()", "renew()", "close()"]
        elif name == "Reservation":
            attributes = ["reservation_id", "member_id", "book_id", "queue_status"]
            methods = ["create()", "cancel()"]
        elif name == "Fine":
            attributes = ["fine_id", "member_id", "amount", "status"]
            methods = ["calculate()", "waive()"]
        elif name in {"Product", "Order", "Payment", "Cart"}:
            attributes = [f"{base}_id", "status", "amount", "created_at"]
            methods = ["create()", "updateStatus()"]
        details.append({"name": name, "attributes": attributes, "methods": methods})
    return details


def build_entity_details(entities):
    details = []
    for name in entities:
        base = re.sub(r"(?<!^)([A-Z])", r"_\1", name).lower()
        attributes = [f"{base}_id", "name", "created_at"]
        if name == "User":
            attributes = ["user_id", "full_name", "email", "role"]
        elif name == "Member":
            attributes = ["member_id", "full_name", "email", "membership_status"]
        elif name == "Librarian":
            attributes = ["librarian_id", "full_name", "email", "role"]
        elif name == "Book":
            attributes = ["book_id", "title", "author", "isbn", "category"]
        elif name == "BookCopy":
            attributes = ["copy_id", "book_id", "accession_number", "barcode", "status"]
        elif name == "Loan":
            attributes = ["loan_id", "member_id", "copy_id", "issue_date", "due_date", "return_date"]
        elif name == "Reservation":
            attributes = ["reservation_id", "member_id", "book_id", "queue_status"]
        elif name == "Fine":
            attributes = ["fine_id", "member_id", "loan_id", "amount", "status"]
        elif name in {"Order", "Payment"}:
            attributes = [f"{base}_id", "user_id", "amount", "status", "created_at"]
        elif name == "Product":
            attributes = ["product_id", "name", "price", "stock_quantity"]
        elif name in {"SRSDocument", "UMLDiagram", "GeneratedOutput"}:
            attributes = [f"{base}_id", "project_id", "title", "created_at"]
        elif name == "UploadedFile":
            attributes = ["file_id", "project_id", "original_name", "file_type"]
        details.append({"name": name, "attributes": attributes})
    return details

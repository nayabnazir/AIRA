from collections import defaultdict
from pathlib import Path
import re

import joblib
from sklearn.metrics.pairwise import cosine_similarity
from ai.cloud_ai_provider import cloud_ai_available, generate_json


INDEX_PATH = Path(__file__).resolve().parents[1] / "models" / "srs_generation_index.joblib"


DEFAULT_FUNCTIONAL = [
    "The system shall allow users to create an account using required profile and login information.",
    "The system shall authenticate registered users using email and password before protected pages are displayed.",
    "The system shall validate submitted project details before generation starts.",
    "The system shall store each generated output with its title, type, and creation timestamp.",
]

DEFAULT_NON_FUNCTIONAL = [
    "The system shall display labels, validation messages, and action buttons consistently across all generation pages.",
    "The system shall validate required fields before submission.",
    "The system shall restrict stored project outputs to authenticated and authorized users.",
    "The system shall support the latest stable versions of Chrome, Edge, and Firefox.",
]

DOMAIN_PROFILES = {
    "library management": {
        "patterns": [r"\blibrary\b", r"\blibrarian\b", r"\bborrow(?:ing)?\b", r"\bbook returns?\b"],
        "actors": ["member", "librarian", "admin"],
        "features": ["search the book catalog", "manage book and member records", "issue and return books", "calculate overdue fines", "generate circulation reports"],
        "data": ["Book records", "Member records", "Borrowing and return records", "Fine and reservation records"],
    },
    "student management": {
        "patterns": [r"\bstudent management\b", r"\bstudent records?\b", r"\benrollment\b", r"\badmissions?\b"],
        "actors": ["student", "teacher", "admin"],
        "features": ["manage student profiles", "process admissions and enrollment", "record attendance", "record grades and results", "generate student reports"],
        "data": ["Student profiles", "Admission and enrollment records", "Attendance records", "Grade and result records"],
    },
    "school management": {
        "patterns": [r"\bschool management\b", r"\bschool portal\b", r"\bparents?\b.*\bteachers?\b"],
        "actors": ["student", "teacher", "parent", "admin"],
        "features": ["manage classes and subjects", "record attendance and grades", "manage fee records", "publish timetables and notices", "generate academic reports"],
        "data": ["Student and parent records", "Class and subject records", "Attendance and grade records", "Fee and timetable records"],
    },
    "university management": {
        "patterns": [r"\buniversity\b", r"\bsemester\b", r"\bdepartments?\b.*\bcourses?\b"],
        "actors": ["student", "teacher", "staff", "admin"],
        "features": ["manage departments and programs", "register students in courses", "publish semester timetables", "record grades and transcripts", "manage fee and graduation records"],
        "data": ["Student and faculty records", "Department and program records", "Course registration records", "Transcript and fee records"],
    },
    "hospital management": {
        "patterns": [r"\bhospital management\b", r"\bhospital\b", r"\bwards?\b", r"\binpatients?\b"],
        "actors": ["patient", "doctor", "nurse", "receptionist", "admin"],
        "features": ["register patients", "schedule appointments", "manage admissions and beds", "record diagnoses and treatments", "manage billing and discharge"],
        "data": ["Patient records", "Appointment and admission records", "Treatment and prescription records", "Billing and discharge records"],
    },
    "clinic management": {
        "patterns": [r"\bclinic management\b", r"\bclinics?\b", r"\boutpatient\b"],
        "actors": ["patient", "doctor", "receptionist", "admin"],
        "features": ["register patients", "schedule clinic appointments", "manage doctor schedules", "record consultation notes", "manage invoices and reminders"],
        "data": ["Patient records", "Doctor schedule records", "Appointment records", "Consultation and invoice records"],
    },
    "pharmacy management": {
        "patterns": [r"\bpharmacy\b", r"\bmedicines?\b", r"\bprescriptions?\b", r"\bdrug inventory\b"],
        "actors": ["pharmacist", "customer", "supplier", "admin"],
        "features": ["manage medicine inventory", "process prescriptions", "record medicine sales", "track expiry and reorder levels", "manage suppliers"],
        "data": ["Medicine records", "Prescription records", "Sales records", "Supplier and stock records"],
    },
    "e-commerce": {
        "patterns": [r"\bonline shopping\b", r"\bonline store\b", r"\be-?commerce\b", r"\bshopping cart\b", r"\bcheckout\b"],
        "actors": ["customer", "vendor", "admin"],
        "features": ["manage customer accounts", "browse and search products", "manage shopping carts", "place and track orders", "process payments and inventory"],
        "data": ["Customer records", "Product and inventory records", "Cart and order records", "Payment and delivery records"],
    },
    "inventory management": {
        "patterns": [r"\binventory management\b", r"\bstock levels?\b", r"\bsuppliers?\b", r"\brestock\b"],
        "actors": ["staff", "manager", "supplier", "admin"],
        "features": ["manage items and categories", "record stock receipts and issues", "monitor stock levels", "manage suppliers and purchase orders", "generate inventory reports"],
        "data": ["Item and category records", "Stock transaction records", "Supplier records", "Purchase order records"],
    },
    "point of sale management": {
        "patterns": [r"\bpoint of sale\b", r"\bpos system\b", r"\bcashier\b", r"\bsales receipt\b"],
        "actors": ["cashier", "manager", "customer", "admin"],
        "features": ["scan and select products", "calculate sales totals and taxes", "process payments", "print receipts", "update stock and sales reports"],
        "data": ["Product and price records", "Sales transaction records", "Payment records", "Receipt and shift records"],
    },
    "customer relationship management": {
        "patterns": [r"\bcustomer relationship management\b", r"\bcrm\b", r"\bleads?\b", r"\bsales pipeline\b"],
        "actors": ["sales representative", "manager", "customer", "admin"],
        "features": ["manage customer profiles", "track leads and opportunities", "record communications", "schedule follow-ups", "generate sales pipeline reports"],
        "data": ["Customer and contact records", "Lead and opportunity records", "Communication records", "Follow-up and sales records"],
    },
    "hotel management": {
        "patterns": [r"\bhotel management\b", r"\bhotel rooms?\b", r"\bguest check-?in\b", r"\broom booking\b"],
        "actors": ["guest", "receptionist", "staff", "manager"],
        "features": ["search room availability", "create and modify reservations", "process guest check-in and check-out", "manage room status and services", "prepare bills and occupancy reports"],
        "data": ["Guest records", "Room and availability records", "Reservation records", "Service and billing records"],
    },
    "travel reservation management": {
        "patterns": [r"\btravel reservation\b", r"\btravel agency\b", r"\bitinerary\b", r"\bbook flights?\b.*\bhotels?\b"],
        "actors": ["traveler", "agent", "staff", "admin"],
        "features": ["search travel options", "prepare itineraries", "book flights and hotels", "manage reservations and cancellations", "process payments"],
        "data": ["Traveler records", "Itinerary records", "Flight and hotel records", "Booking and payment records"],
    },
    "vehicle rental management": {
        "patterns": [r"\bvehicle rental\b", r"\bcar rental\b", r"\brent vehicles?\b"],
        "actors": ["customer", "staff", "manager", "admin"],
        "features": ["search available vehicles", "create rental reservations", "verify customer and vehicle details", "process pickup and return", "calculate rental charges"],
        "data": ["Customer records", "Vehicle and availability records", "Rental agreement records", "Payment and inspection records"],
    },
    "banking management": {
        "patterns": [r"\bbanking management\b", r"\bbank accounts?\b", r"\bdeposit\b", r"\bwithdrawal\b"],
        "actors": ["customer", "teller", "manager", "admin"],
        "features": ["manage customer accounts", "process deposits and withdrawals", "transfer funds", "manage loans and statements", "monitor suspicious transactions"],
        "data": ["Customer and account records", "Transaction records", "Loan records", "Statement and audit records"],
    },
    "online payment management": {
        "patterns": [r"\bonline payment\b", r"\bpayment gateway\b", r"\bdigital wallet\b"],
        "actors": ["customer", "merchant", "finance staff", "admin"],
        "features": ["initiate payments", "verify payment details", "request refunds", "process approved refunds", "track transaction status", "generate settlement reports"],
        "data": ["Customer and merchant records", "Payment transaction records", "Refund records", "Settlement and audit records"],
    },
    "employee management": {
        "patterns": [r"\bemployee management\b", r"\bemployee records?\b", r"\bhuman resources?\b"],
        "actors": ["employee", "manager", "hr officer", "admin"],
        "features": ["manage employee profiles", "record attendance and leave", "manage departments and positions", "conduct performance reviews", "generate HR reports"],
        "data": ["Employee records", "Department and position records", "Attendance and leave records", "Performance review records"],
    },
    "payroll management": {
        "patterns": [r"\bpayroll\b", r"\bsalar(?:y|ies)\b", r"\bpayslips?\b"],
        "actors": ["employee", "hr officer", "accountant", "admin"],
        "features": ["manage salary structures", "calculate payroll and deductions", "process allowances and overtime", "generate payslips", "produce payroll reports"],
        "data": ["Employee salary records", "Attendance and overtime records", "Deduction and allowance records", "Payroll and payslip records"],
    },
    "restaurant management": {
        "patterns": [r"\brestaurant\b", r"\bfood orders?\b", r"\btable reservations?\b", r"\bkitchen orders?\b"],
        "actors": ["customer", "waiter", "chef", "cashier", "manager"],
        "features": ["manage menus and tables", "create food orders", "send orders to the kitchen", "process bills and payments", "manage inventory and sales reports"],
        "data": ["Menu and table records", "Order and kitchen records", "Payment records", "Inventory and sales records"],
    },
    "appointment booking management": {
        "patterns": [r"\bappointment booking\b", r"\bbook appointments?\b", r"\bappointment slots?\b"],
        "actors": ["customer", "service provider", "receptionist", "admin"],
        "features": ["view available appointment slots", "book and reschedule appointments", "cancel appointments", "send appointment reminders", "manage provider schedules"],
        "data": ["Customer records", "Provider schedule records", "Appointment records", "Reminder and cancellation records"],
    },
    "gym and fitness management": {
        "patterns": [r"\bgym\b", r"\bfitness\b", r"\btrainers?\b", r"\bworkouts?\b", r"\bmembership\b"],
        "actors": ["member", "trainer", "staff", "manager"],
        "features": ["manage membership plans and subscriptions", "book trainer sessions and fitness classes", "record attendance", "record membership payments", "track equipment maintenance"],
        "data": ["Member and membership records", "Trainer and class records", "Attendance records", "Payment and equipment records"],
    },
    "waste collection management": {
        "patterns": [r"\bwaste\b", r"\bgarbage\b", r"\bbins?\b", r"\brecycling\b", r"\bcollection routes?\b"],
        "actors": ["resident", "driver", "manager", "admin"],
        "features": ["report overflowing or damaged bins", "plan collection routes", "monitor bin fill levels", "track collection vehicles", "record pickups and recycling performance"],
        "data": ["Bin and service-area records", "Resident report records", "Route and pickup records", "Sensor and vehicle records"],
    },
    "event management": {
        "patterns": [r"\bevent management\b", r"\bevent registration\b", r"\bvenues?\b.*\battendees?\b"],
        "actors": ["organizer", "attendee", "vendor", "admin"],
        "features": ["create and publish events", "manage venues and schedules", "register attendees", "manage tickets and payments", "coordinate vendors and reports"],
        "data": ["Event and schedule records", "Venue records", "Attendee and ticket records", "Vendor and payment records"],
    },
    "courier management": {
        "patterns": [r"\bcourier\b", r"\bparcels?\b", r"\bshipments?\b", r"\bdelivery tracking\b"],
        "actors": ["customer", "courier", "dispatcher", "admin"],
        "features": ["register shipments", "calculate delivery charges", "assign couriers and routes", "track parcel status", "confirm delivery"],
        "data": ["Customer and address records", "Shipment records", "Courier and route records", "Delivery and payment records"],
    },
    "real estate management": {
        "patterns": [r"\breal estate\b", r"\bproperties?\b", r"\btenants?\b", r"\blease agreements?\b"],
        "actors": ["customer", "agent", "owner", "admin"],
        "features": ["manage property listings", "search properties", "schedule viewings", "manage inquiries and offers", "manage leases and payments"],
        "data": ["Property records", "Customer and agent records", "Viewing and inquiry records", "Lease and payment records"],
    },
    "hostel management": {
        "patterns": [r"\bhostel management\b", r"\bhostel rooms?\b", r"\broom allocation\b"],
        "actors": ["student", "warden", "staff", "admin"],
        "features": ["manage hostel rooms and beds", "allocate rooms to residents", "record fee payments", "manage complaints and visitors", "generate occupancy reports"],
        "data": ["Resident records", "Room and bed records", "Allocation records", "Fee, complaint, and visitor records"],
    },
    "examination management": {
        "patterns": [r"\bexamination management\b", r"\bexam schedules?\b", r"\bquestion papers?\b"],
        "actors": ["student", "teacher", "exam officer", "admin"],
        "features": ["schedule examinations", "manage question papers", "register candidates", "record marks and results", "publish examination reports"],
        "data": ["Exam and schedule records", "Candidate records", "Question paper records", "Mark and result records"],
    },
    "learning management": {
        "patterns": [r"\blearning management\b", r"\blms\b", r"\bonline courses?\b", r"\bassignments?\b.*\bquizzes?\b"],
        "actors": ["student", "teacher", "admin"],
        "features": ["manage courses and lessons", "enroll learners", "publish learning materials", "manage assignments and quizzes", "track progress and grades"],
        "data": ["Course and lesson records", "Enrollment records", "Learning material records", "Assignment, quiz, progress, and grade records"],
    },
    "airline reservation management": {
        "patterns": [r"\bairline reservation\b", r"\bflight reservation\b", r"\bboarding passes?\b"],
        "actors": ["passenger", "agent", "staff", "admin"],
        "features": ["search flights", "create and modify reservations", "select seats and services", "process check-in and boarding", "manage payments and cancellations"],
        "data": ["Passenger records", "Flight and schedule records", "Reservation and seat records", "Payment, check-in, and boarding records"],
    },
    "insurance management": {
        "patterns": [r"\binsurance management\b", r"\bpolic(?:y|ies)\b", r"\bclaims?\b", r"\bpremiums?\b"],
        "actors": ["customer", "agent", "claims officer", "admin"],
        "features": ["manage customers and policies", "calculate and collect premiums", "submit and assess claims", "track claim status", "generate policy and claim reports"],
        "data": ["Customer records", "Policy records", "Premium payment records", "Claim and assessment records"],
    },
    "weather forecasting": {
        "patterns": [
            r"\bweather\b", r"\bforecast(?:ing)?\b", r"\btemperature\b",
            r"\bhumidity\b", r"\bwind speed\b", r"\bweather alerts?\b",
        ],
        "actors": ["user", "admin"],
        "features": [
            "search weather by city or location",
            "view current weather conditions",
            "view hourly and daily forecasts",
            "view temperature, humidity, wind, and precipitation details",
            "receive severe-weather alerts",
            "save preferred locations",
        ],
        "data": [
            "Location and preferred-location records",
            "Current weather observation records",
            "Hourly and daily forecast records",
            "Weather alert records",
            "External weather-service response records",
        ],
    },
}


def load_index():
    if not INDEX_PATH.exists():
        raise FileNotFoundError(f"SRS generation index not found: {INDEX_PATH}")
    return joblib.load(INDEX_PATH)


def retrieve_requirements(prompt, top_n=30):
    bundle = load_index()
    vectorizer = bundle["vectorizer"]
    matrix = bundle["matrix"]
    requirements = bundle["requirements"]

    query_vec = vectorizer.transform([str(prompt)])
    similarities = cosine_similarity(query_vec, matrix)[0]
    ranked_indexes = similarities.argsort()[::-1][:top_n]

    results = []
    for index in ranked_indexes:
        item = dict(requirements[index])
        item["Similarity"] = float(similarities[index])
        results.append(item)
    return results


def generate_srs(project_title, project_description="", top_n=30, language="English"):
    project_title = clean_project_title(project_title)
    project_description = sanitize_project_description(correct_common_typos(project_description))
    if project_title == "The Proposed System":
        project_title = infer_project_title_from_description(project_description) or project_title

    if cloud_ai_available():
        try:
            return generate_cloud_srs(project_title, project_description, language)
        except Exception as error:
            raise RuntimeError(
                "The AI provider could not produce a complete, quality-validated SRS. "
                f"Please try again. Provider details: {error}"
            ) from error

    prompt = f"{project_title}. {project_description}".strip()
    retrieved = retrieve_requirements(prompt, top_n=top_n)
    grouped = group_requirements(retrieved)

    context = analyze_project_context(project_title, project_description)

    functional = build_functional_requirements(project_title, project_description, context)
    functional.extend(extract_document_requirements(project_description, context)[:8])
    functional.extend(grouped.get("Functional", [])[:4])
    functional = unique_items(functional)[:10] or DEFAULT_FUNCTIONAL

    non_functional = build_non_functional_requirements(project_title, context)
    non_functional.extend(build_non_functional_list(grouped)[:4])
    non_functional = unique_items(non_functional)[:10] or DEFAULT_NON_FUNCTIONAL

    srs_text = format_srs(project_title, project_description, functional, non_functional, context)

    return {
        "project_title": project_title,
        "source": "retrieval_template",
        "retrieved_count": len(retrieved),
        "srs": srs_text,
        "srs_html": format_srs_html(srs_text),
        "matched_requirements": retrieved[:10],
    }


def generate_cloud_srs(project_title, project_description, language="English"):
    evidence = project_description.strip() or (
        f"Create a complete software requirements specification for a conventional "
        f"{project_title}. Infer only standard, realistic capabilities for this domain."
    )
    prompt = f"""
You are a senior requirements engineer. Produce a professional, evaluator-ready
Software Requirements Specification for the project below.

PROJECT TITLE:
{project_title}

PROJECT EVIDENCE AND REQUEST:
{evidence}

OUTPUT LANGUAGE:
{language or "English"}

Return one JSON object only:
{{
  "project_title": "{project_title}",
  "srs": "the complete plain-text SRS document"
}}

NON-NEGOTIABLE QUALITY RULES:
- Write a genuinely project-specific document. Never reuse generic paragraphs
  with only the project title changed.
- Every requirement must be relevant to this project's actors, workflow, data,
  and business rules.
- Correctly assign responsibilities. For example, customers request refunds;
  authorized finance or operational staff approve/process them.
- Do not invent features that conflict with the supplied evidence.
- When only a topic is supplied, infer a realistic conventional scope and state
  assumptions explicitly.
- Include at least 18 distinct functional requirements with IDs FR-001 onward.
- Each functional requirement must state actor, action, validation/business
  rule, expected result, and a concise acceptance criterion.
- Include at least 12 measurable non-functional requirements with IDs NFR-001
  onward covering performance, security, availability, usability,
  maintainability, compatibility, auditability, backup, and recovery.
- Avoid vague words such as fast, easy, efficient, appropriate, user-friendly,
  and secure unless followed by a measurable definition.
- Do not repeat sentences, requirements, or boilerplate paragraphs.
- Keep the wording testable and implementation-neutral.
- Use plain text only, without Markdown # headings or fenced code blocks.

Use these exact numbered section headings, in this exact order:
Software Requirements Specification (SRS)
For
Project Name: {project_title}
TABLE OF CONTENTS
1. Introduction
1.1 Purpose
1.2 Scope
1.3 Intended Audience
1.4 Definitions and Abbreviations
1.5 Document Overview
2. Overall Description
2.1 Product Perspective
2.2 Product Functions
2.3 User Classes and Characteristics
2.4 Operating Environment
2.5 Design and Implementation Constraints
2.6 Assumptions and Dependencies
3. System Features
4. Functional Requirements
5. Non-Functional Requirements
6. External Interface Requirements
6.1 User Interface Requirements
6.2 Hardware Interface Requirements
6.3 Software Interface Requirements
6.4 Communication Interface Requirements
7. Data Requirements
8. Security Requirements
9. Performance Requirements
10. Reliability and Availability Requirements
11. Acceptance Criteria
12. Out of Scope
13. Conclusion
14. Appendix

Within the document also include:
- a domain-specific actor/responsibility list;
- core workflows and alternate/error flows;
- domain-specific entities, important fields, validation rules, retention, and
  relationships;
- a requirement traceability list mapping major capabilities to FR IDs;
- concrete acceptance criteria that an evaluator can test.
"""
    result, provider = generate_json(prompt, timeout=165)
    srs_text = str(result.get("srs") or result.get("document") or "").strip()
    returned_title = clean_project_title(result.get("project_title") or project_title)
    validate_cloud_srs(srs_text, returned_title)
    return {
        "project_title": returned_title,
        "source": f"cloud_ai:{provider}",
        "retrieved_count": 0,
        "srs": srs_text,
        "srs_html": format_srs_html(srs_text),
        "matched_requirements": [],
    }


def validate_cloud_srs(srs_text, project_title):
    if len(srs_text) < 7000:
        raise ValueError("AI-generated SRS was too short to meet the quality standard.")

    required_sections = [
        "1. Introduction",
        "2. Overall Description",
        "3. System Features",
        "4. Functional Requirements",
        "5. Non-Functional Requirements",
        "7. Data Requirements",
        "8. Security Requirements",
        "11. Acceptance Criteria",
        "14. Appendix",
    ]
    missing = [section for section in required_sections if section.lower() not in srs_text.lower()]
    if missing:
        raise ValueError("AI-generated SRS omitted required sections.")

    if len(re.findall(r"\bFR-\d{3}\b", srs_text, flags=re.I)) < 15:
        raise ValueError("AI-generated SRS did not contain enough functional requirements.")
    if len(re.findall(r"\bNFR-\d{3}\b", srs_text, flags=re.I)) < 8:
        raise ValueError("AI-generated SRS did not contain enough non-functional requirements.")

    sentences = [
        re.sub(r"\s+", " ", sentence).strip().lower()
        for sentence in re.split(r"(?<=[.!?])\s+", srs_text)
        if len(sentence.strip()) >= 45
    ]
    if sentences and len(set(sentences)) / len(sentences) < 0.88:
        raise ValueError("AI-generated SRS contained excessive repeated wording.")

    title_terms = {
        word.lower() for word in re.findall(r"[A-Za-z]{5,}", project_title)
        if word.lower() not in {"system", "management", "application", "software"}
    }
    if title_terms and not any(srs_text.lower().count(term) >= 3 for term in title_terms):
        raise ValueError("AI-generated SRS was not sufficiently specific to the project.")


def group_requirements(requirements):
    grouped = defaultdict(list)
    seen = set()

    for item in requirements:
        if item.get("Similarity", 0) < 0.30:
            continue
        requirement = normalize_requirement_text(item["Requirement"].strip())
        if is_ambiguous_requirement(requirement):
            continue
        clean = requirement.lower()
        if clean in seen:
            continue
        seen.add(clean)
        grouped[item["Category"]].append(requirement)

    return grouped


def analyze_project_context(project_title, project_description):
    text = f"{project_title}. {project_description}".lower()
    domain = detect_domain(text)
    actors = detect_actors(text, domain)
    features = detect_features(text, domain)

    return {
        "text": text,
        "actors": actors,
        "features": features,
        "domain": domain,
    }


def detect_actors(text, domain=""):
    actors = []
    actor_aliases = {
        "admin": r"\badmins?\b|\badministrators?\b",
        "member": r"\bmembers?\b",
        "librarian": r"\blibrarians?\b",
        "student": r"\bstudents?\b",
        "teacher": r"\bteachers?\b|\binstructors?\b",
        "customer": r"\bcustomers?\b|\bshoppers?\b",
        "manager": r"\bmanagers?\b",
        "analyst": r"\banalysts?\b",
        "resident": r"\bresidents?\b|\bcitizens?\b",
        "driver": r"\bdrivers?\b|\bcollectors?\b",
        "staff": r"\bstaff\b|\bemployees?\b",
        "receptionist": r"\breceptionists?\b|\breception staff\b",
        "trainer": r"\btrainers?\b|\bcoaches?\b",
        "doctor": r"\bdoctors?\b|\bphysicians?\b",
        "patient": r"\bpatients?\b",
        "passenger": r"\bpassengers?\b|\btravelers?\b",
        "vendor": r"\bvendors?\b|\bsellers?\b",
        "supplier": r"\bsuppliers?\b",
        "parent": r"\bparents?\b",
        "nurse": r"\bnurses?\b",
        "pharmacist": r"\bpharmacists?\b",
        "cashier": r"\bcashiers?\b",
        "guest": r"\bguests?\b",
        "teller": r"\btellers?\b",
        "merchant": r"\bmerchants?\b",
        "employee": r"\bemployees?\b",
        "accountant": r"\baccountants?\b",
        "waiter": r"\bwaiters?\b",
        "chef": r"\bchefs?\b",
        "organizer": r"\borganizers?\b",
        "attendee": r"\battendees?\b",
        "courier": r"\bcouriers?\b",
        "dispatcher": r"\bdispatchers?\b",
        "agent": r"\bagents?\b",
        "owner": r"\bowners?\b",
        "warden": r"\bwardens?\b",
    }
    for actor, pattern in actor_aliases.items():
        if re.search(pattern, text):
            actors.append(actor)
    actors.extend(DOMAIN_PROFILES.get(domain, {}).get("actors", []))
    if not actors:
        actors.append("user")

    return unique_items(actors)


def detect_domain(text):
    domain_patterns = {
        "software documentation automation": [
            r"\bartificial intelligence requirement analyzer\b", r"\baira\b",
            r"\bsrs generation\b", r"\buml generation\b", r"\brequirement analyzer\b",
        ],
        "personalized news aggregation": [
            r"\bnews aggregator\b", r"\bnews articles?\b", r"\bnews api\b", r"\bnews feed\b",
        ],
        "library management": [
            r"\blibrary\b", r"\blibrarian\b", r"\bborrow(?:ing)?\b", r"\bbook returns?\b",
        ],
        "waste collection management": [
            r"\bwaste\b", r"\bgarbage\b", r"\bbins?\b", r"\brecycling\b", r"\bcollection routes?\b",
        ],
        "gym and fitness management": [
            r"\bgym\b", r"\bfitness\b", r"\btrainers?\b", r"\bworkouts?\b", r"\bmembership\b",
        ],
        "travel reservation management": [
            r"\btravel\b", r"\bflight\b", r"\bhotel\b", r"\bitinerary\b", r"\breservations?\b",
        ],
        "healthcare management": [
            r"\bhospital\b", r"\bclinics?\b", r"\bpatients?\b", r"\bdoctors?\b",
            r"\bmedical\b", r"\bappointments?\b", r"\breception(?:ist| staff)?\b",
        ],
        "education management": [
            r"\bschool\b", r"\bstudents?\b", r"\bteachers?\b", r"\bcourses?\b",
        ],
        "forecasting and prediction": [
            r"\bforecast(?:ing)?\b", r"\bprediction\b", r"\bpredictive\b",
        ],
        "inventory management": [
            r"\binventory\b", r"\bstock levels?\b", r"\bsuppliers?\b", r"\brestock\b",
        ],
        "e-commerce": [
            r"\bonline shopping\b", r"\bonline store\b", r"\be-?commerce\b", r"\bshopping cart\b",
            r"\bcheckout\b", r"\bproduct catalog\b", r"\bplace orders?\b",
        ],
        "passenger check-in management": [
            r"\bpassenger\b", r"\bcheck-in\b", r"\bboarding\b", r"\bluggage\b",
        ],
    }
    for domain, profile in DOMAIN_PROFILES.items():
        domain_patterns[domain] = profile["patterns"]
    scores = {
        domain: sum(1 for pattern in patterns if re.search(pattern, text))
        for domain, patterns in domain_patterns.items()
    }
    for domain in DOMAIN_PROFILES:
        if re.search(rf"\b{re.escape(domain.replace(' management', ''))}(?:\s+management)?\s+system\b", text):
            scores[domain] = scores.get(domain, 0) + 4
    best_domain, best_score = max(scores.items(), key=lambda item: item[1])
    return best_domain if best_score else "general information management"


def detect_features(text, domain="software system"):
    feature_patterns = {
        "add product": "add new product records through the admin product entry workflow",
        "product details": "enter product details before validation",
        "validate user": "validate the admin user before product entry is allowed",
        "validate information": "validate submitted product information before saving",
        "same product": "check whether the submitted product already exists",
        "update quantity": "update the quantity of an existing matching product",
        "save in database": "save validated product records in the database",
        "product added": "confirm that the product has been added successfully",
        "c-panel": "process product management actions through the control panel",
        "srs generation": "generate SRS documents from project descriptions or uploaded source files",
        "generate srs": "generate SRS documents from project descriptions or uploaded source files",
        "generates srs": "generate SRS documents from project descriptions or uploaded source files",
        "uml generation": "generate UML diagrams from prompts or SRS documents",
        "generate uml": "generate UML diagrams from prompts or SRS documents",
        "generates uml": "generate UML diagrams from prompts or SRS documents",
        "editable use case": "generate editable UML diagrams from prompts or SRS documents",
        "ambiguity": "detect ambiguous requirements in uploaded SRS documents",
        "correctness": "analyze requirement correctness",
        "completeness": "analyze requirement completeness",
        "uml image": "extract and describe information from uploaded UML diagram images",
        "diagram explanation": "explain uploaded UML diagram images",
        "news": "aggregate news articles from configured sources",
        "article": "display news articles with title, source, date, and summary",
        "preference": "manage user topic preferences",
        "interest": "manage user topic preferences",
        "recommendation": "recommend articles based on user preferences and reading history",
        "filter": "filter articles by category, source, and date",
        "sort": "sort articles by relevance or publication date",
        "real-time": "show recent news updates",
        "breaking": "show recent news updates",
        "search": "search records or information",
        "borrow": "borrow available items",
        "return": "return borrowed items",
        "issue": "issue items to users",
        "manage": "manage system records",
        "inventory": "manage inventory records",
        "book": "manage book records",
        "payment": "process payments",
        "order": "place and manage orders",
        "cart": "add and remove items from cart",
        "report": "generate reports",
        "upload": "upload files",
        "download": "download generated outputs",
        "login": "log in to the system",
        "register": "create an account",
        "forecast": "generate forecasts",
        "predict": "generate predictions",
        "dataset": "manage datasets",
        "chart": "view charts and visual summaries",
        "dashboard": "view dashboard analytics",
        "notification": "receive notifications",
        "appointment": "book and manage appointments",
        "schedule": "review and manage schedules",
        "medical note": "review authorized medical notes",
        "confirm visit": "confirm scheduled visits",
        "reminder": "send appointment and status reminders",
        "report overflowing": "report overflowing or damaged waste bins",
        "collection route": "receive optimized collection routes",
        "fill sensor": "monitor bin fill sensor readings",
        "vehicle location": "monitor collection vehicle locations",
        "recycling rate": "monitor recycling rates",
        "missed pickup": "record and resolve missed pickups",
        "subscribe": "subscribe to available membership plans",
        "trainer session": "book trainer sessions",
        "attendance": "record and review attendance",
        "membership expiry": "send membership expiry reminders",
        "equipment maintenance": "record and track equipment maintenance",
        "book flight": "book available flights",
        "book hotel": "book available hotel rooms",
        "itinerary": "prepare and review travel itineraries",
        "check-in": "process passenger check-in requests",
        "ticket": "verify passenger tickets",
        "luggage": "record luggage acceptance and fee status",
        "boarding": "manage boarding or travel confirmation details",
    }

    features = []
    for keyword, action in feature_patterns.items():
        if domain == "e-commerce" and keyword in {"srs generation", "generate srs", "generates srs", "uml generation", "generate uml", "generates uml", "editable use case", "ambiguity", "correctness", "completeness", "uml image", "diagram explanation"}:
            continue
        if domain != "library management" and keyword == "book":
            continue
        if domain == "gym and fitness management" and keyword == "reminder":
            continue
        if re.search(rf"\b{re.escape(keyword)}\b", text):
            features.append({"keyword": keyword, "action": action})

    features.extend(extract_capability_features(text))
    features = unique_feature_items(features)

    if not features:
        features = default_features_for_domain(domain)
    elif domain in DOMAIN_PROFILES or domain == "software documentation automation":
        features = merge_required_domain_features(features, default_features_for_domain(domain))

    return features


def extract_capability_features(text):
    """Extract capabilities stated by the user instead of forcing a fixed template."""
    results = []
    actor_words = (
        r"users?|admins?|members?|managers?|staff|customers?|residents?|drivers?|"
        r"trainers?|students?|teachers?|patients?|doctors?|passengers?|vendors?|suppliers?"
    )
    action_pattern = re.compile(
        rf"\b(?:{actor_words})\s+(?:can|shall|must|may|will|to)\s+"
        r"([a-z][a-z0-9 -]{3,90}?)(?=,|;|\.|\band\b|\bwhile\b|$)",
        re.I,
    )
    infinitive_pattern = re.compile(
        r"\b(?:to|shall|must|can)\s+"
        r"((?:add|book|browse|calculate|cancel|collect|create|display|download|generate|"
        r"manage|monitor|notify|process|record|report|schedule|search|send|store|track|"
        r"update|upload|validate|verify|view)\b[a-z0-9 -]{2,90}?)(?=,|;|\.|\band\b|\bwhile\b|$)",
        re.I,
    )
    for pattern in (action_pattern, infinitive_pattern):
        for match in pattern.finditer(text):
            action = normalize_action_phrase(match.group(1))
            if action:
                results.append({"keyword": action.split()[0], "action": action})
    return results


def normalize_action_phrase(value):
    action = re.sub(r"\s+", " ", str(value or "")).strip(" .,:;-").lower()
    action = re.sub(r"^(the system|their|its)\s+", "", action)
    return action if 2 <= len(action.split()) <= 16 else ""


def unique_feature_items(features):
    unique = []
    seen = set()
    for feature in features:
        action = re.sub(r"\s+", " ", str(feature.get("action", "")).strip().lower())
        if not action or action in seen:
            continue
        seen.add(action)
        unique.append({"keyword": feature.get("keyword", action.split()[0]), "action": action})
    return unique


def merge_required_domain_features(features, required_features):
    merged = list(features)
    existing_actions = {item["action"].lower() for item in merged}
    for feature in required_features:
        if feature["action"].lower() not in existing_actions:
            merged.append(feature)
            existing_actions.add(feature["action"].lower())
    return merged


def default_features_for_domain(domain):
    profile_features = DOMAIN_PROFILES.get(domain, {}).get("features")
    if profile_features:
        return [{"keyword": action.split()[0], "action": action} for action in profile_features]
    domain_features = {
        "software documentation automation": [
            ("srs", "generate SRS documents"),
            ("uml", "generate editable UML diagrams"),
            ("ambiguity", "analyze SRS ambiguity"),
            ("image", "describe uploaded UML images"),
            ("export", "export generated documents and diagrams"),
        ],
        "e-commerce": [
            ("register", "create customer accounts"),
            ("search", "search product catalog"),
            ("cart", "manage shopping cart"),
            ("order", "place and track orders"),
            ("payment", "record payment status"),
            ("inventory", "manage product inventory"),
            ("report", "generate sales reports"),
        ],
        "library management": [
            ("book", "manage book records"),
            ("member", "manage member records"),
            ("borrow", "issue books to members"),
            ("return", "record book returns"),
            ("report", "generate library reports"),
        ],
        "healthcare management": [
            ("patient", "manage patient records"),
            ("doctor", "manage doctor access"),
            ("appointment", "schedule appointments"),
            ("report", "upload and view medical reports"),
        ],
        "passenger check-in management": [
            ("ticket", "verify passenger tickets"),
            ("check-in", "process passenger check-in requests"),
            ("luggage", "record luggage acceptance and fee status"),
            ("status", "display check-in status"),
        ],
        "waste collection management": [
            ("report", "report overflowing or damaged bins"),
            ("route", "plan and follow optimized collection routes"),
            ("sensor", "monitor bin fill levels"),
            ("vehicle", "track collection vehicle locations"),
            ("pickup", "record completed and missed pickups"),
            ("recycling", "review recycling performance"),
        ],
        "gym and fitness management": [
            ("membership", "manage membership plans and subscriptions"),
            ("session", "book trainer sessions"),
            ("class", "book fitness classes"),
            ("attendance", "record member attendance"),
            ("payment", "record membership payments"),
            ("maintenance", "track equipment maintenance"),
        ],
        "travel reservation management": [
            ("itinerary", "request and prepare travel itineraries"),
            ("flight", "book flights"),
            ("hotel", "book hotel rooms"),
            ("booking", "confirm and manage bookings"),
            ("payment", "make and verify payments"),
        ],
    }
    return [{"keyword": key, "action": action} for key, action in domain_features.get(domain, [
        ("submit", "submit required information"),
        ("view", "view generated results"),
        ("manage", "manage system records"),
    ])]


def build_functional_requirements(project_title, project_description, context):
    # Payment workflows need explicit responsibility boundaries. A customer can
    # request a refund, but only authorized operational roles process it or
    # produce settlement reports.
    if context.get("domain") == "online payment management":
        return [
            normalize_requirement_text(item)
            for item in build_domain_functional_requirements(context)
        ]

    requirements = []
    actors = context["actors"]
    features = context["features"]

    for actor in actors:
        requirements.append(f"The system shall authenticate {pluralize_actor(actor)} before granting access to role-specific functions.")

    for feature in features:
        actor = choose_actor(feature["keyword"], actors, feature["action"])
        requirements.append(f"The system shall allow {pluralize_actor(actor)} to {feature['action']}.")

    if not any("manage system records" in req for req in requirements) and "admin" in actors:
        requirements.append("The system shall allow admins to add, update, and delete system records.")

    requirements.extend(build_domain_functional_requirements(context))

    if not requirements:
        requirements.extend(DEFAULT_FUNCTIONAL)

    return [normalize_requirement_text(item) for item in requirements]


def pluralize_actor(actor):
    if actor == "staff":
        return "staff"
    if actor.endswith("y") and not actor.endswith(("ay", "ey", "iy", "oy", "uy")):
        return actor[:-1] + "ies"
    if actor.endswith(("s", "x", "ch", "sh")):
        return actor + "es"
    return actor + "s"


def choose_actor(keyword, actors, action=""):
    admin_keywords = {"manage", "inventory", "report", "dataset"}
    user_keywords = {"search", "borrow", "return", "issue", "cart", "order", "payment", "upload", "download", "forecast", "predict", "chart", "dashboard", "login", "register"}

    if keyword in admin_keywords and "librarian" in actors:
        return "librarian"
    if keyword in admin_keywords and "admin" in actors:
        return "admin"
    if keyword in {"borrow", "return", "search"} and "member" in actors:
        return "member"
    if "generate reports" in action and "manager" in actors:
        return "manager"
    if keyword in {"report", "report overflowing"} and "resident" in actors:
        return "resident"
    if keyword in {"collection route", "missed pickup"} and "driver" in actors:
        return "driver"
    if keyword in {"fill sensor", "vehicle location", "recycling rate"} and "manager" in actors:
        return "manager"
    if keyword in {"subscribe", "trainer session", "attendance", "membership expiry"} and "member" in actors:
        return "member"
    if keyword == "equipment maintenance" and "staff" in actors:
        return "staff"
    if keyword in {"appointment", "reminder"} and "patient" in actors:
        return "patient"
    if keyword in {"schedule", "medical note"} and "doctor" in actors:
        return "doctor"
    if keyword == "confirm visit" and "receptionist" in actors:
        return "receptionist"
    if keyword in user_keywords and "customer" in actors:
        return "customer"
    if keyword in user_keywords and "student" in actors:
        return "student"
    if keyword in user_keywords and "user" in actors:
        return "user"

    return actors[0]


def build_non_functional_requirements(project_title, context=None):
    context = context or {}
    domain = context.get("domain", "general information management")
    features = context.get("features", [])
    requirements = [
        "The system shall validate all required input fields before submission.",
        "The system shall reject invalid requests and display the field name that requires correction.",
        "The system shall restrict protected pages to authenticated users only.",
        "The system shall support the latest stable versions of Chrome, Edge, and Firefox.",
        f"The system shall store {domain} records with their status and creation or update timestamp.",
        f"The {project_title} interface shall use consistent labels, button placement, and section headings across all pages.",
        f"The system shall complete standard {domain} operations within 5 seconds on the target deployment machine.",
    ]
    if any("payment" in feature.get("action", "") for feature in features):
        requirements.append("The system shall protect payment records from unauthorized viewing or modification.")
    if any("sensor" in feature.get("action", "") or "location" in feature.get("action", "") for feature in features):
        requirements.append("The system shall clearly mark sensor or location readings that are stale or unavailable.")
    if any("notification" in feature.get("action", "") or "reminder" in feature.get("action", "") for feature in features):
        requirements.append("The system shall record whether each notification or reminder was successfully delivered.")
    return requirements


def build_domain_functional_requirements(context):
    domain = context["domain"]
    actors = context["actors"]

    if domain == "online payment management":
        return [
            "The system shall allow customers to initiate payments using a supported payment method.",
            "The system shall validate payment details before submitting a transaction for authorization.",
            "The system shall allow customers to view the status and history of their own payment transactions.",
            "The system shall allow customers to submit refund requests for eligible transactions.",
            "The system shall allow merchants to review refund requests associated with their transactions.",
            "The system shall allow authorized merchant or finance staff to approve or reject refund requests.",
            "The system shall process an approved refund and record its amount, status, reason, and processing timestamp.",
            "The system shall allow merchants and finance staff to view settlement status and settlement history.",
            "The system shall allow finance staff and admins to generate settlement and reconciliation reports.",
            "The system shall record an audit trail for payment, refund, settlement, and administrative actions.",
        ]

    profile = DOMAIN_PROFILES.get(domain)
    if profile:
        lead_actor = profile["actors"][0]
        requirements = [
            f"The system shall allow {pluralize_actor(choose_actor(feature['keyword'], actors, feature['action']))} to {feature['action']}."
            for feature in default_features_for_domain(domain)
        ]
        requirements.append(
            f"The system shall allow {pluralize_actor(lead_actor)} to review the status and history of authorized {domain} operations."
        )
        return requirements

    if domain == "library management":
        circulation_actor = "librarian" if "librarian" in actors else "admin"
        member_actor = "member" if "member" in actors else "user"
        return [
            f"The system shall allow {member_actor}s to search books by title, author, category, or availability status.",
            f"The system shall allow {circulation_actor}s to create, update, and deactivate book records.",
            f"The system shall allow {circulation_actor}s to record book issue and return transactions.",
            f"The system shall calculate and display borrowing status for each issued book.",
        ]

    if domain == "healthcare management":
        return [
            "The system shall allow authorized staff to create and update patient records.",
            "The system shall allow doctors to view patient reports assigned to them.",
            "The system shall record report upload and download actions with timestamps.",
        ]

    if domain == "forecasting and prediction":
        return [
            "The system shall allow users to upload supported datasets for forecasting.",
            "The system shall validate dataset format before prediction starts.",
            "The system shall display generated forecast values with chart and report output.",
        ]

    if domain == "personalized news aggregation":
        return [
            "The system shall allow users to select and update preferred news topics.",
            "The system shall fetch news articles from configured external news APIs.",
            "The system shall store user preferences and article interaction history for personalization.",
            "The system shall generate a personalized news feed using selected interests and reading history.",
            "The system shall allow users to filter articles by category, source, and publication date.",
            "The system shall allow users to sort articles by relevance or publication date.",
            "The system shall refresh the news feed at configured update intervals.",
        ]

    if domain == "e-commerce":
        source_text = context.get("text", "")
        if re.search(r"\b(add product|product details|validate user|validate information|same product|update quantity|save in database|product added|c-panel)\b", source_text):
            return [
                "The system shall allow an authenticated admin to open the control panel and access the add-product workflow.",
                "The system shall require the admin to log in before product management actions are available.",
                "The system shall validate the admin user before allowing product details to be submitted.",
                "The system shall allow the admin to enter product details required for an online shopping product record.",
                "The system shall validate product information before it is accepted for storage.",
                "The system shall check whether another product with matching identifying details already exists.",
                "The system shall update the quantity of an existing matching product instead of creating a duplicate product record.",
                "The system shall save a new validated product record in the database when no matching product exists.",
                "The system shall display a product-added confirmation after the add-product workflow is completed.",
            ]
        return [
            "The system shall allow customers to browse products by category, name, price, and availability.",
            "The system shall allow customers to add products to a shopping cart and update item quantities.",
            "The system shall allow customers to place orders after providing valid checkout details.",
            "The system shall calculate order totals, delivery charges, discounts, and payment status.",
            "The system shall allow admins to add, update, deactivate, and restock product records.",
            "The system shall allow admins to view order history, customer orders, and sales reports.",
            "The system shall notify customers when order status changes.",
        ]

    if domain == "software documentation automation":
        return [
            "The system shall allow users to generate SRS documents from project prompts, uploaded documents, or UML diagram images.",
            "The system shall allow users to generate use case, class, sequence, ERD, and activity diagrams from text or SRS documents.",
            "The system shall allow users to edit generated SRS documents before export.",
            "The system shall allow users to edit generated UML diagrams using diagram editing tools.",
            "The system shall analyze uploaded SRS documents for ambiguity, correctness, and completeness.",
            "The system shall extract readable text from uploaded UML diagram images and generate a diagram description.",
            "The system shall save generated SRS documents, UML outputs, uploaded files, and activity history in the database.",
        ]

    if domain == "passenger check-in management":
        return [
            "The system shall allow passenger service staff to verify passenger tickets at the check-in counter.",
            "The system shall allow passenger service staff to record luggage acceptance and subject-to-fee status.",
            "The system shall allow authorized users to confirm whether a passenger is eligible for check-in.",
            "The system shall display check-in status messages after ticket and luggage information is processed.",
        ]

    return []


def unique_items(items):
    unique = []
    seen = set()

    for item in items:
        clean = re.sub(r"\s+", " ", item.strip().lower())
        if not clean or clean in seen:
            continue
        seen.add(clean)
        unique.append(item)

    return unique


def normalize_requirement_text(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    replacements = {
        "user-friendly": "consistent and easy to understand",
        "fast": "within the defined response time",
        "quickly": "within the defined response time",
        "acceptable time": "the defined response time",
        "important data": "stored project and user data",
        "meaningful error messages": "error messages that identify the failed field or operation",
        "modern web browsers": "latest stable versions of Chrome, Edge, and Firefox",
        "where applicable": "when the feature is enabled",
    }

    for old, new in replacements.items():
        text = re.sub(re.escape(old), new, text, flags=re.IGNORECASE)

    return text


TITLE_ACRONYMS = {
    "ai",
    "aira",
    "api",
    "doc",
    "docx",
    "erd",
    "fr",
    "http",
    "https",
    "ml",
    "nfr",
    "pdf",
    "png",
    "srs",
    "ui",
    "uml",
}


COMMON_SPELLING_CORRECTIONS = {
    "arsficilinteligence": "artificial intelligence",
    "artifical": "artificial",
    "artficial": "artificial",
    "inteligence": "intelligence",
    "intelliegence": "intelligence",
    "anaiyzer": "analyzer",
    "analizer": "analyzer",
    "analyser": "analyzer",
    "libarary": "library",
    "managment": "management",
    "mangement": "management",
    "requirment": "requirement",
    "requriement": "requirement",
    "documnet": "document",
    "diagrm": "diagram",
    "genearted": "generated",
    "forcasting": "forecasting",
    "forecating": "forecasting",
    "forecastig": "forecasting",
    "helth": "health",
    "hosptial": "hospital",
    "passongor": "passenger",
    "passanger": "passenger",
    "cheks": "checks",
    "ecommerece": "ecommerce",
}


GENERIC_DIAGRAM_TITLES = {
    "admin",
    "activity",
    "activity diagram",
    "alishba rustam",
    "class",
    "class diagram",
    "ceo",
    "sequence",
    "sequence diagram",
    "student",
    "use case",
    "use case diagram",
    "user",
    "erd",
    "er diagram",
    "uml",
    "uml diagram",
    "diagram",
    "image",
    "flowchart",
    "for",
    "laiba arshad",
    "nayab nazir",
    "project members",
    "software requirements specification",
}


def correct_common_typos(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"\bA\s+rtificial\b", "Artificial", text, flags=re.I)
    text = re.sub(
        r"\bIntelligence\s+Requirement\s+Analyzer\(\s*AIRA\s*\)",
        "Intelligence Requirement Analyzer (AIRA)",
        text,
        flags=re.I,
    )
    for wrong, right in COMMON_SPELLING_CORRECTIONS.items():
        text = re.sub(rf"\b{re.escape(wrong)}\b", right, text, flags=re.I)
    return correct_near_domain_terms(text)


def build_domain_vocabulary():
    vocabulary = {
        "forecasting", "weather", "management", "reservation", "appointment",
        "requirement", "inventory", "insurance", "restaurant", "university",
        "examination", "pharmacy", "hospital", "employee", "customer",
        "relationship", "collection", "courier", "learning", "airline",
        "ecommerce", "payment", "student", "library", "vehicle", "rental",
        "banking", "payroll", "hostel", "school", "clinic", "hotel",
    }
    for domain, profile in DOMAIN_PROFILES.items():
        values = [domain, *profile.get("actors", []), *profile.get("features", []), *profile.get("data", [])]
        for value in values:
            vocabulary.update(re.findall(r"[a-z]{5,}", str(value).lower()))
    return vocabulary


DOMAIN_VOCABULARY = build_domain_vocabulary()


def correct_near_domain_terms(value):
    """Correct small spelling slips only when a known SRS/domain term is a strong match."""
    def replace_word(match):
        word = match.group(0)
        lowered = word.lower()
        if lowered in DOMAIN_VOCABULARY or len(lowered) < 6:
            return word
        candidates = [
            term for term in DOMAIN_VOCABULARY
            if term[0] == lowered[0]
            and abs(len(term) - len(lowered)) <= 2
            and edit_distance(lowered, term, limit=2) <= 2
        ]
        if not candidates:
            return word
        ranked = sorted((edit_distance(lowered, term, limit=2), term) for term in candidates)
        best_distance, corrected = ranked[0]
        if len(ranked) > 1 and ranked[1][0] == best_distance:
            return word
        if word.isupper():
            return corrected.upper()
        if word[:1].isupper():
            return corrected.capitalize()
        return corrected

    return re.sub(r"\b[A-Za-z]{6,}\b", replace_word, str(value or ""))


def edit_distance(left, right, limit=2):
    """Small bounded Levenshtein distance used for conservative typo correction."""
    if abs(len(left) - len(right)) > limit:
        return limit + 1
    previous = list(range(len(right) + 1))
    for row_index, left_char in enumerate(left, 1):
        current = [row_index]
        row_minimum = row_index
        for column_index, right_char in enumerate(right, 1):
            value = min(
                current[column_index - 1] + 1,
                previous[column_index] + 1,
                previous[column_index - 1] + (left_char != right_char),
            )
            current.append(value)
            row_minimum = min(row_minimum, value)
        if row_minimum > limit:
            return limit + 1
        previous = current
    return previous[-1]


def sanitize_project_description(value):
    """Remove transport/control instructions that must never influence the domain."""
    text = str(value or "").replace("\r", "\n")
    blocked = [
        r"write the complete srs document in .+",
        r"use the selected language for all headings.+",
        r"base the srs on the uploaded document.+",
        r"do not generate a generic or dummy srs.+",
        r"every functional requirement, feature description.+",
    ]
    for pattern in blocked:
        text = re.sub(pattern, " ", text, flags=re.I)
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()


def title_case_phrase(value):
    text = correct_common_typos(value)

    def replace_word(match):
        word = match.group(0)
        lowered = word.lower()
        if lowered in TITLE_ACRONYMS:
            return lowered.upper()
        return "-".join(part[:1].upper() + part[1:].lower() for part in word.split("-"))

    return re.sub(r"\b[A-Za-z][A-Za-z0-9-]*\b", replace_word, text).strip()


def format_heading_line(line):
    text = str(line or "").strip()
    numbered = re.match(r"^(\d+(?:\.\d+)?\.\s+)(.+)$", text)
    if numbered:
        return f"{numbered.group(1)}{title_case_phrase(numbered.group(2))}"
    appendix = re.match(r"^(Appendix\s+[A-Z]:\s+)(.+)$", text, flags=re.I)
    if appendix:
        return f"{title_case_phrase(appendix.group(1))}{title_case_phrase(appendix.group(2))}"
    return title_case_phrase(text)


def clean_project_title(value):
    text = correct_common_typos(value)
    if re.search(r"artificial intelligence requirement analyzer|AIRA", text, flags=re.I):
        return "Artificial Intelligence Requirement Analyzer (AIRA)"
    text = re.sub(r"\b(activity|use case|class|sequence|erd)\s+diagram\b", " ", text, flags=re.I)
    text = re.sub(r"\bdiagram\s+(for|of)\b", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    title = title_case_phrase(text)
    if title.lower() in GENERIC_DIAGRAM_TITLES:
        return "The Proposed System"
    return title or "The Proposed System"


def infer_project_title_from_description(value):
    text = remove_source_noise(clean_uploaded_description(correct_common_typos(value)))
    text = re.sub(r"\b(Content from|Uploaded source content|Domain|Detail level|Actors|Features)\b.*?:", " ", text, flags=re.I)
    text = re.sub(r"[^A-Za-z0-9 -]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if re.search(r"\bpassenger\s+checks?\s+in\b|\bpassenger\s+check-in\b", text, flags=re.I):
        return "Passenger Check-In System"
    if not text or is_noisy_extracted_text(text):
        return ""

    words = [
        word for word in text.split()
        if word.lower() not in {"activity", "diagram", "uml", "use", "case", "class", "sequence", "erd", "the", "a", "an"}
    ]
    if len(words) < 2:
        return ""

    stop_words = {"system", "application", "platform", "services", "showing", "ticket", "counter", "user", "users", "shall", "allow"}
    title_words = []
    for word in words:
        if word.lower() in stop_words and len(title_words) >= 2:
            break
        title_words.append(word)
        if len(title_words) >= 5:
            break

    title = title_case_phrase(" ".join(title_words))
    if title.lower() in GENERIC_DIAGRAM_TITLES or len(title.split()) < 2:
        return ""
    return title


def is_ambiguous_requirement(value):
    lowered = str(value or "").lower()
    ambiguous_terms = [
        "easy to use",
        "as soon as possible",
        "etc",
        "appropriate",
        "sufficient",
        "adequate",
        "robust",
        "efficient",
    ]
    return any(term in lowered for term in ambiguous_terms)


def build_non_functional_list(grouped):
    ordered_categories = [
        "Performance",
        "Security",
        "Availability",
        "Usability",
        "Scalability",
        "Maintainability",
        "Look and Feel",
        "Legal",
        "Portability",
        "Non-Functional",
    ]

    requirements = []
    for category in ordered_categories:
        requirements.extend(grouped.get(category, []))
    return requirements


def extract_document_requirements(project_description, context):
    text = clean_uploaded_description(project_description)
    if not text:
        return []

    candidates = []
    fragments = re.split(r"(?<=[.!?])\s+|\n+", text)
    for fragment in fragments:
        clean = remove_source_noise(fragment)
        clean = re.sub(r"^\d+(?:\.\d+)*\s*", "", clean).strip(" :-")
        if len(clean) < 20 or len(clean) > 260:
            continue
        if is_noisy_document_requirement(clean):
            continue
        if re.search(r"\b(shall|must|required|allow|allows|provide|provides|manage|generate|verify|record|display|upload|download|process|search|store)\b", clean, re.I):
            candidates.append(normalize_document_requirement(clean))

    if candidates:
        return unique_items(candidates)

    return [
        f"The system shall allow users to {feature['action']}."
        for feature in context.get("features", [])[:6]
    ]


def normalize_document_requirement(value):
    text = normalize_requirement_text(correct_common_typos(value))
    if re.match(r"^(the\s+)?system\s+shall\b", text, flags=re.I):
        return text[:1].upper() + text[1:]
    subject_shall = re.match(r"^(.{3,60}?)\s+shall\s+(.+)$", text, flags=re.I)
    if subject_shall:
        subject = normalize_requirement_subject(subject_shall.group(1))
        action = subject_shall.group(2).strip()
        return f"The system shall allow {subject} to {action}"
    if re.match(r"^(the\s+)?system\s+(must|required|will|should)\b", text, flags=re.I):
        text = re.sub(r"^(the\s+)?system\s+(must|required|will|should)\b", "The system shall", text, flags=re.I)
        return text
    if re.match(r"^(users?|admins?|staff|customers?|students?|members?|passengers?|doctors?|librarians?)\b", text, flags=re.I):
        return f"The system shall allow {text[0].lower() + text[1:]}"
    return f"The system shall support {text[0].lower() + text[1:]}"


def normalize_requirement_subject(subject):
    clean = re.sub(r"\s+", " ", str(subject or "").strip()).lower()
    replacements = {
        "passenger services": "passenger service staff",
        "passenger service": "passenger service staff",
        "admins": "admins",
        "admin": "admins",
        "customers": "customers",
        "customer": "customers",
        "students": "students",
        "student": "students",
        "users": "users",
        "user": "users",
    }
    return replacements.get(clean, clean)


def is_noisy_document_requirement(value):
    text = str(value or "").strip()
    words = re.findall(r"[A-Za-z]{2,}", text)
    if len(words) < 4:
        return True
    unusual_symbol_count = len(re.findall(r"[{}|+_=<>\\\[\]]", text))
    if unusual_symbol_count >= 3:
        return True
    broken = sum(1 for word in words if re.search(r"(.)\1{2,}", word.lower()))
    return broken / max(len(words), 1) > 0.25


def format_numbered(items):
    return "\n".join(f"{index}. {item}" for index, item in enumerate(items, 1))


def format_tagged(items, prefix):
    return format_numbered(items)


def domain_term(context):
    profile_data = DOMAIN_PROFILES.get(context.get("domain"), {}).get("data", [])
    if profile_data:
        return ", ".join(item.lower().replace(" records", "") for item in profile_data[:4])
    return {
        "waste collection management": "collection request, bin, route, sensor, vehicle, and pickup",
        "gym and fitness management": "member, membership, class, trainer session, attendance, payment, and equipment",
        "travel reservation management": "traveler, itinerary, flight, hotel, booking, and payment",
        "library management": "member, book, issue, return, and inventory",
        "e-commerce": "customer, product, cart, order, payment, and inventory",
        "healthcare management": "patient, appointment, doctor, and medical report",
        "personalized news aggregation": "user preference, article, source, feed, and reading history",
        "software documentation automation": "project, uploaded source, generated document, diagram, analysis, and export",
    }.get(context.get("domain"), "user, request, transaction, status, and result")


def build_operating_environment(context):
    domain = context["domain"]
    items = [
        "The system shall run in the latest stable versions of Chrome, Edge, and Firefox.",
        f"The system shall provide a responsive interface for authorized users performing {domain} tasks.",
        f"The backend service shall process and persist {domain_term(context)} records.",
    ]
    if domain == "waste collection management":
        items.append("Driver and manager workflows shall remain usable on mobile devices with location access.")
        items.append("Sensor and vehicle-location integrations shall expose their latest reading timestamp.")
    elif domain == "gym and fitness management":
        items.append("Reception and staff workflows shall be usable on desktop or tablet devices at the gym.")
    elif domain == "travel reservation management":
        items.append("External flight, hotel, or payment services shall be reachable when live reservations are enabled.")
    else:
        items.append("The frontend and backend shall communicate through HTTP in local development and HTTPS in deployment.")
    return format_numbered(items)


def build_design_constraints(context):
    items = [
        f"The data model shall preserve the status and timestamps of each {domain_term(context)} record.",
        "Required fields shall be validated before a request is accepted.",
        "Role-specific operations shall be available only to authorized users.",
        "User-visible errors shall identify the failed field or operation.",
    ]
    if any("payment" in feature["action"] for feature in context["features"]):
        items.append("Payment details shall be handled through protected interfaces and shall not expose sensitive credentials.")
    if any("sensor" in feature["action"] or "location" in feature["action"] for feature in context["features"]):
        items.append("Sensor and location data shall include a source identifier and latest-update timestamp.")
    return format_numbered(items)


def build_assumptions(context):
    items = [
        f"Authorized users shall provide complete and accurate information for {context['domain']} operations.",
        "The database service shall be available when records are created or updated.",
        "Users shall have a supported browser and a working network connection.",
    ]
    if context["domain"] == "waste collection management":
        items.append("Configured bins, sensors, collection vehicles, and service areas shall have unique identifiers.")
    elif context["domain"] == "gym and fitness management":
        items.append("Membership plans, class schedules, trainers, and equipment records shall be configured before booking or attendance is recorded.")
    elif context["domain"] == "travel reservation management":
        items.append("External providers shall return current availability and pricing before a booking is confirmed.")
    else:
        items.append("Administrators shall configure reference data needed by the selected workflow.")
    return format_numbered(items)


def build_external_interfaces(context):
    domain = context["domain"]
    feature_names = ", ".join(feature["action"] for feature in context["features"][:4])
    hardware = "No dedicated hardware interface is required beyond a supported computer or mobile device."
    software = "The backend shall communicate with the database through a protected data-access layer."
    communication = "The system shall use HTTP or HTTPS for communication between frontend and backend services."
    if domain == "waste collection management":
        hardware = "The system may receive readings from configured bin-fill sensors and location-enabled collection devices."
        software = "The backend shall integrate with mapping, sensor, notification, and database services when those services are enabled."
        communication = "Sensor and vehicle updates shall be transmitted through authenticated network requests."
    elif domain == "gym and fitness management":
        hardware = "Attendance may be recorded through a reception computer, tablet, scanner, or manually through the interface."
        software = "The backend shall integrate membership, scheduling, notification, and payment records with the database."
    elif domain == "travel reservation management":
        software = "The backend may integrate with flight, hotel, itinerary, and payment provider interfaces."
        communication = "External reservation requests shall use authenticated HTTPS connections."
    return f"""6.1 User Interface Requirements
1. The interface shall provide clearly labeled screens for {feature_names or domain + " operations"}.
2. The interface shall show validation, success, empty, loading, and failure states for user actions.
3. The interface shall display role-appropriate actions and hide unauthorized controls.

6.2 Hardware Interface Requirements
{hardware}

6.3 Software Interface Requirements
{software}

6.4 Communication Interface Requirements
{communication}"""


def build_security_requirements(context):
    items = [
        "The system shall store passwords as salted cryptographic hashes.",
        "The system shall restrict protected records and operations according to the authenticated user's role.",
        f"The system shall validate all submitted {domain_term(context)} data before storage or processing.",
        "The system shall record security-relevant login and record-change events.",
    ]
    if any("payment" in feature["action"] for feature in context["features"]):
        items.append("The system shall not store full payment-card credentials in application records.")
    if context["domain"] == "healthcare management":
        items.append("The system shall restrict medical records to specifically authorized staff.")
    return format_numbered(items)


def build_performance_requirements(context):
    operation = context["features"][0]["action"] if context["features"] else context["domain"] + " request"
    items = [
        f"The system shall acknowledge a submitted request to {operation} within 1 second.",
        f"The system shall complete standard {context['domain']} record searches within 3 seconds under the expected academic deployment load.",
        "The interface shall remain responsive while a request is being processed.",
        "The system shall display a loading state for operations that take longer than 1 second.",
    ]
    if any("sensor" in feature["action"] or "location" in feature["action"] for feature in context["features"]):
        items.append("The system shall show the age of sensor and location readings so stale data is not presented as current.")
    return format_numbered(items)


def build_out_of_scope(context):
    items = [
        f"Operations unrelated to {context['domain']} are outside the current scope.",
        "Direct modification of stored records outside authorized application interfaces is outside the current scope.",
        "Support for unconfigured third-party services or devices is outside the current scope.",
    ]
    if context["domain"] == "waste collection management":
        items.append("Physical repair of bins, sensors, and collection vehicles is outside the software scope.")
    elif context["domain"] == "gym and fitness management":
        items.append("Delivery of fitness training and physical equipment repair are outside the software scope.")
    elif context["domain"] == "travel reservation management":
        items.append("Operation of airlines, hotels, and payment providers is outside the software scope.")
    else:
        items.append("Public production hosting and operational support are outside the current academic prototype scope.")
    return format_numbered(items)


def format_srs(project_title, project_description, functional, non_functional, context):
    project_title = clean_project_title(project_title)
    description = build_scope_description(project_title, project_description, context)
    actors = context["actors"]
    domain = context["domain"]
    features = context["features"]
    system_features = build_system_features(project_title, features, functional)
    data_requirements = build_data_requirements(project_title, context)
    acceptance_criteria = build_acceptance_criteria(project_title, functional, non_functional)
    operating_environment = build_operating_environment(context)
    design_constraints = build_design_constraints(context)
    assumptions = build_assumptions(context)
    external_interfaces = build_external_interfaces(context)
    security_requirements = build_security_requirements(context)
    performance_requirements = build_performance_requirements(context)
    out_of_scope = build_out_of_scope(context)

    domain_article = "an" if domain[:1].lower() in {"a", "e", "i", "o", "u"} else "a"

    return f"""Software Requirements Specification (SRS)
for
Project Name: {project_title}

Project Members:
Laiba Arshad
Alishba Rustam
Nayab Nazir

TABLE OF CONTENTS
1. Introduction
   1.1 Purpose
   1.2 Scope
   1.3 Intended Audience
   1.4 Definitions and Abbreviations
   1.5 Document Overview
2. Overall Description
   2.1 Product Perspective
   2.2 Product Functions
   2.3 User Classes and Characteristics
   2.4 Operating Environment
   2.5 Design and Implementation Constraints
   2.6 Assumptions and Dependencies
3. System Features
4. Functional Requirements
5. Non-Functional Requirements
6. External Interface Requirements
   6.1 User Interface Requirements
   6.2 Hardware Interface Requirements
   6.3 Software Interface Requirements
   6.4 Communication Interface Requirements
7. Data Requirements
8. Security Requirements
9. Performance Requirements
10. Reliability and Availability Requirements
11. Acceptance Criteria
12. Out of Scope
13. Conclusion
14. Appendix

Tested By Table:
Tester Name | Role | Test Date | Signature
____________________ | ____________________ | ____________________ | ____________________

1. Introduction
This Software Requirements Specification describes the expected behavior, features, constraints, interfaces, and quality requirements for {project_title}. The document is intended to guide development, testing, evaluation, and future maintenance of the system.

1.1 Purpose
The purpose of this document is to define functional requirements, quality constraints, interfaces, data needs, and acceptance criteria in a testable form. It helps stakeholders verify what the system shall do and how the completed product shall be evaluated.

1.2 Scope
{description}

1.3 Intended Audience
This SRS is intended for project supervisors, developers, testers, students, system users, and any stakeholder involved in reviewing or maintaining the system.

1.4 Definitions and Abbreviations
1. SRS: Software Requirements Specification.
2. User: A person who interacts with the system.
3. Admin: A privileged user responsible for managing records and system settings.
4. UI: User Interface.
5. Database: The storage layer used to save users, records, outputs, and history.

1.5 Document Overview
The remaining sections describe the overall product perspective, user classes, system features, functional requirements, non-functional requirements, external interfaces, data requirements, acceptance criteria, assumptions, constraints, and appendix information.

2. Overall Description

2.1 Product Perspective
{project_title} is {domain_article} {domain} solution delivered through a web-based interface. The system shall organize user input, perform required processing, store project records and generated outputs, and display results through controlled interface screens.

2.2 Product Functions
{build_product_functions(context)}

2.3 User Classes and Characteristics
{format_user_classes(actors)}

2.4 Operating Environment
{operating_environment}

2.5 Design and Implementation Constraints
{design_constraints}

2.6 Assumptions and Dependencies
{assumptions}

3. System Features
{system_features}

4. Functional Requirements
{format_tagged(functional, "FR")}

5. Non-Functional Requirements
{format_tagged(non_functional, "NFR")}

6. External Interface Requirements
{external_interfaces}

7. Data Requirements
{data_requirements}

8. Security Requirements
{security_requirements}

9. Performance Requirements
{performance_requirements}

10. Reliability and Availability Requirements
1. The system shall preserve generated outputs after successful saving.
2. The system shall handle invalid inputs without crashing.
3. The system shall display the failed operation name and retry option if AI processing fails.
4. The system shall allow users to retry failed operations.

11. Acceptance Criteria
{acceptance_criteria}

12. Out of Scope
{out_of_scope}

13. Conclusion
This SRS establishes the functional, non-functional, data, interface, security, performance, and acceptance requirements for {project_title}. The document provides a shared reference for project members, supervisors, developers, testers, and reviewers throughout implementation and evaluation. It clarifies the expected system behavior, identifies the main users, and defines the outputs that the completed system shall provide. It also records the quality constraints that must be considered while designing, coding, testing, and maintaining the system. The requirements in this document should be reviewed before development begins so that missing, unclear, or conflicting expectations can be corrected early. During implementation, the document should guide feature selection, screen design, validation rules, data handling, and integration decisions. During testing, it should be used as the baseline for preparing test cases, checking acceptance criteria, and confirming that each major requirement has been satisfied. Any future change in scope, user roles, supported features, or operating environment should be reflected by updating this SRS before the change is implemented. The final system should be accepted only when the listed requirements are implemented, verified, and documented with suitable evidence.

14. Appendix

Appendix A: Requirement Priority Levels
1. High: Required for the core working system.
2. Medium: Important for usability, maintainability, or future improvement.
3. Low: Optional enhancement that can be added after the main system is complete.

Appendix B: Suggested Review Checklist
1. Verify that all functional requirements are testable.
2. Verify that each non-functional requirement contains a measurable condition or observable validation rule.
3. Confirm that each user role has listed permissions.
4. Confirm that data storage and security requirements are included.
5. Review generated content before final submission.
"""


def format_srs_html(srs_text):
    html = ['<article class="srs-document">']
    in_toc = False
    project_members = {"laiba arshad", "alishba rustam", "nayab nazir"}

    for raw_line in srs_text.splitlines():
        line = raw_line.strip()

        if not line:
            continue

        if re.match(r"^Software Requirements Specification \(SRS\)$", line, re.I):
            html.append(f"<h1>{escape_html(line)}</h1>")
            continue

        if line.lower() == "for":
            html.append(f"<p class=\"cover-for\">{escape_html(line)}</p>")
            continue

        if line.startswith("Project Name:"):
            html.append(f"<p class=\"cover-project-title\">{escape_html(line)}</p>")
            continue

        if line == "Project Members:":
            html.append(f"<h2 class=\"cover-heading\">{escape_html(line)}</h2>")
            continue

        if line.lower() in project_members:
            html.append(f"<p class=\"cover-member\">{escape_html(line)}</p>")
            continue

        if line == "Tested By Table:":
            html.append(f"<h2 class=\"tested-heading\">{escape_html(line)}</h2>")
            html.append('<table class="tested-by-table"><thead><tr><th>Tester Name</th><th>Role</th><th>Test Date</th><th>Signature</th></tr></thead><tbody>')
            continue

        if "|" in line and "Tester Name" in line:
            continue

        if "|" in line and "____________________" in line:
            cells = [escape_html(cell.strip()) for cell in line.split("|")]
            html.append("<tr>" + "".join(f"<td>{cell}</td>" for cell in cells) + "</tr></tbody></table>")
            continue

        if line == "TABLE OF CONTENTS":
            in_toc = True
            html.append('<div class="page-break"></div>')
            html.append('<section class="srs-toc">')
            html.append(f"<h2>{escape_html(line)}</h2>")
            html.append("<ol>")
            continue

        if in_toc:
            if line == "14. Appendix":
                html.append(f"<li>{escape_html(format_heading_line(line))}</li>")
                html.append("</ol></section>")
                in_toc = False
                continue
            if is_major_heading(line):
                html.append(f"<li>{escape_html(format_heading_line(line))}</li>")
                continue
            if is_sub_heading(line):
                html.append(f"<li class=\"toc-subitem\">{escape_html(format_heading_line(line))}</li>")
                continue
            html.append("</ol></section>")
            in_toc = False

        if is_sub_heading(line):
            html.append(f"<h3>{escape_html(format_heading_line(line))}</h3>")
        elif is_major_heading(line):
            html.append(f"<h2 class=\"major-heading\">{escape_html(format_heading_line(line))}</h2>")
        elif line.startswith("Appendix "):
            html.append(f"<h3>{escape_html(format_heading_line(line))}</h3>")
        elif is_numbered_item(line):
            html.append(format_numbered_item_html(line))
        else:
            html.append(format_labeled_paragraph_html(line))

    if in_toc:
        html.append("</ol></section>")

    html.append("</article>")
    return "\n".join(html)


def is_major_heading(line):
    return bool(re.match(
        r"^(?:[1-9]|1[0-4])\.\s+(Introduction|Overall Description|System Features|Functional Requirements|Non-Functional Requirements|External Interface Requirements|Data Requirements|Security Requirements|Performance Requirements|Reliability and Availability Requirements|Acceptance Criteria|Out of Scope|Conclusion|Appendix)$",
        line,
    ))


def is_sub_heading(line):
    return bool(re.match(r"^(?:[1-9]|1[0-4])\.\d+\s+[A-Za-z]", line))


def is_numbered_item(line):
    return bool(re.match(r"^\d+\.\s+", line)) and not is_major_heading(line)


def format_numbered_item_html(line):
    match = re.match(r"^(\d+\.)\s*(.*)$", line)
    if not match:
        return f"<p>{escape_html(line)}</p>"

    number = match.group(1)
    body = match.group(2)
    label = re.match(r"^([A-Za-z][A-Za-z0-9 /&().-]{1,42}:\s*)(.*)$", body)
    if label:
        return (
            f"<p class=\"srs-list-item\"><strong>{escape_html(number)}</strong> "
            f"<strong>{escape_html(label.group(1).strip())}</strong> {escape_html(label.group(2))}</p>"
        )
    return f"<p class=\"srs-list-item\"><strong>{escape_html(number)}</strong> {escape_html(body)}</p>"


def format_labeled_paragraph_html(line):
    label = re.match(r"^([A-Za-z][A-Za-z0-9 /&().-]{1,42}:\s*)(.*)$", line)
    if label:
        return f"<p><strong>{escape_html(label.group(1).strip())}</strong> {escape_html(label.group(2))}</p>"
    return f"<p>{escape_html(line)}</p>"


def escape_html(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def format_user_classes(actors):
    lines = []
    for index, actor in enumerate(actors, 1):
        if actor == "admin":
            detail = "manages records, verifies data, and controls administrative functions"
        else:
            detail = "uses the system to submit information, perform tasks, and view generated results"
        lines.append(f"{index}. {title_case_phrase(actor)}: {detail}.")
    return "\n".join(lines)


def build_system_features(project_title, features, functional):
    sections = []
    for index, feature in enumerate(features[:8], 1):
        title = title_case_phrase(feature["action"])
        sections.append(
            f"""3.{index} {title}
Description: {project_title} provides this capability so authorized users can {feature['action']}.
Priority: High
Inputs: Information and selections required to {feature['action']}.
Processing: The system validates the submitted information, applies the rules for {feature['action']}, and records the outcome.
Outputs: A confirmation, updated record, status, or result directly related to {feature['action']}."""
        )

    if not sections:
        sections.append(
            f"""3.1 Core System Operations
Description: This feature allows users to perform the main operations of {project_title}.
Priority: High
Inputs: Required project or transaction data.
Processing: The system validates and processes the submitted data.
Outputs: Stored record, generated output, or confirmation message."""
        )

    return "\n\n".join(sections)


def build_product_functions(context):
    if context["domain"] == "personalized news aggregation":
        functions = [
            "User authentication and account access",
            "Topic and interest preference management",
            "News article collection through configured external news APIs",
            "Personalized feed generation using selected topics and reading history",
            "Article filtering by category, source, and date",
            "Article sorting by relevance or publication date",
            "Recommendation history and interaction tracking",
            "Administrative management of API source settings",
        ]
    elif context["domain"] == "library management":
        functions = [
            "User authentication and role-based access",
            "Book record management",
            "Member record management",
            "Book issue and return transaction handling",
            "Availability and borrowing status tracking",
            "Library report generation",
        ]
    elif context["domain"] == "software documentation automation":
        functions = [
            "SRS document generation from prompts, uploaded documents, and UML images",
            "UML diagram generation from prompts and SRS documents",
            "SRS ambiguity, correctness, and completeness analysis",
            "UML image text extraction and diagram explanation",
            "Editable SRS preview and export handling",
            "Editable UML diagram canvas with diagram tools",
            "Project, upload, output, export, and activity history storage",
        ]
    elif context["domain"] == "e-commerce":
        if is_add_product_admin_workflow(context):
            functions = [
                "Admin login and access validation",
                "Control panel product-entry workflow",
                "Product detail entry",
                "Submitted product information validation",
                "Duplicate product detection",
                "Existing product quantity update",
                "New product database storage",
                "Product-added confirmation",
            ]
        else:
            functions = [
                "Customer registration and login",
                "Product catalog browsing and searching",
                "Shopping cart management",
                "Checkout and order placement",
                "Payment status recording",
                "Inventory and product record management",
                "Order tracking and status notification",
                "Sales and order report generation",
            ]
    elif context["domain"] == "passenger check-in management":
        functions = [
            "Passenger ticket verification",
            "Passenger check-in eligibility confirmation",
            "Luggage acceptance and fee-status recording",
            "Check-in status display",
            "Counter staff authentication",
            "Passenger service report generation",
        ]
    else:
        functions = [title_case_phrase(feature["action"]) for feature in context.get("features", [])[:10]]
        if not functions:
            functions = ["Validated data entry", "Record management", "Request processing", "Result presentation"]

    return format_numbered(functions)


def build_data_requirements(project_title, context):
    records = [
        "User account information",
        "Authentication and access details",
        "System activity history",
    ]
    if context["domain"] == "software documentation automation":
        records.append("Generated outputs and edited outputs")

    profile_data = DOMAIN_PROFILES.get(context["domain"], {}).get("data")
    if profile_data:
        records.extend(profile_data)
    elif context["domain"] == "library management":
        records.extend(["Book records", "Borrowing records", "Return records", "Inventory records"])
    elif context["domain"] == "forecasting and prediction":
        records.extend(["Dataset records", "Forecast requests", "Prediction results", "Chart/report outputs"])
    elif context["domain"] == "e-commerce":
        if is_add_product_admin_workflow(context):
            records.extend([
                "Admin account and login records",
                "Product detail records",
                "Product validation status records",
                "Existing product quantity records",
                "New product database records",
                "Product-added confirmation records",
            ])
        else:
            records.extend(["Product records", "Order records", "Payment records", "Customer records"])
    elif context["domain"] == "personalized news aggregation":
        records.extend([
            "User preference records",
            "News article metadata",
            "Article source records",
            "External news API configuration records",
            "Reading history records",
            "Recommendation result records",
        ])
    elif context["domain"] == "software documentation automation":
        records.extend([
            "Project records",
            "Uploaded source file records",
            "Generated SRS document records",
            "SRS analysis report records",
            "UML generation request records",
            "UML output records",
            "UML image description records",
            "Export history records",
        ])
    elif context["domain"] == "waste collection management":
        records.extend([
            "Waste-bin and service-area records",
            "Resident issue reports",
            "Collection route and pickup records",
            "Bin-fill sensor readings",
            "Collection vehicle location records",
            "Recycling performance records",
        ])
    elif context["domain"] == "gym and fitness management":
        records.extend([
            "Member and membership-plan records",
            "Trainer and class schedule records",
            "Session booking records",
            "Attendance records",
            "Membership payment records",
            "Equipment maintenance records",
        ])
    elif context["domain"] == "travel reservation management":
        records.extend([
            "Traveler and itinerary records",
            "Flight and hotel availability records",
            "Booking and confirmation records",
            "Payment verification records",
        ])
    elif context["domain"] == "healthcare management":
        records.extend([
            "Patient records",
            "Doctor schedule records",
            "Appointment and visit records",
            "Authorized medical-note records",
            "Reminder delivery records",
        ])
    else:
        feature_records = [
            f"{title_case_phrase(feature['action'])} records"
            for feature in context.get("features", [])[:6]
        ]
        records.extend(feature_records or [f"{project_title} records", "Input records", "Result records"])

    return format_numbered(unique_items(records))


def build_scope_description(project_title, project_description, context):
    text = clean_uploaded_description(str(project_description or "").strip())
    if not text:
        return default_scope_description(project_title, context)
    if re.search(r"content extracted from uploaded uml diagram image", text, flags=re.I):
        return default_scope_description(project_title, context)

    scope = extract_labeled_section(text, "scope")
    if not scope:
        purpose = extract_labeled_section(text, "purpose")
        if purpose:
            scope = purpose

    if not scope:
        sentences = re.split(r"(?<=[.!?])\s+", clean_uploaded_description(text))
        useful = [
            sentence for sentence in sentences
            if 35 <= len(sentence) <= 260
            and not re.search(r"table of contents|prepared by|department|uploaded source content|domain:", sentence, re.I)
        ]
        scope = " ".join(useful[:3])

    scope = remove_source_noise(clean_uploaded_description(scope))
    if len(scope) > 850:
        scope = scope[:850].rsplit(" ", 1)[0] + "."

    if is_noisy_extracted_text(scope):
        return default_scope_description(project_title, context)

    return scope or default_scope_description(project_title, context)


def default_scope_description(project_title, context):
    if context.get("domain") == "e-commerce" and is_add_product_admin_workflow(context):
        return (
            f"{project_title} is intended to support the online shopping admin workflow for adding product records through a control panel. "
            "The system shall authenticate the admin, validate the admin user, accept product details, validate submitted product information, "
            "check whether the same product already exists, update quantity for an existing product, save new product records in the database, "
            "and display a product-added confirmation when the workflow is completed."
        )

    domain = context.get("domain", "software system")
    features = [
        feature.get("action", "")
        for feature in context.get("features", [])
        if feature.get("action")
    ][:4]
    feature_text = ", ".join(features) if features else "perform the main user workflows"
    record_clause = "" if "manage system records" in feature_text.lower() else "manage required records, "
    return (
        f"{project_title} is intended to support a {domain} workflow through a structured web-based system. "
        f"The system shall allow authorized users to {feature_text}, {record_clause}validate input, "
        f"store generated or processed outputs, and present results in a clear downloadable form."
    )


def is_add_product_admin_workflow(context):
    text = context.get("text", "")
    return bool(re.search(r"\b(add product|product details|validate user|validate information|same product|update quantity|save in database|product added|c-panel)\b", text))


def is_noisy_extracted_text(value):
    text = str(value or "").strip()
    if not text:
        return True
    words = re.findall(r"[A-Za-z]{2,}", text)
    if len(words) < 8:
        return True
    unusual_symbol_count = len(re.findall(r"[{}|+_=<>\\\[\]]", text))
    if unusual_symbol_count >= 2:
        return True
    if re.search(r"\b[a-z]{7,}(?:icket|eeee|uu|ii|oo)\b", text, flags=re.I):
        return True
    short_or_broken = sum(1 for word in words if len(word) <= 2)
    if short_or_broken / max(len(words), 1) > 0.28:
        return True
    if not re.search(r"\b(system|application|platform|software|user|users|shall|allow|manage|provide|support|service|services)\b", text, flags=re.I):
        return True
    return False


SECTION_LABELS = (
    "introduction",
    "purpose",
    "scope",
    "intended audience",
    "definitions and abbreviations",
    "definitions",
    "acronyms",
    "document overview",
    "references",
    "overall description",
    "product perspective",
    "product functions",
    "user classes and characteristics",
    "user characteristics",
    "operating environment",
    "design and implementation constraints",
    "assumptions and dependencies",
    "system features",
    "functional requirements",
    "non-functional requirements",
    "specific requirements",
    "external interface requirements",
    "data requirements",
    "security requirements",
    "performance requirements",
    "acceptance criteria",
    "tools and technologies",
    "literature review",
    "problem statement",
    "proposed solution",
)


def extract_labeled_section(text, label):
    lines = [line.strip() for line in str(text or "").splitlines()]
    label_pattern = re.compile(
        rf"^(?:chapter\s+\d+\s*[:.-]?\s*)?(?:\d+(?:\.\d+)*\.?\s*)?{re.escape(label)}\s*:?\s*$",
        re.I,
    )
    inline_label_pattern = re.compile(
        rf"^(?:chapter\s+\d+\s*[:.-]?\s*)?(?:\d+(?:\.\d+)*\.?\s*)?{re.escape(label)}\s*[:.-]\s+(.+)$",
        re.I,
    )
    stop_labels = [item for item in SECTION_LABELS if item.lower() != label.lower()]
    stop_pattern = re.compile(
        r"^(?:chapter\s+\d+\s*[:.-]?\s*)?(?:\d+(?:\.\d+)*\.?\s*)?(?:"
        + "|".join(re.escape(item) for item in stop_labels)
        + r")\s*:?\s*$",
        re.I,
    )
    candidates = []

    for index, line in enumerate(lines):
        inline_match = inline_label_pattern.match(line)
        if not inline_match and not label_pattern.match(line):
            continue

        collected = [inline_match.group(1).strip()] if inline_match else []
        for next_line in lines[index + 1:]:
            if stop_pattern.match(next_line):
                break
            if re.search(r"table of contents|pageref|_toc|developed by|supervised by|chapter\s+\d+\s*$", next_line, re.I):
                continue
            if next_line:
                collected.append(next_line)

        candidate = remove_source_noise(" ".join(collected).strip())
        if len(candidate) >= 40:
            candidates.append(candidate)

    for candidate in candidates:
        if re.search(r"\b(system|project|platform|application|software|users?|generate|analysis|diagram|document)\b", candidate, re.I):
            return candidate

    return candidates[0] if candidates else ""


def clean_uploaded_description(text):
    cleaned = re.sub(r"Uploaded source content:\s*", "\n", str(text or ""), flags=re.I)
    cleaned = re.sub(r"Content from .+?:", "\n", cleaned)
    cleaned = re.sub(
        r"Table of Contents\s+.*?(?=\n\s*(?:Chapter\s+1\b|1\.\s*Introduction\b|Introduction\s*:))",
        "\n",
        cleaned,
        flags=re.I | re.S,
    )
    cleaned = re.sub(r"\bTOC\s+\\o.+?(?=Chapter\s+1\b|Introduction\s*:)", "\n", cleaned, flags=re.I | re.S)
    cleaned = re.sub(r"PAGEREF\s+_Toc\d+\s+\\h\s+\d+", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\\h|\\z|\\u", " ", cleaned)
    cleaned = re.sub(r"A\s+rtificial", "Artificial", cleaned, flags=re.I)
    cleaned = re.sub(r"T\s+he\s+U\s+niversity\s+o\s+f\s+C\s+hakwal", "The University of Chakwal", cleaned, flags=re.I)
    cleaned = re.sub(r"Domain:\s*.+", " ", cleaned)
    cleaned = re.sub(r"Detail level:\s*.+", " ", cleaned)
    cleaned = re.sub(r"Attached source names:\s*.+", " ", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n\s+", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def remove_source_noise(text):
    cleaned = str(text or "")
    cleaned = re.sub(r"\b(?:Developed By|Supervised By)\b.*?(?=(?:\bChapter\b|\bIntroduction\b|\bScope\b)|$)", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\bPAGEREF\b|\b_Toc\d+\b|\\h|\\z|\\u", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\bTools and Technologies:\s*Chapter\s+\d+.*", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\bTable of Contents\b.*", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def build_acceptance_criteria(project_title, functional, non_functional):
    criteria = [
        f"The {project_title} shall display all main features through the user interface.",
        "The system shall validate input before processing any request.",
        "The system shall generate or display output after a successful request.",
        "The system shall allow users to review and download generated outputs on generation pages.",
        "The system shall prevent unauthorized access to restricted features.",
    ]

    if functional:
        criteria.append("The implemented functional requirements shall be testable through user actions.")
    if non_functional:
        criteria.append("Each non-functional requirement shall be verified against its stated condition during testing.")

    return format_numbered(criteria)

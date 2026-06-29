# AIRA AI Models: Supervisor Viva Answers

## Why Did We Choose This Project?

AIRA project choose karne ki main reason ye hai ke software engineering students aur developers ke liye SRS writing, ambiguity checking, UML diagram generation, aur documentation formatting time-consuming tasks hain. Requirements agar unclear hon to development stage mein bugs, scope confusion, and rework barhta hai.

Is project mein humne requirement engineering ko AI ke sath combine kiya. AIRA user ko SRS generation, ambiguity analysis, UML generation, UML image description, editable diagrams, downloads, and history ek hi web app mein provide karta hai.

## What Problem Does AIRA Solve?

AIRA ye problems solve karta hai:

- User ko SRS document manually start from zero nahi karna parta.
- Ambiguous requirements identify hoti hain.
- UML diagrams prompt ya SRS document se generate hotay hain.
- Uploaded UML image ko describe kiya ja sakta hai.
- Generated content editable and downloadable hota hai.
- User ka work history database mein save hota hai.

## Is AIRA A Hybrid Approach?

Yes, AIRA hybrid approach use karta hai.

Hybrid ka matlab yahan ye hai ke system sirf aik AI model par depend nahi karta. Is mein multiple techniques combine hoti hain:

- Machine Learning classifiers
- TF-IDF retrieval
- Rule-based NLP
- OCR
- Structured document templates
- Editable frontend canvas
- Database-backed history

This is useful because SRS and UML are structured software engineering artifacts. Pure free-text generation kabhi-kabhi hallucinate karta hai, aur pure rule-based system flexible nahi hota. AIRA dono ka balance use karta hai.

## Which AI Models Are Used?

Main AI/ML modules:

1. SRS Ambiguity Checker
2. Requirement Type Classifier
3. SRS Generation Retrieval Model
4. UML Diagram Generation Model
5. UML Image Description OCR Model

## Why Did We Not Use Django?

Humne Django use nahi kiya because project backend already Node.js and Express.js par built hai. Express APIs frontend ke sath simple and fast integration provide karti hain.

Python ko humne AI services ke liye use kiya because scikit-learn, pandas, OpenCV, and pytesseract Python ecosystem mein strong libraries hain. Isliye architecture ye hai:

- Frontend: HTML, CSS, JavaScript
- Backend API: Node.js + Express.js
- AI Services: Python
- Database: MySQL

Django use karne se backend duplicate ho jata aur existing Express backend ko rewrite karna parta. FYP ke scope ke liye Express + Python AI services zyada practical, lightweight, and maintainable approach hai.

## Did We Use Any Framework?

Yes. Humne framework/libraries use ki:

- Express.js backend framework
- scikit-learn machine learning framework/library
- Node.js runtime
- MySQL database
- OpenCV image processing library
- Tesseract OCR engine

Humne Django specifically use nahi kiya because uski zarurat nahi thi.

## Why Not Use A Large Language Model Only?

LLM only use karne se:

- Output inconsistent ho sakta hai.
- Same prompt par format change ho sakta hai.
- Hallucination ka chance hota hai.
- Offline/local project dependency mushkil hoti hai.
- Editable UML object generation direct nahi milti.

AIRA ka hybrid approach document structure aur UML object generation ko controlled rakhta hai.

## There Are Already Many Tools, So Why AIRA?

Existing tools aksar sirf one feature provide karte hain:

- Some tools only diagram generate karte hain.
- Some tools only SRS template dete hain.
- Some tools paid/cloud based hotay hain.
- Some tools generated diagram ko editable object form mein nahi dete.
- Some tools academic FYP workflow ke liye simple nahi hotay.

AIRA ka difference:

- SRS generation
- SRS ambiguity checking
- UML generation from prompt or SRS
- UML image description
- Editable diagram canvas
- Multiple download formats
- Login/signup
- User-based work history
- Local database integration
- Student-friendly workflow

## Why Use TF-IDF?

TF-IDF simple, fast, and effective text representation technique hai. Requirements text usually short sentences hoti hain. TF-IDF important words and phrases ko numeric form mein represent karta hai.

Example:

```text
authenticate user, password, login
```

Ye words security/authentication requirement ke liye important signals hain.

## Why Use Logistic Regression?

SRS ambiguity checker binary classification task hai: ambiguous ya clear. Logistic Regression lightweight, fast, stable, and probability score provide karta hai. Isliye ambiguity detection ke liye suitable hai.

## Why Use LinearSVC?

LinearSVC text classification mein strong model hota hai, especially high-dimensional TF-IDF features ke sath. Requirement type and UML type classification mein labels multiple/structured hain, isliye LinearSVC useful choice hai.

## Why Use Retrieval For SRS?

SRS generation mein retrieval isliye use kiya gaya taake system existing requirement patterns se relevant lines choose kar sake. Isse generated SRS pure static template se better hota hai aur user ke domain ke according change hota hai.

## Why Use OCR For UML Image Description?

UML image ke andar text pixels ki form mein hota hai. OCR ke bina system labels read nahi kar sakta. Tesseract OCR text extract karta hai, phir rules us text ko clean professional explanation mein convert karte hain.

## What Is The Backend Flow?

1. User frontend par input/file upload karta hai.
2. Express backend request receive karta hai.
3. Backend file save/extract karta hai.
4. Python AI service run hoti hai.
5. AI output JSON form mein backend ko milta hai.
6. Backend output database mein save karta hai.
7. Frontend preview/download/history show karta hai.

## What Is The Database Role?

Database user accounts and work history save karta hai:

- Users
- Projects
- Uploaded files
- SRS documents
- SRS analysis reports
- UML requests
- UML outputs
- UML image descriptions
- Export history
- Activity history

## What If Supervisor Asks: Is This Production-Level?

Answer:

This is an academic final year project with real-time functional integration. It has trained ML pipelines, OCR processing, backend APIs, database storage, and frontend editing features. For commercial production, more training data, user testing, security hardening, deployment pipeline, and larger model evaluation would be needed.

## What If Supervisor Asks: What Is New In AIRA?

AIRA is not claiming to invent a new ML algorithm. Its novelty is integration of requirement engineering tasks into one practical system:

- SRS generation
- ambiguity detection
- UML generation
- UML image interpretation
- editable outputs
- history/database integration

Ye combination student/developer workflow ke liye useful hai.

## Short Final Viva Statement

AIRA is a hybrid AI-based requirement engineering assistant. It combines machine learning, TF-IDF retrieval, rule-based NLP, OCR, Express backend APIs, MySQL database, and an editable frontend interface to help users generate, analyze, edit, download, and reuse SRS and UML artifacts.


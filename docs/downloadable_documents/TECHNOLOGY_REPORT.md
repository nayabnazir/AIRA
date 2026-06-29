# AIRA Project Technology Report

## 1. Project Overview

AIRA, Artificial Intelligence Requirement Analyzer, is a web-based Final Year Project that helps users prepare and review software requirement artifacts. The system supports SRS document generation, UML diagram generation, ambiguity checking, UML image description, user authentication, and user-specific work history.

The project is divided into four main technical layers:

- Frontend user interface
- Backend API server
- MySQL database
- Python AI/ML services

## 2. Frontend Technologies

The frontend is built using:

- HTML5 for page structure
- CSS3 for styling, layout, responsive design, and document formatting
- JavaScript for client-side logic and API communication
- Browser File API for file upload and preview
- LocalStorage for storing the currently logged-in user and reuse payloads
- SVG and HTML elements for editable UML diagram canvas behavior
- Font Awesome CDN for password visibility icons on authentication pages

The frontend pages are located in:

```text
frontend/Pages/
```

Important frontend files:

```text
frontend/Pages/index.html
frontend/Pages/generate-srs.html
frontend/Pages/generate-uml.html
frontend/Pages/check-srs.html
frontend/Pages/upload-uml.html
frontend/Pages/history.html
frontend/Pages/login.html
frontend/Pages/signup.html
frontend/Pages/app.js
frontend/Pages/style.css
```

The frontend communicates with the backend using REST API calls through JavaScript `fetch()`.

## 3. Backend Technologies

The backend is built using:

- Node.js as the server runtime
- Express.js for API route handling
- CORS for frontend-backend communication
- mysql2 for MySQL database connection
- bcryptjs for password hashing and login verification
- child_process spawn for calling Python AI scripts from Node.js

Backend entry point:

```text
backend/server.js
```

Database connection file:

```text
backend/db.js
```

Backend route files:

```text
backend/routes/auth.js
backend/routes/history.js
backend/routes/srsGeneration.js
backend/routes/aiModels.js
backend/routes/fileExtraction.js
backend/routes/umlTitle.js
```

## 4. Backend Connection Flow

The frontend sends requests to:

```text
http://localhost:3000/api
```

Example flow:

1. User enters data on a frontend page.
2. JavaScript sends a request using `fetch()`.
3. Express.js receives the request in the related route file.
4. If database storage is required, the backend uses `mysql2` through `db.js`.
5. If AI processing is required, Node.js starts a Python script using `child_process.spawn`.
6. Python returns JSON output to Node.js.
7. Node.js sends the final response back to the frontend.
8. The frontend displays the generated result to the user.

## 5. Database Technologies

The database uses:

- MySQL
- XAMPP MySQL server during local development
- SQL schema stored in `DB Design/Database-Design.sql`

Main tables:

```text
users
projects
uploaded_files
srs_documents
srs_analysis_reports
srs_analysis_issues
uml_requests
uml_outputs
uml_image_descriptions
export_history
activity_history
```

Database responsibilities:

- Store registered users
- Store user projects
- Store generated SRS documents
- Store ambiguity analysis reports
- Store UML generation requests and outputs
- Store UML image descriptions
- Store user-specific work history

## 6. Authentication Connection

Signup:

```text
frontend signup.html -> /api/signup -> users table
```

Login:

```text
frontend login.html -> /api/login -> users table -> bcrypt password check
```

After login, the frontend stores the user object in LocalStorage. Generated work sends `userId` to the backend so history is saved against the correct user.

## 7. History Connection

The history page calls:

```text
GET /api/history/:userId
```

The backend reads records from `activity_history` and joins related records such as SRS documents, UML outputs, and analysis reports. Login and signup records are filtered out because the history page should show work history only.

## 8. AI/ML Technologies

AI and ML services are implemented in Python.

Languages and libraries used:

- Python
- scikit-learn
- joblib
- pandas
- numpy
- OpenCV
- pytesseract
- Pillow
- Graphviz

Training and model files are located in:

```text
AIRA_ML/
```

Runtime AI services are located in:

```text
backend/aira-ai/
```

## 9. Model Training Technologies

The training scripts use Python and scikit-learn pipelines.

Training scripts:

```text
AIRA_ML/train_requirement_type_model.py
AIRA_ML/train_srs_ambiguity_model.py
AIRA_ML/train_srs_generation_index.py
AIRA_ML/train_uml_models.py
```

Model files:

```text
AIRA_ML/requirement_type_pipeline.joblib
AIRA_ML/srs_ambiguity_pipeline.joblib
AIRA_ML/srs_generation_index.joblib
AIRA_ML/uml_diagram_type_pipeline.joblib
AIRA_ML/uml_structure_retriever.joblib
```

Copied runtime models:

```text
backend/aira-ai/models/
```

## 10. AI Modules

SRS Generation:

- Uses Python services and trained retrieval/index files.
- Produces formatted SRS content.
- Saves generated SRS into the database.

SRS Ambiguity Checking:

- Uses trained ambiguity model plus rule-based checks.
- Detects vague terms such as "fast", "user friendly", and other unclear wording.
- Saves analysis results in database history.

UML Generation:

- Uses model-assisted and rule-based extraction from prompts or SRS documents.
- Produces use case, class, sequence, ERD, and activity diagram data.
- Loads generated diagram into the editable frontend canvas.

UML Image Description:

- Uses OpenCV and Tesseract OCR to extract readable text from UML images.
- Converts detected text into a professional description.
- Saves extracted text and generated description in the database.

## 11. Why Django Is Not Used

This project does not use Django. Django is a Python web framework, but this project already uses Node.js and Express.js for the web backend. Python is used only for AI/ML processing. This separation is acceptable and professional because:

- Express handles web APIs.
- Python handles machine learning and OCR processing.
- MySQL stores application data.
- The frontend remains independent and communicates through REST APIs.

## 12. Final Technology Summary

| Layer | Technologies |
| --- | --- |
| Frontend | HTML5, CSS3, JavaScript |
| Backend | Node.js, Express.js |
| Database | MySQL, XAMPP MySQL |
| Authentication | bcryptjs, users table |
| API Communication | REST APIs, JSON, fetch |
| AI/ML | Python, scikit-learn, joblib |
| OCR | OpenCV, Tesseract OCR, pytesseract |
| Image Processing | Pillow, OpenCV |
| Model Storage | joblib files |
| History | MySQL activity_history table |


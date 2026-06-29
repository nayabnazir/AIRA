# AIRA - Artificial Intelligence Requirement Analyzer

AIRA is a Final Year Project web application for generating Software Requirements Specification documents, generating editable UML diagrams, checking SRS ambiguity, and describing uploaded UML diagram images.

## Main Modules

- SRS Generation
- UML Diagram Generation
- SRS Ambiguity Analysis
- UML Image Description
- User Authentication
- User Work History

## Technology Stack

- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js, Express.js
- Database: MySQL
- AI/ML Services: Python, scikit-learn, joblib, OpenCV, Tesseract OCR, Pillow

## Project Structure

```text
AI_SRS_UML_Project/
  frontend/        Web application user interface
  backend/         Node.js API and Python AI service bridge
  AIRA_ML/         Model training scripts, datasets, reports, and trained models
  DB Design/       MySQL database schema and database design assets
  docs/            Project documentation and reports
  archive/         Old packaged project files
```

## Running The Project

1. Start MySQL using XAMPP.
2. Make sure the `aira_db` database exists.
3. Start the backend:

```bash
cd backend
npm start
```

4. Open the frontend HTML pages from:

```text
frontend/Pages/
```

## Documentation

See:

- `docs/TECHNOLOGY_REPORT.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/RUNBOOK.md`


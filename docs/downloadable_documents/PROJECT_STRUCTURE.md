# Professional Project Structure

The project is organized into clear functional areas.

## Current Structure

```text
AI_SRS_UML_Project/
  AIRA_ML/
  backend/
  DB Design/
  docs/
  frontend/
  archive/
  README.md
  .gitignore
```

## Folder Responsibilities

### frontend/

Contains the web application interface.

```text
frontend/Pages/
  HTML pages
  app.js
  style.css
  Screenshots/
```

This folder should contain only frontend assets, pages, styles, scripts, and UI images.

### backend/

Contains the API server and runtime AI service bridge.

```text
backend/
  server.js
  db.js
  routes/
  aira-ai/
  package.json
```

This folder handles:

- API routing
- Login/signup
- MySQL connection
- Saving generated work
- Calling Python AI services

### backend/routes/

Contains route-specific API files.

```text
auth.js
history.js
srsGeneration.js
aiModels.js
fileExtraction.js
umlTitle.js
```

### backend/aira-ai/

Contains Python runtime AI services used by the backend.

```text
ai_api.py
srs_worker.py
extract_uploaded_file.py
ai/
models/
utils/
```

### AIRA_ML/

Contains model training scripts, datasets, metrics, and trained model files.

This folder is for experimentation, training, evaluation, and model updates.

### DB Design/

Contains database schema, table design files, and database diagrams.

Important file:

```text
Database-Design.sql
```

### docs/

Contains professional project documentation.

```text
TECHNOLOGY_REPORT.md
PROJECT_STRUCTURE.md
RUNBOOK.md
```

### archive/

Contains old packaged files that are not needed during daily development.

## Professional Notes

- Runtime code should stay inside `frontend` and `backend`.
- Training files should stay inside `AIRA_ML`.
- Database design files should stay separate from backend runtime code.
- Old compressed packages should stay in `archive`.
- Generated exports should not be committed into source control.
- `node_modules`, `__pycache__`, and local generated files should be ignored.

## Recommended Future Improvement

For a later cleanup, the frontend can be further split like this:

```text
frontend/
  pages/
  assets/
  css/
  js/
```

However, the current app uses direct relative paths from `frontend/Pages`, so moving those files now would require updating every HTML reference. To avoid breaking the working app, the current runtime structure has been preserved.


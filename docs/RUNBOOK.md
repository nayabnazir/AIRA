# AIRA Runbook

## Start MySQL

Start MySQL from XAMPP.

The backend expects:

```text
host: localhost
user: root
password:
database: aira_db
```

## Create Database

Run the SQL file once:

```text
DB Design/Database-Design.sql
```

## Start Backend

```bash
cd backend
npm start
```

Expected backend URL:

```text
http://localhost:3000
```

## Open Frontend

Open pages from:

```text
frontend/Pages/
```

Important pages:

```text
signup.html
login.html
generate-srs.html
generate-uml.html
check-srs.html
upload-uml.html
history.html
```

## Login And History Flow

1. User signs up.
2. User logs in.
3. Browser stores user information in LocalStorage.
4. Generated work sends `userId` to backend.
5. Backend stores work in MySQL.
6. History page loads only that user's work history.

## AI Processing Flow

```text
Frontend -> Express API -> Python AI script -> AI result -> Express API -> Frontend
```

## Common Problems

### MySQL Access Denied

Check `backend/db.js` and confirm the password matches MySQL.

### Unknown Database

Run:

```text
DB Design/Database-Design.sql
```

### Frontend Shows Old Behavior

Hard refresh browser:

```text
Ctrl + F5
```

### Backend Changes Not Showing

Restart backend:

```bash
cd backend
npm start
```


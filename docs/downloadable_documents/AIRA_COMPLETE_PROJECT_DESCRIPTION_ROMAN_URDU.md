# AIRA Complete Project Description - Roman Urdu

## 1. Project Ka Naam

Project ka naam **AIRA - Artificial Intelligence Requirement Analyzer** hai.

AIRA aik web based Final Year Project hai jo software projects ke liye requirements aur UML related documents generate, analyze, aur manage karta hai. Is system ka main purpose ye hai ke user apni project idea, SRS document, ya UML image upload kare aur system us ke basis par professional SRS document, UML diagrams, ambiguity analysis, aur UML image description generate kar sake.

## 2. Project Ka Main Idea

Software development me requirement gathering aur documentation bohat important phase hota hai. Agar requirements unclear, incomplete, ya ambiguous hon to baad me development aur testing me problems hoti hain. AIRA isi problem ko solve karne ke liye banaya gaya hai.

Is project me user:

- SRS document generate kar sakta hai.
- SRS document ki ambiguity check kar sakta hai.
- UML diagrams generate kar sakta hai.
- UML image upload kar ke us ki textual description hasil kar sakta hai.
- Generated diagrams aur documents ko edit kar sakta hai.
- Apni previous work history dekh sakta hai.
- Login/signup ke through apna separate account use kar sakta hai.

## 3. Project Ka Purpose

AIRA ka purpose ye hai ke software engineering students, developers, aur project teams ko requirement analysis aur documentation me help di ja sake. System manual documentation ka time reduce karta hai aur user ko structured output provide karta hai.

Project ke main purposes:

- Requirements ko professional SRS format me convert karna.
- Ambiguous requirements ko identify karna.
- UML diagrams generate karna.
- UML images se useful explanation nikalna.
- User ke generated work ko database me save karna.
- User ko apna previous work dobara reuse karne ki facility dena.

## 4. Project Ki Major Modules

AIRA me ye major modules hain:

1. User Authentication
2. SRS Generation
3. SRS Ambiguity Checker
4. UML Diagram Generation
5. UML Image Description
6. Editable UML Canvas
7. My History
8. File Upload and Preview
9. Download and Export
10. Database Storage

## 5. User Authentication Module

Authentication module me signup aur login pages hain.

### Signup

User apna full name, email, password, aur confirm password enter karta hai. Backend password ko plain text me save nahi karta. Password ko `bcryptjs` se hash kiya jata hai, phir MySQL database me save hota hai.

Signup ka flow:

1. User signup form fill karta hai.
2. Frontend JavaScript `/api/signup` endpoint ko request send karta hai.
3. Backend email aur password validate karta hai.
4. Password hash hota hai.
5. User record `users` table me save hota hai.
6. Signup successful message show hota hai.

### Login

Login me user email aur password enter karta hai.

Login ka flow:

1. User email aur password enter karta hai.
2. Frontend `/api/login` endpoint ko request send karta hai.
3. Backend database se email ke through user find karta hai.
4. `bcryptjs` password compare karta hai.
5. Agar password incorrect ho to message show hota hai: "Check your password and try again."
6. Agar login successful ho to user data browser LocalStorage me save hota hai.

## 6. SRS Generation Module

SRS Generation module AIRA ka aik important module hai. User project title, project idea, ya uploaded source file ke basis par Software Requirements Specification generate kar sakta hai.

Input sources:

- Project title
- Project idea
- PDF document
- Word document
- TXT file
- UML diagram image

Output:

- Professional SRS document
- Preview on web page
- Downloadable formats
- Database me saved SRS history

SRS Generation ka flow:

1. User SRS generation page open karta hai.
2. User project title aur project idea enter karta hai, ya file upload karta hai.
3. Frontend uploaded file ko backend ke liye prepare karta hai.
4. Backend file se text extract karta hai.
5. Python AI service SRS generation model ko call karti hai.
6. Model project title, domain, actors, features, data requirements, security requirements, aur acceptance criteria infer karta hai.
7. System formatted SRS generate karta hai.
8. Result frontend par preview hota hai.
9. Generated SRS `srs_documents` table me save hota hai.
10. User history me SRS generation record show hota hai.

## 7. SRS Ambiguity Checker Module

Ambiguity checker ka kaam ye hai ke SRS requirements me vague ya unclear words detect kare.

Example ambiguous words:

- fast
- user friendly
- easy
- efficient
- secure
- reliable
- quick
- better

Ambiguity Checker ka flow:

1. User SRS text paste karta hai ya file upload karta hai.
2. Backend uploaded file se text extract karta hai.
3. Python ambiguity model text ko sentences me split karta hai.
4. Har requirement ko model aur rule-based logic se check kiya jata hai.
5. Agar vague terms milen to requirement ambiguous mark hoti hai.
6. Result me total requirements, ambiguous count, clear count, aur detected terms show hote hain.
7. Result database me `srs_analysis_reports` aur `srs_analysis_issues` me save hota hai.
8. User history me analysis record show hota hai.

## 8. UML Diagram Generation Module

UML generation module user prompt ya SRS document se UML diagram generate karta hai.

Supported diagrams:

- Use Case Diagram
- Class Diagram
- Sequence Diagram
- ERD Diagram
- Activity Diagram

UML Generation ka flow:

1. User diagram type select karta hai.
2. User prompt enter karta hai ya SRS document upload karta hai.
3. Frontend text backend ko send karta hai.
4. Backend Python UML generation service call karta hai.
5. Python service input text se actors, use cases, classes, entities, actions, aur messages extract karti hai.
6. Diagram ka structured JSON generate hota hai.
7. Frontend us JSON ko editable canvas me render karta hai.
8. User shapes move, edit, connect, delete, copy, paste kar sakta hai.
9. Generated UML output database me save hota hai.
10. User history me UML generation record show hota hai.

## 9. UML Image Description Module

Is module me user UML diagram ki image upload karta hai aur system us image ka textual explanation generate karta hai.

Technologies:

- OpenCV
- Tesseract OCR
- pytesseract
- Python text cleaning rules

UML Image Description ka flow:

1. User UML diagram image upload karta hai.
2. Backend image Python OCR service ko send karta hai.
3. OpenCV image ko preprocess karta hai.
4. Tesseract OCR image se readable text extract karta hai.
5. Extracted text clean kiya jata hai.
6. Connector noise jaise include, extend, broken OCR words remove kiye jate hain.
7. System diagram type infer karta hai.
8. System professional description generate karta hai.
9. Result frontend par show hota hai.
10. Generated description database me save hoti hai.

Example professional output:

System ye batata hai ke uploaded image use case diagram hai, user system ke sath interact karta hai, aur main functions Sign Up, Upload SRS, Generate UML, Upload UML Image, View History, aur Download Output hain.

## 10. Editable UML Canvas

UML generation page me editable diagram environment diya gaya hai.

Canvas features:

- Shapes add karna
- Shapes move karna
- Text edit karna
- Connector draw karna
- Connector select karna
- Delete option
- Copy/paste option
- Drag and drop tools
- Scroll support for large diagrams
- Download PDF/PNG

Tools include:

- Select
- Delete
- Connector
- Text
- Note
- Actor
- Use Case
- Boundary
- Class
- Interface
- Package
- Lifeline
- Activation
- Message
- Start node
- Action
- Decision
- Entity
- Attribute
- Relationship

## 11. My History Module

History page logged-in user ki saved work history show karta hai.

History me ye records show hote hain:

- SRS Generation
- SRS Analysis
- UML Generation
- UML Image Description

Login aur signup records history me show nahi hote, kyun ke wo work history nahi hain.

History ka flow:

1. User login karta hai.
2. Browser LocalStorage me user id save hoti hai.
3. History page `/api/history/:userId` call karta hai.
4. Backend `activity_history` table se sirf us user ka work data lata hai.
5. Duplicate same work entries hide ki jati hain.
6. User Reuse button se old prompt dobara use kar sakta hai.

## 12. Frontend Technologies

Frontend ke liye ye technologies use hui hain:

- HTML5
- CSS3
- JavaScript
- Browser File API
- LocalStorage
- SVG
- Font Awesome CDN

### HTML5

HTML pages structure provide karte hain. Har module ka separate page hai.

### CSS3

CSS layout, colors, buttons, forms, cards, responsive design, SRS preview formatting, aur UML canvas styling ke liye use hui hai.

### JavaScript

JavaScript frontend ka main logic handle karta hai:

- API calls
- File preview
- Login/signup
- SRS generation request
- UML generation request
- History loading
- Reuse functionality
- Download handling
- Editable canvas behavior

### LocalStorage

LocalStorage me logged-in user information aur reuse payload temporarily save hota hai.

## 13. Backend Technologies

Backend ke liye ye technologies use hui hain:

- Node.js
- Express.js
- MySQL2
- bcryptjs
- CORS
- child_process

### Node.js

Node.js backend runtime ke liye use hua hai.

### Express.js

Express.js API routes create karta hai.

Main routes:

- `/api/signup`
- `/api/login`
- `/api/history/:userId`
- `/api/generate-srs`
- `/api/generate-uml`
- `/api/check-ambiguity`
- `/api/describe-uml-image`

### MySQL2

MySQL database se connection ke liye `mysql2` use hua hai.

### bcryptjs

Password hashing aur password comparison ke liye use hua hai.

### child_process

Node.js backend Python AI scripts ko run karne ke liye `child_process.spawn` use karta hai.

## 14. Database Technology

Database MySQL me banaya gaya hai. XAMPP MySQL local development ke liye use hota hai.

Database name:

```text
aira_db
```

Important tables:

- users
- projects
- uploaded_files
- srs_documents
- srs_analysis_reports
- srs_analysis_issues
- uml_requests
- uml_outputs
- uml_image_descriptions
- export_history
- activity_history

## 15. Backend Aur Database Connection

Backend `backend/db.js` file ke through MySQL se connect hota hai.

Connection details:

```text
host: localhost
user: root
password: blank
database: aira_db
```

Flow:

1. Express server start hota hai.
2. `db.js` MySQL pool create karta hai.
3. Routes database queries run karte hain.
4. Data tables me insert, select, update hota hai.

## 16. Backend Aur AI Connection

Backend direct AI model ko JavaScript me train nahi karta. Backend Python scripts ko call karta hai.

Flow:

1. Frontend request Node.js backend ko send karta hai.
2. Node.js `ai_api.py` ya worker script ko spawn karta hai.
3. Python script trained model load karti hai.
4. Python JSON result return karta hai.
5. Node.js result frontend ko send karta hai.

Ye architecture professional hai kyun ke web backend aur AI processing separate responsibilities handle karte hain.

## 17. AI Models Used In Project

Project me multiple AI/ML models aur services use hui hain.

### 17.1 SRS Ambiguity Model

Purpose:

SRS requirements me ambiguous statements detect karna.

Technologies:

- Python
- pandas
- scikit-learn
- TfidfVectorizer
- Logistic Regression
- joblib
- rule-based keyword detection

Training steps:

1. Dataset load hota hai.
2. Requirements text clean hota hai.
3. Ambiguous aur non-ambiguous labels prepare hote hain.
4. Text ko TF-IDF features me convert kiya jata hai.
5. Logistic Regression model train hota hai.
6. Model test data par evaluate hota hai.
7. Accuracy, precision, recall, F1 score calculate hote hain.
8. Trained model `srs_ambiguity_pipeline.joblib` me save hota hai.
9. Runtime backend model ko load kar ke user requirements analyze karta hai.

Runtime steps:

1. User SRS text upload karta hai.
2. Text sentences me split hota hai.
3. Rule-based vague words detect hote hain.
4. ML model ambiguity score predict karta hai.
5. Final result rules + ML ke combination se banta hai.

### 17.2 Requirement Type Model

Purpose:

Requirement ko type ke basis par classify karna, jaise functional ya non-functional.

Technologies:

- Python
- scikit-learn
- TfidfVectorizer
- LinearSVC
- Logistic Regression
- joblib

Training steps:

1. Requirement dataset load hota hai.
2. Text preprocessing hoti hai.
3. Requirement labels prepare hote hain.
4. TF-IDF vectorizer text ko numeric features me convert karta hai.
5. Classification model train hota hai.
6. Model evaluation hoti hai.
7. Pipeline `requirement_type_pipeline.joblib` me save hoti hai.

Runtime use:

Ye service SRS quality aur requirement analysis me help karti hai.

### 17.3 SRS Generation Index Model

Purpose:

User input ke basis par relevant SRS style content retrieve karna aur structured SRS generate karna.

Technologies:

- Python
- pandas
- scikit-learn
- TfidfVectorizer
- cosine similarity
- joblib

Training/indexing steps:

1. SRS sample dataset load hota hai.
2. SRS examples aur requirement patterns clean hote hain.
3. TF-IDF vectorizer text ko index karta hai.
4. Similarity search ke liye vector index create hota hai.
5. Index `srs_generation_index.joblib` me save hota hai.

Runtime steps:

1. User project title, prompt, ya uploaded file deta hai.
2. System domain detect karta hai.
3. Actors, features, data items, security needs infer hote hain.
4. Relevant sample patterns retrieve hote hain.
5. SRS sections generate hote hain.
6. Final document formatted HTML aur downloadable format me show hota hai.

### 17.4 UML Diagram Type Model

Purpose:

User input ke basis par diagram type aur related structure infer karna.

Technologies:

- Python
- scikit-learn
- TfidfVectorizer
- LinearSVC
- joblib

Training steps:

1. UML related text prompts prepare hote hain.
2. Labels use case, class, sequence, ERD, activity ke basis par assign hote hain.
3. TF-IDF features generate hote hain.
4. Classifier train hota hai.
5. Model `uml_diagram_type_pipeline.joblib` me save hota hai.

Runtime use:

User ke prompt ya SRS text se system diagram type aur UML content generation me help leta hai.

### 17.5 UML Structure Retriever

Purpose:

Input text se UML ke useful parts retrieve karna.

Technologies:

- Python
- scikit-learn
- TF-IDF
- cosine similarity
- joblib

Runtime steps:

1. User text process hota hai.
2. Domain words aur actions extract hote hain.
3. Actors, classes, entities, messages, aur activities infer hote hain.
4. Structured diagram JSON create hota hai.
5. Frontend canvas JSON ko editable diagram me convert karta hai.

### 17.6 UML Image OCR Model/Service

Purpose:

Uploaded UML image se text extract karna aur professional explanation generate karna.

Technologies:

- Python
- OpenCV
- pytesseract
- Tesseract OCR
- regular expressions

Steps:

1. Image load hoti hai.
2. Image resize hoti hai.
3. Grayscale conversion hoti hai.
4. Thresholding se text readable banaya jata hai.
5. Tesseract OCR text extract karta hai.
6. OCR text clean hota hai.
7. Noise words remove hote hain.
8. Use case labels ya class/activity labels infer hote hain.
9. Professional description generate hoti hai.

## 18. Functional Requirements

AIRA ke functional requirements:

1. System user ko signup karne ki facility dega.
2. System user ko login karne ki facility dega.
3. System password ko secure hash format me store karega.
4. System user ko SRS generate karne ki facility dega.
5. System user ko PDF, Word, TXT, image, ya UML source file upload karne ki facility dega.
6. System uploaded document se text extract karega.
7. System generated SRS preview show karega.
8. System generated SRS download karne ki facility dega.
9. System SRS ambiguity analysis karega.
10. System ambiguous words aur unclear requirements detect karega.
11. System UML diagrams generate karega.
12. System use case, class, sequence, ERD, aur activity diagrams support karega.
13. System generated UML diagram editable canvas me show karega.
14. System UML image upload kar ke description generate karega.
15. System user work history save karega.
16. System history me sirf logged-in user ka work show karega.
17. System old prompt reuse karne ki facility dega.
18. System duplicate same history entries hide karega.

## 19. Non-Functional Requirements

AIRA ke non-functional requirements:

1. System user friendly hona chahiye.
2. System ka interface clear aur understandable hona chahiye.
3. System modern browsers me run hona chahiye.
4. System password secure tarike se store kare.
5. System database me user-specific data separate rakhe.
6. System generated output ko readable format me show kare.
7. System file upload errors ko clearly handle kare.
8. System backend errors ko proper messages me show kare.
9. System generated documents ko professional formatting de.
10. System reusable history maintain kare.
11. System AI output ko unnecessary raw labels ke bajaye meaningful explanation me convert kare.
12. System local development ke liye maintainable structure follow kare.

## 20. Hardware And Software Requirements

Software requirements:

- Windows OS
- Chrome browser
- XAMPP
- MySQL
- Node.js
- Python
- Tesseract OCR
- npm packages
- Python libraries

Hardware requirements:

- Minimum 4 GB RAM
- Recommended 8 GB RAM
- Local disk storage for database, models, and uploaded files
- Processor capable of running Node.js and Python scripts

## 21. Member Contribution Division

Project me 3 members ki professional contribution is tarah divide ki ja sakti hai.

### 21.1 Laiba Arshad

Role: Frontend and UI/UX Lead

Contribution:

- Frontend pages design karna.
- Login, signup, home, SRS generation, UML generation, AI analysis, UML image description, aur history pages banana.
- CSS styling aur responsive layout implement karna.
- SRS preview aur document formatting UI improve karna.
- UML editable canvas tools ke interface par kaam karna.
- File upload preview aur remove option design karna.
- User friendly interface ensure karna.

### 21.2 Alishba Rustam

Role: Backend and Database Lead

Contribution:

- Node.js Express backend setup karna.
- API routes implement karna.
- MySQL database design create karna.
- Users, projects, SRS documents, UML outputs, analysis reports, aur history tables design karna.
- Login/signup backend connect karna.
- Password hashing implement karna.
- History module database se connect karna.
- Backend aur frontend API communication manage karna.

### 21.3 Nayab Nazir

Role: AI/ML and Integration Lead

Contribution:

- SRS ambiguity model training par kaam karna.
- Requirement type model train karna.
- SRS generation index create karna.
- UML generation model/service improve karna.
- UML image OCR and description service implement karna.
- Python AI services ko backend se connect karna.
- Trained models ko runtime backend folder me integrate karna.
- AI outputs ko professional aur useful banane ke liye rules improve karna.

## 22. Combined Team Contribution

Teeno members ne mil kar:

- Project proposal aur documentation prepare ki.
- Requirement analysis perform ki.
- Database schema finalize ki.
- Frontend aur backend integration test ki.
- AI model outputs test kiye.
- Bugs identify aur fix kiye.
- Final project ko complete web application form me prepare kiya.

## 23. Project Architecture

AIRA ka architecture layered architecture follow karta hai.

```text
User Interface
    |
Frontend JavaScript
    |
Node.js Express Backend
    |
MySQL Database
    |
Python AI/ML Services
```

Frontend user se input leta hai. Backend request process karta hai. Database persistent storage provide karta hai. Python AI services machine learning aur OCR processing handle karti hain.

## 24. Data Flow Example

SRS generation ka data flow:

1. User project idea enter karta hai.
2. Frontend request backend ko send karta hai.
3. Backend Python SRS service ko call karta hai.
4. Python model SRS generate karta hai.
5. Backend result database me save karta hai.
6. Frontend result show karta hai.
7. History me record add hota hai.

UML image description ka data flow:

1. User UML image upload karta hai.
2. Frontend image data backend ko send karta hai.
3. Backend Python OCR service ko call karta hai.
4. OCR text extract karta hai.
5. Description generator professional explanation banata hai.
6. Result database me save hota hai.
7. Frontend description show karta hai.

## 25. Testing

Project me ye testing perform hui:

- Signup testing
- Login testing
- Wrong password testing
- Database connection testing
- SRS generation testing
- SRS ambiguity testing
- UML diagram generation testing
- UML image description testing
- History save and reuse testing
- Duplicate history testing
- File upload preview testing

## 26. Limitations

Project ki kuch limitations:

- OCR accuracy uploaded image quality par depend karti hai.
- Agar input prompt bohat vague ho to output bhi general ho sakta hai.
- File input browser security ki wajah se automatically restore nahi ho sakta.
- Fully advanced AI diagram generation ke liye large dataset aur deep learning models future me add kiye ja sakte hain.

## 27. Future Enhancements

Future me project me ye improvements add ki ja sakti hain:

- Cloud based deployment
- Role based dashboards
- More advanced NLP models
- Deep learning based UML understanding
- Better diagram auto-layout
- Real-time collaboration
- Export history management
- Admin panel
- More professional document templates

## 28. Conclusion

AIRA aik complete AI supported requirement analysis system hai jo software engineering documentation ko easier aur faster banata hai. Is project me frontend, backend, database, aur AI/ML services properly integrate ki gayi hain. System user ko SRS generation, ambiguity analysis, UML generation, UML image description, editable diagram environment, aur history reuse jaisi features provide karta hai. Project ka architecture practical, modular, aur final year project ke liye suitable hai.


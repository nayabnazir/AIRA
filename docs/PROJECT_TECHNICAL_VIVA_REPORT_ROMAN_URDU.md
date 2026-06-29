# AIRA Project Technical Viva Report

## Project Title

AIRA - Artificial Intelligence Requirement Analyzer

## Short Introduction

AIRA ek web-based Final Year Project hai jo Software Requirements Specification (SRS) generate karta hai, SRS ambiguity check karta hai, UML diagrams generate karta hai, UML image description banata hai, user authentication provide karta hai, aur user history save karta hai. Project ka main purpose requirement engineering ko fast, structured, aur student-friendly banana hai.

## Problem Statement

Software projects mein aksar students aur developers ko requirements clearly likhne mein problem hoti hai. SRS document manually banana time-consuming hota hai, UML diagrams banana difficult hota hai, aur ambiguous requirements ki wajah se development mein confusion hoti hai. Is problem ko solve karne ke liye AIRA banaya gaya hai jo user ke idea, document, ya diagram se structured SRS, UML output, ambiguity analysis, aur diagram description generate karta hai.

## Why We Chose This Project

Hum ne ye project is liye choose kiya kyun ke requirement engineering software development ka foundation hoti hai. Agar requirements unclear hon to poora project weak ho sakta hai. AIRA students, developers, analysts, aur supervisors ke liye helpful tool hai kyun ke ye SRS writing, UML generation, aur requirement review ko automate aur simplify karta hai. Is project mein web development, database, AI integration, document processing, OCR, and software engineering concepts combine hote hain.

## Main Features

1. User signup and login
2. SRS generation
3. SRS ambiguity analysis
4. UML diagram generation
5. UML image description
6. Editable UML canvas
7. Download options for generated outputs
8. User history
9. Settings and profile management
10. Premium/free plan access control
11. Admin unlimited access
12. Multi-language support for premium users

## Technology Stack

### Frontend

Frontend ke liye HTML5, CSS3, aur JavaScript use hua hai.

Files:

- `frontend/Pages/index.html`
- `frontend/Pages/generate-srs.html`
- `frontend/Pages/generate-uml.html`
- `frontend/Pages/check-srs.html`
- `frontend/Pages/upload-uml.html`
- `frontend/Pages/settings.html`
- `frontend/Pages/app.js`
- `frontend/Pages/style.css`

### Frontend Framework

Is project mein Bootstrap ya Tailwind framework use nahi hua. Styling mostly custom CSS se ki gayi hai. Login aur signup pages mein Font Awesome CDN icons ke liye use hua hai.

### Backend

Backend ke liye Node.js aur Express.js use hua hai.

Main backend files:

- `backend/server.js`
- `backend/db.js`
- `backend/routes/auth.js`
- `backend/routes/history.js`
- `backend/routes/srsGeneration.js`
- `backend/routes/aiModels.js`
- `backend/routes/billing.js`
- `backend/accessControl.js`

### Database

Database ke liye MySQL use hua hai. Node backend `mysql2` package ke through MySQL se connect hota hai.

Database name:

- `aira_db`

Main database use:

- users store karna
- generated SRS/UML history save karna
- usage limit track karna
- premium/admin role manage karna

### AI / Processing Layer

Python scripts AI and processing ke liye use hoti hain.

Important files:

- `backend/aira-ai/ai_api.py`
- `backend/aira-ai/srs_worker.py`
- `backend/aira-ai/extract_uploaded_file.py`
- `backend/aira-ai/ai/srs_generation_service.py`
- `backend/aira-ai/nlp/uml_description.py`
- `backend/aira-ai/nlp/uml_from_text.py`

Python libraries:

- `numpy`
- `pillow`
- `scikit-learn`
- `joblib`
- `graphviz`

### APIs

Project mein AI output ke liye Gemini primary provider aur OpenRouter fallback provider ka structure rakha gaya hai. Agar Gemini limit reach kare ya fail ho, to OpenRouter fallback use ho sakta hai.

API keys `.env` file mein rakhi jati hain:

- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`

### Document and File Handling

Project PDF, DOC/DOCX, TXT, image files, and generated downloadable outputs handle karta hai. File extraction backend mein Python scripts ke through hoti hai.

## Project Architecture

User frontend page par input deta hai. JavaScript request ko backend API par send karta hai. Backend Express route request receive karta hai, access control check karta hai, phir Python AI service ko call karta hai. Python service response generate karti hai. Backend response frontend ko return karta hai. Frontend preview show karta hai aur user download kar sakta hai. Agar user logged in hai to history database mein save hoti hai.

Simple flow:

User Interface -> Express API -> Access Control -> Python AI Service -> MySQL Save -> Frontend Preview/Download

## Group Work Division

### Nayab Nazir

Nayab ka role project mein sab se zyada implementation-focused hai.

Responsibilities:

1. Overall project architecture design
2. Frontend pages integration
3. Main JavaScript logic in `app.js`
4. SRS generation module integration
5. UML generation module integration
6. UML image description module integration
7. AI API integration with backend
8. Premium/free plan access control
9. Admin and premium user logic
10. MySQL backend integration testing
11. Debugging major project issues
12. UI consistency and final polishing
13. Download output formatting
14. Final project testing before evaluation

Files/modules mostly handled by Nayab:

- `frontend/Pages/app.js`
- `frontend/Pages/style.css`
- `frontend/Pages/generate-srs.html`
- `frontend/Pages/generate-uml.html`
- `frontend/Pages/upload-uml.html`
- `frontend/Pages/check-srs.html`
- `backend/server.js`
- `backend/routes/srsGeneration.js`
- `backend/routes/aiModels.js`
- `backend/accessControl.js`
- `backend/aira-ai/ai_api.py`
- `backend/aira-ai/ai/srs_generation_service.py`

### Laiba Arshad

Laiba ka role documentation ke sath project ke SRS and requirement analysis modules mein bhi include hai.

Responsibilities:

1. Project documentation
2. Requirement gathering
3. SRS template structure review
4. Functional and non-functional requirements identification
5. SRS document sections validation
6. Ambiguity analysis testing
7. Sample SRS documents collect karna
8. Generated SRS content review karna
9. Testing checklist prepare karna
10. Help page content and user guide review

Files/modules linked with Laiba:

- SRS requirement content validation
- `frontend/Pages/help.html`
- `frontend/Pages/check-srs.html`
- SRS output review
- Documentation files under `docs/`

### Alishba Rustam

Alishba ka role presentation ke sath UML and UI testing modules mein include hai.

Responsibilities:

1. Project presentation preparation
2. UML diagram examples collect karna
3. UML generation testing
4. UML image description testing
5. UI page flow testing
6. Login/signup testing
7. History module testing
8. Settings page testing
9. Diagram output comparison
10. Screenshots and demo flow prepare karna

Files/modules linked with Alishba:

- `frontend/Pages/generate-uml.html`
- `frontend/Pages/upload-uml.html`
- `frontend/Pages/history.html`
- `frontend/Pages/login.html`
- `frontend/Pages/signup.html`
- Presentation/demo screenshots

## Free and Premium Plan Logic

Free plan mein user limited daily usage kar sakta hai:

- 3 SRS generations per day
- 3 UML generations per day
- 3 UML descriptions per day
- 3 AI analyses per day
- PDF export
- English output

Premium plan:

- Unlimited generation
- Multi-language support
- Advanced AI analysis
- Multiple export formats
- Unlimited project history
- Priority processing

Admin:

- Admin ko sab premium features free milte hain
- Admin limits apply nahi hoti
- Admin emails `backend/accessControl.js` ya `.env` ke `ADMIN_EMAILS` mein add kiye ja sakte hain

## Important Technical Questions With Answers

### Q1. AIRA ka main objective kya hai?

Answer: AIRA ka objective requirement engineering process ko automate karna hai. Ye SRS generate karta hai, UML diagrams create karta hai, SRS ambiguity detect karta hai, aur UML image ka description generate karta hai.

### Q2. Frontend kis technology mein banaya gaya hai?

Answer: Frontend HTML5, CSS3, aur vanilla JavaScript mein banaya gaya hai. Bootstrap use nahi hua; styling custom CSS mein hai. Font Awesome icons login/signup mein use hue hain.

### Q3. Backend kis technology mein hai?

Answer: Backend Node.js with Express.js mein hai. Express API routes frontend requests handle karte hain.

### Q4. Database kaunsa use hua hai?

Answer: MySQL database use hua hai, aur backend `mysql2` package ke through database se connect hota hai.

### Q5. Python ka role kya hai?

Answer: Python AI/ML processing, file extraction, SRS generation service, UML description logic, and text processing ke liye use hoti hai.

### Q6. User authentication kaise kaam karti hai?

Answer: User signup/login API backend routes mein handle hoti hai. Password hashing ke liye `bcryptjs` use hota hai. Login ke baad user information local storage/session flow mein use hoti hai.

### Q7. SRS generation ka flow kya hai?

Answer: User project title, brief, ya uploaded file provide karta hai. Frontend payload backend `/api/generate-srs` route ko send karta hai. Backend access check karta hai, Python SRS worker ko request bhejta hai, generated SRS HTML/text receive karta hai, history save karta hai, aur frontend preview show karta hai.

### Q8. UML generation ka flow kya hai?

Answer: User text/SRS description aur diagram type select karta hai. Backend AI model ko prompt send karta hai. AI PlantUML style output/code generate karta hai. Frontend us output ko preview/edit/download ke liye show karta hai.

### Q9. UML image description ka flow kya hai?

Answer: User UML image upload ya paste karta hai. Frontend image data backend ko send karta hai. Backend AI service se diagram type, elements, relationships, flow, and description generate karwata hai.

### Q10. Ambiguity analysis kya karta hai?

Answer: Ambiguity analysis SRS text/document ko check karta hai aur vague, non-measurable, unclear, ya incomplete requirements identify karta hai. Ye recommendations bhi provide karta hai.

### Q11. Access control kaise implement hua hai?

Answer: `backend/accessControl.js` free, premium, aur admin plan define karta hai. Free users ke daily limits track hote hain. Premium/admin users ke liye limits remove hoti hain.

### Q12. Premium user kaise identify hota hai?

Answer: Premium user database role ya `.env` ke `PREMIUM_EMAILS` configuration se identify ho sakta hai.

### Q13. Admin user kaise identify hota hai?

Answer: Admin email default list ya `.env` ke `ADMIN_EMAILS` se identify hoti hai. Admin ko unlimited access milta hai.

### Q14. Error handling kaise ki gayi hai?

Answer: Backend routes try/catch use karte hain. Agar AI model fail ho, timeout ho, ya access limit reach ho to frontend ko structured error response milta hai.

### Q15. File upload mein kya restrictions hain?

Answer: SRS generation and analysis mein uploaded file read ki jati hai. Agar file unreadable ho to backend user ko clearer file ya short project description add karne ka message deta hai.

### Q16. Kya project mein Bootstrap use hua hai?

Answer: Nahi, Bootstrap use nahi hua. UI custom HTML, CSS, and JavaScript se design ki gayi hai.

### Q17. Kya project responsive hai?

Answer: Haan, pages custom CSS media/responsive layout se handle hote hain. Sidebar, header, cards, and forms ko responsive banaya gaya hai.

### Q18. Kya AIRA_ML folder project mein use ho raha hai?

Answer: Main running flow mostly `backend/aira-ai` aur Express routes se use hota hai. `AIRA_ML` folder model training/scripts/datasets ke liye auxiliary ya experimental folder lagta hai. Evaluation ke waqt isay training/research support folder ke tor par explain kiya ja sakta hai, lekin live app ka main flow us par depend nahi lagta.

### Q19. API keys kahan rakhi jati hain?

Answer: API keys `backend/.env` file mein rakhi jati hain. Keys code mein hardcode nahi karni chahiye.

### Q20. Gemini limit reach ho jaye to kya hota hai?

Answer: Project structure mein Gemini primary provider aur OpenRouter fallback ka logic rakha gaya hai. Gemini fail ya limit reach hone par OpenRouter fallback use ho sakta hai.

## Coding Related Questions Evaluator Pooch Sakta Hai

### Q1. Agar login ke baad username sidebar mein show nahi hota to kahan check karenge?

Answer: `frontend/Pages/app.js` mein current user/local storage logic check karenge, phir sidebar rendering function check karenge, aur backend login response verify karenge.

### Q2. Agar database connection fail ho to kya check karenge?

Answer: `backend/db.js` mein host, user, password, database name, port check karenge. MySQL service running hai ya nahi, `aira_db` database exist karta hai ya nahi, ye bhi check karenge.

### Q3. Agar SRS generate nahi ho rahi to debugging steps kya honge?

Answer: Browser console check karenge, Network tab mein `/api/generate-srs` response dekhenge, backend terminal logs check karenge, Python worker error check karenge, aur uploaded file readable hai ya nahi verify karenge.

### Q4. Agar free user 3 se zyada generation kare to kya hona chahiye?

Answer: Access control error return hona chahiye aur frontend same section mein message show kare ke daily limit reach ho gayi hai.

### Q5. Agar premium feature free user use kare to kya change karna hoga?

Answer: `requirePremiumAccess` frontend check aur `assertFeatureAccess` backend check dono verify karne honge.

### Q6. Agar new language add karni ho to kya karenge?

Answer: Language list settings/app.js mein add karenge, backend access policy mein premium language allow karenge, aur AI prompt mein target language instruction add karenge.

### Q7. Agar new admin add karna ho to kya karenge?

Answer: `backend/.env` mein `ADMIN_EMAILS=email1,email2` add kar sakte hain. Server restart ke baad admin role sync ho jayega. Direct database mein user role `admin` bhi set ho sakta hai.

### Q8. Agar SRS download mein formatting issue ho to kahan change karenge?

Answer: `frontend/Pages/app.js` mein download blob/formatting functions aur `frontend/Pages/style.css` mein SRS document styles check karenge.

### Q9. Agar UML diagram wrong generate ho to kahan prompt improve karenge?

Answer: `backend/routes/aiModels.js` ke `buildUmlPrompt` function mein rules improve karenge. Also `backend/aira-ai/ai_api.py` mein AI provider handling check karenge.

### Q10. Agar OCR wrong text read kare to kya karenge?

Answer: Image quality check karenge, preprocessing improve karenge, OCR post-processing rules update karenge, aur user ko clearer image upload karne ka validation message show karenge.

### Q11. Agar frontend button kaam na kare to first file kaunsi check karenge?

Answer: `frontend/Pages/app.js` mein event listeners aur function names check karenge.

### Q12. Agar CSS kisi page par different lag rahi ho to kya check karenge?

Answer: Us HTML file mein linked CSS version/path check karenge, phir `style.css` mein common card/header/sidebar classes verify karenge.

### Q13. Agar history save nahi hoti to kya check karenge?

Answer: Backend history route, database table, user_id, generated output save function, aur MySQL insert query check karenge.

### Q14. Agar uploaded file read nahi hoti to kya check karenge?

Answer: `backend/routes/srsGeneration.js` mein `extractUploadedFiles`, Python file extraction script, file MIME type, and fileData base64 payload check karenge.

### Q15. Agar API timeout ho jaye to kya karenge?

Answer: Timeout value, network/API provider response, prompt size, uploaded file size, and fallback provider logic check karenge.

## Possible Code Change Tasks Evaluator De Sakta Hai

### Task 1. Free daily limit 3 se 5 kar dein

Change:

`backend/accessControl.js` mein `FREE_DAILY_LIMITS` values 3 se 5 karni hongi.

### Task 2. New premium language add kar dein

Change:

`PLAN_POLICY.premium.languages` mein language add karni hogi, settings language dropdown mein option add karna hoga.

### Task 3. Admin email add kar dein

Change:

`backend/.env` mein:

`ADMIN_EMAILS=first@example.com,second@example.com`

### Task 4. Database port change kar dein

Change:

`backend/db.js` mein `port: 3306` ko required port se replace karna hoga.

### Task 5. SRS download filename change kar dein

Change:

`frontend/Pages/app.js` mein SRS download function ke `baseName` ko update karna hoga.

### Task 6. UML generation timeout increase kar dein

Change:

`backend/routes/aiModels.js` mein `AI_TIMEOUT_MS` value increase karni hogi.

### Task 7. Free users ko DOC export allow kar dein

Change:

`backend/accessControl.js` mein free exports list mein `doc` add karna hoga aur frontend premium check remove/adjust karna hoga.

### Task 8. New page add karni ho

Steps:

HTML file `frontend/Pages` mein add karni hogi, CSS classes reuse karni hongi, sidebar/nav link add karna hoga, aur JS function attach karna hoga.

### Task 9. Password validation strong karni ho

Change:

Signup frontend validation aur backend auth route mein password rules add karne honge.

### Task 10. SRS mein new section add karna ho

Change:

Backend SRS generation service and frontend SRS preview/download formatting dono mein section support add karna hoga.

## Strengths of Project

1. Real-world requirement engineering problem solve karta hai
2. Multiple modules integrated hain
3. AI services and fallback support included hai
4. MySQL database use hoti hai
5. User authentication and history available hai
6. Premium/free access model realistic hai
7. SRS, UML, ambiguity analysis, and diagram description ek single platform mein hain
8. Custom UI hai, ready-made template nahi
9. Downloadable outputs support karta hai
10. Final year project ke liye strong scope rakhta hai

## Limitations

1. AI output uploaded document/image quality par depend karta hai
2. Free API limits ki wajah se response kabhi slow ya unavailable ho sakta hai
3. OCR blurry images par perfect result nahi deta
4. Offline template fallback har unusual diagram ko 100 percent accurately understand nahi kar sakta
5. Full production payment gateway integration future work ho sakti hai

## Future Enhancements

1. Stripe/JazzCash/Easypaisa payment gateway integration
2. Better OCR model integration
3. More professional UML renderer
4. Full project workspace management
5. Team collaboration
6. Supervisor review dashboard
7. Version comparison for SRS documents
8. Full cloud deployment
9. More export templates
10. Requirement traceability matrix

## Demo Flow for Evaluation

1. Start backend using `npm start`
2. Open frontend home page
3. Create/login user account
4. Generate SRS from project title/brief
5. Download SRS PDF
6. Generate UML diagram from same project idea
7. Upload UML image and generate description
8. Upload SRS document and run ambiguity analysis
9. Show history page
10. Show settings and premium plan page
11. Explain admin/premium/free access

## Short Final Explanation for Evaluator

AIRA ek AI-assisted requirement engineering platform hai. Is project mein frontend custom HTML, CSS, JavaScript mein banaya gaya hai. Backend Node.js Express mein hai. Database MySQL hai. Python AI layer SRS generation, UML processing, document extraction, and analysis ke liye use hoti hai. Project ka aim students aur developers ko professional SRS documents, UML diagrams, and requirement quality analysis quickly generate karne mein help karna hai.


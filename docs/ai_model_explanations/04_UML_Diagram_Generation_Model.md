# AIRA AI Model 4: UML Diagram Generation Model

## Purpose Of This Model

Ye model user prompt ya uploaded SRS document se UML diagram generate karta hai. Supported diagrams:

- Use Case Diagram
- Class Diagram
- Sequence Diagram
- ERD
- Activity Diagram

Is model ka goal user ko code nahi dena, balki editable diagram canvas par diagram show karna hai.

## Input

Input ho sakta hai:

- Direct prompt
- Uploaded SRS document
- Generated SRS text
- Selected diagram type

Example:

```text
Online store where customer can register, browse products, add items to cart, place order, and make payment.
```

## Output

Output includes:

- Diagram type
- Extracted actors/classes/entities/actions/messages
- PlantUML-style structure internally
- Frontend editable canvas shapes and connectors
- Downloadable diagram

## Training Files

Training script:

```text
AIRA_ML/train_uml_models.py
```

Saved models:

```text
AIRA_ML/uml_diagram_type_pipeline.joblib
AIRA_ML/uml_structure_retriever.joblib
backend/aira-ai/models/uml_diagram_type_pipeline.joblib
backend/aira-ai/models/uml_structure_retriever.joblib
```

## Libraries Used

`scikit-learn`: TF-IDF, LinearSVC, Pipeline, train-test split, metrics.

`TfidfVectorizer`: user prompt ko numeric text features mein convert karta hai.

`LinearSVC`: diagram type classify karta hai.

`numpy`: similarity ranking ke liye array sorting.

`joblib`: trained classifier and retriever save/load karne ke liye.

`shutil`: trained models ko backend models folder mein copy karne ke liye.

`json`: training report save karne ke liye.

`re`: runtime text cleaning, actor/action/entity extraction ke liye.

`pathlib`: paths manage karne ke liye.

## Training Step By Step

### Step 1: Domain Templates Define Karna

Training script mein common domains define hain:

- library
- healthcare
- ecommerce
- forecasting
- education

Har domain ke liye actors, entities, aur actions define hotay hain.

Example ecommerce:

- actors: customer, seller, admin
- entities: product, order, payment, cart, shipment
- actions: browse products, place orders, make payments

### Step 2: Synthetic Training Rows Generate Karna

Script har domain ke liye prompts banata hai.

Use case prompts:

```text
Create use case diagram for ecommerce system where customer, seller, and admin interact with the system.
```

Class prompts:

```text
Create class diagram for ecommerce system with classes product, order, payment, cart.
```

Sequence prompts:

```text
Show step by step interaction between user, frontend, backend, and database.
```

ERD prompts:

```text
Create ERD for ecommerce database with entities product, order, payment, cart.
```

Activity prompts:

```text
Show workflow with start, actions, decision, and end.
```

### Step 3: Extra General Rows

Extra keyword-based rows also add ki gayi hain, like:

- actor, use case, boundary
- class, interface, inheritance
- lifeline, activation, message
- table, primary key, foreign key
- activity, decision, fork, join

Isse model diagram type keywords ko better learn karta hai.

### Step 4: Diagram Type Classifier

Text input se diagram type predict karne ke liye pipeline train hoti hai:

```python
Pipeline([
    ("tfidf", TfidfVectorizer(ngram_range=(1, 2), lowercase=True, min_df=1)),
    ("classifier", LinearSVC(class_weight="balanced", random_state=42))
])
```

### Step 5: Train-Test Split

```python
train_test_split(texts, labels, test_size=0.22, random_state=42, stratify=labels)
```

Training set model learn karta hai, test set performance check karta hai.

### Step 6: Structure Retriever

Second part retrieval model hai:

```python
vectorizer = TfidfVectorizer(ngram_range=(1, 2), lowercase=True, min_df=1)
matrix = vectorizer.fit_transform([row["text"] for row in rows])
```

Ye user prompt ke nearest known UML pattern find karta hai. Isse domain actors/entities/actions select karne mein help milti hai.

### Step 7: Save Models

Classifier and retriever save hote hain:

```python
joblib.dump(type_model, TYPE_MODEL_PATH)
joblib.dump(retriever, RETRIEVAL_MODEL_PATH)
```

## Runtime UML Generation Step By Step

### Step 1: Diagram Type Normalize

Frontend selected type backend ko send karta hai. Agar user `Use Case Diagram` select kare, backend usko normalize karke `use_case` banata hai.

### Step 2: Text Cleaning

Uploaded SRS se irrelevant content remove hota hai:

- cover page
- project members
- table of contents
- page numbers
- tested by table
- headings without content

### Step 3: Relevant SRS Section Extract

Diagram type ke according relevant section choose hota hai:

- Use case: Functional Requirements, System Features, Product Functions
- Class/ERD: Data Requirements, Functional Requirements
- Activity: Functional Requirements, System Features
- Sequence: Functional Requirements, System Features

### Step 4: Sentence Split

Text requirements ko useful sentences mein split kiya jata hai.

### Step 5: Actor Detection

Actor detect karne ke rules:

- admin
- user
- student
- customer
- patient
- doctor
- librarian
- passenger
- manager

If no actor found, default actor `User` hota hai.

### Step 6: Action Detection

System text se actions detect karta hai:

- Login
- Register
- Upload File
- Generate SRS Document
- Generate UML Diagram
- Analyze Requirements Quality
- Download Output
- Manage Records
- Process Payment
- Place Order

### Step 7: Diagram Specific Generation

Use case diagram:

- actors
- use cases
- system boundary
- actor-to-use-case links

Class diagram:

- nouns detect hote hain
- classes create hoti hain
- attributes and methods add hotay hain

Sequence diagram:

- actor
- frontend
- backend
- database
- request/response messages

ERD:

- entities
- primary keys
- attributes
- relationships

Activity diagram:

- start node
- actions
- end node
- workflow order

### Step 8: Editable Frontend Canvas

Generated output frontend canvas mein shapes and connectors ki form mein load hota hai. User generated diagram ko edit, move, delete, connect, and download kar sakta hai.

## Why Hybrid Approach?

UML generation mein pure ML model diagram drawing directly reliable nahi hota, especially small project dataset ke sath. AIRA hybrid approach use karta hai:

- ML classifier diagram type identify karta hai.
- Retrieval model relevant known patterns find karta hai.
- Rule-based parser actors/actions/entities extract karta hai.
- Diagram generator structured UML objects banata hai.
- Frontend editable canvas user correction allow karta hai.

## Supervisor Viva Answer

Question: Why not generate only PlantUML code?

Answer: Project requirement ke mutabiq user ko real-time editable diagram image/canvas chahiye, code nahi. PlantUML-like structure internally helpful hai, lekin final user experience editable diagram canvas hai.

Question: Why use rules in UML generation?

Answer: UML diagrams structured artifacts hote hain. Actor, use case, class, entity, lifeline jaisi cheezen rules se reliably extract ho sakti hain. ML type selection and retrieval help karta hai, rules final diagram correctness maintain karte hain.

Question: Why not deep learning image generation?

Answer: Deep image generation editable UML objects nahi deta. User ko diagram edit karna hota hai, connectors move karne hotay hain, shapes drag karni hoti hain. Isliye object-based canvas better hai.

Question: Limitation?

Answer: Agar input SRS poor format mein ho ya requirements missing hon, generated diagram incomplete ho sakta hai. Isliye edit tools and canvas provided hain.


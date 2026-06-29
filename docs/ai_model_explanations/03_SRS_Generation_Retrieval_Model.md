# AIRA AI Model 3: SRS Generation Retrieval Model

## Purpose Of This Model

Ye model user ke project title, project idea, uploaded document, ya UML image se extracted text ko use karke SRS document generate karta hai. Ye pure generative deep learning model nahi hai. Ye retrieval-based plus template-based hybrid model hai.

Is approach ka benefit ye hai ke generated SRS structured, predictable, editable, aur requirement-engineering format ke close rehta hai.

## Input

Input sources:

- Project title
- Project idea/description
- Uploaded PDF, Word, TXT document text
- Uploaded UML image se extracted text

Example:

```text
Online Library Management System where librarian can manage books, members, borrowing and returns.
```

## Output

Output complete SRS document hota hai, including:

- Cover page
- Table of contents
- Introduction
- Purpose
- Scope
- Overall description
- Product functions
- Functional requirements
- Non-functional requirements
- Interface requirements
- Data requirements
- Security requirements
- Acceptance criteria
- Tested by table
- Conclusion
- Appendix

## Dataset Used

Training/index file source:

```text
AIRA_ML/software_requirements_extended.csv
```

Saved index:

```text
AIRA_ML/srs_generation_index.joblib
backend/aira-ai/models/srs_generation_index.joblib
```

## Libraries Used

`pandas`: requirement dataset load/clean karne ke liye.

`TfidfVectorizer`: existing requirement examples ko searchable numeric vectors mein convert karta hai.

`cosine_similarity`: user input aur dataset requirements ke beech similarity calculate karta hai.

`joblib`: vectorizer, matrix, requirements list, and type mappings ko save/load karta hai.

`re`: project domain, actors, features, titles, and noisy text cleaning ke liye.

`collections.defaultdict`: retrieved requirements ko category-wise group karne ke liye.

`pathlib`: professional path handling ke liye.

`json`: index report save karne ke liye.

## Training/Indexing Step By Step

### Step 1: Dataset Loading

Script dataset read karta hai:

```python
pd.read_csv(DATA_PATH)
```

Sirf `Type` aur `Requirement` columns use hote hain.

### Step 2: Text Normalization

Extra spaces remove hoti hain:

```python
" ".join(str(text).strip().split())
```

### Step 3: Duplicate Removal

Same requirement agar multiple rows mein ho to remove hoti hai.

### Step 4: Requirement Category Mapping

Requirement type codes categories mein map hote hain:

- Functional
- Performance
- Security
- Usability
- Scalability
- Maintainability
- Availability
- Portability

Ye later SRS sections mein relevant requirements place karne mein help karta hai.

### Step 5: TF-IDF Vectorizer Training

```python
TfidfVectorizer(
    stop_words="english",
    ngram_range=(1, 2),
    min_df=1,
    max_features=10000,
    sublinear_tf=True
)
```

Ye vectorizer dataset requirements ko searchable vectors mein convert karta hai.

### Step 6: Matrix Creation

```python
matrix = vectorizer.fit_transform(df["Requirement"])
```

Ye matrix ek requirement search index hai. Har requirement ek vector ban jati hai.

### Step 7: Bundle Save

Bundle mein ye cheezen save hoti hain:

- vectorizer
- TF-IDF matrix
- requirements list
- type groups

```python
joblib.dump(bundle, INDEX_PATH)
```

## Runtime SRS Generation Step By Step

### Step 1: User Input Collect

Frontend se backend ko project title, description, aur uploaded file ka extracted text milta hai.

### Step 2: Title Cleaning And Spell Correction

Common typo correction aur title cleaning hoti hai. Example:

```text
libarary management system
```

Corrected:

```text
Library Management System
```

### Step 3: Context Analysis

System input se detect karta hai:

- Domain
- Actors
- Features

Example:

Input mein `book`, `borrow`, `return`, `librarian` aayein to domain `library management` detect hota hai.

### Step 4: Requirement Retrieval

User prompt vector banaya jata hai:

```python
query_vec = vectorizer.transform([prompt])
```

Phir cosine similarity se closest requirements retrieve hoti hain.

```python
cosine_similarity(query_vec, matrix)
```

### Step 5: Retrieved Requirements Filtering

System low similarity requirements ignore karta hai, ambiguous requirements remove karta hai, aur duplicates remove karta hai.

### Step 6: Domain-Specific Requirement Building

Sirf retrieved text par depend nahi kiya jata. Runtime service domain rules bhi use karta hai.

Example Library domain:

- manage book records
- issue books
- record book returns
- generate reports

Example E-commerce domain:

- manage cart
- place order
- process payment
- track order

### Step 7: SRS Template Formatting

Finally structured SRS format create hota hai. Is mein headings, sections, numbered requirements, tested-by table, appendix, and conclusion included hotay hain.

### Step 8: Download Formats

Frontend/backend generated SRS ko preview, Word document, PDF, and text export ke form mein provide karta hai.

## Why Retrieval-Based Instead Of Pure Chatbot Generation?

Pure chatbot model sometimes hallucinate kar sakta hai, section format inconsistent ho sakta hai, aur same input par output unstable ho sakta hai. Retrieval-based model known requirement dataset se relevant patterns leta hai, phir deterministic template se SRS banata hai.

Isliye AIRA ka output:

- More controlled
- More formatted
- Easier to edit
- Better for academic SRS structure
- Faster than large model API call

## Hybrid Nature

Ye model hybrid hai because:

- TF-IDF retrieval use karta hai.
- Domain detection rules use karta hai.
- Feature extraction rules use karta hai.
- Structured SRS template use karta hai.
- Export formatting logic use karta hai.

## Supervisor Viva Answer

Question: Is SRS generation model trained?

Answer: Is model mein traditional classifier ki tarah labels predict nahi hotay. Iska training part retrieval index banana hai. Dataset ke requirements ko TF-IDF vectors mein convert karke saved index banaya gaya. Runtime par user prompt ke closest requirement patterns retrieve hote hain aur structured SRS generate hota hai.

Question: Why not use only templates?

Answer: Simple template har topic ke liye same output de sakta hai. Retrieval index relevant dataset requirements laata hai, domain rules actors/features detect karte hain, aur template final professional document structure maintain karta hai.

Question: Why generated SRS user ke topic ke according change hota hai?

Answer: Input title, uploaded document text, detected domain, actors, features, and retrieved similar requirements sab output ko affect karte hain. Agar library input ho to book/member/borrow features aate hain; e-commerce input ho to cart/order/payment features aate hain.

Question: Limitation?

Answer: Agar uploaded document mein poor OCR, incomplete text, ya irrelevant content ho, generated SRS bhi weak ho sakta hai. Isliye AIRA user ko preview and edit option deta hai.


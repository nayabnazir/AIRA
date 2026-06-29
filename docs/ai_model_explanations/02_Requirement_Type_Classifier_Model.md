# AIRA AI Model 2: Requirement Type Classifier

## Purpose Of This Model

Ye supporting model requirement ko classify karta hai ke wo Functional Requirement hai ya Non-Functional Requirement. Is model ka kaam SRS generation aur analysis ko better structure dena hai.

Functional requirement batati hai system kya karega.

Example:

```text
The system shall allow users to upload documents.
```

Non-functional requirement batati hai system ka quality behavior kaisa hoga.

Example:

```text
The system shall respond within 10 seconds.
```

## Input

Input ek requirement sentence hota hai.

## Output

Output:

- Functional
- Non-Functional

Training data mein detailed categories bhi hain, jaise Performance, Security, Usability, Scalability, Maintainability, etc. Script final binary label create karta hai.

## Dataset Used

Training file:

```text
AIRA_ML/software_requirements_extended.csv
```

Important columns:

- `Type`: original requirement type.
- `Requirement`: requirement text.

## Libraries Used

`pandas`: dataset read, clean, deduplicate karne ke liye.

`scikit-learn`: training, testing, TF-IDF vectorization, Logistic Regression, LinearSVC, metrics, pipeline.

`TfidfVectorizer`: requirement text ko numeric vectors mein convert karta hai.

`LogisticRegression`: candidate classifier.

`LinearSVC`: candidate classifier jo text classification mein strong hota hai.

`Pipeline`: preprocessing aur model ko one object mein combine karta hai.

`joblib`: final selected pipeline save karne ke liye.

`json`: metrics report save karne ke liye.

`pathlib`: paths handle karne ke liye.

## Step By Step Pipeline

### Step 1: Dataset Loading

CSV file read hoti hai:

```python
pd.read_csv(DATA_PATH)
```

Sirf `Type` aur `Requirement` columns use kiye jate hain.

### Step 2: Text Cleaning

Requirement ke extra spaces remove kiye jate hain:

```python
" ".join(str(text).strip().split())
```

### Step 3: Duplicate Removal

Duplicate requirement lines remove hoti hain taake model repeated examples par overfit na kare.

### Step 4: Label Mapping

Original dataset mein types short codes mein hain:

- `FR`, `F`, `FT`, `O`: Functional
- `NFR`, `PE`, `SE`, `SC`, `US`, etc.: Non-Functional or quality categories

Script final label banata hai:

```python
df["label"] = df["Type"].apply(lambda value: "Functional" if value in FUNCTIONAL_TYPES else "Non-Functional")
```

### Step 5: Category Mapping

Detailed type groups bhi map hote hain:

- `PE`: Performance
- `SE`: Security
- `SC`: Scalability
- `US`: Usability
- `MN`: Maintainability

Ye report aur explanation ke liye useful hai.

### Step 6: Train-Test Split

Data 80/20 ratio mein split hota hai:

```python
train_test_split(..., test_size=0.2, random_state=42, stratify=df["label"])
```

`stratify` ensure karta hai ke Functional aur Non-Functional ka ratio balanced rahe.

### Step 7: Candidate Pipelines

Script do models train karta hai:

1. TF-IDF + Logistic Regression
2. TF-IDF + Linear SVM

Har candidate same text feature extraction use karta hai.

### Step 8: TF-IDF Settings

```python
TfidfVectorizer(
    stop_words="english",
    ngram_range=(1, 2),
    min_df=2,
    max_features=12000,
    sublinear_tf=True
)
```

Is se model common English words ignore karta hai aur important requirement words learn karta hai, like `authenticate`, `respond`, `encrypt`, `display`, `download`.

### Step 9: Model Evaluation

Har model ke liye calculate hota hai:

- Accuracy
- Macro F1
- Confusion matrix
- Classification report

Macro F1 important hai because ye both classes ko equal importance deta hai.

### Step 10: Best Model Selection

Script best model select karta hai:

```python
best = max(results, key=lambda item: item["macro_f1"])
```

Jo model highest Macro F1 deta hai, wo final model save hota hai.

## Model File Saved

```text
AIRA_ML/requirement_type_pipeline.joblib
backend/aira-ai/models/requirement_type_pipeline.joblib
```

## Metrics Report

```text
AIRA_ML/requirement_type_metrics.json
```

Is report mein dataset rows, label distribution, category distribution, dono candidate models ki performance, aur selected model save hota hai.

## Backend Use

Backend is model ko SRS analysis/generation mein support ke liye use kar sakta hai. Iska role SRS content ko structured banane mein help karna hai, taake functional aur non-functional requirements alag sections mein ja sakein.

## Supervisor Viva Answer

Question: Why train two models?

Answer: Humne Logistic Regression aur Linear SVM dono compare kiye. Jo model Macro F1 mein better perform karta hai usko select kiya. Isse selection guess work nahi hoti, performance-based hoti hai.

Question: Why LinearSVC?

Answer: LinearSVC sparse text features ke liye efficient hota hai. TF-IDF vectors high-dimensional hote hain, aur LinearSVC text classification tasks mein strong baseline hota hai.

Question: Why binary classification?

Answer: SRS document mein main separation Functional vs Non-Functional hoti hai. Detailed type mapping available hai, lekin final document structure ke liye binary grouping zyada practical hai.

Question: Is this model visible to user?

Answer: Directly user ko model name nahi dikhta, lekin SRS generation aur analysis ke organized sections mein iska effect hota hai.


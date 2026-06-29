# AIRA AI Model 1: SRS Ambiguity Checker

## Purpose Of This Model

Ye model SRS requirements ko check karta hai ke requirement clear hai ya ambiguous. Ambiguous requirement ka matlab hai aisi requirement jo measurable, specific, ya mandatory na ho. Example: "The system should be fast" ambiguous hai because "fast" ka exact time mention nahi. Better form: "The system shall respond within 2 seconds."

Is model ka main purpose supervisor ko ye explain karna hai ke AIRA sirf document generate nahi karta, balki requirements quality bhi check karta hai.

## Input

Model ka input ek requirement sentence hota hai.

Example:

```text
The system should be fast and user friendly.
```

## Output

Model output batata hai:

- Requirement ambiguous hai ya nahi.
- Confidence score kya hai.
- Reason kya hai.
- Agar possible ho to detected vague terms bhi show hoti hain.

Example:

```json
{
  "ambiguous": true,
  "confidence": 0.72,
  "reason": "Non-measurable or vague quality term"
}
```

## Dataset Used

Training file:

```text
AIRA_ML/requirements_ambiguity.csv
```

Important columns:

- `text`: requirement sentence.
- `class`: original ambiguity class.
- `label`: final binary label created by our script.

Training script classes `1` and `2` ko ambiguous treat karta hai, aur baqi ko clear.

## Libraries Used

`pandas`: CSV dataset load karne, cleaning karne, duplicate rows remove karne ke liye.

`re`: rule-based ambiguity detection ke liye regular expressions use hoti hain.

`scikit-learn`: machine learning pipeline banane, train-test split, TF-IDF vectorization, Logistic Regression, aur evaluation metrics ke liye.

`TfidfVectorizer`: text ko numeric feature vector mein convert karta hai.

`LogisticRegression`: clear vs ambiguous classification karta hai.

`Pipeline`: vectorizer aur model ko ek single reusable pipeline mein combine karta hai.

`joblib`: trained model ko `.joblib` file mein save karta hai taake backend real-time use kar sake.

`json`: metrics report save karne ke liye.

`pathlib`: file paths ko professional aur OS-friendly tareeqe se handle karne ke liye.

## Step By Step Pipeline

### Step 1: Dataset Loading

Script CSV file read karta hai:

```python
pd.read_csv(DATA_PATH, encoding="latin1")
```

Sirf required columns rakhta hai:

```python
df = df[["text", "class"]].dropna()
```

Iska matlab missing text ya class wali rows remove ho jati hain.

### Step 2: Text Normalization

Har requirement ko lowercase aur clean format mein convert kiya jata hai.

Example:

```text
"  The System SHOULD be FAST  "
```

Becomes:

```text
"the system should be fast"
```

Isse model same words ko same pattern samajhta hai.

### Step 3: Duplicate Removal

Same requirement agar multiple times dataset mein hai to duplicate remove hoti hai:

```python
df.drop_duplicates(subset=["text"])
```

Iska benefit ye hai ke model repeated data se biased nahi hota.

### Step 4: Label Creation

Original class ko binary label mein convert kiya gaya:

- `1`: ambiguous
- `0`: clear

```python
df["label"] = df["class"].apply(lambda v: 1 if v in [1, 2] else 0)
```

### Step 5: Train-Test Split

Dataset ko train aur test part mein divide kiya gaya:

```python
train_test_split(..., test_size=0.2, random_state=42, stratify=df["label"])
```

`test_size=0.2` ka matlab 80% data training ke liye aur 20% testing ke liye.

`stratify` ka matlab ambiguous aur clear examples ka ratio train/test dono mein balanced rahe.

### Step 6: Curated Examples Add Karna

Humne kuch extra examples manually training set mein add kiye:

Ambiguous examples:

- The system should be fast.
- The application must be user friendly.
- The system must be secure.

Clear examples:

- The system shall respond within two seconds.
- The application shall lock the account after five failed login attempts.

Ye curated examples sirf training set mein add hote hain, test set mein nahi. Isse evaluation fair rehti hai.

### Step 7: TF-IDF Vectorization

`TfidfVectorizer` text ko numeric vector banata hai. TF-IDF ka simple matlab:

- Jo word sentence mein important hai uska weight zyada hota hai.
- Jo word bohat common hai uska weight kam hota hai.

Settings:

```python
TfidfVectorizer(
    stop_words="english",
    ngram_range=(1, 2),
    min_df=2,
    max_features=12000,
    sublinear_tf=True
)
```

`ngram_range=(1,2)` ka matlab model single words aur two-word phrases dono learn karta hai, for example `fast`, `user friendly`.

### Step 8: Logistic Regression Classifier

Classifier:

```python
LogisticRegression(
    max_iter=2000,
    class_weight="balanced",
    solver="liblinear",
    random_state=42
)
```

Reason:

- Binary classification ke liye suitable hai.
- Text classification mein fast hai.
- Small/medium dataset par stable result deta hai.
- Probability score de sakta hai, jo confidence dikhane mein useful hai.

### Step 9: Hybrid Rule-Based Check

Model ke sath rules bhi use hote hain. Ye AIRA ka hybrid part hai.

Rule-based function vague words detect karta hai:

- should
- may
- fast
- quick
- user friendly
- secure
- reliable
- scalable
- efficient

Example:

```text
The system should be secure.
```

Rule immediately mark karega: ambiguous, because `should` weak modal hai aur `secure` measurable nahi.

### Step 10: Final Prediction Logic

Backend inference mein dono cheezen combine hoti hain:

- Rule-based result.
- ML probability.

If rule ambiguous ho ya ML probability threshold se zyada ho, requirement ambiguous mark hoti hai.

```python
ML_THRESHOLD = 0.6
```

## Model File Saved

Training ke baad model yahan save hota hai:

```text
AIRA_ML/srs_ambiguity_pipeline.joblib
backend/aira-ai/models/srs_ambiguity_pipeline.joblib
```

Backend copy isliye banai gayi taake web app direct trained model use kare.

## Metrics Report

Report file:

```text
AIRA_ML/srs_ambiguity_metrics.json
```

Is mein accuracy, ambiguous F1 score, confusion matrix, aur classification report save hoti hai.

## Backend Integration

Backend Python AI service saved `.joblib` model ko load karta hai. Jab user SRS upload karta hai, backend text extract karta hai, requirements ko sentences mein split karta hai, phir har sentence ambiguity model se check hota hai.

Result frontend par issue list aur downloadable report ke form mein show hota hai.

## Supervisor Viva Answer

Question: Why Logistic Regression?

Answer: Logistic Regression text classification ke liye simple, fast, interpretable aur reliable model hai. Hamara task binary classification hai, clear vs ambiguous, isliye heavy deep learning model ki zarurat nahi thi.

Question: Why rule-based plus ML?

Answer: Ambiguity mein kuch words directly risky hote hain, jaise "fast", "user friendly", "should". ML statistical patterns learn karta hai, aur rules known ambiguity cases catch karte hain. Dono ko combine karne se result zyada practical hota hai.

Question: Is this model fully AI?

Answer: Ye hybrid AI approach hai. Is mein trained machine learning pipeline bhi hai aur rule-based NLP validation bhi hai. Requirement engineering mein hybrid approach useful hoti hai because kuch ambiguity patterns domain rules se better catch hote hain.

Question: Limitation?

Answer: Agar requirement grammatically complex ho ya context dusre paragraph mein ho, model ko complete meaning samajhne mein limitation ho sakti hai. Isliye AIRA output ko review/edit option ke sath show karta hai.


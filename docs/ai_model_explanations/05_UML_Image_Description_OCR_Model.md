# AIRA AI Model 5: UML Image Description OCR Model

## Purpose Of This Model

Ye model uploaded UML image ko read karta hai aur uska textual description generate karta hai. User agar use case diagram, class diagram, ya activity diagram image upload kare to system us image ke visible labels OCR se extract karta hai, phir professional explanation banata hai.

Is module ka purpose hai ke user ko image ke andar jo UML information hai uski readable description mil sake.

## Input

Input UML diagram image hoti hai:

- PNG
- JPG
- JPEG

## Output

Output includes:

- Extracted text
- Professional summary
- Diagram description

Example summary:

```text
The uploaded image appears to be a use case diagram that describes user-facing system functions.
```

## Important Files

Runtime files:

```text
backend/aira-ai/ai/uml_image_to_text.py
backend/aira-ai/ai/uml_image_description_service.py
```

## Libraries Used

`OpenCV / cv2`: image read, resize, grayscale conversion, blur, thresholding ke liye.

`pytesseract`: OCR engine wrapper. Ye image ke andar written text ko extract karta hai.

`Tesseract OCR`: actual OCR software jo machine par installed hota hai.

`os`: file existence check karne ke liye.

`re`: OCR text cleaning, relationship noise removal, label normalization, and diagram type hints detect karne ke liye.

`pathlib`: image file path manage karne ke liye.

## OCR Pipeline Step By Step

### Step 1: Image File Check

System pehle check karta hai ke uploaded image path exist karta hai ya nahi.

```python
if not os.path.exists(image_path):
    raise FileNotFoundError("UML image not found")
```

### Step 2: Image Read

OpenCV se image read hoti hai:

```python
image = cv2.imread(image_path)
```

### Step 3: Image Scaling

Image ko 2x resize kiya jata hai:

```python
cv2.resize(image, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
```

Reason: small text OCR ke liye readable ban jata hai.

### Step 4: Grayscale Conversion

Color image ko grayscale mein convert kiya jata hai:

```python
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
```

Reason: OCR ko text/background contrast zyada clear milta hai.

### Step 5: Blur

Small noise remove karne ke liye Gaussian blur use hota hai:

```python
cv2.GaussianBlur(gray, (3, 3), 0)
```

### Step 6: Thresholding

Otsu thresholding image ko black/white style mein convert karta hai:

```python
cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
```

Reason: OCR text ko better detect karta hai.

### Step 7: OCR Extraction

Tesseract OCR image se text extract karta hai:

```python
pytesseract.image_to_string(gray, config="--oem 3 --psm 6")
```

`--oem 3`: OCR engine mode automatic.

`--psm 6`: image ko uniform block of text treat karta hai.

### Step 8: OCR Text Cleaning

OCR kabhi spelling mistakes karta hai. Cleaning function common mistakes correct karta hai.

Example:

- passongor -> passenger
- cheks -> checks
- verivineicket -> verify ticket

Symbols, extra spaces, and noisy characters remove kiye jate hain.

## Description Generation Step By Step

### Step 1: Readable Lines Filter

System sirf readable text lines rakhta hai. Bohat short, symbol-heavy, ya broken lines remove hoti hain.

### Step 2: Relationship Noise Remove

Use case diagrams mein OCR `include`, `extend`, ya broken relation labels ko wrong use case samajh sakta hai. System un noise lines ko remove karta hai.

### Step 3: Use Case Labels Extract

Lines ko split karke use case labels identify kiye jate hain.

Example:

- Sign Up
- Upload SRS
- Generate UML
- Login
- Upload UML Image
- View History
- Download Output

### Step 4: Actor Labels Extract

System common actor labels detect karta hai:

- User
- Admin
- Student
- Customer
- Patient
- Doctor
- Librarian

### Step 5: Diagram Type Inference

Text mein certain words dekhe jate hain:

- login, upload, download, actor -> use case diagram
- class, interface, method, attribute -> class diagram
- start, decision, activity -> activity diagram

### Step 6: Professional Description Build

Raw label list show karne ke bajaye system meaningful sentences banata hai.

Example:

```text
This appears to be a use case diagram that shows how the user interacts with the system.
The main system functions shown in the diagram are Sign Up, Upload SRS, Generate UML, Login, Upload UML Image, View History, and Download Output.
The diagram describes the external behavior of the system, focusing on services available to users rather than internal code or database tables.
```

## Why This Is Not A Traditional Trained ML Model

Ye module OCR + rule-based interpretation model hai. Iska "training" classical supervised training jaisa nahi hota because yahan objective image labels read karna hai. OCR engine already trained hota hai, aur humne project-specific rules add kiye hain jo UML labels, actors, and use cases ko clean professional description mein convert karte hain.

## Backend Integration

User image upload karta hai. Backend image file save karta hai. Python service OCR run karti hai. Extracted text aur description JSON response mein frontend ko milta hai. User result edit/download kar sakta hai, aur history mein save hota hai.

## Supervisor Viva Answer

Question: Which AI technique is used here?

Answer: Is module mein OCR-based AI use hoti hai. Tesseract OCR image se text recognize karta hai. Us text par rule-based NLP processing hoti hai to convert raw labels into professional UML description.

Question: Why OCR?

Answer: UML diagram image pixels ki form mein hota hai. Uske andar labels directly text file ki tarah available nahi hotay. OCR image ke text ko extract karne ke liye required hai.

Question: Why not use image classification only?

Answer: Image classification sirf diagram type bata sakti hai, lekin use case labels, actors, aur system functions nahi bata sakti. OCR hume actual visible labels deta hai.

Question: Limitation?

Answer: Agar image blur ho, low resolution ho, ya text bohat small ho, OCR mistakes kar sakta hai. Isliye image preprocessing and cleaning rules add kiye gaye hain.


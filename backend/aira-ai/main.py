import os
from ai.uml_image_to_text import extract_text_from_uml
from utils.ocr_postprocess import clean_ocr_text, extract_clean_lines

print("AIRA AI pipeline started successfully")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

image_path = os.path.join(BASE_DIR, "test_images", "uml.png")

raw_text = extract_text_from_uml(image_path)
print("\nRAW OCR TEXT:\n", raw_text)

cleaned = clean_ocr_text(raw_text)
lines = extract_clean_lines(cleaned)

print("\nCLEAN UML LINES:")
for l in lines:
    print("-", l)

from ai.uml_text_parser import parse_uml_lines

print("\nSTRUCTURED UML:")
uml_structure = parse_uml_lines(lines)
print(uml_structure)

from ai.uml_diagram_generator import generate_uml_diagram

diagram = generate_uml_diagram(uml_structure)
diagram



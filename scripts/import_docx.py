"""Extract the provided Word question banks into server/data/questions.json.

Uses only the Python standard library. Run from the project root:
    python3 scripts/import_docx.py
"""

import json
import re
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "access-raw"
DESTINATION = ROOT / "server" / "data" / "questions.json"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
SECTION = re.compile(r"^(\d+)\.(\d+)\s*(单选题|选择题|判断题)（共(\d+)题）")
CATEGORY = re.compile(r"^(\d+)\.(?!\d)(.+?)（(?:共)?\d+题）")
ANSWER = re.compile(r"^答案\s*[：:]\s*([A-D]|正确|错误)(.*)$")
OPTION = re.compile(r"^([A-D])\s*[、.．]\s*(.*)$")
NUMBER = re.compile(r"^\d+\.\d+\.\d+\s*")


def paragraphs(path: Path) -> list[str]:
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    return [
        text
        for node in root.findall(".//w:body/w:p", NS)
        if (text := "".join(part.text or "" for part in node.findall(".//w:t", NS)).strip())
    ]


def make_question(body: list[str], answer: str, note: str, kind: str, source: str,
                  section: str, category: str, number: int) -> dict | None:
    if not body:
        return None  # Some Word files contain duplicated answer-only paragraphs.

    question_lines: list[str] = []
    choices: dict[str, str] = {}
    current: str | None = None
    for line in body:
        match = OPTION.match(line)
        if kind == "choice" and match:
            current = match.group(1)
            choices[current] = match.group(2)
        elif current:
            choices[current] += line
        else:
            question_lines.append(line)

    # A single source question omits its A、 prefix but still lists B/C/D.
    if kind == "choice" and set(choices) == {"B", "C", "D"} and len(question_lines) >= 2:
        choices["A"] = question_lines.pop()

    if kind == "choice" and set(choices) != {"A", "B", "C", "D"}:
        raise ValueError(f"Invalid options in {source} / {section} / {number}: {body}")
    if kind == "boolean" and choices:
        raise ValueError(f"Unexpected options in {source} / {section} / {number}")
    if not question_lines:
        raise ValueError(f"Missing question in {source} / {section} / {number}")

    prompt = NUMBER.sub("", "".join(question_lines), count=1).strip()
    return {
        "id": f"{source.split('车')[0]}-{section}-{number}",
        "type": kind,
        "category": category,
        "source": source,
        "prompt": prompt,
        "options": [{"key": key, "text": choices[key]} for key in "ABCD"] if kind == "choice" else [],
        "answer": answer,
        **({"note": note.strip()} if note.strip() else {}),
    }


def extract(path: Path) -> tuple[list[dict], list[str]]:
    source = path.stem
    questions: list[dict] = []
    warnings: list[str] = []
    category = ""
    kind = ""
    section = ""
    expected = 0
    actual = 0
    body: list[str] = []

    def check_section() -> None:
        if section and actual != expected:
            warnings.append(f"{source} / {section}: heading says {expected}, extracted {actual}")

    for line in paragraphs(path):
        heading = SECTION.match(line)
        if heading:
            check_section()
            if body and not CATEGORY.match(body[-1]):
                warnings.append(f"{source} / {section}: trailing text before next section: {body}")
            section = f"{heading.group(1)}.{heading.group(2)}"
            kind = "boolean" if heading.group(3) == "判断题" else "choice"
            expected = int(heading.group(4))
            actual = 0
            body = []
            continue

        category_heading = CATEGORY.match(line)
        if category_heading:
            category = category_heading.group(2).strip()
            body = []
            continue

        match = ANSWER.match(line)
        if match and section:
            if body:
                actual += 1
                item = make_question(body, match.group(1), match.group(2), kind,
                                     source, section, category, actual)
                if item:
                    questions.append(item)
                body = []
            else:
                warnings.append(f"{source} / {section}: skipped answer without question")
            continue

        if section:
            body.append(line)

    check_section()
    if body:
        warnings.append(f"{source} / {section}: trailing text at end: {body}")
    return questions, warnings


def main() -> None:
    questions: list[dict] = []
    warnings: list[str] = []
    for path in sorted(SOURCE.glob("*.docx")):
        extracted, file_warnings = extract(path)
        questions.extend(extracted)
        warnings.extend(file_warnings)
        counts = Counter(item["type"] for item in extracted)
        print(f"{path.name}: {counts['choice']} choices, {counts['boolean']} judgments")

    ids = [question["id"] for question in questions]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate question IDs")
    counts = Counter(item["type"] for item in questions)
    if min(counts.values()) < 50:
        raise ValueError("Question bank cannot supply 50 questions of each type")
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Total: {len(questions)} questions; saved to {DESTINATION.relative_to(ROOT)}")
    for warning in warnings:
        print("WARNING:", warning)


if __name__ == "__main__":
    main()

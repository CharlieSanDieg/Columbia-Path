# Syllabi Directory

Place your course syllabus PDFs here.

## Naming Convention

```
COMS4771.pdf
STAT5703.pdf
IEOR4150.pdf
```

Or any filename ending in `.pdf` — the ingestion script will detect the course code from inside the PDF.

## After Adding PDFs

Run from the project root:

```bash
npm run ingest
```

This will parse all PDFs and append new courses to `../courses.json`.

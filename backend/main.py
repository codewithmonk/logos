from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional
import httpx
import json
import re
import logging

from database import get_db, engine
import models
import schemas

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create tables on startup
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Logos API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


# ── Gemini helper ──────────────────────────────────────────────────────────────

async def call_gemini(api_key: str, prompt: str, system: str = "") -> str:
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 4096},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(f"{GEMINI_URL}?key={api_key}", json=body)
        if res.status_code != 200:
            err = res.json()
            raise HTTPException(status_code=400, detail=err.get("error", {}).get("message", "Gemini API error"))
        data = res.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


def parse_json_response(raw: str) -> dict:
    cleaned = re.sub(r"```json\n?|```\n?", "", raw).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in response")
    return json.loads(cleaned[start:end + 1])


# ── Course routes ──────────────────────────────────────────────────────────────

@app.get("/api/courses", response_model=list[schemas.CourseSummary])
def list_courses(db: Session = Depends(get_db)):
    courses = db.query(models.Course).order_by(models.Course.created_at.desc()).all()
    result = []
    for c in courses:
        total = db.query(models.Chapter).filter(models.Chapter.course_id == c.id).count()
        done = db.query(models.Chapter).filter(
            models.Chapter.course_id == c.id,
            models.Chapter.completed == True
        ).count()
        result.append(schemas.CourseSummary(
            id=c.id,
            title=c.title,
            topic=c.topic,
            level=c.level,
            total_chapters=total,
            completed_chapters=done,
            created_at=c.created_at,
        ))
    return result


@app.post("/api/courses/generate", response_model=schemas.CourseDetail)
async def generate_course(req: schemas.GenerateCourseRequest, db: Session = Depends(get_db)):
    prompt = f"""Create a {req.num_chapters}-chapter course outline for: "{req.topic}" at {req.level} level.

Return ONLY valid JSON, no markdown:
{{
  "courseTitle": "...",
  "courseDescription": "...",
  "chapters": [
    {{
      "id": 1,
      "title": "...",
      "description": "...",
      "keyConcepts": ["concept1", "concept2", "concept3"],
      "hasDiagram": true
    }}
  ]
}}

Rules:
- Make titles specific and practical
- hasDiagram: true for chapters covering architecture, flows, processes, comparisons
- keyConcepts: 3-6 specific terms per chapter
- Be technical and substantive for {req.level} level"""

    raw = await call_gemini(req.api_key, prompt)
    data = parse_json_response(raw)

    # Persist course
    course = models.Course(
        title=data["courseTitle"],
        description=data["courseDescription"],
        topic=req.topic,
        level=req.level,
        api_key_hint=req.api_key[-4:],  # store only last 4 chars as hint
    )
    db.add(course)
    db.flush()

    chapters = []
    for ch in data["chapters"]:
        chapter = models.Chapter(
            course_id=course.id,
            number=ch["id"],
            title=ch["title"],
            description=ch["description"],
            key_concepts=ch["keyConcepts"],
            has_diagram=ch.get("hasDiagram", False),
        )
        db.add(chapter)
        chapters.append(chapter)

    db.commit()
    db.refresh(course)

    return schemas.CourseDetail(
        id=course.id,
        title=course.title,
        description=course.description,
        topic=course.topic,
        level=course.level,
        created_at=course.created_at,
        chapters=[schemas.ChapterSummary(
            id=ch.id,
            number=ch.number,
            title=ch.title,
            description=ch.description,
            key_concepts=ch.key_concepts,
            has_diagram=ch.has_diagram,
            is_generated=ch.is_generated,
            completed=ch.completed,
        ) for ch in chapters]
    )


@app.get("/api/courses/{course_id}", response_model=schemas.CourseDetail)
def get_course(course_id: int, db: Session = Depends(get_db)):
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    chapters = db.query(models.Chapter).filter(
        models.Chapter.course_id == course_id
    ).order_by(models.Chapter.number).all()
    return schemas.CourseDetail(
        id=course.id,
        title=course.title,
        description=course.description,
        topic=course.topic,
        level=course.level,
        created_at=course.created_at,
        chapters=[schemas.ChapterSummary(
            id=ch.id,
            number=ch.number,
            title=ch.title,
            description=ch.description,
            key_concepts=ch.key_concepts,
            has_diagram=ch.has_diagram,
            is_generated=ch.is_generated,
            completed=ch.completed,
        ) for ch in chapters]
    )


@app.delete("/api/courses/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db)):
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    db.delete(course)
    db.commit()
    return {"ok": True}


# ── Chapter routes ─────────────────────────────────────────────────────────────

@app.post("/api/chapters/{chapter_id}/generate", response_model=schemas.ChapterContent)
async def generate_chapter(chapter_id: int, req: schemas.GenerateChapterRequest, db: Session = Depends(get_db)):
    chapter = db.query(models.Chapter).filter(models.Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    # Return cached content if already generated
    if chapter.is_generated and chapter.content:
        return schemas.ChapterContent(**chapter.content)

    course = db.query(models.Course).filter(models.Course.id == chapter.course_id).first()

    diagram_rule = (
        '- "diagram": a valid Mermaid diagram string (flowchart TD, sequenceDiagram, or graph LR). Keep node labels short, no quotes inside labels.'
        if chapter.has_diagram else
        '- "diagram": null'
    )

    prompt = f"""Generate detailed course content:

Topic: {course.topic}
Level: {course.level}
Chapter {chapter.number}: "{chapter.title}"
Description: {chapter.description}

Return ONLY valid JSON:
{{
  "explanation": "3-4 paragraphs with markdown: **bold**, `code`, ### headings, bullet lists, ```language code blocks. Be technical and deep.",
  "diagram": "...",
  "realWorldExample": "Concrete scenario with actual code snippets.",
  "exercises": [
    {{"title": "...", "description": "..."}},
    {{"title": "...", "description": "..."}}
  ],
  "summary": "2-3 sentence summary."
}}

{diagram_rule}
- Be substantive for {course.level} level — not shallow
- Return pure JSON only"""

    raw = await call_gemini(req.api_key, prompt)
    content = parse_json_response(raw)

    # Cache to DB
    chapter.content = content
    chapter.is_generated = True
    db.commit()

    return schemas.ChapterContent(**content)


@app.patch("/api/chapters/{chapter_id}/complete")
def mark_chapter_complete(chapter_id: int, db: Session = Depends(get_db)):
    chapter = db.query(models.Chapter).filter(models.Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    chapter.completed = True
    db.commit()
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok"}

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional
import httpx
import json
import re
import logging
import os

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

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ── OpenRouter helper ──────────────────────────────────────────────────────────────

async def call_openrouter(api_key: str, prompt: str, system: str = "") -> str:
    env_key = os.getenv("OPENROUTER_API_KEY", "")
    key_to_use = api_key if api_key else env_key
    if not key_to_use:
        raise HTTPException(status_code=400, detail="OpenRouter API key is missing. Please provide it or set it in .env")
    
    model = os.getenv("OPENROUTER_MODEL", "openrouter/hunter-alpha")
    
    body = {
        "model": model,
        "messages": [],
        "reasoning": {"enabled": True}
    }
    if system:
        body["messages"].append({"role": "system", "content": system})
    body["messages"].append({"role": "user", "content": prompt})

    headers = {
        "Authorization": f"Bearer {key_to_use}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=300) as client:
        res = await client.post(OPENROUTER_URL, headers=headers, json=body)
        if res.status_code != 200:
            err = res.json()
            error_msg = err.get("error", {}).get("message", "OpenRouter API error")
            raise HTTPException(status_code=res.status_code, detail=error_msg)
        data = res.json()
        return data["choices"][0]["message"]["content"]


def parse_json_response(raw: str) -> dict:
    cleaned = re.sub(r"```json\n?|```\n?", "", raw).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        logger.error(f"Failed to find JSON in raw response:\n{raw}")
        raise ValueError("No JSON object found in response")
    try:
        return json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON string:\n{cleaned[start:end+1]}")
        raise ValueError(f"JSON decode error: {str(e)}")


def chapter_to_schema(ch: models.Chapter) -> schemas.ChapterSummary:
    return schemas.ChapterSummary(
        id=ch.id,
        number=ch.number,
        title=ch.title,
        description=ch.description,
        key_concepts=ch.key_concepts,
        has_diagram=ch.has_diagram,
        completed=ch.completed,
        generated=bool(ch.explanation),
        explanation=ch.explanation,
        diagram=ch.diagram,
        real_world_example=ch.real_world_example,
        exercises=ch.exercises,
        summary=ch.summary
    )


# ── Course routes ──────────────────────────────────────────────────────────────

@app.get("/api/courses", response_model=list[schemas.CourseSummary])
def list_courses(db: Session = Depends(get_db)):
    courses = db.query(models.Course).order_by(models.Course.created_at.desc()).all()
    result = []
    for c in courses:
        total_sections = db.query(models.Section).filter(models.Section.course_id == c.id).count()
        
        # Count chapters across all sections of this course
        sections = db.query(models.Section).filter(models.Section.course_id == c.id).all()
        section_ids = [s.id for s in sections]
        
        total = 0
        done = 0
        if section_ids:
            total = db.query(models.Chapter).filter(models.Chapter.section_id.in_(section_ids)).count()
            done = db.query(models.Chapter).filter(
                models.Chapter.section_id.in_(section_ids),
                models.Chapter.completed == True
            ).count()

        result.append(schemas.CourseSummary(
            id=c.id,
            title=c.title,
            topic=c.topic,
            level=c.level,
            total_sections=total_sections,
            total_chapters=total,
            completed_chapters=done,
            created_at=c.created_at,
        ))
    return result


@app.post("/api/courses/generate", response_model=schemas.CourseDetail)
async def generate_course(req: schemas.GenerateCourseRequest, db: Session = Depends(get_db)):
    prompt = f"""Generate a course outline for: "{req.topic}" at {req.level} level.
Structure: {req.num_sections} main sections, each containing {req.chapters_per_section} chapters.

Return ONLY valid JSON, no markdown outside of the JSON string:
{{
  "courseTitle": "...",
  "courseDescription": "...",
  "sections": [
    {{
      "id": 1,
      "title": "...",
      "description": "...",
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
  ]
}}

Rules:
- Only produce the course outline. Do not generate full chapter lesson content.
- keyConcepts should be concise and specific.
- hasDiagram should indicate whether the eventual full chapter would benefit from a Mermaid diagram.
- Be highly technical and substantive for {req.level} level.
- Return pure JSON only"""

    raw = await call_openrouter(req.api_key, prompt)
    data = parse_json_response(raw)

    # Persist course
    course = models.Course(
        title=data["courseTitle"],
        description=data["courseDescription"],
        topic=req.topic,
        level=req.level,
        api_key_hint=req.api_key[-4:] if req.api_key else "env",
    )
    db.add(course)
    db.flush()

    for sec_data in data["sections"]:
        section = models.Section(
            course_id=course.id,
            number=sec_data["id"],
            title=sec_data["title"],
            description=sec_data["description"]
        )
        db.add(section)
        db.flush()

        for ch in sec_data["chapters"]:
            chapter = models.Chapter(
                section_id=section.id,
                number=ch["id"],
                title=ch["title"],
                description=ch["description"],
                key_concepts=ch.get("keyConcepts", []),
                has_diagram=ch.get("hasDiagram", False),
            )
            db.add(chapter)

    db.commit()
    db.refresh(course)

    return get_course(course.id, db)


@app.get("/api/courses/{course_id}", response_model=schemas.CourseDetail)
def get_course(course_id: int, db: Session = Depends(get_db)):
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    sections = db.query(models.Section).filter(
        models.Section.course_id == course_id
    ).order_by(models.Section.number).all()
    
    section_responses = []
    for sec in sections:
        chapters = db.query(models.Chapter).filter(
            models.Chapter.section_id == sec.id
        ).order_by(models.Chapter.number).all()
        
        chapter_responses = [chapter_to_schema(ch) for ch in chapters]
        
        section_responses.append(schemas.SectionSummary(
            id=sec.id,
            number=sec.number,
            title=sec.title,
            description=sec.description,
            chapters=chapter_responses
        ))

    return schemas.CourseDetail(
        id=course.id,
        title=course.title,
        description=course.description,
        topic=course.topic,
        level=course.level,
        created_at=course.created_at,
        sections=section_responses
    )


@app.delete("/api/courses/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db)):
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    db.delete(course)
    db.commit()
    return {"ok": True}


@app.post("/api/chapters/{chapter_id}/generate", response_model=schemas.ChapterSummary)
async def generate_chapter(
    chapter_id: int,
    req: schemas.GenerateChapterRequest,
    db: Session = Depends(get_db),
):
    chapter = db.query(models.Chapter).filter(models.Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    section = db.query(models.Section).filter(models.Section.id == chapter.section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    course = db.query(models.Course).filter(models.Course.id == section.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    sibling_chapters = db.query(models.Chapter).filter(
        models.Chapter.section_id == section.id
    ).order_by(models.Chapter.number).all()
    sibling_outline = [
        {
            "number": item.number,
            "title": item.title,
            "description": item.description,
        }
        for item in sibling_chapters
    ]

    prompt = f"""Generate the FULL lesson content for one chapter in a course.

Course title: "{course.title}"
Course topic: "{course.topic}"
Course level: "{course.level}"
Course description: "{course.description}"

Current section:
- number: {section.number}
- title: "{section.title}"
- description: "{section.description}"

Chapter outline:
- number: {chapter.number}
- title: "{chapter.title}"
- description: "{chapter.description}"
- key concepts: {json.dumps(chapter.key_concepts)}
- has diagram: {"true" if chapter.has_diagram else "false"}

Sibling chapter outline for context:
{json.dumps(sibling_outline, indent=2)}

Return ONLY valid JSON, no markdown outside of the JSON string:
{{
  "keyConcepts": ["concept1", "concept2", "concept3"],
  "hasDiagram": true,
  "content": {{
    "explanation": "3-4 paragraphs with markdown: **bold**, `code`, ### headings, bullet lists, ```language code blocks. Be technical and deep.",
    "diagram": "valid Mermaid diagram string or null",
    "realWorldExample": "Concrete scenario with actual code snippets.",
    "exercises": [
      {{"title": "...", "description": "..."}}
    ],
    "summary": "2-3 sentence summary."
  }}
}}

Rules:
- Stay tightly scoped to this chapter only.
- Keep the chapter aligned with the course level and section context.
- If hasDiagram is false, set diagram to null.
- CRITICAL: Any code snippets MUST be properly wrapped in markdown triple backticks (```language ... ```). Do not output loose code.
- Return pure JSON only."""

    raw = await call_openrouter(req.api_key, prompt)
    data = parse_json_response(raw)
    content = data.get("content", {})

    chapter.key_concepts = data.get("keyConcepts", chapter.key_concepts or [])
    chapter.has_diagram = data.get("hasDiagram", chapter.has_diagram)
    chapter.explanation = content.get("explanation")
    chapter.diagram = content.get("diagram")
    chapter.real_world_example = content.get("realWorldExample")
    chapter.exercises = content.get("exercises", [])
    chapter.summary = content.get("summary")
    db.commit()
    db.refresh(chapter)

    return chapter_to_schema(chapter)





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

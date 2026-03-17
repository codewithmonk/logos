from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional
import httpx
import json
import re
import logging
import os
import asyncio
import random

from database import get_db, engine
import models
import schemas

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create tables on startup
models.Base.metadata.create_all(bind=engine)

# Migrate: add columns that may not exist in older databases
def _run_migrations():
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE chapters ADD COLUMN IF NOT EXISTS raw_response TEXT"
        ))
        conn.commit()

_run_migrations()

app = FastAPI(title="Logos API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "openrouter/hunter-alpha"

# System prompt injected for all chapter content generation requests.
# Leading, explicit, and repeated — LLMs follow front-loaded instructions.
CHAPTER_SYSTEM_PROMPT = """\
You are a senior technical course author writing structured lesson content in Markdown.

CODE FORMATTING — NON-NEGOTIABLE RULES:
1. EVERY code snippet, no matter how short, MUST be inside a fenced code block.
2. The opening fence MUST include a language tag on the SAME line: ```go  ```python  ```typescript  ```bash  ```yaml  ```sql  ```json  ```rust  ```dockerfile
3. Never write bare code in prose. If a paragraph would contain a function call, import statement, variable declaration, shell command, or config key-value — it belongs in a fenced block.
4. Inline backticks (` `) are ONLY for referencing names/terms (e.g. `http.Handler`, `os.Getenv`), NOT for code that spans multiple tokens or forms a statement.
5. Each fenced block must stand alone: one blank line before the opening fence, one blank line after the closing fence.

EXAMPLE of correct formatting:
The server is started using the `ListenAndServe` function.

```go
package main

import (
    "fmt"
    "net/http"
)

func main() {
    http.HandleFunc("/", handler)
    fmt.Println(http.ListenAndServe(":8080", nil))
}
```

The handler receives a `ResponseWriter` and `*Request`.
"""


# ── OpenRouter helper ──────────────────────────────────────────────────────────────

async def call_openrouter(api_key: str, prompt: str, system: str = "") -> str:
    env_key = os.getenv("OPENROUTER_API_KEY", "")
    key_to_use = api_key if api_key else env_key
    if not key_to_use:
        raise HTTPException(status_code=400, detail="OpenRouter API key is missing. Please provide it or set it in .env")
    
    model = os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
    
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

    timeout = httpx.Timeout(connect=30.0, read=300.0, write=30.0, pool=30.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        last_exception: Exception | None = None

        base_delay_seconds = 1.0

        for attempt in range(3):
            try:
                res = await client.post(OPENROUTER_URL, headers=headers, json=body)
                if res.status_code != 200:
                    err = res.json()
                    error_msg = err.get("error", {}).get("message", "OpenRouter API error")
                    raise HTTPException(status_code=res.status_code, detail=error_msg)
                data = res.json()
                return data["choices"][0]["message"]["content"]
            except HTTPException:
                raise
            except (httpx.RemoteProtocolError, httpx.ReadTimeout, httpx.ReadError) as exc:
                last_exception = exc
                logger.warning(
                    "OpenRouter request failed on attempt %s/3: %s",
                    attempt + 1,
                    exc,
                )
                if attempt < 2:
                    backoff_seconds = base_delay_seconds * (2 ** attempt)
                    jitter_seconds = random.uniform(0, 0.35 * backoff_seconds)
                    await asyncio.sleep(backoff_seconds + jitter_seconds)
                    continue
            except httpx.HTTPError as exc:
                logger.exception("OpenRouter transport error")
                raise HTTPException(
                    status_code=502,
                    detail=f"OpenRouter transport error: {exc}",
                ) from exc

        raise HTTPException(
            status_code=502,
            detail=(
                "OpenRouter connection dropped before the response completed. "
                "Please retry the chapter generation."
            ),
        ) from last_exception


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


def infer_code_language(code: str) -> str:
    trimmed = code.strip()
    # Go
    if re.search(r"(^|\n)\s*(package\s+\w+|import\s*\(|func\s+\w+\s*\(|type\s+\w+\s+struct)", trimmed):
        return "go"
    if re.search(r"\bfmt\.\w+\(|\bhttp\.HandlerFunc\b|\bdefer\b|\berrorf?\b", trimmed):
        return "go"
    # Python
    if re.search(r"(^|\n)\s*(def\s+\w+\(|class\s+\w+[:(]|from\s+\w+\s+import\s+|import\s+\w+)", trimmed):
        return "python"
    if re.search(r"(^|\n)\s*(if\s+__name__\s*==|@\w+|print\s*\(|self\.\w+)", trimmed):
        return "python"
    # TypeScript (before JS – TS patterns are more specific)
    if re.search(r"(^|\n)\s*(interface\s+\w+|type\s+\w+\s*=|export\s+(default\s+)?|import\s+.+from\s+)", trimmed):
        return "typescript"
    if re.search(r":\s*(string|number|boolean|void|any|unknown|never)\b", trimmed):
        return "typescript"
    # JavaScript
    if re.search(r"(^|\n)\s*(const|let|function)\s+\w+|=>\s*[{(]|console\.(log|error)\(", trimmed):
        return "javascript"
    # Rust
    if re.search(r"(^|\n)\s*(fn\s+\w+|use\s+\w+::|impl\s+\w+|let\s+mut\s+|pub\s+(fn|struct|enum|mod))", trimmed):
        return "rust"
    # Bash / Shell
    if re.search(r"(^|\n)\s*(#!.*(bash|sh|zsh)|export\s+\w+=|echo\s+|sudo\s+|\$\(|\bchmod\b|\bapt(-get)?\b|\byum\b)", trimmed):
        return "bash"
    if re.search(r"(^|\n)\s*\$\s+\S", trimmed):  # $ prompt lines
        return "bash"
    # YAML
    if re.search(r"(^|\n)(\w[\w-]*:\s+\S|---\s*$)", trimmed) and not re.search(r"[{};()]", trimmed):
        return "yaml"
    # Dockerfile
    if re.search(r"(^|\n)\s*(FROM|RUN|CMD|EXPOSE|ENV|COPY|ADD|ENTRYPOINT|WORKDIR)\s", trimmed):
        return "dockerfile"
    # SQL
    if re.search(r"^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b", trimmed, re.IGNORECASE):
        return "sql"
    # JSON
    if re.search(r"^\s*[{[]", trimmed) and re.search(r"[}\]]\s*$", trimmed):
        return "json"
    return "text"


def looks_like_code_line(line: str) -> bool:
    trimmed = line.strip()
    if not trimmed:
        return False
    # Markdown structural elements are not code
    if re.match(r"^(#{1,6}\s|[-*]\s|>\s|\d+\.\s)", trimmed):
        return False
    # Plain prose sentences (end in period, question mark, or are short natural language)
    if re.match(r"^[A-Z][a-z].*[.?!]$", trimmed) and len(trimmed) > 40:
        return False
    return bool(
        re.search(r"[{}();]", trimmed)
        or re.search(r"\b(func|package|import|return|if|else|for|switch|case|const|let|var|type|struct|class|def|fn|pub|use|impl|mod)\b", trimmed)
        or re.search(r"\w+\s*:=\s*", trimmed)                    # Go short assign
        or re.search(r"\w+\.\w+\(", trimmed)                     # method call
        or re.search(r"//|#\s+\w", trimmed)                      # line comments
        or re.search(r"^\s*\$\s+\S", trimmed)                    # shell prompt
        or re.search(r"^\s*-{2,}\w", trimmed)                    # CLI flags --flag
        or re.search(r"^\s*[A-Z_]{2,}=", trimmed)               # ENV=value
        or re.search(r"(FROM|RUN|CMD|COPY|EXPOSE|ENV)\s+\S", trimmed)  # Dockerfile
        or re.search(r"^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE)\s", trimmed, re.IGNORECASE)
    )


def normalize_markdown_content(content: str | None) -> str | None:
    if not content:
        return content

    def normalize_existing_fence(match: re.Match) -> str:
        lang = (match.group(1) or "").strip()
        code = match.group(2).strip()
        next_lang = lang if lang and lang != "text" else infer_code_language(code)
        return f"```{next_lang}\n{code}\n```"

    # Normalize existing fences: handle optional newline/spaces after language tag,
    # and fences that may have no language tag at all.
    normalized = re.sub(
        r"```(\w+)?[ \t]*\n?([\s\S]*?)```",
        normalize_existing_fence,
        content,
    )

    # Close any unclosed fence that the LLM left open (e.g. trailing ```)
    open_fences = normalized.count("```")
    if open_fences % 2 != 0:
        normalized = normalized.rstrip() + "\n```"

    lines = normalized.split("\n")
    output: list[str] = []
    buffer: list[str] = []
    in_fence = False

    def flush_buffer() -> None:
        nonlocal buffer
        if len(buffer) >= 2 and all(looks_like_code_line(line) or not line.strip() for line in buffer):
            code = "\n".join(buffer).strip()
            if code:
                output.append(f"```{infer_code_language(code)}\n{code}\n```")
        else:
            output.extend(buffer)
        buffer = []

    for line in lines:
        trimmed = line.strip()

        if trimmed.startswith("```"):
            flush_buffer()
            in_fence = not in_fence
            output.append(line)
            continue
        if in_fence:
            output.append(line)
            continue
        if looks_like_code_line(line) or (buffer and (line.startswith("    ") or line.startswith("\t") or not trimmed)):
            buffer.append(line)
            continue
        if (
            re.match(r"^( {2,}|\t+)", line)
            and not looks_like_code_line(line)
            and not re.match(r"^(#{1,6}\s|[-*]\s|>\s|\d+\.\s)", trimmed)
        ):
            flush_buffer()
            output.append(trimmed)
            continue
        flush_buffer()
        output.append(line)

    flush_buffer()
    return "\n".join(output)


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

@app.get("/api/runtime-config", response_model=schemas.RuntimeConfig)
def get_runtime_config():
    return schemas.RuntimeConfig(
        provider="OpenRouter",
        model=os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL),
    )

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

    prompt = f"""Generate FULL lesson content for this chapter. Return ONLY valid JSON — no text outside the JSON object.

Course: "{course.title}" ({course.level} level)
Section {section.number}: "{section.title}"
Chapter {chapter.number}: "{chapter.title}"
Description: "{chapter.description}"
Key concepts: {json.dumps(chapter.key_concepts)}
Include diagram: {"yes" if chapter.has_diagram else "no"}

Sibling chapters (for context, do NOT repeat their content):
{json.dumps(sibling_outline, indent=2)}

Return this exact JSON shape:
{{
  "keyConcepts": ["...", "..."],
  "hasDiagram": true,
  "content": {{
    "explanation": "<3-4 paragraphs of deep technical prose with ### subheadings, **bold** emphasis, bullet lists, and ALL code in ```language fenced blocks>",
    "diagram": "<Mermaid diagram string, or null if hasDiagram is false>",
    "realWorldExample": "<A concrete, worked scenario. ALL code MUST be in ```language fenced blocks>",
    "exercises": [
      {{"title": "...", "description": "..."}}
    ],
    "summary": "<2-3 sentence recap>"
  }}
}}

Constraints:
- Scope to THIS chapter only. Do not repeat sibling chapter material.
- Match depth and vocabulary to {course.level} level.
- explanation and realWorldExample MUST use ```language fenced blocks for every code snippet — no bare code in prose.
- Return pure JSON only."""

    raw = await call_openrouter(req.api_key, prompt, system=CHAPTER_SYSTEM_PROMPT)
    chapter.raw_response = raw  # Store raw LLM response for debugging
    data = parse_json_response(raw)
    content = data.get("content", {})

    chapter.key_concepts = data.get("keyConcepts", chapter.key_concepts or [])
    chapter.has_diagram = data.get("hasDiagram", chapter.has_diagram)
    chapter.explanation = normalize_markdown_content(content.get("explanation"))
    chapter.diagram = content.get("diagram")
    chapter.real_world_example = normalize_markdown_content(content.get("realWorldExample"))
    chapter.exercises = content.get("exercises", [])
    chapter.summary = normalize_markdown_content(content.get("summary"))
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


@app.get("/api/chapters/{chapter_id}/raw")
def get_chapter_raw_response(chapter_id: int, db: Session = Depends(get_db)):
    """Debug endpoint: returns the raw LLM response stored for a chapter."""
    chapter = db.query(models.Chapter).filter(models.Chapter.id == chapter_id).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return {
        "chapter_id": chapter_id,
        "title": chapter.title,
        "raw_response": chapter.raw_response,
    }


@app.get("/health")
def health():
    return {"status": "ok"}

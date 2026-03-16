from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class GenerateCourseRequest(BaseModel):
    api_key: str
    topic: str
    level: str = "intermediate"
    num_chapters: int = 8


class GenerateChapterRequest(BaseModel):
    api_key: str


class ChapterSummary(BaseModel):
    id: int
    number: int
    title: str
    description: str
    key_concepts: list[str]
    has_diagram: bool
    is_generated: bool
    completed: bool

    class Config:
        from_attributes = True


class CourseDetail(BaseModel):
    id: int
    title: str
    description: str
    topic: str
    level: str
    created_at: datetime
    chapters: list[ChapterSummary]

    class Config:
        from_attributes = True


class CourseSummary(BaseModel):
    id: int
    title: str
    topic: str
    level: str
    total_chapters: int
    completed_chapters: int
    created_at: datetime

    class Config:
        from_attributes = True


class ExerciseItem(BaseModel):
    title: str
    description: str


class ChapterContent(BaseModel):
    explanation: str
    diagram: Optional[str] = None
    realWorldExample: str
    exercises: list[ExerciseItem]
    summary: str

    class Config:
        from_attributes = True

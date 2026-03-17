from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class GenerateCourseRequest(BaseModel):
    api_key: str
    topic: str
    level: str = "intermediate"
    num_sections: int = 12
    chapters_per_section: int = 8


class GenerateChapterRequest(BaseModel):
    api_key: str = ""


class RuntimeConfig(BaseModel):
    provider: str
    model: str


class MetricsSummary(BaseModel):
    total_courses: int
    total_sections: int
    total_chapters: int
    generated_chapters: int
    completed_chapters: int


class ExerciseItem(BaseModel):
    title: str
    description: str


class ChapterSummary(BaseModel):
    id: int
    number: int
    title: str
    description: str
    key_concepts: list[str]
    has_diagram: bool
    completed: bool
    generated: bool
    
    explanation: Optional[str] = None
    diagram: Optional[str] = None
    real_world_example: Optional[str] = None
    exercises: list[ExerciseItem] = []
    summary: Optional[str] = None

    class Config:
        from_attributes = True


class SectionSummary(BaseModel):
    id: int
    number: int
    title: str
    description: str
    chapters: list[ChapterSummary]

    class Config:
        from_attributes = True


class CourseDetail(BaseModel):
    id: int
    title: str
    description: str
    topic: str
    level: str
    created_at: datetime
    sections: list[SectionSummary]

    class Config:
        from_attributes = True


class CourseSummary(BaseModel):
    id: int
    title: str
    topic: str
    level: str
    total_sections: int
    total_chapters: int
    completed_chapters: int
    created_at: datetime

    class Config:
        from_attributes = True

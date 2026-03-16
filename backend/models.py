from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    topic = Column(String(500), nullable=False)
    level = Column(String(50), nullable=False)
    api_key_hint = Column(String(10))  # last 4 chars only
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    chapters = relationship("Chapter", back_populates="course", cascade="all, delete-orphan", order_by="Chapter.number")


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    number = Column(Integer, nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    key_concepts = Column(JSON, default=list)
    has_diagram = Column(Boolean, default=False)
    is_generated = Column(Boolean, default=False)
    completed = Column(Boolean, default=False)
    content = Column(JSON, nullable=True)  # cached chapter content from Gemini

    course = relationship("Course", back_populates="chapters")

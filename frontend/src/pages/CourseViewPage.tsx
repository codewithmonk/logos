import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { MermaidDiagram } from "../components/MermaidDiagram";
import { ErrorState, LoadingState } from "../components/Status";
import { useTheme } from "../theme";
import type { ChapterSummary, CourseDetail, SectionSummary } from "../types";
import { MarkdownBlock } from "../components/MarkdownBlock";
import { clampPercent, formatDate, sanitizeMermaid } from "../utils";

interface ChapterPosition {
  chapter: ChapterSummary;
  section: SectionSummary;
  globalIndex: number;
}

function flattenCourse(course: CourseDetail): ChapterPosition[] {
  const items: ChapterPosition[] = [];
  let globalIndex = 0;

  for (const section of course.sections) {
    for (const chapter of section.chapters) {
      items.push({ chapter, section, globalIndex });
      globalIndex += 1;
    }
  }

  return items;
}

export function CourseViewPage() {
  const { courseId } = useParams();
  const { mode } = useTheme();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [generatingChapterId, setGeneratingChapterId] = useState<number | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());

  function toggleSection(sectionId: number) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  useEffect(() => {
    async function loadCourse() {
      if (!courseId) {
        setError("Missing course id");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError("");
        const nextCourse = await api.getCourse(Number(courseId));
        const flattened = flattenCourse(nextCourse);
        const firstIncomplete = flattened.findIndex((item) => !item.chapter.completed);
        setCourse(nextCourse);
        setActiveIndex(firstIncomplete >= 0 ? firstIncomplete : 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load course");
      } finally {
        setIsLoading(false);
      }
    }

    void loadCourse();
  }, [courseId]);

  // Ensure active chapter's section is always expanded
  useEffect(() => {
    if (course) {
      const flattened = flattenCourse(course);
      const currentActive = flattened[activeIndex];
      if (currentActive && collapsedSections.has(currentActive.section.id)) {
        setCollapsedSections((prev) => {
          const next = new Set(prev);
          next.delete(currentActive.section.id);
          return next;
        });
      }
    }
  }, [activeIndex, course]);

  const chapters = useMemo(() => (course ? flattenCourse(course) : []), [course]);
  const active = chapters[activeIndex];
  const completedCount = chapters.filter((item) => item.chapter.completed).length;
  const progress = course ? clampPercent(completedCount, Math.max(chapters.length, 1)) : 0;

  function mergeChapter(nextChapter: ChapterSummary) {
    setCourse((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: current.sections.map((section) => ({
          ...section,
          chapters: section.chapters.map((chapter) =>
            chapter.id === nextChapter.id ? nextChapter : chapter,
          ),
        })),
      };
    });
  }

  async function ensureChapterGenerated(chapter: ChapterSummary, force = false) {
    if ((!force && chapter.generated) || generatingChapterId === chapter.id) return;

    try {
      setError("");
      setGeneratingChapterId(chapter.id);
      const apiKey = window.localStorage.getItem("cf_api_key") ?? "";
      const nextChapter = await api.generateChapter(chapter.id, apiKey);
      mergeChapter(nextChapter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate chapter");
    } finally {
      setGeneratingChapterId(null);
    }
  }

  async function handleSelectChapter(index: number) {
    setActiveIndex(index);
    const next = chapters[index];
    if (next) {
      await ensureChapterGenerated(next.chapter);
    }
  }

  useEffect(() => {
    if (active?.chapter && !active.chapter.generated) {
      void ensureChapterGenerated(active.chapter);
    }
  }, [active?.chapter?.id]);

  async function handleMarkComplete() {
    if (!course || !active) return;

    try {
      await api.markChapterComplete(active.chapter.id);
      mergeChapter({ ...active.chapter, completed: true });

      if (activeIndex < chapters.length - 1) {
        await handleSelectChapter(activeIndex + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update chapter");
    }
  }

  if (isLoading) return <LoadingState label="Loading course..." />;
  if (error) return <ErrorState message={error} />;
  if (!course || !active) return <ErrorState message="This course does not have any chapters yet." />;

  const isGenerating = generatingChapterId === active.chapter.id;

  return (
    <section className="course-layout">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sidebar-card">
        <div className="sidebar-header">
          <span className="eyebrow">Course</span>
          <h1>{course.title}</h1>
          <p>{course.description}</p>

          <div className="sidebar-meta">
            <span className="level-pill">{course.level}</span>
            <span>{formatDate(course.created_at)}</span>
          </div>

          <div className="sidebar-progress">
            <div className="sidebar-progress-label">
              <span>Progress</span>
              <span>
                {completedCount} / {chapters.length} chapters
              </span>
            </div>
            <div className="progress-bar">
              <div
                className={`progress-fill${progress === 100 ? " complete" : ""}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="sidebar-actions">
            <Link className="secondary-button" to="/courses">
              ← Back
            </Link>
            <Link
              className="primary-button"
              to={`/courses/generate?topic=${encodeURIComponent(course.topic)}&level=${course.level}&sections=${course.sections.length}&chapters=${course.sections[0]?.chapters.length || 8}`}
            >
              Regenerate
            </Link>
          </div>
        </div>

        <div className="sidebar-sections">
          {course.sections.map((section) => {
            const isCollapsed = collapsedSections.has(section.id);
            return (
              <div className="section-block" key={section.id}>
                <button
                  type="button"
                  className="section-header-button"
                  onClick={() => toggleSection(section.id)}
                >
                  <h2>
                    {section.number}. {section.title}
                  </h2>
                  <span className="collapse-icon">{isCollapsed ? "▶" : "▼"}</span>
                </button>

                {!isCollapsed && (
                  <div className="chapter-nav-list">
                    {section.chapters.map((chapter) => {
                      const chapterIndex = chapters.findIndex(
                        (item) => item.chapter.id === chapter.id,
                      );
                      if (chapterIndex < 0) return null;
                      const isActive = chapterIndex === activeIndex;
                      return (
                        <button
                          type="button"
                          key={chapter.id}
                          className={isActive ? "chapter-nav active" : "chapter-nav"}
                          onClick={() => void handleSelectChapter(chapterIndex)}
                        >
                          <span className="chapter-nav-num">{chapter.number}</span>
                          <span className="chapter-nav-title">{chapter.title}</span>
                          {chapter.completed ? (
                            <span className="chapter-nav-status">✓</span>
                          ) : (
                            <span />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Content ─────────────────────────────────────────── */}
      <article className="content-card">
        <div className="content-header">
          <span className="eyebrow">
            {active.section.title} &middot; Chapter {activeIndex + 1} of {chapters.length}
          </span>
          <h2>{active.chapter.title}</h2>
          <p className="content-description">{active.chapter.description}</p>
        </div>

        {/* Key Concepts */}
        <section className="content-section">
          <h3 className="section-heading">Key concepts</h3>
          <div className="concept-row">
            {active.chapter.key_concepts.map((concept) => (
              <span className="concept-pill" key={concept}>
                {concept}
              </span>
            ))}
          </div>
        </section>

        {/* Explanation */}
        <section className="content-section">
          <h3 className="section-heading">Explanation</h3>
          {isGenerating ? (
            <LoadingState label="Generating chapter content..." />
          ) : active.chapter.generated ? (
            <MarkdownBlock content={active.chapter.explanation} />
          ) : (
            <div className="empty-inline-state">
              <p>This chapter only has its outline so far.</p>
              <button
                type="button"
                className="primary-button"
                onClick={() => void ensureChapterGenerated(active.chapter)}
              >
                Generate this chapter
              </button>
            </div>
          )}
        </section>

        {/* Diagram */}
        {active.chapter.generated && active.chapter.diagram ? (
          <section className="content-section">
            <h3 className="section-heading">Diagram</h3>
            <MermaidDiagram chart={sanitizeMermaid(active.chapter.diagram)} theme={mode} />
          </section>
        ) : null}

        {/* Real-world example */}
        <section className="content-section">
          <h3 className="section-heading">Real-world example</h3>
          {active.chapter.generated ? (
            <MarkdownBlock content={active.chapter.real_world_example} />
          ) : (
            <p className="summary-text">Generate the chapter to load the worked example.</p>
          )}
        </section>

        {/* Exercises */}
        <section className="content-section">
          <h3 className="section-heading">Exercises</h3>
          {active.chapter.generated && active.chapter.exercises.length ? (
            <div className="exercise-list">
              {active.chapter.exercises.map((exercise) => (
                <div className="exercise-card" key={exercise.title}>
                  <strong>{exercise.title}</strong>
                  <p>{exercise.description}</p>
                </div>
              ))}
            </div>
          ) : active.chapter.generated ? (
            <p className="summary-text">No exercises were generated for this chapter.</p>
          ) : (
            <p className="summary-text">Generate the chapter to load exercises.</p>
          )}
        </section>

        {/* Summary */}
        <section className="content-section">
          <h3 className="section-heading">Summary</h3>
          <p className="summary-text">
            {active.chapter.generated
              ? (active.chapter.summary ?? "No summary available.")
              : "Generate the chapter to load the summary."}
          </p>
        </section>

        {/* Actions */}
        <div className="content-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void ensureChapterGenerated(active.chapter, true)}
            disabled={isGenerating}
          >
            {isGenerating ? "Regenerating..." : "Regenerate"}
          </button>

          <div className="content-actions-right">
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleSelectChapter(Math.max(activeIndex - 1, 0))}
              disabled={activeIndex === 0}
            >
              ← Previous
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleMarkComplete()}
              disabled={!active.chapter.generated || isGenerating}
            >
              {activeIndex === chapters.length - 1 ? "Complete course" : "Mark done & continue →"}
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { ErrorState, LoadingState } from "../components/Status";
import type { CourseSummary } from "../types";
import { clampPercent, formatDate } from "../utils";

export function CourseLibraryPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();

  async function loadCourses() {
    try {
      setIsLoading(true);
      setError("");
      setCourses(await api.listCourses());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load courses");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCourses();
  }, []);

  async function handleDelete(courseId: number) {
    const confirmed = window.confirm("Delete this course and all of its chapters?");
    if (!confirmed) return;
    await api.deleteCourse(courseId);
    await loadCourses();
  }

  return (
    <section className="page-grid">
      <div className="hero-card">
        <span className="eyebrow">Library</span>
        <h1>Your courses</h1>
        <p>Resume where you left off, or branch into a new topic.</p>
        <div className="hero-actions">
          <Link className="primary-button" to="/courses/generate">
            Generate a course
          </Link>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading courses..." />
      ) : error ? (
        <ErrorState message={error} />
      ) : courses.length === 0 ? (
        <div className="empty-card">
          <p>No courses yet. Generate one to get started.</p>
          <Link className="secondary-button" to="/courses/generate">
            Create your first course
          </Link>
        </div>
      ) : (
        <div className="course-list">
          {courses.map((course) => {
            const percent = clampPercent(course.completed_chapters, course.total_chapters);
            return (
              <article
                className="course-card"
                key={course.id}
                onClick={() => navigate(`/courses/${course.id}`)}
              >
                <div className="course-card-body">
                  <div className="course-card-meta">
                    <span className="level-pill">{course.level}</span>
                    <span>{formatDate(course.created_at)}</span>
                  </div>
                  <h2>{course.title}</h2>
                  <p>{course.topic}</p>
                </div>

                <div className="course-card-side">
                  <div className="progress-badge">{percent}%</div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill${percent === 100 ? " complete" : ""}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="course-card-stats">
                    <span>
                      {course.completed_chapters}/{course.total_chapters} ch
                    </span>
                    <span>·</span>
                    <span>{course.total_sections} sec</span>
                  </div>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/courses/${course.id}`);
                      }}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(course.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { CourseLevel } from "../types";

const API_KEY_STORAGE = "cf_api_key";
const GENERATION_PHASES = [
  "Sending outline request to OpenRouter",
  "Planning sections and chapter structure",
  "Waiting for the model to finish the outline",
  "Saving the outline into the course library",
];

export function CourseGeneratePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [apiKey, setApiKey] = useState(() => window.localStorage.getItem(API_KEY_STORAGE) ?? "");
  const [topic, setTopic] = useState(searchParams.get("topic") ?? "");
  const [level, setLevel] = useState<CourseLevel>(
    (searchParams.get("level") as CourseLevel) ?? "intermediate",
  );
  const [numSections, setNumSections] = useState(Number(searchParams.get("sections")) || 12);
  const [chaptersPerSection, setChaptersPerSection] = useState(
    Number(searchParams.get("chapters")) || 8,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isSubmitting) {
      setPhaseIndex(0);
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(elapsed);
      setPhaseIndex(Math.min(Math.floor(elapsed / 4), GENERATION_PHASES.length - 1));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isSubmitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!topic.trim()) {
      setError("Topic is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      window.localStorage.setItem(API_KEY_STORAGE, apiKey);

      const course = await api.generateCourse({
        api_key: apiKey,
        topic: topic.trim(),
        level,
        num_sections: numSections,
        chapters_per_section: chaptersPerSection,
      });

      navigate(`/courses/${course.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate course");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="page-grid">
      <div className="hero-card">
        <span className="eyebrow">New course</span>
        <h1>Generate a course</h1>
        <p>
          Enter a topic and the AI will build a structured course outline — sections, chapters, key
          concepts, and exercises — ready to study immediately.
        </p>
      </div>

      <form className="form-card" onSubmit={handleSubmit}>
        <label className="field">
          <span>Topic</span>
          <input
            type="text"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. gRPC in Go, Redis internals, distributed tracing..."
            autoFocus
          />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>Level</span>
            <select value={level} onChange={(event) => setLevel(event.target.value as CourseLevel)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>

          <label className="field">
            <span>Sections</span>
            <select
              value={numSections}
              onChange={(event) => setNumSections(Number(event.target.value))}
            >
              {[5, 8, 12].map((value) => (
                <option key={value} value={value}>
                  {value} sections
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Chapters per section</span>
            <select
              value={chaptersPerSection}
              onChange={(event) => setChaptersPerSection(Number(event.target.value))}
            >
              {[4, 8, 12].map((value) => (
                <option key={value} value={value}>
                  {value} chapters
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>OpenRouter API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Optional if the backend is already configured with a key"
            autoComplete="off"
          />
        </label>

        {error ? <div className="error-card">{error}</div> : null}

        {isSubmitting ? (
          <div className="live-status-card">
            <div className="live-status-head">
              <strong>Generating outline</strong>
              <span>{elapsedSeconds}s</span>
            </div>
            <p>{GENERATION_PHASES[phaseIndex]}</p>
            <div className="phase-list">
              {GENERATION_PHASES.map((phase, index) => (
                <div
                  key={phase}
                  className={index <= phaseIndex ? "phase-item phase-item-active" : "phase-item"}
                >
                  {phase}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="form-footer">
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Generating..." : "Generate course"}
          </button>
        </div>
      </form>
    </section>
  );
}

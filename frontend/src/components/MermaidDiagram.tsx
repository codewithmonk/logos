import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

interface MermaidDiagramProps {
  chart: string;
  theme: "light" | "dark";
}

const initialized = new Set<string>();

function getMermaidTheme(mode: "light" | "dark") {
  return mode === "dark" ? "dark" : "default";
}

export function MermaidDiagram({ chart, theme }: MermaidDiagramProps) {
  const containerId = useId().replace(/:/g, "-");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const key = `${theme}`;
    if (!initialized.has(key)) {
      mermaid.initialize({
        startOnLoad: false,
        theme: getMermaidTheme(theme),
        securityLevel: "loose",
      });
      initialized.add(key);
    }

    mermaid
      .render(`diagram-${containerId}`, chart.trim())
      .then(({ svg: nextSvg }) => {
        setSvg(nextSvg);
        setError("");
      })
      .catch((err) => {
        console.error("Mermaid parsing error:", err);
        setError("Diagram render error. See console for details.");
      });
  }, [chart, containerId, theme]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (error) {
    return (
      <div className="diagram-fallback">
        <p>{error}</p>
        <pre><code>{chart}</code></pre>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="diagram diagram-button"
        onClick={() => setIsOpen(true)}
        aria-label="Open enlarged diagram"
      >
        <div className="diagram-toolbar">
          <span>Click to enlarge</span>
        </div>
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </button>

      {isOpen ? (
        <div
          className="diagram-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded diagram"
          onClick={() => setIsOpen(false)}
        >
          <div className="diagram-modal-shell" onClick={(event) => event.stopPropagation()}>
            <div className="diagram-modal-header">
              <span>Diagram viewer</span>
              <button
                type="button"
                className="diagram-modal-close"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="diagram-modal-body" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        </div>
      ) : null}
    </>
  );
}

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

  if (error) {
    return (
      <div className="diagram-fallback">
        <p>{error}</p>
        <pre><code>{chart}</code></pre>
      </div>
    );
  }

  return <div className="diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}

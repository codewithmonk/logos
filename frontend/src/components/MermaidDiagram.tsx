import { useEffect, useId, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import mermaid from "mermaid";

interface MermaidDiagramProps {
  chart: string;
  theme: "light" | "dark";
}

const initialized = new Set<string>();

function getMermaidTheme(mode: "light" | "dark") {
  return mode === "dark" ? "dark" : "default";
}

function getSvgNaturalSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox
      .split(/[\s,]+/)
      .map((part) => Number.parseFloat(part))
      .filter((part) => Number.isFinite(part));
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const widthAttr = svg.getAttribute("width") ?? "";
  const heightAttr = svg.getAttribute("height") ?? "";
  const widthValue = Number.parseFloat(widthAttr);
  const heightValue = Number.parseFloat(heightAttr);

  return {
    width: Number.isFinite(widthValue) && !widthAttr.includes("%") ? widthValue : 1200,
    height: Number.isFinite(heightValue) && !heightAttr.includes("%") ? heightValue : 800,
  };
}

function scaleSvgMarkup(svgMarkup: string, zoom: number): string {
  if (!svgMarkup) {
    return svgMarkup;
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(svgMarkup, "image/svg+xml");
  const svg = documentNode.querySelector("svg");
  if (!svg) {
    return svgMarkup;
  }

  const naturalSize = getSvgNaturalSize(svg);
  svg.setAttribute("width", String(naturalSize.width * zoom));
  svg.setAttribute("height", String(naturalSize.height * zoom));

  svg.style.maxWidth = "none";
  svg.style.height = "auto";
  svg.style.display = "block";

  return svg.outerHTML;
}

export function MermaidDiagram({ chart, theme }: MermaidDiagramProps) {
  const containerId = useId().replace(/:/g, "-");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

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

  useEffect(() => {
    if (!isOpen) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setIsDragging(false);
      dragState.current = null;
    }
  }, [isOpen]);

  function clampZoom(nextZoom: number) {
    return Math.min(3, Math.max(0.6, Number(nextZoom.toFixed(2))));
  }

  function updateZoom(delta: number) {
    setZoom((current) => clampZoom(current + delta));
  }

  function resetView() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setIsDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragState.current) {
      return;
    }

    const deltaX = event.clientX - dragState.current.startX;
    const deltaY = event.clientY - dragState.current.startY;
    setOffset({
      x: dragState.current.originX + deltaX,
      y: dragState.current.originY + deltaY,
    });
  }

  function handlePointerUp() {
    dragState.current = null;
    setIsDragging(false);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    updateZoom(event.deltaY < 0 ? 0.15 : -0.15);
  }

  if (error) {
    return (
      <div className="diagram-fallback">
        <p>{error}</p>
        <pre><code>{chart}</code></pre>
      </div>
    );
  }

  const modalSvg = scaleSvgMarkup(svg, zoom);

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
              <div className="diagram-modal-actions">
                <button type="button" className="diagram-modal-close" onClick={() => updateZoom(-0.2)}>
                  -
                </button>
                <button type="button" className="diagram-modal-close" onClick={() => updateZoom(0.2)}>
                  +
                </button>
                <button type="button" className="diagram-modal-close" onClick={resetView}>
                  Reset
                </button>
                <span className="diagram-zoom-label">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  className="diagram-modal-close"
                  onClick={() => setIsOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <div
              className="diagram-modal-body"
              onWheel={handleWheel}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <div className="diagram-modal-hint">Scroll to zoom. Drag to pan.</div>
              <div
                className={isDragging ? "diagram-modal-canvas dragging" : "diagram-modal-canvas"}
                onPointerDown={handlePointerDown}
              >
                <div
                  className="diagram-modal-content"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                  }}
                  dangerouslySetInnerHTML={{ __html: modalSvg }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

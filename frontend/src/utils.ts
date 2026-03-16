export function sanitizeMermaid(chart: string | null): string {
  if (!chart) {
    return "";
  }
  let clean = chart.replace(/^["']|["']$/g, "").trim();
  clean = clean.replace(/^```(?:mermaid)?\s*/i, "");
  clean = clean.replace(/\s*```$/i, "");
  return clean.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function markdownToHtml(markdown: string | null): string {
  if (!markdown) {
    return "";
  }

  const escaped = escapeHtml(markdown);
  const withBlocks = escaped
    .replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, _lang: string, code: string) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    })
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^\s*\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, "<ul>$&</ul>");

  return withBlocks
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) {
        return "";
      }
      if (/^<(h3|ul|pre|blockquote)/.test(trimmed)) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, " ")}</p>`;
    })
    .join("");
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function clampPercent(completed: number, total: number): number {
  if (!total) {
    return 0;
  }
  return Math.round((completed / total) * 100);
}

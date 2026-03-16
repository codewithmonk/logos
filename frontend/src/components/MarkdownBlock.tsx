import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";
import { MermaidDiagram } from "./MermaidDiagram";
import { useTheme } from "../theme";
import type { Components } from "react-markdown";

interface MarkdownBlockProps {
  content: string | null;
}

function inferCodeLanguage(code: string): string {
  const trimmed = code.trim();

  if (
    /(^|\n)\s*(package\s+\w+|import\s*\(|func\s+\w+\s*\(|type\s+\w+\s+struct|go\s+func\b)/m.test(
      trimmed,
    ) ||
    /\bhttp\.HandlerFunc\b|\bfmt\.\w+\(|\bdefer\b|\brecover\(\)/.test(trimmed)
  ) {
    return "go";
  }

  if (/(^|\n)\s*(def\s+\w+\(|import\s+\w+|from\s+\w+\s+import\s+)/m.test(trimmed)) {
    return "python";
  }

  if (/(^|\n)\s*(const|let|function)\s+\w+|=>|console\.log\(/m.test(trimmed)) {
    return "javascript";
  }

  if (/(^|\n)\s*(interface|type|export\s+|import\s+.+from\s+)/m.test(trimmed)) {
    return "typescript";
  }

  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(trimmed)) {
    return "json";
  }

  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(trimmed)) {
    return "sql";
  }

  return "text";
}

function looksLikeCode(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (/^(#{1,6}\s|[-*]\s|>\s)/.test(trimmed)) {
    return false;
  }

  return (
    /[{}();]/.test(trimmed) ||
    /\b(func|package|import|return|if|else|for|switch|case|const|let|var|type|struct|class)\b/.test(
      trimmed,
    ) ||
    /\w+\s*:=\s*/.test(trimmed) ||
    /\w+\.\w+\(/.test(trimmed) ||
    /\/\//.test(trimmed)
  );
}

function normalizeMarkdown(content: string): string {
  const normalizedFences = content.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match, lang: string | undefined, code: string) => {
      const nextLang = lang && lang !== "text" ? lang : inferCodeLanguage(code);
      return `\`\`\`${nextLang}\n${code.trim()}\n\`\`\``;
    },
  );

  const lines = normalizedFences.split("\n");
  const output: string[] = [];
  let buffer: string[] = [];
  let inFence = false;

  function flushBuffer() {
    if (buffer.length >= 2 && buffer.every(looksLikeCode)) {
      const code = buffer.join("\n").trim();
      output.push(`\`\`\`${inferCodeLanguage(code)}\n${code}\n\`\`\``);
    } else {
      output.push(...buffer);
    }
    buffer = [];
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushBuffer();
      inFence = !inFence;
      output.push(line);
      continue;
    }

    if (inFence) {
      output.push(line);
      continue;
    }

    if (looksLikeCode(line) || (buffer.length > 0 && line.trim() !== "")) {
      buffer.push(line);
      continue;
    }

    flushBuffer();
    output.push(line);
  }

  flushBuffer();
  return output.join("\n");
}

export function MarkdownBlock({ content }: MarkdownBlockProps) {
  const { mode } = useTheme();

  if (!content) return null;

  const normalizedContent = normalizeMarkdown(content);

  const components: Components = {
    code({ node, inline, className, children, ...props }: any) {
      const codeString = String(children).replace(/\n$/, "");
      const inferredLanguage = inferCodeLanguage(codeString);
      const match = /language-(\w+)/.exec(className || "");
      const language = match?.[1] && match[1] !== "text" ? match[1] : inferredLanguage;
      const isMermaid = match && match[1] === "mermaid";
      const codeClassName = language ? `language-${language}` : className;

      if (!inline && isMermaid) {
        return <MermaidDiagram chart={codeString} theme={mode} />;
      }

      if (!inline) {
        return (
          <div className="code-block-wrapper">
            <div className="code-block-header">
              <span className="code-lang">{language}</span>
              <button
                type="button"
                className="code-copy-button"
                onClick={() => navigator.clipboard.writeText(codeString)}
              >
                Copy
              </button>
            </div>
            <code className={codeClassName} {...props}>
              {children}
            </code>
          </div>
        );
      }

      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };

  return (
    <div className="prose-block render-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}

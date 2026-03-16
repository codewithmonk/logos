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
  const t = code.trim();

  // Go
  if (/(^|\n)\s*(package\s+\w+|import\s*\(|func\s+\w+\s*\(|type\s+\w+\s+struct)/m.test(t)) return "go";
  if (/\bfmt\.\w+\(|\bhttp\.HandlerFunc\b|\bdefer\b|\berrorf?\b/.test(t)) return "go";

  // Python
  if (/(^|\n)\s*(def\s+\w+\(|class\s+\w+[:(]|from\s+\w+\s+import\s+|import\s+\w+)/m.test(t)) return "python";
  if (/(^|\n)\s*(if\s+__name__\s*==|@\w+|print\s*\(|self\.\w+)/m.test(t)) return "python";

  // TypeScript (check before JS — more specific)
  if (/(^|\n)\s*(interface\s+\w+|type\s+\w+\s*=|export\s+(default\s+)?|import\s+.+from\s+)/m.test(t)) return "typescript";
  if (/:\s*(string|number|boolean|void|any|unknown|never)\b/.test(t)) return "typescript";

  // JavaScript
  if (/(^|\n)\s*(const|let|function)\s+\w+|=>\s*[{(]|console\.(log|error)\(/m.test(t)) return "javascript";

  // Rust
  if (/(^|\n)\s*(fn\s+\w+|use\s+\w+::|impl\s+\w+|let\s+mut\s+|pub\s+(fn|struct|enum|mod))/m.test(t)) return "rust";

  // Bash / Shell
  if (/(^|\n)\s*(#!.*(bash|sh|zsh)|export\s+\w+=|echo\s+|sudo\s+|\$\(|\bchmod\b|\bapt(-get)?\b)/m.test(t)) return "bash";
  if (/(^|\n)\s*\$\s+\S/m.test(t)) return "bash";

  // YAML
  if (/(^|\n)(\w[\w-]*:\s+\S|---\s*$)/m.test(t) && !/[{};()]/.test(t)) return "yaml";

  // Dockerfile
  if (/(^|\n)\s*(FROM|RUN|CMD|EXPOSE|ENV|COPY|ADD|ENTRYPOINT|WORKDIR)\s/m.test(t)) return "dockerfile";

  // SQL
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i.test(t)) return "sql";

  // JSON
  if (/^\s*[{[]/.test(t) && /[}\]]\s*$/.test(t)) return "json";

  return "";
}

function looksLikeCode(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^(#{1,6}\s|[-*]\s|>\s|\d+\.\s)/.test(trimmed)) return false;
  // Long natural-language sentences are prose, not code
  if (/^[A-Z][a-z].*[.?!]$/.test(trimmed) && trimmed.length > 40) return false;

  return (
    /[{}();]/.test(trimmed) ||
    /\b(func|package|import|return|if|else|for|switch|case|const|let|var|type|struct|class|def|fn|pub|use|impl|mod)\b/.test(trimmed) ||
    /\w+\s*:=\s*/.test(trimmed) ||       // Go short-assign
    /\w+\.\w+\(/.test(trimmed) ||         // method call
    /\/\/|#\s+\w/.test(trimmed) ||        // line comments
    /^\s*\$\s+\S/.test(trimmed) ||        // shell $ prompt
    /^\s*-{2,}\w/.test(trimmed) ||        // CLI flags
    /^\s*[A-Z_]{2,}=/.test(trimmed) ||   // ENV=value
    /\b(FROM|RUN|CMD|COPY|EXPOSE)\s/.test(trimmed) ||  // Dockerfile
    /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE)\s/i.test(trimmed)
  );
}

function normalizeMarkdown(content: string): string {
  // Step 1: normalize existing fences — handle missing newline after lang tag,
  // add inferred language when missing, and trim interior whitespace.
  let working = content.replace(
    /```(\w+)?[ \t]*\n?([\s\S]*?)```/g,
    (_match, lang: string | undefined, code: string) => {
      const nextLang = lang && lang !== "text" ? lang : inferCodeLanguage(code);
      return `\`\`\`${nextLang}\n${code.trim()}\n\`\`\``;
    },
  );

  // Step 2: close any unclosed fence the LLM left hanging
  const fenceCount = (working.match(/```/g) ?? []).length;
  if (fenceCount % 2 !== 0) {
    working = working.trimEnd() + "\n```";
  }

  const normalizedFences = working;

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
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushBuffer();
      inFence = !inFence;
      output.push(line);
      continue;
    }

    if (inFence) {
      output.push(line);
      continue;
    }

    if (looksLikeCode(line) || (buffer.length > 0 && trimmed !== "")) {
      buffer.push(line);
      continue;
    }

    // Remove accidental prose indentation so markdown does not treat it as code.
    if (
      /^( {2,}|\t+)/.test(line) &&
      !looksLikeCode(line) &&
      !/^(#{1,6}\s|[-*]\s|>\s|\d+\.\s)/.test(trimmed)
    ) {
      flushBuffer();
      output.push(trimmed);
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
    // Override pre to return a fragment so our code component owns the wrapper
    pre({ children }: any) {
      return <>{children}</>;
    },

    code({ className, children, ...props }: any) {
      const codeString = String(children).replace(/\n$/, "");

      // Detect block code: fenced blocks have a language-* className from rehypeHighlight
      const match = /language-(\w+)/.exec(className || "");
      const rawLang = match?.[1] ?? "";
      // Also treat multiline code without language tag as a block
      const isBlock = Boolean(match) || codeString.includes("\n");

      // Resolve display language label (use existing class if present, else infer)
      const language = !rawLang || rawLang === "text" ? inferCodeLanguage(codeString) : rawLang;
      const isMermaid = rawLang === "mermaid";

      if (isBlock && isMermaid) {
        return <MermaidDiagram chart={codeString} theme={mode} />;
      }

      if (isBlock) {
        // Preserve the original className (includes "hljs" token classes from rehypeHighlight)
        const codeClassName = className || (language ? `language-${language}` : undefined);

        return (
          <div className="code-block-wrapper">
            <div className="code-block-header">
              <span className="code-lang">{language || "code"}</span>
              <button
                type="button"
                className="code-copy-button"
                onClick={() => navigator.clipboard.writeText(codeString)}
              >
                Copy
              </button>
            </div>
            <pre>
              <code className={codeClassName} {...props}>
                {children}
              </code>
            </pre>
          </div>
        );
      }

      // Inline code
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

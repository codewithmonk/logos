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

export function MarkdownBlock({ content }: MarkdownBlockProps) {
  const { mode } = useTheme();

  if (!content) return null;

  const components: Components = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const isMermaid = match && match[1] === "mermaid";
      const codeString = String(children).replace(/\n$/, "");

      if (!inline && isMermaid) {
        return <MermaidDiagram chart={codeString} theme={mode} />;
      }

      if (!inline) {
        return (
          <div className="code-block-wrapper">
            <div className="code-block-header">
              <span className="code-lang">{match ? match[1] : "text"}</span>
              <button
                type="button"
                className="code-copy-button"
                onClick={() => navigator.clipboard.writeText(codeString)}
              >
                Copy
              </button>
            </div>
            <code className={className} {...props}>
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
        {content}
      </ReactMarkdown>
    </div>
  );
}

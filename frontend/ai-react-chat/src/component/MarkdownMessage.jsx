import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeBotMarkdown } from '../utils/markdown';

export default function MarkdownMessage({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ node, ...props }) => (
          <div className="code-block-wrapper">
            <pre {...props} />
          </div>
        ),
      }}
    >
      {normalizeBotMarkdown(text)}
    </ReactMarkdown>
  );
}

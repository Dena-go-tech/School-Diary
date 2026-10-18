import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

// Markdown с формулами: $…$ — в строке, $$…$$ — отдельной строкой. Рендерится на сервере
export default function MathText({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {children}
    </ReactMarkdown>
  );
}

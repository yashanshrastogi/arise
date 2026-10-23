import React from 'react';

/**
 * Renders text with highlighted keywords and markdown elements:
 * - `**keyword**` -> distinctive highlighted keyword tag
 * - `*text*` -> italic emphasis
 * - `` `code` `` -> inline code pill
 * - ```` ```code``` ```` -> structured code block with copy action
 */

function renderInlineMarkdown(text) {
  if (!text) return null;

  // Split by inline markdown tokens: `code`, **bold**, *italic*
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return tokens.map((token, idx) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-bold border border-indigo-200 dark:border-indigo-800/50"
        >
          {token.slice(1, -1)}
        </code>
      );
    }

    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong
          key={idx}
          className="font-bold text-[var(--text-primary)]"
        >
          {token.slice(2, -2)}
        </strong>
      );
    }

    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={idx} className="italic font-semibold text-slate-700 dark:text-slate-300">
          {token.slice(1, -1)}
        </em>
      );
    }

    return token;
  });
}

export default function FormattedBotText({ text, className = '' }) {
  if (!text) return null;

  // Handle multi-line code blocks
  if (text.includes('```')) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return (
      <div className={`space-y-2 ${className}`}>
        {parts.map((p, idx) => {
          if (p.startsWith('```')) {
            const lines = p.slice(3, -3).trim().split('\n');
            const lang = lines[0]?.trim() || '';
            const code = (lang && !lang.includes(' ') && lines.length > 1) ? lines.slice(1).join('\n') : lines.join('\n');
            return (
              <div key={idx} className="my-2 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 text-slate-100 font-mono text-xs">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-bold text-slate-400">
                  <span>{lang || 'python'}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(code)}
                    className="hover:text-white px-2 py-0.5 rounded bg-slate-800 transition-colors"
                  >
                    Copy code
                  </button>
                </div>
                <pre className="p-3 overflow-x-auto leading-relaxed">{code}</pre>
              </div>
            );
          }
          return <span key={idx}>{renderInlineMarkdown(p)}</span>;
        })}
      </div>
    );
  }

  return <span className={className}>{renderInlineMarkdown(text)}</span>;
}

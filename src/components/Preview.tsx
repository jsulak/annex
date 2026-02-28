import { useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface Props {
  body: string;
  onNavigate: (target: string) => void;
  onSearchTag: (tag: string) => void;
}

// Configure marked for CommonMark + GFM
marked.setOptions({ gfm: true, breaks: false });

/** Convert [[wiki-links]] and #tags to clickable HTML before sanitizing. */
function preprocessMarkdown(md: string): string {
  // Replace [[target]] with a clickable anchor
  let result = md.replace(
    /\[\[([^\]]+)\]\]/g,
    (_match, target: string) =>
      `<a class="preview-wikilink" data-wikilink="${target.trim().replace(/"/g, '&quot;')}">${target.trim()}</a>`,
  );

  // Replace #tags (not ## headings) with clickable anchors
  result = result.replace(
    /(?:^|\s)#([a-zA-Z][\w-]*)/g,
    (match, tag: string) => {
      const leading = match.startsWith('#') ? '' : match[0];
      return `${leading}<a class="preview-tag" data-tag="${tag.toLowerCase()}">#${tag}</a>`;
    },
  );

  return result;
}

/** Add target="_blank" to external links after rendering. */
function postprocessHtml(html: string): string {
  return html.replace(
    /<a href="(https?:\/\/[^"]*)">/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">',
  );
}

function renderMarkdown(body: string): string {
  const preprocessed = preprocessMarkdown(body);
  const rawHtml = marked.parse(preprocessed) as string;
  const clean = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['data-wikilink', 'data-tag', 'target'],
  });
  return postprocessHtml(clean);
}

export default function Preview({ body, onNavigate, onSearchTag }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (!link) return;

      const wikilink = link.dataset.wikilink;
      if (wikilink) {
        e.preventDefault();
        onNavigate(wikilink);
        return;
      }

      const tag = link.dataset.tag;
      if (tag) {
        e.preventDefault();
        onSearchTag(tag);
        return;
      }

      // External links are handled by target="_blank" — don't interfere
    },
    [onNavigate, onSearchTag],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [handleClick]);

  const html = renderMarkdown(body);

  return (
    <div
      ref={containerRef}
      className="preview-content"
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '16px',
        maxWidth: '680px',
        margin: '0 auto',
        fontFamily: 'var(--font-prose)',
        fontSize: 'calc(var(--font-size-editor, 13px) + 4px)',
        lineHeight: '1.7',
        color: 'var(--text-primary)',
      }}
    />
  );
}

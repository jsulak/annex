import type { Extension } from '@codemirror/state';
import {
  autocompletion,
  type CompletionContext,
  type Completion,
  type CompletionResult,
} from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

export interface CompletionProviders {
  /** Return note titles/IDs for [[ autocomplete. */
  getNotes: () => Array<{ id: string; title: string; filename: string }>;
  /** Return tag names for # autocomplete. */
  getTags: () => string[];
  /** Return bibliography/reference definitions for citation autocomplete. */
  getReferences: () => Array<{ key: string; text: string; raw: string }>;
}

function wikiLinkCompletion(providers: CompletionProviders) {
  return (context: CompletionContext): CompletionResult | null => {
    // Match [[ followed by optional text
    const match = context.matchBefore(/\[\[([^\]]*)$/);
    if (!match) return null;

    const query = match.text.slice(2).toLowerCase(); // strip [[
    const notes = providers.getNotes();

    // Check how many ] chars follow the cursor (from closeBrackets or user)
    const after = context.state.sliceDoc(context.pos, context.pos + 2);
    const closingToConsume = after === ']]' ? 2 : after.startsWith(']') ? 1 : 0;

    const options = notes
      .filter(
        (n) =>
          n.filename.toLowerCase().includes(query) ||
          n.title.toLowerCase().includes(query) ||
          n.id.includes(query),
      )
      .slice(0, 30)
      .map((n) => {
        // Display filename (strip .md extension) as the label
        const displayName = n.filename.replace(/\.md$/i, '');
        // Extract title part by stripping leading timestamp ID from filename
        const titleOnly = displayName.replace(/^\d{12,14}\s*/, '').trim();
        // Format: "Title [[ID]]" — title outside the brackets for readability
        const apply = titleOnly && n.id
          ? `${titleOnly} [[${n.id}]]`
          : `[[${n.id || titleOnly || displayName}]]`;
        return {
          label: displayName || n.id,
          detail: n.id !== displayName ? n.id : undefined,
          apply,
        };
      });

    // Replace from the [[ (inclusive) through any existing ]]
    const from = match.from;
    const to = context.pos + closingToConsume;

    return {
      from,
      to,
      options,
      filter: false, // we already filtered
    };
  };
}

function tagCompletion(providers: CompletionProviders) {
  return (context: CompletionContext): CompletionResult | null => {
    // Match # followed by word chars, but not ## (headings)
    const match = context.matchBefore(/(?:^|\s)#([a-zA-Z][\w-]*)$/);
    if (!match) return null;

    // Find the position of the # in the match
    const hashPos = match.text.lastIndexOf('#');
    const query = match.text.slice(hashPos + 1).toLowerCase();
    const from = match.from + hashPos;

    const tags = providers.getTags();

    const options = tags
      .filter((t) => t.toLowerCase().includes(query))
      .slice(0, 30)
      .map((t) => ({
        label: `#${t}`,
        apply: `#${t}`,
      }));

    return {
      from,
      options,
      filter: false,
    };
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function referenceExists(doc: string, key: string): boolean {
  const re = new RegExp(`^\\s*\\[#${escapeRegExp(key)}\\]:`, 'gim');
  return re.test(doc);
}

function lineStartOffset(lines: string[], lineIndex: number, docLength: number): number {
  if (lineIndex >= lines.length) return docLength;
  return lines.slice(0, lineIndex).join('\n').length + (lineIndex === 0 ? 0 : 1);
}

function findReferenceInsert(doc: string, raw: string): { from: number; insert: string } {
  const lines = doc.split('\n');
  const headingIndex = lines.findIndex((line) =>
    /^\s{0,3}(#{1,6}\s+References|References:)\s*$/i.test(line),
  );

  if (headingIndex === -1) {
    const backlinksIndex = lines.findIndex((line) => /^\s*Backlinks:\s*/i.test(line));
    if (backlinksIndex !== -1) {
      const from = lineStartOffset(lines, backlinksIndex, doc.length);
      const before = doc.slice(0, from);
      const prefix = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
      return { from, insert: `${prefix}${raw}\n\n` };
    }

    const prefix = doc.endsWith('\n\n') ? '' : doc.endsWith('\n') ? '\n' : '\n\n';
    return { from: doc.length, insert: `${prefix}${raw}` };
  }

  let insertLine = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (/^\s{0,3}#{1,6}\s+\S/.test(lines[i])) {
      insertLine = i;
      break;
    }
  }

  const from = lineStartOffset(lines, insertLine, doc.length);
  const before = doc.slice(0, from);
  const after = doc.slice(from);
  const prefix = before.endsWith('\n') ? '' : '\n';
  const suffix = after.length === 0 ? '' : after.startsWith('\n') ? '' : '\n';
  return { from, insert: `${prefix}${raw}${suffix}` };
}

function referenceOptions(
  providers: CompletionProviders,
  query: string,
  applyFor: 'definition' | 'citation',
  page?: string,
): Completion[] {
  const q = query.toLowerCase();
  return providers.getReferences()
    .filter(
      (ref) =>
        ref.key.toLowerCase().includes(q) ||
        ref.text.toLowerCase().includes(q),
    )
    .slice(0, 30)
    .map((ref) => ({
      label: `#${ref.key}`,
      detail: ref.text,
      apply:
        applyFor === 'definition'
          ? ref.raw
          : (view: EditorView, _completion: Completion, from: number, to: number) => {
              const citation = `[${page ?? ''}][#${ref.key}]`;
              const doc = view.state.doc.toString();
              const changes: Array<{ from: number; to?: number; insert: string }> = [
                { from, to, insert: citation },
              ];
              if (!referenceExists(doc, ref.key)) {
                changes.push(findReferenceInsert(doc, ref.raw));
              }
              view.dispatch({
                changes,
                selection: { anchor: from + citation.length },
                scrollIntoView: true,
              });
            },
    }));
}

function referenceDefinitionCompletion(providers: CompletionProviders) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const match = /(^|\s)\[#([^\]\s]*)$/.exec(before);
    if (!match) return null;

    const closingToConsume = context.state.sliceDoc(context.pos, context.pos + 1) === ']' ? 1 : 0;
    const query = match[2].toLowerCase();
    const from = line.from + before.length - match[2].length - 2;
    const options = referenceOptions(providers, query, 'definition');

    return {
      from,
      to: context.pos + closingToConsume,
      options,
      filter: false,
    };
  };
}

function referenceCitationCompletion(providers: CompletionProviders) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[([^\]\n]*)\]\[#([^\]\s]*)$/);
    if (!match) return null;

    const parts = /^\[([^\]\n]*)\]\[#([^\]\s]*)$/.exec(match.text);
    if (!parts) return null;

    const closingToConsume = context.state.sliceDoc(context.pos, context.pos + 1) === ']' ? 1 : 0;
    const page = parts[1];
    const query = parts[2].toLowerCase();
    const options = referenceOptions(providers, query, 'citation', page);

    return {
      from: match.from,
      to: context.pos + closingToConsume,
      options,
      filter: false,
    };
  };
}

/** Create an autocomplete extension for [[ wiki-links, references, and #tags. */
export function zettelAutocomplete(providers: CompletionProviders): Extension {
  return autocompletion({
    override: [
      wikiLinkCompletion(providers),
      referenceCitationCompletion(providers),
      referenceDefinitionCompletion(providers),
      tagCompletion(providers),
    ],
    activateOnTyping: true,
  });
}

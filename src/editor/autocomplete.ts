import type { Extension } from '@codemirror/state';
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';

export interface CompletionProviders {
  /** Return note titles/IDs for [[ autocomplete. */
  getNotes: () => Array<{ id: string; title: string }>;
  /** Return tag names for # autocomplete. */
  getTags: () => string[];
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
          n.title.toLowerCase().includes(query) ||
          n.id.includes(query),
      )
      .slice(0, 30)
      .map((n) => {
        const text = n.title || n.id;
        return {
          label: text,
          detail: n.id,
          apply: `${text}]]`,
        };
      });

    // Replace from after [[ through any existing ]]
    const from = match.from + 2;
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

/** Create an autocomplete extension for [[ wiki-links and #tags. */
export function zettelAutocomplete(providers: CompletionProviders): Extension {
  return autocompletion({
    override: [wikiLinkCompletion(providers), tagCompletion(providers)],
    activateOnTyping: true,
  });
}

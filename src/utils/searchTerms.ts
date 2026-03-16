/** Parse a search query string into an array of terms to highlight. */
export function parseSearchTerms(query: string): string[] {
  const terms: string[] = [];

  // Extract quoted phrases first
  const withoutQuotes = query.replace(/"([^"]+)"/g, (_match, phrase: string) => {
    const t = phrase.trim().toLowerCase();
    if (t) terms.push(t);
    return ' ';
  });

  // Split remaining tokens; skip NOT and the token immediately following it
  const tokens = withoutQuotes.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].toUpperCase() === 'NOT') {
      i++; // skip the next token too
      continue;
    }
    const term = tokens[i].replace(/^#/, '').toLowerCase();
    if (term.length > 0) terms.push(term);
  }

  return terms;
}

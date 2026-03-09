import { Index } from 'flexsearch';
import { listNoteFiles, readNoteFile, statNoteFile } from './fileStore.js';
import { parseNote, type NoteIndex } from './noteParser.js';

export interface SearchResultItem extends NoteIndex {
  titleMatches: Array<[number, number]>;  // [offset, length]
  snippetMatches: Array<[number, number]>;
}

interface StoredNote extends NoteIndex {
  body: string;
}

interface ParsedQuery {
  terms: string[];      // plain words (ANDed)
  phrases: string[];    // "exact phrases"
  tags: string[];       // #tags
  negations: string[];  // NOT keywords
}

const noteStore = new Map<string, StoredNote>();
const flexIndex = new Index({ tokenize: 'forward', cache: 100 });

/** Build the full index from disk at startup. */
export async function buildIndex(notesDir: string): Promise<number> {
  noteStore.clear();
  const files = await listNoteFiles(notesDir);
  let count = 0;

  for (const filename of files) {
    try {
      const [body, { mtime }] = await Promise.all([
        readNoteFile(notesDir, filename),
        statNoteFile(notesDir, filename),
      ]);
      const note = parseNote(filename, body, mtime);
      addToIndex({ ...note, body });
      count++;
    } catch {
      // Skip files that can't be read
    }
  }

  return count;
}

/** Add or update a single note in the index. */
export function addToIndex(note: StoredNote): void {
  noteStore.set(note.id, note);
  flexIndex.update(note.id, `${note.filename} ${note.title} ${note.body}`);
}

/** Remove a note from the index. */
export function removeFromIndex(id: string): void {
  noteStore.delete(id);
  flexIndex.remove(id);
}

/** Parse a search query into structured parts. */
export function parseQuery(raw: string): ParsedQuery {
  let q = raw;
  const phrases: string[] = [];
  const tags: string[] = [];
  const negations: string[] = [];

  // Extract "exact phrases"
  q = q.replace(/"([^"]+)"/g, (_match, phrase: string) => {
    phrases.push(phrase);
    return ' ';
  });

  // Extract NOT terms (case-sensitive NOT keyword)
  q = q.replace(/\bNOT\s+(\S+)/g, (_match, word: string) => {
    negations.push(word);
    return ' ';
  });

  // #tags are treated as plain text search terms (strip the # for indexing)
  q = q.replace(/#([a-zA-Z][\w-]*)/g, (_match, tag: string) => {
    return ` ${tag.toLowerCase()} `;
  });

  // Remaining words are plain terms
  const terms = q.split(/\s+/).filter(Boolean);

  return { terms, phrases, tags, negations };
}

/** Find offsets of a search term within a string (case-insensitive). */
function findOffsets(haystack: string, needle: string): Array<[number, number]> {
  const offsets: Array<[number, number]> = [];
  const lower = haystack.toLowerCase();
  const needleLower = needle.toLowerCase();
  let pos = 0;
  while (pos < lower.length) {
    const idx = lower.indexOf(needleLower, pos);
    if (idx === -1) break;
    offsets.push([idx, needle.length]);
    pos = idx + 1;
  }
  return offsets;
}

/** Generate a snippet around the first match in the body. */
function generateSnippet(
  body: string,
  searchTerms: string[],
): { snippet: string; offset: number } {
  const bodyLower = body.toLowerCase();

  // Find earliest match position
  let earliest = -1;
  for (const term of searchTerms) {
    const idx = bodyLower.indexOf(term.toLowerCase());
    if (idx !== -1 && (earliest === -1 || idx < earliest)) {
      earliest = idx;
    }
  }

  if (earliest === -1) {
    // No match in body — return beginning
    return { snippet: body.slice(0, 120), offset: 0 };
  }

  // Window around the match
  const start = Math.max(0, earliest - 40);
  const end = Math.min(body.length, start + 120);
  const snippet = (start > 0 ? '...' : '') + body.slice(start, end) + (end < body.length ? '...' : '');
  return { snippet, offset: start > 0 ? -3 : 0 };
}

/** Search flexsearch for each term and intersect results (AND logic). */
function intersectSearchResults(terms: string[]): Set<string> {
  let result: Set<string> | null = null;
  for (const term of terms) {
    const ids = new Set(flexIndex.search(term, 100_000).map(String));
    if (result === null) {
      result = ids;
    } else {
      const prev = result;
      result = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) result.add(id);
      }
    }
  }
  return result ?? new Set<string>();
}

/** Run a search query and return results with match offsets. */
export function search(rawQuery: string, limit = 50): SearchResultItem[] {
  const parsed = parseQuery(rawQuery);
  const { terms, phrases, tags, negations } = parsed;

  // Get candidates
  let candidateIds: Set<string>;

  if (terms.length > 0) {
    // Use flexsearch for term-based search, intersect results for AND
    candidateIds = intersectSearchResults(terms);
  } else if (phrases.length > 0) {
    // Search by phrase words via flexsearch
    const phraseWords = phrases.flatMap((p) => p.split(/\s+/)).filter(Boolean);
    candidateIds = intersectSearchResults(phraseWords);
  } else {
    // Only tags or negations — scan all notes
    candidateIds = new Set(noteStore.keys());
  }

  const results: SearchResultItem[] = [];

  for (const id of candidateIds) {
    const note = noteStore.get(id);
    if (!note) continue;

    const bodyLower = note.body.toLowerCase();
    const titleLower = note.title.toLowerCase();
    const combined = `${titleLower} ${bodyLower}`;

    // Check phrase matches (exact, case-insensitive)
    const phrasesMatch = phrases.every(
      (p) => combined.includes(p.toLowerCase()),
    );
    if (!phrasesMatch) continue;

    // Check tag matches
    const tagsMatch = tags.every((t) => note.tags.includes(t));
    if (!tagsMatch) continue;

    // Check negations (exclude if any negation term is present)
    const hasNegation = negations.some(
      (n) => combined.includes(n.toLowerCase()),
    );
    if (hasNegation) continue;

    // Generate snippet and calculate match offsets
    const highlightTerms = [...terms, ...phrases];
    const { snippet } = generateSnippet(note.body, highlightTerms);

    // Title match offsets
    const titleMatches: Array<[number, number]> = [];
    for (const term of highlightTerms) {
      titleMatches.push(...findOffsets(note.title, term));
    }

    // Snippet match offsets
    const snippetMatches: Array<[number, number]> = [];
    for (const term of highlightTerms) {
      snippetMatches.push(...findOffsets(snippet, term));
    }

    results.push({
      id: note.id,
      filename: note.filename,
      title: note.title,
      snippet,
      tags: note.tags,
      links: note.links,
      createdAt: note.createdAt,
      modifiedAt: note.modifiedAt,
      titleMatches,
      snippetMatches,
    });
  }

  // Sort by modifiedAt descending
  results.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  return results.slice(0, limit);
}

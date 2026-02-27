export interface NoteIndex {
  id: string;
  filename: string;
  title: string;
  snippet: string;
  tags: string[];
  links: string[];
  createdAt: string;
  modifiedAt: string;
}

export interface NoteDetail extends NoteIndex {
  body: string;
  etag: string;
}

/** Extract leading digits from filename as the note ID. */
export function filenameToId(filename: string): string {
  const match = filename.match(/^(\d{12,14})/);
  return match ? match[1] : '';
}

/** Convert a 12- or 14-digit ID to an ISO 8601 date string. */
export function idToCreatedAt(id: string): string {
  if (id.length < 12) return '';
  const year = id.slice(0, 4);
  const month = id.slice(4, 6);
  const day = id.slice(6, 8);
  const hour = id.slice(8, 10);
  const minute = id.slice(10, 12);
  const second = id.length >= 14 ? id.slice(12, 14) : '00';
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).toISOString();
}

/** First `# heading` line, or title portion of filename (without ID prefix and .md). */
export function extractTitle(body: string, filename: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  // Fallback: strip ID prefix and extension from filename
  return filename.replace(/^\d{12,14}\s*/, '').replace(/\.md$/i, '').trim() || filename;
}

/** First 120 chars of body after the title line. */
export function extractSnippet(body: string): string {
  const lines = body.split('\n');
  // Skip leading blank lines and the first heading
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+/.test(lines[i])) {
      start = i + 1;
      break;
    }
    if (lines[i].trim() !== '') {
      start = i;
      break;
    }
  }
  const rest = lines.slice(start).join('\n').trim();
  return rest.slice(0, 120);
}

/** All #hashtag matches (exclude ## headings). */
export function extractTags(body: string): string[] {
  const tags = new Set<string>();
  // Match #tag that is preceded by start-of-line or whitespace, not ## headings
  const re = /(?:^|\s)#([a-zA-Z][\w-]*)/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
}

/** All [[wikilink]] targets. */
export function extractLinks(body: string): string[] {
  const links = new Set<string>();
  const re = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    links.add(match[1].trim());
  }
  return [...links];
}

/** Parse a note file into a NoteIndex object. */
export function parseNote(filename: string, body: string, mtime: Date): NoteIndex {
  const id = filenameToId(filename);
  return {
    id,
    filename,
    title: extractTitle(body, filename),
    snippet: extractSnippet(body),
    tags: extractTags(body),
    links: extractLinks(body),
    createdAt: id ? idToCreatedAt(id) : mtime.toISOString(),
    modifiedAt: mtime.toISOString(),
  };
}

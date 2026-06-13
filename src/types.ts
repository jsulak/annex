export interface NoteIndex {
  id: string;
  filename: string;
  title: string;
  snippet: string;
  tags: string[];
  links: string[];
  references: ReferenceEntry[];
  createdAt: string;
  modifiedAt: string;
}

export interface ReferenceEntry {
  key: string;
  text: string;
  raw: string;
}

export interface NoteDetail extends NoteIndex {
  body: string;
  etag: string;
}

export interface SemanticHighlight {
  noteId: string;
  from: number;
  to: number;
}

export interface SearchResult extends NoteIndex {
  titleMatches: Array<[number, number]>;    // [offset, length]
  snippetMatches: Array<[number, number]>;  // [offset, length]
  matchType?: 'exact' | 'hybrid' | 'semantic';
  semanticScore?: number;
  semanticSnippet?: string;
  semanticStartOffset?: number;
  semanticEndOffset?: number;
}

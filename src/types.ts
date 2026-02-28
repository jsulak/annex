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

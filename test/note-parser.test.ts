import { describe, test, expect } from 'vitest';
import {
  filenameToId,
  idToCreatedAt,
  extractTitle,
  extractSnippet,
  extractTags,
  extractLinks,
  parseNote,
} from '../server/lib/noteParser.js';

describe('filenameToId', () => {
  test('extracts 12-digit ID', () => {
    expect(filenameToId('202401151432 Sample Note.md')).toBe('202401151432');
  });

  test('extracts 14-digit ID', () => {
    expect(filenameToId('20240115143200 Note.md')).toBe('20240115143200');
  });

  test('returns empty for non-digit filename', () => {
    expect(filenameToId('My Note.md')).toBe('');
  });

  test('returns empty for too-short digit prefix', () => {
    expect(filenameToId('2024 Short.md')).toBe('');
  });

  test('truncates digits beyond 14', () => {
    expect(filenameToId('123456789012345 TooLong.md')).toBe('12345678901234');
  });

  test('handles filename with no space after digits', () => {
    expect(filenameToId('202401151432.md')).toBe('202401151432');
  });

  test('handles bare digits filename', () => {
    expect(filenameToId('202401151432')).toBe('202401151432');
  });
});

describe('idToCreatedAt', () => {
  test('converts 12-digit ID to ISO date', () => {
    const result = idToCreatedAt('202401151432');
    // idToCreatedAt parses as local time, then toISOString() returns UTC
    const expected = new Date('2024-01-15T14:32:00').toISOString();
    expect(result).toBe(expected);
  });

  test('converts 14-digit ID to ISO date with seconds', () => {
    const result = idToCreatedAt('20240115143230');
    const expected = new Date('2024-01-15T14:32:30').toISOString();
    expect(result).toBe(expected);
  });

  test('returns empty for ID shorter than 12 digits', () => {
    expect(idToCreatedAt('20240115')).toBe('');
  });

  test('returns empty for empty string', () => {
    expect(idToCreatedAt('')).toBe('');
  });
});

describe('extractTitle', () => {
  test('extracts title from first heading', () => {
    expect(extractTitle('# My Title\n\nBody', 'id Note.md')).toBe('My Title');
  });

  test('extracts title from heading with extra spaces', () => {
    expect(extractTitle('#   Spaced Title  \n\nBody', 'id.md')).toBe('Spaced Title');
  });

  test('picks first heading even if not on line 1', () => {
    expect(extractTitle('\n\n# Later Heading\n\nBody', 'id.md')).toBe('Later Heading');
  });

  test('ignores ## subheadings for title', () => {
    expect(extractTitle('## Not Title\n\n# Real Title', 'id.md')).toBe('Real Title');
  });

  test('falls back to filename when no heading', () => {
    expect(extractTitle('Just text, no heading.', '202401151432 My Note.md')).toBe('My Note');
  });

  test('falls back to filename itself for bare digits', () => {
    expect(extractTitle('No heading', '202401151432.md')).toBe('202401151432.md');
  });

  test('strips ID prefix and .md from fallback', () => {
    expect(extractTitle('', '20240115143200 Something.md')).toBe('Something');
  });

  test('handles heading with markdown formatting', () => {
    expect(extractTitle('# **Bold** Title\nBody', 'id.md')).toBe('**Bold** Title');
  });
});

describe('extractSnippet', () => {
  test('returns text after heading', () => {
    const snippet = extractSnippet('# Title\n\nFirst paragraph here.');
    expect(snippet).toBe('First paragraph here.');
  });

  test('skips blank lines after heading', () => {
    const snippet = extractSnippet('# Title\n\n\n\nActual content.');
    expect(snippet).toBe('Actual content.');
  });

  test('returns beginning if no heading', () => {
    const snippet = extractSnippet('Just plain text here.');
    expect(snippet).toBe('Just plain text here.');
  });

  test('truncates to 120 characters', () => {
    const long = '# Title\n\n' + 'x'.repeat(200);
    expect(extractSnippet(long).length).toBe(120);
  });

  test('handles empty body', () => {
    expect(extractSnippet('')).toBe('');
  });

  test('handles body with only heading', () => {
    expect(extractSnippet('# Just a Heading')).toBe('');
  });
});

describe('extractTags', () => {
  test('extracts simple tags', () => {
    const tags = extractTags('text #alpha #beta more');
    expect(tags).toContain('alpha');
    expect(tags).toContain('beta');
  });

  test('tags are lowercased', () => {
    expect(extractTags('#CamelCase')).toContain('camelcase');
  });

  test('supports hyphenated tags', () => {
    expect(extractTags('#my-tag')).toContain('my-tag');
  });

  test('supports underscore tags', () => {
    expect(extractTags('#my_tag')).toContain('my_tag');
  });

  test('deduplicates tags', () => {
    const tags = extractTags('#same #same #same');
    expect(tags.length).toBe(1);
  });

  test('excludes heading markers', () => {
    const tags = extractTags('## heading\n### subheading\n#real-tag');
    expect(tags).not.toContain('heading');
    expect(tags).not.toContain('subheading');
    // ## is not a tag because it's followed by a space then word, but the regex requires #word preceded by whitespace or start
    // Actually ## heading: the # is followed by # not a letter, so it won't match
  });

  test('tag must start with a letter', () => {
    expect(extractTags('#123notag')).toEqual([]);
  });

  test('extracts tag at start of line', () => {
    expect(extractTags('#starting')).toContain('starting');
  });

  test('returns empty for no tags', () => {
    expect(extractTags('No tags here.')).toEqual([]);
  });

  test('tag in middle of line', () => {
    const tags = extractTags('See #inline tag');
    expect(tags).toContain('inline');
  });

  test('tag not extracted from inside a word', () => {
    // e.g. email@#tag — the # is preceded by @, not whitespace
    // But actually the regex uses (?:^|\s), so @ won't match
    const tags = extractTags('code#notag');
    expect(tags).not.toContain('notag');
  });
});

describe('extractLinks', () => {
  test('extracts wiki-links', () => {
    const links = extractLinks('See [[target1]] and [[target2]].');
    expect(links).toContain('target1');
    expect(links).toContain('target2');
  });

  test('trims whitespace from link targets', () => {
    expect(extractLinks('[[ spaced ]]')).toContain('spaced');
  });

  test('deduplicates links', () => {
    const links = extractLinks('[[same]] and [[same]]');
    expect(links.length).toBe(1);
  });

  test('returns empty for no links', () => {
    expect(extractLinks('No links here.')).toEqual([]);
  });

  test('handles numeric ID links', () => {
    expect(extractLinks('[[202401151432]]')).toContain('202401151432');
  });

  test('handles link with spaces', () => {
    expect(extractLinks('[[My Long Title]]')).toContain('My Long Title');
  });

  test('does not match single brackets', () => {
    expect(extractLinks('[not a link]')).toEqual([]);
  });

  test('does not match empty brackets', () => {
    // [[]] has empty content — the regex [^\]]+ requires at least 1 char
    expect(extractLinks('[[]]')).toEqual([]);
  });
});

describe('parseNote', () => {
  test('produces complete NoteIndex', () => {
    const note = parseNote(
      '202401151432 Test.md',
      '# Test Note\n\nBody with #tag and [[link]].',
      new Date('2024-06-01T10:00:00Z'),
    );
    expect(note.id).toBe('202401151432');
    expect(note.filename).toBe('202401151432 Test.md');
    expect(note.title).toBe('Test Note');
    expect(note.tags).toContain('tag');
    expect(note.links).toContain('link');
    expect(note.createdAt).toContain('2024-01-15');
    expect(note.modifiedAt).toBe('2024-06-01T10:00:00.000Z');
    expect(note.snippet).toBe('Body with #tag and [[link]].');
  });

  test('uses mtime for createdAt when no ID', () => {
    const mtime = new Date('2024-06-01T10:00:00Z');
    const note = parseNote('no-id-file.md', '# Test', mtime);
    expect(note.createdAt).toBe(mtime.toISOString());
  });
});

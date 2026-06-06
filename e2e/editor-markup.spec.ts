import { test, expect, type APIRequestContext, type Page } from './fixtures';

test.describe.configure({ mode: 'serial' });

let idCounter = 0;
function nextId(): string {
  idCounter++;
  return `20990202${String(idCounter).padStart(4, '0')}`;
}

async function csrfHeaders(request: APIRequestContext) {
  const res = await request.get('/api/v1/auth/csrf-token');
  expect(res.ok()).toBe(true);
  const data = await res.json() as { token: string };
  return { 'x-csrf-token': data.token };
}

async function setHideMarkdownMarkup(request: APIRequestContext, enabled: boolean) {
  const res = await request.put('/api/v1/config', {
    headers: await csrfHeaders(request),
    data: { settings: { hideMarkdownMarkup: enabled } },
  });
  expect(res.ok()).toBe(true);
}

async function createNote(request: APIRequestContext, id: string, body: string) {
  const res = await request.put(`/api/v1/notes/${id}`, {
    headers: await csrfHeaders(request),
    data: { body, filename: `${id} Editor Markup.md` },
  });
  expect(res.ok()).toBe(true);
}

async function openNote(page: Page, id: string) {
  await page.goto(`/note/${id}`);
  await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 10_000 });
}

test.afterEach(async ({ request }) => {
  await setHideMarkdownMarkup(request, false);
});

test.describe('org-like editor formatting', () => {
  test('hides bold markers, reveals them while editing, and shows raw Markdown when disabled', async ({ page, request }) => {
    const id = nextId();
    await setHideMarkdownMarkup(request, true);
    await createNote(request, id, 'intro **bold** tail');
    await openNote(page, id);

    const content = page.locator('.cm-content');
    await expect(content).toContainText('intro bold tail');
    await expect(content).not.toContainText('**bold**');

    await content.click({ position: { x: 6, y: 8 } });
    await page.keyboard.press('End');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('ArrowLeft');
    }
    await expect(content).toContainText('**bold**');

    await page.locator('button[title="Settings (Cmd+,)"]').click();
    await page.getByLabel('Hide Markdown formatting markers').uncheck();
    await expect(content).toContainText('**bold**');
  });

  test('keeps the last heading marker visible when heading markup is hidden', async ({ page, request }) => {
    const id = nextId();
    await setHideMarkdownMarkup(request, true);
    await createNote(request, id, '### Heading\nBody');
    await openNote(page, id);

    await page.locator('.cm-line').nth(1).click();
    const headingLine = page.locator('.cm-line').first();
    await expect(headingLine).toContainText('# Heading');
    await expect(headingLine).not.toContainText('### Heading');
  });

  test('indents heading body text and preserves wrapped list hanging indent', async ({ page, request }) => {
    const id = nextId();
    const longListText = 'This is a long list item under a heading that should wrap onto another visual line while keeping the wrapped text aligned with the item text instead of the marker.';
    await setHideMarkdownMarkup(request, true);
    await createNote(request, id, `# Heading\nBody text under heading\n- ${longListText}`);
    await page.setViewportSize({ width: 720, height: 700 });
    await openNote(page, id);

    const measurements = await page.evaluate(() => {
      function rectsForLineText(lineIndex: number, startOffset: number) {
        const line = document.querySelectorAll('.cm-line')[lineIndex];
        if (!line) return [];

        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let currentOffset = 0;
        let startNode: Text | null = null;
        let startNodeOffset = 0;
        let lastNode: Text | null = null;
        let lastNodeLength = 0;

        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          const nextOffset = currentOffset + node.data.length;
          if (!startNode && startOffset <= nextOffset) {
            startNode = node;
            startNodeOffset = Math.max(0, startOffset - currentOffset);
          }
          lastNode = node;
          lastNodeLength = node.data.length;
          currentOffset = nextOffset;
        }

        if (!startNode || !lastNode) return [];
        const range = document.createRange();
        range.setStart(startNode, startNodeOffset);
        range.setEnd(lastNode, lastNodeLength);
        return Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => ({ left: rect.left, top: rect.top }));
      }

      return {
        heading: rectsForLineText(0, 0),
        body: rectsForLineText(1, 0),
        listText: rectsForLineText(2, 2),
      };
    });

    expect(measurements.heading.length).toBeGreaterThan(0);
    expect(measurements.body.length).toBeGreaterThan(0);
    expect(measurements.body[0].left - measurements.heading[0].left).toBeGreaterThan(8);
    expect(measurements.listText.length).toBeGreaterThan(1);
    expect(Math.abs(measurements.listText[0].left - measurements.listText[1].left)).toBeLessThan(3);
  });
});

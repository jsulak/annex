import { test, expect } from './fixtures';

const examples = [
  { name: 'link closing parenthesis', markdown: '[chat](codex://threads/example \n)' },
  { name: 'image alt text', markdown: '![first line\nsecond line](media/example.png)' },
  { name: 'image destination', markdown: '![example](\nmedia/example.png)' },
  { name: 'link destination', markdown: '[example](\nhttps://example.com)' },
  { name: 'link title', markdown: '[example](https://example.com\n"Example title")' },
];

for (const [index, example] of examples.entries()) {
  test(`opens and edits a note with multiline ${example.name}`, async ({ page, request }) => {
    const id = `20991107000${index}`;
    const body = `Introduction\n\n${example.markdown}\n\nEnd of note`;
    const created = await request.put(`/api/v1/notes/${id}`, {
      data: { body, filename: `${id} Multiline formatting.md` },
    });
    expect(created.ok()).toBe(true);

    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });

    try {
      await page.goto(`/note/${id}`);
      const content = page.locator('.cm-content');
      await expect(content).toBeVisible();
      expect(errors).toEqual([]);
      await expect(content).toContainText('End of note');

      await content.click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.type(' edited');

      await expect.poll(async () => {
        const response = await request.get(`/api/v1/notes/${id}`);
        return (await response.json()).body;
      }).toBe(`${body} edited`);
      expect(errors).toEqual([]);
    } finally {
      await request.delete(`/api/v1/notes/${id}`);
    }
  });
}

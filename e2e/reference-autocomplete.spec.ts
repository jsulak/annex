import { test, expect } from './fixtures';

test.describe.serial('Reference autocomplete', () => {
  const sourceId = '209901030000';
  const definitionTargetId = '209901030001';
  const citationTargetId = '209901030002';
  const backlinksTargetId = '209901030003';
  const referenceLine = '[#drucker1967]: Peter Drucker (1967): _The Effective Executive_, Harper Business.';

  test.beforeAll(async ({ request }) => {
    await request.put(`/api/v1/notes/${sourceId}`, {
      data: { body: `# Reference Source\n\n${referenceLine}` },
    });
    await request.put(`/api/v1/notes/${definitionTargetId}`, {
      data: { body: '# Definition Target\n\n' },
    });
    await request.put(`/api/v1/notes/${citationTargetId}`, {
      data: { body: '# Citation Target\n\nBody.\n\n## References\n' },
    });
    await request.put(`/api/v1/notes/${backlinksTargetId}`, {
      data: { body: `# Backlinks Target\n\nBody.\n\nBacklinks: [[${backlinksTargetId}]]\n` },
    });
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/v1/notes/${sourceId}`);
    await request.delete(`/api/v1/notes/${definitionTargetId}`);
    await request.delete(`/api/v1/notes/${citationTargetId}`);
    await request.delete(`/api/v1/notes/${backlinksTargetId}`);
  });

  test('completes a full reference definition line', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#note-list').getByText(definitionTargetId).click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    await page.locator('.cm-content').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('[#dru');

    const autocomplete = page.locator('.cm-tooltip-autocomplete');
    await expect(autocomplete).toBeVisible({ timeout: 5_000 });
    await autocomplete.locator('.cm-completionLabel', { hasText: '#drucker1967' }).first().click();

    await expect(page.locator('.cm-content')).toContainText(referenceLine);
  });

  test('completes a page citation and auto-adds the missing reference once', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#note-list').getByText(citationTargetId).click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    await page.getByText('Body.').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('[54][#dru');

    let autocomplete = page.locator('.cm-tooltip-autocomplete');
    await expect(autocomplete).toBeVisible({ timeout: 5_000 });
    await autocomplete.locator('.cm-completionLabel', { hasText: '#drucker1967' }).first().click();

    await expect(page.locator('.cm-content')).toContainText('[54][#drucker1967]');
    await expect(page.locator('.cm-content')).toContainText(referenceLine);
    const afterFirstCitation = await page.locator('.cm-content').textContent();
    const headingIndex = afterFirstCitation?.indexOf('## References') ?? -1;
    const referenceIndex = afterFirstCitation?.indexOf(referenceLine) ?? -1;
    expect(headingIndex).toBeGreaterThanOrEqual(0);
    expect(referenceIndex).toBeGreaterThan(headingIndex);

    await page.getByText('[54][#drucker1967]').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('[55][#dru');

    autocomplete = page.locator('.cm-tooltip-autocomplete');
    await expect(autocomplete).toBeVisible({ timeout: 5_000 });
    await autocomplete.locator('.cm-completionLabel', { hasText: '#drucker1967' }).first().click();

    const content = await page.locator('.cm-content').textContent();
    expect(content).toContain('[55][#drucker1967]');
    expect(content?.match(/\[#drucker1967\]: Peter Drucker/g) ?? []).toHaveLength(1);
  });

  test('auto-adds a missing reference before the Backlinks footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-input')).toBeVisible({ timeout: 10_000 });

    await page.locator('#note-list').getByText(backlinksTargetId).click();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    await page.getByText('Body.').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('[54][#dru');

    const autocomplete = page.locator('.cm-tooltip-autocomplete');
    await expect(autocomplete).toBeVisible({ timeout: 5_000 });
    await autocomplete.locator('.cm-completionLabel', { hasText: '#drucker1967' }).first().click();

    const editorText = await page.locator('.cm-content').evaluate((el) =>
      Array.from(el.querySelectorAll('.cm-line'))
        .map((line) => line.textContent ?? '')
        .join('\n'),
    );
    const referenceIndex = editorText.indexOf(referenceLine);
    const backlinksLine = `Backlinks: [[${backlinksTargetId}]]`;
    const backlinksIndex = editorText.indexOf(backlinksLine);

    expect(editorText).toContain('[54][#drucker1967]');
    expect(referenceIndex).toBeGreaterThanOrEqual(0);
    expect(backlinksIndex).toBeGreaterThan(referenceIndex);
    expect(editorText).toContain(`${referenceLine}\n\n${backlinksLine}`);
    expect(editorText.trimEnd().endsWith(backlinksLine)).toBe(true);
  });
});

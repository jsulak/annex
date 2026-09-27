import { test, expect, type Page } from './fixtures';

const id = '209909270001';
const url = `/api/v1/notes/${id}`;
const original = 'A note with the cursor near its end.';

async function cursorOffset(page: Page) {
  return page.locator('.cm-content').evaluate(content => {
    const selection = window.getSelection();
    if (!selection?.focusNode || !content.contains(selection.focusNode)) return -1;
    const range = document.createRange();
    range.setStart(content, 0);
    range.setEnd(selection.focusNode, selection.focusOffset);
    return range.toString().length;
  });
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.put(url, { data: { body: original } })).ok()).toBe(true);
  await page.goto(`/note/${id}`);
  await expect(page.locator('.cm-content')).toHaveText(original);
  await page.locator('.cm-content').click();
  await page.keyboard.press('End');
  await expect.poll(() => cursorOffset(page)).toBe(original.length);
});

test.afterEach(async ({ page, request }) => {
  await page.close();
  await request.delete(url);
});

test('typing across an in-flight own save preserves text and cursor', async ({ page, request }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const saving = new Promise<void>(resolve => { started = resolve; });
  let first = true;
  await page.route(`**${url}`, async route => {
    if (route.request().method() === 'PUT' && first) {
      first = false;
      const response = await route.fetch();
      started();
      await gate;
      await route.fulfill({ response });
    } else {
      await route.continue();
    }
  });
  try {
    await page.keyboard.type(' FIRST');
    await saving;
    await page.keyboard.type(' SECOND');
    release();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(page.locator('.cm-content')).toHaveText(original + ' FIRST SECOND');
    expect(await cursorOffset(page)).toBe((original + ' FIRST SECOND').length);
    expect((await (await request.get(url)).json()).body).toBe(original + ' FIRST SECOND');
  } finally {
    release();
  }
});

test('a same-note background update preserves the cursor', async ({ page, request }) => {
  const remote = original + ' REMOTE';
  expect((await request.put(url, { data: { body: remote } })).ok()).toBe(true);
  await expect(page.locator('.cm-content')).toHaveText(remote);
  expect(await cursorOffset(page)).toBe(original.length);
  await page.keyboard.type('NEXT');
  await expect(page.locator('.cm-content')).toHaveText(original + 'NEXT REMOTE');
});

test('typing during a background reload is preserved and shows a conflict', async ({ page, request }) => {
  const held = await holdReload(page);
  const remote = original + ' REMOTE';
  try {
    expect((await request.put(url, { data: { body: remote } })).ok()).toBe(true);
    // The event starts one GET for the list and another for the open editor.
    await held.wait();
    await page.keyboard.type(' LOCAL');
    await expect(page.locator('.cm-content')).toHaveText(original + ' LOCAL');
    expect(await cursorOffset(page)).toBe((original + ' LOCAL').length);
    await held.finish();
    await expect(page.getByText('This note was changed externally')).toBeVisible();
    await expect(page.locator('.cm-content')).toHaveText(original + ' LOCAL');
    expect(await cursorOffset(page)).toBe((original + ' LOCAL').length);
  } finally {
    held.release();
  }
});

test('background edits before a selection preserve the selected text', async ({ page, request }) => {
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('end.');
  const remote = 'REMOTE ' + original;
  expect((await request.put(url, { data: { body: remote } })).ok()).toBe(true);
  await expect(page.locator('.cm-content')).toHaveText(remote);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('end.');
  await page.keyboard.type('replacement');
  await expect(page.locator('.cm-content')).toHaveText('REMOTE ' + original.slice(0, -4) + 'replacement');
});

test('undo after a background update removes only the local edit', async ({ page, request }) => {
  await page.keyboard.type(' LOCAL');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const remote = 'REMOTE ' + original + ' LOCAL';
  expect((await request.put(url, { data: { body: remote } })).ok()).toBe(true);
  await expect(page.locator('.cm-content')).toHaveText(remote);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.cm-content')).toHaveText('REMOTE ' + original);
});

async function holdReload(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  let fetched = 0;
  let completed = 0;
  await page.route(`**${url}`, async route => {
    if (route.request().method() !== 'GET' || reads >= 2) return route.fallback();
    reads++;
    const response = await route.fetch();
    fetched++;
    await gate;
    await route.fulfill({ response });
    completed++;
  });
  return {
    wait: () => expect.poll(() => fetched).toBe(2),
    release,
    finish: async () => {
      release();
      await expect.poll(() => completed).toBe(2);
      // Let fetch handlers and React effects finish before asserting no stale update.
      await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
    },
  };
}

test('a delayed background reload cannot replace a different selected note', async ({ page, request }) => {
  const held = await holdReload(page);
  try {
    expect((await request.put(url, { data: { body: original + ' REMOTE' } })).ok()).toBe(true);
    await held.wait();
    await page.locator('#note-list').getByText('202401151433 Second Note').click();
    await expect(page.locator('.cm-content')).toContainText('Second Note');
    const second = await page.locator('.cm-content').textContent();
    await held.finish();
    await expect(page.locator('.cm-content')).toHaveText(second!);
    await expect(page.getByText('This note was changed externally')).not.toBeVisible();
  } finally {
    held.release();
  }
});

test('switching notes does not carry undo history into the new note', async ({ page }) => {
  await page.keyboard.type(' LOCAL');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.locator('#note-list').getByText('202401151433 Second Note').click();
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('Second Note');
  const second = await editor.textContent();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).toHaveText(second!);
});

test('a delayed background response cannot overwrite a newer successful save', async ({ page, request }) => {
  let releaseSave!: () => void;
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  let started!: () => void;
  const saving = new Promise<void>(resolve => { started = resolve; });
  let first = true;
  await page.route(`**${url}`, async route => {
    if (route.request().method() !== 'PUT' || !first) return route.continue();
    first = false;
    const response = await route.fetch();
    started();
    await saveGate;
    await route.fulfill({ response });
  });
  const ownListUpdate = page.waitForResponse(response => response.url().endsWith(url)
    && response.request().method() === 'GET');
  await page.keyboard.type(' FIRST');
  await saving;
  await ownListUpdate;
  const held = await holdReload(page);
  try {
    // A rename while the save response is delayed triggers a reload of the saved text.
    expect((await request.post(`${url}/rename`, {
      data: { newFilename: `${id} Renamed cursor test.md` },
    })).ok()).toBe(true);
    await held.wait();
    releaseSave();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.keyboard.type(' SECOND');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await held.finish();
    await expect(page.locator('.cm-content')).toHaveText(original + ' FIRST SECOND');
    expect(await cursorOffset(page)).toBe((original + ' FIRST SECOND').length);
    await expect(page.getByText('This note was changed externally')).not.toBeVisible();
  } finally {
    releaseSave();
    held.release();
  }
});

test('an older reload cannot undo a newer background update', async ({ page, request }) => {
  const held = await holdReload(page);
  try {
    expect((await request.put(url, { data: { body: original + ' OLD' } })).ok()).toBe(true);
    await held.wait();
    expect((await request.put(url, { data: { body: original + ' NEW' } })).ok()).toBe(true);
    await expect(page.locator('.cm-content')).toHaveText(original + ' NEW');
    await held.finish();
    await expect(page.locator('.cm-content')).toHaveText(original + ' NEW');
  } finally {
    held.release();
  }
});

test('a newer background update is still loaded when an earlier save finishes', async ({ page, request }) => {
  let releaseSave!: () => void;
  const gate = new Promise<void>(resolve => { releaseSave = resolve; });
  let started!: () => void;
  const saving = new Promise<void>(resolve => { started = resolve; });
  await page.route(`**${url}`, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
  });
  const ownListUpdate = page.waitForResponse(response => response.url().endsWith(url)
    && response.request().method() === 'GET');
  await page.keyboard.type(' LOCAL');
  await saving;
  await ownListUpdate;
  const held = await holdReload(page);
  try {
    const remote = original + ' LOCAL REMOTE';
    expect((await request.put(url, { data: { body: remote } })).ok()).toBe(true);
    await held.wait();
    releaseSave();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await held.finish();
    await expect(page.locator('.cm-content')).toHaveText(remote);
    expect(await cursorOffset(page)).toBe((original + ' LOCAL').length);
    await expect(page.getByText('This note was changed externally')).not.toBeVisible();
  } finally {
    releaseSave();
    held.release();
  }
});

for (const choice of ['Use server version', 'Keep my changes']) {
  test(`resolving a reload conflict with "${choice}" clears the pending autosave`, async ({ page, request }) => {
    const held = await holdReload(page);
    try {
      const remote = original + ' REMOTE';
      expect((await request.put(url, { data: { body: remote } })).ok()).toBe(true);
      await held.wait();
      await page.keyboard.type(' LOCAL');
      await held.finish();
      await expect(page.getByText('This note was changed externally')).toBeVisible();
      await page.getByRole('button', { name: choice, exact: true }).click();
      await expect(page.getByText('This note was changed externally')).not.toBeVisible();
      const expected = choice === 'Keep my changes' ? original + ' LOCAL' : remote;
      await expect(page.locator('.cm-content')).toHaveText(expected);
      await page.locator('.cm-content').focus();
      await page.keyboard.press('ControlOrMeta+s');
      // Cross the configured 500 ms autosave delay to catch a retained queued save.
      await page.waitForTimeout(1000);
      expect((await (await request.get(url)).json()).body).toBe(expected);
    } finally {
      held.release();
    }
  });
}

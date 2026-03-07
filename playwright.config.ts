import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BACKEND_PORT = 3051;
const FRONTEND_PORT = 5199;
const SEED_DIR = path.join(import.meta.dirname, 'e2e', 'fixtures', 'seed-notes');
const MARKER_FILE = path.join(import.meta.dirname, 'e2e', 'fixtures', '.test-notes-dir');

// Create temp dir eagerly so webServer commands can use it.
// Teardown is handled by globalTeardown.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'annex-e2e-'));

const config = {
  passwordHash: '$2b$12$6vrCipuW.vXwiXO1GaUcS.nahAIDZIkpG/aE/YL0zy8QPmvKjOpiO',
  savedSearches: [],
  settings: {
    autoSaveDelay: 500,
    showSnippets: false,
    editorWidth: 680,
    fontSize: 13,
    noteTemplate: '',
    indexExtensions: ['.md'],
    darkMode: 'auto',
  },
};
fs.writeFileSync(path.join(tmpDir, '_annex.json'), JSON.stringify(config, null, 2));

for (const file of fs.readdirSync(SEED_DIR)) {
  fs.copyFileSync(path.join(SEED_DIR, file), path.join(tmpDir, file));
}

// Write marker for teardown
fs.writeFileSync(MARKER_FILE, tmpDir);

export default defineConfig({
  globalTeardown: './e2e/fixtures/teardown-test-env.ts',
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,

  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: [
    {
      command: `NOTES_DIR="${tmpDir}" SESSION_SECRET=e2etestsecrete2etestsecrete2etest PORT=${BACKEND_PORT} npx tsx server/index.ts`,
      port: BACKEND_PORT,
      reuseExistingServer: false,
      timeout: 15_000,
    },
    {
      command: `VITE_API_PORT=${BACKEND_PORT} npx vite --port ${FRONTEND_PORT} --strictPort`,
      port: FRONTEND_PORT,
      reuseExistingServer: false,
      timeout: 15_000,
    },
  ],
});

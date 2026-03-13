# Annex

Single-user self-hosted Zettelkasten web app — a clone of The Archive (zettelkasten.de). Full spec is in SPEC.md — read it before starting any work.

## Stack
- Backend: Node.js 20 + Fastify + TypeScript (run with `tsx`)
- Frontend: React 18 + Vite + CodeMirror 6 + Tailwind CSS + Zustand
- Notes: plain `.md` files on the filesystem — no database
- Auth: bcrypt password + HTTP-only session cookie
- Sync: Syncthing (VPS ↔ Mac) — not needed for local dev
- Production: DigitalOcean VPS, Caddy (HTTPS), PM2 (process manager)

## Local Dev

Terminal 1 — backend (auto-restarts on change):
```
NOTES_DIR=~/Documents/TestNotes SESSION_SECRET=devsecretdevsecretdevsecretdevsecret PORT=3001 npm run dev:server
```

Terminal 2 — frontend (HMR):
```
npm run dev
```

Open: http://localhost:5173
Vite proxies `/api/*` to `http://localhost:3001`

First-time setup (sets password):
```
npm run setup
```

## Key Rules
- `NOTES_DIR` is the canonical data store — never write note data anywhere else
- All file paths must be validated to stay within `NOTES_DIR` (path traversal prevention)
- `_annex.json` and `_trash/` are excluded from the note index
- Syncthing temp files (`*.syncthing`) must be excluded from chokidar and the index
- Session cookie must be `HttpOnly + Secure + SameSite=Strict`
- Never re-fetch the full note list on SSE events — update individual entries only

## Current Tasks
Work through these in order. Do not move to the next task until the current one is verified working. Test each change before marking complete.

- [x] Bug fix - When editing a document, if you go to preview, the text that shows up is the original text, before editing. When you go back to edit view, that "original" text shows up in the editor. If you edit that text, and trigger an auto-save, you can lose previous edits. Create tests, fix. Consider other possible cases and create tests, verify proper behavior, and fix any bugs.
- [x] Bug fix - Link drop down uses first H1 in document as title, not actual document filename. It should use the filename.
- [x] Keyboard shortcuts for text formatting in editor (Cmd+B bold, Cmd+I italic, Cmd+U underline, Cmd+K link)
- [x] Improve new note creation: show a title prompt dialog, name the file from the title, pre-populate template and header, add backlink placeholder at bottom
- [x] Right-click context menu on note list items: Rename, Delete
- [x] Remove the delete button from the toolbar / editor header — deletion is via right-click menu only
- [x] On edit, move the edited note to the top of the note list (sort by last modified, update in real time)
- [x] URL scheme for notes: update the browser URL as the user navigates (e.g. `/note/202401151432`), support browser back/forward button and iPhone swipe gestures for navigation history
- [x] Fix preview — ordered and unordered lists missing numbers and bullets (check CSS, ensure list styles are not reset)
- [x] Fix preview — show a formatted title derived from filename: strip the timestamp ID, convert to sentence case
- [x] Fix preview — standard header material (h1, h2, h3) should render with correct hierarchy and spacing
- [x] Feature - File list does not update if content updated in background and synced. File updates should trigger refresh of file list with latest files and sorting.
- [x] Bugfix - Searching for "a man needs to be needed" does not find a note with "A man needs to be needed" in the plaintext "title" metadata in a document.
- [x] Add an option to increase the line spacing in edit view.
- [ ] When using a keyboard shortcut for text formatting, and you are inside a formatted region, it should toggle the formatting.
- [x] Need to fix the file creation - ask me when you get to it.
- [x] When renaming a file, it disapears from the file list.
- [x] Bugfix: URL scheme does not work for notes with a filename that does not have an id in front of it
- [x] Make block quotes plain text, not italic.
- [x] Update insert hyperlinks to give title as well, for example, if we are linking to the file 202501010101 Test note.md" it should create the link text Test note 202501010101.
- [x] control-n should not create a new file - I want to use keyboard navigation instead
- [x] File list should not scroll left and right on iphone
- [x] iphone editing: does not include autoxorrect, etc and should
- [x] Persist session through service restart


### Production Hardening
- [x] Rate limiting on login and password change endpoints (@fastify/rate-limit)
- [x] Account lockout after N failed login attempts (e.g., 5 failures = 15 min cooldown)
- [x] Graceful shutdown (SIGTERM/SIGINT handler to flush writes, close Fastify cleanly)
- [x] Automated backups (cron snapshot of NOTES_DIR — Syncthing is not a backup)
- [x] Atomic file writes (write to temp file then rename, prevent corruption on crash)
- [x] CSRF protection (token-based, defense in depth beyond SameSite cookie)
- [x] npm audit in CI or pre-deploy check
- [x] Structured log rotation (logrotate config via Ansible for PM2 logs, daily/14-day retention)
- [ ] External uptime monitor (UptimeRobot/Healthchecks.io hitting /api/v1/health) — manual setup required: sign up and monitor https://your-domain/api/v1/health
- [x] Disk space monitoring and alerting (health endpoint reports disk stats; hourly server-side warn log when free < LOW_DISK_WARN_PCT)
- [x] Response compression (@fastify/compress, gzip/brotli)
- [x] Static asset cache headers (long Cache-Control for hashed Vite assets)
- [x] PM2 config hardening (max_restarts, restart_delay, max_memory_restart, kill_timeout)
- [x] Post-deploy smoke test (Ansible asserts health response ok + public URL check when domain set)
- [x] Implement Snyk — using GitHub integration (snyk.io → connect repo); monitors dependencies, opens auto-fix PRs on new CVEs


## Current Status
[ Update this section as features are completed ]

- [x] Server scaffold (Fastify, NOTES_DIR env, static serving, health check)
- [x] Auth (setup CLI, login route, bcrypt, session cookie, route protection)
- [x] File store + Notes API (CRUD + rename, path safety)
- [x] Frontend scaffold (login page, two-panel layout, theme CSS vars, Vite proxy)
- [x] Note list + editor (fetch list, CodeMirror on click)
- [x] Save (auto-save debounced + Cmd+S)
- [x] Search (Flexsearch index, /search endpoint, omnibar highlighting)
- [x] New / delete notes (ID gen, trash deletion, filename-from-first-line)
- [x] Wiki-links + tags (parser, editor autocomplete, clickable in preview, clickable tags in editor)
- [x] Preview mode (marked + DOMPurify, Edit/Preview/Split toggle)
- [x] SSE file watcher (chokidar, /events endpoint, useSSE hook)
- [x] Navigation (back/forward, Quick Open)
- [x] Conflict detection (etag, If-Match, 409 handling)
- [x] Tags modal + Backlinks panel
- [x] Settings panel (all options via PUT /config, live font size)
- [x] Delete button in editor pane + fixed deletion (apiFetch Content-Type fix)
- [x] Wiki-link autocomplete inserts note ID instead of title
- [x] Faded markdown formatting marks (##, *, _) with darker list/quote marks
- [x] Link decorations (inline links collapse with clickable text + expand icon, bare URLs clickable, hover tooltip)
- [x] Preview edit integrity (liveContent as single source of truth, ref-based sync)
- [x] Link autocomplete uses filename instead of H1 title
- [x] Text formatting shortcuts (Cmd+B/I/U/K)
- [x] New note dialog (title prompt, template with backlink placeholder)
- [x] Right-click context menu (Rename, Delete) on note list
- [x] Delete button removed from toolbar (context menu only)
- [x] Sort by last modified (edited notes move to top)
- [x] URL scheme for notes (/note/:id, browser back/forward, popstate)
- [x] Preview list styles (bullets and numbers restored)
- [x] Preview title from filename (timestamp stripped, sentence case)
- [x] Preview heading hierarchy (h1-h6 with distinct sizes and borders)
- [x] Background file sync (watcher detects external changes, SSE updates, note list refresh)
- [x] Case-insensitive search fix (Flexsearch limit increased for common-word queries)
- [ ] Asset serving (GET /assets/:filename)
- [x] Add linting / code analysis
- [x] Lightweight service monitoring
- [x] Deploy tooling (Ansible provision + deploy playbooks, ecosystem.config.cjs, Caddyfile template)
- [x] Syncthing integration (Ansible provisioning, backend proxy API, Settings panel UI)
- [x] Polish (keyboard help overlay, error states, responsive layout)
- [x] Rate limiting on auth endpoints (login + change-password)
- [x] Graceful shutdown (SIGTERM/SIGINT → close Fastify, stop watcher)
- [x] Atomic file writes (temp file + rename)
- [x] PM2 config hardening (max_memory_restart, kill_timeout)
- [x] Response compression (gzip/brotli via @fastify/compress)
- [x] Static asset cache headers (1yr for hashed assets, no-cache for index.html)
- [x] npm audit --audit-level=high in deploy playbook (blocks deploy on high/critical)


## Testing

Use test-driven development for any new feature or bugfix:
- **Backend**: Write vitest API tests first (`test/*.test.ts`). Run with `npm test`.
- **Frontend**: Write Playwright E2E tests (`e2e/*.spec.ts`) for UI behavior. Run with `npm run test:e2e`.
- Write the failing test, then implement the fix/feature, then verify the test passes.
- Choose the appropriate test level: vitest for API/logic, Playwright for UI interactions.
- **Always run the linter** (`npm run lint`) in addition to tests after making any change. Fix all warnings before considering a task complete.

## Standing Instructions

At the end of every session, update the Current Status checklist in this file to reflect what was completed.

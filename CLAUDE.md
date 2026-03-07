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
- [ ] Saved searches
- [ ] Asset serving (GET /assets/:filename)
- [x] Deploy tooling (Ansible provision + deploy playbooks, ecosystem.config.cjs, Caddyfile template)
- [ ] Polish (keyboard help overlay, error states, responsive layout)

## Testing

Use test-driven development for any new feature or bugfix:
- **Backend**: Write vitest API tests first (`test/*.test.ts`). Run with `npm test`.
- **Frontend**: Write Playwright E2E tests (`e2e/*.spec.ts`) for UI behavior. Run with `npm run test:e2e`.
- Write the failing test, then implement the fix/feature, then verify the test passes.
- Choose the appropriate test level: vitest for API/logic, Playwright for UI interactions.

## Standing Instructions

At the end of every session, update the Current Status checklist in this file to reflect what was completed.

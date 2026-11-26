# Annex

Single-user self-hosted Zettelkasten web app — a clone of The Archive (zettelkasten.de). Full spec is in SPEC.md — read it before starting any work.

## Stack
- Backend: Node.js 24 + Fastify + TypeScript (run with `tsx`)
- Frontend: React 19 + Vite + CodeMirror 6 + Tailwind CSS + Zustand
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
- [x] When using a keyboard shortcut for text formatting, and you are inside a formatted region, it should toggle the formatting.
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

- [x] Implemented private authentication storage at `~/.annex/auth.json` with mode `0600` and an optional `CONFIG_DIR` override. The offline setup command `--migrate-auth` moves the legacy hash and preserves `_annex.json` settings. The server reads only private authentication state, and the migration marker survives loss of the hash file. Verified with synthetic local fixtures. Production cutover remains pending.

- [x] Hardened the live VPS and provisioning on November 26, 2026. Deployed matched-route authorization and disabled anonymous session persistence in `ba06586`. Patched Node and Caddy, rebooted to the updated Debian 12 kernel, verified separate admin access before revoking app sudo, restricted Caddy administration, and enabled rotation and daily update reporting. Aligned Terraform and UFW without a cloud change. Verified 271 API tests, 264 browser checks, HTTPS with synthetic notes through Caddy, post-reboot health and Syncthing, Ansible syntax, and a no-change Terraform plan. Debian 13 and the existing Syncthing v1 migration remain separate.

- [x] Consolidated production work and documentation on `main` (November 26, 2026): deployed dependency/session-store and editor fixes were already on main. Added the security audit history and integration/deployment plans while preserving production release notes. Unfinished Book Capture remains on `feature/book-capture`; this workspace now uses main.

- [x] Audited live VPS security against Terraform and Ansible (November 25, 2026): confirmed public encoded-path authentication bypass using a missing note ID, unrestricted app-user sudo, stale runtime/running kernel, anonymous session growth, missing log rotation, same-disk backups, local Caddy-admin access, and cloud/IaC sync-port drift. Documented evidence, working controls, limitations, and ordered remediation in `SECURITY_AUDIT.md`. No notes, packages, firewall rules, or service configurations changed; remediation remains pending.

- [x] Verified replacement DigitalOcean credential and completed read-only Terraform plan (November 25, 2026): SSH-key read succeeded with HTTP 200. Live plan reports 0 additions, 1 in-place firewall change, and 0 destroys; proposed changes add inbound TCP 22000 and UDP 21027 for Syncthing, retaining ICMP. Droplet has no proposed changes. Nothing applied.

- [x] Diagnosed DigitalOcean credential failure (November 25, 2026): no environment or auto-loaded Terraform variable overrides were present. The literal token in ignored `deploy.sh` was rejected directly with HTTP 401 by account, SSH-key, droplet, and firewall read endpoints. Credential values were withheld; replacement is required before cloud drift verification.

- [x] Reviewed Terraform currency (November 25, 2026): formatting and validation pass; scripts still match the saved Debian 12/512 MiB droplet shape, but saved firewall state lacks the declared Syncthing inbound rules. Live drift plan failed with DigitalOcean HTTP 401, so actual cloud drift is unverified. Local Terraform is 1.5.7/provider 2.79.0; provider lockfile is ignored. No infrastructure changes applied.

- [x] Remediated dependency advisories (November 25, 2026): updated compatible dependency resolutions and patched minimums; full and production-only npm audits both report zero vulnerabilities after clean installation. Adapted the file session store to @fastify/session's conditional-save contract with stale/revoked-session regression coverage. Verified 300 API tests, all 277 Playwright checks, lint, and production build on Node 24.22.3. No VPS deployment performed. See `SECURITY_AUDIT.md` for details.

- [x] Audited checkout dependencies (November 25, 2026): fresh npm scans found 23 affected entries overall (2 critical, 5 high) and 9 production entries (0 critical, 2 high). Documented package paths, exposure conditions, update targets, extraneous installed packages, and the local Node version mismatch in `SECURITY_AUDIT.md`. Dependency upgrades and VPS rescanning were not performed.

- [x] Completed live VPS version and update audit (November 7, 2026). Recorded the deployed dependency and global tool advisory scans, Debian LTS and kernel reboot status, third-party update gaps, and effective SSH, firewall, and sudo settings in `SECURITY_AUDIT.md`. The comparison initially exhausted VPS memory and triggered an automatic Annex restart, after which health was verified and analysis moved locally.

- [x] Released the focused multiline Markdown editor crash fix from `main` as `ada7b5d` (November 7, 2026). Verified 13 production-branch browser checks, lint, build, deployed public asset hashes, and the affected note loading in Safari with an empty JavaScript console.

- [x] Audited the application and deployment configuration (November 2026). Reproduced unauthenticated note reads and writes through local HTTPS Caddy, confirmed deployment would copy the private wrapper, and identified a legacy sudo grant that can persist on upgraded hosts. Recorded findings, checks, and remediation in `SECURITY_AUDIT.md`. Live VPS follow-up is recorded in the November 7 section of `SECURITY_AUDIT.md`. Security remediation remains pending.

- [x] Planned browser access to Codex on the Annex VPS (October 2026): `docs/workbench-deployment-plan.md` uses the existing Terraform, Ansible provisioning, Makefile, and `deploy.sh` methodology for the workbench/auth subdomains, Caddy and Authelia MFA, ttyd and tmux persistence, shared note permissions, resource checks, acceptance gates, and rollback. Live VPS inspection, implementation, and deployment remain pending.

- [x] Planned ChatGPT web access to the VPS note store (September 2026): `docs/chatgpt-annex-integration-plan.md` starts with a no-code ChatGPT Work browser pilot, then defines MCP tools, OAuth, revision checks, deployment, and acceptance gates if a dedicated integration is needed. Pilot and implementation remain pending.

- [x] Moved the standalone PDF library documentation to `~/src/pdf-library/` (September 2026), with updated document links. The directory contains `SPEC.md`, `IMPLEMENTATION_PLAN.md`, and `EVALUATION.md`; Git repository initialization, implementation, and deployment have not started.

- [x] Specified the standalone PDF library (September 2026): `../pdf-library/SPEC.md` defines requirements, portable identity/metadata, revision-consistent viewing, annotation saves, Syncthing conflicts, APIs, operations, and acceptance criteria. `../pdf-library/IMPLEMENTATION_PLAN.md` sequences feasibility gates through a real-library pilot for a separate repository. Implementation and deployment have not started.

- [x] Evaluated standalone PDF library options (September 2026): documented PdfDing versus a custom PDF.js application in `../pdf-library/EVALUATION.md`. Verified source-level metadata/page-link support, consumption-folder limitations, and a client save-failure indication issue. Recommended a standalone application for an Annex-style Syncthing folder workflow; no PDF library implementation or deployment yet.

- [x] Deployed dependency security release `91619c6` (November 25, 2026) from the production branch, excluding unfinished Book Capture. Verified 270 API tests, 264 browser checks, lint, build, deployed manifest/HTML/asset hashes, internal and public HTTPS health, normal unauthenticated API rejection, and zero production npm advisories. Previous app and dependencies retained at `/home/annex/.annex-deploy/rollback-91619c6`. Node remains 24.20.0; infrastructure hardening was outside this release.

- [x] Prepared focused dependency security release (November 25, 2026): ported dependency updates and session-store conditional-save support from `420e2aa`, excluding unfinished Book Capture code and its sharp dependency. Clean install and npm audit report zero vulnerabilities; 270 API tests, lint, and production build pass on Node 24.22.3. Deployment verification will be recorded after release.

- [x] Fixed editor crashes when notes contain multiline link destinations, titles, or image Markdown (November 2026). Multiline constructs retain editable source text, and five browser regressions verify opening, editing, and saving without JavaScript errors. Verified 13 production-branch browser checks, lint, and production build. Released as `ada7b5d` on `main` and deployed to https://annex.boxkitemachine.net. Verified hashes for 123 uploaded public assets, the public entry page and fixed bundle, healthy service after restart, and the affected note loading in Safari with an empty JavaScript console. Previous entry page and assets retained for rollback.

- [x] Fixed editor cursor jumps during background sync: incremental same-note updates preserve selection and undo history; refresh responses recheck current edits and ignore stale results. Conflicts cancel queued saves, and edits made during a save remain pending. Includes 12 browser regressions. Verified 51 production-branch Playwright checks, lint, production build, and npm audit (zero vulnerabilities). Released as `d6ed21f` on `main` and deployed to https://annex.boxkitemachine.net independently of the unreleased Book Capture branch. Verified all 116 uploaded files, public page/bundle hashes, healthy service after restart, and browser login rendering without JavaScript errors; previous entry page and assets retained for rollback.

[ Update this section as features are completed ]

- [x] Updated dependencies and transitive security fixes (September 2026), aligned development/provisioning with Node.js 24 LTS, migrated Fastify static headers and Vite types. TypeScript held at 6.0 for typescript-eslint compatibility. Verified build, lint, 269 API tests, production static-serving smoke, and browser suite (246/247 initially; dialog focus timing corrected and all 6 dialog/setup tests passed on rerun); npm audit reports zero vulnerabilities.

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
- [x] Org-like editor formatting setting (hide Markdown markers, heading body indent)
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
- [x] Tag search filters by parsed note tags rather than matching untagged body text
- [x] Asset serving (GET /assets/:filename)
- [x] Reference/bibliography autocomplete (reference definitions + page citations)
- [x] Reference-key search and combined tag/reference search autocomplete
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
- [x] Security audit high-severity remediation (block SVG serving/uploads, remove app-user passwordless sudo)
- [x] Security audit medium-severity remediation (restrict assets to media/, invalidate all sessions on password change)
- [x] `_annex.json` config cleanup (remove vestigial settings, prune stale keys, wire retained settings)


## Testing

Use test-driven development for any new feature or bugfix:
- **Backend**: Write vitest API tests first (`test/*.test.ts`). Run with `npm test`.
- **Frontend**: Write Playwright E2E tests (`e2e/*.spec.ts`) for UI behavior. Run with `npm run test:e2e`.
- Write the failing test, then implement the fix/feature, then verify the test passes.
- Choose the appropriate test level: vitest for API/logic, Playwright for UI interactions.
- **Always run the linter** (`npm run lint`) in addition to tests after making any change. Fix all warnings before considering a task complete.

## Standing Instructions

At the end of every session, update the Current Status checklist in this file to reflect what was completed.

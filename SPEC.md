# ZettelWeb — Application Specification
**A web-based clone of The Archive (zettelkasten.de)**

---

## 1. Overview

ZettelWeb is a single-user, self-hosted web application that replicates the core functionality of The Archive (macOS). It runs on a Linux VPS and is accessible from any machine via a browser after authenticating. Notes are stored as plain Markdown files in a directory on the VPS, which is kept in sync with your Mac (and from there to iCloud/iPhone/iPad) via Syncthing. The server exposes a small REST API for reading and writing files; the React frontend talks only to that API.

---

## 2. Design Philosophy

- **Plain text first.** Notes are `.md` files. No proprietary database. No lock-in. Files remain readable by The Archive, nvALT, or any text editor at any time.
- **The folder is the truth.** The server reads from and writes to the filesystem on every action. No shadow database.
- **Speed over features.** Search, open, and navigate notes with minimal latency.
- **Calm UI.** Single-window, distraction-free. Monospaced font throughout — note list and editor — matching the aesthetic of The Archive's default theme.
- **Single user.** No multi-tenancy, no teams, no sharing. One account, one password, done.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Any Browser  →  HTTPS  →  VPS (Linux)                      │
│                                 │                            │
│                          Caddy (TLS termination)             │
│                                 │                            │
│                      ZettelWeb Server (Node.js :3000)        │
│                                 │                            │
│                        /home/zettelweb/notes/                │
│                                 │                            │
│                     Syncthing (daemon on VPS)                │
│                                 │                            │
└─────────────────────────────────┼────────────────────────────┘
                                  │ (sync over internet)
┌─────────────────────────────────┼────────────────────────────┐
│  Your Mac                       │                            │
│                     Syncthing (daemon on Mac)                │
│                                 │                            │
│                  ~/Documents/Zettelkasten/  ←→  The Archive  │
│                                 │                            │
│                    iCloud Drive (syncs to iPhone/iPad)       │
└──────────────────────────────────────────────────────────────┘
```

The server is a single Node.js process. It serves the compiled React frontend as static files and also runs the API. There is no separate database — note content lives in `.md` files, and all other persistent state (session, saved searches, settings) lives in a `_zettelweb.json` config file alongside the notes.

---

## 4. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Frontend framework | React 18 + Vite | Fast DX, component model |
| Markdown editor | CodeMirror 6 | Extensible, performant, Markdown syntax highlighting |
| Markdown rendering | `marked` + `DOMPurify` | Lightweight and safe |
| Full-text search | Flexsearch (in-memory, server-side) | Sub-millisecond search; updated incrementally on file change |
| Styling | Tailwind CSS | Utility-first; single fixed theme |
| State management | Zustand | Minimal boilerplate |
| Backend runtime | Node.js 20 LTS | Stable, available on all Linux distros |
| Backend framework | Fastify | Fast, low overhead, good TypeScript support |
| Authentication | Session-based (HTTP-only cookie) + bcrypt | Simple, secure, no OAuth dependency |
| File watching | `chokidar` | Cross-platform, reliable fs watcher |
| Sync | Syncthing | Free, P2P, reliable, works on Linux + macOS |
| Process management | PM2 | Keep server alive across reboots |
| TLS / reverse proxy | Caddy | Automatic HTTPS via Let's Encrypt, minimal config |

---

## 5. VPS Recommendation

**Hetzner CAX11** (~€4–5/month) is the recommended host:
- 2 ARM vCPU, 4 GB RAM, 40 GB SSD
- Ubuntu 24.04 LTS available
- Excellent network, EU datacentres (or US via Ashburn)
- No egress fees on reasonable usage

**DigitalOcean Basic Droplet** ($6/month) is a solid alternative if you prefer a US-based provider with more beginner-friendly documentation.

Either is vastly over-specced for this app. The Node process uses ~100 MB RAM at rest.

---

## 6. Sync: Syncthing

iCloud Drive does not run on Linux. Syncthing is the recommended sync solution: it is free, open-source, peer-to-peer, and runs natively on both macOS and Linux with no third-party cloud account required.

### 6.1 Sync Topology

```
VPS notes dir  ←—— Syncthing ——→  Mac notes dir  ←—— iCloud ——→  iPhone / iPad
```

- Syncthing keeps the VPS and Mac in sync directly (typically within 1–2 seconds of a file change).
- iCloud keeps the Mac and your iOS devices in sync, as it always has.
- The Archive on macOS reads/writes the same folder Syncthing is watching — fully compatible.

### 6.2 Syncthing Setup (Summary)

On the VPS:
```bash
# Install
curl -s https://syncthing.net/release-key.txt | sudo apt-key add -
echo "deb https://apt.syncthing.net/ syncthing stable" | sudo tee /etc/apt/sources.list.d/syncthing.list
sudo apt update && sudo apt install syncthing

# Run as a systemd service for the deploy user
sudo systemctl enable syncthing@zettelweb
sudo systemctl start syncthing@zettelweb
```

On the Mac:
- Install Syncthing via `brew install syncthing` or the [Syncthing macOS app](https://syncthing.net/downloads/).
- Open the Syncthing web UI on both machines (`localhost:8384`).
- Add each machine as a device (exchange device IDs).
- Share the notes folder from the Mac to the VPS.
- Set the VPS folder path to `/home/zettelweb/notes`.

### 6.3 Conflict Handling

Syncthing detects sync conflicts and creates a conflict copy file (e.g., `202401151432 Note.sync-conflict-....md`) rather than silently overwriting. ZettelWeb's server-side conflict detection (etag / If-Match) catches the case where the web app and an external edit race simultaneously, returning `409` to the client.

### 6.4 Alternative: rclone + iCloud WebDAV

If Syncthing is not desirable, `rclone` can mount iCloud Drive via WebDAV on Linux:

```bash
# Configure rclone with iCloud WebDAV credentials
rclone config  # provider: WebDAV, url: https://idmsa.apple.com/...

# Mount (run as a systemd service)
rclone mount icloud:Zettelkasten /home/zettelweb/notes \
  --vfs-cache-mode writes \
  --daemon
```

This works but iCloud's WebDAV endpoint is slower and less reliable than Syncthing. Use Syncthing unless you have a specific reason not to.

---

## 7. File Format

Files must be **fully compatible** with The Archive so they can be opened in either app without conversion.

### 7.1 Filename Convention

```
YYYYMMDDHHMM Note Title.md
```

Example: `202401151432 On the nature of ideas.md`

- The timestamp prefix is the note's **unique ID**.
- The title is the human-readable portion of the filename.
- Extension: `.md` (server can be configured to also index `.txt`).

### 7.2 Note Body

- Pure Markdown (CommonMark + GFM tables and strikethrough).
- No YAML front-matter required. If present it is displayed as a fenced code block and not parsed specially.
- **Tags** are written as `#hashtag` inline in the note body. Multi-word tags use `#CamelCase` or `#kebab-case`.
- **Internal links** use `[[Note ID]]` or `[[Note Title]]` wiki-link syntax.

### 7.3 Encoding

UTF-8, LF line endings.

### 7.4 Config File

A file `_zettelweb.json` is maintained in the notes directory (or at `~/.zettelweb/config.json` if preferred). It stores:

```json
{
  "passwordHash": "<bcrypt hash>",
  "savedSearches": [{ "id": "...", "name": "...", "query": "..." }],
  "settings": { "autoSaveDelay": 1000, "editorWidth": 680, "showSnippets": false }
}
```

This file is filtered out of the note list (ignored during indexing). Syncthing syncs it like any other file — settings and saved searches are therefore shared across devices automatically.

---

## 8. Authentication

### 8.1 Model

Single-user password authentication. No OAuth, no magic links, no email. On first run, the server prompts via a CLI setup script to set a password. The hashed password is stored in the config file using `bcrypt` (cost factor 12).

### 8.2 Login Flow

1. Unauthenticated requests to any route redirect to `/login`.
2. The login page presents a single password field and a submit button.
3. On correct password, the server creates a signed HTTP-only session cookie (`@fastify/session`).
4. Session duration: 30 days (configurable via `SESSION_MAX_AGE_DAYS`). Cookie flags: `SameSite=Strict; Secure; HttpOnly`.
5. On incorrect password: 1-second artificial delay, generic "Incorrect password" message. After 5 consecutive failures from the same IP, that IP is blocked for 15 minutes.

### 8.3 Session Persistence

Sessions survive server restarts via a JSON file at `~/.zettelweb/sessions.json`. On restart, valid non-expired sessions are reloaded.

### 8.4 Password Change

`POST /api/v1/auth/change-password` with `{ currentPassword, newPassword }`. Invalidates all existing sessions.

### 8.5 Logout

`POST /api/v1/auth/logout` — clears the session cookie and removes the server-side session.

### 8.6 Security Checklist

- All API routes require a valid session; unauthenticated requests receive `401`.
- HTTPS enforced by Caddy in production.
- CSRF protection via `@fastify/csrf-protection` (double-submit cookie).
- Security headers via `@fastify/helmet`.
- Rate limiting on `/api/v1/auth/login` via `@fastify/rate-limit`.
- Path traversal prevention: all file paths resolved with `path.resolve()` and asserted to remain within `NOTES_DIR`.

---

## 9. API

All routes prefixed `/api/v1/`. All requests/responses JSON. All routes except `/api/v1/auth/login` require a valid session.

### Notes

| Method | Path | Description |
|---|---|---|
| `GET` | `/notes` | List all notes (id, filename, title, snippet, tags, modifiedAt) |
| `GET` | `/notes/:id` | Get full note content + etag |
| `PUT` | `/notes/:id` | Save note; accepts optional `If-Match: <etag>` header |
| `DELETE` | `/notes/:id` | Move note to `_trash/` subdirectory |
| `POST` | `/notes/:id/rename` | Rename note (`{ newFilename }`) |

### Search

| Method | Path | Description |
|---|---|---|
| `GET` | `/search?q=...` | Full-text search with match snippets and offsets |

### Tags

| Method | Path | Description |
|---|---|---|
| `GET` | `/tags` | All tags with note counts |

### Assets

| Method | Path | Description |
|---|---|---|
| `GET` | `/assets/:filename` | Serve image/attachment from notes directory |

### Config

| Method | Path | Description |
|---|---|---|
| `GET` | `/config` | Get saved searches + settings |
| `PUT` | `/config` | Update saved searches + settings |

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | `{ password }` → sets session cookie |
| `POST` | `/api/v1/auth/logout` | Clears session |
| `POST` | `/api/v1/auth/change-password` | `{ currentPassword, newPassword }` |

### Real-Time Updates (SSE)

`GET /api/v1/events` (authenticated) — Server-Sent Events stream. Pushed when files change on disk (e.g., Syncthing delivers a change from your Mac):

```json
{ "type": "note:created",  "id": "202401151432", "filename": "202401151432 New note.md" }
{ "type": "note:modified", "id": "202401151432" }
{ "type": "note:deleted",  "id": "202401151432" }
{ "type": "index:rebuilt" }
```

---

## 10. Server-Side Search

In-memory Flexsearch index built at startup. Updated incrementally via `chokidar` events — no full rebuild needed for individual file changes. Supports: plain token search (ANDed), `#tag` filter, `NOT keyword`, `"exact phrase"`. Results include match offsets for client-side highlighting.

---

## 11. Application Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [Search Bar ──────────────────────────────────────] [+] [⚙]   │
├────────────────────┬────────────────────────────────────────────┤
│                    │                                            │
│   Note List        │   Editor / Preview Pane                   │
│   (monospaced)     │   (monospaced)                            │
│                    │                                            │
│   202401... Note   │   ┌──────────────────────────────────┐   │
│   202401... Note   │   │  EDITOR (CodeMirror)             │   │
│   202401... Note   │   │  or PREVIEW (rendered Markdown)  │   │
│   ...              │   └──────────────────────────────────┘   │
│                    │                                            │
└────────────────────┴────────────────────────────────────────────┘
```

- **Left panel** (~280px default, resizable): Note list filtered by current search.
- **Right panel**: Active note in edit or preview mode.
- Resizable by dragging the divider. Width persisted in `localStorage`.
- Left panel collapsible for distraction-free writing (`Cmd/Ctrl+\`).

---

## 12. Visual Design & Theme

Single fixed theme. No theme switcher. Faithful to The Archive's default appearance.

### 12.1 Colour Palette

| Token | Light | Dark |
|---|---|---|
| `--bg-app` | `#F5F4EF` | `#1E1E1E` |
| `--bg-list` | `#EDECEA` | `#252525` |
| `--bg-editor` | `#FAFAF8` | `#1A1A1A` |
| `--bg-selected` | `#D4C9B8` | `#3A3A3A` |
| `--text-primary` | `#2C2C2C` | `#D4D0C8` |
| `--text-secondary` | `#7A7570` | `#7A7A7A` |
| `--text-accent` | `#8B6914` (amber) | `#C8A050` |
| `--border` | `#D0CBC3` | `#333333` |
| `--highlight` | `#F5E6A3` | `#5A4A00` |

Follows OS `prefers-color-scheme`. Manual light/dark override in settings only.

### 12.2 Typography

- **Entire UI**: `"iA Writer Mono S", "JetBrains Mono", "Fira Mono", "Menlo", "Consolas", monospace`
- Note list, toolbar, editor, and preview all use this stack.
- Base: `13px` / line height `1.6`. Editor max-width: `680px` centred in pane (configurable).

### 12.3 UI Elements

- Toolbar: search bar, `+` (new note), `⚙` (settings) only.
- Note list: one line per note — title (truncated) + right-aligned muted date. Snippets off by default.
- Panel divider: 1px line, `col-resize` cursor on hover.
- 2px border-radius on inputs/buttons only. No rounded corners on panels.

---

## 13. Feature Specification

### 13.1 Note List
Sort by last modified (default), created, or title. Keyboard navigation with `↑`/`↓`/`Enter`. Right-click: Rename, Delete (with confirmation).

### 13.2 Search
Omnibar always visible. `Cmd/Ctrl+L` or `/` to focus. 150ms debounce. Match highlighting in list and editor. Saved searches (`Cmd/Ctrl+Shift+S`) persisted via config API.

### 13.3 Note Editor
CodeMirror 6 with Markdown mode. `[[` autocomplete for note links — selecting a note from the dropdown inserts its numeric ID (e.g. `[[202601280000]]`), which is stable across title renames. `#` autocomplete for tags. Auto-pairs. Unsaved indicator (`•`). Auto-save (debounced, configurable). Typewriter mode (`Cmd/Ctrl+Shift+T`).

### 13.4 Preview Mode
Toggle Edit / Preview / Split with `Cmd/Ctrl+P`. Renders CommonMark + GFM. Images served via `/assets/:filename`. Wiki-links and `#tags` are clickable. External URLs open in new tab.

### 13.5 Note Creation
`Cmd/Ctrl+N`. Client generates `YYYYMMDDHHMMSS` ID. First line becomes the filename title on first save.

### 13.6 Note Deletion
`Cmd/Ctrl+Delete` or context menu. Confirmation required. Server moves file to `_trash/` (not indexed). Manual recovery by moving files out of `_trash/`.

### 13.7 Note Renaming
Context menu or `F2`. Inline edit. Server renames via `/notes/:id/rename`. Links are not auto-updated (consistent with The Archive).

### 13.8 Tags
`Cmd/Ctrl+T` opens tags modal with note counts. Clicking a tag runs a search.

### 13.9 Navigation
Back/forward: `Cmd/Ctrl+[` / `Cmd/Ctrl+]`. Quick Open: `Cmd/Ctrl+O`. Follow link: `Cmd/Ctrl+Click` in editor, single click in preview. Backlinks panel: `Cmd/Ctrl+Shift+B`.

### 13.10 Settings Panel
`Cmd/Ctrl+,`. Options: auto-save delay, show snippets, editor width, font size, note template, file extensions to index, dark mode override, change password.

---

## 14. Conflict Handling

The server includes etag-based conflict detection. On `GET /notes/:id`, the response includes an `etag` header (the file's mtime as a hex string). On `PUT /notes/:id`, the client sends `If-Match: <etag>`. If the file has been modified since the client fetched it (e.g., Syncthing delivered an update), the server returns `409 Conflict` with the current server content. The client shows: *"This note was changed — overwrite or discard your changes?"*

---

## 15. Data Model

```typescript
interface NoteIndex {
  id: string;            // YYYYMMDDHHMMSS
  filename: string;
  title: string;         // From first H1 or filename
  snippet: string;       // First 120 chars of body
  tags: string[];
  links: string[];       // [[wikilink]] targets
  createdAt: string;     // ISO 8601, from filename
  modifiedAt: string;    // ISO 8601, from fs mtime
}

interface NoteDetail extends NoteIndex {
  body: string;          // Full raw Markdown
  etag: string;          // mtime hex, for conflict detection
}

interface Config {
  passwordHash: string;
  savedSearches: Array<{ id: string; name: string; query: string }>;
  settings: {
    autoSaveDelay: number;
    showSnippets: boolean;
    editorWidth: number;
    fontSize: number;
    noteTemplate: string;
    indexExtensions: string[];
    darkMode: 'auto' | 'light' | 'dark';
  };
}
```

---

## 16. Error Handling

| Scenario | Behavior |
|---|---|
| Unauthenticated request | `401` → redirect to `/login` |
| Login rate limit | `429` + retry-after; UI shows lockout countdown |
| Note not found | `404`; removed from client list |
| Save conflict | `409`; client prompts overwrite or discard |
| File write error | `500`; toast "Save failed. Check server logs." |
| Note deleted externally | SSE `note:deleted`; editor banner |
| Syncthing conflict copy appears | Indexed as a regular note (filename contains `.sync-conflict`); visible in note list so user can review and delete |

---

## 17. Development Workflow

Development runs entirely on your Mac. No VPS, no Syncthing needed until deployment.

### 17.1 Local Dev Setup

```bash
# Prerequisites: Node.js 20+, npm
git clone https://github.com/you/zettelweb
cd zettelweb
npm install

# Set initial password
npm run setup

# Start backend (auto-restarts on file change)
NOTES_DIR=~/Documents/TestNotes SESSION_SECRET=devsecret npm run dev:server
# runs: tsx watch server/index.ts on :3000

# Start frontend (separate terminal)
npm run dev
# runs: vite on :5173, proxies /api/* to :3000
```

Open `http://localhost:5173` in your browser.

### 17.2 Vite Proxy Config

`vite.config.ts` must proxy API and SSE calls to the backend:

```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    }
  }
})
```

### 17.3 Notes Folder During Dev

Point `NOTES_DIR` at any local folder. Options:
- A dedicated test folder with dummy notes (safest).
- Your real notes folder (`~/Library/Mobile Documents/com~apple~CloudDocs/Zettelkasten`) — works fine, The Archive can be open simultaneously since both apps just read/write files.

### 17.4 TypeScript Execution

Use `tsx` for running TypeScript directly in development (no compile step). For production, compile with `tsc` or continue using `tsx` — both work. `tsx` is simpler and perfectly adequate for a personal app.

```json
// package.json scripts
{
  "dev:server": "tsx watch server/index.ts",
  "dev": "vite",
  "build": "tsc && vite build",
  "start": "node server/dist/index.js"
}
```

### 17.5 Testing the Full Production Build Locally

```bash
npm run build
NODE_ENV=production NOTES_DIR=~/Documents/TestNotes SESSION_SECRET=devsecret npm start
# open http://localhost:3000
```

This confirms the static file serving and built frontend work correctly before deploying.

---

## 18. Deployment

### 18.1 Environment Variables

```bash
NOTES_DIR=/home/zettelweb/notes    # Required
PORT=3000                           # Default: 3000
SESSION_SECRET=<64 random chars>   # Required — generate with: openssl rand -hex 32
SESSION_MAX_AGE_DAYS=30            # Optional, default 30
CONFIG_DIR=/home/zettelweb/.zettelweb  # Optional
NODE_ENV=production
```

### 18.2 VPS Initial Setup (Ubuntu 24.04)

```bash
# 1. Create a dedicated user
sudo adduser zettelweb
sudo mkdir -p /home/zettelweb/notes

# 2. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Install PM2 globally
sudo npm install -g pm2

# 4. Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# 5. Install Syncthing (see Section 6.2)
```

### 18.3 Deploy the App

```bash
# On your Mac — build and copy to VPS
npm run build
rsync -avz --exclude node_modules . zettelweb@your-vps-ip:/home/zettelweb/app/

# On the VPS
cd /home/zettelweb/app
npm ci --production
npm run setup   # set password (first time only)
```

### 18.4 PM2 Process Config

`ecosystem.config.js` in project root:

```js
module.exports = {
  apps: [{
    name: 'zettelweb',
    script: './server/index.js',  // or 'tsx server/index.ts' if not pre-compiling
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      NOTES_DIR: '/home/zettelweb/notes',
      SESSION_SECRET: 'your-openssl-rand-hex-32-output-here',
      CONFIG_DIR: '/home/zettelweb/.zettelweb',
    }
  }]
}
```

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # prints a command to run — run it to survive reboots
```

### 18.5 Caddy Config

`/etc/caddy/Caddyfile`:

```
notes.yourdomain.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

Point your domain's DNS A record at the VPS IP. Caddy automatically obtains and renews a Let's Encrypt certificate. Done — the app is live at `https://notes.yourdomain.com`.

### 18.6 Deploy Script

Add a `deploy.sh` to the project root for subsequent deploys:

```bash
#!/bin/bash
set -e
npm run build
rsync -avz --exclude node_modules --exclude .git . zettelweb@your-vps-ip:/home/zettelweb/app/
ssh zettelweb@your-vps-ip "cd /home/zettelweb/app && npm ci --production && pm2 restart zettelweb"
echo "Deployed."
```

---

## 19. Browser Compatibility

No dependency on the File System Access API. Works in all modern browsers.

| Browser | Support |
|---|---|
| Chrome 90+ | Full |
| Firefox 90+ | Full |
| Safari 15+ | Full |
| Edge 90+ | Full |
| Mobile Safari / Chrome | Full (responsive; editing functional, not touch-optimised) |

---

## 20. Out of Scope (v1)

- Plugin system
- Multi-user / collaboration / sharing
- Version history / git integration
- Mobile-native app
- Note encryption at rest
- PDF / DOCX export
- YAML front-matter parsing
- Attachment upload (images served/previewed if already in notes folder; not uploadable via UI)
- Custom themes or font selection
- Vim / Emacs keybinding modes

---

## 21. Project Structure

```
zettelweb/
├── server/
│   ├── index.ts                  # Fastify entry, plugin registration, static serving
│   ├── auth.ts                   # Login, session, rate limiting, CSRF
│   ├── routes/
│   │   ├── notes.ts
│   │   ├── search.ts
│   │   ├── tags.ts
│   │   ├── config.ts
│   │   ├── assets.ts             # Serve images from notes dir
│   │   └── events.ts             # SSE stream
│   ├── lib/
│   │   ├── noteIndex.ts          # In-memory Flexsearch index
│   │   ├── noteParser.ts         # Extract title, tags, wikilinks
│   │   ├── fileStore.ts          # Read/write/delete/rename with path safety
│   │   ├── watcher.ts            # chokidar + SSE broadcasting
│   │   └── config.ts             # Read/write _zettelweb.json
│   └── setup.ts                  # CLI: set initial password
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/
│   │   ├── client.ts             # Typed fetch wrapper (401 → redirect)
│   │   ├── notes.ts
│   │   ├── search.ts
│   │   └── events.ts             # SSE hook
│   ├── store/
│   │   └── useStore.ts
│   ├── components/
│   │   ├── LoginPage.tsx
│   │   ├── Toolbar.tsx
│   │   ├── SearchBar.tsx
│   │   ├── NoteList.tsx
│   │   ├── NoteListItem.tsx
│   │   ├── Editor.tsx
│   │   ├── Preview.tsx
│   │   ├── TagsModal.tsx
│   │   ├── BacklinksPanel.tsx
│   │   ├── QuickOpen.tsx
│   │   └── Settings.tsx
│   ├── hooks/
│   │   ├── useKeyboard.ts
│   │   ├── useNoteNavigation.ts
│   │   ├── useAutoSave.ts
│   │   └── useSSE.ts
│   ├── theme/
│   │   └── index.css             # CSS custom properties, light + dark
│   └── utils/
│       ├── noteId.ts
│       ├── titleExtract.ts
│       └── debounce.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── ecosystem.config.js           # PM2
├── deploy.sh                     # One-command deploy
├── Caddyfile.example
├── SPEC.md                       # This file
├── CLAUDE.md                     # Claude Code session briefing
└── package.json
```

---

## 22. Implementation Order (Recommended for Claude Code)

1. **Server scaffold**: Fastify + TypeScript, `NOTES_DIR` env, static file serving, health check route.
2. **Auth**: `npm run setup` CLI, login route, bcrypt, HTTP-only session cookie, protect all routes.
3. **File store**: Read directory, read/write/delete/rename with path traversal protection.
4. **Notes API**: `GET /notes`, `GET /notes/:id`, `PUT /notes/:id`, `DELETE /notes/:id`, `POST /notes/:id/rename`.
5. **Frontend scaffold**: React + Vite + Tailwind, login page, two-panel layout, CSS theme variables, Vite proxy config.
6. **Note list + editor**: Fetch list, display in left panel, open in CodeMirror on click.
7. **Save**: Auto-save + `Cmd+S` via `PUT /api/v1/notes/:id`.
8. **Search**: Flexsearch index server-side, `/search` endpoint, omnibar with match highlighting.
9. **New note + delete**: ID generation, trash-based deletion, filename-from-first-line on save.
10. **Wiki-links + tags**: Parser, editor autocomplete, clickable in preview.
11. **Preview mode**: Markdown render, Edit / Preview / Split toggle.
12. **SSE file watcher**: `chokidar` + `/events` endpoint + `useSSE` hook, live list updates.
13. **Navigation**: Back/forward history, Quick Open dialog.
14. **Conflict detection**: etag on `GET`, `If-Match` on `PUT`, `409` handling in client.
15. **Tags modal + Backlinks panel**.
16. **Settings panel**: All options persisted via `PUT /config`.
17. **Saved searches**: Save/restore, display below search bar.
18. **Asset serving**: `GET /assets/:filename` for inline images in preview.
19. **Deploy script + PM2 config + Caddyfile.example**.
20. **Polish**: Keyboard shortcut help (`?`), full error states, responsive layout.

---

## 23. Key Implementation Notes for Claude Code

**Server:**
- Use `fs.promises` (Node built-in) for all file operations. No third-party file library needed.
- `chokidar.watch(NOTES_DIR, { ignoreInitial: true, ignored: /(^|[/\\])(_zettelweb|_trash|\.syncthing)/ })` — also ignore Syncthing temp files.
- SSE endpoint: send `comment: ping\n\n` every 30 seconds to prevent Caddy proxy timeouts.
- Conflict detection: `PUT /notes/:id` accepts `If-Match: <etag>`. If `fs.stat(file).mtime.toString(16)` doesn't match, return `409` with `{ conflict: true, serverBody: "..." }`.
- Path traversal guard: `const safe = path.resolve(NOTES_DIR, filename); assert(safe.startsWith(path.resolve(NOTES_DIR)))`.
- Never follow symlinks outside `NOTES_DIR`.
- Filter these filenames from the note list: anything starting with `_`, `.`, or containing `.sync-conflict` should still be indexed but flagged so the UI can show them distinctly.

**Frontend:**
- On `401` from any API call → `window.location.href = '/login'`.
- SSE client: reconnect with exponential backoff (start 1s, max 30s) on connection loss.
- CodeMirror theme: implement as a `theme` Extension reading CSS variables — light/dark switching works without editor reinstantiation.
- `Cmd+S`: call `event.preventDefault()` to suppress the browser's native save dialog.
- Update individual note entries from SSE events — do not re-fetch the full list.
- Note ID generation: `new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)`
- Login page: use a standard `<form>` with `<input type="password">` so password managers work correctly.
- In `vite.config.ts`, proxy both `/api` and SSE endpoint to avoid CORS issues in dev.

---

## 24. CLAUDE.md (Place in Project Root)

```markdown
# ZettelWeb

Single-user self-hosted Zettelkasten web app. Full spec is in SPEC.md — read it before starting.

## Stack
- Backend: Node.js 20 + Fastify + TypeScript (run with tsx)
- Frontend: React 18 + Vite + CodeMirror 6 + Tailwind + Zustand
- Notes: plain .md files on the filesystem — no database
- Auth: bcrypt password + HTTP-only session cookie
- Sync: Syncthing (VPS ↔ Mac) — not needed for local dev
- Production: Hetzner VPS, Caddy (HTTPS), PM2 (process manager)

## Local dev
Terminal 1 (backend):
  NOTES_DIR=~/Documents/TestNotes SESSION_SECRET=devsecret npm run dev:server

Terminal 2 (frontend):
  npm run dev

Open: http://localhost:5173

## Key rules
- NOTES_DIR is the canonical data store — never write note data anywhere else
- All file paths must be validated to stay within NOTES_DIR (path traversal prevention)
- _zettelweb.json and _trash/ are excluded from the note index
- Syncthing temp files (*.syncthing) must be excluded from chokidar and the index
- Session cookie must be HttpOnly + Secure + SameSite=Strict

## Current status
[ Update this section as features are completed ]
- [ ] Server scaffold
- [ ] Auth
- [ ] File store + Notes API
- [ ] Frontend scaffold
- [ ] Note list + editor
- [ ] Save (auto + manual)
- [ ] Search
- [ ] New / delete notes
- [ ] Wiki-links + tags
- [ ] Preview mode
- [ ] SSE file watcher
- [ ] Navigation
- [ ] Conflict detection
- [ ] Tags modal + Backlinks
- [ ] Settings panel
- [ ] Saved searches
- [ ] Asset serving
- [ ] Deploy tooling
- [ ] Polish
```

---

*Spec version: 3.0 — February 2026*

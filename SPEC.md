# Annex — Application Specification
**A web-based clone of The Archive (zettelkasten.de)**

---

## 1. Overview

Annex is a single-user, self-hosted web application that replicates the core functionality of The Archive (macOS). It runs on a Linux VPS and is accessible from any machine via a browser after authenticating. Notes are stored as plain Markdown files in a directory on the VPS, which is kept in sync with your Mac (and from there to iCloud/iPhone/iPad) via Syncthing. The server exposes a small REST API for reading and writing files; the React frontend talks only to that API.

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
│                      Annex Server (Node.js :3000)        │
│                                 │                            │
│                        /home/annex/notes/                │
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

The server is a single Node.js process. It serves the compiled React frontend as static files and also runs the API. There is no separate database — note content lives in `.md` files, and all other persistent state (session, saved searches, settings) lives in a `_annex.json` config file alongside the notes.

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

## 5. VPS & Infrastructure

**DigitalOcean** is the primary host, provisioned via Terraform:
- Droplet: `s-1vcpu-512mb-10gb` (~$4/month), Debian 12
- DigitalOcean Cloud Firewall (Terraform-managed): SSH, HTTP, HTTPS, ICMP only
- Region configurable (default: `nyc1`)

Infrastructure is defined as code in `terraform/` and configured via `ansible/`. See Section 18 for the full workflow.

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
sudo systemctl enable syncthing@annex
sudo systemctl start syncthing@annex
```

On the Mac:
- Install Syncthing via `brew install syncthing` or the [Syncthing macOS app](https://syncthing.net/downloads/).
- Open the Syncthing web UI on both machines (`localhost:8384`).
- Add each machine as a device (exchange device IDs).
- Share the notes folder from the Mac to the VPS.
- Set the VPS folder path to `/home/annex/notes`.

### 6.3 Conflict Handling

Syncthing detects sync conflicts and creates a conflict copy file (e.g., `202401151432 Note.sync-conflict-....md`) rather than silently overwriting. Annex's server-side conflict detection (etag / If-Match) catches the case where the web app and an external edit race simultaneously, returning `409` to the client.

### 6.4 Alternative: rclone + iCloud WebDAV

If Syncthing is not desirable, `rclone` can mount iCloud Drive via WebDAV on Linux:

```bash
# Configure rclone with iCloud WebDAV credentials
rclone config  # provider: WebDAV, url: https://idmsa.apple.com/...

# Mount (run as a systemd service)
rclone mount icloud:Zettelkasten /home/annex/notes \
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

A file `_annex.json` is maintained in the notes directory (or at `~/.annex/config.json` if preferred). It stores:

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

Sessions survive server restarts via a JSON file at `~/.annex/sessions.json`. On restart, valid non-expired sessions are reloaded.

### 8.4 Password Change

`POST /api/v1/auth/change-password` with `{ currentPassword, newPassword }`. Invalidates all existing sessions.

### 8.5 Logout

`POST /api/v1/auth/logout` — clears the session cookie and removes the server-side session.

### 8.6 Security Checklist

- All API routes require a valid session; unauthenticated requests receive `401`.
- HTTPS enforced by Caddy in production.
- CSRF protection via `@fastify/csrf-protection` (double-submit cookie).
- Security headers via `@fastify/helmet` (app-level) and Caddy (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
- Rate limiting on `/api/v1/auth/login` via `@fastify/rate-limit`.
- Path traversal prevention: all file paths resolved with `path.resolve()` and asserted to remain within `NOTES_DIR`.
- Node.js binds to `127.0.0.1` in production — only Caddy is publicly reachable.
- See Section 18.3 for VPS-level hardening (SSH, fail2ban, UFW, unattended-upgrades).

---

## 9. API

All routes prefixed `/api/v1/`. All requests/responses JSON. All routes except `/api/v1/auth/login` require a valid session.

### Notes

| Method | Path | Description |
|---|---|---|
| `GET` | `/notes` | List all notes (id, filename, title, snippet, tags, modifiedAt) |
| `GET` | `/notes/:id` | Get full note content + etag |
| `PUT` | `/notes/:id` | Create or save note; accepts optional `If-Match: <etag>` header for conflict detection |
| `DELETE` | `/notes/:id` | Move note to `_trash/` subdirectory |
| `POST` | `/notes/:id/rename` | Rename note (`{ newFilename }`) |
| `GET` | `/notes/:id/backlinks` | List notes that link to this note |

### Search

| Method | Path | Description |
|---|---|---|
| `GET` | `/search?q=...` | Full-text search with match snippets and offsets |

### Tags

| Method | Path | Description |
|---|---|---|
| `GET` | `/tags` | All tags with note counts |

### Assets & Media

| Method | Path | Description |
|---|---|---|
| `GET` | `/assets/:filename` | Serve image/attachment from notes directory |
| `POST` | `/media` | Upload image attachment (multipart/form-data, max 20 MB); returns `{ path }` |

### Config

| Method | Path | Description |
|---|---|---|
| `GET` | `/config` | Get saved searches + settings |
| `PUT` | `/config` | Update saved searches + settings |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Returns `{ ok: true, notesDir, diskFree }` — used by uptime monitors and deploy smoke tests |

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | `{ password }` → sets session cookie |
| `POST` | `/api/v1/auth/logout` | Clears session |
| `POST` | `/api/v1/auth/change-password` | `{ currentPassword, newPassword }` |
| `GET` | `/api/v1/auth/csrf-token` | Returns a CSRF token for use with state-mutating requests |

### Syncthing Proxy

Requires `SYNCTHING_API_KEY` env var. Returns `503` if Syncthing is not configured.

| Method | Path | Description |
|---|---|---|
| `GET` | `/sync/status` | Syncthing system status |
| `GET` | `/sync/connections` | Active device connections |
| `GET` | `/sync/config/devices` | Configured device list |
| `POST` | `/sync/config/devices` | Add a new device (`{ deviceId, name }`) |
| `GET` | `/sync/folder/status` | Status of the notes folder |

### Real-Time Updates (SSE)

`GET /api/v1/events` (authenticated) — Server-Sent Events stream. Pushed when files change on disk (e.g., Syncthing delivers a change from your Mac):

```json
{ "type": "add",    "path": "202401151432 New note.md" }
{ "type": "update", "path": "202401151432 New note.md" }
{ "type": "remove", "path": "202401151432 New note.md" }
```

A `comment: ping` frame is sent every 30 seconds to prevent proxy timeouts.

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
Sort by last modified (most recently edited at top — updates in real time when a note is saved). Keyboard navigation with `↑`/`↓`/`Enter`. Right-click context menu: **Rename**, **Delete** (with confirmation). No delete button in the toolbar — deletion is context-menu only.

### 13.2 Search
Omnibar always visible. `Cmd/Ctrl+L` or `/` to focus. 150ms debounce. Match highlighting in list and editor. Saved searches (`Cmd/Ctrl+Shift+S`) persisted via config API. Search is case-insensitive.

### 13.3 Note Editor
CodeMirror 6 with Markdown mode. `[[` autocomplete for note links — selecting a note from the dropdown inserts its numeric ID (e.g. `[[202601280000]]`), which is stable across title renames. The autocomplete label shows the filename (not H1 heading). `#` autocomplete for tags. Auto-pairs. Unsaved indicator (`•`). Auto-save (debounced, configurable).

**Text formatting shortcuts** (work in editor):
- `Cmd/Ctrl+B` — toggle bold (`**text**`)
- `Cmd/Ctrl+I` — toggle italic (`*text*`)
- `Cmd/Ctrl+U` — toggle underline (`<u>text</u>`)
- `Cmd/Ctrl+K` — insert/toggle link (`[text](url)` or `[[wikilink]]`)
- When the cursor is inside an already-formatted region, the shortcut removes the formatting (toggle).

**Link decorations**: Inline Markdown links (`[text](url)`) collapse to show only the link text with a small expand icon. Hovering shows a tooltip with the full URL. Bare URLs are rendered as clickable links.

**Image support**: Images drag-dropped into the editor are uploaded via `POST /api/v1/media` and inserted as `![filename](path)`. Images already in the notes directory render inline.

**Block quotes**: Rendered in plain text (not italic) to match The Archive's style. Formatting marks (`##`, `*`, `_`) are rendered faded; list and quote marks are slightly darker.

### 13.4 Preview Mode
Toggle Edit / Preview / Split with `Cmd/Ctrl+P`. Renders CommonMark + GFM. Images served via `/assets/:filename`. Wiki-links and `#tags` are clickable. External URLs open in new tab.

**Preview title**: Derived from the filename — the timestamp ID prefix is stripped and the remainder is converted to sentence case (displayed above the note body).

**Heading hierarchy**: `h1`–`h6` render with distinct sizes, weights, and spacing, consistent with CommonMark.

**List styles**: Unordered lists use bullets; ordered lists use numbers (CSS `list-style` is not reset in preview).

**Block quotes**: Displayed as plain text (not italic).

### 13.5 Note Creation
`Cmd/Ctrl+N` opens a **title prompt dialog**. The entered title becomes the filename (`YYYYMMDDHHMMSS Title.md`). The client generates the 14-digit ID (including seconds). The new file is pre-populated with a template (configurable in Settings) plus a backlink placeholder at the bottom. `Cmd/Ctrl+N` does **not** trigger note creation when focus is outside the main UI (e.g., when a dialog is open) — it is not bound to the browser's native new-window shortcut.

### 13.6 Note Deletion
Right-click context menu → **Delete**. Confirmation required. Server moves file to `_trash/` (not indexed). Manual recovery by moving files out of `_trash/`.

### 13.7 Note Renaming
Right-click context menu → **Rename** or `F2`. Inline edit in the note list. Server renames via `/notes/:id/rename`. The renamed note remains visible in the list immediately (no disappear/reappear). Links are not auto-updated (consistent with The Archive).

### 13.8 Tags
`Cmd/Ctrl+T` opens tags modal with note counts. Clicking a tag runs a search.

### 13.9 Navigation
**URL scheme**: Navigating to a note updates the browser URL to `/note/:id`. Deep links and page refresh restore the correct note. Browser back/forward buttons and iPhone swipe-back gestures work correctly via `popstate`.

Back/forward: `Cmd/Ctrl+[` / `Cmd/Ctrl+]`. Quick Open: `Cmd/Ctrl+O`. Follow link: `Cmd/Ctrl+Click` in editor, single click in preview. Backlinks panel: `Cmd/Ctrl+Shift+B`.

### 13.10 Settings Panel
`Cmd/Ctrl+,`. Options: auto-save delay, show snippets, editor width, font size, **line spacing** (editor line height, default 1.6), note template, file extensions to index, dark mode override, change password, Syncthing device pairing.

### 13.11 Background File Sync
The SSE watcher detects files added, modified, or deleted on disk by Syncthing or any other external tool. Changes update individual note list entries in real time without a full list re-fetch. The edited note's position in the list reflects its new mtime immediately.

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
    autoSaveDelay: number;    // ms, default 1000
    showSnippets: boolean;    // show body snippet in note list
    editorWidth: number;      // px, default 680
    fontSize: number;         // px, default 13
    lineHeight: number;       // unitless, default 1.6
    noteTemplate: string;     // template body for new notes
    indexExtensions: string[]; // default ['.md']
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
git clone https://github.com/you/annex
cd annex
npm install

# Set initial password
npm run setup

# Start backend (auto-restarts on file change)
NOTES_DIR=~/Documents/TestNotes SESSION_SECRET=devsecretdevsecretdevsecretdevsecret PORT=3001 npm run dev:server
# runs: tsx watch server/index.ts on :3001

# Start frontend (separate terminal)
npm run dev
# runs: vite on :5173, proxies /api/* to :3001
```

Open `http://localhost:5173` in your browser.

### 17.2 Vite Proxy Config

`vite.config.ts` must proxy API and SSE calls to the backend:

```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
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

Deployment is fully automated via **Terraform** (infrastructure) and **Ansible** (provisioning + deploys). A `Makefile` orchestrates both.

### 18.1 Prerequisites

- Terraform >= 1.0
- Ansible (with `community.general` and `ansible.posix` collections)
- A DigitalOcean account and API token
- An SSH key already added to DigitalOcean

### 18.2 Environment Variables

```bash
# Required for all steps
export DIGITALOCEAN_TOKEN="dop_v1_..."
export TF_VAR_ssh_key_name="your-ssh-key-name"   # Must match both DO and ~/.ssh/<name>

# Required for deploy only
export SESSION_SECRET="$(openssl rand -hex 32)"
```

A `deploy.sh.example` is provided as a template — copy to `deploy.sh` (gitignored) and fill in values.

### 18.3 Workflow

```bash
# 1. Create the droplet + cloud firewall
make infra-init    # one-time
make infra-apply

# 2. Provision the VPS (runs as root, first time only)
make provision

# 3. Deploy the app (runs as annex user)
make deploy
```

**Provision** (`make provision`) runs once as `root` on a fresh droplet and:
- Creates the `annex` user with SSH key access
- Installs Node.js 20, PM2, Caddy
- **Hardens SSH**: disables root login, password auth, challenge-response; restricts access to `annex` user only
- **Installs fail2ban**: SSH brute-force protection (5 attempts / 10min → 1h ban)
- **Enables UFW**: default deny inbound, allow SSH/80/443 (defense-in-depth alongside DO cloud firewall)
- **Enables unattended-upgrades**: automatic daily security patches
- Configures Caddy with security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- Sets up PM2 systemd startup for the app user

After provisioning, root login is disabled. All subsequent access is via the `annex` user.

**Deploy** (`make deploy`) runs as `annex` and:
- Builds the app locally (`npm ci` + `npm run build`)
- Rsyncs the built app to the VPS (excluding `node_modules`, `.git`, `src`, `test`, `e2e`, `ansible`, `terraform`)
- Templates the PM2 ecosystem config with the `SESSION_SECRET`
- Installs production dependencies
- Restarts via PM2 and waits for the health check to pass

### 18.4 Runtime Environment

```bash
NOTES_DIR=/home/annex/notes    # Set by PM2 ecosystem config
PORT=3000                           # Default: 3000
SESSION_SECRET=<64 random chars>   # Passed via -e at deploy time
SESSION_MAX_AGE_DAYS=30            # Optional, default 30
NODE_ENV=production
```

The PM2 ecosystem config is templated by Ansible at `{{ app_dir }}/ecosystem.config.cjs` with mode `0600`. It includes `max_memory_restart: '200M'` to prevent OOM.

### 18.5 Caddy Config

Caddy is configured via Ansible template (`ansible/templates/Caddyfile.j2`). When a `domain` is set in `ansible/group_vars/all.yml`, Caddy serves HTTPS with automatic Let's Encrypt certificates and HSTS. When `domain` is empty (default), Caddy serves on `:80` for initial testing.

### 18.6 Terraform Resources

Defined in `terraform/`:
- `digitalocean_droplet.annex` — the VPS
- `digitalocean_firewall.annex` — cloud firewall (SSH, HTTP, HTTPS, ICMP inbound; all outbound)

State is stored locally (gitignored). Variables are configured via `terraform.tfvars` (gitignored) or env vars.

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
- Custom themes or font selection
- Vim / Emacs keybinding modes

---

## 21. Project Structure

```
annex/
├── server/
│   ├── index.ts                  # Fastify entry, plugin registration, static serving, health check
│   ├── auth.ts                   # Login, logout, password change, rate limiting, account lockout, CSRF
│   ├── setup.ts                  # CLI: set initial password
│   ├── routes/
│   │   ├── notes.ts              # CRUD + backlinks + rename
│   │   ├── search.ts             # Full-text search
│   │   ├── tags.ts               # Tags with note counts
│   │   ├── config.ts             # Settings + saved searches
│   │   ├── assets.ts             # Serve images from notes dir
│   │   ├── media.ts              # Image upload (multipart, max 20 MB)
│   │   ├── sync.ts               # Syncthing API proxy
│   │   └── events.ts             # SSE stream
│   └── lib/
│       ├── searchIndex.ts        # In-memory Flexsearch index (phrases, tags, NOT, case-insensitive)
│       ├── noteParser.ts         # Extract title, snippet, tags, wikilinks from note body
│       ├── fileStore.ts          # Read/write/delete/rename with path safety + atomic writes
│       ├── sessionStore.ts       # File-backed session persistence (~/.annex/sessions.json)
│       ├── watcher.ts            # chokidar + SSE client registry + ping loop
│       ├── backup.ts             # Hourly snapshots of NOTES_DIR, pruned to 7 copies
│       └── config.ts             # Read/write _annex.json (settings, saved searches, password hash)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types.ts                  # NoteIndex, NoteDetail, SearchResult interfaces
│   ├── api/
│   │   ├── client.ts             # apiFetch wrapper (CSRF token, 401 → redirect)
│   │   ├── sync.ts               # Syncthing API calls
│   │   └── uploadImage.ts        # POST /media multipart upload
│   ├── store/
│   │   └── useStore.ts           # Zustand global state (notes, search, history, settings, conflict)
│   ├── components/
│   │   ├── AppLayout.tsx         # Two-pane layout, divider, collapse
│   │   ├── LoginPage.tsx
│   │   ├── Toolbar.tsx           # Format buttons, save indicator, word count
│   │   ├── NoteList.tsx          # Searchable sidebar list + right-click context menu
│   │   ├── EditorPane.tsx        # Edit/Preview/Split tabs
│   │   ├── CodeMirrorEditor.tsx  # CodeMirror 6 wrapper
│   │   ├── Preview.tsx           # Rendered Markdown (marked + DOMPurify)
│   │   ├── SettingsPanel.tsx     # All settings + Syncthing pairing
│   │   ├── TagsModal.tsx         # Browse tags, click to search
│   │   ├── BacklinksPanel.tsx    # Incoming link list
│   │   ├── QuickOpen.tsx         # Cmd+O note search modal
│   │   ├── NewNoteDialog.tsx     # Title prompt for new note
│   │   ├── ConflictDialog.tsx    # Etag conflict resolution (keep local / use server)
│   │   ├── ContextMenu.tsx       # Right-click → Rename / Delete
│   │   ├── KeyboardHelp.tsx      # Keyboard shortcut overlay
│   │   └── TabBar.tsx            # Multi-tab / search results
│   ├── editor/
│   │   ├── setup.ts              # Compose CodeMirror extensions
│   │   ├── theme.ts              # Dark/light theme, faded formatting marks
│   │   ├── keymaps.ts            # Cmd+B/I/U/K formatting toggle
│   │   ├── autocomplete.ts       # [[ and # autocomplete
│   │   ├── wikilinks.ts          # Parse [[wikilinks]] for autocomplete
│   │   ├── linkDecorations.ts    # Collapse/expand inline links, hover tooltip
│   │   ├── imageDecorations.ts   # Inline image preview
│   │   ├── imageUpload.ts        # Drag-drop → POST /media
│   │   ├── listIndent.ts         # Smart Tab/Shift+Tab list indent
│   │   └── searchHighlight.ts    # Highlight current search query in editor
│   ├── hooks/
│   │   ├── useAutoSave.ts        # Debounced PUT /notes/:id
│   │   ├── useNoteNavigation.ts  # /note/:id URL scheme + popstate
│   │   └── useSSE.ts             # SSE connection with exponential-backoff reconnect
│   ├── theme/
│   │   └── index.css             # CSS custom properties, light + dark
│   └── utils/
│       └── searchTerms.ts        # Query parsing helpers
├── test/                         # Backend unit tests (vitest)
│   ├── setup.ts                  # Test server factory
│   ├── notes-api.test.ts
│   ├── auth-routes.test.ts
│   ├── content-integrity.test.ts
│   ├── file-store.test.ts
│   ├── search-api.test.ts
│   ├── tags-backlinks.test.ts
│   ├── session-persistence.test.ts
│   ├── account-lockout.test.ts
│   ├── csrf.test.ts
│   ├── backup.test.ts
│   ├── watcher.test.ts
│   └── sync-api.test.ts
├── e2e/                          # End-to-end tests (Playwright, Chromium)
│   ├── auth.setup.ts             # One-time login, saves session for all tests
│   ├── fixtures/                 # Seeded notes + teardown helpers
│   └── *.spec.ts                 # Feature-level test suites
├── public/
│   ├── favicon.svg / favicon.ico
│   └── site.webmanifest          # PWA manifest
├── index.html
├── vite.config.ts
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.js
├── Makefile                      # Orchestrates Terraform + Ansible
├── deploy.sh.example             # Template for env vars
├── ansible/
│   ├── ansible.cfg
│   ├── provision.yml             # First-time VPS setup + hardening
│   ├── deploy.yml                # Build + deploy app (npm audit + smoke test)
│   ├── group_vars/all.yml        # Shared variables
│   ├── inventory.ini
│   └── templates/
│       ├── Caddyfile.j2
│       ├── ecosystem.config.cjs.j2
│       └── logrotate-annex.j2    # PM2 log rotation (daily, 14-day retention)
├── terraform/
│   ├── main.tf                   # Droplet + cloud firewall
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
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
19. **Deploy tooling**: Terraform IaC, Ansible provision + deploy playbooks, Makefile, VPS hardening.
20. **Polish**: Keyboard shortcut help (`?`), full error states, responsive layout.

---

## 23. Key Implementation Notes for Claude Code

**Server:**
- Use `fs.promises` (Node built-in) for all file operations. No third-party file library needed.
- `chokidar.watch(NOTES_DIR, { ignoreInitial: true, ignored: /(^|[/\\])(_annex|_trash|\.syncthing)/ })` — also ignore Syncthing temp files.
- SSE endpoint: send `comment: ping\n\n` every 30 seconds to prevent Caddy proxy timeouts.
- Conflict detection: `PUT /notes/:id` accepts `If-Match: <etag>`. If `fs.stat(file).mtime.toString(16)` doesn't match, return `409` with `{ conflict: true, serverBody: "..." }`.
- Path traversal guard: `const safe = path.resolve(NOTES_DIR, filename); assert(safe.startsWith(path.resolve(NOTES_DIR)))`.
- Never follow symlinks outside `NOTES_DIR`.
- Filter these filenames from the note list: anything starting with `_`, `.`, or containing `.sync-conflict` should still be indexed but flagged so the UI can show them distinctly.

- Production server binds to `127.0.0.1` (not `0.0.0.0`) — only Caddy should face the internet. Dev binds `0.0.0.0` for convenience.

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
# Annex

Single-user self-hosted Zettelkasten web app. Full spec is in SPEC.md — read it before starting.

## Stack
- Backend: Node.js 20 + Fastify + TypeScript (run with tsx)
- Frontend: React 18 + Vite + CodeMirror 6 + Tailwind + Zustand
- Notes: plain .md files on the filesystem — no database
- Auth: bcrypt password + HTTP-only session cookie
- Sync: Syncthing (VPS ↔ Mac) — not needed for local dev
- Production: DigitalOcean VPS, Caddy (HTTPS), PM2 (process manager)

## Local dev
Terminal 1 (backend):
  NOTES_DIR=~/Documents/TestNotes SESSION_SECRET=devsecret npm run dev:server

Terminal 2 (frontend):
  npm run dev

Open: http://localhost:5173

## Key rules
- NOTES_DIR is the canonical data store — never write note data anywhere else
- All file paths must be validated to stay within NOTES_DIR (path traversal prevention)
- _annex.json and _trash/ are excluded from the note index
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

*Spec version: 3.2 — March 2026*

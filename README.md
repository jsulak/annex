# Annex

A single-user, self-hosted Zettelkasten web app — a clone of [The Archive](https://zettelkasten.de/the-archive/). Notes are plain Markdown files on the filesystem with no database. Designed to be accessed from any browser after authenticating with a single password.

## Features

- **Plain text notes** — `.md` files with `YYYYMMDDHHMM Title.md` naming convention, fully compatible with The Archive
- **Full-text search** — in-memory Flexsearch index with sub-millisecond results
- **Wiki-links and tags** — `[[note links]]` and `#tags` with autocomplete, clickable in both editor and preview
- **Live sync** — Syncthing keeps notes in sync between VPS and Mac; SSE pushes external changes to the browser in real time
- **Conflict detection** — etag-based optimistic concurrency prevents overwrites from concurrent edits
- **CodeMirror 6 editor** — Markdown syntax highlighting, auto-save, faded formatting marks, inline link decorations
- **Preview mode** — rendered Markdown with Edit / Preview / Split toggle
- **Backlinks and tags panel** — see what links to the current note and browse all tags
- **Keyboard-driven** — quick open, back/forward navigation, search focus, and more

## Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js 20, Fastify, TypeScript (tsx) |
| Frontend | React 18, Vite, CodeMirror 6, Tailwind CSS, Zustand |
| Auth | bcrypt + HTTP-only session cookie |
| Search | Flexsearch (server-side, in-memory) |
| Sync | Syncthing (VPS ↔ Mac) |
| Production | DigitalOcean VPS, Caddy (HTTPS), PM2 |

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
npm install

# Set the login password (first time only)
npm run setup
```

### Development

Start the backend and frontend in separate terminals:

```bash
# Terminal 1 — backend (auto-restarts on change)
NOTES_DIR=~/Documents/TestNotes SESSION_SECRET=devsecretdevsecretdevsecretdevsecret PORT=3001 npm run dev:server

# Terminal 2 — frontend (HMR)
npm run dev
```

Open http://localhost:5173. Vite proxies `/api/*` to the backend on port 3001.

Point `NOTES_DIR` at any folder containing `.md` files — a dedicated test folder is recommended.

### Production Build

```bash
npm run build
NODE_ENV=production NOTES_DIR=/path/to/notes SESSION_SECRET=$(openssl rand -hex 32) npm start
# Open http://localhost:3000
```

## Testing

```bash
# Backend API tests (vitest)
npm test

# End-to-end tests (Playwright)
npm run test:e2e
```

## Deployment

Deployment is automated with Terraform (infrastructure) and Ansible (provisioning + deploys), orchestrated via a Makefile. See [SPEC.md](SPEC.md) Section 18 for full details.

```bash
# 1. Create the droplet + cloud firewall
make infra-init
make infra-apply

# 2. Provision the VPS (first time only)
make provision

# 3. Deploy the app
make deploy
```

Required environment variables: `DIGITALOCEAN_TOKEN`, `TF_VAR_ssh_key_name`, `SESSION_SECRET`. Copy `deploy.sh.example` to `deploy.sh` and fill in values.

## Project Structure

```
server/           # Fastify backend (auth, routes, file store, search index, SSE)
src/              # React frontend (components, store, hooks, editor)
ansible/          # Provision + deploy playbooks, Caddyfile template
terraform/        # DigitalOcean droplet + firewall IaC
test/             # Backend API tests (vitest)
e2e/              # End-to-end tests (Playwright)
```

## Documentation

- [SPEC.md](SPEC.md) — full application specification
- [CLAUDE.md](CLAUDE.md) — development instructions and current status

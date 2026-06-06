# Annex Agent Instructions

This repository is set up for both Claude Code and Codex.

- Claude Code reads `CLAUDE.md`.
- Codex reads this `AGENTS.md`.

To avoid instruction drift, treat `CLAUDE.md` as the canonical project brief and read it before starting any work. It contains the stack, local development commands, key rules, current task/status checklists, testing expectations, and standing session instructions.

Also read `SPEC.md` before implementing features or behavior changes.

## Local Development

Backend:

```bash
NOTES_DIR=~/Documents/TestNotes SESSION_SECRET=devsecretdevsecretdevsecretdevsecret PORT=3001 npm run dev:server
```

Frontend:

```bash
npm run dev
```

Open http://localhost:5173. Vite proxies `/api/*` to `http://localhost:3001`.

## Verification

Use the same expectations documented in `CLAUDE.md`:

- Backend/API tests: `npm test`
- Frontend E2E tests: `npm run test:e2e`
- Linting: `npm run lint`

Always run the relevant tests and `npm run lint` after code changes when feasible.

# Security Audit

Date: 2026-06-06

## Architecture

Annex is a single-user self-hosted app:

Browser -> Caddy TLS/reverse proxy -> Fastify API/static server -> `NOTES_DIR` filesystem.

Persistent state is plain files:

- Notes, media, trash, and backups under `NOTES_DIR`
- `_annex.json` for config and password hash
- `~/.annex/sessions.json` for persisted sessions

Syncthing is proxied through fixed localhost API calls when configured.

## Trust Boundaries

- Internet/browser to Caddy/Fastify
- Authenticated session to all `/api/v1/*` routes except login and health
- API to filesystem under `NOTES_DIR`
- API to Syncthing localhost API
- Deployed Node process as `annex` user to host OS

## Baseline Checks

```bash
npm audit --audit-level=moderate
```

Result: `found 0 vulnerabilities`

```bash
npm test
```

Result: `17 passed`, `253 passed`

```bash
npm run lint
```

Result: passed

## Findings

### 1. Same-Origin SVG Upload/Serving Can Become Stored XSS

Severity: High

Affected files/functions:

- `server/routes/media.ts`: `ALLOWED_EXTENSIONS`
- `server/routes/assets.ts`: `MIME_TYPES`
- `src/editor/imageUpload.ts`: `ALLOWED_IMAGE_TYPES`

Exploit scenario:

An attacker who can get a malicious SVG into synced notes/media, or who compromises an authenticated browser action, stores SVG with script. If the user opens `/api/v1/assets/media/...svg` directly, it is served as same-origin `image/svg+xml`; browser-executed SVG script can call same-origin APIs with the user's cookies.

Evidence from code:

- `.svg` is accepted by the upload extension allowlist.
- `.svg` is accepted by the frontend paste/drop MIME allowlist.
- `.svg` is served as `image/svg+xml`.

Recommended fix:

Disallow SVG uploads and serving, or sanitize SVG server-side and serve it as a download with `Content-Disposition: attachment` plus a restrictive CSP. Prefer removing `.svg` from `ALLOWED_EXTENSIONS` and `MIME_TYPES`.

Tests or scanner commands:

```bash
npm test -- media-api.test.ts assets-api.test.ts
```

Add tests that upload `<svg><script>fetch('/api/v1/notes')</script></svg>` and expect `400`, and asset tests that `.svg` returns `403` or `Content-Disposition: attachment`.

### 2. Asset Route Can Read Arbitrary Files Inside `NOTES_DIR`

Severity: Medium

Affected files/functions:

- `server/routes/assets.ts`: `registerAssets`
- `server/lib/config.ts`: `getConfigPath`

Exploit scenario:

An authenticated request to `/api/v1/assets/_annex.json` can retrieve the bcrypt password hash. Requests to `/api/v1/assets/_backups/backup-....tar.gz` can retrieve note backups, and `/api/v1/assets/_trash/...` can retrieve deleted notes. This bypasses the config API's explicit `passwordHash` omission.

Evidence from code:

The asset handler resolves any wildcard path under `notesDir` and reads it. `_annex.json` is stored directly under `NOTES_DIR`.

Recommended fix:

Restrict assets to `media/` or a dedicated attachment directory. Deny paths starting with `_` or `.`, deny `_annex.json`, `_trash`, `_backups`, temp files, and Markdown unless intentionally supported.

Tests or scanner commands:

```bash
npm test -- assets-api.test.ts
```

Add tests for the following paths and expect `403`:

- `/api/v1/assets/_annex.json`
- `/api/v1/assets/_backups/foo.tar.gz`
- `/api/v1/assets/_trash/foo.md`

### 3. Password Change Does Not Invalidate Other Active Sessions

Severity: Medium

Affected files/functions:

- `server/auth.ts`: `POST /api/v1/auth/change-password`
- `server/lib/sessionStore.ts`: `FileSessionStore`

Exploit scenario:

If a session cookie was stolen or an old browser remains logged in, changing the password only destroys the current session. The other session can continue reading and writing notes until expiry.

Evidence from code:

The change-password route updates `passwordHash`, then calls `request.session.destroy()` only for the current request. The session store has `set`, `get`, and `destroy`, but no clear-all or auth-version mechanism.

Recommended fix:

Add `destroyAll()` to `FileSessionStore`, or store a `sessionVersion`/`passwordChangedAt` in config and check it on every authenticated request.

Tests or scanner commands:

```bash
npm test -- auth-routes.test.ts session-persistence.test.ts
```

Add a test that creates two logged-in sessions, changes password in one, then asserts the second gets `401` on `/api/v1/auth/check`.

### 4. Deployed App User Has Passwordless Root Sudo

Severity: High

Affected files/functions:

- `ansible/provision.yml`: sudoers task for `app_user`

Exploit scenario:

Any future RCE in the Node app, dependency, upload processing, or PM2 context becomes root immediately because the runtime/deploy user can run any command with `sudo` and no password.

Evidence from code:

Ansible writes:

```text
annex ALL=(ALL) NOPASSWD:ALL
```

Recommended fix:

Remove broad sudo from the app user. Use root only during provisioning, separate deploy/runtime users if practical, or grant narrowly scoped sudo for specific service management commands.

Tests or scanner commands:

```bash
rg -n "NOPASSWD:ALL|ALL=\\(ALL\\)" ansible
ssh annex@host 'sudo -n true'
```

The SSH command should fail after remediation.

### 5. Public Health Endpoint Exposes Operational Metadata

Severity: Low

Affected files/functions:

- `server/index.ts`: `GET /api/v1/health`
- `server/auth.ts`: public route allowlist

Exploit scenario:

Unauthenticated internet clients can learn uptime, memory usage, note count, note directory byte size, and disk utilization. This aids fingerprinting and capacity probing.

Evidence from code:

`/api/v1/health` is public in the auth middleware and returns memory, `noteCount`, `notesDirBytes`, and `disk`.

Recommended fix:

Make public health return only `{ "status": "ok" }`; move detailed diagnostics behind authentication or localhost-only access.

Tests or scanner commands:

```bash
curl -s http://localhost:3000/api/v1/health
```

Unauthenticated output should contain only `status`. Authenticated diagnostic endpoint can retain full data.

### 6. `_annex.json` Password Hash Is Written With Default File Permissions

Severity: Low

Affected files/functions:

- `server/lib/config.ts`: `writeConfig`

Exploit scenario:

Local users or synced copies may read `_annex.json` depending on directory/group permissions. This is a bcrypt hash, not plaintext, but it is still sensitive.

Evidence from code:

`writeConfig` uses `fs.writeFile(..., 'utf-8')` with no mode or chmod. Session storage correctly uses `0600`, but config does not.

Recommended fix:

Write config atomically with mode `0600`, and consider splitting auth state out of synced `NOTES_DIR`.

Tests or scanner commands:

```bash
stat -f %Lp "$NOTES_DIR/_annex.json"
```

After `npm run setup` or password change, this should report `600`.

## Notable Non-Findings

- SQL/NoSQL injection: no database layer.
- SSRF: Syncthing proxy uses fixed `http://localhost:8384`, not user-controlled URLs.
- Command injection: backup uses `execFile('tar', argv)` rather than shell execution.
- Note-content XSS: preview uses `marked` followed by `DOMPurify`; the main gap is served SVG assets, not Markdown rendering.
- CSRF: mutating API routes enforce CSRF except login; tests cover missing-token rejection.

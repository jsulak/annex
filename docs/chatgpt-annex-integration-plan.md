# ChatGPT web access to Annex notes

Status: plan only; no integration is implemented. Start with the browser pilot below before building MCP.

## Outcome and scope

Enable a ChatGPT web conversation to find a Markdown note, read it, review an edit, and save it to the same VPS `NOTES_DIR` used by Annex. Existing Syncthing synchronization then carries the saved file to the Mac. Try the existing website through ChatGPT Work's browser first; build a private MCP connection only if that workflow does not meet the user's needs.

If MCP is needed, its first release covers indexed `.md` notes. It does not expose `_annex.json`, `_trash/`, capture drafts, media uploads, Syncthing controls, settings, password operations, note deletion, or renaming. A public plugin listing is unnecessary for this single-user integration. An optional ChatGPT UI can follow after the tool workflow works.

## Choose the lightest path first

The immediate goal is to collaborate on notes in ChatGPT web while saving to the VPS copy. ChatGPT Work's cloud browser can visit a website, pause for the user to sign in, and then continue working in that signed-in session. This may already satisfy the goal through Annex's existing editor, with no integration code. Availability depends on the user's plan, workspace, and rollout. See the [official browser guide](https://learn.chatgpt.com/docs/browser).

| Path | Use it when | Cost or limitation |
| --- | --- | --- |
| **ChatGPT Work browser → Annex website** | Occasional, supervised editing of a few notes | Fastest to try; browser interaction may be slow or fragile for long notes or repeated searches. |
| **Private remote MCP connection → Annex server** | Frequent note search/editing from chat, or reliable structured operations are needed | Direct, repeatable tools; requires server work, HTTPS, OAuth, and maintenance. |
| **Site tools in Annex** | The user mainly works with Annex open in ChatGPT's desktop built-in browser | Shares the live page/session, but current site-tool documentation describes that desktop browser rather than a general ChatGPT web connection. See [site tools](https://learn.chatgpt.com/docs/webmcp). |

**Browser pilot gate:** In a ChatGPT Work chat on the web, open the production Annex URL, sign in using ChatGPT's secure sign-in handoff, and use a disposable note to test search, reading, a small edit, save confirmation, and a visible reread of the saved text. Check the same note in a separate Annex session and after Syncthing reaches the Mac. Test one concurrent edit: the agent must stop on a conflict rather than overwrite it. Do not send the Annex password in chat. If this is reliable and comfortable for the intended workload, stop here. If it fails or becomes tedious, implement the MCP plan below.

## Proposed architecture

```text
ChatGPT web
   │  private MCP connection; OAuth access token
   ▼
HTTPS /mcp on the Annex VPS (Caddy → Fastify)
   │  shared note operations and search index
   ▼
NOTES_DIR/*.md  ↔  Syncthing  ↔  Mac
```

Use a streamable HTTP MCP endpoint on the existing Annex host. The MCP adapter calls the same internal note operations as the browser API; it must not call the browser API with a saved session cookie or maintain a second copy of the notes. The browser API keeps its session and CSRF rules. The MCP endpoint gets a separate bearer-token authentication hook and narrow read/write scopes.

ChatGPT currently supports remote MCP-backed plugin tools in web chats. Developer mode allows a private connection for testing; account and workspace availability must be checked during setup. OpenAI's current guidance calls for OAuth 2.1 authorization-code flow with PKCE for private data and write tools. See [plugin quickstart](https://developers.openai.com/plugins/quickstart), [MCP server guide](https://developers.openai.com/plugins/build/mcp-server), [authentication guide](https://developers.openai.com/plugins/build/auth), and [connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Tool contract for the first release

| Tool | Scope | Result or rule |
| --- | --- | --- |
| `search_notes(query, limit)` | `notes.read` | Bounded matches with note ID, filename, title, modified time, and short snippet. No full-library dump. |
| `read_note(id)` | `notes.read` | Current Markdown body, filename, stable ID, and revision token. Return an explicit size error for notes beyond the supported limit. |
| `create_note(title, body, operation_id)` | `notes.write` | Apply Annex's normal filename/ID and template rules, reject collisions, and return the saved ID and revision. A repeated operation ID must not create a second note. |
| `update_note(id, expected_revision, body, operation_id)` | `notes.write` | Replace the body only if the current revision still matches. A repeat of a completed operation returns the same outcome. A conflict returns the current revision and asks ChatGPT to reread and show a new proposal. |

Mark search and read as read-only MCP actions, and create and update as write actions. Tool descriptions should tell ChatGPT to read the current note before editing, preserve unrelated Markdown, show the proposed change to the user, and never retry a conflict as an unconditional write. ChatGPT's write confirmation is an additional review step, not the server's concurrency control.

Consider an exact-span edit tool after real use shows that replacing a whole body is too cumbersome. It should require the same revision and exactly one matching span. Do not expose a force-overwrite or delete tool in the first release.

## Implementation sequence and gates

### 1. Establish a safe note-write boundary

- Move note lookup, creation, and update logic used by `server/routes/notes.ts` into shared server-side operations. Keep path validation, atomic writes, write serialization, search-index updates, and SSE broadcasts in that common path.
- Give MCP writes a **required** revision token. The current browser API treats `If-Match` as optional and derives its etag from rounded modification time. Use a content-based revision for MCP, checked again while holding the note write lock. Preserve the existing browser API behavior unless tests show that moving both clients to the stronger revision is safe.
- Add an operation receipt for each successful MCP create/update so a retry after a lost response is idempotent. Keep authentication state and receipts in protected server state; `NOTES_DIR` remains the canonical store for note content.
- Verify a stale revision, missing revision, nonexistent note, duplicate title/ID, and malformed filename cannot overwrite or escape the notes directory. Document the remaining race with independent filesystem writers such as Syncthing: Annex cannot make a cross-process atomic compare-and-swap against an external file replacement, so backups and Syncthing conflict copies remain part of recovery.

**Gate:** API tests prove that browser and MCP paths observe the same saved Markdown, index, and SSE event, and that stale MCP updates fail without changing the file.

### 2. Add authentication for ChatGPT

- Serve OAuth protected-resource and authorization-server metadata over HTTPS. Implement authorization code + PKCE with one-use, short-lived codes, an allowlisted ChatGPT redirect URI/client identity, scoped tokens, expiry, refresh, and revocation. Reuse the existing Annex login session for the user's approval screen; require an explicit grant of `notes.read` and, separately, `notes.write`.
- Validate issuer, audience/resource, expiration, and scopes on every MCP request. Store grants and token material outside the note directory with restrictive permissions. Revoke grants on password change and provide a way to disconnect ChatGPT.
- Adjust the global CSRF hook only for the OAuth token endpoint and bearer-authenticated MCP POST requests. Ordinary browser mutations retain CSRF protection. The current `/api/v1/*` session hook does not cover `/mcp`, so the MCP hook must fail closed on its own.
- Rate-limit authorization and MCP requests. Log request IDs, action names, and outcomes without note bodies or credentials.

**Gate:** tests cover anonymous requests, missing/expired/wrong-scope tokens, PKCE failures, redirect URI mismatch, token reuse, revocation, CSRF boundaries, and successful read/write authorization.

### 3. Implement and test the MCP adapter

- Add `/mcp` using the supported streamable HTTP transport and schemas with bounded input/output sizes. Reuse the existing search index and shared note operations. Reject non-note IDs and hidden paths rather than passing arbitrary paths to the file store.
- Return concise, structured conflicts and validation errors that a chat can explain without leaking another note's content. Apply timeouts and output limits to search and read operations.
- Use MCP Inspector against an isolated test `NOTES_DIR` to verify initialization, tool discovery, schemas, annotations, read and write behavior, and failure cases.

**Gate:** a test connection can search, read, create, update, and receive a conflict without touching production notes.

### 4. Deploy privately and connect ChatGPT web

- Confirm that the production Annex hostname has HTTPS. The current Ansible defaults permit an empty domain and HTTP on a bare IP; the remote MCP connection needs a stable HTTPS URL. Route `/mcp` and OAuth metadata/authorization endpoints through the existing Caddy → Fastify deployment. Supply secrets through deployment configuration, never source control.
- Back up the VPS notes and test with a small, disposable note set first. Deploy the endpoint, run a production smoke check for unauthenticated denial and authenticated read access, then add it through ChatGPT's developer-mode Plugins flow. Secure MCP Tunnel is suitable for development testing if a public test endpoint is unavailable.
- Enable `notes.read` first. Run realistic search/read prompts, then grant `notes.write` and test creating and updating a disposable note, confirmation behavior, repeated requests, and a concurrent edit from Annex or Syncthing. Inspect the resulting file in Annex and on the Mac.
- Record the disconnect/revocation and rollback steps. Rollback disables the MCP route and revokes tokens without altering note files.

**Gate:** the user can make a reviewed edit in ChatGPT web, see it immediately in the Annex web app, and then see the same Markdown arrive through Syncthing. A stale edit fails visibly and preserves the newer version.

## Verification before completion

- Write failing Vitest tests before each backend feature, following `CLAUDE.md`; run `npm test`, `npm run lint`, and `npm run build` after implementation.
- Run the relevant Playwright editor and cross-session tests if shared note behavior or the browser API changes. Run the full `npm run test:e2e` suite before deployment when feasible.
- Use MCP Inspector and an actual ChatGPT web connection for protocol and OAuth acceptance. Local unit tests alone do not prove that ChatGPT can discover or invoke the tools.
- Keep production secrets and real note bodies out of fixtures, logs, and screenshots.

## Decisions to settle at implementation time

1. Confirm the ChatGPT account/workspace exposes developer-mode MCP connections and write tools.
2. Set the production HTTPS hostname if one is not already configured.
3. Choose the supported note-size ceiling from real library sizes and test representative long notes.
4. Decide whether the stronger content revision should also replace the browser API's mtime-based etag, after measuring compatibility with existing clients and tests.

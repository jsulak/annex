# Workbench browser access deployment plan

Create `https://workbench.boxkitemachine.net` on the Annex VPS so you can use Codex against the synced Markdown store from a browser on any computer. Use the existing Caddy proxy for HTTPS, Authelia for password plus MFA, ttyd for the browser terminal, and tmux to retain the running session between connections.

This is a deployment plan, dated October 4, 2026. No server, DNS, or authentication changes have been made. It assumes one trusted user and direct access to the existing filesystem store. It provides the Codex terminal experience; document rendering remains in Annex.

## Proposed layout

| Address or component | Purpose |
| --- | --- |
| `annex.boxkitemachine.net` | Existing Annex application and login |
| `workbench.boxkitemachine.net` | MFA protected browser terminal |
| `auth.boxkitemachine.net` | Proposed Authelia login and MFA enrollment portal |
| Caddy | Public HTTPS and authentication checks before proxying terminal requests |
| Authelia | Private service on `127.0.0.1:9091` |
| ttyd | Private service on `127.0.0.1:7681` |
| tmux and Codex | Persistent terminal session under a dedicated `workbench` Linux user |
| Existing `NOTES_DIR` | Canonical note store; repository default is `/home/annex/notes` |

Deploy this through the existing Terraform → Ansible → Makefile workflow and `deploy.sh` wrapper. All package installation, users, permissions, services, and proxy configuration must be reproducible from this repository. Use the same VPS and Caddy installation. Annex stays under its existing PM2 management; the additional system services use systemd, as Caddy and Syncthing already do. The browser connects over HTTPS; ttyd starts the local terminal, so no additional SSH connection is needed for ordinary use.

ttyd supports Linux, writable terminals, loopback binding, and proxy authentication, but its built-in login is basic authentication rather than MFA. Authelia documents integration with stock Caddy through `forward_auth`. [ttyd documentation](https://github.com/tsl0922/ttyd), [Authelia Caddy integration](https://www.authelia.com/integration/proxies/caddy/)

## Deployment ownership and commands

Extend the existing files rather than introducing a separate deployment workflow:

| Existing location | Planned change |
| --- | --- |
| `terraform/main.tf` and `terraform/variables.tf` | Parameterize droplet size if capacity needs changing; manage new DNS records here if Terraform has access to the actual DNS provider |
| `ansible/group_vars/all.yml` | Add non-secret workbench settings: enabled/public-enabled flags, hostnames, loopback ports, user, release versions, and shared `notes_dir` |
| `ansible/provision.yml` | Include workbench tasks for packages, accounts, ACLs, Authelia, ttyd, tmux, systemd startup, and smoke checks |
| `ansible/tasks/workbench.yml` | Proposed task file included by the existing provisioning playbook, with a `workbench` tag; not a standalone playbook |
| `ansible/templates/` | Add launcher, service, Codex instruction/configuration, Authelia, and Caddy snippet templates |
| `ansible/templates/Caddyfile.j2` | Retain the existing service-snippet import and manage its directory through provisioning |
| `Makefile` | Pass workbench flags and protected configuration inputs through the existing provision entry point; pass domain settings consistently for public health checks |
| `deploy.sh.example` | Document workbench configuration and staged provisioning through the existing wrapper |

Use `workbench_enabled` to install private services and `workbench_public_enabled` to add the terminal route only after the private pilot and MFA checks pass. Validate hostnames and required secrets before provisioning public access. Give these flags explicit, conservative defaults; do not enable access merely by installing packages.

The planned operator flow uses the existing commands:

```bash
# Preview any infrastructure changes; apply only if needed.
make infra-plan
make infra-apply

# Install/configure private workbench components through existing provisioning.
# The workbench variables will be wired into the wrapper during implementation.
PROVISION_USER=<existing-privileged-account> ./deploy.sh provision

# After the pilot and MFA enrollment, enable the public flag and re-run.
PROVISION_USER=<existing-privileged-account> ./deploy.sh provision

# Ordinary application updates continue through the existing entry points.
./deploy.sh deploy
./deploy.sh push
```

These commands describe the implementation target; workbench variables and tasks are not implemented yet. Do not run `init`, `destroy`, or the first-run root provisioning path to add the workbench to an existing server. Confirm that the selected privileged account is usable under the deployed SSH allowlist. Normal app deploys continue as `annex`.

Supply new secrets through the existing private wrapper/environment approach, using protected inputs to Ansible and `no_log` on sensitive tasks. Never overwrite the current private `deploy.sh` with the example. Keep secret files out of Git and both deployment rsync paths; `.gitignore` alone does not exclude a file from rsync. Preserve runtime credential and Authelia data directories across repeat deployments. Only account sign-in, MFA enrollment, and any DNS-provider setup that is not managed by Terraform remain interactive.

## 1 Check the VPS and recovery path

- Confirm the actual operating system, CPU architecture, available RAM, disk space, service versions, `NOTES_DIR`, and current DNS records. Repository configuration is evidence of intended deployment, not a live inventory.
- The Terraform configuration specifies a 512 MB droplet. Measure resource usage with Annex and Syncthing running, then during a private Codex pilot. If more capacity is needed, parameterize the size in Terraform and review the plan before applying. Resolve any proposed replacement or data loss before proceeding; do not resize only in the hosting dashboard and leave Terraform inconsistent. Do not assume 512 MB is enough for the added services.
- Verify a recent note backup and restore a test note from it. Syncthing distributes edits and deletions; it is not a backup.
- Save the current Caddy configuration and confirm an independent administrative SSH session works before making changes. Provisioning restricts SSH to the `annex` user; the new workbench user does not need SSH login.
- Establish how privileged changes will be performed. The project removed app-user passwordless sudo, so do not assume that the ordinary deploy account can install services.

Completion gate: known server capacity, a working backup restore, and a usable administrative recovery route.

## 2 Establish the Linux account and file permissions

Have Ansible create a `workbench` user with its own home, no sudo, and no access to Annex deployment secrets, Syncthing credentials, or Authelia secrets. Keep Codex credentials and session history in that user's private home, outside Syncthing and the note store.

Grant access to the confirmed note directory using narrowly scoped filesystem ACLs or an equivalent shared permissions scheme. Include traversal through the necessary parent directory, and make permissions persist for new and atomically replaced files written by Annex, Syncthing, and Codex. Check that Annex and Syncthing can still read and modify files created by `workbench`; do not recursively change ownership to the new user.

Direct access to a writable note directory grants substantial control over its contents. `_annex.json`, including the application's password hash, lives in that directory. Do not describe a dedicated user or an `AGENTS.md` instruction as preventing access to colocated files. This plan accepts the store as accessible to your trusted personal account. If strict isolation of internal files is required, use an Annex API integration instead of direct directory writes.

Completion gate: a disposable note can be created and replaced by each writer, and unrelated service secrets remain inaccessible to `workbench`.

## 3 Pilot Codex privately

Have the existing provisioning playbook install a supported Codex CLI release, tmux, and ttyd with public access disabled. Record the versions in deployment variables and use a controlled update process. First run Codex through the administrative setup path as `workbench`, without a public terminal endpoint.

Sign in with `codex login --device-auth`, completing the link and code in your browser. Device login may need enabling in your ChatGPT account or workspace. Protect any cached authentication file as a credential. [Official OpenAI authentication guidance](https://learn.chatgpt.com/docs/auth)

Start with a disposable test directory and the ordinary sandbox and approval settings. Verify the Linux sandbox works on this VPS before granting live note writes. Use `--sandbox workspace-write --ask-for-approval on-request`; keep approval bypass disabled. [Official CLI reference](https://learn.chatgpt.com/docs/developer-commands)

Template note-store instructions through Ansible describing filename and link conventions, preserving existing IDs and metadata, rereading a note before changes, and ignoring `_annex.json`, `_capture/`, `_trash/`, `_backups/`, and Syncthing temporary files. Put those instructions outside the synced store and load them through supported Codex configuration, or deliberately exclude a root `AGENTS.md` from Annex indexing and sync before using that location. An ordinary root Markdown file can otherwise appear as a note. Provision configuration without replacing the user's saved authentication or conversations.

For the initial live pilot, edit one note at a time, avoid editing that same note in Annex or on the Mac simultaneously, and preserve the existing backup policy. Direct Codex file writes bypass Annex's API revision checks. Rereading before a write reduces mistakes but cannot eliminate races with other writers; stronger protection would require a later integration.

Completion gate: Codex can search and edit a test note, obtain needed approvals, and show the result in Annex and on the Mac without service errors or unacceptable memory use.

## 4 Configure Authelia and enroll MFA

Use Ansible to install a maintained Authelia release as a dedicated service account and template its configuration. Configure a single user, a hashed password, SQLite storage, independent session/storage secrets, and a default-deny access policy allowing only that user or a dedicated workbench group at `workbench.boxkitemachine.net` with `two_factor` required. Keep its database and encryption secret persistent across provisioning runs.

Use authenticator-app codes for the first rollout; verify server time synchronization. Enroll and test MFA before enabling public terminal access. Document a supported MFA reset procedure through administrative SSH and keep an independent recovery method. Do not invent recovery codes if the selected release does not provide them.

Configure a notifier for enrollment and identity verification. Prefer SMTP for ongoing use. A filesystem notifier can support an initial single-user bootstrap if its verification messages are retrieved securely through the administrative path and remain inaccessible to the workbench account. Authelia requires exactly one notifier. [Notification configuration](https://www.authelia.com/configuration/notifications/introduction/)

For a single instance, start with Authelia's default memory session provider; Redis is optional. Persistent MFA enrollment belongs in its storage database. Restarting the authentication service will require fresh login when using memory sessions. Set short session limits and disable remember-me for the initial rollout. Configure the cookie domain and authentication portal according to the current subdomain guidance, using a cookie name distinct from Annex's. [Session configuration](https://www.authelia.com/configuration/session/introduction/)

Completion gate: password alone cannot authorize the workbench; a correct second factor can; wrong codes are rejected; recovery is documented.

## 5 Add DNS and the Caddy routes

Add DNS records for `workbench.boxkitemachine.net` and the proposed `auth.boxkitemachine.net`, pointing to the existing VPS. First determine the authoritative DNS provider: the existing DigitalOcean compute provider does not establish DNS ownership. Manage records through the same Terraform state with the appropriate provider where possible; otherwise document the provider-side prerequisite. Add IPv6 records only if IPv6 is actually configured and reachable. Caddy can obtain certificates once DNS and ports 80/443 are ready.

Have Ansible render the new routes into `/etc/caddy/conf.d/workbench.caddy` and create the snippet directory. The repository's Caddy template already imports `/etc/caddy/conf.d/*.caddy`; confirm that the live configuration also does so. Use the documented Caddy/Authelia integration rather than an improvised authentication flow. Stage the authentication portal for enrollment, then enable the terminal route through the public flag. Use a handler that validates the complete Caddy configuration before reload; do not rely on manual proxy edits.

- Route `auth` to private Authelia and `workbench` through Authelia's authorization check before reaching ttyd.
- Protect every terminal HTTP route and WebSocket handshake, with no path bypass. Authentication failure or Authelia unavailability must deny terminal access.
- Remove client-supplied identity headers before accepting identity returned by Authelia. Configure ttyd's proxy authentication header consistently with the verified identity header.
- Retain applicable HTTPS and security headers and disable caching of terminal/authentication responses. Verify actual proxy behavior with the installed versions.
- Keep ttyd and Authelia bound to loopback. Do not open their ports in UFW or the DigitalOcean firewall.
- Validate Caddy's configuration before reloading. Check Annex's public health endpoint and normal login afterward.

Completion gate: valid HTTPS for both new hostnames, enforced MFA before terminal access, and a healthy Annex application.

## 6 Connect the browser to the persistent session

Have Ansible install and enable the ttyd systemd unit as `workbench`, with writable input enabled, the shared `notes_dir` variable as its working directory, origin checking enabled, and a conservative client limit. Template a fixed, administrator-owned launcher; disable command arguments supplied through URLs. Manage service reloads/restarts through Ansible handlers, keeping the persistent tmux session separate from ttyd restarts.

Have the launcher attach to a named tmux session, creating it with Codex when necessary. Store the tmux socket in the user's private runtime space. Start the tmux server in a separate managed service so closing a browser connection or restarting ttyd does not accidentally terminate Codex. Treat this persistence behavior as a test requirement, not an assumption. [tmux documentation](https://github.com/tmux/tmux/wiki)

Use one active browser terminal initially. On another computer, close the first terminal connection, authenticate in the new browser, and reattach. Two clients attached to the same session could otherwise share input and see the same conversation.

A VPS reboot ends the running Codex process. Restart the services automatically, then provide a documented way to resume the saved Codex conversation. Browser disconnect recovery and reboot recovery are different operations.

Authelia authenticates a WebSocket handshake; do not assume cookie expiry or logout terminates an already open terminal connection. Test this explicitly. On a shared computer, close the terminal tab and log out of Authelia. Document an administrative way to terminate all browser connections immediately while preserving or intentionally ending the underlying tmux session. If immediate revocation of active connections is required, add and test that mechanism before launch.

Completion gate: reload, disconnect, and reconnect work as expected; logout limitations are understood; reboot recovery works; administrative disconnect is available.

## 7 Validate the deployment workflow

Use the existing provisioning entry point for all workbench configuration changes and upgrades. Run Ansible syntax checks and check/diff mode where supported, suppressing secret diffs. Provision twice to verify idempotence: the second run must preserve authentication, MFA enrollment, note permissions, and active Codex sessions unless a service change explicitly requires a restart. Then run an ordinary Annex deploy to prove that workbench configuration and runtime data survive it.

Before rollout, check:

- Fresh private browser: redirected to login and denied until both factors succeed.
- Forged identity headers and unauthenticated WebSocket requests: denied.
- Public access to ports 7681 and 9091: unavailable, including over IPv6.
- Authelia stopped: new terminal access denied, with existing-connection behavior documented.
- Browser refresh, network interruption, second-computer reconnection, and VPS reboot: each behaves as documented.
- Codex edit: Annex updates its display/search index, and Syncthing delivers the change to the Mac.
- Concurrent edits using disposable notes: conflict/recovery behavior understood, with no claim that direct writes use API conflict checks.
- File permissions: still work after atomic replacement, service restarts, and an Annex deployment.
- Backup restore: can recover a note and separately recover Authelia enrollment with its storage encryption secret.
- Keyboard input, paste, scrolling, resize, and Codex approval prompts: usable in the browsers you intend to use.

Keep a short operating guide covering service status, logs, upgrades, MFA recovery, ending connections, and resuming Codex. Do not record terminal content or credentials in routine access logs. Run Ansible syntax checks and relevant smoke tests; if application behavior changes, run the appropriate Annex tests and lint too.

## Rollback

If workbench checks fail, set its public flag to false and re-run the existing provisioning command. Ansible should remove its terminal site block, validate and reload Caddy, and stop ttyd. Leave the note store, Annex, and Syncthing intact. Stop the tmux/Codex service separately when ending a running task is intended. Retain Authelia data for repair, or disable its portal as well when retiring the installation. Remove Terraform-managed DNS records with a reviewed Terraform change after access is disabled. An urgent administrative shutdown can precede this, but reconcile it with deployment configuration afterward.

Restore edited note contents from backups when necessary; service rollback does not undo synced edits. For suspected credential exposure, revoke Authelia sessions, disconnect active terminals, and revoke the VPS's Codex credentials separately.

## First implementation step

Inspect the live VPS capacity, current Caddy configuration, and note permissions through the existing inventory and privileged access route. Implement the workbench variables, included Ansible tasks, templates, and wrapper input wiring; review those changes locally before provisioning private services. Then run the private Codex pilot before enabling public terminal access. The remaining setup inputs are DNS access, an Authelia username/email and password, notifier configuration, and MFA enrollment; enter secrets privately during implementation.

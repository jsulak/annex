# Security Audit

## November 26, 2026 remediation and maintenance

- Deployed `ba06586` behind a Caddy maintenance response. Authorization and CSRF exceptions use matched-route metadata. Anonymous requests no longer persist sessions, health returns only status to anonymous callers, and authenticated health retains diagnostics. Verified 271 API tests, 264 browser tests, lint, build, and local Caddy HTTPS login, cookie flags, CSRF, synthetic note modification, and logout. The production checks used normal anonymous requests and did not request any personal notes. The previous artifact is retained privately under `/home/annex/.annex-deploy/ba06586`. Restrict access before rolling back to a release with the historical authentication defect.
- Upgraded Debian repository packages and installed Node.js 24.22.3 and Caddy 2.11.9. Rebooted into kernel `6.1.0-56-amd64` and verified SSH, Caddy, PM2, Syncthing, public HTTPS health, and the deployed HTML hash. Debian remains on release 12 for this maintenance window. The existing Syncthing v1 installation remains on its current channel pending a separate migration.
- Established and independently verified key-only `annex-admin` access using the existing operator public key. Removed legacy `annex` sudo and verified denial. Caddy's administration endpoint now uses a private Unix socket under a mode `0700` runtime directory. Enabled PM2 log rotation and a daily journal check for available third-party packages, failed APT jobs, and pending reboots.
- Removed the unused Syncthing ingress allowances from UFW and Terraform, preserving the cloud firewall's previous policy. The live Terraform plan reported no changes. Verified one connected Syncthing peer and both folders idle without errors after reconciliation. Ansible now requires a trusted SSH host key and HTTPS hostname, sets up the separate admin and private Caddy socket, and installs current package candidates from the configured channels. The standard deployment path now builds, audits, and transfers only allowed artifacts. It was checked against isolated deployment fixtures for bootstrap, update, rollback, lock contention, and secret redaction. The live application fix used the reviewed artifact directly.
- Follow-up work includes Debian 13 and Syncthing v2 migrations, separating synced configuration from authentication state, and addressing the other historical application findings. The existing notes backup remains managed by the operator. The local update check writes to the journal and has no external notification destination.

## November 25, 2026 live VPS and infrastructure-as-code audit

Inspected the production VPS over verified SSH and queried the DigitalOcean API with the replacement credential. Compared effective controls with Terraform, Ansible, Caddy, Makefile, and the deployed production release `91619c6`. Inspection occurred November 26 UTC / November 25 Central. No firewall rules, packages, service configurations, note files, or application code were changed. Ordinary HTTP checks generated access logs and anonymous sessions. No stress tests, malformed decoder payloads, real-note reads, production writes, reboot, or Terraform apply were performed.

### Assessment

The dependency deployment succeeded, but the VPS still has a critical application authentication defect and several high-priority host and provisioning weaknesses. Terraform validation and a clean npm audit do not establish host security. The live cloud firewall is currently narrower than the committed desired configuration; applying Terraform unchanged would expand exposure.

### Prioritized findings

1. **Critical — public encoded URLs bypass the application authentication gate.** A cookie-free request to `/api/v1/notes/__annex_security_audit_missing_20261125__` returned `401 Unauthorized`; `/%61pi/v1/notes/__annex_security_audit_missing_20261125__` returned the protected handler's `404 Note not found` JSON through public HTTPS. The deployed auth hook checks raw `request.url.startsWith('/api/v1/')`, while routing decodes the path. Note handlers rely on that hook. No existing note was requested or modified in this audit. The prior synthetic local audit demonstrated note reads and writes using this same defect. Enforce authentication on matched API routes with explicit public-route metadata; test encoded reads, CSRF issuance, and mutations through Caddy. Restrict public application access until this is corrected. Terraform's correctly configured firewall does not stop attacks over the intended HTTPS port. [Auth hook](server/auth.ts#L186), [Earlier synthetic reproduction](#november-6-2026).

2. **High — app compromise can become unrestricted root.** `sudo -n -l` confirms `(ALL) NOPASSWD: ALL` for `annex`; `/etc/sudoers.d/annex` exists as root-owned mode `0440`. The runtime, deployment account, and Syncthing all use `annex`. The PM2 service has `NoNewPrivileges=no` and no filesystem isolation. Current Ansible stopped creating the sudo rule but never removes the legacy file. Effective SSH has `AllowUsers annex`, with root login disabled, so simply removing sudo can strand administration. Create and verify a separate administrative recovery path first, then explicitly remove the legacy grant and separate runtime/deploy/admin privileges. Add effective-permission acceptance checks rather than only checking playbook text. [User and SSH tasks](ansible/provision.yml#L39), [PM2 startup](ansible/provision.yml#L277).

3. **High — security updates are installed incompletely or not maintained for third-party services.** Node is `24.20.0`, while configured APT offers `24.22.3`; it predates the October 21 high-severity TLS, DNS, and Brotli fixes. Annex registers compression/decompression; decoder exploitability was not exercised. Caddy is `2.11.2` built with Go `1.26.0`, while APT offers `2.11.9`. The running kernel is `6.1.0-52-amd64` (`6.1.180-1`); installed kernels reach `6.1.0-56-amd64` (`6.1.192-2`). `/var/run/reboot-required` is dated November 18. Debian update timers are active, but unattended-upgrade origins cover Debian only, excluding NodeSource and Caddy. Ansible uses `state: present`, which does not keep existing packages updated, and has no controlled reboot/update acceptance process. Schedule supported package upgrades and a verified reboot, and codify third-party maintenance and health checks. Debian 12 amd64 is still in LTS through June 2028, so an immediate major OS replacement is not required solely because the image says Debian 12. This was not an exhaustive OS CVE match. [Node security release](https://nodejs.org/en/blog/release/v24.22.1/), [Debian kernel tracker](https://security-tracker.debian.org/tracker/source-package/linux), [Debian support](https://www.debian.org/releases/bookworm/), [Caddy release](https://github.com/caddyserver/caddy/releases/tag/v2.11.9), [Node installation](ansible/provision.yml#L148).

4. **High — routine deployment can reintroduce credential exposure.** Both the Ansible sync and Makefile quick push transfer the checkout using exclusion lists that do not exclude `deploy.sh` or arbitrary editor artifacts. The local ignored wrapper is mode `0755` and contains credential assignments; Git ignore does not constrain rsync. The current remote `/opt/annex/deploy.sh` is absent, and the latest release used an explicit compiled-output/manifest package. Retain that artifact allowlist as the supported deployment mechanism. Stop putting the session secret in Ansible command-line extra vars; use a protected source and `no_log`/diff suppression on secret-bearing tasks. If historical transfers occurred, investigate and rotate affected credentials; current absence does not prove no earlier exposure. [Ansible sync](ansible/deploy.yml#L35), [Makefile deploy/push](Makefile#L49).

5. **High — anonymous session persistence amplifies denial-of-service risk on the small host.** One cookie-free public HTTPS health request increased persisted top-level session records from `13,449` to `13,450`. A first diagnostic counting `cookie` fields missed newer serialized records; the confirmed measurement counts actual top-level sessions. The session file is approximately 3.5 MB. The session plugin still defaults to saving uninitialized sessions, and each save serializes and rewrites the store. The VPS has 457 MiB usable RAM, no swap, and the recorded audit already caused an OOM incident earlier this month. Disable uninitialized session persistence, bound session growth, reduce unnecessary rolling writes, add appropriate request limits, and verify login/CSRF/session persistence regressions. Consider a modest RAM increase or carefully configured swap for availability, without treating swap as the fix for unbounded work. Terraform fixes the Droplet at 512 MiB; it does not provision swap. [Session setup](server/index.ts#L78), [Store writes](server/lib/sessionStore.ts#L65), [Droplet size](terraform/main.tf#L22).

6. **Medium — Terraform would broaden Syncthing exposure unnecessarily.** The live attached DigitalOcean firewall allows inbound TCP 22/80/443 and ICMP only. UFW also allows TCP 22000 and UDP 21027, and Syncthing listens on those ports plus UDP 22000. The current Terraform plan is `0 add, 1 change, 0 destroy`: it would expose TCP 22000 and UDP 21027 globally. UDP 21027 is for local broadcast/multicast discovery, not ordinary internet peer connectivity. Decide whether this VPS needs direct sync, VPN-only sync, or relayed/outbound sync before applying. Remove global discovery exposure from both Terraform and UFW; allow TCP 22000 only as needed, and explicitly decide whether UDP 22000 QUIC is desired. If peer addresses are stable, restrict source CIDRs; otherwise document the deliberate public authenticated sync service. The present cloud block is useful protection, not drift to erase automatically. [Terraform rules](terraform/main.tf#L59), [UFW sync rules](ansible/provision.yml#L255), [Syncthing firewall guidance](https://docs.syncthing.net/users/firewall.html).

7. **Medium — recovery and sync boundaries share the app's authority and disk.** Seven local backup archives exist, with the newest at `2026-11-26T02:55:20Z`; app-managed backups are working even though there is no backup cron job. DigitalOcean reports no enabled backup feature, backup IDs, or snapshot IDs. Notes and archives live on the same 10 GB root disk under the same account; no independent off-host backup or restore test was established. Both configured Syncthing folders are bidirectional, lack `.stignore`, and have no enabled file versioning; one peer has automatic folder acceptance enabled. `_annex.json` is mode `0644` inside a `0750` notes directory: it is not globally accessible through the parent directory, but it includes authentication state in the synced tree. Separate authentication/backup state from note syncing, disable automatic folder acceptance unless needed, and implement an independent backup with a tested restore and deletion protection. Syncthing copies are not an independent historical backup. Terraform declares no separate data volume, backups, or `prevent_destroy` guard, so replacement/destroy can remove the only server-side data disk. A lifecycle guard is an accident safeguard, not a substitute for backup. [Backup layout](server/lib/backup.ts#L8), [Config writes](server/lib/config.ts#L81), [Droplet resource](terraform/main.tf#L22).

8. **Medium — local app processes can reach Caddy's administration API.** Caddy listens on `127.0.0.1:2019`; a GET of `/config/` as `annex` returned `200`. The active configuration proxies only the Annex hostname to `localhost:3000`. No Caddy configuration was written during the audit. Root is not needed to reach this API; after removing app-user sudo, it would remain a separate route to change or stop the proxy. Bind the admin API to a permission-restricted Unix socket, use a separate reload authority, and verify that the runtime account cannot connect. The Syncthing GUI is also loopback-only at 8384 and has no GUI password; keep it private and review local-account trust. [Caddy API security guidance](https://caddyserver.com/docs/api), [Template](ansible/templates/Caddyfile.j2).

9. **Medium — the live log-rotation control is absent.** `logrotate` is not installed, `/etc/logrotate.d/annex` does not exist, and its timer is inactive. The PM2 output log is approximately 71 MB. Ansible has a template task but omits `logrotate` from its base-package installation, so template presence alone is insufficient on a rebuilt host. Install/enable rotation explicitly, include acceptance checks, and bound logs under request floods. The disk currently has about 4.2 GB available; this is a maintenance gap rather than current exhaustion. [Package list](ansible/provision.yml#L12), [Rotation task](ansible/provision.yml#L268).

10. **Medium / defense in depth — bootstrap and reproducibility remain weak.** First-run provisioning disables SSH host-key verification. Terraform permits versions `>=1.0`, uses broad provider constraint `~>2.0`, and the provider lockfile is ignored; local tools remain Terraform 1.5.7/provider 2.79.0. Pin the expected host key from a trusted channel, commit the provider lockfile, define a tested Terraform version range, and upgrade tooling with a reviewed no-destroy plan. Restrict SSH source networks where practical: effective key-only login and fail2ban are working, but SSH is open worldwide and fail2ban reports over 75,000 failed attempts and 3,231 bans cumulatively. These counts alone do not establish compromise. X11 and TCP forwarding remain enabled; disable unneeded forwarding after checking operational use. Make HTTPS/domain configuration mandatory: the live site redirects correctly, but the empty-domain Ansible fallback serves the app on plaintext HTTP. [Bootstrap](Makefile#L26), [Lockfile ignore](.gitignore#L17), [Provider constraints](terraform/main.tf#L1), [Domain fallback](ansible/templates/Caddyfile.j2#L14).

### Verified working controls and limits

- DigitalOcean cloud firewall is attached and healthy; UFW is active with default incoming deny. The Droplet has no public IPv6 address. App 3000, Syncthing GUI 8384, and Caddy admin 2019 listen on loopback. System resolver LLMNR 5355 binds broadly but is blocked by the inspected inbound firewall policies. Caddy advertises HTTP/3, but UDP 443 is not allowed by either firewall; this is a transport/configuration mismatch, not a demonstrated security flaw.
- Effective SSH disables root, password, keyboard-interactive, and empty-password login; public-key login and fail2ban are active. Session cookies observed on HTTPS include HttpOnly, Secure, and SameSite=Strict. Session storage and PM2 secret config are mode `0600`; SSH directory/key authorization modes are `0700`/`0600`.
- Public HTTP redirects to HTTPS with 308. HTTPS returns HSTS, CSP, nosniff, and DENY framing headers. These controls do not compensate for the encoded-path auth defect.
- The deployed release's production lockfile was checked locally against current npm advisories and reports zero vulnerabilities. Global tools were inventoried (PM2 6.0.14, npm 11.19.0, Corepack 0.35.0), not freshly vulnerability-scanned in this follow-up. Syncthing 1.30.0 embeds Go 1.24.4 and remains on the old `stable` APT channel; upstream now directs stable releases to `stable-v2`. Review the supported v2 migration and embedded-runtime advisories before broadening sync exposure. [Syncthing APT channels](https://apt.syncthing.net/).
- No full port scan, exploitation of kernel/decoder bugs, malware/incident-response investigation, account-console review, full OS/global-tool advisory inventory, offsite-backup validation, or restore exercise was performed. No evidence here establishes absence of compromise. Existing symlink, session-fixation, and public-health metadata findings from the earlier application audit were not dynamically re-exercised against real production notes.

### Recommended order

1. Contain and fix the public authentication bypass; verify reads and mutations with synthetic fixtures through the production proxy.
2. Establish tested administrative recovery, remove legacy app-user sudo, and isolate the runtime from Caddy administration.
3. Upgrade Node/Caddy, assess Syncthing migration, and reboot into the updated kernel with a rollback and health plan.
4. Make the safe deployment artifact allowlist permanent; fix secret handling and investigate any historical transfers.
5. Correct session amplification, log rotation, independent backups, and restore acceptance.
6. Review and update Terraform/Ansible together, including deliberate sync exposure, SSH/admin separation, resource capacity, update policy, lifecycle safeguards, and verification. Apply only a reviewed plan after these decisions; the existing read-only token may not authorize writes.

## November 25, 2026 production deployment

Deployed focused production release `91619c6` from `main` plus the dependency/session-store fixes in `420e2aa`. Book Capture and its sharp dependency remain unreleased. Preflight verification passed 270 API tests, all 264 production-branch browser checks, lint, build, and clean installation. Both local full-tree and server production-only npm advisory checks reported zero vulnerabilities.

Transferred only compiled output and package manifests into a private staging directory, retained the existing PM2 configuration, and stopped Annex during memory-limited dependency installation on the 457 MiB/no-swap VPS. Previous code and dependencies are retained at `/home/annex/.annex-deploy/rollback-91619c6`. PM2 is online; internal and public HTTPS health returned `ok`. Deployed manifests and HTML matched local SHA-256 hashes; public HTML and all three entry assets matched the release exactly. A normal unauthenticated notes request returned 401. No authenticated production write or note change was performed.

Node remains 24.20.0. OS/runtime updates and the separately documented application/infrastructure vulnerabilities were not remediated by this dependency release.

## November 25, 2026 dependency audit

### Remediation follow-up

Updated compatible dependency resolutions and raised the relevant direct dependency minimums. Final full-tree and production-only npm audits both report **zero vulnerabilities** after a clean `npm ci`. Resolved fixes include sharp 0.35.5, DOMPurify 3.5.0, Fastify 5.12.8, @fastify/static 10.1.12, Vite 8.3.8, Vitest 4.1.12, shell-quote 1.12.0, brace-expansion 5.1.0, glob 14.0.6, minimatch 11.0.9, fast-uri 3.1.9/4.2.4, ip-address 10.7.6, source-map-js 1.2.4, and Zod 4.6.7. No forced upgrades or dependency overrides were needed. The clean installation removed the extraneous OCR packages.

@fastify/session 11.2.1 requires stores to implement `compareAndSet`. Added a synchronous generation/existence check before replacing an existing session, including the legacy generation fallback and expired-session rejection. Regression coverage verifies matching updates survive a reload and stale or revoked updates cannot recreate sessions after logout or bulk invalidation. The pre-change regression failed; all 300 API tests and all 277 Playwright checks now pass. Lint and production build pass on temporary Node 24.22.3. The original npm 10 resolver crashed; temporary npm 11 completed the update and clean install. No global runtime or npm installation was changed. Deployment has not been performed; the historical VPS findings below remain unresolved by this local dependency work.

### Initial audit, before remediation

Audited the current checkout with fresh npm registry responses using `npm audit --json` and `npm audit --omit=dev --json`. Reviewed dependency paths, sanitizer configuration, image intake, and deployment installation. This is a local checkout audit; the VPS, global tools, OS packages, and native-library inventory were not rescanned. The initial audit changed no package versions or application code; the follow-up above records subsequent fixes.

| Scope | Critical | High | Moderate | Low | Total |
| --- | --- | --- | --- | --- | --- |
| Full lockfile | 2 | 5 | 15 | 1 | 23 |
| Production dependencies | 0 | 2 | 6 | 1 | 9 |

Counts are npm affected-package entries, including propagated dependency findings, rather than independent vulnerabilities. All entries report a fix available. The earlier November counts are historical: the current DOMPurify entry is low, not critical.

### Findings and priorities

| Package and path | Registry severity | Assessment and remediation |
| --- | --- | --- |
| `sharp@0.35.4` | High, production | Bundled librsvg has a memory vulnerability with possible RCE under particular Linux runtime conditions. Capture rejects SVG by signature before invoking sharp and checks decoded formats; no exploit was demonstrated. Upgrade to at least 0.35.5. [Advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). |
| `brace-expansion@5.0.9`, through glob/minimatch | High, production and tooling | Nested brace patterns can exhaust the stack; a separate quadratic-time issue also applies. Static serving uses glob, but attacker control of glob patterns was not established. Update the dependency chain to resolve at least 5.0.12. [Stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [CPU exhaustion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr). |
| `shell-quote@1.9.0` through `concurrently@10.0.5` | Critical, development | Command injection requires particular token/comment input to `quote()`. The repository's dev command strings are fixed; untrusted input reaching the vulnerable function was not demonstrated. Update concurrently and resolve shell-quote to at least 1.11.0. These two entries account for both critical counts. [Advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv). |
| `vite@8.2.2` | High, development | Editor command execution and file disclosure advisories apply, including Windows-specific issues and non-Windows filesystem bypasses. Production serves compiled assets through Fastify, so Vite server exposure concerns development. Update beyond the advisory ranges (8.2.3 remains affected by several entries); keep development servers private. [Non-Windows file disclosure](https://github.com/advisories/GHSA-rq7h-c2jc-7f22). |
| `source-map-js@1.2.1`, through Tailwind/PostCSS | High, development | Crafted indexed source maps can stall the event loop. Update to at least 1.2.2 through compatible parent updates. [Advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). |
| `zod@4.5.4`, through eslint-plugin-react-hooks | High, development | Oversized constrained collections can exhaust memory. This installed path is lint tooling, not the API's request validator. Resolve at least 4.6.6. [Advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). |
| Fastify 5.12.3, fast-uri 3.1.7/4.1.4, ip-address 10.7.0, glob 13.0.6, minimatch 10.2.6, @fastify/static 10.1.3 | Moderate, production | HTTP/2 trailers, URI normalization, address parsing/subnet checks, glob cancellation, and pattern amplification findings. Fastify is created without HTTP/2; other advisory preconditions were not dynamically exercised. Update parents and verify resolved Fastify >=5.12.6, fast-uri >=3.1.9/4.2.3, ip-address >10.7.3, glob >14.0.1, and minimatch >=11.0.1. Major transitive version boundaries may require parent releases rather than overrides. |
| DOMPurify 3.4.14 | Low, production browser bundle | Current findings require IN_PLACE/hooks, XHTML parsing, or SAFE_FOR_TEMPLATES with DOM output. Preview sanitizes strings with ADD_ATTR only; those modes were not found in the reviewed call sites. Upgrade beyond 3.4.16 and rerun audit; 3.4.16 does not fix every current entry. [Hook issue](https://github.com/advisories/GHSA-p98j-92pf-mc4p). |
| Vitest/mocker and ESLint/typescript-eslint dependency chains | Moderate, development | Includes mock registration injection and inherited minimatch findings. Update Vitest to at least 4.1.12 and refresh lint packages. |

### Installation and verification notes

- Lockfile v3 contains 479 package entries. Every entry has integrity metadata, and every resolved URL uses HTTPS on registry.npmjs.org. This establishes consistency of recorded sources, not absence of malicious package code.
- Lockfile installation scripts are declared for bcrypt, esbuild, and fsevents. Native sharp libraries also require separate attention beyond JavaScript advisory coverage.
- `npm ls --depth=0` found extraneous OCR-related packages, including tesseract.js, node-fetch, and sharp WASM support. They are outside the lockfile audit baseline. Recreate the installation with `npm ci` before remediation validation; no local installation was removed during this audit.
- Local Node is 23.9.0, below the project's required Node >=24. Use the supported project runtime for upgrade testing. No new VPS runtime claim is made here.
- Deployment runs `npm ci` and blocks on `npm audit --audit-level=high`; the current findings will fail that gate. No `.github` directory exists in this checkout, so repository-hosted GitHub Actions auditing was not verified. External Snyk integration was not inspected.
- Recommended next step: update compatible parents and transitive resolutions, rerun both audits, then run API tests, browser tests, lint, and build on Node 24 before deployment. Fix availability does not establish compatibility. No forced updates or overrides were applied.
- Validation for this documentation-only audit: successful advisory responses and dependency-tree inspection. No application tests were run because application code and dependency resolutions were unchanged.

## November 7, 2026 live VPS follow-up

Inspected the configured VPS over SSH with host-key verification. Collected installed package revisions, the deployed lockfile and npm tree, global npm package manifests, Caddy build information, effective SSH and firewall settings, automatic update configuration, and reboot status. Advisory comparisons used npm, Debian's security tracker, and the Go vulnerability database. Application data was excluded from the advisory requests.

| Component | Observed state | Assessment |
| --- | --- | --- |
| Debian | 12.15 Bookworm | In LTS through June 30, 2028. Debian package lists were refreshed November 7. The per-package support checker is absent, so LTS eligibility for every installed package remains unverified. [Debian support](https://www.debian.org/releases/bookworm/index.html). |
| Running kernel | `6.1.0-52-amd64`, package `6.1.180-1` | Newer kernels `6.1.0-53` and `6.1.0-54` are installed, including package `6.1.190-1`. Reboot has been required since October 19. The running kernel falls below published Debian CVE fix revisions. Architecture, hardware, and configuration applicability of individual kernel advisories was not tested. [Debian kernel tracker](https://security-tracker.debian.org/tracker/source-package/linux). |
| Node | `24.20.0` | Repository candidate is `24.22.2`. The installed release predates the October 21 security fixes in `24.22.1`, including high-severity Brotli memory corruption, DNS, and TLS issues. Annex enables request decompression through `@fastify/compress`, making the decoder worth prioritizing during remediation. No malformed payload was sent to the VPS. [Node security release](https://nodejs.org/en/blog/release/v24.22.1). |
| Caddy | `2.11.2`, built with Go `1.26.0` | Repository candidate is `2.11.9`. Version checks matched published Caddy, embedded Go, and dependency advisories. Many require particular handlers or configuration. Runtime call reachability was not tested. [Caddy release](https://github.com/caddyserver/caddy/releases/tag/v2.11.9). |
| Syncthing | `1.30.0`, built with Go `1.24.4` | Configured APT channel still offers `1.30.0`. Upstream's stable channel for current releases is `stable-v2`. Embedded Go version matches published vulnerabilities, including TLS advisories. Review the v2 migration and repository channel before updating. [APT channels](https://apt.syncthing.net/), [Go TLS advisory](https://pkg.go.dev/vuln/GO-2026-4337). |
| Debian userspace | OpenSSL `3.0.22-1~deb12u2`, OpenSSH `1:9.2p1-2+deb12u10`, glibc `2.36-9+deb12u14` | These match configured repository candidates. Comparing installed Debian source versions with the current tracker found no additional userspace package below a tracker-published Bookworm fix revision. Open, deferred, and undetermined tracker entries remain, and the comparison does not establish exploitability or absence of vulnerabilities. |
| Global npm tools | PM2 `6.0.14`, npm `11.19.0`, Corepack `0.35.0` | Scanned 278 installed package manifests. Fifteen package names matched npm advisories, including a low-severity PM2 ReDoS and high-severity entries in global tool dependencies. Command injection and other findings depend on the affected function and attacker-controlled input. [PM2 advisory](https://github.com/advisories/GHSA-x5gf-qvw8-r2rm), [Systeminformation advisory](https://github.com/advisories/GHSA-hvx9-hwr7-wjj9). |

The deployed app's lockfile and successful `npm ls --omit=dev --all` inventory differ from the current Book Capture checkout. Its production-only audit reports eight affected entries, including DOMPurify `3.4.14` at critical severity and brace-expansion `5.0.9` at high severity. Fastify `5.12.3` and five dependency entries are moderate. The current checkout still reports nine production entries because it also includes sharp. Sanitizer-option and other reachability conditions described in the November 6 audit still apply.

Automatic Debian updates and both APT timers are active. Their allowed origins cover Debian and Debian Security, which leaves NodeSource and Caddy packages outside that policy. The two pending APT upgrades are Node and Caddy. Automatic package installation also leaves the currently running kernel behind until a reboot occurs.

Live configuration confirms the legacy unrestricted passwordless sudo grant for `annex`, with `/etc/sudoers.d/annex` mode `0440`. Root SSH and password authentication are disabled, and `AllowUsers` contains only `annex`, so establish an independent administrative recovery route before removing the grant. UFW is active with default incoming deny, and SSH fail2ban is active. The app, Syncthing GUI, and Caddy admin API listen on loopback. The private deployment script and its undo file were absent from `/opt/annex` at inspection time. This does not establish whether earlier transfers or credential access occurred.

**Audit incident.** At approximately 08:15 Central on November 7, running the detailed version comparison on the 457 MiB VPS with no swap exhausted memory. The kernel killed Annex and then the audit Python process. PM2 restarted Annex automatically. A subsequent health request returned `status: ok`, and Annex, Caddy, and Syncthing services were active. The comparison should have run locally from the start. Remaining analysis was moved to this computer, and later server reads used small inventories. Application files and notes were not intentionally modified by the audit. Package upgrades, reboot, security remediation, and a backup restore test remain pending.

## November 6, 2026

Reviewed the `feature/book-capture` checkout at `41eb2dd`, including the Fastify API, browser rendering, Book Capture, file storage, Syncthing, and the Terraform, Ansible, Caddy, PM2, and Makefile deployment paths. Dynamic tests used synthetic data on loopback. The effective configuration and deployment history of the live VPS remain unverified.

### Critical findings

1. **Unauthenticated note reads and writes through Caddy.** Fastify decodes URL escapes to select a route. The authentication hook checks the raw `request.url` and skips any URL without the literal `/api/v1/` prefix. Through a local Caddy 2.11.9 HTTPS proxy to the production build, a normal note request returned `401` and `/%61pi/v1/notes/fixture` returned `200` with the note body. `/%61pi/v1/auth/csrf-token` also reached the CSRF-token endpoint and issued a token for an anonymous session. Reusing that token and cookie on an encoded PUT returned `200` and changed the note on disk. Other API handlers that rely on the shared gate, including capture and Syncthing handlers, share the exposure. If this build is publicly reachable, restrict access pending a fix. Enforce authentication on the matched API routes, explicitly designate the public routes, and add read, token, and write regressions through Caddy. [Auth hook](server/auth.ts#L186), [CSRF setup](server/index.ts#L96), [Caddy proxy](ansible/templates/Caddyfile.j2#L1).

2. **Both deployment paths copy a credential-bearing local script to the VPS.** The full deploy and quick push sync the checkout with exclusion lists that omit `deploy.sh`. A local rsync dry run selected that file and an editor undo file. A redacted scan identified DigitalOcean and OpenAI credentials in the script, which also supplies the Annex session secret. The local script is mode `0755` and the provisioned app directory is mode `0755`, so archive-mode copying can make the script readable by other VPS users. Actual transfers and credential use were unverified. Switch both deployment paths to an explicit artifact allowlist. If either path has been used with this script, inspect and remove remote copies and rotate all three secrets. Keep the session secret out of the Ansible command line and suppress logs and diffs for secret-bearing tasks. [Full deploy](ansible/deploy.yml#L35), [Quick push](Makefile#L56), [Directory permissions](ansible/provision.yml#L160), [Credential inputs](deploy.sh.example#L4).

### High findings

3. **Legacy app-user sudo can survive an upgrade.** Older provisioning created `/etc/sudoers.d/annex` granting unrestricted passwordless sudo. Commit `2e19a94` removed the task that wrote the file. Current provisioning has no removal task, and the regression test only checks the playbook text. A previously provisioned host can still give a compromised app user root. Verify an independent administrative route first, then remove the legacy grant explicitly and check effective sudo permissions as the app user. Current provisioning also disables root SSH and allows only the app user, so establish the admin route before enforcing removal. [Provisioning](ansible/provision.yml#L39), [Current regression test](test/ansible-hardening.test.ts#L7).

4. **Anonymous HTTPS requests grow the persistent session store.** The session plugin defaults to saving uninitialized sessions. Ten cookie-free health requests through Caddy added ten stored sessions. The app retains sessions for 30 days by default and serializes and rewrites the whole store on each save. Repeated requests can increase memory and disk use and amplify write costs. Disable uninitialized session persistence, bound the store and request costs, and test that anonymous responses leave the file unchanged. [Session configuration](server/index.ts#L79), [Store writes](server/lib/sessionStore.ts#L65).

### Additional findings

| Severity | Finding and remediation |
| --- | --- |
| Medium | **Symbolic links escape filesystem boundaries.** A synthetic link under `media/` returned a file outside the notes tree through the encoded request. Asset and note reads check path strings and follow links when opening files. A link supplied by a filesystem writer or sync peer can expose files readable by the app. Parent-directory links can redirect some writes and trash moves. Validate real containment and use symlink-safe file opens and writes throughout the note and media paths. [Asset reads](server/routes/assets.ts#L33), [Note and media I/O](server/lib/fileStore.ts#L6). |
| Medium | **The login retains a pre-login session ID.** A cookie captured before login returned `401` from the auth check. After logging in with it, the original cookie could be replayed and returned `200`. Exploitation requires planting a known cookie in the victim browser, for example through control of a sibling origin that can set a parent-domain cookie. Regenerate and retire the session ID on successful login and use a host-prefixed cookie in production. [Login](server/auth.ts#L105), [Cookie settings](server/index.ts#L83). |
| Medium | **Local users can reach Caddy's management API under the default config.** The Caddyfile leaves the admin listener at its default loopback address. A process on the host can use that listener to replace proxy configuration or stop Caddy unless the deployment overrides it. Put the API on a permission-restricted Unix socket and verify that reloads still work and the app user cannot reach it. [Caddy template](ansible/templates/Caddyfile.j2), [Caddy admin options](https://caddyserver.com/docs/caddyfile/options#admin). |
| Medium | **The default deployment serves the login page over plaintext HTTP.** The empty domain setting proxies all requests on port 80. A Secure cookie does not protect a password submitted over HTTP. The deploy recipe also omits the domain variable, so the public HTTPS smoke test can be skipped even when provisioning used a domain. Require HTTPS for the public app, pass the domain to deploy, and test that port 80 only redirects. The local deployment wrapper had a nonempty domain setting. [Default domain](ansible/group_vars/all.yml#L7), [HTTP fallback](ansible/templates/Caddyfile.j2#L14), [Deploy command](Makefile#L49), [Public smoke test](ansible/deploy.yml#L96). |
| Medium | **SSH bootstrap accepts an unverified host key.** Both the SSH wait and first provisioning disable host-key checks. A network intermediary could impersonate the fresh VPS and receive privileged provisioning tasks. Pin the host key from a trusted provisioning channel. Verify effective policy with `sshd -T` because earlier Debian drop-ins can take precedence over the main file edited by Ansible. [Bootstrap](Makefile#L26), [SSH tasks](ansible/provision.yml#L52), [Debian OpenSSH configuration](https://manpages.debian.org/bookworm/openssh-server/sshd_config.5.en.html). |
| Medium | **The sync tree contains authentication data and backups.** `_annex.json` contains the password hash and is written with the process's default permissions. Backups include it, and provisioning defines no sync exclusions for configuration, backups, trash, or capture drafts. An accepted peer can receive these files and can replace the server's password hash through bidirectional sync. The pairing route also enables automatic acceptance of folders from the peer. Separate authentication and backups from the synced directory, provision explicit exclusions for private state, disable automatic folder acceptance, and test an independent restore. [Config writes](server/lib/config.ts#L81), [Backup contents](server/lib/backup.ts#L16), [Pairing](server/routes/sync.ts#L56), [Syncthing exclusions](https://docs.syncthing.net/users/ignoring.html). |
| Low | **Public health discloses host and note metadata and scans the notes directory on every request.** It returns uptime, memory, disk capacity, note count, and aggregate bytes. Each request also performs a directory read and sequential file stats. Return a constant status publicly and move detailed diagnostics behind authentication. [Health route](server/index.ts#L150). |

### Dependency scan and verification

- `npm audit` reported 23 affected packages or dependency paths by npm's accounting, including 3 critical and 5 high. `npm audit --omit=dev` reported 9 total, including 1 critical and 2 high. The critical production entry was DOMPurify 3.4.14. The two high entries were sharp 0.35.4 and brace-expansion 5.0.9. The reported DOMPurify issues depend on particular sanitizer options, and the sharp issue concerns SVG parsing while Capture filters input to raster formats. These scan severities do not establish exploitability in Annex. Upgrade and rerun the checks. Both full deploy and quick push currently gate on high-severity findings. [Lockfile](package-lock.json), [DOMPurify advisory](https://github.com/advisories/GHSA-p98j-92pf-mc4p), [Sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [Brace expansion advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
- All 299 API tests, lint, and the production build passed on local Node 23.9.0. Deployment targets Node 24. Terraform validation and formatting and both Ansible syntax checks passed. Gitleaks found no matches in 143 commits and two credential matches in the local deployment script during the working-directory scan.
- The prior SVG and direct access to non-media paths have regression coverage. Sequential password changes invalidate stored sessions in the current tests. Live Caddy snippets, package versions, effective SSH and firewall rules, sudo privileges, Syncthing settings, and backup restores remain unverified. The planned Workbench and ChatGPT integrations are design documents and were outside the runtime audit.

---

## June 6, 2026 historical audit

### Architecture

Annex is a single-user self-hosted app:

Browser -> Caddy TLS/reverse proxy -> Fastify API/static server -> `NOTES_DIR` filesystem.

Persistent state is plain files:

- Notes, media, trash, and backups under `NOTES_DIR`
- `_annex.json` for config and password hash
- `~/.annex/sessions.json` for persisted sessions

Syncthing is proxied through fixed localhost API calls when configured.

### Trust Boundaries

- Internet/browser to Caddy/Fastify
- Authenticated session to all `/api/v1/*` routes except login and health
- API to filesystem under `NOTES_DIR`
- API to Syncthing localhost API
- Deployed Node process as `annex` user to host OS

### Baseline Checks

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

### Findings

#### 1. Same-Origin SVG Upload/Serving Can Become Stored XSS

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

#### 2. Asset Route Can Read Arbitrary Files Inside `NOTES_DIR`

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

#### 3. Password Change Does Not Invalidate Other Active Sessions

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

#### 4. Deployed App User Has Passwordless Root Sudo

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

#### 5. Public Health Endpoint Exposes Operational Metadata

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

#### 6. `_annex.json` Password Hash Is Written With Default File Permissions

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

### Notable Non-Findings

- SQL/NoSQL injection: no database layer.
- SSRF: Syncthing proxy uses fixed `http://localhost:8384`, not user-controlled URLs.
- Command injection: backup uses `execFile('tar', argv)` rather than shell execution.
- Note-content XSS: preview uses `marked` followed by `DOMPurify`; the main gap is served SVG assets, not Markdown rendering.
- CSRF: mutating API routes enforce CSRF except login; tests cover missing-token rejection.

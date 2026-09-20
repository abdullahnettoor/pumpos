# Desktop in-app updates

PumpOS desktop updates itself over one stable channel: a GitHub Release, a
`latest.json` manifest, and Tauri-signed updater artifacts for **macOS
universal** and **Windows x64**. Linux is not a target.

Nothing about an update is automatic past the check. PumpOS reports that a newer
version exists; the operator starts the download, and the operator starts the
installation. A station's machine is never restarted on its own.

- Operator-facing behavior → [What operators see](#what-operators-see)
- Cutting a release → [Release runbook](#release-runbook)
- Key handling → [The updater key](#the-updater-key) **(owner only, do this first)**
- Something broke → [Support and incident recovery](#support-and-incident-recovery)

---

## Two signatures that are not the same thing

This distinction decides which of two very different problems you are looking
at, so it comes before everything else.

|                             | Tauri updater signature                      | Operating-system signing                                        |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| Proves                      | this update came from PumpOS                 | this application came from a publisher macOS/Windows recognises |
| Checked by                  | the installed PumpOS client                  | Gatekeeper / SmartScreen, at install time                       |
| Required for in-app updates | **Yes.** Without it every update is rejected | No                                                              |
| Costs                       | nothing                                      | Apple Developer Program, a Windows code-signing certificate     |
| PumpOS today                | **In use**                                   | **Not in place**                                                |

Phase one ships mandatory Tauri signatures and **no** Apple Developer ID,
**no** notarization, and **no** Windows Authenticode. Users therefore still see
platform warnings on first install. A Tauri signature does not remove them and
nothing in this document should be read as claiming it does.

---

## The updater key

> **Owner only.** Do this once, on your own machine, before the first
> updater-capable release. Until it is done, `node scripts/updater-key.mjs --check`
> fails and no release can be cut.

The key pair is what lets an installed PumpOS reject an artifact PumpOS did not
sign. The private half never enters this repository, a log, a chat, or a
screenshot.

### 1. Generate the pair

```bash
npx --workspace=apps/desktop tauri signer generate -w ~/.pumpos/updater.key
```

You will be asked for a password. Use one; it becomes a second secret.

That writes:

- `~/.pumpos/updater.key` — the **private** key. Never commit this.
- `~/.pumpos/updater.key.pub` — the **public** key.

### 2. Embed the public key

```bash
TAURI_SIGNING_PUBLIC_KEY="$(cat ~/.pumpos/updater.key.pub)" \
  node scripts/updater-key.mjs --stamp
node scripts/updater-key.mjs --check
```

`cat`, not `base64`: Tauri already writes the `.pub` file base64-encoded, so
encoding it again produces a key the app would reject.

Commit the resulting change to `apps/desktop/src-tauri/tauri.conf.json`. The
script refuses anything that is not a minisign Ed25519 public key, and refuses
outright to write a secret key.

### 3. Store the private key in GitHub

Create a **`desktop-signing`** environment (Settings → Environments) restricted
to the `main` branch, with **no required reviewer**, and add its secrets:

| Secret                               | Value                               |
| ------------------------------------ | ----------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | contents of `~/.pumpos/updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password from step 1            |

They go in an environment, not in repository secrets, so only jobs that declare
it can read them. It is deliberately a _separate_ environment from `production`:
`production` carries a required reviewer, and putting that on a two-target build
matrix would charge every desktop release two extra approvals for jobs that
cannot publish anything. The gate that matters — publication — keeps its
reviewer. The workflow passes these straight to `tauri-action` as environment
variables and never echoes them.

### 4. Back it up outside GitHub

GitHub secrets are write-only: you cannot read them back. If the only copy of
the private key is in GitHub and the environment is deleted, the key is gone.

Store an encrypted backup somewhere that is not this repository and not GitHub
— a password manager entry or an age/GPG-encrypted file on separate storage:

```bash
age -p -o updater.key.age ~/.pumpos/updater.key   # or gpg -c
```

Record the password separately from the file.

### 5. Verify the backup restores

A backup you have not restored is a rumour. Once:

```bash
age -d -o /tmp/restored.key updater.key.age
diff /tmp/restored.key ~/.pumpos/updater.key && echo "restore verified"
rm /tmp/restored.key
```

### What losing the private key costs

Every installed PumpOS embeds the matching public key. If the private key is
lost, **no future release can produce an update those clients will accept.** The
only recovery is shipping a release signed with the old key that embeds a new
public key (a rotation release) — which is impossible after the key is gone.
Every existing installation then needs a manual reinstall.

Rotating on purpose is therefore a two-release operation: first ship a release,
signed with the current key, that embeds the new public key; only after that is
installed everywhere do you sign with the new key.

---

## What operators see

The desktop app checks once, after the signed-in shell is on screen, and
whenever the operator picks **Check for updates** from the user menu (which also
shows the installed version). It never checks during boot, from a development
build, from the web console, or from mobile.

| State             | What the notice says                                  | What the operator can do            |
| ----------------- | ----------------------------------------------------- | ----------------------------------- |
| Checking          | "Checking for updates…"                               | keep working                        |
| Up to date        | the installed version                                 | dismiss                             |
| Available         | the new version and its release notes                 | **Download update**, or dismiss     |
| Downloading       | MB downloaded, or a percentage when the size is known | keep working                        |
| Ready             | "ready to install"                                    | **Install and restart**, or dismiss |
| Restart postponed | the concrete reason local writes are unsafe           | Try again, or dismiss               |
| Installed (macOS) | "installed"                                           | **Restart and update**              |
| Failed            | a plain-language cause                                | retry the step that failed          |

A **failed automatic check is silent** — it is logged and dropped. The operator
did not ask, and "the update server did not respond" is not something they can
act on; a station with a flaky connection would otherwise meet a red banner
every morning. A failed **manual** check always reports, because the operator
asked and is owed an answer.

The notice is a compact panel in the corner, never a modal: an update is never
more important than the shift in front of the operator. Dismissing it puts the
offer away without losing it — including a finished download — and the menu's
manual check brings it straight back rather than re-fetching it.

**Restart readiness.** Installation asks one interface — owned by desktop
resilience — whether PumpOS may close. It is deliberately _not_ derived from
browser network status. Today no durable local write outbox exists, so the
answer is always "safe"; when the outbox lands it implements that interface and
the update flow inherits it with no other change.

---

## Release runbook

The release model is unchanged: **merge `dev` into `main`**. See
[RELEASING.md](../RELEASING.md) for the whole pipeline. What in-app updates add:

1. **The release is created as a draft.** `releases/latest/download/latest.json`
   — the endpoint every installed client polls — resolves only to a _published_
   release, so a candidate cannot reach stations while it is still building.
2. **Both desktop targets build from the tagged commit.** macOS universal and
   Windows x64. Each job stamps the version, then proves every desktop version
   source (root and desktop `package.json`, the lockfile entry, `tauri.conf.json`,
   `Cargo.toml`, `Cargo.lock`) matches the tag.
3. **Updater artifacts are signed and then verified.** CI checks every `.sig`
   against the public key embedded in the app before anything is uploaded
   (`scripts/verify-updater-signature.mjs`).
4. **`latest.json` is generated, never hand-written.** From the signatures the
   build actually produced, with the signature _contents_ inline
   (`scripts/updater-manifest.mjs`). It must carry exactly
   `darwin-universal` and `windows-x86_64`, HTTPS URLs for the tagged version,
   and nothing else, or the job fails and the release stays a draft.
5. **The candidate is proved usable before the channel flips.**
   `scripts/check-release-assets.mjs` confirms every file `latest.json` names is
   attached, non-empty, fully uploaded, carrying its signature, not shared
   between two targets — and **actually fetchable**. A draft's assets are not
   served at the public URLs yet, but the same bytes answer a one-byte ranged
   request on the authenticated asset API, so an inaccessible asset stops the
   release rather than reaching stations.
6. **Publishing a desktop release is a second approval.** `publish-desktop` uses
   the protected `production` environment: approving it is the moment software
   already running on stations starts seeing a new version. A web-only release
   publishes straight after its deploy — it changes no update channel.
7. **The published channel is smoke-tested.** `scripts/smoke-updater.mjs`
   re-checks the same bytes at the public URLs clients actually poll.

Check the channel by hand at any time:

```bash
node scripts/smoke-updater.mjs                       # what clients see now
node scripts/smoke-updater.mjs --expect-version 1.2.3
```

### Two deliberate deviations from the original plan

**The version is stamped, then verified — not committed and validated.** The
milestone asked CI to "validate that all version sources already match the tag
rather than rewriting them in CI". PumpOS does the opposite by design:
[RELEASING.md](../RELEASING.md) states "you do not pick or commit the version",
because release-only commits on `main` were the thing that model removed. So
`scripts/release.mjs` stamps, and `scripts/check-desktop-versions.mjs` then
proves every desktop source carries the tag. What that catches is a stamp that
_missed a file_ — a new version source nobody added to the stamper — which is
the real failure mode here. What it cannot catch is a committed version
disagreeing with a tag, because no version is committed.

**The stable endpoint assumes this repository stays public.** GitHub Release
assets on a private repo are not publicly downloadable — it is why the R2
mirror exists for the marketing download page. If `abdullahnettoor/pumpos` is
ever made private, every installed client's check and the post-publish smoke
check start returning 404, and the updater endpoint has to move to the public
R2 base before that happens.

### Which platform keys `latest.json` must carry

The updater resolves an entry by building `{os}-{arch}-{installer}` and then
`{os}-{arch}` **from the machine it is running on** (`Updater::get_urls` in
`tauri-plugin-updater`). So the manifest keys are dictated by the clients, not
by what CI builds:

| Machine           | Keys tried, in order                    |
| ----------------- | --------------------------------------- |
| Apple Silicon Mac | `darwin-aarch64-app`, `darwin-aarch64`  |
| Intel Mac         | `darwin-x86_64-app`, `darwin-x86_64`    |
| Windows x64       | `windows-x86_64-nsis`, `windows-x86_64` |

`darwin-universal` is a **build flavour, not a client key** — nothing ever asks
for it. PumpOS ships one universal macOS artifact, so both Mac keys point at the
same file, exactly as `scripts/gen-download-manifest.mjs` already does for the
download page.

This is what broke v1.3.1: the manifest listed `darwin-universal`, and every Mac
reported _"None of the fallback platforms `["darwin-aarch64-app",
"darwin-aarch64"]` were found"_. Validation passed because the validator, the
generator, the tests and the smoke check all read one constant that encoded the
same wrong assumption. The fix is tested against the client's lookup rule stated
independently, not against that constant.

### Which Windows installer updates

The updater uses the **NSIS** installer (`*-setup.exe`). The MSI stays attached
to the release as a human download only. One format in the manifest keeps the
updater and the release notes describing the same thing.

The installer runs in `passive` mode (`plugins.updater.windows.installMode` in
`tauri.conf.json`): a progress window, no wizard. The operator has already
approved the install inside PumpOS; asking them to click Next three more times
adds nothing, and a fully silent install would hide a failure.

---

## Preview builds

A desktop build of a `dev` commit, for trying a change on real hardware before
it becomes a release. A preview is a **build, not a channel**: you install it by
hand, it updates nothing, and nothing updates to it.

### Getting one

Merging to `dev` queues a preview build that **waits for an approval** — it does
not start on its own. Approve it from the run page and both installers appear as
workflow artifacts; ignore it and it costs nothing, because a job waiting on an
environment approval consumes no runner minutes. macOS runners bill at 10x and
Windows at 2x, which is the whole reason the gate exists.

You can also start one for any branch from **Actions → Desktop preview → Run
workflow**.

Artifacts are attached to the run for 14 days. They are never attached to a
GitHub Release, never published as a prerelease, and never pushed to the public
download bucket.

### What makes a preview safe to install

It installs **alongside** your production PumpOS rather than replacing it. Both
can run; neither knows about the other.

|                    | Production           | Preview                      |
| ------------------ | -------------------- | ---------------------------- |
| Product name       | PumpOS               | PumpOS Preview               |
| Bundle identifier  | `com.pumpos.desktop` | `com.pumpos.desktop.preview` |
| Version            | `1.3.2`              | `1.3.2-preview.<sha>`        |
| Environment badge  | none                 | **Preview**                  |
| Checks for updates | yes                  | **never**                    |
| Updater artifacts  | signed               | **none**                     |
| Backend            | production           | preview API and Supabase     |

The version being a SemVer _prerelease_ is what stops a preview ever presenting
itself as newer than the release it came from, and naming the commit is what
makes a bug report traceable.

A preview build **cannot be signed**. The `desktop-signing` environment is
restricted to `main`, so a `dev`-triggered run cannot read the updater private
key even if it asked — and the build asserts before upload that it produced no
signature, no updater artifact, and nothing carrying the production identity or
a release version. Widening who can trigger a build never widens who can sign
one.

Be precise about where "never checks for updates" comes from: the updater plugin
is still compiled in and still carries the stable endpoint, exactly as in a
release build. What stops it is `shouldEnableUpdates`, which returns false for
every non-production build — asserted by a test that walks each environment. The
preview build's contribution is `VITE_APP_ENV=preview`; the guarantee itself is
the shell's, and it is the same guarantee a local `npm run tauri dev` relies on.

`workflow_dispatch` will build any branch, not just `dev`. That is deliberate —
it is the purest form of "only when I ask" — and it runs under the same
approval gate and the same secret-less environment, so no branch gains anything
by using it.

Preview builds are unsigned at the OS level too, exactly like releases, so
expect the same Gatekeeper and SmartScreen steps described below.

### Owner setup, once

Create a **`desktop-preview`** environment (Settings → Environments) with a
**required reviewer** — that reviewer is the approval gate. Add **no secrets**
to it: the environment exists to make the job wait, not to grant it anything.

## First install (bootstrap)

Releases before in-app updates carry no `latest.json` and no `.sig` assets, so
existing installations cannot be updated in place. Each machine needs **one**
manual install of the first updater-capable release; everything after that is
in-app.

Download only from the official release page:
`https://github.com/abdullahnettoor/pumpos/releases`. Confirm the tag matches
the version you were told to install, and that the asset is listed under that
release. PumpOS is never distributed by email attachment or file-sharing link.

### macOS

PumpOS has no Apple Developer ID, so macOS does not recognise the publisher.

> **Do not click the highlighted button.** On current macOS the refusal dialog
> offers **Move to Bin** and **Cancel** — and Move to Bin is the default. It
> deletes PumpOS. There is no "Open" button on this dialog; approving the app
> happens in System Settings afterwards.

1. Open the `.dmg` and drag PumpOS to Applications.
2. Launch PumpOS. macOS refuses and offers to delete it. Choose **Cancel**.
3. Open **System Settings → Privacy & Security**, scroll to Security, and choose
   **Open Anyway** next to PumpOS.
4. Confirm in the dialog that follows, authenticating if asked.

This happens once per machine. In-app updates afterwards do not repeat it — the
update is applied to an app the user already approved.

Observed on macOS 26.6.2, Apple Silicon, installing `v1.3.1`. Older macOS
releases phrased this as _"cannot be opened because it is from an unidentified
developer"_ and allowed Control-click → Open as a bypass; current versions
removed that path, so System Settings is the only route.

### Windows x64

PumpOS installers are not Authenticode-signed, so SmartScreen may not recognise
the publisher.

1. Run the `-setup.exe` from the official release.
2. If _"Windows protected your PC"_ appears, choose **More info**, confirm the
   app name is PumpOS, then **Run anyway**.
3. Complete the installer.

**No SmartScreen warning was seen** when installing `v1.3.1` on the test
machine. Do not read that as "Windows never warns". SmartScreen is
reputation-based: the same unsigned installer can pass silently on one machine
and be blocked on another depending on how many people have run that exact
file, whether the download carried a mark-of-the-web, and the machine's own
SmartScreen settings. Step 2 stays in these instructions because the first
users of any new release are exactly the case most likely to trigger it.

### Verifying the upgrade path

Before announcing a release that changes the updater, exercise the whole path on
both platforms and record what you saw:

- install the last non-updater build, then manually install the bootstrap
  release, noting the exact Gatekeeper / SmartScreen steps;
- from the bootstrap build, take a higher release in-app: version discovery,
  release notes, progress, postponing, restart-readiness deferral, install,
  relaunch (macOS) or reopen (Windows), the session that survives it, and the
  new version reported in the user menu;
- interrupt a download, and close PumpOS before installing — the previously
  installed version must still launch and the update must still be retryable.

---

## Support and incident recovery

### Telling failures apart

| What the user reports                                             | What it is                                                                                  | What to do                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| "This update could not be verified as an official PumpOS release" | **Tauri signature rejection.** The artifact was not signed with the key this install embeds | Do not work around it. Check the release's `.sig` assets and whether the key was rotated                                 |
| macOS offers to move PumpOS to the Bin on first launch            | **macOS Gatekeeper.** Expected: PumpOS has no Developer ID                                  | Tell them to Cancel — the default button deletes the app — then Open Anyway in Privacy & Security. Not an update failure |
| "Windows protected your PC"                                       | **SmartScreen.** Expected: the installer is unsigned                                        | Confirm the source is the official release, then Run anyway                                                              |
| "PumpOS could not reach the update server"                        | Connectivity                                                                                | Retry later. The installed app is unaffected                                                                             |
| "Restart postponed"                                               | Restart readiness said local writes are unsafe                                              | Let the pending work settle, then Install again                                                                          |

### A bad release

**Never replace an artifact under a published tag.** Clients compare by version;
a swapped installer or `.app.tar.gz` makes two machines reporting "the same
version" different software, and its signature no longer matches what the
manifest promises. Recover by releasing a **higher patch version**. Phase one
has no downgrade path: an older manifest reads as "up to date" and installs
nothing.

**`latest.json` is the exception, and only when no artifact changes.** The
manifest is routing metadata, not software: it says which file each machine
should fetch. Correcting it re-points clients at the _same_ bytes with the
_same_ signatures, so no installation can diverge. That makes it repairable in
place when — and only when — every artifact URL, signature, version and note is
unchanged and the sole fault is which keys carry them.

This was used once, on `v1.3.1`, whose manifest listed `darwin-universal` and
was unreadable by every Mac (see "Which platform keys"). A rebuild would have
produced byte-identical artifacts purely to change two keys. Regenerating the
manifest fixed every client in minutes.

The bar for doing it, all of which must hold:

- No artifact is added, removed, or altered — diff the old and new manifests and
  confirm only platform keys move.
- The version, notes and `pub_date` are unchanged, so the release still
  describes itself identically.
- The corrected manifest passes `scripts/updater-manifest.mjs` validation and
  `scripts/check-release-assets.mjs` against the live release.
- `scripts/smoke-updater.mjs` passes afterwards at the public endpoint.

GitHub's CDN serves the old manifest for a few minutes after the upload; the
smoke check is what confirms the correction has actually propagated. Keep the
replaced manifest until it has.

If any of that does not hold, it is a bad release, not a bad manifest — ship a
higher patch version.

If a release must be pulled before anyone takes it, mark the GitHub Release as a
draft again — `releases/latest` immediately falls back to the previous published
release.

---

## Out of scope in phase one

Linux; Apple Developer ID and notarization; Windows Authenticode; beta, preview
or staged-rollout channels; forced updates and minimum-version enforcement;
downgrades; delta updates; a custom update service; the durable local write
outbox itself.

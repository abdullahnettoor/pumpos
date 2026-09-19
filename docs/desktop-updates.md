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
TAURI_SIGNING_PUBLIC_KEY="$(base64 -i ~/.pumpos/updater.key.pub)" \
  node scripts/updater-key.mjs --stamp
node scripts/updater-key.mjs --check
```

Commit the resulting change to `apps/desktop/src-tauri/tauri.conf.json`. The
script refuses anything that is not a minisign Ed25519 public key, and refuses
outright to write a secret key.

### 3. Store the private key in GitHub

**Settings → Environments → `production` → Environment secrets:**

| Secret                               | Value                               |
| ------------------------------------ | ----------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | contents of `~/.pumpos/updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password from step 1            |

They go in the **`production` environment**, not in repository secrets, so only
an approved release job can read them. The workflow passes them straight to
`tauri-action` as environment variables and never echoes them.

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
5. **Presence is proved before the channel flips.** A draft's assets are not
   reachable at the public URLs clients use, so reachability cannot be tested
   yet — but `scripts/check-release-assets.mjs` confirms every file
   `latest.json` names is attached to the release, with its signature, and that
   no two targets point at one file.
6. **Publication is a second approval.** The `publish` job uses the protected
   `production` environment. Approving it is the moment the stable channel
   changes.
7. **The published channel is smoke-tested.** `scripts/smoke-updater.mjs`
   fetches the real manifest and confirms every referenced asset is reachable.

Check the channel by hand at any time:

```bash
node scripts/smoke-updater.mjs                       # what clients see now
node scripts/smoke-updater.mjs --expect-version 1.2.3
```

### Which Windows installer updates

The updater uses the **NSIS** installer (`*-setup.exe`). The MSI stays attached
to the release as a human download only. One format in the manifest keeps the
updater and the release notes describing the same thing.

The installer runs in `passive` mode (`plugins.updater.windows.installMode` in
`tauri.conf.json`): a progress window, no wizard. The operator has already
approved the install inside PumpOS; asking them to click Next three more times
adds nothing, and a fully silent install would hide a failure.

---

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

1. Open the `.dmg` and drag PumpOS to Applications.
2. The first launch is refused: _"PumpOS cannot be opened because it is from an
   unidentified developer"_ (or _"Apple could not verify PumpOS is free of
   malware"_).
3. Open **System Settings → Privacy & Security**, scroll to Security, and choose
   **Open Anyway** next to PumpOS.
4. Confirm **Open** in the dialog that follows.

This happens once per machine. In-app updates afterwards do not repeat it — the
update is applied to an app the user already approved.

### Windows x64

PumpOS installers are not Authenticode-signed, so SmartScreen may not recognise
the publisher.

1. Run the `-setup.exe` from the official release.
2. If _"Windows protected your PC"_ appears, choose **More info**, confirm the
   app name is PumpOS, then **Run anyway**.
3. Complete the installer.

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

| What the user reports                                             | What it is                                                                                  | What to do                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| "This update could not be verified as an official PumpOS release" | **Tauri signature rejection.** The artifact was not signed with the key this install embeds | Do not work around it. Check the release's `.sig` assets and whether the key was rotated |
| "unidentified developer" / "Open Anyway"                          | **macOS Gatekeeper.** Expected: PumpOS has no Developer ID                                  | Walk through Privacy & Security. Not an update failure                                   |
| "Windows protected your PC"                                       | **SmartScreen.** Expected: the installer is unsigned                                        | Confirm the source is the official release, then Run anyway                              |
| "PumpOS could not reach the update server"                        | Connectivity                                                                                | Retry later. The installed app is unaffected                                             |
| "Restart postponed"                                               | Restart readiness said local writes are unsafe                                              | Let the pending work settle, then Install again                                          |

### A bad release

**Never replace assets under a published tag.** Clients cache and compare by
version; a swapped asset makes two machines running "the same version" different
software.

Recover by releasing a **higher patch version** with the fix. Phase one has no
downgrade path: an older manifest reads as "up to date" and installs nothing.

If a release must be pulled before anyone takes it, mark the GitHub Release as a
draft again — `releases/latest` immediately falls back to the previous published
release.

---

## Out of scope in phase one

Linux; Apple Developer ID and notarization; Windows Authenticode; beta, preview
or staged-rollout channels; forced updates and minimum-version enforcement;
downgrades; delta updates; a custom update service; the durable local write
outbox itself.

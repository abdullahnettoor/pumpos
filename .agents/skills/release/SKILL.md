---
name: release
description: 'Cut a PumpOS release: write the operator summary for everything merged since the last tag, then open the dev to main PR.'
disable-model-invocation: true
---

Cut a release by opening the `dev` → `main` PR, carrying the **operator summary**
for everything that merged since the last tag.

The summary is the only part of a release a station operator ever reads. It
answers one question, and the whole skill exists to answer it well:

> **Should I update now, or after the shift?**

Call that the **shift test**. A change passes it when an operator would notice
the difference during a shift. Everything that fails it belongs in the developer
changelog, which GitHub generates on its own and which no operator sees.

Writing the summary here — in the PR, days or weeks after the work landed — is
deliberate. It is the last moment the whole release is visible at once, and the
only moment a human reviews what stations will be told.

## 1. Pre-flight

```bash
git checkout dev && git pull && git fetch --tags   # tags: next-version.mjs is blind without them
git status --short                                 # must be empty
gh pr list --base main --state open                # a release PR already open means stop
```

Confirm CI is green on `dev` (`gh run list --branch dev --limit 5`). A red `dev`
is a release that fails after tagging, which costs a version number.

**Done when** the tree is clean, tags are local, CI is green, and no release PR
is already open.

## 2. Derive the version

```bash
node scripts/next-version.mjs --json --initial 1.0.0
```

This is the same command the pipeline runs, so its `version` is the version that
will be tagged. Never pick one by hand.

**Done when** you have `vX.Y.Z` from that command, not from a guess.

## 3. Read what merged

```bash
prev=$(git describe --tags --abbrev=0 --match 'v*.*.*')
git log --merges --format='%s%n%b' "$prev"..dev
gh pr view <number> --json title,body     # for each PR whose effect is unclear
```

Work from PR bodies, not commit subjects. A PR body says what changed for whom;
a commit subject says what the diff did.

**If a PR body already carries its own `## For operators` section, take those
sentences verbatim.** They were written when the work was fresh, by the person
who did it, and they outrank anything reconstructed here.

**Done when** every merged PR since `$prev` is either reflected in the summary or
consciously ruled out by the shift test. Not "most" — every one, so a change that
matters to a station cannot fall through the gap between two PRs.

## 4. Write the summary

Write `docs/release-notes/<version>.md` — plain sentences, no heading, no
version number, addressed to whoever runs the station:

```markdown
Shift close now catches wrong entries before they reach the drawer.
Credit customer balances update the moment you save a collection.
```

The file holds only the operator section. The pipeline adds the `## For
operators` heading and GitHub's changelog beneath it.

Rules, in the order they bite:

- **Lead with what the operator does**, not with what the system does. "Shift
  close now catches wrong entries" beats "validation was added to shift close".
- **Two to five sentences.** The notice shows the first line and keeps the rest
  behind "What's new"; a summary longer than a short paragraph is a changelog
  wearing a disguise.
- **Name the thing an operator names it**: shift, drawer, nozzle reading,
  collection, credit customer. The vocabulary is in [`CONTEXT.md`](../../../CONTEXT.md).
- **Say when something is unchanged** if the release might look alarming: "Nothing
  changes in how you open or close a shift" is often the most useful line in it.
- **Write no links, no version numbers, no PR references, no `@handles`.** They
  point at a codebase the operator has no account for, and the cleaner strips
  them anyway — better to never write what would be deleted.

**A release with nothing operator-visible gets no file at all.** Refactors,
tests, CI, docs and internal APIs all fail the shift test. No file means empty
notes, the notice shows the version and the action alone, and the release
publishes exactly as it would otherwise. Silence is a correct answer here and
beats a sentence invented to fill the space.

**Done when** every sentence would make sense read aloud to someone standing at
a pump, and nothing in the file would need stripping by `operatorNotes`.

## 5. Open the PR

```bash
git checkout -b release/<version>
git add docs/release-notes/<version>.md
git commit -m "docs(release): operator summary for v<version>"
node scripts/next-version.mjs --json --initial 1.0.0   # re-derive: the commit above is a new commit
```

If the version moved, rename the file to match before pushing — **the pipeline
reads `docs/release-notes/$VERSION.md` by exact name**, and a mismatched name
ships empty notes rather than failing loudly.

Then open the PR into `main` with the summary quoted in its body, so reviewing
the release means reading what stations will be told:

```bash
gh pr create --base main --head release/<version> --title "Release: <one line>" --body "..."
```

The body should carry the operator summary verbatim, the version, and what is in
the release for a developer audience.

**Done when** the PR is open against `main`, its body quotes the summary, and CI
has started.

## 6. Hand back

Tell the human what happens on merge, because two of the steps are theirs:

1. Merge the PR. The release waits for **production approval** before tagging.
2. On approval it tags, then creates the draft Release with the summary already
   in the body — seeded from the committed file, so nothing has to be typed
   against the clock.
3. Desktop builds run, and the manifest job reads that body into `latest.json`.
   **An edit to the draft body still works, but only until that job runs.**
4. A **second production approval** publishes the release, and stations begin to
   see the update.

## Reference

- [`RELEASING.md`](../../../RELEASING.md) — versioning, what triggers desktop
  builds, the guardrails on `main`.
- [`docs/desktop-updates.md`](../../../docs/desktop-updates.md) — how `notes`
  reaches an installed client, and what the operator sees.
- [`scripts/updater-manifest.mjs`](../../../scripts/updater-manifest.mjs) →
  `operatorNotes` — the cleaner, and the single source of truth for what is
  stripped.

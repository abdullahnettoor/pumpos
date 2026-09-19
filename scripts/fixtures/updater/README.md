# Updater signature fixtures

Real output from `tauri signer`, not hand-assembled — which is the whole point.

The first version of `verify-updater-signature.mjs` only understood minisign's
legacy `Ed` algorithm. Its unit tests passed because they _built their own
fixtures with the same assumption_: a test that constructs its input can only
confirm the implementation is self-consistent with itself. Tauri actually emits
the prehashed `ED` variant (the signature covers BLAKE2b-512 of the file), so
the release gate rejected every genuine artifact and the failure only surfaced
on a real macOS/Windows runner, after a full build.

These three files come from an actual `tauri signer generate` + `tauri signer
sign` run, so the test verifies what Tauri really produces.

- `throwaway.key.pub` — public half of a **throwaway** key pair, generated only
  for this fixture. It signs nothing PumpOS ships. The private half was never
  saved and is unrelated to the release key, which lives in the
  `desktop-signing` environment.
- `artifact.bin` / `artifact.bin.sig` — a small file and its real signature.

To regenerate (if Tauri's format ever changes):

```bash
tmp="$(mktemp -d)"
printf 'PumpOS updater artifact fixture\n' > scripts/fixtures/updater/artifact.bin
npx --workspace=apps/desktop tauri signer generate -w "$tmp/test.key" -p ""
npx --workspace=apps/desktop tauri signer sign -f "$tmp/test.key" -p "" \
  scripts/fixtures/updater/artifact.bin
cp "$tmp/test.key.pub" scripts/fixtures/updater/throwaway.key.pub
```

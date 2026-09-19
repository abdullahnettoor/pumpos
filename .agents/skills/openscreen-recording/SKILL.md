---
name: openscreen-recording
description: Record browser product demos and test flows with OpenScreen. Use when the user asks to record, rehearse, test, or export a screen flow, walkthrough, demo, or POC. Uses semantic browser inspection for reliable targeting, real macOS pointer events for cursor telemetry, dedicated-window capture, checkpoint verification, and post-recording browser-chrome cropping.
---

# OpenScreen recording

Produce a repeatable product-flow recording. Browser automation decides where controls are. Native pointer events perform the visible interaction. OpenScreen records one named window and its cursor telemetry.

Read [`references/browser-workflow.md`](references/browser-workflow.md) before driving a browser flow. Read [`references/post-processing.md`](references/post-processing.md) before cropping or exporting.

## Safety contract

Recording and application mutations require separate explicit approval.

Before starting, state:

- the application and environment;
- the exact flow;
- every business mutation;
- the account or role;
- whether microphone, system audio, or webcam will be captured;
- the local project and export paths;
- whether anything will be uploaded.

The user's request to record a named flow approves recording and the mutations plainly named in that request. Ask before adding a mutation, uploading, sharing, closing a business period, deleting data, or accepting an unexpected warning.

Keep credentials out of scripts, logs, screenshots, and replies. Read them from an existing secure session or environment variables. Show masked values only.

## Workflow

### 1. Turn the request into a flow

Write the flow using [`references/flow-template.yaml`](references/flow-template.yaml). Resolve every choice before recording: environment, role, fixture, dates, amounts, assignments, expected warnings, and final state.

Completion criterion: every step has a semantic target, action, success condition, and mutation label. No step requires improvisation.

### 2. Preflight without recording

Check OpenScreen and its sources:

```bash
env -u ELECTRON_RUN_AS_NODE "/Applications/OpenScreen.app/Contents/MacOS/Openscreen" sources --json
```

Use a dedicated browser profile and fixed window size. Give the page a unique title so OpenScreen cannot select another browser window. Disable password saving, notifications, extensions, translation prompts, and autofill UI in that profile.

Rehearse against read-only steps or disposable data. For production mutations, inspect up to the final commit action, then stop. Confirm the initial state through the product API or visible UI.

Completion criterion: the exact titled window appears in `sources`; every locator resolves once; the browser viewport and macOS window position are stable; the start state matches the flow.

### 3. Build deterministic control

Use Playwright or CDP to locate controls and wait for state. Use it for inspection, field filling when cursor footage is irrelevant, and assertions. Use real macOS pointer movement for every visible click that OpenScreen should track.

Compile the helper once:

```bash
swiftc .agents/skills/openscreen-recording/scripts/real-pointer.swift \
  -o "$TMPDIR/openscreen-real-pointer"
```

Convert a browser locator's center to macOS screen coordinates as documented in the browser workflow reference. Move and click with:

```bash
"$TMPDIR/openscreen-real-pointer" click <x> <y> 420
```

Completion criterion: a dry run moves the physical pointer to every target and each state assertion passes. No screenshot-coordinate estimation remains in the script.

### 4. Record

Start OpenScreen only after the flow runner reports `ready`:

```bash
env -u ELECTRON_RUN_AS_NODE "/Applications/OpenScreen.app/Contents/MacOS/Openscreen" \
  record --window "<unique title>" --duration <seconds> \
  --project "$TMPDIR/<name>.openscreen" --json
```

Prefer a controlled duration with a small buffer. For variable flows, send `SIGINT` after the final assertion and wait for the `done` event. Keep capture local unless the user separately approves upload.

During recording:

- use smooth pointer movement and short rests before clicks;
- wait for semantic success conditions, not fixed sleeps alone;
- capture screenshots only at checkpoints or failures;
- abort on an unexpected dialog, warning, network error, or state;
- verify mutation state before retrying a timed-out action.

Completion criterion: OpenScreen emits `done` with `success: true`, a project path, a source video, and cursor telemetry.

### 5. Validate and crop

Inspect the project:

```bash
env -u ELECTRON_RUN_AS_NODE "/Applications/OpenScreen.app/Contents/MacOS/Openscreen" \
  info "$TMPDIR/<name>.openscreen" --json
```

Crop browser tabs and the URL bar in the OpenScreen project before export. Use the crop helper with measured source pixels:

```bash
node .agents/skills/openscreen-recording/scripts/crop-project.mjs \
  "$TMPDIR/<name>.openscreen" --top <pixels> --write
```

Open the project and visually verify that the crop leaves the entire application viewport visible. Tune cursor size, click effects, background, padding, and manual zoom regions there. Automatic zoom is optional; a successful export may add zero regions even when telemetry exists.

Completion criterion: crop and styling show only intentional content at the target aspect ratio.

### 6. Export and inspect

```bash
env -u ELECTRON_RUN_AS_NODE "/Applications/OpenScreen.app/Contents/MacOS/Openscreen" \
  export "$TMPDIR/<name>.openscreen" -o "$TMPDIR/<name>.mp4" \
  --quality good --json
```

Use `--auto-zoom` only after reviewing its behavior on the flow. Inspect frames at the beginning, every transition, every mutation confirmation, and the final state. Use `ffprobe` to verify duration, dimensions, codec, and frame rate.

Completion criterion: each intended screen and final state appears, no credentials or browser chrome remain, pointer motion matches the actions, and the export ends with OpenScreen's successful `done` event.

## Failure handling

Stop recording on an unexpected product or infrastructure failure. Preserve the `.openscreen` project and logs as diagnostic artifacts. Do not present an interrupted take as a completed demo.

After an ambiguous mutation timeout, query authoritative state before retrying. If state cannot be proven, stop.

## Deliverables

Report:

- flow completed or exact stopping point;
- project and export paths;
- duration, dimensions, frame rate, and size;
- cursor sample and click counts when available;
- mutations verified;
- crop and editing still needed;
- anything captured that makes the take unsuitable for publishing.

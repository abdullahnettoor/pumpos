# Post-processing

## Crop before export

OpenScreen stores the source crop as normalized values in `editor.cropRegion`. Update that project value before export so backgrounds, padding, cursor composition, and zooms use only the application viewport.

Measure the browser chrome in source-video pixels. A common Chrome capture includes tabs and the URL bar at the top. Keep application-owned navigation inside the crop.

```bash
node .agents/skills/openscreen-recording/scripts/crop-project.mjs \
  "$TMPDIR/flow.openscreen" --top 138 --write
```

The helper writes a sibling `.crop-backup` file before changing the project. Run without `--write` to preview normalized values.

Supported edges:

```text
--top <px> --right <px> --bottom <px> --left <px>
```

## Composition

Use a quiet solid or product-colored background. Keep enough padding to separate the application from the video edge. Use a restrained corner radius and shadow. Dense PumpOS screens should remain legible at 1080p.

Set a moderate cursor size. OpenScreen's large default cursor can cover labels and table values. Add click effects only when they improve comprehension.

## Zooms

Automatic zoom reads cursor telemetry and may legitimately produce zero suggestions. Review every generated zoom. For operational dashboards, use manual zooms at decision points rather than zooming every navigation click.

## Inspection

Build a contact sheet or inspect individual frames at known timestamps. Check:

- browser chrome is absent;
- no password manager or permission prompts appear;
- text remains readable;
- cursor is inside the cropped application area;
- transitions have enough hold time;
- the final state is visible before the video ends.

Verify media metadata:

```bash
ffprobe -v error \
  -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate \
  -of json "$TMPDIR/flow.mp4"
```

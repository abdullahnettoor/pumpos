# Drawing post images

Every image is an SVG the agent writes by hand: exact figures, real forecourt
terms, site colours. An image earns its place by showing what prose can't: a
calculation, a flow, a comparison, a checklist. Decoration does not.

## Where files go

`apps/marketing/src/content/blog/images/<slug>/`, referenced relatively from
the post (`./images/<slug>/<name>.svg`). Keep them inside the blog folder: the
Publish Blog workflow copies only `src/content/blog/` from `dev`, so an image
anywhere else (e.g. `public/`) never reaches pumpos.app. Name files for what
they show: `cover.svg`, `drawer-reconciliation.svg`.

## Canvas

| Image       | Size (`width`/`height`/`viewBox`) | Shown                                        |
| ----------- | --------------------------------- | -------------------------------------------- |
| Cover       | 1200 × 630                        | post header, Journal list, link previews     |
| Body figure | 760 wide, any height              | 1:1 in the 760px column, ~45% on a phone     |

Design body figures **mobile-first**: at 45% scale, 24px text reads as 11px,
so no body text under 24px and no figure-level text under 22px. Prefer one
tall column (a ledger, a vertical flow) over a wide row of boxes.

## The cover

The title already sits beside the cover on the Journal list, above it on the
post, and under it in link previews, so the cover never repeats it. A cover is
a **hook plus one picture**:

- **Hook**: two to four words, 84px+, that make the post's point in a new way
  ("Half the litres.", "Five checks. One DSR."). One line, or two short ones.
- **Picture**: one large shape that carries the post's idea: a bar pair, a
  step path, the PumpOS mark. Labels on it 36px+; the Journal shows covers
  about 560px wide, so anything smaller is noise.
- **Background**: differs from the covers of the posts listed beside it. Use
  deep green `#0f2a21`, diesel blue `#12283a` (shapes `#2e5e88`, lines
  `#5b86ad`, text `#d6e3ef`), or soft green `#e5f0eb` with dark text.
- Nothing else: no eyebrow, subtitle or rows of small cards.

## Palette and type

From `src/styles/tokens.css` and the cover backgrounds above; introduce no colour of your own.

| Use                       | Colour    |
| ------------------------- | --------- |
| Primary / positive        | `#1f6a53` on soft fill `#e5f0eb` |
| Mint accent on deep       | `#8fd1b4`, muted text `#b9cdc4` |
| Ink / muted text          | `#18201a` / `#5e6a61` |
| Lines, card borders       | `#d9ded6`, card fill `#f6f7f4` |
| Shortage / variance       | `#b44a3f` on soft fill `#f7e7e4` |
| Warning                   | `#b7811e` on soft fill `#f6eedb` |

Set `font-family="Plus Jakarta Sans, Helvetica, Arial, sans-serif"` on the root
`<svg>`. An SVG shown as `<img>` can't load the site's web font, and CI renders
the cover PNG with whatever sans the runner has (often DejaVu Sans, wider than
Helvetica), so text renders in a fallback face: leave ~15% spare width on every
text line.

## Rules that bite

- **Every figure is true.** Numbers come from the post's own worked example and
  add up; terms match `GLOSSARY.md`.
- **SVG whitespace collapses**: `<tspan>+ </tspan>Label` loses the space. Place
  each piece with its own `x`.
- **Plain SVG only**: shapes, `<text>`, `<path>`. No `<image>`, external
  `href`, `<foreignObject>` or script; the build rasterises the cover with
  sharp, which renders none of them reliably.
- Draw symbols (a tick, an arrow) as `<path>`, not text glyphs: the CI font
  may lack them.
- The PumpOS mark, when wanted, is the path in `public/brand/pumpos-mark.svg`.

## Placing a body figure

```mdx
<figure>

![Alt text that states the figure's numbers and conclusion.](./images/<slug>/<name>.svg)

<figcaption>One line on what to take from it.</figcaption>
</figure>
```

The blank lines inside `<figure>` are required for MDX to parse the image.
Alt text carries the content for screen readers and search: the figures and
the conclusion, not "diagram of…".

## Looking at it

Render each SVG to PNG and read the PNG before calling it done:

```bash
cd apps/marketing
node -e "require('sharp')('src/content/blog/images/<slug>/<name>.svg').png().toFile('/tmp/<name>.png')"
```

Check for text overflowing its box, collapsed spaces, overlaps, and wrong
numbers.

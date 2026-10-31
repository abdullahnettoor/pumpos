---
name: blog
description: 'Write or refresh a PumpOS blog post for search: pick the query, write the MDX, draw its SVG cover and infographics, and open the PR to dev. Use when asked to write, draft, update or publish a blog/journal post, or add images to one.'
---

A post earns its place by answering **one search query** an Indian station owner
or manager actually types, better than anything else on page one. Call that the
**target query**. Every step below serves it; a post that serves two queries
ranks for neither.

Posts are MDX in `apps/marketing/src/content/blog/`. The file name is the URL
(`<slug>.mdx` → `/blog/<slug>/`), and the frontmatter schema lives in
`apps/marketing/src/content.config.ts`. Its images live beside it in
`images/<slug>/`. The index, post page, RSS feed and sitemap pick a post up on
their own.

**Refreshing an existing post?** Skip to step 3 and keep the file name: the URL
is what has ranked, and renaming it throws that away.

## 1. Pick the target query

Choose one query, phrased the way a searcher writes it: "petrol pump DSR
format", "fuel station stock variance", "how to do tank dip reading". Long-tail
and India-specific beats broad: an owner searching "density check at
decantation" is a buyer; one searching "fuel" is not.

Read the frontmatter of every existing post. If one already targets the query,
refresh that post instead of writing a second one that competes with it.

**Done when** you can state the target query in one line and no existing post
targets it.

## 2. Gather the facts

Collect what the post will claim, with a source for each:

- **Industry facts** (OMC policy, fees, regulations, dealer news): a dated
  primary source. Note any figure that may change, so the PR body can flag it.
- **PumpOS claims**: only what the product does today. Check the feature against
  `GLOSSARY.md`, the `/features/*` pages, or the code. A claim about a planned
  feature is a claim the reader will test in a demo.
- **Quotes from public forums**: quote the words, never the username.

**Done when** every claim the post will make has a source you could paste into
the PR body.

## 3. Write the frontmatter

```yaml
---
title: "Day closing and DSR for any OMC dealership"
description: "A practical guide to end-of-day reconciliation for Indian fuel stations: ..."
publishedAt: 2026-10-05
updatedAt: 2026-10-05
tags: ["operations", "guide"]
cover: ./images/day-closing-and-dsr-guide/cover.svg
coverAlt: "Close the day before staff leave: nozzle readings, drawers, tank dips, credit sales, then the saved DSR."
draft: true
---
```

- **`title`**: carries the target query, 60 characters or fewer (the layout
  appends ` | PumpOS`, and Google cuts longer titles).
- **`description`**: 150–160 characters, answers the query in one sentence. It
  is the snippet under the search result, so write it to be clicked.
- **File name**: the target query in lowercase-hyphenated words, short, no date.
- **`publishedAt`**: when it goes live. Today or earlier goes live as soon as
  the PR merges. A future date (`2026-10-20`) goes live at 06:00 IST that
  morning. A future time (`2026-10-20T16:15:00+05:30`) waits for the next
  06:00 IST run, or a manual run at that time. Until then the post shows on
  preview builds only.
- **`updatedAt`**: set it on a refresh only when the substance changed (new
  facts, new section). A typo fix is not an update.
- **`tags`**: reuse the tags existing posts already use before inventing one.
  The **first tag is the post's topic**: the Journal shows it on the post and
  offers it as a filter, so lead with the broad one (`operations`, `owners`,
  `product`), not a narrow one like `cash-flow`.
- **`cover`** / **`coverAlt`**: the post's cover, drawn in step 5. It heads the
  post, fronts its Journal entry, and becomes the PNG link preview on
  WhatsApp, LinkedIn and Google. `coverAlt` is required with it.
- **`draft`**: `true` while the post is unfinished; it hides the post
  everywhere, preview included. Set `false` with a future `publishedAt` to
  schedule it.

**Done when** the title and description both contain the target query and fit
their lengths.

## 4. Write the body

- **Open by answering the query** in the first two paragraphs. The searcher
  decides in seconds whether they landed in the right place.
- **One `##` per sub-question** the searcher has next, in the order they would
  ask it. The layout renders the title as the `h1`, so start the body at `##`.
- **Write in forecourt vocabulary**: nozzle reading, shift, drawer, tank dip,
  decantation, DSR, credit customer, OMC, IOCL/BPCL/HPCL. Use the terms as
  `GLOSSARY.md` defines them; that is what the product and its docs call them.
- **Concrete over general**: a worked example in rupees and litres, a checklist
  an operator can follow tonight. Specific forecourt detail is what generic
  content cannot copy, and it is what the post ranks on.
- **Link two to four internal pages** with descriptive anchor text: the matching
  `/features/*` page, a `/docs/*` page, a related post. Links are root-relative,
  e.g. `[how shift drawers reconcile](/features/shifts-and-drawers)`.
- **End on one next step**: `/demo` or the relevant feature page.

Then run the `unslop` skill over the whole post.

**Done when** the post answers the target query above the first `##`, carries
two to four internal links, and has been through `unslop`.

## 5. Draw the images

Every post gets a **cover**: a short hook and one picture, never the title.
Then give each worked example, formula or
sequence in the body a **figure** when seeing it beats reading it: a drawer
reconciliation as a ledger, a day-close as a flow, a variance as a comparison.
Most posts carry one to three; a figure that restates a sentence is clutter.

Draw them as hand-written SVG, following [`IMAGES.md`](IMAGES.md) for where
files go, canvas sizes, palette, mobile legibility and how to place them.

**Done when** the cover and every figure have been rendered to PNG and
inspected, every number in them matches the post, and each has alt text that
states its content.

## 6. Build it

```bash
cd apps/marketing && npm install
PUBLIC_BLOG_SHOW_SCHEDULED=true npm run build && npm run check:links
```

The build validates the frontmatter against the schema, and `check:links` fails
on any internal link, image or `og:image` that does not exist. With
`draft: false`, confirm `dist/blog/<slug>/index.html` exists and its
`og:image` is a `.png`; with `draft: true`, confirm the page does not exist.

**Done when** the build and link check pass and the page is present or absent
as `draft` says.

## 7. Open the PR to dev

```bash
git checkout dev && git pull
git checkout -b docs/blog-<slug>
git add apps/marketing/src/content/blog/<slug>.mdx apps/marketing/src/content/blog/images/<slug>
git commit -m "docs(marketing): <add|update> post on <topic>"
gh pr create --base dev --title "docs(marketing): <add|update> post on <topic>" --body "..."
```

The PR body states the target query, the sources from step 2, when the post
goes live (draft, or the `publishedAt` time), and anything to recheck before
then (a fee, a date, a missing link).

Tell the user how the post goes live, because merging is not publishing:

1. The PR gets a marketing preview build, scheduled posts included.
2. Merging to `dev` deploys the preview site.
3. The **Publish Blog** workflow (`.github/workflows/publish-blog.yml`) puts it
   on `pumpos.app` without an app release: at once on merge when
   `publishedAt` has passed, otherwise at 06:00 IST on its date. Edits to a
   live post, new images included, also go out on merge.
4. A post timed for a precise hour needs a manual run at that time: Actions →
   Publish Blog → Run workflow.

**Done when** the PR is open against `dev` and the user knows when the post will
reach `pumpos.app`.

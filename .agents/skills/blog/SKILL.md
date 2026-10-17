---
name: blog
description: 'Write or refresh a PumpOS blog post for search: pick the query, write the MDX, and open the PR to dev. Use when asked to write, draft, update or publish a blog/journal post.'
---

A post earns its place by answering **one search query** an Indian station owner
or manager actually types, better than anything else on page one. Call that the
**target query**. Every step below serves it; a post that serves two queries
ranks for neither.

Posts are MDX in `apps/marketing/src/content/blog/`. The file name is the URL
(`<slug>.mdx` → `/blog/<slug>/`), and the frontmatter schema lives in
`apps/marketing/src/content.config.ts`. The index, post page, RSS feed and
sitemap pick a post up on their own.

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
draft: true
---
```

- **`title`**: carries the target query, 60 characters or fewer (the layout
  appends ` | PumpOS`, and Google cuts longer titles).
- **`description`**: 150–160 characters, answers the query in one sentence. It
  is the snippet under the search result, so write it to be clicked.
- **File name**: the target query in lowercase-hyphenated words, short, no date.
- **`publishedAt`**: the day it goes live. A future date does **not** hide a
  post; only `draft: true` does.
- **`updatedAt`**: set it on a refresh only when the substance changed (new
  facts, new section). A typo fix is not an update.
- **`tags`**: reuse the tags existing posts already use before inventing one.
- **`draft`**: `true` unless the user asked to publish now.

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

## 5. Build it

```bash
cd apps/marketing && npm install && npm run build
```

The build validates the frontmatter against the schema. With `draft: false`,
confirm `dist/blog/<slug>/index.html` exists; with `draft: true`, confirm it
does not.

**Done when** the build passes and the page is present or absent as `draft`
says.

## 6. Open the PR to dev

```bash
git checkout dev && git pull
git checkout -b docs/blog-<slug>
git add apps/marketing/src/content/blog/<slug>.mdx
git commit -m "docs(marketing): <add|update> post on <topic>"
gh pr create --base dev --title "docs(marketing): <add|update> post on <topic>" --body "..."
```

The PR body states the target query, the sources from step 2, whether the post
ships as a draft, and anything to recheck before publishing (a fee, a date, a
missing link).

Tell the user how the post goes live, because it is not when the PR merges:

1. The PR gets a marketing preview build.
2. Merging to `dev` deploys the preview site.
3. `pumpos.app` gets it with the **next app release** (the `release` skill's
   `dev` → `main` promotion), which deploys every app.
4. A draft stays hidden everywhere until a later PR sets `draft: false`, which
   in turn reaches production with the release after it.

**Done when** the PR is open against `dev` and the user knows which release will
carry the post to `pumpos.app`.

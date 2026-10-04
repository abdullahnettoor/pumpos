# PumpOS marketing

Static Astro website. Install and run commands from this directory because the
marketing app has its own lockfile and is not a root workspace.

```sh
npm install
npm run dev
npm run build
npm run preview
```

## Configuration

| Variable | Purpose |
| --- | --- |\
| `SITE` | Canonical origin, sitemap and sharing URLs |
| `PUBLIC_CONSOLE_URL` | Web console destination |
| `PUBLIC_DOWNLOAD_MANIFEST_URL` | Runtime installer availability manifest |
| `PUBLIC_DEMO_BOOKING_URL` | Optional HTTPS Cal.com booking URL |

Without a booking URL, `/demo` offers email-based scheduling. Unavailable
installers have no download link. Final legal copy is a publication dependency.

## Design and content

The confirmed brief and verification record live in
`../../docs/marketing-redesign-brief.md`.

- `src/styles/site.css` composes the marketing styles and product illustrations.
- `src/styles/tokens.css` and `src/styles/ds.css` define the design system tokens and component styles.
- `src/components/ds/` contains the design system Astro components.
- `src/components/marketing-preview` contains the selected, shared site components.
- `src/scripts/collection-tour.ts` owns the sample-data walkthrough state and motion.
- `src/content` contains the MDX documentation and journal entries.
- `src/brand-mark.mjs` parses the canonical mark that `npm run brand` copies into
  `public/brand/`. It is the only reader of that artwork; nothing restates the path.
- `/design-system` is a development-only showcase of design tokens, components, and rules.

The customer walkthrough is a labelled product illustration. It does not call
the API or create transactions. Autoplay begins once on entry into the viewport,
stops offscreen and respects reduced motion. All scenes remain readable without
JavaScript.

## Local assets

```sh
node scripts/download-brand-fonts.mjs
node scripts/generate-social-image.mjs
```

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
| --- | --- |
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
- `src/components/marketing-preview` contains the selected, shared site components.
- `src/scripts/collection-tour.ts` owns the sample-data walkthrough state and motion.
- `src/content` contains the MDX documentation and journal entries.
- `/design-review/identity` and `/design-review/home` are development-only studies.

The customer walkthrough is a labelled product illustration. It does not call
the API or create transactions. Autoplay begins once on entry into the viewport,
stops offscreen and respects reduced motion. All scenes remain readable without
JavaScript.

## Local assets

```sh
node scripts/download-brand-fonts.mjs
node scripts/generate-social-image.mjs
```

Font licences are stored beside the WOFF2 files. The image generator uses Astro's
installed Sharp dependency to produce the 1200 × 630 raster social card.

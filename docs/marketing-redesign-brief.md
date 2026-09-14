# PumpOS marketing redesign

Status: full-site redesign implemented and verified locally; preview delivery ready.

## Agreed direction

- Keep Astro as the marketing stack.
- Redesign the public site's design, motion, content and copy from scratch.
- Primary audience: single-station owners in India currently using registers,
  Excel and WhatsApp. Support their buying decision with enough product detail
  for a station manager to evaluate daily use.
- Lead with trustworthy numbers and direct owner access to customer dues,
  collections and other financial information without waiting for staff to
  prepare an update. Independent access does not imply automatic data capture.
- Primary conversion: book a guided demo. Provide a short product walkthrough
  that visitors can explore before booking.
- Retain the PumpOS name and petrol green as brand anchors.
- Create a proper logo. The current letter marks are not an established logo.
- Reconsider typography, composition, imagery and all marketing copy. Give the
  website an expressive visual language related to the operator product.
- Use a product-led direction, with real station imagery where it adds context.
  Aim for one memorable animated sequence that explains a product workflow.
  Avoid generic floating cards and repeated scroll fades.
- Design the whole site's structure and shared visual system. Establish the
  standard through the homepage and demo journey, then carry it through the
  supporting pages.
- There are no real customers yet. Use product demonstrations with clearly
  identified sample data as initial evidence.
- Start with English for India and mobile-first reading. Prefer self-hosted
  open-source fonts. Provide a complete reduced-motion experience and normal
  scrolling, with more ambitious motion on capable devices.
- Publish one launch offer, PumpOS Pilot, with the owner financial visibility
  demonstrated on the site. Use "Pricing discussed during your demo" rather
  than a public amount. Keep this strategy until there is customer traction.
  Revisit pricing using real pilot feedback; no numerical traction threshold
  has been set.
- Place pricing on the homepage initially. A short "What's next" section may
  describe verified planned expansion, clearly separated from the launch offer.
  Do not present future capabilities as purchasable tiers.

## Homepage story and visual direction

Lead with an owner's question and show the recorded evidence that answers it.
The agreed sample-data sequence starts with a customer owing ₹42,500. A ₹15,000
collection is recorded, leaving ₹27,500 outstanding. The owner can inspect the
statement on their phone. The presentation must not imply unimplemented instant
cross-device updates.

Use Shift close as the supporting story: Nozzle Readings derive Fuel Sales;
Drawer reconciliation exposes differences; a Shift Summary and the Business
Day's DSSR provide the report trail. Keep the customer-ledger example distinct
from Drawer cash so the demonstration does not imply that every Collection
touches the Drawer.

Use a strong petrol-green opening, a distinctive PumpOS mark, a direct headline
and one legible financial example. Transition into lighter product demonstrations
with deliberate changes in scale and spacing. Typography can have marketing
character while financial figures remain easy to read. Product imagery carries
the initial design; add station photography later when suitable assets exist.

## Launch page inventory

- Home: owner promise, walkthrough, operational evidence, pilot offer and demo
  invitation.
- Product: deeper explanations of Shifts, stock, credit and financial visibility.
- Book a demo: what the demo covers, who it is for and the scheduling entry point.
- Downloads: available installers and clear availability states.
- Docs and blog: redesigned templates retaining useful existing content.
- Legal pages: consistent presentation; final launch text still needs resolution.

Separate feature and pricing pages are deferred until they have enough useful
content to justify a page.

## Decisions delegated to the designer

The user delegated launch positioning, logo direction and booking mechanism.
Selected direction:

- Launch as a guided pilot with hands-on onboarding. Describe verified current
  capabilities rather than presenting the platform as generally available.
- Develop a custom PumpOS wordmark and P monogram, usable in one colour and at
  app-icon, favicon and report-mark sizes. Explore distinct concepts before
  final artwork approval.
- Use hosted Cal.com scheduling for a guided demo, linked from the site rather
  than loaded as an always-on embed. Keep the walkthrough ungated. A configured
  booking account, event URL and availability are launch dependencies; none
  exist in the repository. Booking configuration is not yet complete.
- Use a short introductory animation followed by a visitor-controlled walkthrough
  with Customer dues, Collections, Shift close and Daily report scenes. Each
  scene has a readable resting state, replay controls and concise explanation.
  On mobile, show focused details instead of scaling down a desktop dashboard.
  Reduced motion preserves all information without requiring animation.

## Research findings

Source inspection of `apps/marketing` found a twelve-section homepage, synthetic
product panels, minimal motion, and demo links implemented as email links.
The public routes include downloads, docs, a blog and legal pages. The repository
contains no marketing photography, actual product screenshots or verified
customer case studies. This does not establish whether assets exist elsewhere.

Some existing claims conflict with the documented product scope. In particular,
AGENTS.md defines online-primary resilience, not offline-first operation.
Multi-station visibility and owner notifications require capability verification
before reuse in new copy. Product demonstrations must respect the Business Day,
Shift, Drawer and DSSR definitions in `CONTEXT.md` and the rules in `AGENTS.md`.

Further source inspection confirms owner access to customer balances, collection
and credit registers, financial accounts and reports on the console, plus
read-oriented mobile financial views. These are credible demonstration subjects,
subject to runtime verification. Query stale times do not establish continuous
refresh across devices. Do not promise instant phone updates. Fuel-sale dashboard
totals use closed shifts; avoid presenting those as live nozzle telemetry.

The older `docs/initial/Product Packaging & Pricing Strategy (v2).md` proposes
Core at ₹799/month, Pro at ₹1,999–₹2,399/month, and Enterprise at
₹4,999–₹5,999/month. These are not approved launch prices. Its Core exclusions
also conflict with the proposed owner-financial-visibility story. The launch
offer should not inherit that matrix without a new commercial decision.

## Creative approval process

Two checkpoints precede the full-site rollout:

1. Compare three distinct monogram concepts in the homepage opening, app icon
   and report header. Include typography and colour treatment so the review
   evaluates each identity in context.
2. Implement the selected homepage opening and one complete walkthrough scene
   in Astro. Review the working experience on desktop and mobile before extending
   it across the site.

## Acceptance criteria

- The opening communicates the audience, value and next action without scrolling.
- Every product claim matches an available capability. Demonstrations use
  coherent, clearly labelled sample data.
- Mobile has deliberately composed layouts, readable financial details and
  touch-friendly controls.
- Meet WCAG 2.2 AA, including keyboard navigation and contrast; honour reduced
  motion throughout.
- Core content remains accessible if animation scripts fail.
- Target Lighthouse mobile performance of at least 95 on the main pages,
  measured against a production build.
- Verify every CTA, download availability state and navigation path. Review
  titles, social previews, sitemap and preservation or redirection of existing
  URLs.

## Delivery boundary

The first delivery ends with the implemented site running in preview for user
review. Production publication follows separately once booking is configured
and launch content is ready. Final legal content is a publication dependency
because the existing legal pages contain placeholder text.

Use configurable booking details during implementation. Prefer existing tools
and open-source assets; no paid purchases are needed to establish the design.
No fixed deadline or paid-asset budget has been supplied.

## Implementation verification still required

- Runtime verification of the exact product screens and capabilities used in
  demonstrations, using coherent sample data.
- Final logo artwork, responsive compositions and motion behavior.
- Booking event URL and availability; installer availability; final legal text.

## Confirmation record

The user approved the first interview round's recommendations for audience,
conversion, brand continuity, product-led art direction and whole-site scope.
They explicitly added logo design because PumpOS does not yet have a logo.

In the second round, the user approved the trustworthy-numbers narrative and
added independent owner access to credit and financial information. They
confirmed there are no customers, delegated launch/logo/booking decisions,
requested simple pricing with future-tier hints, and approved the recommended
language, typography sourcing, mobile and reduced-motion direction.

In the third round, the user approved quote-based pilot pricing until customer
traction, the owner-question/sample-ledger story, the petrol-green product-led
visual direction and the launch page inventory. They delegated walkthrough
interaction details to the designer.

In the final interview round, the user approved both creative checkpoints, all
acceptance criteria and the preview-first delivery boundary. The consolidated
brief is now ready for final confirmation before creative implementation begins.

The user subsequently confirmed the consolidated brief and authorised the first
creative checkpoint.

## First creative checkpoint

Local preview: `/design-review/identity` in the Astro development server.
The review route is excluded from production generation and marked noindex.

| Direction | Monogram | Typography | Homepage composition |
| --- | --- | --- | --- |
| A: Open ledger | Cut-open P with inset entry | Barlow Semi Condensed + Public Sans | Petrol-green opening, left-aligned headline, statement alongside |
| B: Continuity | Continuous rounded P | Sora + Public Sans | Centred opening, wide statement read left to right |
| C: Station stamp | Solid chamfered P | Archivo + Public Sans | White reading column beside green statement area |

Each concept includes a homepage opening, app icon, 16/24/32 px mark specimens,
one-colour report header and palette/type sample. The designer recommends A;
the user's selection is pending. Wordmark typography is exploratory and will
receive final optical refinement with the selected monogram.

These are identity compositions with labelled illustrative financial data, not
the production product walkthrough or actual app screenshots. Preview demo
links lead to an explanatory note. Exploration loads fonts from Google Fonts;
the chosen families will be self-hosted for the approved implementation.

Verification: Astro production build passed and excluded the review route.
All three directions were visually inspected at 1440 px and 390 px. Layout
checks found no viewport overflow at 320, 390 or 768 px and no broken in-page
targets at 390 px. Full-site accessibility and Lighthouse acceptance checks
remain part of the production implementation checkpoint.

## Selected identity

The user selected C's Station stamp monogram and delegated the website design
choice. Use that solid, chamfered P with A's petrol-green, statement-led opening.
Retain A's Barlow Semi Condensed display and Public Sans reading typography;
refine the wordmark spacing to suit the heavier symbol.

The second checkpoint implements the opening and one complete collection
walkthrough. Its sample data follows a customer statement from ₹42,500 due,
through a ₹15,000 bank collection, to ₹27,500 outstanding and an owner phone
view. The bank collection does not touch Drawer cash. Demonstration transitions
do not claim instant cross-device data delivery. Use existing desktop and mobile
statement fields as the basis for focused, labelled product illustrations.

## Second creative checkpoint

Local preview: `/design-review/home`. The page combines the selected C monogram
with A's opening composition and a four-step collection story. The demo has
direct step selection, previous/next buttons, keyboard tab navigation, timed
playback, pause and replay. Playback stops when the document is hidden or the
walkthrough leaves the viewport. Reduced motion removes animated transitions;
all four scenes are present in the initial HTML for a no-script reading path.

The chosen fonts are self-hosted WOFF2 assets with their OFL licences. Together
they total about 50 KB. `scripts/download-brand-fonts.mjs` in the marketing app
records the sources. The contact section uses a working email link and explicitly
states that calendar booking awaits configuration.

Verification completed for this checkpoint:

- Astro production build and strict TypeScript check of the walkthrough module.
- Desktop opening/walkthrough and mobile statement/owner-view visual checks.
- All four scenes checked for viewport overflow at 320, 390 and 768 px.
- Keyboard selection and focus, timed advancement, pause, replay and completion.
- Reduced-motion branch checked with a simulated media-query preference: scene
  selection works and creates no animations.
- Initial HTML checked: all four panels readable, script-only controls hidden.
- Main opening text contrast and in-page link targets checked in the browser.

Full-site performance and accessibility acceptance remain due after rollout.
The live booking configuration and the remaining site pages are outside this
checkpoint. User review of the opening and walkthrough is pending.

## Full-site rollout direction

The user approved the look and delegated further visual decisions, explicitly
requesting no more approval questions. Refine the wordmark using a wider Public
Sans medium/semibold treatment instead of condensed display lettering. Preserve
the C monogram and petrol-green opening.

Start walkthrough playback automatically when it enters view, once per page
visit. Keep pause, replay and direct navigation. Do not autoplay for reduced
motion; pause when offscreen or the page is hidden. Add restrained, one-time
product-detail transitions and responsive navigation feedback across the site.

Replicate the actual customer statement structure: Plus Jakarta Sans and Geist
Mono, alternate-surface customer summary, credit limit/available credit, separate
debit and credit columns, newest-first entries and two-decimal Indian currency.
Use a right-hand drawer treatment on desktop and readable condensed illustrations
on mobile. Keep sample-data labels; these are faithful illustrations, not live
screenshots. Extend the selected system across all agreed public routes.

## Delivery

The public routes now use the selected identity, wider wordmark and shared
marketing system: Home, Product, Demo, Downloads, Docs, Journal, article pages,
legal pages and 404. Previous docs/article URLs are preserved. Historical identity
studies remain development-only routes.

The walkthrough autoplays once when its scene area enters view, advances at
six-second intervals and stops after the owner view. Visitors can pause, replay,
use previous/next or select a step directly. Manual interaction prevents a later
autoplay restart. Reduced motion disables autoplay and animated transitions.
Product illustrations now use the actual app's typography, summary fields,
drawer treatment and newest-first debit/credit ledger layout. Sample-data
illustrations remain explicitly identified.

Subtle product-detail entrances, navigation underlines, disclosure icons and
button transitions supply motion without scroll hijacking or hidden-by-default
content. Fonts and the raster social-sharing image are served locally.

### Verification

- Astro production build and strict TypeScript checks passed.
- Main public routes and internal page links checked; each content page has one
  H1 and route-specific title/description/canonical metadata.
- Mobile layout checks at 390 px across public pages; 320 px checks across the
  main routes and all four walkthrough scenes. Corrected FAQ overflow and the
  mobile ledger footer during this pass.
- Keyboard navigation, mobile menu Escape/focus, autoplay, direct selection,
  pause and reduced-motion branch verified. No-script HTML exposes every scene.
- Production docs search returns matching guide/article results. Download page
  correctly reports the all-null bundled manifest and exposes no fake links.
- Legal drafts and 404 are noindex; sitemap excludes legal drafts and 404.

Mobile Lighthouse against the local production build:

| Page | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home | 99 | 100 | 100 | 100 | 1.7 s | 0 | 0 ms |
| Product | 100 | 100 | 100 | 100 | 1.7 s | 0 | 0 ms |
| Demo | 100 | 100 | 100 | 100 | 1.2 s | 0 | 0 ms |

These are local lab measurements, not field results. Automated accessibility
scores supplement the manual checks and do not certify complete WCAG compliance.

### Launch configuration

- Set `PUBLIC_DEMO_BOOKING_URL` to the configured HTTPS Cal.com event URL.
  Until then the Demo page truthfully offers email-based scheduling.
- Set `SITE`, `PUBLIC_CONSOLE_URL` and `PUBLIC_DOWNLOAD_MANIFEST_URL` for the
  intended environment. Installer availability follows that manifest.
- Supply final legal policies before publication. Legal pages currently identify
  themselves as draft information rather than presenting invented final terms.

No production deployment was performed. The completed redesign is available in
the local development and production-preview servers for review.

## Pending launch tickets and corrected contact status

The founder confirmed that no custom email or Cal.com account is configured.
Earlier references to a "working email link" describe link syntax only, not
verified delivery. `hello@pumpos.app` must not be treated as a monitored inbox.

- [#33: Contact and demo booking](https://github.com/abdullahnettoor/pumpos/issues/33)
  tracks a verified existing inbox, optional `pumpos@abdullahnettoor.com` inbound
  alias, centralized public contact configuration and free individual Cal.com
  setup. No alias, account or booking URL has been created.
- [#32: Privacy and pilot terms](https://github.com/abdullahnettoor/pumpos/issues/32)
  tracks factual preparation, founder decisions, review and final publication.

The founder's primary domain is `abdullahnettoor.com`. Avoid new recurring
scheduling fees before customer traction. Cal.com's Individual plan was verified
as free on 14 Sep 2026; a founder-owned account with a PumpOS event is the
recommended starting point. Inbound forwarding does not establish outbound
send-as capability. Verify receive/reply behavior before publishing an alias.

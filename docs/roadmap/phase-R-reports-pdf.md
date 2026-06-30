# Phase R — Reports & PDF Hardening

**Status:** mostly done (R1–R3 shipped; R4 server PDF + R5 distribution remain). **Goal:** branded, configurable, cross-platform reports (web, Windows, macOS, mobile) generated on demand from immutable snapshots.

## What exists
- Scoped print CSS (`.print-area`/`.no-print`) — `window.print()` captures only the report.
- Client PDF: `@react-pdf/renderer` for Shift Summary (`packages/ui/src/services/reports/shiftSummaryDoc.tsx`) **and DSSR** (`dssrDoc.tsx`, reuses the shared primitive kit). `html2pdf` retained only as a generic fallback.
- Pluggable saver `exportPdf.ts` (web download / desktop Tauri dialog+fs).
- Self-hosted IBM Plex Sans/Mono (`scripts/download-fonts.mjs`, run `npm run fonts`).
- Tauri plugins (dialog, fs) wired; capabilities set.

## R1 — Shift Summary polish ✅ done
- Letterhead band: legal/trade name + GSTIN · RO code · fuel brand · address sub-line; dealer-uploaded
  logo (base64 in `settings.logo_data_url`) rendered on both reports. `LetterheadBand` shared by both docs.
- Branding captured in `stations.settings.legal` + `fuel_brand` + `logo_data_url`, editable in Station Overview.
- (NOTE: we do not bundle OMC trademark logos — dealers upload their own; `fuel_brand` is a display label.)

## R2 — Configurable report (station-picked sections) ✅ done
- `settings.report_config = { shiftSummary: string[], dssr: string[] }` (ordered enabled sections).
- Station Overview “Report Sections” toggles per report (`header` always on). Views build `config.sections`
  from it, falling back to defaults. Reorder (drag) is a future enhancement; toggle shipped.

## R3 — DSSR template ✅ done
- DSSR ported html2pdf → react-pdf (`dssrDoc.tsx`) using the same primitives + mono fonts.
- Shared kit exported from `shiftSummaryDoc.tsx` (`C`, `s`, `TableView`, `Kpi`, formatters) and reused.
- Sections: header, meta, KPIs, financial summary, fuel-by-product, nozzle aggregation, fuel stock variance (L), merchandise stock variance (units), included shifts. Config-driven (`DEFAULT_DSSR_CONFIG`).

## R4 — Server PDF endpoint (mobile-proof)
- `GET /reports/shift/:id.pdf`, `/reports/dssr/:id.pdf` (Hono). Auth + org match.
- Engine: react-pdf on Worker (`nodejs_compat`) OR Cloudflare Browser Rendering for exact UI parity.
- On demand (no cache initially); later R2 cache key `id+configHash`.

## R5 — Distribution
- GitHub Actions `tauri-action` matrix (macOS + Windows) → `.dmg`/`.msi`. WebView2 prereq doc.

## Expansion
- Email/WhatsApp report delivery; scheduled DSSR; XLSX export; multi-language; watermark for drafts.

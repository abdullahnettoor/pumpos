# Phase R — Reports & PDF Hardening

**Status:** in progress. **Goal:** branded, configurable, cross-platform reports (web, Windows, macOS, mobile) generated on demand from immutable snapshots.

## What exists
- Scoped print CSS (`.print-area`/`.no-print`) — `window.print()` captures only the report.
- Client PDF: `@react-pdf/renderer` for Shift Summary (`packages/ui/src/services/reports/shiftSummaryDoc.tsx`) **and DSSR** (`dssrDoc.tsx`, reuses the shared primitive kit). `html2pdf` retained only as a generic fallback.
- Pluggable saver `exportPdf.ts` (web download / desktop Tauri dialog+fs).
- Self-hosted IBM Plex Sans/Mono (`scripts/download-fonts.mjs`, run `npm run fonts`).
- Tauri plugins (dialog, fs) wired; capabilities set.

## R1 — Shift Summary polish
- Station logo (base64/asset) in header; GSTIN/address letterhead.
- Section registry already present (`ReportConfig.sections`); add `terminals`, `dipReadings`, `stockVariance` renderers.

## R2 — Configurable report (station-picked sections)
- `report_config` JSONB in station settings: `{ sections[], showLogo, paper, accentColor }`.
- Settings UI: drag-order + toggle sections; live preview reuses the same `<ShiftSummaryDoc>`.
- Default applied when unset.

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

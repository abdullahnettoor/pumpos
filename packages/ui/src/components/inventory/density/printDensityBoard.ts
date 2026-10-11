import type { DensityTodaySummary } from '@pump/shared';

export function printDensityBoard(summary: DensityTodaySummary, stationName: string) {
  const cells = summary.products
    .map((p) => {
      const val = p.latestToday ? p.latestToday.density15.toFixed(1) : '— — —';
      const missingClass = p.latestToday ? '' : 'missing';
      const status = p.latestToday ? 'kg/m³' : 'kg/m³ · not recorded today';
      return `<div class="prod-card">
        <div class="prod-name">${p.productName} (${p.productCode})</div>
        <div class="density-val ${missingClass}">${val}</div>
        <div class="density-unit">${status}</div>
      </div>`;
    })
    .join('');

  const w = window.open('', '_blank', 'width=1100,height=780');
  if (!w) return;

  w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Density Board - ${summary.businessDate}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #111827;
      margin: 0;
      background: #fff;
    }
    .board-container {
      border: 4px solid #111827;
      border-radius: 16px;
      padding: 28px 36px;
      height: 175mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 12px;
    }
    .station-title {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .date-label {
      font-size: 20px;
      font-weight: 600;
      color: #4b5563;
    }
    .board-title {
      text-align: center;
      font-size: 26px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      font-weight: 800;
      margin: 16px 0 8px;
    }
    .products-row {
      flex: 1;
      display: flex;
      justify-content: space-around;
      align-items: center;
      gap: 24px;
      margin: 16px 0;
    }
    .prod-card {
      flex: 1;
      text-align: center;
      border: 2px solid #d1d5db;
      border-radius: 14px;
      padding: 24px 16px;
      background: #f9fafb;
    }
    .prod-name {
      font-size: 26px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 12px;
    }
    .density-val {
      font-size: 92px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      color: #111827;
    }
    .density-val.missing {
      color: #9ca3af;
    }
    .density-unit {
      font-size: 20px;
      font-weight: 600;
      color: #4b5563;
      margin-top: 12px;
    }
    .footer {
      border-top: 2px solid #e5e7eb;
      padding-top: 10px;
      font-size: 13px;
      text-align: center;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="board-container">
    <div class="header">
      <span class="station-title">${stationName}</span>
      <span class="date-label">${summary.businessDate}</span>
    </div>
    <div class="board-title">Density at 15 °C (Daily Display Board)</div>
    <div class="products-row">
      ${cells}
    </div>
    <div class="footer">
      Statutory Register · In accordance with Petroleum Rules · Customers may request a density check at any time.
    </div>
  </div>
  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>`);
  w.document.close();
}

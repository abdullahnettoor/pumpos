// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Rendering is stubbed: these tests pin where the bytes go, not how the PDF looks.
const pdfBytes = new Uint8Array([37, 80, 68, 70]);
vi.mock('@react-pdf/renderer', () => ({
  pdf: () => ({ toBlob: async () => ({ arrayBuffer: async () => pdfBytes.buffer }) }),
}));

import {
  exportReactPdf,
  outputReactPdf,
  prefersNewTabPrint,
  printReactPdf,
  setPdfPrinter,
  setPdfSaver,
} from './exportPdf.js';

describe('Print uses the same PDF as Save PDF (#309)', () => {
  const saved: Uint8Array[] = [];
  const printed: { bytes: Uint8Array; name: string }[] = [];
  beforeEach(() => {
    saved.length = 0;
    printed.length = 0;
    setPdfSaver(async (b) => void saved.push(b));
    setPdfPrinter(async (bytes, name) => void printed.push({ bytes, name }));
  });

  it('hands the printer exactly the bytes the saver gets, with a .pdf name', async () => {
    await exportReactPdf({}, 'Shift_Summary_1');
    await printReactPdf({}, 'Shift_Summary_1');
    expect(printed[0].bytes).toEqual(saved[0]);
    expect(printed[0].name).toBe('Shift_Summary_1.pdf');
  });

  it('routes outputReactPdf by mode', async () => {
    await outputReactPdf({}, 'a', 'print');
    await outputReactPdf({}, 'b');
    expect(printed).toHaveLength(1);
    expect(saved).toHaveLength(1);
  });
});

describe('prefersNewTabPrint', () => {
  it.each([
    [
      'desktop Safari',
      'Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/17.0 Safari/605.1.15',
      true,
    ],
    ['Chrome', 'Mozilla/5.0 (Macintosh) AppleWebKit/537 Chrome/126.0 Safari/537.36', false],
    ['Edge', 'Mozilla/5.0 (Windows) AppleWebKit/537 Chrome/126.0 Safari/537.36 Edg/126.0', false],
    ['Firefox', 'Mozilla/5.0 (Macintosh; rv:128.0) Gecko/20100101 Firefox/128.0', false],
  ])('%s → %s', (_l, ua, expected) => {
    expect(prefersNewTabPrint(ua)).toBe(expected);
  });
});

describe('web printer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('loads the PDF in a hidden iframe and prints it', async () => {
    vi.resetModules();
    const mod = await import('./exportPdf.js');
    URL.createObjectURL = vi.fn(() => 'blob:pdf');
    URL.revokeObjectURL = vi.fn();
    await mod.printReactPdf({}, 'x');
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('blob:pdf');
    const print = vi.fn();
    Object.defineProperty(frame, 'contentWindow', { value: { print, focus: vi.fn() } });
    frame.onload?.(new Event('load'));
    expect(print).toHaveBeenCalled();
  });
});

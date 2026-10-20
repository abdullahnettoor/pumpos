import { describe, expect, it } from 'vite-plus/test';
import {
  DEFAULT_SHIFT_SUMMARY_CONFIG,
  attendantReportDocConfig,
  dssrDocConfig,
  resolveSections,
  shiftSummaryDocConfig,
} from './reportConfig.js';

describe('resolveSections', () => {
  const defaults = DEFAULT_SHIFT_SUMMARY_CONFIG.sections;

  it("drops keys that no longer exist, such as the retired 'purchases' (#308)", () => {
    expect(resolveSections(['meta', 'purchases', 'signatures'], defaults)).toEqual([
      'meta',
      'signatures',
    ]);
  });

  it('keeps the saved order', () => {
    expect(resolveSections(['signatures', 'meta'], defaults)).toEqual(['signatures', 'meta']);
  });

  it.each([
    ['nothing saved', undefined],
    ['an empty list', []],
    ['only unknown keys', ['purchases']],
  ])('falls back to the defaults for %s', (_label, saved) => {
    expect(resolveSections(saved, defaults)).toEqual([...defaults]);
  });
});

describe('document configs from a station (#605: the export and the preview share them)', () => {
  const station = {
    name: 'Kottakkal',
    settings: {
      legal: { legalName: 'Sri Lakshmi Fuels LLP', gstin: '32ABCDE1234F1Z5' },
      logo_data_url: 'data:image/png;base64,AA==',
      report_config: {
        shiftSummary: ['header', 'nozzles'],
        dssr: ['header', 'kpis'],
        attendantReport: ['header', 'summary'],
        paper: 'LETTER',
        showLogo: false,
      },
    },
  };

  it('reads the saved sections, paper, letterhead and logo choice', () => {
    const shift = shiftSummaryDocConfig(station);
    expect(shift.sections).toEqual(['header', 'nozzles']);
    expect(shift.paper).toBe('LETTER');
    expect(shift.letterhead?.legalName).toBe('Sri Lakshmi Fuels LLP');
    expect(shift.letterhead?.showLogo).toBe(false);
    expect(dssrDocConfig(station).sections).toEqual(['header', 'kpis']);
    expect(attendantReportDocConfig(station)).toMatchObject({
      sections: ['header', 'summary'],
      showLogo: false,
    });
  });

  it('prints the layout being edited over the saved one', () => {
    const over = {
      sections: ['header', 'meta', 'signatures'],
      paper: 'A4' as const,
      showLogo: true,
    };
    const shift = shiftSummaryDocConfig(station, over);
    expect(shift.sections).toEqual(['header', 'meta', 'signatures']);
    expect(shift.paper).toBe('A4');
    expect(shift.letterhead?.showLogo).toBe(true);
    expect(attendantReportDocConfig(station, over).showLogo).toBe(true);
  });

  it('falls back to the defaults and the station or template name', () => {
    const shift = shiftSummaryDocConfig(null, {}, 'Morning');
    expect(shift.sections).toEqual(DEFAULT_SHIFT_SUMMARY_CONFIG.sections);
    expect(shift.stationName).toBe('Morning');
    expect(shift.paper).toBe('A4');
  });
});

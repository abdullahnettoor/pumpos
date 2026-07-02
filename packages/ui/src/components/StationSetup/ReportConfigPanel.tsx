import React, { useEffect, useMemo, useState } from 'react';
import { CloudStationService } from '../../services/cloud.js';
import { useToast } from '../primitives/ToastProvider.js';
import { Checkbox } from '../primitives/Toggle.js';
import { Segmented } from '../primitives/Segmented.js';
import {
  DEFAULT_SHIFT_SUMMARY_CONFIG, SHIFT_SUMMARY_SECTION_LABELS,
  DEFAULT_DSSR_CONFIG, DSSR_SECTION_LABELS,
} from '../../services/reports/reportConfig.js';
import { ChevronUp, ChevronDown, Save } from 'lucide-react';

const stationService = new CloudStationService();

export interface ReportConfigPanelProps {
  selectedStation: any;
  onSaved: (updated: any) => void;
}

interface OrderedSection {
  key: string;
  enabled: boolean;
}

/** Reconstruct the full ordered section list (enabled first in saved order, then
 *  the remaining sections as disabled) from the persisted enabled-only array. */
function buildOrdered(defaults: string[], saved?: string[]): OrderedSection[] {
  const savedList = (saved && saved.length ? saved : defaults).filter((k) => defaults.includes(k));
  const enabledSet = new Set(savedList);
  const remaining = defaults.filter((k) => !enabledSet.has(k));
  return [...savedList, ...remaining].map((key) => ({ key, enabled: enabledSet.has(key) }));
}

const move = (list: OrderedSection[], index: number, dir: -1 | 1): OrderedSection[] => {
  const target = index + dir;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

/**
 * Station-level report configuration (Phase R2): choose paper size, toggle and
 * reorder the sections that appear in the Shift Summary and DSSR PDFs, with a
 * live preview of the letterhead + ordered sections. Ordering is persisted (the
 * enabled sections are stored in display order).
 */
export const ReportConfigPanel: React.FC<ReportConfigPanelProps> = ({ selectedStation, onSaved }) => {
  const toast = useToast();
  const [paper, setPaper] = useState<'A4' | 'LETTER'>('A4');
  const [ss, setSs] = useState<OrderedSection[]>([]);
  const [dssr, setDssr] = useState<OrderedSection[]>([]);
  const [previewDoc, setPreviewDoc] = useState<'shiftSummary' | 'dssr'>('shiftSummary');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const rc = selectedStation?.settings?.report_config || {};
    setPaper(rc.paper === 'LETTER' ? 'LETTER' : 'A4');
    setSs(buildOrdered(DEFAULT_SHIFT_SUMMARY_CONFIG.sections, rc.shiftSummary));
    setDssr(buildOrdered(DEFAULT_DSSR_CONFIG.sections, rc.dssr));
  }, [selectedStation]);

  const legal = selectedStation?.settings?.legal || {};
  const fuelBrand = selectedStation?.settings?.fuel_brand;
  const logo = selectedStation?.settings?.logo_data_url;
  const heading = legal.legalName || selectedStation?.name || 'PumpOS';
  const legalBits = [
    legal.gstin ? `GSTIN: ${legal.gstin}` : '',
    legal.roCode ? `RO: ${legal.roCode}` : '',
    fuelBrand || '',
    [legal.addressLine, legal.pincode].filter(Boolean).join(', '),
  ].filter(Boolean).join('  •  ');

  const activeList = previewDoc === 'shiftSummary' ? ss : dssr;
  const activeLabels: Record<string, string> = previewDoc === 'shiftSummary' ? SHIFT_SUMMARY_SECTION_LABELS : DSSR_SECTION_LABELS;
  const previewSections = useMemo(
    () => activeList.filter((s) => s.enabled).map((s) => activeLabels[s.key] || s.key),
    [activeList, activeLabels],
  );

  const toggle = (setter: React.Dispatch<React.SetStateAction<OrderedSection[]>>, key: string) => {
    if (key === 'header') return;
    setter((prev) => prev.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s)));
  };

  const handleSave = async () => {
    if (!selectedStation) return;
    setSaving(true);
    try {
      const updated = await stationService.updateStation(selectedStation.id, {
        settings: {
          ...(selectedStation.settings || {}),
          report_config: {
            shiftSummary: ss.filter((s) => s.enabled).map((s) => s.key),
            dssr: dssr.filter((s) => s.enabled).map((s) => s.key),
            paper,
          },
        },
      });
      onSaved(updated);
      toast.success('Report configuration saved.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save report configuration.');
    } finally {
      setSaving(false);
    }
  };

  const renderList = (
    title: string,
    list: OrderedSection[],
    setter: React.Dispatch<React.SetStateAction<OrderedSection[]>>,
    labels: Record<string, string>,
  ) => (
    <div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-default)', marginBottom: '8px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
        {list.map((s, i) => (
          <div
            key={s.key}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
              borderBottom: i < list.length - 1 ? '1px solid var(--border-soft)' : 'none',
              backgroundColor: s.enabled ? 'transparent' : 'var(--bg-surface-alt)',
            }}
          >
            <Checkbox
              label={labels[s.key] || s.key}
              checked={s.enabled}
              disabled={s.key === 'header'}
              onChange={() => toggle(setter, s.key)}
            />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                style={{ padding: '2px 5px' }}
                disabled={i === 0}
                onClick={() => setter((prev) => move(prev, i, -1))}
                aria-label={`Move ${labels[s.key] || s.key} up`}
              >
                <ChevronUp size={13} />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                style={{ padding: '2px 5px' }}
                disabled={i === list.length - 1}
                onClick={() => setter((prev) => move(prev, i, 1))}
                aria-label={`Move ${labels[s.key] || s.key} down`}
              >
                <ChevronDown size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>Report Configuration</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Choose paper size, and which sections appear (and in what order) on each PDF report.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Save size={13} /> {saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.9fr)', gap: '24px', alignItems: 'start' }}>
        {/* Editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ maxWidth: '240px' }}>
            <label className="form-label">Paper Size</label>
            <select className="select" value={paper} onChange={(e) => setPaper(e.target.value as 'A4' | 'LETTER')} style={{ width: '100%' }}>
              <option value="A4">A4 (210 × 297 mm)</option>
              <option value="LETTER">US Letter (8.5 × 11 in)</option>
            </select>
          </div>

          {renderList('Shift Summary', ss, setSs, SHIFT_SUMMARY_SECTION_LABELS)}
          {renderList('Daily DSSR', dssr, setDssr, DSSR_SECTION_LABELS)}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Toggle sections on/off and use the arrows to reorder them. “Header / Letterhead” is always first.
          </span>
        </div>

        {/* Live preview */}
        <div style={{ position: 'sticky', top: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</span>
            <div style={{ minWidth: 220 }}>
              <Segmented
                options={[{ value: 'shiftSummary', label: 'Shift Summary' }, { value: 'dssr', label: 'DSSR' }]}
                value={previewDoc}
                onChange={(v) => setPreviewDoc(v as 'shiftSummary' | 'dssr')}
                aria-label="Preview report"
              />
            </div>
          </div>

          <div
            style={{
              border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-card)',
              background: '#fff', padding: paper === 'LETTER' ? '18px 20px' : '16px 18px',
              aspectRatio: paper === 'LETTER' ? '8.5 / 11' : '210 / 297',
              overflow: 'hidden', boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.08))',
            }}
          >
            {/* Letterhead band */}
            <div style={{ background: 'var(--brand-primary, #1F6A53)', borderRadius: 6, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{heading}</div>
                <div style={{ color: '#fff', fontSize: 8, letterSpacing: 1.2, fontWeight: 700, marginTop: 2 }}>
                  {previewDoc === 'shiftSummary' ? 'SHIFT SUMMARY RECORD' : 'DAILY SALES SUMMARY RECORD'}
                </div>
              </div>
              {logo ? <img src={logo} alt="logo" style={{ width: 34, height: 34, objectFit: 'contain' }} /> : null}
            </div>
            {legalBits ? <div style={{ fontSize: 7.5, color: 'var(--text-muted)', marginTop: 5 }}>{legalBits}</div> : null}

            {/* Ordered section blocks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {previewSections.length === 0 ? (
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>No sections enabled.</div>
              ) : (
                previewSections.map((label, i) => (
                  <div key={`${label}-${i}`}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--brand-primary, #1F6A53)', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                    <div style={{ height: 5, background: 'var(--bg-surface-alt)', borderRadius: 2, marginBottom: 3 }} />
                    <div style={{ height: 5, background: 'var(--bg-surface-alt)', borderRadius: 2, width: '85%' }} />
                  </div>
                ))
              )}
            </div>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Representative layout — actual PDF renders full data.</span>
        </div>
      </div>
    </div>
  );
};

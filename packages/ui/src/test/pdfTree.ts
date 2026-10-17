import React from 'react';
import { Text } from '@react-pdf/renderer';
import { TableView, type Cell, type Col } from '../services/reports/shiftSummaryDoc.js';

/** One table a PDF prints: its headers, rows and total rows, as text. */
export interface PdfTableText {
  headers: string[];
  rows: string[][];
  totals: string[][];
}

/** A PDF document tree read as text: every line it prints, and every table. */
export interface PdfText {
  /** Every text node's string, in order; a table reads as one `a | b | c` line per row. */
  lines: string[];
  tables: PdfTableText[];
}

const cells = (row: Cell[]): string[] => row.map((c) => c.text);

/**
 * Walks a react-pdf element tree without rendering it: function components are
 * called, `Text` nodes give their string, and each `TableView` is read from
 * its props. PDF text is font-encoded, so tests assert on this tree.
 */
export function readPdf(root: React.ReactNode): PdfText {
  const out: PdfText = { lines: [], tables: [] };
  const textOf = (node: any): string => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    return textOf(node.props?.children);
  };
  const walk = (node: any): void => {
    if (node == null || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number') {
      out.lines.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === TableView) {
      const { columns, rows, total, totals } = node.props as {
        columns: Col[];
        rows: Cell[][];
        total?: Cell[];
        totals?: Cell[][];
      };
      const table: PdfTableText = {
        headers: columns.map((c) => c.header),
        rows: rows.map(cells),
        totals: [...(total ? [total] : []), ...(totals ?? [])].map(cells),
      };
      out.tables.push(table);
      for (const line of [table.headers, ...table.rows, ...table.totals]) {
        out.lines.push(line.join(' | '));
      }
      return;
    }
    if (node.type === Text) {
      const text = textOf(node);
      if (text) out.lines.push(text);
      return;
    }
    if (typeof node.type === 'function') {
      walk(node.type(node.props));
      return;
    }
    walk(node.props?.children);
  };
  walk(root);
  return out;
}

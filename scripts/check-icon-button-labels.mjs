#!/usr/bin/env node
/**
 * Fail the build on an icon-only button with no accessible name.
 *
 * The Icon-primitive migration (#67/#71) swapped text and unicode glyphs for
 * `<Icon>` inside bare `<button>`s. Several row actions kept only a `title`,
 * which is a weak accname source (ignored on touch, inconsistently announced),
 * and some had nothing at all: a screen reader reaches them as "button" (#86).
 *
 * This is a script rather than a lint rule because `jsx-a11y` accepts `title`
 * as a name and we want the stricter bar. It is deliberately conservative: a
 * button is only reported when it has **no** literal text child, no
 * `aria-label`/`aria-labelledby`, and does contain an element child.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ROOTS = ['packages/ui/src', 'apps/console/src', 'apps/mobile/src'];
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', 'src-tauri']);
const BUTTONISH = /^(button|IconBtn)$/;

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Literal text (or a string expression) that a screen reader would announce. */
function hasVisibleText(children) {
  return children.some((child) => {
    if (ts.isJsxText(child)) return child.getText().trim().length > 0;
    if (ts.isJsxExpression(child)) return /[A-Za-z]/.test(child.getText());
    if (ts.isJsxElement(child)) return hasVisibleText(child.children);
    return false;
  });
}

export function findUnlabelledIconButtons(fileName, source) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const offenders = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) && BUTTONISH.test(node.openingElement.tagName.getText())) {
      const attrs = node.openingElement.attributes.properties.map((p) => p.name?.getText?.() ?? '');
      const labelled = attrs.includes('aria-label') || attrs.includes('aria-labelledby');
      const elementChild = node.children.some(
        (c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c),
      );
      if (elementChild && !labelled && !hasVisibleText(node.children)) {
        offenders.push({
          file: fileName,
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return offenders;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const offenders = [];
  for (const root of ROOTS) {
    for (const file of walk(root, [])) {
      offenders.push(...findUnlabelledIconButtons(file, readFileSync(file, 'utf8')));
    }
  }

  if (offenders.length > 0) {
    console.error(`\nFound ${offenders.length} icon-only button(s) with no accessible name:\n`);
    for (const o of offenders) console.error(`  ${o.file}:${o.line}`);
    console.error(
      [
        '',
        'An icon-only control reaches a screen reader as an anonymous "button".',
        'Add an `aria-label` (keep `title` too if you want the tooltip).',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  console.log('Every icon-only button has an accessible name.');
}

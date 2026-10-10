// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { IconButton } from './IconButton.js';

/**
 * Small controls keep their drawn size but get a 44 x 44 px hit area from the
 * `.hit-44` utility (mobile.css). jsdom has no layout, so this pins the class
 * on the small controls and the rule that gives it the size.
 */
const css = readFileSync(`${process.cwd()}/src/mobile.css`, 'utf8');

afterEach(cleanup);

describe('touch targets', () => {
  it('defines .hit-44 as a centred pseudo-element of at least 44px each way', () => {
    const rule = /\.hit-44::before\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('width: max(100%, 44px)');
    expect(rule).toContain('height: max(100%, 44px)');
  });

  it('the header IconButton (34px) carries it', () => {
    render(<IconButton label="Search">x</IconButton>);
    expect(screen.getByRole('button', { name: 'Search' }).className).toContain('hit-44');
  });
});

import { describe, it, expect } from 'vitest';
import { findUnlabelledIconButtons } from './check-icon-button-labels.mjs';

const find = (src) => findUnlabelledIconButtons('probe.tsx', src);

/**
 * Issue #86: after the Icon migration, row-action buttons rendered a bare
 * `<Icon>` with at most a `title`, so screen readers announced "button".
 */
describe('icon-only button accessible-name guard', () => {
  it('reports a button whose only child is an icon', () => {
    expect(find('const a = <button onClick={f}><Icon name="edit" /></button>;')).toHaveLength(1);
  });

  it('is not satisfied by title alone', () => {
    // `title` is ignored on touch and announced inconsistently; it is a tooltip,
    // not a name.
    expect(
      find('const a = <button title="Edit customer"><Icon name="edit" /></button>;'),
    ).toHaveLength(1);
  });

  it('accepts an aria-label', () => {
    expect(
      find(
        'const a = <button title="Edit" aria-label="Edit customer"><Icon name="edit" /></button>;',
      ),
    ).toEqual([]);
  });

  it('accepts aria-labelledby', () => {
    expect(find('const a = <button aria-labelledby="h1"><Icon name="edit" /></button>;')).toEqual(
      [],
    );
  });

  it('leaves buttons that render their own text alone', () => {
    expect(find('const a = <button><Icon name="plus" />Add customer</button>;')).toEqual([]);
    expect(find('const a = <button><Icon name="user" />{userName}</button>;')).toEqual([]);
  });

  it('looks through a wrapping element for the text', () => {
    // BottomNav shape: icon in a span, label as a sibling expression.
    expect(find('const a = <button><span><Icon name="home" /></span>{label}</button>;')).toEqual(
      [],
    );
  });

  it('reports the line so the failure is actionable', () => {
    const src = ['const a = (', '  <button>', '    <Icon name="edit" />', '  </button>', ');'].join(
      '\n',
    );
    expect(find(src)[0].line).toBe(2);
  });
});

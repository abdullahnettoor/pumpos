import { describe, expect, it } from 'vitest';
import { clampActive, initialNavState, navReducer, stackOf, type NavState } from './navStack.js';

const entry = (id: string) => ({ id, element: id });
const run = (state: NavState, ...actions: Parameters<typeof navReducer>[1][]) =>
  actions.reduce(navReducer, state);
const ids = (state: NavState, tab: Parameters<typeof stackOf>[1]) =>
  stackOf(state, tab).map((e) => e.id);

describe('navReducer', () => {
  it('starts on a tab with empty stacks', () => {
    const s = initialNavState('shifts');
    expect(s.active).toBe('shifts');
    expect(s.visited).toEqual(['shifts']);
    expect(ids(s, 'shifts')).toEqual([]);
  });

  it('pushes and pops on the active tab only', () => {
    const s = run(
      initialNavState('home'),
      { type: 'push', entry: entry('a') },
      { type: 'push', entry: entry('b') },
    );
    expect(ids(s, 'home')).toEqual(['a', 'b']);
    expect(ids(navReducer(s, { type: 'pop' }), 'home')).toEqual(['a']);
  });

  it('ignores a push whose id is already on top (double tap)', () => {
    const s = run(
      initialNavState('home'),
      { type: 'push', entry: entry('a') },
      { type: 'push', entry: entry('a') },
    );
    expect(ids(s, 'home')).toEqual(['a']);
  });

  it('pop on an empty stack is a no-op', () => {
    const s = initialNavState('home');
    expect(navReducer(s, { type: 'pop' })).toBe(s);
  });

  it('keeps each tab stack when switching tabs', () => {
    const s = run(
      initialNavState('home'),
      { type: 'push', entry: entry('h1') },
      { type: 'select', tab: 'shifts' },
      { type: 'push', entry: entry('s1') },
      { type: 'select', tab: 'home' },
    );
    expect(s.active).toBe('home');
    expect(ids(s, 'home')).toEqual(['h1']);
    expect(ids(s, 'shifts')).toEqual(['s1']);
    expect(s.visited).toEqual(['home', 'shifts']);
  });

  it('select with toRoot clears that tab stack', () => {
    const s = run(
      initialNavState('home'),
      { type: 'push', entry: entry('h1') },
      { type: 'select', tab: 'home', toRoot: true },
    );
    expect(ids(s, 'home')).toEqual([]);
  });

  it('open switches tab and pushes there', () => {
    const s = navReducer(initialNavState('home'), {
      type: 'open',
      tab: 'money',
      entry: entry('c1'),
    });
    expect(s.active).toBe('money');
    expect(ids(s, 'money')).toEqual(['c1']);
    expect(ids(s, 'home')).toEqual([]);
  });

  it('reset drops every stack but keeps the tab', () => {
    const s = run(
      initialNavState('home'),
      { type: 'push', entry: entry('h1') },
      { type: 'select', tab: 'shifts' },
      { type: 'push', entry: entry('s1') },
      { type: 'reset' },
    );
    expect(s.active).toBe('shifts');
    expect(ids(s, 'home')).toEqual([]);
    expect(ids(s, 'shifts')).toEqual([]);
  });
});

describe('tab views', () => {
  it('records a requested view with a growing sequence, once per request', () => {
    const s1 = navReducer(initialNavState('home'), { type: 'select', tab: 'money', view: 'pay' });
    expect(s1.views.money).toEqual({ view: 'pay', seq: 1 });
    const s2 = navReducer(s1, { type: 'select', tab: 'money', view: 'pay' });
    expect(s2.views.money).toEqual({ view: 'pay', seq: 2 });
  });
  it('a plain select leaves the request alone, and reset clears it', () => {
    const s1 = navReducer(initialNavState('home'), { type: 'select', tab: 'money', view: 'pay' });
    expect(navReducer(s1, { type: 'select', tab: 'home' }).views.money?.seq).toBe(1);
    expect(navReducer(s1, { type: 'reset' }).views).toEqual({});
  });
});

describe('clampActive', () => {
  it('moves to the first allowed tab when the active one is not allowed', () => {
    const s = clampActive(initialNavState('home'), ['reports', 'money']);
    expect(s.active).toBe('reports');
    expect(s.visited).toContain('reports');
  });
  it('leaves an allowed tab alone', () => {
    const s = initialNavState('money');
    expect(clampActive(s, ['reports', 'money'])).toBe(s);
  });
});

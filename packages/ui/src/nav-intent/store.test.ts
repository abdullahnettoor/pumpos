import { describe, it, expect, beforeEach } from 'vitest';
import {
  publishNavIntent,
  clearNavIntent,
  subscribeToNavIntent,
  getNavIntentState,
  __resetNavIntentForTests,
} from './store.js';

const intent = () => getNavIntentState().intent;
const token = () => getNavIntentState().token;

describe('nav intent store', () => {
  beforeEach(() => __resetNavIntentForTests());

  it('retains the intent so a destination mounting later still sees it', () => {
    // The old prop transport handed the intent to a screen that had not mounted
    // yet; retention is what lets a late subscriber still act on it.
    publishNavIntent({ focusCustomerId: 'c1' });
    expect(intent()).toEqual({ focusCustomerId: 'c1' });
  });

  it('keeps the intent pending across repeated reads until explicitly cleared', () => {
    publishNavIntent({ focusCustomerId: 'c1' });
    expect(intent()).not.toBeNull();
    expect(intent()).not.toBeNull();
    clearNavIntent();
    expect(intent()).toBeNull();
  });

  it('bumps the token when the same intent is published twice', () => {
    publishNavIntent({ openBusinessDayDate: '2026-01-05' });
    const first = token();
    clearNavIntent();
    publishNavIntent({ openBusinessDayDate: '2026-01-05' });
    // ReportsOverview used to compare the date string and so silently ignored a
    // second navigation to the same day. The token must distinguish them.
    expect(token()).toBe(first + 1);
    expect(intent()).toEqual({ openBusinessDayDate: '2026-01-05' });
  });

  it('treats a navigation carrying no intent as a clear', () => {
    publishNavIntent({ focusSupplierId: 's1' });
    publishNavIntent(undefined);
    expect(intent()).toBeNull();
  });

  it('notifies subscribers on publish and on clear, and stops after unsubscribe', () => {
    const seen: (string | null)[] = [];
    const unsub = subscribeToNavIntent(() => seen.push(intent()?.focusCustomerId ?? null));
    publishNavIntent({ focusCustomerId: 'c1' });
    clearNavIntent();
    unsub();
    publishNavIntent({ focusCustomerId: 'c2' });
    expect(seen).toEqual(['c1', null]);
  });

  it('does not notify when clearing an already-empty store', () => {
    let count = 0;
    const unsub = subscribeToNavIntent(() => count++);
    clearNavIntent();
    expect(count).toBe(0);
    unsub();
  });

  it('replaces a still-pending intent when a new navigation publishes one', () => {
    publishNavIntent({ focusCustomerId: 'c1' });
    publishNavIntent({ focusSupplierId: 's1' });
    expect(intent()).toEqual({ focusSupplierId: 's1' });
  });
});

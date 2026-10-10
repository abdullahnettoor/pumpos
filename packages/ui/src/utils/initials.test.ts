import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials.js';

describe('initialsOf', () => {
  it('takes the first and last word', () => {
    expect(initialsOf('Abdullah Nettoor')).toBe('AN');
    expect(initialsOf('  Ravi  Kumar Singh ')).toBe('RS');
  });
  it('takes two letters of a single word', () => {
    expect(initialsOf('Highway')).toBe('HI');
  });
  it('falls back for an empty name', () => {
    expect(initialsOf('  ')).toBe('?');
  });
});

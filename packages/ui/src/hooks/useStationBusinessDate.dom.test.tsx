// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStationBusinessDate } from './useStationBusinessDate.js';

const DateProbe = () => <span>{useStationBusinessDate('Asia/Kolkata', '06:00')}</span>;

describe('useStationBusinessDate', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the previous business date before the station day-start boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T00:00:00.000+05:30'));

    render(<DateProbe />);

    expect(screen.getByText('2026-09-16')).toBeDefined();
  });
});

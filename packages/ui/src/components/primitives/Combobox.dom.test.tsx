// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach, beforeAll } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Combobox } from './Combobox.js';

afterEach(cleanup);

// jsdom has no layout, so it ships no scrollIntoView; the highlight effect calls it.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const OPTIONS = [
  { value: 'c1', label: 'Anand Transports', sublabel: 'FLEET-01' },
  { value: 'c2', label: 'Bharat Logistics', sublabel: 'FLEET-02' },
  { value: 'c3', label: 'Chennai Carriers', sublabel: 'FLEET-03' },
];

/**
 * Renders the picker inside a clipping card — the shape that cropped the popup
 * before it was portalled.
 */
function renderInClippingCard(props: Partial<React.ComponentProps<typeof Combobox>> = {}) {
  const onChange = props.onChange ?? vi.fn();
  const utils = render(
    <div data-testid="card" style={{ overflow: 'hidden', height: 60 }}>
      <Combobox options={OPTIONS} value="" onChange={onChange} {...props} />
    </div>,
  );
  return { ...utils, onChange };
}

/** Pins the trigger's rect so placement is deterministic under jsdom. */
function stubTriggerRect(top: number, height = 32) {
  const trigger = screen.getByRole('button');
  vi.spyOn(trigger.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue({
    top,
    bottom: top + height,
    left: 40,
    right: 260,
    width: 220,
    height,
    x: 40,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
  return trigger;
}

describe('Combobox', () => {
  it('renders the popup outside the clipping card, in a document-level portal', () => {
    renderInClippingCard();
    fireEvent.click(screen.getByRole('button'));

    const popup = screen.getByTestId('combobox-popup');
    expect(popup).toBeTruthy();
    expect(screen.getByTestId('card').contains(popup)).toBe(false);
    expect(popup.parentElement).toBe(document.body);
  });

  it('matches the trigger width and follows it on scroll', () => {
    renderInClippingCard();
    const trigger = stubTriggerRect(100);
    fireEvent.click(trigger);

    const popup = screen.getByTestId('combobox-popup');
    expect(popup.style.width).toBe('220px');
    expect(popup.style.left).toBe('40px');
    expect(popup.style.top).toBe('136px');

    // The container scrolls: the trigger moves up, the popup moves with it.
    (trigger.parentElement as HTMLElement).getBoundingClientRect = () =>
      ({ top: 20, bottom: 52, left: 40, width: 220, height: 32 }) as DOMRect;
    act(() => {
      fireEvent.scroll(document, {});
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByTestId('combobox-popup').style.top).toBe('56px');
  });

  it('flips above the trigger when there is not enough room below', () => {
    window.innerHeight = 800;
    renderInClippingCard();
    const trigger = stubTriggerRect(740);
    fireEvent.click(trigger);

    const popup = screen.getByTestId('combobox-popup');
    expect(popup.dataset.placement).toBe('top');
    expect(popup.style.bottom).toBe('64px');
    expect(popup.style.top).toBe('');
  });

  it('selects with the mouse', () => {
    const { onChange } = renderInClippingCard();
    fireEvent.click(screen.getByRole('button'));

    fireEvent.mouseDown(screen.getByText('Bharat Logistics'));

    expect(onChange).toHaveBeenCalledWith('c2');
    expect(screen.queryByTestId('combobox-popup')).toBeNull();
  });

  it('filters by type-ahead and commits the highlighted option with Enter', () => {
    const { onChange } = renderInClippingCard();
    fireEvent.click(screen.getByRole('button'));

    const search = screen.getByPlaceholderText('Search…');
    fireEvent.change(search, { target: { value: 'chen' } });
    expect(screen.queryByText('Anand Transports')).toBeNull();

    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('c3');
  });

  it('moves the highlight with the arrow keys', () => {
    const { onChange } = renderInClippingCard();
    fireEvent.click(screen.getByRole('button'));

    const search = screen.getByPlaceholderText('Search…');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('c2');
  });

  it('closes on Escape and on an outside click, but not on a click inside the portalled panel', () => {
    renderInClippingCard();
    fireEvent.click(screen.getByRole('button'));

    // Inside the portal: still open, even though it is not a DOM descendant.
    fireEvent.mouseDown(screen.getByPlaceholderText('Search…'));
    expect(screen.queryByTestId('combobox-popup')).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('combobox-popup')).toBeNull();

    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('combobox-popup')).toBeNull();
  });

  it('offers create actions when nothing matches', () => {
    const onSelect = vi.fn();
    renderInClippingCard({ createActions: [{ label: '＋ New customer', onSelect }] });
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'zzz' } });

    expect(screen.getByText('No matches')).toBeTruthy();
    fireEvent.mouseDown(screen.getByText('＋ New customer'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

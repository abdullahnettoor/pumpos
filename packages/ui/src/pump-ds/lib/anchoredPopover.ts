import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

/** Space between the trigger and its popover, px. */
export const POPOVER_GAP = 6;

export type PopoverAlign = 'start' | 'end';

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

/**
 * Where a portalled popover goes (#603): fixed under its trigger, or above it
 * when there is no room below and more room above; lined up with the
 * trigger's start or end edge. With no `align`, a trigger in the right half
 * of the window lines up with its end, so a popover at a bar's right end opens
 * inward.
 *
 * Pure, so it is tested without a layout engine. The result is a computed
 * position, the one kind of inline `style` pump-ds allows (README, "Rules of
 * the road").
 */
export function anchoredPosition(
  trigger: AnchorRect,
  popoverHeight: number,
  viewport: { width: number; height: number },
  align?: PopoverAlign,
): CSSProperties {
  const edge = align ?? (trigger.left + trigger.width / 2 > viewport.width / 2 ? 'end' : 'start');
  const below = viewport.height - trigger.bottom - POPOVER_GAP;
  const flip = popoverHeight > below && trigger.top - POPOVER_GAP > below;
  return {
    position: 'fixed',
    ...(flip
      ? { bottom: viewport.height - trigger.top + POPOVER_GAP }
      : { top: trigger.bottom + POPOVER_GAP }),
    ...(edge === 'end' ? { right: viewport.width - trigger.right } : { left: trigger.left }),
  };
}

export interface AnchoredPopoverOptions {
  open: boolean;
  /** The trigger the popover hangs from. */
  triggerRef: React.RefObject<HTMLElement | null>;
  /** The portalled popover. */
  popoverRef: React.RefObject<HTMLElement | null>;
  /** Elements a press inside does not dismiss (the trigger's wrapper). Default: the trigger. */
  insideRefs?: Array<React.RefObject<HTMLElement | null>>;
  align?: PopoverAlign;
  /** A press outside the trigger and the popover. Focus stays where the press put it. */
  onPressOutside: () => void;
}

/** Is this node inside any of these elements? */
export function isInsideAny(
  node: Node | null,
  refs: Array<React.RefObject<HTMLElement | null>>,
): boolean {
  return node != null && refs.some((r) => r.current?.contains(node));
}

/**
 * The positioning and dismissal shared by `DateRangeMenu` and
 * `DatePickerButton`: the popover follows its trigger on resize and scroll
 * (any scroll container), and a press outside both dismisses it. Returns the
 * popover's computed `style`.
 *
 * Keyboard dismissal (Escape, Tab out) stays with each control: what a key
 * means differs (the range menu commits or discards its typed dates).
 */
export function useAnchoredPopover({
  open,
  triggerRef,
  popoverRef,
  insideRefs,
  align,
  onPressOutside,
}: AnchoredPopoverOptions): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: 0, left: 0 });
  // The latest callback and inside list, for the document listener.
  const outsideRef = useRef(onPressOutside);
  const insideRef = useRef(insideRefs ?? [triggerRef]);
  useLayoutEffect(() => {
    outsideRef.current = onPressOutside;
    insideRef.current = insideRefs ?? [triggerRef];
  });

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const height = popoverRef.current?.getBoundingClientRect().height ?? 0;
    setStyle(
      anchoredPosition(
        trigger.getBoundingClientRect(),
        height,
        { width: window.innerWidth, height: window.innerHeight },
        align,
      ),
    );
  }, [align, triggerRef, popoverRef]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (isInsideAny(e.target as Node, [...insideRef.current, popoverRef])) return;
      outsideRef.current();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, popoverRef]);

  return style;
}

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPopover } from '../src/popover';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function fixture(doc = document) {
  const view = doc.defaultView!;
  const surface = doc.createElement('section');
  surface.className = 'zb-workspace';
  const scroller = doc.createElement('div');
  scroller.className = 'zb-table-wrap';
  const anchor = doc.createElement('button');
  const other = doc.createElement('button');
  scroller.append(anchor, other);
  surface.append(scroller);
  const panel = doc.createElement('div');
  const field = doc.createElement('input');
  panel.append(field);
  const outside = doc.createElement('div');
  doc.body.append(surface, outside);
  const popover = createPopover(surface);
  cleanups.push(popover.dispose);
  return { view, surface, scroller, anchor, other, panel, field, outside, popover };
}

function pointerdown(target: HTMLElement): void {
  const { MouseEvent } = target.ownerDocument.defaultView!;
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
}

function keyboard(view: Window & typeof globalThis, target: HTMLElement, init: KeyboardEventInit) {
  const event = new view.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function setViewport(view: Window, width: number, height: number): void {
  Object.defineProperties(view, {
    innerWidth: { configurable: true, value: width },
    innerHeight: { configurable: true, value: height },
  });
}

function placement(panel: HTMLElement) {
  return ['left', 'top', 'max-width', 'max-height'].map((name) =>
    panel.style.getPropertyValue(`--zb-popover-${name}`),
  );
}

describe('workspace popover', () => {
  it('attaches only the open panel, ignores inside presses, and toggles the same trigger', () => {
    const { anchor, field, panel, popover, surface } = fixture();
    expect(panel.isConnected).toBe(false);
    anchor.focus();
    anchor.setAttribute('aria-controls', 'existing');
    popover.open(anchor, panel, { initialFocus: () => field, returnFocus: () => null });
    expect(panel.parentElement).toBe(surface);
    expect(panel.getAttribute('popover')).toBe('manual');
    expect(panel.getAttribute('role')).toBe('dialog');
    const id = panel.id;
    expect(id).not.toBe('');
    expect(anchor.getAttribute('aria-controls')).toBe(id);
    expect(anchor.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(field);

    pointerdown(field);
    pointerdown(anchor);
    expect(popover.isOpen(panel)).toBe(true);
    field.value = 'retained input';
    popover.open(anchor, panel);
    expect(popover.isOpen()).toBe(false);
    expect(panel.isConnected).toBe(false);
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
    expect(anchor.getAttribute('aria-controls')).toBe('existing');
    expect(document.activeElement).toBe(anchor);

    popover.open(anchor, panel);
    expect(field.value).toBe('retained input');
    expect(panel.id).toBe(id);
    expect(anchor.getAttribute('aria-controls')).toBe(id);
  });

  it('handles Escape first at the owner window and leaves composing keys alone', () => {
    const { anchor, other, field, panel, popover, view } = fixture();
    const later = vi.fn();
    view.addEventListener('keydown', popover.consumeEscape, true);
    view.addEventListener('keydown', later, true);
    cleanups.push(() => {
      view.removeEventListener('keydown', popover.consumeEscape, true);
      view.removeEventListener('keydown', later, true);
    });
    popover.open(anchor, panel, { initialFocus: () => field, returnFocus: () => other });

    const composing = keyboard(view, field, { key: 'Escape', isComposing: true });
    expect(composing.defaultPrevented).toBe(false);
    expect(popover.isOpen()).toBe(true);
    expect(later).toHaveBeenCalledTimes(1);
    const escape = keyboard(view, field, { key: 'Escape' });
    expect(escape.defaultPrevented).toBe(true);
    expect(later).toHaveBeenCalledTimes(1);
    expect(popover.isOpen()).toBe(false);
    expect(document.activeElement).toBe(other);

    keyboard(view, other, { key: 'Escape' });
    expect(later).toHaveBeenCalledTimes(2);
  });

  it('dismisses at pointer capture and lets the outside target take focus', () => {
    vi.useFakeTimers();
    const { anchor, field, outside, panel, popover } = fixture();
    const next = document.createElement('input');
    outside.append(next);
    let closedBeforeTarget = false;
    next.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      closedBeforeTarget = !popover.isOpen();
      next.focus();
    });
    popover.open(anchor, panel, { initialFocus: () => field });
    pointerdown(next);
    expect(closedBeforeTarget).toBe(true);
    vi.runOnlyPendingTimers();
    expect(panel.isConnected).toBe(false);
    expect(document.activeElement).toBe(next);

    popover.open(anchor, panel, { initialFocus: () => field });
    pointerdown(outside);
    vi.runOnlyPendingTimers();
    expect(document.activeElement).toBe(anchor);
  });

  it('still dismisses on an unrelated press while a native select is open', () => {
    const { anchor, outside, panel, popover } = fixture();
    const select = panel.appendChild(document.createElement('select'));
    Object.defineProperty(select, 'openInParentProcess', { value: true });
    popover.open(anchor, panel, { initialFocus: () => select });
    pointerdown(outside);
    expect(panel.isConnected).toBe(false);
  });

  it('lets Escape reach an open native select before dismissing the panel', () => {
    const { anchor, panel, popover, view } = fixture();
    const select = panel.appendChild(document.createElement('select'));
    let dropdownOpen = true;
    Object.defineProperty(select, 'openInParentProcess', { get: () => dropdownOpen });
    select.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') dropdownOpen = false;
    });
    view.addEventListener('keydown', popover.consumeEscape, true);
    cleanups.push(() => view.removeEventListener('keydown', popover.consumeEscape, true));
    popover.open(anchor, panel, { initialFocus: () => select });

    expect(keyboard(view, select, { key: 'Escape' }).defaultPrevented).toBe(false);
    expect(dropdownOpen).toBe(false);
    expect(panel.isConnected).toBe(true);
    expect(keyboard(view, select, { key: 'Escape' }).defaultPrevented).toBe(true);
    expect(panel.isConnected).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });

  it('switches panels and invokers without restoring the previous focus', () => {
    vi.useFakeTimers();
    const { anchor, field, other, panel, popover, surface } = fixture();
    const previousFocus = vi.fn();
    anchor.addEventListener('focus', previousFocus);
    const next = document.createElement('div');
    const nextField = document.createElement('input');
    next.append(nextField);
    popover.open(anchor, panel, { initialFocus: () => field });
    other.focus();
    popover.open(other, next);
    expect(popover.isOpen(next)).toBe(true);
    expect(popover.isOpen(panel)).toBe(false);
    expect(panel.isConnected).toBe(false);
    expect(document.activeElement).toBe(other);
    nextField.focus();
    const switchedFocus = vi.fn();
    other.addEventListener('focus', switchedFocus);

    pointerdown(anchor);
    popover.open(anchor, panel, { initialFocus: () => field });
    vi.runOnlyPendingTimers();
    expect(next.isConnected).toBe(false);
    expect(panel.parentElement).toBe(surface);
    expect(previousFocus).not.toHaveBeenCalled();
    expect(switchedFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
  });

  it('reanchors a retained panel across a render without disturbing focus', async () => {
    const { anchor, other, field, panel, popover, scroller, surface } = fixture();
    popover.open(anchor, panel, { initialFocus: () => field });
    const replacement = document.createElement('button');
    anchor.replaceWith(replacement);
    popover.reanchor(other, document.createElement('div'));
    popover.reanchor(replacement, panel);
    await Promise.resolve();

    expect(popover.isOpen(panel)).toBe(true);
    expect(panel.parentElement).toBe(surface);
    expect(document.activeElement).toBe(field);
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
    expect(anchor.hasAttribute('aria-controls')).toBe(false);
    expect(other.hasAttribute('aria-expanded')).toBe(false);
    expect(replacement.getAttribute('aria-expanded')).toBe('true');
    expect(replacement.getAttribute('aria-controls')).toBe(panel.id);
    popover.close();
    expect(document.activeElement).toBe(replacement);

    popover.open(replacement, panel, { initialFocus: () => field, returnFocus: () => other });
    scroller.removeChild(replacement);
    await Promise.resolve();
    expect(panel.isConnected).toBe(false);
    expect(document.activeElement).toBe(other);
  });

  it('flips and clamps within the workspace rather than the table scroller', () => {
    vi.useFakeTimers();
    const { anchor, panel, popover, scroller, surface, view } = fixture();
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(80, 40, 360, 280));
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(320, 260, 110, 50));
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 180, 100));
    const trigger = vi.spyOn(anchor, 'getBoundingClientRect');
    trigger.mockReturnValue(new DOMRect(380, 280, 40, 20));
    popover.open(anchor, panel);
    expect(placement(panel)).toEqual(['254px', '176px', '348px', '230px']);

    trigger.mockReturnValue(new DOMRect(120, 100, 40, 20));
    scroller.dispatchEvent(new view.Event('scroll'));
    vi.advanceTimersToNextFrame();
    expect(placement(panel)).toEqual(['120px', '124px', '348px', '190px']);
    popover.dispose();
    expect(panel.isConnected).toBe(false);
  });

  it('clips to the owner viewport and ignores another document', () => {
    vi.useFakeTimers();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const doc = frame.contentDocument!;
    const { anchor, outside, panel, popover, surface, view } = fixture(doc);
    vi.spyOn(view, 'requestAnimationFrame').mockImplementation((callback) =>
      window.requestAnimationFrame(callback),
    );
    setViewport(view, 260, 200);
    const workspace = vi.spyOn(surface, 'getBoundingClientRect');
    workspace.mockReturnValue(new DOMRect(-30, -20, 400, 275));
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(230, 168, 20, 20));
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400));
    popover.open(anchor, panel);
    expect(placement(panel)).toEqual(['6px', '6px', '248px', '158px']);

    pointerdown(document.body);
    expect(popover.isOpen(panel)).toBe(true);
    setViewport(view, 220, 140);
    view.dispatchEvent(new view.Event('resize'));
    vi.advanceTimersToNextFrame();
    expect(placement(panel)).toEqual(['6px', '6px', '208px', '128px']);

    workspace.mockReturnValue(new DOMRect(300, 300, 400, 275));
    view.dispatchEvent(new view.Event('resize'));
    vi.advanceTimersToNextFrame();
    expect(panel.style.getPropertyValue('--zb-popover-visibility')).toBe('hidden');
    pointerdown(outside);
    expect(popover.isOpen()).toBe(false);
  });

  it('uses the layout viewport when a Gecko chrome visual viewport reports zero size', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const view = frame.contentDocument!.defaultView!;
    const visual = Object.assign(new view.EventTarget(), {
      width: 0,
      height: 0,
      offsetLeft: 0,
      offsetTop: 0,
    });
    Object.defineProperty(view, 'visualViewport', { value: visual });
    setViewport(view, 360, 240);
    const { surface, anchor, panel, popover } = fixture(frame.contentDocument!);
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 40, 360, 200));
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(60, 66, 45, 30));
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 125, 80));
    popover.open(anchor, panel);
    expect(placement(panel)).toEqual(['60px', '100px', '348px', '134px']);
    expect(panel.style.getPropertyValue('--zb-popover-visibility')).toBe('visible');
  });

  it('cancels deferred focus return and prevents reopening after disposal', () => {
    vi.useFakeTimers();
    const { anchor, field, outside, panel, popover } = fixture();
    const returned = vi.fn(() => anchor);
    popover.open(anchor, panel, { initialFocus: () => field, returnFocus: returned });
    pointerdown(outside);
    popover.dispose();
    vi.runOnlyPendingTimers();
    expect(returned).not.toHaveBeenCalled();
    expect(panel.isConnected).toBe(false);
    popover.open(anchor, panel);
    expect(popover.isOpen()).toBe(false);
  });
});

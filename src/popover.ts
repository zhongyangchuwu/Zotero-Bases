interface FocusOptions {
  returnFocus?: () => HTMLElement | null;
  initialFocus?: () => HTMLElement | null;
}

interface OpenPopover {
  anchor: HTMLElement;
  previousControls: string | null;
  readonly panel: HTMLElement;
  readonly options: FocusOptions | undefined;
}

const GAP = 4;
const INSET = 6;
let nextPanelId = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function hasOpenNativeSelect(panel: HTMLElement): boolean {
  // Privileged Gecko sets this on the owning HTML select while its XUL menu is open.
  for (const select of panel.querySelectorAll<
    HTMLSelectElement & { readonly openInParentProcess?: boolean }
  >('select')) {
    if (select.openInParentProcess) return true;
  }
  return false;
}

export function createPopover(surface: HTMLElement) {
  const doc = surface.ownerDocument;
  const view = doc.defaultView;
  const visual = view?.visualViewport;
  let current: OpenPopover | undefined;
  let resize: ResizeObserver | undefined;
  let mutations: MutationObserver | undefined;
  let frame: number | undefined;
  let restoreTimer: number | undefined;
  let disposed = false;

  function position(): void {
    const open = current;
    if (!open || !view) return;
    const { anchor, panel } = open;
    if (!surface.isConnected || !surface.contains(anchor) || panel.parentElement !== surface) {
      close();
      return;
    }

    const workspace = surface.getBoundingClientRect();
    const trigger = anchor.getBoundingClientRect();
    const viewportWidth = doc.documentElement.clientWidth || view.innerWidth;
    const viewportHeight = doc.documentElement.clientHeight || view.innerHeight;
    // Gecko exposes a zero-sized VisualViewport in Zotero's privileged chrome windows.
    const usableVisual = visual && visual.width > 0 && visual.height > 0 ? visual : undefined;
    const x = usableVisual?.offsetLeft ?? 0;
    const y = usableVisual?.offsetTop ?? 0;
    const minX = Math.max(workspace.left, x, 0);
    const minY = Math.max(workspace.top, y, 0);
    const maxX = Math.min(
      workspace.right,
      x + (usableVisual?.width ?? viewportWidth),
      viewportWidth,
    );
    const maxY = Math.min(
      workspace.bottom,
      y + (usableVisual?.height ?? viewportHeight),
      viewportHeight,
    );
    const insetX = clamp((maxX - minX) / 4, 0, INSET);
    const insetY = clamp((maxY - minY) / 4, 0, INSET);
    const left = minX + insetX;
    const top = minY + insetY;
    const right = Math.max(left, maxX - insetX);
    const bottom = Math.max(top, maxY - insetY);
    const width = right - left;

    panel.style.setProperty(
      '--zb-popover-visibility',
      width > 0 && bottom > top ? 'visible' : 'hidden',
    );

    panel.style.setProperty('--zb-popover-max-width', `${width}px`);
    const box = panel.getBoundingClientRect();
    // Measure the scrollable contents without expanding the live box and losing its scroll offset.
    const height = Math.max(
      box.height,
      panel.scrollHeight + panel.offsetHeight - panel.clientHeight,
    );
    const below = clamp(trigger.bottom + GAP, top, bottom);
    const above = clamp(trigger.top - GAP, top, bottom);
    const belowSpace = bottom - below;
    const aboveSpace = above - top;
    const placeBelow = height <= belowSpace || belowSpace >= aboveSpace;
    const maxHeight = placeBelow ? belowSpace : aboveSpace;
    const panelTop = placeBelow ? below : above - Math.min(height, maxHeight);
    const panelLeft = clamp(trigger.left, left, right - Math.min(box.width, width));
    panel.style.setProperty('--zb-popover-left', `${panelLeft}px`);
    panel.style.setProperty('--zb-popover-top', `${panelTop}px`);
    panel.style.setProperty('--zb-popover-max-height', `${maxHeight}px`);
  }

  function schedulePosition(): void {
    if (!view || !current || frame !== undefined) return;
    frame = view.requestAnimationFrame(() => {
      frame = undefined;
      position();
    });
  }

  function onScroll(event: Event): void {
    if (current && !event.composedPath().includes(current.panel)) schedulePosition();
  }

  function canReturnFocus(panel?: HTMLElement): boolean {
    const focused = doc.activeElement;
    if (!focused || focused === doc.body || focused === doc.documentElement) return true;
    return panel?.contains(focused) ?? false;
  }

  function restore(open: OpenPopover): void {
    if (current || disposed || !canReturnFocus()) return;
    const target = open.options?.returnFocus ? open.options.returnFocus() : open.anchor;
    if (target?.isConnected && target.ownerDocument === doc) target.focus({ preventScroll: true });
  }

  function onPointerDown(event: Event): void {
    const open = current;
    if (!open || !view) return;
    const path = event.composedPath();
    if (path.includes(open.anchor) || path.includes(open.panel)) return;
    // Windows sends the option press to Gecko's separate XUL menu before the
    // HTML select receives change. Keep its owning panel mounted for that commit.
    const menu = doc.getElementById('ContentSelectDropdownPopup');
    if (
      menu?.namespaceURI === 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul' &&
      menu.localName === 'menupopup' &&
      path.includes(menu) &&
      hasOpenNativeSelect(open.panel)
    )
      return;
    const shouldRestore = canReturnFocus(open.panel);
    close(false);
    if (shouldRestore) {
      // The pointer's default action or target handler gets first choice of focus.
      restoreTimer = view.setTimeout(() => {
        restoreTimer = undefined;
        restore(open);
      });
    }
  }

  function bindAnchor(open: OpenPopover, anchor: HTMLElement): void {
    open.anchor = anchor;
    open.previousControls = anchor.getAttribute('aria-controls');
    anchor.setAttribute('aria-controls', open.panel.id);
    anchor.setAttribute('aria-expanded', 'true');
  }

  function releaseAnchor({ anchor, panel, previousControls }: OpenPopover): void {
    anchor.setAttribute('aria-expanded', 'false');
    if (anchor.getAttribute('aria-controls') !== panel.id) return;
    if (previousControls === null) anchor.removeAttribute('aria-controls');
    else anchor.setAttribute('aria-controls', previousControls);
  }

  function close(restoreFocus = true): void {
    if (restoreTimer !== undefined) view?.clearTimeout(restoreTimer);
    restoreTimer = undefined;
    const open = current;
    if (!open) return;
    const shouldRestore = restoreFocus && canReturnFocus(open.panel);
    current = undefined;
    doc.removeEventListener('pointerdown', onPointerDown, true);
    view?.removeEventListener('scroll', onScroll, true);
    view?.removeEventListener('resize', schedulePosition);
    visual?.removeEventListener('scroll', schedulePosition);
    visual?.removeEventListener('resize', schedulePosition);
    if (frame !== undefined) view?.cancelAnimationFrame(frame);
    frame = undefined;
    resize?.disconnect();
    mutations?.disconnect();
    resize = undefined;
    mutations = undefined;
    releaseAnchor(open);
    // Removing a manual popover also removes it from the native top layer.
    open.panel.remove();
    if (shouldRestore) restore(open);
  }

  function open(anchor: HTMLElement, panel: HTMLElement, options?: FocusOptions): void {
    if (disposed || !view || !surface.isConnected || !surface.contains(anchor)) return;
    if (current?.anchor === anchor) {
      // The trigger was chosen directly; Escape may instead use the caller's return target.
      const shouldRestore = canReturnFocus(current.panel);
      close(false);
      if (shouldRestore && canReturnFocus() && anchor.isConnected)
        anchor.focus({ preventScroll: true });
      return;
    }
    close(false);
    // Stay under the workspace for inheritance and scoped Custom CSS; the browser paints
    // the manual popover over the scroller without delegating Escape or outside dismissal.
    panel.classList.add('zb-popover');
    if (!panel.id) {
      let id: string;
      do {
        id = `zb-popover-${++nextPanelId}`;
      } while (doc.getElementById(id));
      panel.id = id;
    }
    if (!panel.hasAttribute('role')) panel.setAttribute('role', 'dialog');
    panel.setAttribute('popover', 'manual');
    panel.style.removeProperty('--zb-popover-visibility');
    panel.style.removeProperty('--zb-popover-max-height');
    surface.append(panel);
    panel.showPopover?.();
    current = { anchor, panel, options, previousControls: null };
    bindAnchor(current, anchor);
    position();
    if (!current) return;

    doc.addEventListener('pointerdown', onPointerDown, true);
    view.addEventListener('scroll', onScroll, true);
    view.addEventListener('resize', schedulePosition);
    visual?.addEventListener('scroll', schedulePosition);
    visual?.addEventListener('resize', schedulePosition);
    if (view.ResizeObserver) {
      resize = new view.ResizeObserver(schedulePosition);
      resize.observe(surface);
      resize.observe(anchor);
      resize.observe(panel);
    }
    mutations = new view.MutationObserver(() => {
      // A render may synchronously reanchor before the observer sees the old node's removal.
      const open = current;
      if (!open) return;
      if (!surface.contains(open.anchor) || open.panel.parentElement !== surface) {
        close();
      } else {
        schedulePosition();
      }
    });
    mutations.observe(surface, { childList: true, subtree: true });
    const focus = options?.initialFocus?.();
    if (focus && panel.contains(focus)) focus.focus({ preventScroll: true });
  }

  function reanchor(anchor: HTMLElement, panel: HTMLElement): void {
    const open = current;
    if (!open || open.panel !== panel || !surface.contains(anchor)) return;
    if (open.anchor !== anchor) {
      releaseAnchor(open);
      resize?.unobserve(open.anchor);
      bindAnchor(open, anchor);
      resize?.observe(anchor);
    }
    position();
  }

  function isOpen(panel?: HTMLElement): boolean {
    return !!current && (panel === undefined || panel === current.panel);
  }

  function consumeEscape(event: KeyboardEvent): boolean {
    if (
      !current ||
      event.defaultPrevented ||
      event.key !== 'Escape' ||
      event.isComposing ||
      // Legacy IME events may report Escape before isComposing is set.
      event.keyCode === 229 ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return false;
    if (hasOpenNativeSelect(current.panel)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
    return true;
  }

  function dispose(): void {
    disposed = true;
    close(false);
  }

  return { open, close, isOpen, consumeEscape, reanchor, dispose };
}

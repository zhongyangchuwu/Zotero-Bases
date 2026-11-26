import { BoardKeys } from './board-keys';
import type { BoardLane } from './board-model';
import { optionTone } from './cell-renderers';
import type { Property, Row } from './contracts';
import { readProperty } from './extra';
import { createFieldIcon } from './field-icons';
import { messages, type Language } from './i18n';
import { isRating } from './property-values';

export interface BoardRender {
  readonly viewID: string;
  readonly property?: Property;
  readonly lanes: readonly BoardLane[];
  readonly rating?: Property;
  readonly loading: boolean;
  readonly cardRevision?: number;
}

export interface BoardActions {
  readonly language: Language;
  card(row: Row, card: HTMLElement): void;
  toggle(laneId: string): void;
  write(row: Row, property: Property, value: string | null): Promise<void>;
  open(row: Row, pdf: boolean): void;
  properties(): void;
}

export interface BoardController {
  render(state: BoardRender): void;
  key(event: KeyboardEvent): boolean;
  rate(row: Row, property: Property, value: string | null): Promise<void>;
  clear(): void;
  dispose(): void;
}

const XHTML = 'http://www.w3.org/1999/xhtml';
const PAGE_SIZE = 60;
const EDITABLE =
  'input, select, textarea, [contenteditable]:not([contenteditable="false"]), ' +
  '[role="combobox"], [role="textbox"]';
const INTERACTIVE =
  `${EDITABLE}, button, a[href], summary, audio[controls], video[controls], ` +
  '[role="button"], [role="link"], [role="checkbox"], [role="slider"]';
const CARD_SCROLL = '[data-board-card-scroll][tabindex="0"]';
const words = {
  board: ['Board', '看板'],
  unset: ['Not set', '未设置'],
  stars: ['stars', '星'],
  expand: ['Expand', '展开'],
  collapse: ['Collapse', '折叠'],
  readOnly: ['Read-only item', '只读条目'],
  untitled: ['Untitled', '无标题'],
  loading: ['Loading items…', '正在加载条目…'],
  setup: [
    'Create a single-select or rating property to organize items into lanes.',
    '请创建单选或评分属性，以便将条目组织到泳道中。',
  ],
  properties: ['Open properties', '打开属性'],
  noMatches: ['No matching items.', '没有匹配的条目。'],
  dropHere: ['Drop an item here', '将条目拖到这里'],
} as const;

interface CardNode {
  row: Row;
  readonly element: HTMLElement;
  revision?: number;
}

interface LaneNode {
  lane: BoardLane;
  readonly section: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly mark: HTMLElement;
  readonly name: HTMLElement;
  readonly count: HTMLElement;
  readonly chevron: HTMLElement;
  readonly scroll: HTMLElement;
  readonly cards: HTMLElement;
  readonly empty: HTMLElement;
  readonly tail: HTMLElement;
  readonly mounted: Map<number, CardNode>;
  remembered?: number;
  limit: number;
  scrollTop: number;
  observer?: IntersectionObserver;
}

interface DragSource {
  readonly lane: LaneNode;
  readonly card: CardNode;
  readonly itemKey: string;
}

interface Follow {
  readonly id: number;
  laneId: string;
  anchor: Element;
  saved: boolean;
  expanding: boolean;
}

interface PendingWrite {
  readonly generation: number;
  readonly ratingKey?: string;
  desired: string | null;
  result?: Promise<void>;
}

function targetElement(target: EventTarget | null): Element | null {
  return (target as Element | null)?.nodeType === 1 ? (target as Element) : null;
}

export function createBoard(root: HTMLElement, actions: BoardActions): BoardController {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const text = messages(words, actions.language);
  const keys = new BoardKeys();
  const lanes = new Map<string, LaneNode>();
  const pending = new Map<number, PendingWrite>();
  let state: BoardRender | undefined;
  let generation = 0;
  let disposed = false;
  let drag: DragSource | undefined;
  let dropTarget: LaneNode | undefined;
  let pressedControl: HTMLElement | undefined;
  let follow: Follow | undefined;

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
    const node = doc.createElementNS(XHTML, tag) as HTMLElementTagNameMap[K];
    node.className = className;
    return node;
  }

  root.classList.add('zb-board');
  root.tabIndex = 0;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', text('board'));
  const message = element('div', 'zb-board-message');
  const messageText = element('p', 'zb-board-message-text');
  messageText.setAttribute('role', 'status');
  const properties = element('button', 'zb-board-properties');
  properties.type = 'button';
  properties.textContent = text('properties');
  message.append(messageText, properties);

  function laneAt(target: Element | null): LaneNode | undefined {
    const section = target?.closest<HTMLElement>('.zb-board-lane');
    const node = section && lanes.get(section.dataset.laneId ?? '');
    return node && node.section === section ? node : undefined;
  }

  function cardAt(node: LaneNode | undefined, target: Element | null): CardNode | undefined {
    const card = target?.closest<HTMLElement>('.zb-board-card');
    const entry = card && node?.mounted.get(Number(card.dataset.itemId));
    return entry && entry.element === card ? entry : undefined;
  }

  function focusedControl(card: HTMLElement, key: string | null | undefined) {
    if (key) {
      for (const control of card.querySelectorAll<HTMLElement>('[data-focus]')) {
        if (control.dataset.focus === key && !control.matches(':disabled')) return control;
      }
    }
    return card;
  }

  function paintPending(card: HTMLElement, operation?: PendingWrite): void {
    card.toggleAttribute('data-pending', Boolean(operation));
    if (operation) card.setAttribute('aria-busy', 'true');
    else card.removeAttribute('aria-busy');
    if (operation?.ratingKey && operation.generation === generation) {
      card.dataset.pendingRating = operation.ratingKey;
      card.dataset.pendingRatingValue = operation.desired ?? '';
    } else {
      delete card.dataset.pendingRating;
      delete card.dataset.pendingRatingValue;
    }
  }

  function repaintCard(entry: CardNode): void {
    const { element: card, row } = entry;
    const label = row.title.trim() || text('untitled');
    card.draggable = row.writable;
    card.toggleAttribute('data-read-only', !row.writable);
    card.setAttribute('aria-label', row.writable ? label : `${label} · ${text('readOnly')}`);
    if (row.writable) card.removeAttribute('title');
    else card.title = text('readOnly');
    paintPending(card, pending.get(row.id));
    actions.card(row, card);
  }

  function paintCards(node: LaneNode): void {
    const { lane, mounted, cards, empty, tail, scroll } = node;
    const count = lane.collapsed ? 0 : Math.min(node.limit, lane.rows.length);
    let cursor: ChildNode | null = cards.firstChild;
    for (let index = 0; index < count; index++) {
      const row = lane.rows[index]!;
      let entry = mounted.get(row.id);
      if (!entry) {
        const card = element('article', 'zb-board-card');
        card.tabIndex = 0;
        card.dataset.itemId = String(row.id);
        entry = { row, element: card, revision: state?.cardRevision };
        mounted.set(row.id, entry);
        repaintCard(entry);
      } else if (entry.row !== row || entry.revision !== state?.cardRevision) {
        entry.row = row;
        entry.revision = state?.cardRevision;
        repaintCard(entry);
      }
      if (entry.element === cursor) cursor = cursor.nextSibling;
      else cards.insertBefore(entry.element, cursor);
    }
    // The ordered, retained cards form a prefix; everything after it left the page.
    while (cursor) {
      const next = cursor.nextSibling;
      mounted.delete(Number((cursor as HTMLElement).dataset.itemId));
      cursor.remove();
      cursor = next;
    }

    empty.hidden = lane.rows.length > 0;
    const more = !lane.collapsed && count < lane.rows.length;
    tail.hidden = !more;
    if (more && !node.observer && win?.IntersectionObserver) {
      node.observer = new win.IntersectionObserver(
        (entries) => {
          if (entries.some(({ isIntersecting }) => isIntersecting)) extendLane(node);
        },
        { root: scroll, rootMargin: '0px 0px 160px' },
      );
      node.observer.observe(tail);
    } else if (!more && node.observer) {
      node.observer.disconnect();
      node.observer = undefined;
    }
  }

  function extendLane(node: LaneNode): void {
    if (
      lanes.get(node.lane.id) !== node ||
      node.lane.collapsed ||
      node.limit >= node.lane.rows.length
    )
      return;
    node.limit += PAGE_SIZE;
    paintCards(node);
  }

  function makeLane(lane: BoardLane): LaneNode {
    const section = element('section', 'zb-board-lane');
    section.dataset.laneId = lane.id;
    const toggle = element('button', 'zb-board-lane-toggle');
    toggle.type = 'button';
    const chip = element('span', 'zb-board-lane-chip');
    const mark = element('span', 'zb-board-lane-mark');
    mark.setAttribute('aria-hidden', 'true');
    const name = element('span', 'zb-board-lane-label');
    const count = element('span', 'zb-board-lane-count');
    const chevron = element('span', 'zb-board-lane-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    chip.append(mark, name);
    toggle.append(chip, count, chevron);
    section.append(toggle);
    const scroll = element('div', 'zb-board-lane-scroll');
    const cards = element('div', 'zb-board-cards');
    const empty = element('p', 'zb-board-lane-empty');
    empty.textContent = text('dropHere');
    const tail = element('div', 'zb-board-lane-tail');
    tail.setAttribute('aria-hidden', 'true');
    scroll.append(cards, empty, tail);
    section.append(scroll);
    const node: LaneNode = {
      lane,
      section,
      toggle,
      mark,
      name,
      count,
      chevron,
      scroll,
      cards,
      empty,
      tail,
      mounted: new Map(),
      limit: PAGE_SIZE,
      scrollTop: 0,
    };
    scroll.addEventListener(
      'scroll',
      () => {
        const { clientHeight, scrollHeight, scrollTop } = scroll;
        if (clientHeight > 0 && scrollHeight - scrollTop - clientHeight <= clientHeight / 2)
          extendLane(node);
      },
      { passive: true },
    );
    return node;
  }

  function paintLane(node: LaneNode, lane: BoardLane, property: Property): void {
    const { section, toggle, name, count, chevron, mark, scroll } = node;
    node.lane = lane;
    const nameText =
      lane.value === null
        ? text('unset')
        : property.type === 'rating'
          ? `${lane.value}${actions.language === 'zh-CN' ? '' : ' '}${
              lane.value === '1' && actions.language === 'en' ? 'star' : text('stars')
            }`
          : lane.value;
    if (name.textContent !== nameText) name.textContent = nameText;
    const countText = String(lane.rows.length);
    if (count.textContent !== countText) count.textContent = countText;
    toggle.title = nameText;
    toggle.setAttribute(
      'aria-label',
      `${text(lane.collapsed ? 'expand' : 'collapse')} ${nameText} (${countText})`,
    );
    toggle.setAttribute('aria-expanded', String(!lane.collapsed));
    const arrow = lane.collapsed ? '›' : '⌄';
    if (chevron.textContent !== arrow) chevron.textContent = arrow;
    section.setAttribute('aria-label', nameText);
    section.toggleAttribute('data-collapsed', lane.collapsed);
    section.toggleAttribute('data-legacy', !lane.writable);
    const rated = property.type === 'rating' && lane.value !== null;
    if (rated && !mark.firstChild)
      mark.append(createFieldIcon(doc, `property:${property.key}`, 'rating'));
    mark.toggleAttribute('data-rating-lane', rated);
    const tone = rated
      ? 'amber'
      : lane.value !== null && lane.writable
        ? optionTone(property, lane.value)
        : undefined;
    if (tone) {
      section.dataset.tone = tone;
      mark.dataset.tone = tone;
    } else {
      delete section.dataset.tone;
      delete mark.dataset.tone;
    }
    mark.hidden = lane.value === null;
    if (lane.collapsed && !scroll.hidden) node.scrollTop = scroll.scrollTop;
    const expanding = scroll.hidden && !lane.collapsed;
    scroll.hidden = lane.collapsed;
    paintCards(node);
    if (expanding) scroll.scrollTop = node.scrollTop;
  }

  function findRow(id: number): { lane: LaneNode; index: number } | undefined {
    for (const lane of lanes.values()) {
      const index = lane.lane.rows.findIndex((row) => row.id === id);
      if (index >= 0) return { lane, index };
    }
    return undefined;
  }

  function mountedCard(id: number): CardNode | undefined {
    for (const lane of lanes.values()) {
      const card = lane.mounted.get(id);
      if (card) return card;
    }
    return undefined;
  }

  function reveal(lane: LaneNode, target: HTMLElement): void {
    const bounds = lane.section.getBoundingClientRect();
    const viewport = root.getBoundingClientRect();
    if (bounds.left < viewport.left) root.scrollLeft += bounds.left - viewport.left;
    else if (bounds.right > viewport.right) root.scrollLeft += bounds.right - viewport.right;
    if (lane.scroll.contains(target)) {
      const card = target.getBoundingClientRect();
      const visible = lane.scroll.getBoundingClientRect();
      const gap = 4;
      const top = visible.top + gap;
      const bottom = visible.top + lane.scroll.clientHeight - gap;
      if (lane.scroll.clientHeight <= 2 * gap) return;
      if (card.top < top || card.height > bottom - top) lane.scroll.scrollTop += card.top - top;
      else if (card.bottom > bottom) lane.scroll.scrollTop += card.bottom - bottom;
    }
  }

  function focusLane(lane: LaneNode, index: number, control?: string | null, scroll = true): void {
    const { rows, collapsed } = lane.lane;
    let target: HTMLElement = lane.toggle;
    if (!collapsed && index >= 0 && rows.length > 0) {
      const row = rows[Math.min(index, rows.length - 1)]!;
      if (!lane.mounted.has(row.id)) {
        lane.limit = Math.max(lane.limit + PAGE_SIZE, index + 1);
        paintCards(lane);
      }
      const card = lane.mounted.get(row.id)?.element;
      if (card) target = focusedControl(card, control);
    }
    target.focus({ preventScroll: true });
    if (scroll) reveal(lane, target);
  }

  function continueFollow(): void {
    const intent = follow;
    if (!intent) return;
    if (doc.activeElement !== intent.anchor) {
      follow = undefined;
      return;
    }
    if (!intent.saved) return;
    const lane = lanes.get(intent.laneId);
    const index = lane?.lane.rows.findIndex((row) => row.id === intent.id) ?? -1;
    if (!lane || index < 0) return;
    if (!lane.lane.collapsed) {
      follow = undefined;
      if (!lane.mounted.get(intent.id)?.element.contains(doc.activeElement)) focusLane(lane, index);
    } else if (!intent.expanding) {
      intent.expanding = true;
      actions.toggle(lane.lane.id);
    }
  }

  function removeLane(lane: LaneNode): void {
    lane.observer?.disconnect();
    lane.section.remove();
  }

  function render(next: BoardRender): void {
    if (disposed) return;
    const active = doc.activeElement;
    if (follow && active !== follow.anchor) follow = undefined;
    const oldLane = laneAt(active);
    const oldCard = cardAt(oldLane, active);
    const oldIndex = oldLane?.lane.rows.findIndex((row) => row.id === oldCard?.row.id) ?? -1;
    const control = active?.getAttribute('data-focus');
    const sameBoard =
      state?.viewID === next.viewID &&
      state.property?.key === next.property?.key &&
      state.property?.type === next.property?.type &&
      state.loading === next.loading;
    const wasInBoard = active !== null && root.contains(active);
    if (!sameBoard) clear();
    state = next;
    if (next.loading) root.setAttribute('aria-busy', 'true');
    else root.removeAttribute('aria-busy');
    const { property } = next;
    if (next.loading || !property || next.lanes.length === 0) {
      for (const lane of lanes.values()) removeLane(lane);
      lanes.clear();
      finishDrag();
      follow = undefined;
      const label = text(next.loading ? 'loading' : property ? 'noMatches' : 'setup');
      if (messageText.textContent !== label) messageText.textContent = label;
      properties.hidden = next.loading || Boolean(property);
      if (message.parentNode !== root) root.append(message);
    } else {
      message.remove();
      let cursor = root.firstChild;
      const retained = new Set<string>();
      for (const lane of next.lanes) {
        retained.add(lane.id);
        let node = lanes.get(lane.id);
        if (!node) {
          node = makeLane(lane);
          lanes.set(lane.id, node);
        }
        if (cursor === node.section) cursor = cursor.nextSibling;
        else root.insertBefore(node.section, cursor);
        paintLane(node, lane, property);
      }
      for (const [id, lane] of lanes) {
        if (retained.has(id)) continue;
        removeLane(lane);
        lanes.delete(id);
      }
      if (drag && !currentDrag()) finishDrag();
      if (dropTarget && !canDrop(dropTarget)) paintDrop(undefined);
    }
    if (wasInBoard && active !== doc.activeElement) {
      const match = sameBoard && oldCard ? findRow(oldCard.row.id) : undefined;
      const previousLane = sameBoard && oldLane ? lanes.get(oldLane.lane.id) : undefined;
      const fallback = previousLane || (next.lanes[0] && lanes.get(next.lanes[0].id));
      if (match) focusLane(match.lane, match.index, control, match.lane !== oldLane);
      else if (fallback) focusLane(fallback, previousLane ? oldIndex : -1, undefined, false);
      else root.focus({ preventScroll: true });
      if (follow && doc.activeElement) {
        if (!match) follow = undefined;
        else follow.anchor = doc.activeElement;
      }
    }
    continueFollow();
  }

  async function write(
    row: Row,
    property: Property,
    value: string | null,
    destination?: string,
    queueRating = false,
  ): Promise<void> {
    if (!state || !row.writable || disposed || state.loading) return;
    const card = mountedCard(row.id)?.element;
    const existing = pending.get(row.id);
    if (existing) {
      if (!queueRating || existing.ratingKey !== property.key || existing.generation !== generation)
        return;
      existing.desired = value;
      if (follow?.id === row.id && destination !== undefined) follow.laneId = destination;
      if (card) paintPending(card, existing);
      // The host can notify synchronously before the active write returns its promise.
      await (existing.result ?? Promise.resolve().then(() => existing.result));
      return;
    }

    const active = doc.activeElement;
    const activeCard = cardAt(laneAt(active), active);
    const intent: Follow | undefined =
      active && activeCard?.row.id === row.id && destination !== undefined
        ? { id: row.id, laneId: destination, anchor: active, saved: false, expanding: false }
        : undefined;
    if (intent) follow = intent;
    const operation: PendingWrite = {
      generation,
      ratingKey: queueRating ? property.key : undefined,
      desired: value,
    };
    pending.set(row.id, operation);
    if (card) paintPending(card, operation);
    operation.result = save();
    await operation.result;

    async function save(): Promise<void> {
      let saved = false;
      try {
        let sent = value;
        while (true) {
          await actions.write(row, property, sent);
          if (operation.desired === sent) break;
          // Explicit star taps update the desired value while the row remains locked.
          sent = operation.desired;
        }
        saved = true;
      } finally {
        pending.delete(row.id);
        const entry = mountedCard(row.id);
        if (entry) paintPending(entry.element);
        if (operation.generation === generation) {
          if (entry && !saved) {
            const active = doc.activeElement;
            const focused = active && entry.element.contains(active) ? active : null;
            const control = focused?.getAttribute('data-focus');
            repaintCard(entry);
            if (focused && focused !== doc.activeElement)
              focusedControl(entry.element, control).focus({ preventScroll: true });
          }
          if (intent && intent === follow) {
            if (!saved) follow = undefined;
            else {
              intent.saved = true;
              continueFollow();
            }
          }
        }
      }
    }
  }

  async function rate(row: Row, property: Property, value: string | null): Promise<void> {
    if (property.type !== 'rating' || (value !== null && !isRating(value))) return;
    const match = findRow(row.id);
    if (!match) return;
    const current = match.lane.lane.rows[match.index]!;
    const destination = state?.property?.key === property.key ? JSON.stringify(value) : undefined;
    if (destination !== undefined && !pending.has(row.id) && match.lane.lane.id === destination)
      return;
    await write(current, property, value, destination, true);
  }

  function move(row: Row, from: LaneNode, to: LaneNode): void {
    const property = state?.property;
    if (!property || from === to || !to.lane.writable) return;
    void write(row, property, to.lane.value).catch(() => {
      // The host reports write failures; the board restores from the latest rendered rows.
    });
  }

  function key(event: KeyboardEvent): boolean {
    const active = doc.activeElement;
    const target = targetElement(event.target) ?? active;
    if (root.hidden || !root.contains(active) || !root.contains(target)) return false;
    const source = laneAt(target);
    const card = cardAt(source, target);
    const command = keys.handle(event, card ? 'card' : source ? 'lane' : 'board');
    if (!command) return false;
    if (command === 'escape') {
      if (target?.closest(EDITABLE)) return false;
      if (active === root) root.blur();
      else if (source) root.focus({ preventScroll: true });
      else return false;
      event.preventDefault();
      return true;
    }
    if (!state?.property || state.loading || target?.matches(CARD_SCROLL)) return false;
    const control = target?.closest(INTERACTIVE);
    if (control && control !== source?.toggle) return false;
    const order = state.lanes;
    if (command === 'left' || command === 'right') {
      const index = source ? order.findIndex(({ id }) => id === source.lane.id) : -1;
      const step = command === 'left' ? -1 : 1;
      const next = index < 0 ? (step < 0 ? order.length - 1 : 0) : index + step;
      const neighbor = order[next];
      const destination = neighbor && lanes.get(neighbor.id);
      if (!destination) return false;
      const remembered = destination.lane.rows.findIndex(
        (row) => row.id === destination.remembered,
      );
      focusLane(destination, Math.max(0, remembered));
    } else if (command === 'up' || command === 'down') {
      const lane = source ?? (order[0] && lanes.get(order[0].id));
      if (!lane || lane.lane.collapsed || lane.lane.rows.length === 0) return false;
      const current = card ? lane.lane.rows.findIndex((row) => row.id === card.row.id) : -1;
      const next = current < 0 ? 0 : current + (command === 'up' ? -1 : 1);
      if (next < 0 || next >= lane.lane.rows.length) return false;
      focusLane(lane, next);
    } else if (card && typeof command === 'object') {
      const property = state.property.type === 'rating' ? state.property : state.rating;
      if (!property || !card.row.writable || pending.has(card.row.id)) return false;
      if (readProperty(card.row.extra, property) !== command.rating)
        void rate(card.row, property, command.rating).catch(() => {});
    } else if (card && command === 'locate') {
      actions.open(card.row, false);
    } else return false;
    event.preventDefault();
    return true;
  }

  function hasSelection(card: HTMLElement): boolean {
    const selection = win?.getSelection();
    if (!selection || selection.isCollapsed) return false;
    for (let i = 0; i < selection.rangeCount; i++) {
      if (selection.getRangeAt(i).intersectsNode(card)) return true;
    }
    return false;
  }

  function onMouseDown(event: MouseEvent): void {
    const target = targetElement(event.target);
    const card = cardAt(laneAt(target), target)?.element;
    pressedControl = card && target?.closest(INTERACTIVE) ? card : undefined;
  }

  function onClick(event: MouseEvent): void {
    const target = targetElement(event.target);
    if (target === properties) {
      actions.properties();
      return;
    }
    const lane = laneAt(target);
    if (lane && target && lane.toggle.contains(target)) {
      actions.toggle(lane.lane.id);
      return;
    }
    const card = cardAt(lane, target);
    if (
      card &&
      !target?.closest(INTERACTIVE) &&
      !target?.closest(CARD_SCROLL) &&
      !hasSelection(card.element)
    )
      card.element.focus({ preventScroll: true });
  }

  function onDoubleClick(event: MouseEvent): void {
    const target = targetElement(event.target);
    const card = cardAt(laneAt(target), target);
    if (card && !target?.closest(INTERACTIVE)) actions.open(card.row, false);
  }

  function onFocus(event: FocusEvent): void {
    const target = targetElement(event.target);
    const lane = laneAt(target);
    const card = cardAt(lane, target);
    if (lane && card) lane.remembered = card.row.id;
  }

  function onDragStart(event: DragEvent): void {
    const target = targetElement(event.target);
    const lane = laneAt(target);
    const card = cardAt(lane, target);
    if (!card || !lane) return;
    const blocked = pressedControl === card.element || target?.closest(INTERACTIVE);
    finishDrag();
    if (
      event.defaultPrevented ||
      root.hidden ||
      blocked ||
      !card.row.writable ||
      pending.has(card.row.id) ||
      !event.dataTransfer ||
      hasSelection(card.element)
    ) {
      event.preventDefault();
      return;
    }
    const itemKey = card.row.itemKey ?? String(card.row.id);
    event.dataTransfer.setData('text/plain', itemKey);
    event.dataTransfer.effectAllowed = 'move';
    drag = { lane, card, itemKey };
    card.element.setAttribute('data-dragging', '');
    doc.addEventListener('dragend', finishDrag, true);
    doc.addEventListener('drop', finishDrag);
  }

  function currentDrag(): DragSource | undefined {
    if (!drag || state?.loading || root.hidden) return undefined;
    const { lane, card, itemKey } = drag;
    return lanes.get(lane.lane.id) === lane &&
      lane.mounted.get(card.row.id) === card &&
      (card.row.itemKey ?? String(card.row.id)) === itemKey &&
      card.element.ownerDocument === doc &&
      root.contains(card.element) &&
      card.row.writable &&
      !pending.has(card.row.id)
      ? drag
      : undefined;
  }

  function canDrop(lane: LaneNode, source = currentDrag()): boolean {
    return Boolean(
      source && lanes.get(lane.lane.id) === lane && lane !== source.lane && lane.lane.writable,
    );
  }

  function paintDrop(lane: LaneNode | undefined): void {
    if (dropTarget === lane) return;
    dropTarget?.section.removeAttribute('data-drop-target');
    dropTarget = lane;
    dropTarget?.section.setAttribute('data-drop-target', '');
  }

  function onDragOver(event: DragEvent): void {
    const lane = laneAt(targetElement(event.target));
    if (lane && event.dataTransfer?.types.includes('text/plain') && canDrop(lane)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      paintDrop(lane);
    } else paintDrop(undefined);
  }

  function onDragLeave(event: DragEvent): void {
    const lane = laneAt(targetElement(event.target));
    if (dropTarget === lane && lane && laneAt(targetElement(event.relatedTarget)) !== lane)
      paintDrop(undefined);
  }

  function onDrop(event: DragEvent): void {
    const source = currentDrag();
    const lane = laneAt(targetElement(event.target));
    const accepted =
      source &&
      lane &&
      canDrop(lane, source) &&
      event.dataTransfer?.getData('text/plain') === source.itemKey;
    finishDrag();
    if (accepted) {
      event.preventDefault();
      move(source.card.row, source.lane, lane);
    }
  }

  function finishDrag(): void {
    paintDrop(undefined);
    drag?.card.element.removeAttribute('data-dragging');
    drag = undefined;
    pressedControl = undefined;
    doc.removeEventListener('dragend', finishDrag, true);
    doc.removeEventListener('drop', finishDrag);
  }

  root.addEventListener('mousedown', onMouseDown);
  root.addEventListener('click', onClick);
  root.addEventListener('dblclick', onDoubleClick);
  root.addEventListener('focusin', onFocus);
  root.addEventListener('dragstart', onDragStart);
  root.addEventListener('dragenter', onDragOver);
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('dragleave', onDragLeave);
  root.addEventListener('drop', onDrop);

  function clear(): void {
    generation++;
    state = undefined;
    follow = undefined;
    finishDrag();
    for (const lane of lanes.values()) lane.observer?.disconnect();
    lanes.clear();
    root.replaceChildren();
    root.removeAttribute('aria-busy');
    root.scrollLeft = 0;
  }

  return {
    render,
    key,
    rate,
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      root.removeEventListener('mousedown', onMouseDown);
      root.removeEventListener('click', onClick);
      root.removeEventListener('dblclick', onDoubleClick);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragenter', onDragOver);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('dragleave', onDragLeave);
      root.removeEventListener('drop', onDrop);
    },
  };
}

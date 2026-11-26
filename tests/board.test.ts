// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoard, type BoardRender } from '../src/board';
import { boardLanes } from '../src/board-model';
import type { BoardSettings, Property, Row } from '../src/contracts';
import { writeProperty } from '../src/extra';
import type { Language } from '../src/i18n';

const status: Property = {
  key: 'Status',
  type: 'single-select',
  options: ['Read', 'Done', 'Later'],
  optionColors: { Read: 'green' },
};
const priority: Property = { key: 'Priority', type: 'rating' };

function sample(id: number, extra = '', writable = true): Row {
  return {
    id,
    itemKey: `ZOTERO${id}`,
    writable,
    title: `Item ${id}`,
    creators: '',
    year: '',
    source: '',
    type: 'journalArticle',
    tags: [],
    pdf: id === 1,
    added: '',
    extra,
  };
}

const destroy: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of destroy.splice(0)) cleanup();
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

function fixture(
  rows: readonly Row[] = [],
  options: { document?: Document; language?: Language; property?: Property } = {},
) {
  const doc = options.document ?? document;
  const root = doc.createElement('div');
  const search = doc.createElement('input');
  doc.body.append(search, root);
  const settings = {
    cardFields: [],
    hideEmptyLanes: false as boolean,
    collapsedLanes: [] as string[],
  } satisfies BoardSettings;
  const model = {
    property: options.property ?? status,
    rating: priority as Property | undefined,
    rows,
    viewID: 'board-1',
    cardRevision: 0,
    beforeWrite: undefined as (() => Promise<void>) | undefined,
  };
  const write = vi.fn(async (row: Row, property: Property, value: string | null) => {
    await model.beforeWrite?.();
    model.rows = model.rows.map((entry) =>
      entry.id === row.id
        ? { ...entry, extra: writeProperty(entry.extra, property, value) }
        : entry,
    );
  });
  const open = vi.fn<(row: Row, pdf: boolean) => void>();
  const properties = vi.fn();
  const toggle = vi.fn((id: string) => {
    settings.collapsedLanes = settings.collapsedLanes.includes(id)
      ? settings.collapsedLanes.filter((entry) => entry !== id)
      : [...settings.collapsedLanes, id];
    render();
  });
  const board = createBoard(root, {
    language: options.language ?? 'en',
    write,
    open,
    properties,
    toggle,
    card(row, element) {
      const label = doc.createElement('span');
      label.textContent = row.title;
      const button = doc.createElement('button');
      button.textContent = 'Card action';
      button.dataset.focus = 'action';
      element.replaceChildren(label, button);
    },
  });
  const keyboard = (event: KeyboardEvent) => board.key(event);
  doc.addEventListener('keydown', keyboard);
  destroy.push(() => {
    doc.removeEventListener('keydown', keyboard);
    board.dispose();
    root.remove();
    search.remove();
  });

  function render(overrides: Partial<BoardRender> = {}) {
    board.render({
      viewID: model.viewID,
      property: model.property,
      lanes: boardLanes(model.rows, model.property, settings),
      rating: model.rating,
      cardRevision: model.cardRevision,
      loading: false,
      ...overrides,
    });
  }

  function lane(value: string | null): HTMLElement {
    return Array.from(root.querySelectorAll<HTMLElement>('.zb-board-lane')).find(
      (element) => element.dataset.laneId === JSON.stringify(value),
    )!;
  }

  return {
    board,
    root,
    search,
    settings,
    model,
    write,
    open,
    properties,
    toggle,
    render,
    lane,
    card: (id: number) => root.querySelector<HTMLElement>(`.zb-board-card[data-item-id="${id}"]`)!,
    header: (value: string | null) =>
      lane(value).querySelector<HTMLButtonElement>('.zb-board-lane-toggle')!,
    viewport: (value: string | null) =>
      lane(value).querySelector<HTMLElement>('.zb-board-lane-scroll')!,
  };
}

function key(target: HTMLElement, value: string, mod: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: value,
    bubbles: true,
    cancelable: true,
    ...mod,
  });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function transfer(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('text/plain', initial);
  return {
    setData: vi.fn((type: string, value: string) => data.set(type, value)),
    getData: (type: string) => data.get(type) ?? '',
    get types() {
      return [...data.keys()];
    },
    effectAllowed: 'none',
    dropEffect: 'none',
  };
}

function drag(target: EventTarget, type: string, dataTransfer = transfer()) {
  // jsdom does not implement DragEvent/DataTransfer. The event still traverses the real DOM.
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

async function writesSettle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('board surface', () => {
  it('distinguishes localized setup, loading, and a query with no matching items', () => {
    const f = fixture([], { language: 'zh-CN' });
    f.render({ property: undefined, lanes: [] });
    expect(f.root.getAttribute('aria-label')).toBe('看板');
    expect(f.root.querySelector('[role="status"]')?.textContent).toContain('单选或评分');
    const manage = f.root.querySelector<HTMLButtonElement>('.zb-board-properties')!;
    expect(manage.textContent).toBe('打开属性');
    expect(manage.hidden).toBe(false);
    manage.click();
    expect(f.properties).toHaveBeenCalledOnce();

    f.render({ loading: true });
    expect(f.root.getAttribute('aria-busy')).toBe('true');
    expect(f.root.querySelector('[role="status"]')?.textContent).toBe('正在加载条目…');
    expect(manage.hidden).toBe(true);

    f.settings.hideEmptyLanes = true;
    f.render();
    expect(f.root.querySelector('[role="status"]')?.textContent).toBe('没有匹配的条目。');
    expect(f.root.querySelector('.zb-board-lane')).toBeNull();
    expect(manage.hidden).toBe(true);
  });

  it('shows ordered declared, empty and legacy lanes with option colors and rating markers', () => {
    const f = fixture([sample(1, 'Status: Retired'), sample(2, 'Status: Read')]);
    f.render();
    expect(
      Array.from(f.root.querySelectorAll('.zb-board-lane-label'), (node) => node.textContent),
    ).toEqual(['Not set', 'Read', 'Done', 'Later', 'Retired']);
    expect(f.lane('Read').querySelector('[data-tone="green"]')).not.toBeNull();
    expect(f.lane('Retired').hasAttribute('data-legacy')).toBe(true);
    expect(f.lane('Done').querySelector('.zb-board-lane-empty')?.textContent).toBe('No items');
    f.model.property = priority;
    f.render();
    expect(f.lane('5').querySelector('.zb-board-lane-mark[data-tone="amber"] svg')).not.toBeNull();
    expect(f.lane('1').getAttribute('aria-label')).toBe('1 star');
  });

  it('writes one native cross-lane drop into a collapsed lane and clears via the unset lane', async () => {
    const row = sample(1, 'Memo: keep\nStatus: Read\nPriority: 3');
    const f = fixture([row]);
    f.settings.collapsedLanes = ['"Done"'];
    f.render();
    const dnd = transfer();
    expect(drag(f.card(1), 'dragstart', dnd)).toBe(false);
    expect(dnd.setData).toHaveBeenCalledExactlyOnceWith('text/plain', 'ZOTERO1');
    expect(dnd.effectAllowed).toBe('move');
    expect(drag(f.header('Done'), 'dragover', dnd)).toBe(true);
    expect(f.lane('Done').hasAttribute('data-drop-target')).toBe(true);
    expect(dnd.dropEffect).toBe('move');
    expect(drag(f.header('Done'), 'drop', dnd)).toBe(true);
    expect(f.lane('Done').hasAttribute('data-drop-target')).toBe(false);
    expect(f.write).toHaveBeenCalledExactlyOnceWith(row, status, 'Done');
    expect(f.lane('Read').contains(f.card(1))).toBe(true);
    await writesSettle();
    f.render();
    expect(f.header('Done').getAttribute('aria-expanded')).toBe('false');
    expect(f.lane('Done').querySelector('.zb-board-lane-count')?.textContent).toBe('1');
    expect(f.toggle).not.toHaveBeenCalled();
    f.header('Done').click();
    const second = transfer();
    drag(f.card(1), 'dragstart', second);
    expect(drag(f.lane(null), 'drop', second)).toBe(true);
    expect(f.write).toHaveBeenLastCalledWith(f.model.rows[0], status, null);
    await writesSettle();
    f.render();
    expect(f.model.rows[0]?.extra).toBe('Memo: keep\nPriority: 3');
    expect(f.lane(null).contains(f.card(1))).toBe(true);
  });

  it('rejects external payloads, stale drags, same or legacy targets, and read-only cards', () => {
    const f = fixture([sample(1, 'Status: Read'), sample(2, 'Status: Old'), sample(3, '', false)], {
      document: document.implementation.createHTMLDocument(),
    });
    f.render();
    const native = transfer();
    expect(f.card(3).draggable).toBe(false);
    expect(f.card(3).getAttribute('aria-label')).toContain('Read-only');
    expect(drag(f.card(3), 'dragstart', native)).toBe(true);
    expect(native.setData).not.toHaveBeenCalled();
    expect(drag(f.lane('Done'), 'drop', transfer('ZOTERO1'))).toBe(false);
    for (const target of [f.lane('Read'), f.lane('Old')]) {
      drag(f.card(1), 'dragstart', native);
      expect(drag(target, 'dragover', native)).toBe(false);
      expect(drag(target, 'drop', native)).toBe(false);
    }
    drag(f.card(1), 'dragstart', native);
    expect(drag(f.lane('Done'), 'drop', transfer('wrong'))).toBe(false);
    drag(f.card(1), 'dragstart', native);
    drag(f.lane('Done'), 'dragover', native);
    drag(f.root.ownerDocument, 'dragend', native);
    expect(f.lane('Done').hasAttribute('data-drop-target')).toBe(false);
    expect(drag(f.lane('Done'), 'drop', native)).toBe(false);
    drag(f.card(1), 'dragstart', native);
    f.board.clear();
    f.render();
    expect(drag(f.lane('Done'), 'drop', native)).toBe(false);
    expect(f.write).not.toHaveBeenCalled();
  });

  it('does not drag child controls or text selections and locates only on a body double-click', () => {
    const row = sample(1);
    const f = fixture([row]);
    f.render();
    const card = f.card(1);
    const control = card.querySelector('button')!;
    const label = card.querySelector('span')!;
    const controlDrag = transfer();
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(drag(card, 'dragstart', controlDrag)).toBe(true);
    expect(controlDrag.setData).not.toHaveBeenCalled();
    const range = document.createRange();
    range.selectNodeContents(label);
    window.getSelection()?.addRange(range);
    expect(drag(label, 'dragstart')).toBe(true);
    window.getSelection()?.removeAllRanges();
    control.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(f.open).not.toHaveBeenCalled();
    label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(f.open).toHaveBeenCalledExactlyOnceWith(row, false);
  });

  it('navigates visible lanes, remembers a lane card, and leaves native controls and search alone', () => {
    const f = fixture([sample(1), sample(2, 'Status: Done'), sample(3, 'Status: Done')]);
    f.settings.hideEmptyLanes = true;
    f.render();
    f.card(1).focus();
    expect(key(f.card(1), 'l')).toBe(true);
    expect(document.activeElement).toBe(f.card(2));
    key(f.card(2), 'j');
    expect(document.activeElement).toBe(f.card(3));
    key(f.card(3), 'ArrowLeft');
    expect(document.activeElement).toBe(f.card(1));
    key(f.card(1), 'ArrowRight');
    expect(document.activeElement).toBe(f.card(3));
    key(f.card(3), 'k');
    expect(document.activeElement).toBe(f.card(2));

    f.settings.hideEmptyLanes = false;
    f.render();
    key(f.card(2), 'l');
    expect(document.activeElement).toBe(f.header('Later'));
    expect(key(f.header('Later'), 'Enter')).toBe(false);
    expect(key(f.header('Later'), ' ')).toBe(false);
    key(f.header('Later'), 'h');
    expect(document.activeElement).toBe(f.card(2));
    f.card(1).focus();
    expect(key(f.card(1), 'Enter')).toBe(true);
    expect(key(f.card(1), 'o')).toBe(true);
    expect(f.open.mock.calls.map(([, pdf]) => pdf)).toEqual([false, true]);
    f.card(2).focus();
    expect(key(f.card(2), 'o')).toBe(false);

    const control = f.card(2).querySelector('button')!;
    control.focus();
    expect(key(control, 'h')).toBe(false);
    expect(key(control, '5')).toBe(false);
    expect(document.activeElement).toBe(control);
    f.search.focus();
    expect(key(f.search, 'j')).toBe(false);
    expect(key(f.search, '1')).toBe(false);
    expect(f.write).not.toHaveBeenCalled();
  });

  it.each(['save', 'refresh'] as const)(
    'follows a moved card into a collapsed lane when %s arrives first',
    async (first) => {
      const f = fixture([sample(1, 'Status: Read')]);
      f.settings.collapsedLanes = ['"Done"'];
      let complete!: () => void;
      f.model.beforeWrite = () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        });
      f.render();
      f.card(1).focus();
      expect(key(f.card(1), 'L', { shiftKey: true })).toBe(true);
      expect(key(f.card(1), 'L', { shiftKey: true })).toBe(false);
      expect(f.write).toHaveBeenCalledExactlyOnceWith(f.model.rows[0], status, 'Done');
      expect(f.card(1).hasAttribute('data-pending')).toBe(true);
      expect(f.toggle).not.toHaveBeenCalled();
      if (first === 'refresh') {
        f.model.rows = [sample(1, 'Status: Done')];
        f.render();
        expect(document.activeElement).toBe(f.header('Done'));
        expect(f.toggle).not.toHaveBeenCalled();
      }
      complete();
      await writesSettle();
      if (first === 'save') {
        expect(f.lane('Read').contains(f.card(1))).toBe(true);
        expect(f.toggle).not.toHaveBeenCalled();
        f.render();
      }
      expect(f.toggle).toHaveBeenCalledExactlyOnceWith('"Done"');
      expect(f.header('Done').getAttribute('aria-expanded')).toBe('true');
      expect(f.lane('Done').contains(f.card(1))).toBe(true);
      expect(document.activeElement).toBe(f.card(1));
    },
  );

  it('can leave a legacy lane with Shift, but never moves a read-only row', async () => {
    const f = fixture([sample(1, 'Status: Old'), sample(2, 'Status: Done', false)]);
    f.render();
    f.card(2).focus();
    expect(key(f.card(2), 'ArrowLeft', { shiftKey: true })).toBe(false);
    f.card(1).focus();
    expect(key(f.card(1), 'ArrowLeft', { shiftKey: true })).toBe(true);
    expect(f.write).toHaveBeenCalledExactlyOnceWith(f.model.rows[0], status, 'Later');
    await writesSettle();
    f.render();
    expect(f.lane('Later').contains(document.activeElement)).toBe(true);
  });

  it('does not expand a destination or reclaim focus after the user goes back to search', async () => {
    const f = fixture([sample(1, 'Status: Read')]);
    f.settings.collapsedLanes = ['"Done"'];
    f.render();
    f.card(1).focus();
    key(f.card(1), 'L', { shiftKey: true });
    f.search.focus();
    await writesSettle();
    f.render();
    expect(f.toggle).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(f.search);
    expect(f.header('Done').getAttribute('aria-expanded')).toBe('false');
  });

  it('repaints a failed write without losing focus or showing the card in the destination', async () => {
    const row = sample(1, 'Priority: 2');
    const f = fixture([row]);
    f.model.beforeWrite = () => Promise.reject(new Error('Write failed'));
    f.render();
    const control = f.card(1).querySelector('button')!;
    control.focus();
    await expect(f.board.rate(row, priority, '4')).rejects.toThrow('Write failed');
    expect(f.card(1).hasAttribute('data-pending')).toBe(false);
    expect(control.isConnected).toBe(false);
    expect(document.activeElement).toBe(f.card(1).querySelector('button'));
    expect(f.model.rows[0]?.extra).toBe('Priority: 2');
  });

  it('serializes rapid same-property taps and persists only the latest queued intent', async () => {
    const row = sample(1, 'Memo: keep');
    const f = fixture([row]);
    let complete!: () => void;
    const gate = new Promise<void>((resolve) => {
      complete = resolve;
    });
    f.model.beforeWrite = () => gate;
    f.render();
    const first = f.board.rate(row, priority, '3');
    const superseded = f.board.rate(row, priority, '4');
    const clear = f.board.rate(row, priority, null);
    expect(f.write).toHaveBeenCalledExactlyOnceWith(row, priority, '3');
    expect(f.card(1).dataset.pendingRating).toBe('Priority');
    expect(f.card(1).dataset.pendingRatingValue).toBe('');

    f.model.rows = [sample(1, 'Memo: keep\nPriority: 3')];
    f.render();
    expect(f.card(1).dataset.pendingRatingValue).toBe('');
    expect(drag(f.card(1), 'dragstart')).toBe(true);
    complete();
    await Promise.all([first, superseded, clear]);
    expect(f.write.mock.calls.map(([, , value]) => value)).toEqual(['3', null]);
    expect(f.model.rows[0]?.extra).toBe('Memo: keep\n');
    expect(f.card(1).dataset.pendingRating).toBeUndefined();
    expect(f.card(1).hasAttribute('aria-busy')).toBe(false);
  });

  it('honors a star re-click after a save even before the new query reaches the board', async () => {
    const row = sample(1);
    const f = fixture([row]);
    f.render();
    await f.board.rate(row, priority, '3');
    await f.board.rate(row, priority, null);
    expect(f.write.mock.calls.map(([, , value]) => value)).toEqual(['3', null]);
    expect(f.model.rows[0]?.extra).toBe('');
  });

  it('uses the visible card rating or the lane rating, including a currently hidden star lane', async () => {
    const row = sample(1, 'Status: Read');
    const f = fixture([row]);
    f.render();
    f.card(1).focus();
    expect(key(f.card(1), '5', { repeat: true })).toBe(false);
    expect(key(f.card(1), '5', { isComposing: true })).toBe(false);
    expect(key(f.card(1), '3')).toBe(true);
    expect(f.write).toHaveBeenCalledExactlyOnceWith(row, priority, '3');
    await writesSettle();
    f.render();
    await f.board.rate(f.model.rows[0]!, priority, null);
    expect(f.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ extra: 'Status: Read\nPriority: 3' }),
      priority,
      null,
    );
    f.model.property = priority;
    f.model.rating = undefined;
    f.settings.hideEmptyLanes = true;
    f.render();
    expect(f.lane('5')).toBeUndefined();
    f.card(1).focus();
    expect(key(f.card(1), '5')).toBe(true);
    await writesSettle();
    f.render();
    expect(f.lane('5').contains(document.activeElement)).toBe(true);
    key(f.card(1), '0');
    await writesSettle();
    f.render();
    expect(f.lane(null).contains(document.activeElement)).toBe(true);
  });

  it('repaints card fields without replacing lanes, preserves scrolling, and resolves filtered focus', () => {
    const f = fixture([sample(1), sample(2), sample(3, 'Status: Done')]);
    f.render();
    const lane = f.lane(null);
    const item = f.card(1);
    const viewport = f.viewport(null);
    viewport.scrollTop = 80;
    f.viewport('Done').scrollTop = 24;
    const control = item.querySelector('button')!;
    control.focus();
    f.model.cardRevision++;
    f.render();
    expect(f.lane(null)).toBe(lane);
    expect(f.card(1)).toBe(item);
    expect(f.viewport(null).scrollTop).toBe(80);
    expect(f.viewport('Done').scrollTop).toBe(24);
    expect(document.activeElement).toBe(item.querySelector('button'));
    f.model.rows = f.model.rows.slice(1);
    f.render();
    expect(document.activeElement).toBe(f.card(2));
    f.search.focus();
    f.model.rows = [];
    f.settings.hideEmptyLanes = true;
    f.render();
    expect(document.activeElement).toBe(f.search);
    expect(f.root.querySelector('[role="status"]')?.textContent).toBe('No matching items.');
  });

  it('bounds the initial DOM for 320 cards and reveals more by keyboard or scrolling their lane', () => {
    const f = fixture(Array.from({ length: 320 }, (_, index) => sample(index + 1)));
    f.render();
    const cards = () => f.lane(null).querySelectorAll<HTMLElement>('.zb-board-card');
    expect(cards().length).toBeGreaterThan(0);
    expect(cards().length).toBeLessThanOrEqual(60);
    expect(f.lane(null).querySelector('.zb-board-lane-count')?.textContent).toBe('320');
    const edge = cards().length;
    f.card(edge).focus();
    expect(key(f.card(edge), 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(f.card(edge + 1));
    const scroll = f.viewport(null);
    Object.defineProperties(scroll, {
      clientHeight: { value: 400 },
      scrollHeight: { get: () => cards().length * 100 },
    });
    scroll.scrollTop = scroll.scrollHeight - scroll.clientHeight;
    const before = cards().length;
    f.viewport('Done').dispatchEvent(new Event('scroll'));
    expect(cards()).toHaveLength(before);
    scroll.dispatchEvent(new Event('scroll'));
    expect(cards().length).toBeGreaterThan(before);
    expect(cards().length).toBeLessThan(320);
    expect(document.activeElement).toBe(f.card(edge + 1));
  });
});

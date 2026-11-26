import { describe, expect, it } from 'vitest';
import { BoardKeys, type BoardKeyContext } from '../src/board-keys';

const keys = new BoardKeys();

function press(
  key: string,
  overrides: Partial<Parameters<BoardKeys['handle']>[0]> = {},
  context: BoardKeyContext | null = 'card',
) {
  return keys.handle(
    {
      key,
      keyCode: 0,
      isComposing: false,
      defaultPrevented: false,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      ...overrides,
    },
    context ?? undefined,
  );
}

describe('BoardKeys', () => {
  it.each([
    ['h', 'left'],
    ['ArrowLeft', 'left'],
    ['l', 'right'],
    ['ArrowRight', 'right'],
    ['k', 'up'],
    ['ArrowUp', 'up'],
    ['j', 'down'],
    ['ArrowDown', 'down'],
  ])('maps %s to navigation and allows repetition', (key, command) => {
    expect(press(key)).toBe(command);
    expect(press(key, { repeat: true }, 'lane')).toBe(command);
    expect(press(key, {}, 'board')).toBe(command);
    expect(press(key, {}, null)).toBeUndefined();
  });

  it.each([
    ['h', 'moveLeft'],
    ['H', 'moveLeft'],
    ['ArrowLeft', 'moveLeft'],
    ['l', 'moveRight'],
    ['L', 'moveRight'],
    ['ArrowRight', 'moveRight'],
  ])('requires Shift and an active card to move with %s', (key, command) => {
    expect(press(key, { shiftKey: true })).toBe(command);
    expect(press(key, { shiftKey: true, repeat: true })).toBeUndefined();
    expect(press(key, { shiftKey: true }, 'lane')).toBeUndefined();
    expect(press(key, { shiftKey: true }, 'board')).toBeUndefined();
  });

  it.each(['0', '1', '2', '3', '4', '5'])('rates with the plain digit %s only', (key) => {
    expect(press(key)).toEqual({ rating: key === '0' ? null : key });
    expect(press(key, { repeat: true })).toBeUndefined();
    expect(press(key, { shiftKey: true })).toBeUndefined();
    expect(press(key, {}, 'lane')).toBeUndefined();
  });

  it('opens the item or PDF without hijacking native header activation or Space', () => {
    expect(press('Enter')).toBe('locate');
    expect(press('o')).toBe('openPdf');
    expect(press('Enter', {}, 'lane')).toBeUndefined();
    expect(press('o', {}, 'board')).toBeUndefined();
    for (const key of [' ', 'Spacebar', '6', 'O']) expect(press(key)).toBeUndefined();
  });

  it('ignores IME, prevented events and system-modified shortcuts', () => {
    for (const modifiers of [
      { isComposing: true },
      { keyCode: 229 },
      { defaultPrevented: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
    ]) {
      expect(press('j', modifiers)).toBeUndefined();
      expect(press('5', modifiers)).toBeUndefined();
      expect(press('L', { ...modifiers, shiftKey: true })).toBeUndefined();
    }
  });
});

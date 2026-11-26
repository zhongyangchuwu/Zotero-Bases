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
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
  ])('maps %s to navigation and allows repetition', (key, command) => {
    expect(press(key)).toBe(command);
    expect(press(key, { repeat: true }, 'lane')).toBe(command);
    expect(press(key, {}, 'board')).toBe(command);
    expect(press(key, { shiftKey: true })).toBeUndefined();
    expect(press(key, {}, null)).toBeUndefined();
  });

  it.each(['h', 'j', 'k', 'l', 'o'])('leaves %s and its Shift form unbound', (key) => {
    expect(press(key)).toBeUndefined();
    expect(press(key, { shiftKey: true })).toBeUndefined();
    expect(press(key.toUpperCase(), { shiftKey: true })).toBeUndefined();
  });

  it.each(['0', '1', '2', '3', '4', '5'])('rates with the plain digit %s only', (key) => {
    expect(press(key)).toEqual({ rating: key === '0' ? null : key });
    expect(press(key, { repeat: true })).toBeUndefined();
    expect(press(key, { shiftKey: true })).toBeUndefined();
    expect(press(key, {}, 'lane')).toBeUndefined();
  });

  it('locates only on a non-repeated Enter from a card and leaves Space unbound', () => {
    expect(press('Enter')).toBe('locate');
    expect(press('Enter', { repeat: true })).toBeUndefined();
    expect(press('Enter', {}, 'lane')).toBeUndefined();
    expect(press('Enter', {}, 'board')).toBeUndefined();
    for (const key of [' ', 'Spacebar', '6']) expect(press(key)).toBeUndefined();
  });

  it.each(['card', 'lane', 'board'] as const)('handles Escape within the %s', (context) => {
    expect(press('Escape', {}, context)).toBe('escape');
    expect(press('Escape', { repeat: true }, context)).toBeUndefined();
    expect(press('Escape', {}, null)).toBeUndefined();
  });

  it('ignores IME, prevented events and system-modified shortcuts', () => {
    for (const modifiers of [
      { isComposing: true },
      { keyCode: 229 },
      { defaultPrevented: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { shiftKey: true },
    ]) {
      expect(press('ArrowDown', modifiers)).toBeUndefined();
      expect(press('5', modifiers)).toBeUndefined();
      expect(press('Escape', modifiers)).toBeUndefined();
    }
  });
});

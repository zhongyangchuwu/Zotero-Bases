import { describe, expect, it } from 'vitest';
import { TableKeys, type TableCommand } from '../src/table-keys';

type KeyEvent = Parameters<TableKeys['handle']>[0];

function key(key: string, options: Partial<Omit<KeyEvent, 'key'>> = {}): KeyEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    keyCode: 0,
    ...options,
  };
}

describe('TableKeys', () => {
  it.each<[string, TableCommand]>([
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
    ['ArrowDown', 'down'],
    ['ArrowUp', 'up'],
    ['Enter', 'activate'],
    ['Escape', 'escape'],
  ])('maps %s to %s', (input, command) => {
    expect(new TableKeys().handle(key(input))).toBe(command);
  });

  it('allows navigation to repeat but does not repeat actions', () => {
    const keys = new TableKeys();
    for (const [input, command] of [
      ['ArrowLeft', 'left'],
      ['ArrowRight', 'right'],
      ['ArrowDown', 'down'],
      ['ArrowUp', 'up'],
    ] as const) {
      expect(keys.handle(key(input, { repeat: true }))).toBe(command);
    }
    for (const input of ['Enter', 'Escape', '0', '5']) {
      expect(keys.handle(key(input, { repeat: true }))).toBeUndefined();
    }
  });

  it('leaves Space untouched with every combination of modifiers', () => {
    const keys = new TableKeys();
    for (let modifiers = 0; modifiers < 16; modifiers++) {
      expect(
        keys.handle(
          key(' ', {
            ctrlKey: Boolean(modifiers & 1),
            metaKey: Boolean(modifiers & 2),
            altKey: Boolean(modifiers & 4),
            shiftKey: Boolean(modifiers & 8),
          }),
        ),
      ).toBeUndefined();
    }
  });

  it('leaves the removed shortcuts and unsupported keys to their native behavior', () => {
    const keys = new TableKeys();
    for (const input of ['h', 'j', 'k', 'l', 'x', 'o', 'i', 'g', 'g', 'G', '/']) {
      expect(keys.handle(key(input))).toBeUndefined();
    }
    for (const input of ['PageUp', 'PageDown', '?']) {
      expect(keys.handle(key(input))).toBeUndefined();
    }
    for (const input of ['d', 'u']) {
      expect(keys.handle(key(input, { ctrlKey: true }))).toBeUndefined();
    }
  });

  it('leaves modified keys and both forms of composition untouched', () => {
    const keys = new TableKeys();
    for (const input of ['ArrowLeft', 'ArrowDown', 'Enter', 'Escape', '0', '1']) {
      for (const flags of [
        { ctrlKey: true },
        { altKey: true },
        { metaKey: true },
        { shiftKey: true },
        { isComposing: true },
        { keyCode: 229 },
      ]) {
        expect(keys.handle(key(input, flags))).toBeUndefined();
      }
    }
  });

  it('maps all rating digits to exact set and clear commands', () => {
    const keys = new TableKeys();
    expect(keys.handle(key('0'))).toEqual({ rating: null });
    for (const rating of ['1', '2', '3', '4', '5']) {
      expect(keys.handle(key(rating))).toEqual({ rating });
    }
    expect(keys.handle(key('6'))).toBeUndefined();
  });
});

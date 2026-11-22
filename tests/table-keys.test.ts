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
    timeStamp: 0,
    ...options,
  };
}

describe('TableKeys', () => {
  it.each<[string, TableCommand]>([
    ['h', 'left'],
    ['ArrowLeft', 'left'],
    ['l', 'right'],
    ['ArrowRight', 'right'],
    ['j', 'down'],
    ['ArrowDown', 'down'],
    ['k', 'up'],
    ['ArrowUp', 'up'],
    ['G', 'last'],
    ['PageDown', 'pageDown'],
    ['PageUp', 'pageUp'],
    ['Enter', 'activate'],
    ['i', 'edit'],
    ['x', 'toggle'],
    ['o', 'open'],
    ['Escape', 'escape'],
  ])('maps %s to %s', (input, command) => {
    expect(new TableKeys().handle(key(input))).toBe(command);
  });

  it.each<[string, TableCommand]>([
    ['J', 'extendDown'],
    ['j', 'extendDown'],
    ['ArrowDown', 'extendDown'],
    ['K', 'extendUp'],
    ['k', 'extendUp'],
    ['ArrowUp', 'extendUp'],
    ['G', 'last'],
  ])('maps shift-%s to %s', (input, command) => {
    expect(new TableKeys().handle(key(input, { shiftKey: true }))).toBe(command);
  });

  it.each<[string, TableCommand]>([
    ['d', 'pageDown'],
    ['u', 'pageUp'],
  ])('maps ctrl-%s to %s', (input, command) => {
    expect(new TableKeys().handle(key(input, { ctrlKey: true }))).toBe(command);
    expect(new TableKeys().handle(key(input, { ctrlKey: true, repeat: true }))).toBe(command);
  });

  it('recognizes gg through the 900ms boundary and starts a new sequence after expiry', () => {
    const keys = new TableKeys();
    expect(keys.handle(key('g', { timeStamp: 100 }))).toBe('prefix');
    expect(keys.handle(key('g', { timeStamp: 1000 }))).toBe('first');
    expect(keys.handle(key('g', { timeStamp: 1100 }))).toBe('prefix');
    expect(keys.handle(key('g', { timeStamp: 2001 }))).toBe('prefix');
    expect(keys.handle(key('g', { timeStamp: 2002 }))).toBe('first');
  });

  it('does not treat a repeated g as a second press or refresh its deadline', () => {
    const keys = new TableKeys();
    expect(keys.handle(key('g', { repeat: true }))).toBeUndefined();
    expect(keys.handle(key('g', { timeStamp: 100 }))).toBe('prefix');
    expect(keys.handle(key('g', { repeat: true, timeStamp: 500 }))).toBeUndefined();
    expect(keys.handle(key('g', { timeStamp: 1001 }))).toBe('prefix');
    expect(keys.handle(key('g', { timeStamp: 1002 }))).toBe('first');
  });

  it('clears the pending prefix on reset and when another key intervenes', () => {
    const keys = new TableKeys();
    expect(keys.handle(key('g'))).toBe('prefix');
    keys.reset();
    expect(keys.handle(key('g', { timeStamp: 1 }))).toBe('prefix');
    expect(keys.handle(key('h', { timeStamp: 2 }))).toBe('left');
    expect(keys.handle(key('g', { timeStamp: 3 }))).toBe('prefix');
    expect(keys.handle(key('?', { timeStamp: 4 }))).toBeUndefined();
    expect(keys.handle(key('g', { timeStamp: 5 }))).toBe('prefix');
  });

  it('does not complete a sequence with an earlier timestamp', () => {
    const keys = new TableKeys();
    expect(keys.handle(key('g', { timeStamp: 100 }))).toBe('prefix');
    expect(keys.handle(key('g', { timeStamp: 99 }))).toBe('prefix');
  });

  it('allows navigation to repeat but does not repeat actions', () => {
    const keys = new TableKeys();
    for (const [input, command] of [
      ['h', 'left'],
      ['ArrowRight', 'right'],
      ['j', 'down'],
      ['ArrowUp', 'up'],
      ['G', 'last'],
      ['PageDown', 'pageDown'],
      ['PageUp', 'pageUp'],
    ] as const) {
      expect(keys.handle(key(input, { repeat: true }))).toBe(command);
    }
    expect(keys.handle(key('J', { shiftKey: true, repeat: true }))).toBe('extendDown');
    expect(keys.handle(key('ArrowUp', { shiftKey: true, repeat: true }))).toBe('extendUp');
    for (const input of ['Enter', 'i', 'x', 'o', 'Escape']) {
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

  it('does not claim unknown shortcuts or unsupported modifier combinations', () => {
    const keys = new TableKeys();
    for (const event of [
      key('?'),
      key('J'),
      key('K'),
      key('h', { shiftKey: true }),
      key('ArrowLeft', { shiftKey: true }),
      key('PageDown', { shiftKey: true }),
      key('Enter', { shiftKey: true }),
      key('g', { ctrlKey: true }),
      key('d', { metaKey: true }),
      key('d', { altKey: true }),
      key('d', { ctrlKey: true, shiftKey: true }),
      key('d', { ctrlKey: true, metaKey: true }),
      key('u', { ctrlKey: true, altKey: true }),
      key('G', { shiftKey: true, metaKey: true }),
      key('J', { shiftKey: true, ctrlKey: true }),
    ]) {
      expect(keys.handle(event)).toBeUndefined();
    }
  });

  it('ignores composition and cancels a pending prefix', () => {
    const keys = new TableKeys();
    expect(keys.handle(key('g'))).toBe('prefix');
    expect(keys.handle(key('g', { isComposing: true, timeStamp: 1 }))).toBeUndefined();
    expect(keys.handle(key('g', { timeStamp: 2 }))).toBe('prefix');
    expect(keys.handle(key('Enter', { isComposing: true }))).toBeUndefined();
  });
});

type RatingKey = '0' | '1' | '2' | '3' | '4' | '5';

export type BoardCommand =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'locate'
  | 'escape'
  | { readonly rating: Exclude<RatingKey, '0'> | null };

export type BoardKeyContext = 'board' | 'lane' | 'card';

type BoardKeyEvent = Pick<
  KeyboardEvent,
  | 'key'
  | 'keyCode'
  | 'isComposing'
  | 'defaultPrevented'
  | 'repeat'
  | 'ctrlKey'
  | 'altKey'
  | 'metaKey'
  | 'shiftKey'
>;

export class BoardKeys {
  handle(event: BoardKeyEvent, context?: BoardKeyContext): BoardCommand | undefined {
    const { key, repeat } = event;
    if (
      !context ||
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey
    )
      return undefined;

    switch (key) {
      case 'ArrowLeft':
        return 'left';
      case 'ArrowRight':
        return 'right';
      case 'ArrowDown':
        return 'down';
      case 'ArrowUp':
        return 'up';
    }

    if (repeat) return undefined;
    if (key === 'Escape') return 'escape';
    if (context !== 'card') return undefined;
    switch (key) {
      case 'Enter':
        return 'locate';
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        return { rating: key === '0' ? null : key };
      default:
        return undefined;
    }
  }
}

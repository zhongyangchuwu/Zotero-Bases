type RatingKey = '0' | '1' | '2' | '3' | '4' | '5';

export type BoardCommand =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'moveLeft'
  | 'moveRight'
  | 'locate'
  | 'openPdf'
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
    const { key, shiftKey, repeat } = event;
    if (
      !context ||
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    )
      return undefined;

    if (shiftKey) {
      if (context !== 'card' || repeat) return undefined;
      switch (key) {
        case 'H':
        case 'h':
        case 'ArrowLeft':
          return 'moveLeft';
        case 'L':
        case 'l':
        case 'ArrowRight':
          return 'moveRight';
        default:
          return undefined;
      }
    }

    switch (key) {
      case 'h':
      case 'ArrowLeft':
        return 'left';
      case 'l':
      case 'ArrowRight':
        return 'right';
      case 'j':
      case 'ArrowDown':
        return 'down';
      case 'k':
      case 'ArrowUp':
        return 'up';
    }

    if (context !== 'card' || repeat) return undefined;
    switch (key) {
      case 'Enter':
        return 'locate';
      case 'o':
        return 'openPdf';
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

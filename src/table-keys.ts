export type TableCommand =
  | 'left'
  | 'right'
  | 'down'
  | 'up'
  | 'activate'
  | 'escape'
  | { readonly rating: Exclude<RatingKey, '0'> | null };

type RatingKey = '0' | '1' | '2' | '3' | '4' | '5';

export class TableKeys {
  handle(
    event: Pick<
      KeyboardEvent,
      'key' | 'keyCode' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'repeat'
    >,
  ): TableCommand | undefined {
    const { key, keyCode, ctrlKey, metaKey, altKey, shiftKey, isComposing, repeat } = event;
    if (keyCode === 229 || isComposing || ctrlKey || metaKey || altKey || shiftKey)
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
      case 'Enter':
        return repeat ? undefined : 'activate';
      case 'Escape':
        return repeat ? undefined : 'escape';
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        return repeat ? undefined : { rating: key === '0' ? null : key };
      default:
        return undefined;
    }
  }
}

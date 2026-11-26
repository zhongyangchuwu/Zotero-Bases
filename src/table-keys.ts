export type TableCommand =
  | 'left'
  | 'right'
  | 'down'
  | 'up'
  | 'extendDown'
  | 'extendUp'
  | 'first'
  | 'last'
  | 'pageDown'
  | 'pageUp'
  | 'activate'
  | 'edit'
  | 'toggle'
  | 'open'
  | 'escape'
  | 'prefix'
  | { readonly rating: Exclude<RatingKey, '0'> | null };

type RatingKey = '0' | '1' | '2' | '3' | '4' | '5';

export class TableKeys {
  private prefixTime: number | undefined;

  reset(): void {
    this.prefixTime = undefined;
  }

  handle(
    event: Pick<
      KeyboardEvent,
      'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'repeat' | 'timeStamp'
    >,
  ): TableCommand | undefined {
    const { key, ctrlKey, metaKey, altKey, shiftKey, isComposing, repeat, timeStamp } = event;
    if (isComposing || metaKey || altKey) {
      this.reset();
      return undefined;
    }

    if (ctrlKey) {
      this.reset();
      if (shiftKey) return undefined;
      if (key === 'd') return 'pageDown';
      if (key === 'u') return 'pageUp';
      return undefined;
    }

    if (!shiftKey && key === 'g') {
      // A held key is not a second press in the gg sequence.
      if (repeat) return undefined;
      const elapsed = this.prefixTime === undefined ? undefined : timeStamp - this.prefixTime;
      if (elapsed !== undefined && elapsed >= 0 && elapsed <= 900) {
        this.reset();
        return 'first';
      }
      this.prefixTime = timeStamp;
      return 'prefix';
    }

    this.reset();
    if (shiftKey) {
      if (key === 'G') return 'last';
      if (key === 'J' || key === 'j' || key === 'ArrowDown') return 'extendDown';
      if (key === 'K' || key === 'k' || key === 'ArrowUp') return 'extendUp';
      return undefined;
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
      case 'G':
        return 'last';
      case 'PageDown':
        return 'pageDown';
      case 'PageUp':
        return 'pageUp';
      case 'Enter':
        return repeat ? undefined : 'activate';
      case 'i':
        return repeat ? undefined : 'edit';
      case 'x':
        return repeat ? undefined : 'toggle';
      case 'o':
        return repeat ? undefined : 'open';
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

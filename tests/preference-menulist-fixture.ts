const XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

export function installXULMenulist(doc: Document): () => void {
  Object.defineProperty(doc, 'createXULElement', {
    configurable: true,
    value(tag: string): Element {
      const menu = doc.createElementNS(XUL, tag);
      if (tag !== 'menulist') return menu;

      // Gecko selects the menuitem in the capture phase, before its command handler runs.
      const items = () => Array.from(menu.querySelectorAll('menupopup > menuitem'));
      function select(item: Element | undefined): void {
        menu.querySelector('menuitem[selected]')?.removeAttribute('selected');
        item?.setAttribute('selected', 'true');
        menu.setAttribute('value', item?.getAttribute('value') ?? '');
      }
      menu.addEventListener(
        'command',
        (event) => {
          const item = items().find((candidate) => candidate === event.target);
          if (item) select(item);
        },
        true,
      );
      Object.defineProperties(menu, {
        value: {
          get: () => menu.getAttribute('value') ?? '',
          set(value: string) {
            select(items().find((item) => item.getAttribute('value') === value));
            menu.setAttribute('value', value);
          },
        },
        selectedIndex: {
          get: () => items().findIndex((item) => item.hasAttribute('selected')),
          set(index: number) {
            select(items()[index]);
          },
        },
        disabled: {
          set(disabled: boolean) {
            menu.toggleAttribute('disabled', disabled);
          },
        },
      });
      return menu;
    },
  });
  return () => {
    Reflect.deleteProperty(doc, 'createXULElement');
  };
}

export function commandMenuItem(menu: Element, value: string): void {
  const item = Array.from(menu.querySelectorAll('menupopup > menuitem')).find(
    (entry) => entry.getAttribute('value') === value,
  );
  if (!item) throw new Error(`Missing menuitem ${value}`);
  item.dispatchEvent(new Event('command', { bubbles: true }));
}

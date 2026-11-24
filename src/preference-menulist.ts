type ChromeDocument = Document & { createXULElement(name: string): Element };

type Menulist = Element & {
  value: string;
  selectedIndex: number;
  disabled: boolean;
};

let nextId = 0;

// The Zotero preferences chrome document provides native dropdown popups.
export function createPreferenceMenulist(doc: Document, name: string) {
  const xul = (tag: string) => (doc as ChromeDocument).createXULElement(tag);
  const control = xul('menulist') as Menulist;
  control.id = `zb-pref-${name}-${++nextId}`;
  control.setAttribute('name', name);
  control.setAttribute('native', 'true');
  const label = xul('label');
  label.setAttribute('control', control.id);
  const popup = xul('menupopup');
  control.append(popup);

  return {
    control,
    label,
    popup,
    appendItem(value: string, caption: string): Element {
      const item = xul('menuitem');
      item.setAttribute('value', value);
      item.setAttribute('label', caption);
      popup.append(item);
      return item;
    },
  };
}

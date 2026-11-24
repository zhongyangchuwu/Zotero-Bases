import type { Row } from './contracts';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const SKIN = 'chrome://zotero/skin/';

type Icon = Readonly<{ light: string; dark?: string }>;

function image(path: string): string {
  return `url("${SKIN}${path}")`;
}

function themed(size: 12 | 16, file: string): Icon {
  return {
    light: image(`item-type/${size}/light/${file}.svg`),
    dark: image(`item-type/${size}/dark/${file}.svg`),
  };
}

function universal(file: string): Icon {
  return { light: image(`16/universal/${file}.svg`) };
}

// Match Zotero's attachment column, including its 12px-only generic file icon.
const ATTACHMENT_ICONS: Record<NonNullable<Row['attachment']>, Icon> = {
  pdf: themed(12, 'attachment-pdf'),
  epub: themed(12, 'attachment-epub'),
  snapshot: themed(12, 'attachment-snapshot'),
  file: themed(12, 'attachment-file'),
};

const FIELD_ICONS: Readonly<Partial<Record<string, Icon>>> = {
  pdf: ATTACHMENT_ICONS.pdf,
  notes: universal('note'),
  attachments: universal('attachment'),
  tags: universal('tag'),
  link: universal('link'),
};

const DOCUMENT_ICON = themed(16, 'document');
// Zotero 10.0.8 ships both theme variants for these names. Only build URLs for known assets.
const ITEM_TYPE_ICONS: Partial<Record<string, Icon>> = Object.assign(Object.create(null), {
  attachment: ATTACHMENT_ICONS.file,
});
for (const file of [
  'artwork',
  'audio-recording',
  'bill',
  'blog-post',
  'book',
  'book-section',
  'case',
  'computer-program',
  'conference-paper',
  'dataset',
  'dictionary-entry',
  'email',
  'encyclopedia-article',
  'film',
  'forum-post',
  'hearing',
  'instant-message',
  'interview',
  'journal-article',
  'letter',
  'magazine-article',
  'manuscript',
  'map',
  'newspaper-article',
  'note',
  'patent',
  'podcast',
  'preprint',
  'presentation',
  'radio-broadcast',
  'report',
  'standard',
  'statute',
  'thesis',
  'tv-broadcast',
  'video-recording',
  'webpage',
]) {
  const itemType = file.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase());
  ITEM_TYPE_ICONS[itemType] = themed(16, file);
}

function createIcon(document: Document, { light, dark }: Icon): HTMLSpanElement {
  const icon = document.createElementNS(XHTML_NS, 'span') as HTMLSpanElement;
  icon.className = 'zb-native-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.style.setProperty('--zb-icon-light', light);
  if (dark) icon.style.setProperty('--zb-icon-dark', dark);
  return icon;
}

export function createNativeFieldIcon(
  document: Document,
  key: string,
): HTMLSpanElement | undefined {
  const asset = FIELD_ICONS[key];
  if (!asset) return;
  const icon = createIcon(document, asset);
  icon.classList.add('zb-field-icon');
  return icon;
}

export function createAttachmentIcon(
  document: Document,
  attachment: NonNullable<Row['attachment']>,
): HTMLSpanElement {
  return createIcon(document, ATTACHMENT_ICONS[attachment]);
}

export function createItemTypeIcon(document: Document, itemType: string): HTMLSpanElement {
  return createIcon(document, ITEM_TYPE_ICONS[itemType] ?? DOCUMENT_ICON);
}

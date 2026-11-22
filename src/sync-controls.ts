import { messages, type Language } from './i18n';
import type { SyncPort, SyncStatus } from './sync';

const HTML = 'http://www.w3.org/1999/xhtml';
const captions = {
  enable: ['Enable library sync', '开启文库同步'],
  disable: ['Disable library sync', '关闭文库同步'],
  off: ['Library sync · off', '文库同步 · 已关闭'],
  ready: ['Library sync · ready', '文库同步 · 已就绪'],
  pending: ['Library sync · changes pending', '文库同步 · 有待同步的更改'],
  attention: ['Library sync · choose a version', '文库同步 · 请选择版本'],
  waiting: ['Library sync · waiting for attachment', '文库同步 · 正在等待附件'],
  error: ['Library sync · could not sync', '文库同步 · 暂未同步'],
  now: ['Sync now', '立即同步'],
  cloud: ['Apply cloud properties and views', '应用云端定义与视图'],
  local: ['Overwrite cloud with this device', '以本机为准覆盖云端'],
  conflict: [
    'The library attachment differs from this device. Choose the version to keep.',
    '文库附件与本机配置不同，请选择保留哪个版本。',
  ],
  download: [
    'Waiting for Zotero to make the sync attachment available. Check file syncing in Zotero.',
    '正在等待 Zotero 提供同步附件。请检查 Zotero 的附件同步。',
  ],
  retry: [
    'Could not access the settings attachment. Check the item and try again.',
    '无法读取或更新同步附件。请检查同步条目后重试。',
  ],
  failed: ['Could not finish this action. Try again.', '未能完成此操作，请重试。'],
  restore: ['Restore the previous local settings', '恢复应用云端前的本机设置'],
  location: ['Change location and name', '更改位置与名称'],
  title: ['Sync item name', '同步条目名称'],
  collection: ['Collection', '分类'],
  root: ['My Library', '我的文库'],
  save: ['Save location and name', '保存位置与名称'],
} as const;

type Caption = keyof typeof captions;

export function mountSyncControls(parent: HTMLElement, sync: SyncPort, language: Language) {
  const doc = parent.ownerDocument;
  const labels: [Text, Caption][] = [];
  let t = messages(captions, language);
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, value?: string) => {
    const element = doc.createElementNS(HTML, tag) as HTMLElementTagNameMap[K];
    if (value) element.textContent = value;
    return element;
  };

  function label(element: HTMLElement, key: Caption): void {
    const text = doc.createTextNode(t(key));
    element.append(text);
    labels.push([text, key]);
  }

  const slot = node('div');
  slot.className = 'zb-sync-controls';
  const status = node('p');
  status.setAttribute('role', 'status');
  const notice = node('p');
  notice.setAttribute('role', 'status');
  const actions = node('div');
  actions.className = 'zb-preference-actions';
  const location = node('details');
  const locationSummary = node('summary');
  label(locationSummary, 'location');
  const form = node('form');
  form.className = 'zb-sync-location';
  const title = node('input');
  title.required = true;
  const collection = node('select');
  const save = node('button');
  label(save, 'save');
  save.type = 'submit';
  const titleLabel = node('label');
  const collectionLabel = node('label');
  label(titleLabel, 'title');
  label(collectionLabel, 'collection');
  titleLabel.append(title);
  collectionLabel.append(collection);
  form.append(titleLabel, collectionLabel, save);
  location.append(locationSummary, form);
  let disposed = false;
  let failed = false;
  const library = node('option');
  library.value = '';
  label(library, 'root');

  async function run(action: () => Promise<void>): Promise<void> {
    failed = false;
    render();
    try {
      await action();
    } catch {
      failed = true;
      render();
    }
  }

  const button = (key: Caption, action: () => Promise<void>) => {
    const control = node('button');
    label(control, key);
    control.type = 'button';
    control.addEventListener('click', () => void run(action));
    return control;
  };

  const enable = button('enable', () => sync.enable());
  const disable = button('disable', () => sync.disable());
  const now = button('now', () => sync.syncNow());
  const cloud = button('cloud', () => sync.resolve('cloud'));
  const local = button('local', () => sync.resolve('local'));
  const restore = button('restore', () => sync.restore());
  actions.append(enable, disable, now, cloud, local, restore);
  slot.append(status, notice, actions, location);
  parent.append(slot);

  function fillLocation(state: SyncStatus): void {
    const option = (key: string, name: string) => {
      const element = node('option', name);
      element.value = key;
      return element;
    };
    collection.replaceChildren(library);
    for (const { key, name } of sync.locations()) {
      if (key) collection.append(option(key, name));
    }
    title.value = state.location.title;
    collection.value = state.location.collection ?? '';
    if (collection.selectedIndex < 0) collection.selectedIndex = 0;
  }

  location.addEventListener('toggle', () => {
    if (location.open) fillLocation(sync.status());
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = title.value.trim();
    if (next)
      void run(async () => {
        await sync.rename({ title: next, collection: collection.value || undefined });
        if (!disposed && sync.status().kind !== 'error') location.open = false;
      });
  });

  function render(): void {
    if (disposed) return;
    const state = sync.status();
    const off = state.kind === 'off';
    const attention = state.kind === 'attention';
    const message = failed
      ? 'failed'
      : attention
        ? 'conflict'
        : state.kind === 'waiting'
          ? 'download'
          : state.kind === 'error'
            ? 'retry'
            : undefined;
    status.textContent = t(state.kind);
    enable.hidden = !off;
    disable.hidden = off;
    notice.hidden = !message;
    notice.textContent = message ? t(message) : '';
    for (const control of [enable, disable, now, cloud, local, restore, title, collection, save])
      control.disabled = state.busy;
    now.hidden = off;
    cloud.hidden = local.hidden = !attention;
    restore.hidden = off || !state.canRestore;
    location.hidden = off;
    if (off) location.open = false;
  }

  const unsubscribe = sync.subscribe(render);
  render();
  return {
    setLanguage(value: Language): void {
      if (language === value) return;
      language = value;
      t = messages(captions, language);
      for (const [text, key] of labels) text.data = t(key);
      render();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      slot.remove();
    },
  };
}

export function mountSyncBadge(
  parent: HTMLElement,
  sync: SyncPort,
  language: Language,
  openPreferences: () => void,
): () => void {
  const doc = parent.ownerDocument;
  const button = doc.createElementNS(HTML, 'button') as HTMLButtonElement;
  button.type = 'button';
  button.className = 'zb-sync-badge';
  const dot = doc.createElementNS(HTML, 'span');
  dot.setAttribute('aria-hidden', 'true');
  dot.textContent = '●';
  const t = messages(captions, language);
  button.append(dot);
  button.addEventListener('click', openPreferences);
  parent.append(button);

  function render(): void {
    const { kind } = sync.status();
    button.hidden = kind === 'off';
    button.dataset.status = kind;
    button.title = t(kind);
    button.setAttribute('aria-label', button.title);
  }

  const unsubscribe = sync.subscribe(render);
  render();
  return () => {
    unsubscribe();
    button.removeEventListener('click', openPreferences);
    button.remove();
  };
}

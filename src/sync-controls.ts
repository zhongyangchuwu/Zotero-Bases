import type { SyncPort, SyncStatus } from './sync';

const HTML = 'http://www.w3.org/1999/xhtml';
const captions = {
  enable: ['Enable library sync', '开启文库同步'],
  ready: ['Library sync', '文库同步'],
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

export function mountSyncControls(parent: HTMLElement, sync: SyncPort, language: 'zh-CN' | 'en') {
  const doc = parent.ownerDocument;
  const t = (key: keyof typeof captions) => captions[key][language === 'zh-CN' ? 1 : 0];
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, value?: string) => {
    const element = doc.createElementNS(HTML, tag) as HTMLElementTagNameMap[K];
    if (value) element.textContent = value;
    return element;
  };
  const slot = node('div');
  slot.className = 'zb-sync';
  const menu = node('details');
  const summary = node('summary');
  const pane = node('div');
  pane.className = 'zb-pane zb-sync-pane';
  const notice = node('p');
  notice.setAttribute('role', 'status');
  const actions = node('div');
  actions.className = 'zb-line';
  const location = node('details');
  const locationSummary = node('summary', t('location'));
  const form = node('form');
  form.className = 'zb-sync-location';
  const title = node('input');
  title.required = true;
  title.setAttribute('aria-label', t('title'));
  const collection = node('select');
  collection.setAttribute('aria-label', t('collection'));
  const save = node('button', t('save'));
  save.type = 'submit';
  const titleLabel = node('label', t('title'));
  const collectionLabel = node('label', t('collection'));
  titleLabel.append(title);
  collectionLabel.append(collection);
  form.append(titleLabel, collectionLabel, save);
  location.append(locationSummary, form);
  let disposed = false;
  let failed = false;
  let wasAttention = false;

  function run(action: () => Promise<void>): void {
    failed = false;
    void Promise.resolve()
      .then(action)
      .catch(() => {
        if (disposed) return;
        failed = true;
        render();
      });
  }

  const button = (label: keyof typeof captions, action: () => Promise<void>) => {
    const control = node('button', t(label));
    control.type = 'button';
    control.addEventListener('click', () => run(action));
    return control;
  };

  const enable = button('enable', () => sync.enable());
  const now = button('now', () => sync.syncNow());
  const cloud = button('cloud', () => sync.resolve('cloud'));
  const local = button('local', () => sync.resolve('local'));
  const restore = button('restore', () => sync.restore());
  actions.append(now, cloud, local, restore);
  pane.append(notice, actions, location);
  menu.append(summary, pane);
  slot.append(enable, menu);
  parent.append(slot);

  function fillLocation(state: SyncStatus): void {
    const option = (key: string, name: string) => {
      const element = node('option', name);
      element.value = key;
      return element;
    };
    collection.replaceChildren(option('', t('root')));
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
      run(async () => {
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
    enable.hidden = !off;
    enable.disabled = state.busy;
    menu.hidden = off && !failed;
    notice.hidden = !message;
    notice.textContent = message ? t(message) : '';
    summary.textContent = t(off ? 'ready' : state.kind);
    for (const control of [now, cloud, local, restore, title, collection, save])
      control.disabled = state.busy;
    now.hidden = off;
    cloud.hidden = local.hidden = !attention;
    restore.hidden = !state.canRestore;
    location.hidden = off;
    if (attention && !wasAttention) menu.open = true;
    if (off && failed) menu.open = true;
    wasAttention = attention;
  }

  const unsubscribe = sync.subscribe(render);
  render();
  return () => {
    disposed = true;
    unsubscribe();
    slot.remove();
  };
}

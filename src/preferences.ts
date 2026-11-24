import type { ConfigurationBackup, ConfigurationImportSummary } from './backup';
import {
  resolveLanguage,
  type GlobalPreferences,
  type GlobalPreferenceStore,
} from './global-preferences';
import { messages } from './i18n';
import { createPreferenceMenulist } from './preference-menulist';
import type { SyncPort } from './sync';
import { mountSyncControls } from './sync-controls';

const HTML = 'http://www.w3.org/1999/xhtml';
const BACKUP_NAME = 'zotero-bases-configuration.json';
const captions = {
  appearancePanel: ['Appearance and custom styles', '外观与自定义样式'],
  defaultsPanel: ['Workspace defaults', '工作区默认值'],
  syncPanel: ['Sync and configuration backup', '同步与配置备份'],
  languagePanel: ['Language and keyboard flow', '语言与键盘流'],
  appearance: ['Appearance preset', '外观预设'],
  classic: ['Classic', '经典'],
  terminal: ['Terminal', '终端'],
  modern: ['Modern', '现代'],
  customCSS: ['Custom CSS', '自定义 CSS'],
  shortcuts: ['Show shortcut hints', '显示底部快捷键提示'],
  openMode: ['Default open mode', '默认打开方式'],
  tab: ['Zotero tab', 'Zotero 标签页'],
  window: ['Separate window', '独立窗口'],
  density: ['Default density for new views', '新建视图默认密度'],
  compact: ['Compact', '紧凑'],
  comfortable: ['Comfortable', '舒适'],
  wrap: ['Wrap', '折行'],
  authorFormat: ['Author display', '作者列展示格式'],
  etAl: ['First author et al.', '第一作者 et al.'],
  singleLine: ['Single line', '单行'],
  export: ['Export JSON', '导出 JSON'],
  import: ['Import JSON', '导入 JSON'],
  invalidBackup: [
    'Could not import this backup. No configuration changed.',
    '无法导入此备份，配置未更改。',
  ],
  importError: ['Could not read or apply the backup.', '无法读取或应用此备份。'],
  exportError: ['Could not export the configuration.', '无法导出配置。'],
  language: ['Interface language', '界面语言'],
  auto: ['Follow Zotero', '跟随 Zotero'],
  chinese: ['简体中文', '简体中文'],
  english: ['English', 'English'],
  keyboard: ['Enable table keyboard flow (hjkl / x / o)', '启用表格键盘流（hjkl / x / o）'],
} as const;

type Caption = keyof typeof captions;
type BackupMessage = ConfigurationImportSummary | 'invalidBackup' | 'importError' | 'exportError';

const css = `
.zb-preferences { display: grid; gap: 1rem; min-width: 0; }
.zb-preferences [hidden] { display: none !important; }
.zb-preferences section { border-block-end: 1px solid var(--color-panedivider, GrayText); padding-block-end: 1rem; }
.zb-preferences section:last-child { border: 0; }
.zb-preferences h2 { margin-block: 0 0.55rem; }
.zb-preferences .zb-preference-field,
.zb-preferences .zb-sync-location > label { display: grid; gap: 0.25rem; margin-block: 0.55rem; }
.zb-preferences .zb-preference-field > menulist { justify-self: start; max-width: 100%; }
@media (-moz-platform: windows) {
  /* Zotero reserves a radio-marker gutter even for options without icons. */
  .zb-preferences .zb-preference-field > menulist > menupopup > menuitem {
    padding-inline-start: 12px !important;
  }
  .zb-preferences .zb-preference-field > menulist > menupopup > menuitem > .menu-icon {
    display: none;
  }
}
.zb-preferences .zb-preference-toggle { display: flex; align-items: center; gap: 0.35rem; margin-block: 0.55rem; }
.zb-preferences textarea { box-sizing: border-box; width: 100%; min-height: 6em; resize: vertical; font-family: monospace; }
.zb-preferences .zb-preference-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; }
.zb-preferences .zb-preference-actions > label { margin-block: 0; }
.zb-preferences .zb-sync-controls { margin-block-end: 0.7rem; }
.zb-preferences .zb-sync-controls > p { margin-block: 0.45rem; }
.zb-preferences .zb-backup-result:empty { margin: 0; }
.zb-preferences .zb-sync-controls details { margin-block: 0.65rem; }
.zb-preferences summary { cursor: pointer; }
`;

interface NativeSavePicker {
  readonly modeSave: number;
  readonly returnCancel: number;
  readonly file: string;
  defaultString: string;
  defaultExtension: string;
  init(window: Window, title: string, mode: number): void;
  appendFilter(title: string, filter: string): void;
  show(): Promise<number>;
}

type PaneWindow = Window &
  typeof globalThis & {
    ChromeUtils?: { importESModule(uri: string): { FilePicker: new () => NativeSavePicker } };
    IOUtils?: { writeUTF8(path: string, contents: string): Promise<void> };
  };

async function saveJSON(doc: Document, title: string, json: string): Promise<void> {
  const owner = doc.defaultView as PaneWindow | null;
  if (!owner) throw new Error('Preferences window is not available');
  // A chrome preferences window is not a browser tab with a download UI.
  if (owner.ChromeUtils && owner.IOUtils) {
    const { FilePicker } = owner.ChromeUtils.importESModule(
      'chrome://zotero/content/modules/filePicker.mjs',
    );
    const picker = new FilePicker();
    picker.init(owner, title, picker.modeSave);
    picker.defaultString = BACKUP_NAME;
    picker.defaultExtension = 'json';
    picker.appendFilter('JSON', '*.json');
    if ((await picker.show()) !== picker.returnCancel) {
      await owner.IOUtils.writeUTF8(picker.file, json);
    }
    return;
  }
  const link = doc.createElementNS(HTML, 'a') as HTMLAnchorElement;
  link.hidden = true;
  const url = owner.URL.createObjectURL(new owner.Blob([json], { type: 'application/json' }));
  try {
    link.href = url;
    link.download = BACKUP_NAME;
    (doc.body ?? doc.documentElement).append(link);
    link.click();
  } finally {
    link.remove();
    owner.setTimeout(() => owner.URL.revokeObjectURL(url), 0);
  }
}

export function mountPreferences(
  root: HTMLElement,
  options: {
    store: GlobalPreferenceStore;
    hostLocale: () => string;
    sync: SyncPort;
    backup: ConfigurationBackup;
  },
): () => void {
  const { store, hostLocale, sync, backup } = options;
  const doc = root.ownerDocument;
  const labels: [Text, Caption][] = [];
  const itemLabels: [Element, Caption][] = [];
  const updateControls: ((value: GlobalPreferences) => void)[] = [];
  const initial = store.read();
  let language = resolveLanguage(initial.language, hostLocale());
  let message: BackupMessage | undefined;
  let disposed = false;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K) =>
    doc.createElementNS(HTML, tag) as HTMLElementTagNameMap[K];
  let t = messages(captions, language);

  function label(element: Element, key: Caption): void {
    const text = doc.createTextNode(t(key));
    element.append(text);
    labels.push([text, key]);
  }

  const container = node('div');
  container.className = 'zb-preferences';
  container.lang = language;
  const style = node('style');
  style.textContent = css;
  container.append(style);

  function panel(id: string, heading: Caption): HTMLElement {
    const section = node('section');
    section.dataset.panel = id;
    const title = node('h2');
    label(title, heading);
    section.append(title);
    container.append(section);
    return section;
  }

  function field(parent: HTMLElement, key: Caption, control: HTMLElement): void {
    const row = node('label');
    row.className = 'zb-preference-field';
    label(row, key);
    row.append(control);
    parent.append(row);
  }

  function dropdown<K extends keyof GlobalPreferences>(
    parent: HTMLElement,
    key: K,
    caption: Caption,
    choices: readonly (readonly [GlobalPreferences[K] & string, Caption])[],
  ): void {
    const menu = createPreferenceMenulist(doc, key);
    for (const [value, name] of choices) {
      const item = menu.appendItem(value, t(name));
      itemLabels.push([item, name]);
      item.addEventListener('command', () => store.set(key, value));
    }
    updateControls.push((value) => {
      const selected = String(value[key]);
      if (menu.control.value !== selected) menu.control.value = selected;
    });
    const row = node('div');
    row.className = 'zb-preference-field';
    label(menu.label, caption);
    row.append(menu.label, menu.control);
    parent.append(row);
  }

  function toggle(
    parent: HTMLElement,
    key: 'showShortcuts' | 'keyboardFlow',
    caption: Caption,
  ): void {
    const control = node('input');
    control.type = 'checkbox';
    control.name = key;
    control.addEventListener('change', () => store.set(key, control.checked));
    updateControls.push((value) => {
      control.checked = value[key];
    });
    const row = node('label');
    row.className = 'zb-preference-toggle';
    row.append(control);
    label(row, caption);
    parent.append(row);
  }

  const appearance = panel('appearance', 'appearancePanel');
  dropdown(appearance, 'appearance', 'appearance', [
    ['classic', 'classic'],
    ['terminal', 'terminal'],
    ['modern', 'modern'],
  ]);
  const customCSS = node('textarea');
  customCSS.name = 'customCSS';
  customCSS.spellcheck = false;
  customCSS.addEventListener('input', () => store.set('customCSS', customCSS.value));
  updateControls.push((value) => {
    // Updating the same value can move the caret, including for CRLF input.
    const css = value.customCSS.replace(/\r\n?/g, '\n');
    if (customCSS.value !== css) customCSS.value = css;
  });
  field(appearance, 'customCSS', customCSS);
  toggle(appearance, 'showShortcuts', 'shortcuts');

  const defaults = panel('defaults', 'defaultsPanel');
  dropdown(defaults, 'openMode', 'openMode', [
    ['tab', 'tab'],
    ['window', 'window'],
  ]);
  dropdown(defaults, 'defaultDensity', 'density', [
    ['compact', 'compact'],
    ['comfortable', 'comfortable'],
    ['wrap', 'wrap'],
  ]);
  dropdown(defaults, 'authorFormat', 'authorFormat', [
    ['etAl', 'etAl'],
    ['singleLine', 'singleLine'],
  ]);

  const syncPanel = panel('sync', 'syncPanel');
  const syncControls = mountSyncControls(syncPanel, sync, language);
  const backupActions = node('div');
  backupActions.className = 'zb-preference-actions';
  const exportButton = node('button');
  exportButton.type = 'button';
  exportButton.dataset.action = 'export-json';
  label(exportButton, 'export');
  backupActions.append(exportButton);
  const input = node('input');
  input.type = 'file';
  input.name = 'importJSON';
  input.accept = '.json,application/json';
  field(backupActions, 'import', input);
  const result = node('p');
  result.className = 'zb-backup-result';
  result.setAttribute('role', 'status');
  syncPanel.append(backupActions, result);

  const languagePanel = panel('language', 'languagePanel');
  dropdown(languagePanel, 'language', 'language', [
    ['auto', 'auto'],
    ['zh-CN', 'chinese'],
    ['en-US', 'english'],
  ]);
  toggle(languagePanel, 'keyboardFlow', 'keyboard');

  function renderMessage(): void {
    if (typeof message === 'object') {
      const { properties, views } = message;
      result.textContent =
        language === 'zh-CN'
          ? `已导入 ${properties} 个属性定义和 ${views} 个视图。`
          : `Imported ${properties} ${properties === 1 ? 'property' : 'properties'} and ${views} ${views === 1 ? 'view' : 'views'}.`;
    } else {
      result.textContent = message ? t(message) : '';
    }
  }

  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    message = undefined;
    renderMessage();
    try {
      await saveJSON(doc, t('export'), backup.exportJSON());
    } catch {
      if (!disposed) {
        message = 'exportError';
        renderMessage();
      }
    } finally {
      exportButton.disabled = false;
    }
  });

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    input.disabled = true;
    try {
      const text = await readFile(doc, file);
      if (disposed) return;
      message = backup.importJSON(text) ?? 'invalidBackup';
    } catch {
      message = 'importError';
    } finally {
      if (!disposed) {
        input.disabled = false;
        renderMessage();
      }
    }
  });

  function render(value: GlobalPreferences): void {
    for (const update of updateControls) update(value);
    const next = resolveLanguage(value.language, hostLocale());
    if (next === language) return;
    language = next;
    t = messages(captions, language);
    container.lang = language;
    for (const [text, key] of labels) text.data = t(key);
    for (const [item, key] of itemLabels) item.setAttribute('label', t(key));
    syncControls.setLanguage(language);
    renderMessage();
  }

  root.append(container);
  const unsubscribe = store.subscribe(render);
  render(initial);
  renderMessage();
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    syncControls.dispose();
    container.remove();
  };
}

function readFile(doc: Document, file: File): Promise<string> {
  const owner = doc.defaultView;
  if (!owner) return Promise.reject(new Error('Preferences window is not available'));
  return new Promise((resolve, reject) => {
    const reader = new owner.FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

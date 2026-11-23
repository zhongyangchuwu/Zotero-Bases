import { createConfigurationBackup } from './backup';
import { createConfig, decodeSyncSnapshot, SCHEMA_PREF, VIEWS_PREF } from './config';
import type { WorkspaceHost } from './contracts';
import {
  createPropertyValidation,
  createWorkspaceHost,
  type LibraryOwner,
  type Prefs,
  type ZoteroData,
} from './data';
import {
  createGlobalPreferenceStore,
  resolveLanguage,
  type GlobalPreferenceStore,
} from './global-preferences';
import { publishLaunchAPI, type BasesAPIHost, type LaunchRegistration } from './launch';
import { mountPreferences } from './preferences';
import { createSyncController, type SyncPort } from './sync';
import {
  createNativeSyncTransport,
  type NativeSyncIO,
  type NativeSyncPaths,
  type NativeSyncZotero,
} from './sync-native';
import { mountWorkspace } from './workspace';

const NAME = 'Zotero Bases';
const TAB_TYPE = 'zoterobases';
const POPUP_URI = 'chrome://zotero-bases/content/window.xhtml';
const HTML = 'http://www.w3.org/1999/xhtml';
const PANE_ID = 'zotero-bases-prefs';
const PANE_MOUNT = Symbol.for('zotero-bases.mount-preference-pane');
const NATIVE_COLORS = [
  ['background', '--color-background'],
  ['surface', '--material-sidepane'],
  ['text', '--fill-primary'],
  ['muted', '--fill-secondary'],
  ['border', '--color-panedivider'],
  ['accent', '--color-accent'],
  ['selection', '--color-accent10'],
] as const;

type RootData = { readonly id: string; readonly rootURI: string };
interface TabState {
  readonly type: string;
}
interface Tabs {
  add(options: { type: string; title: string; data: object; onClose: () => void }): {
    id: string;
    container: Element;
  };
  select(id: string): void;
  close(id: string): void;
  getState(): readonly TabState[];
}
type Main = Window & LibraryOwner & { Zotero_Tabs: Tabs };
interface MenuContext {
  readonly menuElem: Element;
}
interface WindowObserver {
  observe(subject: object, topic: string): void;
}
interface Popup {
  window: Window;
  ready: Promise<void>;
  detach: () => void;
}
interface NativeTab {
  id: string;
  root: HTMLElement;
  dispose: () => void;
}
interface Session {
  owner: Main;
  tabs: Tabs;
  host: WorkspaceHost;
  tab?: NativeTab;
  popup?: Popup;
  detach: () => void;
}

declare const Zotero: ZoteroData &
  NativeSyncZotero &
  BasesAPIHost & {
    readonly Prefs: Prefs;
    readonly initializationPromise: Promise<unknown>;
    readonly locale: string;
    getMainWindow(): Window | null;
    launchURL(url: string): void;
    readonly PreferencePanes: {
      register(options: {
        pluginID: string;
        id: string;
        src: string;
        label: string;
      }): Promise<string>;
      unregister(id: string): void;
    };
    readonly Utilities: ZoteroData['Utilities'] & {
      Internal: ZoteroData['Utilities']['Internal'] & { openPreferences(id: string): void };
    };
    [PANE_MOUNT]?: (root: HTMLElement) => void;
    readonly MenuManager: {
      registerMenu(options: {
        menuID: string;
        pluginID: string;
        target: 'main/menubar/tools';
        menus: readonly {
          menuType: 'menuitem';
          onShowing(event: Event, context: MenuContext): void;
          onCommand(event: Event, context: MenuContext): void;
        }[];
      }): string | false;
      unregisterMenu(id: string): boolean;
    };
    logError(error: unknown): void;
  };
declare const IOUtils: NativeSyncIO;
declare const PathUtils: NativeSyncPaths;
declare const Services: {
  io: { newURI(uri: string): object };
  ww: {
    openWindow(owner: Window, uri: string, name: string, features: string, args: null): Window;
    registerNotification(observer: WindowObserver): void;
    unregisterNotification(observer: WindowObserver): void;
  };
};
declare const Components: {
  classes: {
    '@mozilla.org/addons/addon-manager-startup;1': {
      getService(type: unknown): {
        registerChrome(uri: object, registrations: string[][]): { destruct(): void };
      };
    };
    '@mozilla.org/widget/clipboardhelper;1': {
      getService(type: unknown): { copyString(text: string): void };
    };
  };
  interfaces: { amIAddonManagerStartup: unknown; nsIClipboardHelper: unknown };
  utils: { cloneInto<T>(value: T, target: object): T };
};

const sessions = new Map<Window, Session>();
let registration: { destruct(): void } | undefined;
let menu: string | undefined;
let librarySync: (SyncPort & { stop(): void }) | undefined;
let launch: LaunchRegistration | undefined;
let paneID: string | undefined;
let paneRegistration = Promise.resolve();
let globalStore: GlobalPreferenceStore | undefined;
const preferenceMounts = new Map<HTMLElement, () => void>();

function globalPreferences() {
  return (globalStore ??= createGlobalPreferenceStore(Zotero.Prefs));
}

function openPreferences(): void {
  void paneRegistration
    .then(() => {
      if (paneID) Zotero.Utilities.Internal.openPreferences(paneID);
    })
    .catch((error) => Zotero.logError(error));
}

function mountPreferencePane(root: HTMLElement): void {
  if (!registration || preferenceMounts.has(root)) return;
  guarded(() => {
    const sync = startLibrarySync();
    const { validate } = createPropertyValidation(Zotero);
    const unmount = mountPreferences(root, {
      store: globalPreferences(),
      hostLocale: () => Zotero.locale,
      sync,
      backup: createConfigurationBackup(Zotero.Prefs, validate),
    });
    const dispose = () => {
      preferenceMounts.delete(root);
      root.removeEventListener('unload', dispose);
      unmount();
    };
    preferenceMounts.set(root, dispose);
    root.addEventListener('unload', dispose);
  });
}

function startLibrarySync(): SyncPort & { stop(): void } {
  if (librarySync) return librarySync;
  const prefs = Zotero.Prefs;
  const { validate } = createPropertyValidation(Zotero);
  const config = createConfig(prefs, () => 'user', validate, { initializeDefault: false });
  librarySync = createSyncController({
    prefs,
    transport: createNativeSyncTransport(Zotero, IOUtils, PathUtils),
    readSnapshot: () => {
      const { properties, views } = config.settings();
      return { schema: properties, views };
    },
    decodeSnapshot: (value) => decodeSyncSnapshot(value, validate),
    applySnapshot: config.applySync,
    subscribeSettings: (listener) => {
      const schema = prefs.registerObserver(SCHEMA_PREF, listener, true);
      const views = prefs.registerObserver(VIEWS_PREF, listener, true);
      return () => {
        prefs.unregisterObserver(schema);
        prefs.unregisterObserver(views);
      };
    },
    setTimer: (fn, delay) => {
      const id = setTimeout(fn, delay);
      return () => clearTimeout(id);
    },
    logError: (error) => Zotero.logError(error),
  });
  return librarySync;
}

function language(): 'zh-CN' | 'en' {
  return resolveLanguage('auto', Zotero.locale);
}

function guarded(action: () => void): void {
  try {
    action();
  } catch (error) {
    Zotero.logError(error);
  }
}

function sessionFor(window: Window): Session | undefined {
  const existing = sessions.get(window);
  if (existing) return existing;
  const owner = window as Main;
  const tabs = owner.Zotero_Tabs;
  if (typeof tabs?.add !== 'function' || typeof tabs.getState !== 'function') return;
  const getState = tabs.getState;
  // Zotero 10 expects a built-in restore hook for every serialized type. The
  // saved view is portable within this profile; the tab itself is transient.
  const withoutBases = function (this: Tabs): readonly TabState[] {
    return getState.call(this).filter(({ type }) => type !== TAB_TYPE);
  };
  tabs.getState = withoutBases;
  const session: Session = {
    owner,
    tabs,
    host: createWorkspaceHost(Zotero, Zotero.Prefs, owner),
    detach: () => {
      if (tabs.getState === withoutBases) tabs.getState = getState;
      owner.removeEventListener('unload', unload);
    },
  };
  const unload = (event: Event) => {
    if (event.target === owner.document) closeSession(owner, false);
  };
  owner.addEventListener('unload', unload);
  sessions.set(owner, session);
  return session;
}

function mountSurface(session: Session, parent: Element, popOut?: () => void) {
  const root = parent.ownerDocument.createElementNS(HTML, 'div') as HTMLElement;
  root.dataset.zoteroBases = '';
  root.tabIndex = -1;
  root.style.cssText =
    'flex:1;min-width:0;min-height:0;overflow:auto;width:100%;contain:paint style;';
  parent.append(root);
  const media = session.owner.matchMedia('(prefers-color-scheme: dark)');
  const update = () => {
    const native = session.owner.getComputedStyle(session.owner.document.documentElement);
    for (const [name, token] of NATIVE_COLORS) {
      const value = native.getPropertyValue(token).trim();
      if (value) root.style.setProperty(`--zb-native-${name}`, value);
    }
  };
  try {
    update();
    const unmount = mountWorkspace(root, session.host, {
      language: language(),
      popOut,
      sync: librarySync,
      global: globalPreferences(),
      openPreferences,
      linkActions: {
        open: (url) => guarded(() => Zotero.launchURL(url)),
        copy: (text) =>
          guarded(() => {
            const { classes: Cc, interfaces: Ci } = Components;
            Cc['@mozilla.org/widget/clipboardhelper;1']
              .getService(Ci.nsIClipboardHelper)
              .copyString(text);
          }),
      },
    });
    media.addEventListener('change', update);
    return {
      root,
      dispose: () => {
        media.removeEventListener('change', update);
        unmount();
        root.remove();
      },
    };
  } catch (error) {
    root.remove();
    throw error;
  }
}

async function openPopup(session: Session): Promise<void> {
  if (session.popup && !session.popup.window.closed) {
    session.popup.window.focus();
    return session.popup.ready;
  }
  const window = Services.ww.openWindow(
    session.owner,
    POPUP_URI,
    '_blank',
    'chrome,dialog=no,centerscreen,resizable,titlebar,close,width=1120,height=750',
    null,
  );
  let dispose: (() => void) | undefined;
  let observing = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const entry: Popup = {
    window,
    ready,
    detach: () => {
      if (session.popup === entry) session.popup = undefined;
      if (observing) {
        observing = false;
        guarded(() => Services.ww.unregisterNotification(observer));
      }
      window.removeEventListener('DOMContentLoaded', mount);
      dispose?.();
      dispose = undefined;
      rejectReady(new Error('The Zotero Bases window closed before it finished opening'));
    },
  };
  function mount(): void {
    const document = window.document;
    if (session.popup !== entry || document.documentURI !== POPUP_URI || !document.body || dispose)
      return;
    document.documentElement.lang = language();
    try {
      const { root, dispose: unmount } = mountSurface(session, document.body);
      dispose = unmount;
      const tab = session.tab;
      if (tab) session.tabs.close(tab.id);
      window.focus();
      root.focus();
      resolveReady();
    } catch (error) {
      rejectReady(error);
      guarded(entry.detach);
      guarded(() => window.close());
    }
  }
  const observer: WindowObserver = {
    observe(subject, topic) {
      if (topic === 'domwindowclosed' && subject === window) guarded(entry.detach);
    },
  };
  session.popup = entry;
  try {
    Services.ww.registerNotification(observer);
    observing = true;
    window.addEventListener('DOMContentLoaded', mount);
    mount();
  } catch (error) {
    rejectReady(error);
    guarded(entry.detach);
    guarded(() => window.close());
  }
  return ready;
}

function openTab(owner: Window): void {
  if (!menu || owner.closed) throw new Error('Cannot open Zotero Bases in this window');
  const session = sessionFor(owner);
  if (!session) throw new Error('Cannot open Zotero Bases in this window');
  startLibrarySync();
  if (session.tab) {
    session.tabs.select(session.tab.id);
    session.tab.root.focus();
    return;
  }
  const { id, container } = session.tabs.add({
    type: TAB_TYPE,
    title: NAME,
    data: Components.utils.cloneInto({}, owner),
    onClose: () => {
      const tab = session.tab;
      session.tab = undefined;
      if (tab) guarded(tab.dispose);
    },
  });
  try {
    const { root, dispose } = mountSurface(
      session,
      container,
      () => void openPopup(session).catch((error) => Zotero.logError(error)),
    );
    session.tab = { id, root, dispose };
    owner.focus();
    session.tabs.select(id);
    root.focus();
  } catch (error) {
    guarded(() => session.tabs.close(id));
    throw error;
  }
}

function focusSession(session: Session): true | Promise<void> | undefined {
  if (session.owner.closed) return;
  if (session.popup && !session.popup.window.closed) {
    session.popup.window.focus();
    return session.popup.ready;
  }
  if (!session.tab) return;
  session.owner.focus();
  session.tabs.select(session.tab.id);
  session.tab.root.focus();
  return true;
}

function focusExisting(owner?: Window): true | Promise<void> | undefined {
  const preferred = owner && sessions.get(owner);
  const focused = preferred && focusSession(preferred);
  if (focused) return focused;
  for (const session of sessions.values()) {
    if (session === preferred) continue;
    const focused = focusSession(session);
    if (focused) return focused;
  }
  return undefined;
}

function isMain(window: Window | null | undefined): window is Main {
  return (
    !!window && !window.closed && typeof (window as Partial<Main>).Zotero_Tabs?.add === 'function'
  );
}

function closeSession(owner: Window, nativeClose: boolean): void {
  const session = sessions.get(owner);
  if (!session) return;
  sessions.delete(owner);
  const tab = session.tab;
  session.tab = undefined;
  if (tab) {
    guarded(tab.dispose);
    if (nativeClose && !owner.closed) guarded(() => session.tabs.close(tab.id));
  }
  const popup = session.popup;
  if (popup) {
    guarded(popup.detach);
    if (!popup.window.closed) guarded(() => popup.window.close());
  }
  if (!owner.closed) guarded(session.detach);
}

export function startup({ id, rootURI }: RootData): void {
  if (registration) return;
  const chrome = Components.classes['@mozilla.org/addons/addon-manager-startup;1'].getService(
    Components.interfaces.amIAddonManagerStartup,
  );
  const registered = chrome.registerChrome(Services.io.newURI(`${rootURI}manifest.json`), [
    ['content', 'zotero-bases', 'content/'],
  ]);
  try {
    const menuID = Zotero.MenuManager.registerMenu({
      pluginID: id,
      menuID: 'workspace',
      target: 'main/menubar/tools',
      menus: [
        {
          menuType: 'menuitem',
          onShowing: (_, { menuElem }) => menuElem.setAttribute('label', NAME),
          onCommand: (_, { menuElem }) => {
            const owner = menuElem.ownerDocument.defaultView;
            if (owner && registration === registered)
              void launch?.api.open({ window: owner }).catch((error) => Zotero.logError(error));
          },
        },
      ],
    });
    if (!menuID) throw new Error('Zotero refused the Bases Tools menu');
    menu = menuID;
    registration = registered;
    Zotero[PANE_MOUNT] = mountPreferencePane;
    launch = publishLaunchAPI(Zotero, {
      ready: Zotero.initializationPromise,
      focusExisting,
      resolveOwner: (requested) => {
        const owner = isMain(requested) ? requested : Zotero.getMainWindow();
        return isMain(owner) ? owner : null;
      },
      defaultMode: () => globalPreferences().read().openMode,
      open(owner, mode) {
        if (mode === 'tab') {
          openTab(owner);
          return;
        }
        const session = sessionFor(owner);
        if (!session) throw new Error('Cannot open Zotero Bases in this window');
        startLibrarySync();
        return openPopup(session);
      },
    });
    paneRegistration = paneRegistration
      .then(async () => {
        if (registration !== registered) return;
        const pane = await Zotero.PreferencePanes.register({
          id: PANE_ID,
          pluginID: id,
          src: `${rootURI}content/preferences.xhtml`,
          label: NAME,
        });
        if (registration === registered) paneID = pane;
        else Zotero.PreferencePanes.unregister(pane);
      })
      .catch((error) => Zotero.logError(error));
    void Zotero.initializationPromise
      .then(() => {
        if (registration === registered) guarded(startLibrarySync);
      })
      .catch((error) => Zotero.logError(error));
  } catch (error) {
    registered.destruct();
    throw error;
  }
}

export function onMainWindowUnload({ window }: { window: Window }): void {
  closeSession(window, false);
}

export function shutdown(): void {
  launch?.dispose();
  launch = undefined;
  if (Zotero[PANE_MOUNT] === mountPreferencePane) delete Zotero[PANE_MOUNT];
  for (const dispose of preferenceMounts.values()) guarded(dispose);
  const pane = paneID;
  paneID = undefined;
  if (pane) guarded(() => Zotero.PreferencePanes.unregister(pane));
  globalStore = undefined;
  const previous = menu;
  menu = undefined;
  if (previous) guarded(() => void Zotero.MenuManager.unregisterMenu(previous));
  for (const owner of sessions.keys()) closeSession(owner, true);
  const sync = librarySync;
  librarySync = undefined;
  if (sync) guarded(() => sync.stop());
  const chrome = registration;
  registration = undefined;
  if (chrome) guarded(() => chrome.destruct());
}

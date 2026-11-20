import { createConfig, decodeSyncSnapshot, SCHEMA_PREF, VIEWS_PREF } from './config';
import type { WorkspaceHost } from './contracts';
import {
  createPropertyValidation,
  createWorkspaceHost,
  type LibraryOwner,
  type Prefs,
  type ZoteroData,
} from './data';
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
  NativeSyncZotero & {
    readonly Prefs: Prefs;
    readonly initializationPromise: Promise<unknown>;
    readonly locale: string;
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
  };
  interfaces: { amIAddonManagerStartup: unknown };
  utils: { cloneInto<T>(value: T, target: object): T };
};

const sessions = new Map<Window, Session>();
let registration: { destruct(): void } | undefined;
let menu: string | undefined;
let librarySync: (SyncPort & { stop(): void }) | undefined;

function startLibrarySync(): void {
  if (librarySync) return;
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
}

function language(): 'zh-CN' | 'en' {
  return /^zh-(?:CN|Hans)(?:-|$)/i.test(Zotero.locale) ? 'zh-CN' : 'en';
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
  root.style.cssText = 'flex:1;min-width:0;min-height:0;overflow:auto;width:100%;';
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

function openPopup(session: Session): void {
  if (session.popup && !session.popup.window.closed) {
    session.popup.window.focus();
    return;
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
  const entry: Popup = {
    window,
    detach: () => {
      if (session.popup === entry) session.popup = undefined;
      if (observing) {
        observing = false;
        guarded(() => Services.ww.unregisterNotification(observer));
      }
      window.removeEventListener('DOMContentLoaded', mount);
      dispose?.();
      dispose = undefined;
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
    } catch (error) {
      guarded(entry.detach);
      guarded(() => window.close());
      Zotero.logError(error);
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
    guarded(entry.detach);
    guarded(() => window.close());
    throw error;
  }
}

function openTab(owner: Window): void {
  if (!menu || owner.closed) return;
  const session = sessionFor(owner);
  if (!session) return;
  guarded(startLibrarySync);
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
    const { root, dispose } = mountSurface(session, container, () =>
      guarded(() => openPopup(session)),
    );
    session.tab = { id, root, dispose };
    session.tabs.select(id);
    root.focus();
  } catch (error) {
    guarded(() => session.tabs.close(id));
    throw error;
  }
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
            if (owner)
              void Zotero.initializationPromise
                .then(() => {
                  if (registration !== registered || owner.closed) return;
                  guarded(() => openTab(owner));
                })
                .catch((error) => Zotero.logError(error));
          },
        },
      ],
    });
    if (!menuID) throw new Error('Zotero refused the Bases Tools menu');
    menu = menuID;
    registration = registered;
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

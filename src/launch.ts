export interface OpenOptions {
  readonly window?: Window;
  readonly mode?: 'default' | 'tab' | 'window';
}

type OpenMode = Exclude<OpenOptions['mode'], 'default' | undefined>;

interface BasesNamespace {
  readonly api: {
    readonly version: 1;
    open(options?: OpenOptions): Promise<void>;
  };
}

export interface BasesAPIHost {
  ZoteroBases?: BasesNamespace;
}

interface LaunchPort {
  readonly ready: Promise<unknown>;
  focusExisting(window?: Window): true | Promise<void> | undefined;
  resolveOwner(window?: Window): Window | null;
  defaultMode(): OpenMode;
  open(owner: Window, mode: OpenMode): void | Promise<void>;
}

export interface LaunchRegistration {
  readonly api: BasesNamespace['api'];
  dispose(): void;
}

export function publishLaunchAPI(host: BasesAPIHost, port: LaunchPort): LaunchRegistration {
  let active = true;
  const namespace: BasesNamespace = {
    api: {
      version: 1,
      async open(options) {
        await port.ready;
        if (!active) throw new Error('Zotero Bases is not active');
        const focused = port.focusExisting(options?.window);
        if (focused) {
          if (focused !== true) await focused;
          return;
        }
        const owner = port.resolveOwner(options?.window);
        if (!owner) throw new Error('No Zotero library window is available');
        const mode = options?.mode;
        await port.open(owner, mode === 'tab' || mode === 'window' ? mode : port.defaultMode());
      },
    },
  };
  host.ZoteroBases = namespace;
  return {
    api: namespace.api,
    dispose(): void {
      active = false;
      if (host.ZoteroBases === namespace) delete host.ZoteroBases;
    },
  };
}

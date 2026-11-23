// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { publishLaunchAPI, type BasesAPIHost } from '../src/launch';

function fixture() {
  const host: BasesAPIHost = {};
  const focusExisting = vi.fn<(owner?: Window) => true | Promise<void> | undefined>();
  const resolveOwner = vi.fn<(owner?: Window) => Window | null>((owner) => owner ?? window);
  const defaultMode = vi.fn<() => 'window' | 'tab'>(() => 'window');
  const open = vi.fn<(owner: Window, mode: 'window' | 'tab') => void>();
  const port = { ready: Promise.resolve(), focusExisting, resolveOwner, defaultMode, open };
  return { host, port };
}

describe('Zotero.ZoteroBases.api', () => {
  it('waits for readiness and honors the default or explicit mode with a supplied owner', async () => {
    const { host, port } = fixture();
    let initialize!: () => void;
    const ready = new Promise<void>((resolve) => {
      initialize = resolve;
    });
    publishLaunchAPI(host, { ...port, ready });
    const api = host.ZoteroBases!.api;
    expect(api.version).toBe(1);
    const pending = api.open();
    expect(port.open).not.toHaveBeenCalled();
    initialize();
    await pending;
    await api.open({ window, mode: 'tab' });
    port.defaultMode.mockReturnValue('tab');
    await api.open({ mode: 'default' });
    await api.open({ mode: 'window' });
    expect(port.open.mock.calls).toEqual([
      [window, 'window'],
      [window, 'tab'],
      [window, 'tab'],
      [window, 'window'],
    ]);
    expect(port.resolveOwner).toHaveBeenNthCalledWith(2, window);
    expect(port.defaultMode).toHaveBeenCalledTimes(2);
  });

  it('focuses an open tab or pending popup instead of opening another workspace', async () => {
    const { host, port } = fixture();
    const { api } = publishLaunchAPI(host, port);
    port.focusExisting.mockReturnValueOnce(true);
    await api.open({ window, mode: 'window' });
    const popup = Promise.reject(new Error('Popup closed before mounting'));
    port.focusExisting.mockReturnValueOnce(popup);
    await expect(api.open({ window, mode: 'tab' })).rejects.toThrow('Popup closed before mounting');
    expect(port.focusExisting.mock.calls).toEqual([[window], [window]]);
    expect(port.open).not.toHaveBeenCalled();
  });

  it('drops callbacks after unload without deleting a replacement publisher', async () => {
    const { host, port } = fixture();
    const first = publishLaunchAPI(host, port);
    const inFlight = first.api.open();
    const replacement = publishLaunchAPI(host, port);
    first.dispose();
    expect(host.ZoteroBases?.api).toBe(replacement.api);
    await expect(inFlight).rejects.toThrow('not active');
    expect(port.open).not.toHaveBeenCalled();
    replacement.dispose();
    expect(host.ZoteroBases).toBeUndefined();
    await expect(replacement.api.open()).rejects.toThrow('not active');
  });
});

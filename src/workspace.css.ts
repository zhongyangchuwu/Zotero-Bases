export const workspaceCSS = String.raw`
.zb-workspace {
  --zb-light-bg: #fbfbfd;
  --zb-light-surface: #fff;
  --zb-light-text: #222329;
  --zb-light-muted: #575866;
  --zb-light-border: #d4d6df;
  --zb-light-accent: #2357ae;
  --zb-light-selected: #eaf1ff;
  --zb-light-warning: #fff3c6;
  --zb-light-warning-text: #4d3900;
  --zb-light-warning-border: #d2ad45;
  --zb-light-danger: #a52020;
  --zb-bg: var(--zb-native-background, var(--zb-light-bg));
  --zb-surface: var(--zb-native-surface, var(--zb-light-surface));
  --zb-text: var(--zb-native-text, var(--zb-light-text));
  --zb-muted: var(--zb-native-muted, var(--zb-light-muted));
  --zb-border: var(--zb-native-border, var(--zb-light-border));
  --zb-accent: var(--zb-native-accent, var(--zb-light-accent));
  --zb-selected: var(--zb-native-selection, var(--zb-light-selected));
  --zb-warning: var(--zb-light-warning);
  --zb-warning-text: var(--zb-light-warning-text);
  --zb-warning-border: var(--zb-light-warning-border);
  --zb-danger: var(--zb-light-danger);
  --zb-pill-bg: color-mix(in srgb, var(--zb-surface) 88%, var(--zb-text));
  --zb-pill-border: color-mix(in srgb, var(--zb-surface) 78%, var(--zb-text));
  --zb-row-hover: color-mix(in srgb, var(--zb-surface) 94%, var(--zb-text));
  --zb-row-height: 34px;
  color-scheme: light dark;
  color: var(--zb-text);
  background: var(--zb-bg);
  accent-color: var(--zb-accent);
  font: menu;
  font-size: 0.875rem;
  line-height: 1.45;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0.75rem;
  gap: 0.55rem;
}
@media (prefers-color-scheme: dark) {
  .zb-workspace {
    --zb-light-bg: #1b1c20;
    --zb-light-surface: #24252a;
    --zb-light-text: #eff0f4;
    --zb-light-muted: #b7b8c4;
    --zb-light-border: #4b4d59;
    --zb-light-accent: #9abdff;
    --zb-light-selected: #283956;
    --zb-light-warning: #3c3113;
    --zb-light-warning-text: #ffe4a3;
    --zb-light-warning-border: #968354;
    --zb-light-danger: #ffaaaa;
  }
}
.zb-workspace, .zb-workspace * { box-sizing: border-box; }
.zb-workspace [hidden] { display: none !important; }
.zb-workspace :is(button, input, select, textarea) { font: inherit; color: inherit; }
.zb-workspace :where(button, input:not([type='checkbox']), select, textarea) {
  background: var(--zb-surface);
  border: 1px solid var(--zb-border);
  border-radius: 0.3rem;
  padding: 0.26rem 0.55rem;
  min-height: 1.9rem;
  max-width: 100%;
}
.zb-workspace button, .zb-workspace summary, .zb-workspace input[type='checkbox'] { cursor: pointer; }
.zb-workspace :is(button, input, select, textarea):disabled { cursor: default; opacity: 0.6; }
.zb-workspace :where(button, summary, [role='tab']):hover:not(:disabled) { background: var(--zb-selected); }
.zb-workspace :focus-visible { outline: 2px solid var(--zb-accent); outline-offset: 1px; }
.zb-workspace .zb-bar, .zb-workspace .zb-line, .zb-workspace .zb-tabs,
.zb-workspace .zb-options, .zb-workspace .zb-pagination {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.55rem;
}
.zb-workspace .zb-tabs { display: flex; align-items: center; gap: 0.3rem; flex: 1 1 auto; min-width: 0; }
.zb-workspace .zb-tablist { display: flex; gap: 0.25rem; max-width: 100%; overflow-x: auto; padding: 3px; }
.zb-workspace .zb-tablist button { white-space: nowrap; }
.zb-workspace :is([aria-selected='true'], [aria-pressed='true']) { color: var(--zb-accent); border-color: var(--zb-accent); background: var(--zb-selected); }
.zb-workspace .zb-view-actions { position: relative; flex-shrink: 0; }
.zb-workspace .zb-view-actions > summary, .zb-workspace .zb-tool-icon {
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  padding: 0;
  line-height: 1;
  font-size: 1.14em;
}
.zb-workspace .zb-view-action-list {
  position: absolute;
  inset-block-start: 100%;
  inset-inline-end: 0;
  z-index: 4;
  min-width: max-content;
}
.zb-workspace .zb-view-action-list button { text-align: start; }
.zb-workspace .zb-top { position: relative; }
.zb-workspace .zb-sync { margin-inline-start: auto; }
.zb-workspace .zb-sync-pane {
  position: absolute;
  inset-block-start: 100%;
  inset-inline-end: 0;
  width: min(32rem, 100%);
  z-index: 3;
}
.zb-workspace .zb-sync-pane p { margin: 0; }
.zb-workspace .zb-sync-location,
.zb-workspace .zb-sync-location label { display: grid; gap: 0.35rem; min-width: 0; }
.zb-workspace .zb-sync-location { margin-block-start: 0.35rem; }
.zb-workspace .zb-sync-location button { justify-self: start; }
.zb-workspace .zb-panel { display: flex; flex-direction: column; gap: 0.55rem; flex: 1; min-height: 0; }
.zb-workspace .zb-toolbar { align-items: flex-start; }
.zb-workspace .zb-search {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-inline-start: auto;
  flex: 1 1 13rem;
  min-width: min(100%, 13rem);
  max-width: 19rem;
}
.zb-workspace .zb-search input { flex: 1; min-width: 0; }
.zb-workspace details { max-width: 100%; }
.zb-workspace summary { width: max-content; max-width: 100%; border: 1px solid var(--zb-border); border-radius: 0.3rem; padding: 0.26rem 0.55rem; }
.zb-workspace .zb-pane {
  border: 1px solid var(--zb-border);
  border-radius: 0.3rem;
  background: var(--zb-surface);
  padding: 0.5rem;
  margin-block-start: 0.25rem;
  display: grid;
  gap: 0.45rem;
  max-height: 36vh;
  overflow: auto;
}
.zb-workspace .zb-pane-list { display: grid; gap: 0.35rem; }
.zb-workspace .zb-property { border-block-start: 1px solid var(--zb-border); padding-block: 0.45rem 0; }
.zb-workspace .zb-property + .zb-property { margin-block-start: 0.45rem; }
.zb-workspace .zb-property > .zb-line { margin-block: 0.25rem; }
.zb-workspace fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.zb-workspace :is(.zb-warning, .zb-status) { margin: 0; }
.zb-workspace .zb-warning {
  color: var(--zb-warning-text);
  background: var(--zb-warning);
  border: 1px solid var(--zb-warning-border);
  border-radius: 0.3rem;
  padding: 0.3rem 0.55rem;
}
.zb-workspace .zb-bulk {
  border: 1px solid var(--zb-border);
  border-radius: 0.3rem;
  background: var(--zb-surface);
  padding: 0.3rem 0.55rem;
}
.zb-workspace .zb-key-hint { color: var(--zb-accent); }
.zb-workspace .zb-status { color: var(--zb-muted); }
.zb-workspace .zb-status[data-error='true'], .zb-workspace .zb-danger { color: var(--zb-danger); }
.zb-workspace .zb-table-wrap {
  flex: 1;
  min-height: 3rem;
  overflow: auto;
  border: 1px solid var(--zb-border);
  border-radius: 0.35rem;
  background: var(--zb-bg);
}
.zb-workspace table { table-layout: fixed; border-spacing: 0; }
.zb-workspace th, .zb-workspace td {
  text-align: start;
  padding: 0.2rem 0.55rem;
  border-block-end: 1px solid var(--zb-border);
  vertical-align: middle;
}
.zb-workspace th {
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
  background: var(--zb-surface);
  padding-inline-end: 0.65rem;
}
.zb-workspace th button {
  appearance: none;
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: start;
  padding-inline: 0;
  border-color: transparent;
  background: transparent;
}
.zb-workspace .zb-column-grip {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  width: 9px;
  cursor: col-resize;
  touch-action: none;
}
.zb-workspace .zb-column-grip::after {
  content: '';
  position: absolute;
  inset-block: 24%;
  inset-inline-end: 3px;
  border-inline-end: 1px solid var(--zb-border);
}
.zb-workspace .zb-column-grip:is(:hover, :focus-visible, [data-dragging])::after {
  border-color: var(--zb-accent);
  border-width: 2px;
}
.zb-workspace[data-density='comfortable'] { --zb-row-height: 42px; }
.zb-workspace tbody tr[data-item-id] > td {
  height: var(--zb-row-height);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.zb-workspace[data-density='wrap'] tbody tr[data-item-id] > td,
.zb-workspace tbody td:has(.zb-editor) {
  white-space: normal;
  overflow-wrap: anywhere;
}
.zb-workspace tbody tr:hover { background: var(--zb-row-hover); }
.zb-workspace tbody tr:focus-visible { background: var(--zb-selected); outline-offset: -2px; }
.zb-workspace .zb-select-cell { padding-inline: 0; text-align: center; vertical-align: middle; }
.zb-workspace tbody tr[data-selected='true'] { background: var(--zb-selected); }
.zb-workspace .zb-group > td { background: var(--zb-bg); }
.zb-workspace .zb-group-toggle { font-weight: 600; text-align: start; overflow-wrap: anywhere; }
.zb-workspace .zb-cell-button {
  appearance: none;
  display: block;
  width: 100%;
  min-width: 0;
  background: transparent;
  border-color: transparent;
  padding: 0 2px;
  min-height: 1.55rem;
  text-align: start;
  white-space: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  overflow-wrap: inherit;
}
.zb-workspace .zb-cell-button:hover:not(:disabled) {
  background: var(--zb-pill-bg);
  border-color: var(--zb-pill-border);
}
.zb-workspace .zb-item-title { color: var(--zb-text); font-weight: 600; }
.zb-workspace .zb-cell-number, .zb-workspace .zb-cell-number > button {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.zb-workspace td[data-column='added'] { font-variant-numeric: tabular-nums; }
.zb-workspace .zb-cell-pills {
  display: flex;
  align-items: center;
  gap: 3px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}
.zb-workspace[data-density='wrap'] .zb-cell-pills { flex-wrap: wrap; }
.zb-workspace .zb-cell-pill, .zb-workspace .zb-type-badge {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
  border: 1px solid var(--zb-pill-border);
  border-radius: 999px;
  background: var(--zb-pill-bg);
  color: var(--zb-text);
  padding: 0 0.38em;
  font-size: 0.86em;
  line-height: 1.45;
}
.zb-workspace .zb-cell-pill { flex: none; white-space: nowrap; }
.zb-workspace .zb-type-badge { color: var(--zb-muted); }
.zb-workspace td[data-column^='property:'] .zb-cell-pill:not(.zb-cell-pill-more) {
  background: color-mix(in srgb, var(--zb-surface) 85%, var(--zb-accent));
  border-color: color-mix(in srgb, var(--zb-surface) 73%, var(--zb-accent));
}
.zb-workspace .zb-cell-pill-more { color: var(--zb-muted); font-variant-numeric: tabular-nums; }
.zb-workspace .zb-pdf-button {
  display: grid;
  place-items: center;
  width: 100%;
  padding: 0;
  color: color-mix(in srgb, var(--zb-accent) 70%, var(--zb-text));
}
.zb-workspace .zb-pdf-mark {
  display: grid;
  place-items: center;
  width: 1.72rem;
  height: 1.15rem;
  border: 1px solid currentColor;
  border-radius: 0.22rem;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
}
.zb-workspace .zb-pdf-mark::before { content: 'PDF'; }
.zb-workspace .zb-editor { border: 1px solid var(--zb-border); border-radius: 0.35rem; background: var(--zb-surface); padding: 0.38rem; max-width: 100%; min-width: 0; }
.zb-workspace .zb-editor .zb-line + .zb-line { margin-block-start: 0.35rem; }
.zb-workspace .zb-editor .zb-options { max-height: 9rem; overflow: auto; }
.zb-workspace .zb-empty { color: var(--zb-muted); padding: 0.7rem; }
.zb-workspace .zb-pagination { justify-content: flex-end; }
.zb-workspace .zb-page-count { margin-inline-end: auto; color: var(--zb-muted); }
`;

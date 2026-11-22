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
.zb-workspace .zb-options {
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
.zb-workspace .zb-select-chevron {
  position: relative;
  display: inline-grid;
  max-width: 100%;
}
.zb-workspace .zb-select-chevron > select {
  appearance: none;
  padding-inline-end: 1.85rem;
}
.zb-workspace .zb-select-chevron::after {
  content: '';
  position: absolute;
  inset-inline-end: 0.7rem;
  top: 50%;
  width: 0.45rem;
  height: 0.45rem;
  border: solid var(--zb-muted);
  border-width: 0 1.5px 1.5px 0;
  transform: translateY(-72%) rotate(45deg);
  pointer-events: none;
}
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
  overflow-anchor: none;
  border: 1px solid var(--zb-border);
  border-radius: 0.35rem;
  background: var(--zb-bg);
}
.zb-workspace table { table-layout: fixed; border-spacing: 0; min-width: 100%; }
.zb-workspace th, .zb-workspace td {
  text-align: start;
  padding: 0.2rem 0.55rem;
  border-block-end: 1px solid var(--zb-border);
  vertical-align: middle;
}
.zb-workspace th {
  position: sticky;
  inset-block-start: 0;
  z-index: 3;
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
.zb-workspace th.zb-table-tail { padding-inline: 3px 5px; }
.zb-workspace .zb-table-tail > button {
  margin-inline-start: auto;
  width: 1.8rem;
  min-height: 1.65rem;
  height: 1.65rem;
  display: grid;
  place-items: center;
  color: var(--zb-muted);
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
.zb-workspace tbody tr:is([data-item-id], .zb-group) > td {
  height: var(--zb-row-height);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.zb-workspace[data-density='wrap'] tbody tr:is([data-item-id], .zb-group) {
  height: var(--zb-row-height);
}
.zb-workspace[data-density='wrap'] tbody tr:is([data-item-id], .zb-group) > td {
  height: auto;
  overflow: visible;
  white-space: normal;
  overflow-wrap: anywhere;
}
.zb-workspace .zb-virtual-spacer > td { padding: 0; border: 0; }
.zb-workspace .zb-table-wrap:focus { outline: none; }
.zb-workspace .zb-table-wrap:focus-within [data-active-cell] {
  outline: 2px solid color-mix(in srgb, var(--zb-accent) 75%, var(--zb-text));
  outline-offset: -2px;
}
.zb-workspace tbody tr[data-item-id] > td:has(> .zb-editor) {
  position: relative;
  overflow: visible;
  z-index: 2;
}
.zb-workspace .zb-editor-opener { visibility: hidden; }
.zb-workspace tbody tr:hover { background: var(--zb-row-hover); }
.zb-workspace tbody td:focus:not([data-active-cell]) { outline-offset: -2px; }
.zb-workspace .zb-select-cell { padding-inline: 0; text-align: center; vertical-align: middle; }
.zb-workspace tbody tr[data-selected='true'] { background: var(--zb-selected); }
.zb-workspace .zb-group > td { background: var(--zb-bg); }
.zb-workspace .zb-group-toggle {
  font-weight: 600;
  text-align: start;
  overflow-wrap: anywhere;
  white-space: inherit;
  min-height: 0;
  padding-block: 0;
}
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
.zb-workspace[data-density='wrap'] :is(.zb-cell-button, .zb-group-toggle) { height: auto; }
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
.zb-workspace [data-tone='green'] { --zb-choice-tone: #23935d; }
.zb-workspace [data-tone='amber'] { --zb-choice-tone: #d28b14; }
.zb-workspace [data-tone='sky'] { --zb-choice-tone: #438be0; }
.zb-workspace [data-tone='violet'] { --zb-choice-tone: #8a70c9; }
.zb-workspace [data-tone='teal'] { --zb-choice-tone: #269a96; }
.zb-workspace [data-tone='rose'] { --zb-choice-tone: #be6286; }
.zb-workspace .zb-cell-pill[data-tone]:not([data-tone='neutral']) {
  background: color-mix(in srgb, var(--zb-surface) 76%, var(--zb-choice-tone));
  border-color: color-mix(in srgb, var(--zb-surface) 58%, var(--zb-choice-tone));
  color: color-mix(in srgb, var(--zb-text) 87%, var(--zb-choice-tone));
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
.zb-workspace .zb-editor {
  position: absolute;
  inset-block-start: 1px;
  inset-inline-start: 0;
  min-width: min(16rem, 64vw);
  width: max-content;
  max-width: min(28rem, 80vw);
  border: 1px solid var(--zb-border);
  border-radius: 0.35rem;
  background: var(--zb-surface);
  box-shadow: 0 3px 14px color-mix(in srgb, var(--zb-text) 20%, transparent);
  padding: 0.38rem;
  white-space: normal;
}
.zb-workspace .zb-editor[data-above] { inset-block-start: auto; inset-block-end: 1px; }
.zb-workspace .zb-editor[data-end] { inset-inline-start: auto; inset-inline-end: 0; }
.zb-workspace .zb-editor .zb-line + .zb-line { margin-block-start: 0.35rem; }
.zb-workspace .zb-editor .zb-options { max-height: 9rem; overflow: auto; }
.zb-workspace .zb-empty { color: var(--zb-muted); padding: 0.7rem; }
.zb-workspace .zb-table-status {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  color: var(--zb-muted);
  font-variant-numeric: tabular-nums;
}
.zb-workspace .zb-table-keys { font-size: 0.92em; }
`;

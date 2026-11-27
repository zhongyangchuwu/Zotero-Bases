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
  --zb-link: light-dark(var(--zb-accent), #b8d4ff);
  --zb-selected: var(--zb-native-selection, var(--zb-light-selected));
  --zb-warning: var(--zb-light-warning);
  --zb-warning-text: var(--zb-light-warning-text);
  --zb-warning-border: var(--zb-light-warning-border);
  --zb-danger: var(--zb-light-danger);
  --zb-pill-bg: color-mix(in srgb, var(--zb-surface) 88%, var(--zb-text));
  --zb-pill-border: color-mix(in srgb, var(--zb-surface) 78%, var(--zb-text));
  --zb-row-hover: color-mix(in srgb, var(--zb-surface) 94%, var(--zb-text));
  --zb-floating-shadow: 0 2px 5px rgb(0 0 0 / 12%), 0 8px 20px rgb(0 0 0 / 16%);
  --zb-font-family: var(--zb-native-font-family, system-ui, sans-serif);
  --zb-font-size: var(--zb-native-font-size, 1rem);
  --zb-row-height: 2.6em;
  color-scheme: light dark;
  color: var(--zb-text);
  background: var(--zb-bg);
  accent-color: var(--zb-accent);
  font-family: var(--zb-font-family);
  font-size: var(--zb-font-size);
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
    --zb-floating-shadow: 0 2px 5px rgb(0 0 0 / 30%), 0 8px 20px rgb(0 0 0 / 36%);
  }
}
.zb-workspace, .zb-workspace * { box-sizing: border-box; }
.zb-workspace [hidden] { display: none !important; }
.zb-workspace :is(button, input, select, textarea) { font: inherit; color: inherit; }
.zb-workspace :where(button, input:not([type='checkbox']), select, textarea) {
  background: var(--zb-surface);
  border: 1px solid var(--zb-border);
  border-radius: 0.3rem;
  padding: 0.25em 0.55em;
  min-height: 2em;
  max-width: 100%;
}
.zb-workspace button, .zb-workspace input[type='checkbox'] { cursor: pointer; }
.zb-workspace :is(button, input, select, textarea):disabled { cursor: default; opacity: 0.6; }
.zb-workspace :where(button, [role='tab']):hover:not(:disabled) { background: var(--zb-selected); }
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
.zb-workspace .zb-tool-icon {
  display: grid;
  place-items: center;
  width: 1.8em;
  height: 1.8em;
  min-height: 1.8em;
  padding: 0;
  line-height: 1;
  font-size: 1.14em;
}
.zb-workspace .zb-view-action-list button {
  text-align: start;
  background: transparent;
  border-color: transparent;
}
.zb-workspace .zb-view-action-list button:hover:not(:disabled) { background: var(--zb-selected); }
.zb-workspace .zb-view-action-list hr {
  border: 0;
  border-block-start: 1px solid var(--zb-border);
  width: 100%;
  margin: 0.05rem 0;
}
.zb-workspace .zb-top { position: relative; }
.zb-workspace .zb-settings { flex: none; }
.zb-workspace .zb-sync-badge {
  display: grid;
  place-items: center;
  flex: none;
  width: 1.8em;
  height: 1.8em;
  padding: 0;
  border-radius: 999px;
  color: var(--zb-muted);
}
.zb-workspace .zb-sync-badge > span { font-size: 0.85em; line-height: 1; }
.zb-workspace .zb-sync-badge[data-status='ready'] { color: light-dark(#207340, #85e0a3); }
.zb-workspace .zb-sync-badge[data-status='pending'] { color: var(--zb-accent); }
.zb-workspace .zb-sync-badge[data-status='attention'] { color: light-dark(#855700, #ffdb80); }
.zb-workspace .zb-sync-badge[data-status='error'] { color: var(--zb-danger); }
.zb-workspace .zb-panel { display: flex; flex-direction: column; gap: 0.55rem; flex: 1; min-height: 0; }
.zb-workspace .zb-toolbar { position: relative; align-items: center; }
.zb-workspace :is(.zb-top, .zb-toolbar) .zb-tool-icon:not(.zb-search-toggle, .zb-sync-badge),
.zb-workspace .zb-tool {
  border-color: color-mix(in srgb, var(--zb-border) 65%, transparent);
  background: transparent;
}
.zb-workspace .zb-tool {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  white-space: nowrap;
}
.zb-workspace :is(.zb-top, .zb-toolbar) :is(.zb-tool, .zb-tool-icon):is(
  :hover:not(:disabled), [aria-expanded='true']
) { background: var(--zb-selected); }
.zb-workspace .zb-tool[aria-expanded='true'] { border-color: var(--zb-accent); }
.zb-workspace .zb-tool-badge {
  font-size: 0.9em;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
  padding-inline: 0.3em;
  border-radius: 4px;
  color: var(--zb-accent);
  background: var(--zb-selected);
}
.zb-workspace .zb-select-chevron {
  position: relative;
  display: inline-grid;
  min-width: 0;
  max-width: 100%;
}
.zb-workspace .zb-select-chevron > select:not([multiple]) {
  appearance: none;
  padding-inline-end: 1.85em;
}
.zb-workspace .zb-select-chevron:has(> select:not([multiple]))::after {
  content: '';
  position: absolute;
  inset-inline-end: 0.7em;
  top: 50%;
  width: 0.45em;
  height: 0.45em;
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
  flex: 1 1 13em;
  min-width: min(100%, 13em);
  max-width: 19em;
}
.zb-workspace[data-compact-search] .zb-search {
  position: absolute;
  inset-block-start: 0;
  min-width: 0;
  inset-inline-end: 0;
  z-index: 5;
  width: min(19em, 100%);
  padding: 0.35rem;
  border: 1px solid var(--zb-border);
  border-radius: 0.35rem;
  background: var(--zb-surface);
  box-shadow: var(--zb-floating-shadow);
}
.zb-workspace .zb-search-toggle {
  position: relative;
  color: var(--zb-muted);
}
.zb-workspace .zb-search-toggle:is([data-filtering], [aria-expanded='true']) {
  color: var(--zb-accent);
  border-color: var(--zb-accent);
  background: var(--zb-selected);
}
.zb-workspace .zb-search-toggle::before {
  content: '';
  width: 0.7rem;
  height: 0.7rem;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  transform: translate(-0.08rem, -0.08rem);
}
.zb-workspace .zb-search-toggle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.38rem;
  height: 1.5px;
  border-radius: 1px;
  background: currentColor;
  transform: translate(0.15rem, 0.11rem) rotate(45deg);
  transform-origin: left center;
}
.zb-workspace .zb-search input { flex: 1; min-width: 0; }
.zb-workspace .zb-pane {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}
.zb-workspace .zb-pane-list { display: grid; gap: 0.35rem; }
.zb-workspace .zb-column-rule {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.3rem;
}
.zb-workspace .zb-column-rule label { gap: 0.35rem; overflow-wrap: anywhere; }
.zb-workspace .zb-column-rule svg { flex: none; color: var(--zb-muted); }
.zb-workspace .zb-column-pane { min-width: min(15rem, 100%); }
.zb-workspace .zb-column-search { width: 100%; min-width: 0; }
.zb-workspace .zb-column-group { display: grid; gap: 0.35rem; min-width: 0; }
.zb-workspace .zb-column-group + .zb-column-group {
  border-block-start: 1px solid var(--zb-border);
  padding-block-start: 0.35rem;
}
.zb-workspace .zb-column-group > strong { font-size: 0.9em; }
.zb-workspace .zb-column-group-trigger {
  background: transparent;
  border-color: transparent;
  text-align: start;
  font-weight: 600;
  padding-inline: 0.25rem;
}
.zb-workspace .zb-column-empty { margin: 0; color: var(--zb-muted); }
.zb-workspace .zb-column-position {
  color: var(--zb-muted);
  font-size: 0.9em;
  font-variant-numeric: tabular-nums;
}
.zb-workspace .zb-order-button { min-width: 1.7rem; padding-inline: 0.32rem; }
.zb-workspace .zb-sort-rule { gap: 0.3rem; }
.zb-workspace .zb-sort-rule select { min-width: 0; }
.zb-workspace .zb-sort-priority {
  min-width: 1.1em;
  text-align: center;
  color: var(--zb-muted);
  font-variant-numeric: tabular-nums;
}
.zb-workspace .zb-option-palette { display: flex; flex-wrap: wrap; gap: 0.25em; }
.zb-workspace .zb-option-swatch {
  display: inline-grid;
  place-items: center;
  width: 1.7em;
  min-height: 1.7em;
  padding: 0;
  border-radius: 4px;
  line-height: 1;
}
.zb-workspace :is(.zb-option-swatch, .zb-color-control)[data-tone]::before {
  content: '';
  width: 0.72em;
  height: 0.72em;
  border-radius: 50%;
  background: var(--zb-choice-tone);
  flex: none;
}
.zb-workspace .zb-option-swatch:is(:hover, [aria-pressed='true'], [aria-expanded='true']) {
  border-color: var(--zb-accent);
}
.zb-workspace .zb-color-control { display: inline-flex; align-items: center; gap: 0.45em; }
.zb-workspace .zb-editor-choice { display: inline-flex; align-items: center; gap: 0.18em; }
.zb-workspace .zb-choice-palette:not([hidden]) { margin-block: 0.35em; }
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
  padding: 0.2em 0.55rem;
  border-block-end: 1px solid var(--zb-border);
  border-inline-end: 1px solid color-mix(in srgb, var(--zb-border) 55%, var(--zb-surface));
  vertical-align: middle;
}
.zb-workspace th {
  position: sticky;
  inset-block-start: 0;
  z-index: 3;
  background: var(--zb-surface);
  padding-inline-end: 0.65rem;
}
.zb-workspace :is(th, td)[data-frozen] {
  position: sticky;
  inset-inline-start: var(--zb-frozen-offset);
}
.zb-workspace td[data-frozen] {
  z-index: 2;
  background: var(--zb-bg);
}
.zb-workspace tr:hover > td[data-frozen] {
  background: linear-gradient(var(--zb-row-hover), var(--zb-row-hover)), var(--zb-bg);
}
.zb-workspace tr[data-selected='true'] > td[data-frozen] {
  background: linear-gradient(var(--zb-selected), var(--zb-selected)), var(--zb-bg);
}
.zb-workspace th[data-frozen] { z-index: 4; }
.zb-workspace [data-frozen-shadow] [data-frozen-end] {
  box-shadow: 7px 0 8px -7px color-mix(in srgb, var(--zb-text) 52%, transparent);
}
.zb-workspace [data-frozen-shadow]:dir(rtl) [data-frozen-end] {
  box-shadow: -7px 0 8px -7px color-mix(in srgb, var(--zb-text) 52%, transparent);
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
.zb-workspace th .zb-header-button {
  display: flex;
  align-items: center;
  gap: 0.35em;
  min-width: 0;
  user-select: none;
  touch-action: pan-y;
}
.zb-workspace .zb-field-icon, .zb-workspace .zb-sort-indicator { flex: none; color: var(--zb-muted); }
.zb-workspace .zb-native-icon {
  display: inline-block;
  flex: none;
  width: 1.15em;
  height: 1.15em;
  background: var(--zb-icon-light) center / contain no-repeat;
  fill: currentColor;
  -moz-context-properties: fill, fill-opacity;
}
@media (prefers-color-scheme: dark) {
  .zb-workspace .zb-native-icon {
    background-image: var(--zb-icon-dark, var(--zb-icon-light));
  }
}
.zb-workspace .zb-field-icon.zb-native-icon { width: 1em; height: 1em; }
.zb-workspace [data-header-column='notesCount'] .zb-native-icon {
  color: light-dark(#8b6100, #ffc46b);
}
.zb-workspace [data-header-column='attachmentsCount'] .zb-native-icon {
  color: light-dark(#16774f, #6ed6a4);
}
.zb-workspace [data-header-column='tags'] .zb-native-icon {
  color: light-dark(#ab4f1e, #ffab72);
}
.zb-workspace :is([data-header-column='doi'], [data-header-column='url']) .zb-native-icon {
  color: light-dark(#2865a2, #91c9ff);
}
.zb-workspace .zb-header-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.zb-workspace .zb-column-drop {
  position: fixed;
  width: 2px;
  background: var(--zb-accent);
  z-index: 5;
  margin-left: -1px;
  pointer-events: none;
}
.zb-workspace th.zb-table-tail { padding-inline: 3px 5px; }
.zb-workspace .zb-table-tail > button {
  margin-inline-start: auto;
  width: min(1.8em, 100%);
  min-height: 1.65em;
  height: 1.65em;
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
.zb-workspace[data-density='comfortable'] { --zb-row-height: 3.25em; }
.zb-workspace .zb-row-probe {
  position: absolute;
  inset: 0 auto auto 0;
  width: 1em;
  height: var(--zb-row-height);
  visibility: hidden;
  pointer-events: none;
}
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
.zb-workspace[data-author-format='singleLine'] tbody tr[data-item-id] > td[data-column='creators'] {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.zb-workspace .zb-virtual-spacer > td { padding: 0; border: 0; }
.zb-workspace .zb-table-wrap:focus { outline: none; }
.zb-workspace .zb-table-wrap:focus-within [data-active-cell] {
  outline: 2px solid color-mix(in srgb, var(--zb-accent) 75%, var(--zb-text));
  outline-offset: -2px;
}
.zb-workspace tbody tr[data-item-id] > td:has(> .zb-editor) {
  overflow: visible;
  z-index: 6;
}
.zb-workspace tbody td:not([data-frozen]):has(> .zb-editor) { position: relative; }
.zb-workspace .zb-editor-opener { visibility: hidden; }
.zb-workspace tbody tr:hover { background: var(--zb-row-hover); }
.zb-workspace tbody td:focus:not([data-active-cell]) { outline-offset: -2px; }
.zb-workspace .zb-select-cell { padding-inline: 0; text-align: center; vertical-align: middle; }
.zb-workspace tbody tr[data-selected='true'] { background: var(--zb-selected); }
.zb-workspace tbody tr.zb-group > td { background: var(--zb-bg); overflow: visible; }
.zb-workspace .zb-group-toggle {
  position: sticky;
  inset-inline-start: 0.55rem;
  max-inline-size: min(65vw, 32em);
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
  min-height: 1.55em;
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
.zb-workspace .zb-cell-date.zb-cell-monospace,
.zb-workspace .zb-cell-date.zb-cell-monospace > button { font-family: ui-monospace, monospace; }
.zb-workspace .zb-rating { display: inline-flex; vertical-align: middle; max-width: 100%; }
.zb-workspace .zb-rating-star {
  appearance: none;
  display: grid;
  place-items: center;
  padding: 0;
  width: 1.24em;
  min-height: 1.45em;
  border-color: transparent;
  background: transparent;
  color: color-mix(in srgb, var(--zb-text) 31%, transparent);
}
.zb-workspace .zb-rating-star[aria-pressed='true'] { border-color: transparent; background: transparent; }
.zb-workspace .zb-rating-star[data-filled] { color: light-dark(#946100, #f0b951); }
.zb-workspace .zb-rating-star[data-filled] .zb-rating-icon { fill: currentColor; }
.zb-workspace .zb-rating-star svg { width: 1em; height: 1em; }
.zb-workspace .zb-rating-star:is(:hover, :focus-visible):not(:disabled) { color: light-dark(#946100, #f0b951); }
.zb-workspace .zb-rating[data-empty] { opacity: 0; }
.zb-workspace .zb-rating-cell:is(:hover, :focus-within, [data-active-cell]) .zb-rating { opacity: 1; }
.zb-workspace .zb-cell-url .zb-url-value { display: inline-block; width: auto; max-width: 100%; vertical-align: middle; }
.zb-workspace .zb-cell-url .zb-url-edit {
  position: absolute;
  inset-inline-end: 0.45rem;
  inset-block-start: 50%;
  transform: translateY(-50%);
  width: auto;
  visibility: hidden;
  background: var(--zb-surface);
}
.zb-workspace .zb-url-edit svg { display: block; width: 1em; height: 1em; }
.zb-workspace .zb-cell-url:is(:hover, :focus-within) .zb-url-edit:not(.zb-editor-opener) { visibility: visible; }
.zb-workspace td.zb-cell-url:not([data-frozen]) { position: relative; }
.zb-workspace td[data-column='title']:not([data-frozen]) { position: relative; }
.zb-workspace .zb-title-actions {
  position: absolute;
  inset-inline-end: 0.35em;
  inset-block-start: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 0.2em;
  max-width: calc(100% - 0.7em);
  padding: 0.15em;
  background: var(--zb-surface);
  border-radius: 4px;
  box-shadow: 0 1px 4px rgb(0 0 0 / 16%);
  opacity: 0;
  pointer-events: none;
}
.zb-workspace tr:hover .zb-title-actions,
.zb-workspace td[data-column='title']:focus-within .zb-title-actions {
  opacity: 1;
  pointer-events: auto;
}
.zb-workspace .zb-title-action {
  min-height: 1.55em;
  padding: 0.1em 0.35em;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--zb-muted);
  white-space: nowrap;
  font-size: 0.95em;
}
.zb-workspace .zb-cell-number, .zb-workspace .zb-cell-number > button {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.zb-workspace .zb-cell-date { font-variant-numeric: tabular-nums; }
.zb-workspace td[data-column='doi']:has(> .zb-link-copy) { position: relative; }
.zb-workspace .zb-link-open {
  display: inline-block;
  vertical-align: middle;
  min-height: 1.45em;
  padding: 0 2px;
  border-color: transparent;
  background: transparent;
  color: var(--zb-link);
  text-align: start;
  white-space: inherit;
  overflow: hidden;
  overflow-wrap: inherit;
  text-overflow: ellipsis;
}
.zb-workspace .zb-link-open:is(:hover, :focus-visible) {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.zb-workspace .zb-link-control:focus-visible { outline-offset: -2px; }
.zb-workspace .zb-link-copy {
  position: absolute;
  inset-inline-end: 0.35rem;
  inset-block-start: 50%;
  transform: translateY(-50%);
  min-height: 1.45em;
  padding: 0 0.3em;
  line-height: 1;
  background: var(--zb-surface);
  box-shadow: 0 1px 4px rgb(0 0 0 / 16%);
  opacity: 0;
  pointer-events: none;
}
.zb-workspace .zb-link-copy:hover { background: var(--zb-selected); }
.zb-workspace td:is(:hover, :focus-within) > .zb-link-copy {
  opacity: 1;
  pointer-events: auto;
}
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
  border-radius: 4px;
  background: var(--zb-pill-bg);
  color: var(--zb-text);
  padding: 0 0.38em;
  font-size: 0.95em;
  line-height: 1.45;
}
.zb-workspace .zb-cell-pill { flex: none; white-space: nowrap; }
.zb-workspace .zb-cell-collections .zb-cell-pill {
  border-color: color-mix(in srgb, var(--zb-pill-border) 66%, transparent);
  background: color-mix(in srgb, var(--zb-pill-bg) 70%, transparent);
  color: var(--zb-muted);
}
.zb-workspace [data-tone='amber'] { --zb-choice-tone: light-dark(#ad7300, #ffce52); }
.zb-workspace [data-tone='red'] { --zb-choice-tone: light-dark(#c43742, #ff7279); }
.zb-workspace [data-tone='green'] { --zb-choice-tone: light-dark(#287a40, #79cd65); }
.zb-workspace [data-tone='sky'] { --zb-choice-tone: light-dark(#206cae, #62bdf8); }
.zb-workspace [data-tone='violet'] { --zb-choice-tone: light-dark(#7153ac, #baa0f7); }
.zb-workspace [data-tone='rose'] { --zb-choice-tone: light-dark(#a13c85, #ee8acb); }
.zb-workspace [data-tone='orange'] { --zb-choice-tone: light-dark(#a9551b, #ffab64); }
.zb-workspace [data-tone='neutral'] { --zb-choice-tone: light-dark(#69707a, #b2b7bf); }
.zb-workspace [data-tone='teal'] { --zb-choice-tone: light-dark(#227773, #6ed2c9); }
.zb-workspace .zb-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.32em;
}
.zb-workspace .zb-type-label { overflow: hidden; text-overflow: ellipsis; }
.zb-workspace .zb-type-badge[data-item-type='journalArticle'] { --zb-choice-tone: light-dark(#2b69a7, #87bcef); }
.zb-workspace .zb-type-badge[data-item-type='conferencePaper'] { --zb-choice-tone: light-dark(#217b70, #76d1bd); }
.zb-workspace .zb-type-badge[data-item-type='preprint'] { --zb-choice-tone: light-dark(#8053ad, #c2a5f9); }
.zb-workspace .zb-type-badge:is([data-item-type='book'], [data-item-type='bookSection']) {
  --zb-choice-tone: light-dark(#966000, #eac269);
}
.zb-workspace .zb-type-badge[data-item-type='thesis'] { --zb-choice-tone: light-dark(#565bb3, #adb6ff); }
.zb-workspace .zb-type-badge[data-item-type='webpage'] { --zb-choice-tone: light-dark(#267399, #86c6e4); }
.zb-workspace .zb-type-badge[data-item-type='report'] { --zb-choice-tone: light-dark(#526a86, #a0bce1); }
.zb-workspace [data-column='tags'] .zb-cell-pill:not(.zb-cell-pill-more),
.zb-workspace .zb-cell-pill[data-tone], .zb-workspace .zb-type-badge {
  --zb-pill-accent: var(--zb-native-tag-color, var(--zb-choice-tone, var(--zb-muted)));
  background: color-mix(in srgb, var(--zb-surface) 89%, var(--zb-pill-accent));
  border-color: color-mix(in srgb, var(--zb-border) 70%, var(--zb-pill-accent));
  color: var(--zb-text);
}
.zb-workspace .zb-cell-pill-more { color: var(--zb-muted); font-variant-numeric: tabular-nums; }
.zb-workspace .zb-attachment-button {
  display: grid;
  place-items: center;
  width: 100%;
  padding: 0;
}
.zb-workspace .zb-editor {
  position: fixed;
  box-sizing: border-box;
  left: 0;
  top: 0;
  min-width: min(16em, 64vw, var(--zb-editor-width, 64vw));
  width: max-content;
  max-width: min(28em, 80vw, var(--zb-editor-width, 80vw));
  max-height: var(--zb-editor-height, none);
  overflow: auto;
  border: 1px solid var(--zb-border);
  border-radius: 0.35rem;
  background: var(--zb-surface);
  box-shadow: var(--zb-floating-shadow);
  padding: 0.38em;
  white-space: normal;
}
.zb-workspace .zb-editor .zb-line + .zb-line { margin-block-start: 0.35rem; }
.zb-workspace .zb-editor .zb-options { max-height: 9em; overflow: auto; }
.zb-workspace .zb-inline-calendar { margin-block-start: 0.38em; }
.zb-workspace .zb-calendar-header, .zb-workspace .zb-calendar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35em;
}
.zb-workspace .zb-calendar-title { text-align: center; font-weight: 600; }
.zb-workspace .zb-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.12em;
  margin: 0.28em 0;
  font-variant-numeric: tabular-nums;
}
.zb-workspace .zb-calendar-weekday { color: var(--zb-muted); text-align: center; }
.zb-workspace .zb-calendar-day { padding-inline: 0.1em; border-color: transparent; background: transparent; }
.zb-workspace .zb-calendar-day[aria-current='date'] { border-color: var(--zb-border); }
.zb-workspace .zb-calendar-day[aria-pressed='true'] { border-color: var(--zb-accent); }
.zb-workspace .zb-empty { color: var(--zb-muted); padding: 0.7rem; }
.zb-workspace .zb-table-status {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  color: var(--zb-muted);
  font-variant-numeric: tabular-nums;
}

.zb-workspace[data-appearance='terminal'] {
  --zb-bg: light-dark(#f8fafc, #10151e);
  --zb-surface: light-dark(#fff, #19212e);
  --zb-text: light-dark(#142033, #f1f5f9);
  --zb-muted: light-dark(#475569, #b7c5d8);
  --zb-border: light-dark(#cbd5e1, #46556b);
  --zb-accent: light-dark(#174e9e, #a9cdff);
  --zb-selected: light-dark(#e1ecff, #253e60);
}
.zb-workspace[data-appearance='terminal'] :is(
  button, input, select, textarea,
  .zb-pane, .zb-warning, .zb-bulk, .zb-table-wrap, .zb-editor
) {
  border-radius: 0;
}
.zb-workspace[data-appearance='terminal'][data-compact-search] .zb-search { border-radius: 0; }
.zb-workspace[data-appearance='terminal'] :where(
  .zb-table-status, .zb-status, .zb-cell-date, .zb-cell-monospace,
  .zb-cell-number, .zb-cell-number > button
) {
  font-family: ui-monospace, monospace;
}
.zb-workspace[data-appearance='terminal'] td {
  border-block-end-color: color-mix(in srgb, var(--zb-border) 72%, var(--zb-bg));
}

.zb-workspace[data-appearance='modern'] {
  padding-inline: 1rem;
  gap: 0.7rem;
}
.zb-workspace[data-appearance='modern'] :where(.zb-top, .zb-toolbar, .zb-tabs) {
  column-gap: 0.7rem;
}
.zb-workspace[data-appearance='modern'] :where(
  button:not(.zb-sync-badge), input:not([type='checkbox']), select, textarea,
  .zb-warning, .zb-bulk
) {
  border-radius: 0.55rem;
}
.zb-workspace[data-appearance='modern'] :where(.zb-pane, .zb-table-wrap, .zb-editor),
.zb-workspace[data-appearance='modern'][data-compact-search] .zb-search {
  border-radius: 0.75rem;
}
`;

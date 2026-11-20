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
.zb-workspace :is(button, input:not([type='checkbox']), select, textarea) {
  background: var(--zb-surface);
  border: 1px solid var(--zb-border);
  border-radius: 0.3rem;
  padding: 0.26rem 0.55rem;
  min-height: 1.9rem;
  max-width: 100%;
}
.zb-workspace button, .zb-workspace summary, .zb-workspace input[type='checkbox'] { cursor: pointer; }
.zb-workspace :is(button, input, select, textarea):disabled { cursor: default; opacity: 0.6; }
.zb-workspace :is(button, summary, [role='tab']):hover:not(:disabled) { background: var(--zb-selected); }
.zb-workspace :focus-visible { outline: 2px solid var(--zb-accent); outline-offset: 1px; }
.zb-workspace .zb-bar, .zb-workspace .zb-line, .zb-workspace .zb-tabs,
.zb-workspace .zb-options, .zb-workspace .zb-pagination {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.55rem;
}
.zb-workspace .zb-tabs { flex: 1 1 auto; min-width: 0; }
.zb-workspace .zb-tablist { display: flex; gap: 0.25rem; max-width: 100%; overflow-x: auto; padding: 3px; }
.zb-workspace .zb-tablist button { white-space: nowrap; }
.zb-workspace :is([aria-selected='true'], [aria-pressed='true']) { color: var(--zb-accent); border-color: var(--zb-accent); background: var(--zb-selected); }
.zb-workspace .zb-view-actions { flex-shrink: 0; }
.zb-workspace .zb-popout { margin-inline-start: auto; }
.zb-workspace .zb-panel { display: flex; flex-direction: column; gap: 0.55rem; flex: 1; min-height: 0; }
.zb-workspace .zb-toolbar { align-items: flex-start; }
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
.zb-workspace .zb-status { color: var(--zb-muted); }
.zb-workspace .zb-status[data-error='true'], .zb-workspace .zb-danger { color: var(--zb-danger); }
.zb-workspace .zb-table-wrap {
  flex: 1;
  min-height: 3rem;
  overflow: auto;
  border: 1px solid var(--zb-border);
  border-radius: 0.35rem;
  background: var(--zb-surface);
}
.zb-workspace table { border-spacing: 0; width: 100%; }
.zb-workspace th, .zb-workspace td { text-align: start; padding: 0.22rem 0.5rem; border-block-end: 1px solid var(--zb-border); vertical-align: top; }
.zb-workspace th { white-space: nowrap; position: sticky; inset-block-start: 0; z-index: 1; background: var(--zb-bg); }
.zb-workspace tbody tr:hover, .zb-workspace tbody tr:focus-visible { background: var(--zb-selected); }
.zb-workspace tbody tr:focus-visible { outline-offset: -2px; }
.zb-workspace .zb-cell-button {
  background: transparent;
  border-color: transparent;
  padding: 0.15rem 0.24rem;
  min-height: 1.6rem;
  text-align: start;
  max-width: min(34rem, 60vw);
  overflow-wrap: anywhere;
}
.zb-workspace .zb-item-title { color: var(--zb-accent); min-width: 9rem; }
.zb-workspace .zb-editor { border: 1px solid var(--zb-border); border-radius: 0.35rem; background: var(--zb-surface); padding: 0.38rem; min-width: 12rem; max-width: 30rem; }
.zb-workspace .zb-editor .zb-line + .zb-line { margin-block-start: 0.35rem; }
.zb-workspace .zb-editor .zb-options { max-height: 9rem; overflow: auto; }
.zb-workspace .zb-empty { color: var(--zb-muted); padding: 0.7rem; }
.zb-workspace .zb-pagination { justify-content: flex-end; }
.zb-workspace .zb-page-count { margin-inline-end: auto; color: var(--zb-muted); }
`;

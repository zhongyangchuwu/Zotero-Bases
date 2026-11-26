export const boardCSS = String.raw`
.zb-workspace .zb-board {
  display: flex;
  flex: 1;
  align-items: stretch;
  gap: 0.65em;
  min-width: 0;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.2em 0.25em 0.35em;
}
.zb-workspace .zb-board-message {
  display: grid;
  place-content: center;
  justify-items: center;
  flex: 1;
  gap: 0.6em;
  padding: 1em;
  color: var(--zb-muted);
  text-align: center;
}
.zb-workspace .zb-board-message-text { margin: 0; }
.zb-workspace .zb-board-lane {
  display: flex;
  flex: 0 0 18.5em;
  flex-direction: column;
  min-width: 0;
  max-width: calc(100% - 0.5em);
  border: 1px solid var(--zb-border);
  border-radius: 0.48em;
  background: color-mix(in srgb, var(--zb-bg) 86%, var(--zb-surface));
}
.zb-workspace .zb-board-lane[data-collapsed] { flex-basis: 2.6em; }
.zb-workspace .zb-board-lane[data-drop-target] {
  background: var(--zb-selected);
  border-color: var(--zb-accent);
  box-shadow: inset 0 0 0 1px var(--zb-accent);
}
.zb-workspace .zb-board-lane .zb-board-lane-toggle {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.45em;
  min-width: 0;
  margin: 0.2em;
  padding: 0.25em 0.45em;
  border-color: transparent;
  background: transparent;
  font-weight: 600;
  text-align: start;
}
.zb-workspace .zb-board-lane-toggle:hover:not(:disabled),
.zb-workspace [data-drop-target] > .zb-board-lane-toggle { background: var(--zb-selected); }
.zb-workspace [data-collapsed] > .zb-board-lane-toggle {
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding-block-start: 0.4em;
}
.zb-workspace .zb-board-lane-label {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zb-workspace [data-collapsed] .zb-board-lane-label { writing-mode: vertical-rl; }
.zb-workspace .zb-board-lane-mark {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 0.42em;
  height: 0.42em;
  border-radius: 50%;
  color: var(--zb-choice-tone, var(--zb-muted));
  background: currentColor;
}
.zb-workspace .zb-board-lane-mark[data-rating-lane] {
  width: 1em;
  height: 1em;
  background: none;
}
.zb-workspace .zb-board-lane-mark[data-rating-lane] .zb-field-icon {
  color: inherit;
  fill: currentColor;
}
.zb-workspace .zb-board-lane-count {
  flex: none;
  padding-inline: 0.4em;
  border-radius: 1em;
  background: var(--zb-pill-bg);
  color: var(--zb-muted);
  font-size: 0.84em;
  font-variant-numeric: tabular-nums;
}
.zb-workspace .zb-board-lane-chevron { margin-inline-start: auto; color: var(--zb-muted); }
.zb-workspace [data-collapsed] .zb-board-lane-chevron { margin-inline-start: 0; }
.zb-workspace .zb-board-lane-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior-block: contain;
  padding: 0.3em 0.45em 0.5em;
}
.zb-workspace .zb-board-cards { display: grid; gap: 0.45em; }
.zb-workspace .zb-board-card {
  min-width: 0;
  padding: 0.5em 0.55em;
  border: 1px solid var(--zb-border);
  border-radius: 0.42em;
  background: var(--zb-surface);
}
.zb-workspace .zb-board-card[data-read-only] { border-inline-start-style: dashed; }
.zb-workspace .zb-board-card[data-pending] { cursor: progress; }
.zb-workspace .zb-board-card[data-dragging] { opacity: 0.55; }
.zb-workspace .zb-board-lane-empty { margin: 0.35em 0; color: var(--zb-muted); }
.zb-workspace .zb-board-lane-tail { height: 1px; }
`;

export const boardCSS = String.raw`
.zb-workspace .zb-board {
  display: flex;
  flex: 1;
  align-items: flex-start;
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
  --zb-lane-tone: var(--zb-choice-tone, var(--zb-muted));
  display: flex;
  flex: 0 0 18.5em;
  flex-direction: column;
  min-width: 0;
  max-width: calc(100% - 0.5em);
  max-block-size: 100%;
  border-radius: 0.55em;
  background: light-dark(
    color-mix(in srgb, var(--zb-lane-tone) 6%, transparent),
    color-mix(in srgb, var(--zb-lane-tone) 10%, transparent)
  );
}
.zb-workspace .zb-board-lane[data-collapsed] {
  flex-basis: 2.6em;
  /* Gecko's intrinsic button height can omit the vertical label. */
  block-size: 9em;
}
.zb-workspace .zb-board-lane[data-drop-target] {
  background: color-mix(in srgb, var(--zb-accent) 16%, var(--zb-bg));
  box-shadow: inset 0 0 0 2px var(--zb-accent);
}
.zb-workspace .zb-board-lane .zb-board-lane-toggle {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.4em;
  min-width: 0;
  margin: 0.2em;
  padding: 0.2em 0.35em;
  border-color: transparent;
  background: transparent;
  font-weight: 500;
  text-align: start;
}
.zb-workspace .zb-board-lane .zb-board-lane-toggle:hover:not(:disabled),
.zb-workspace .zb-board-lane[data-drop-target] > .zb-board-lane-toggle {
  background: color-mix(in srgb, var(--zb-lane-tone) 8%, transparent);
}
.zb-workspace .zb-board-lane[data-collapsed] > .zb-board-lane-toggle {
  display: grid;
  flex: 1 1 0;
  min-block-size: 0;
  grid-template-rows: minmax(0, 1fr) auto auto;
  align-items: stretch;
  justify-items: center;
  padding: 0.35em 0.15em;
}
.zb-workspace .zb-board-lane-chip {
  display: flex;
  align-items: center;
  gap: 0.35em;
  min-width: 0;
  padding: 0.03em 0.4em;
  border-radius: 4px;
  background: color-mix(in srgb, var(--zb-lane-tone) 14%, transparent);
}
.zb-workspace [data-collapsed] .zb-board-lane-chip {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-block-size: 0;
  align-items: stretch;
  justify-items: center;
  padding: 0.35em 0.06em;
}
.zb-workspace .zb-board-lane-label {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zb-workspace [data-collapsed] .zb-board-lane-label {
  grid-row: 2;
  writing-mode: vertical-rl;
}
.zb-workspace .zb-board-lane-mark {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 4px;
  height: 4px;
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
  color: var(--zb-muted);
  font-size: 0.84em;
  font-variant-numeric: tabular-nums;
}
.zb-workspace .zb-board-lane-chevron { margin-inline-start: auto; color: var(--zb-muted); }
.zb-workspace [data-collapsed] .zb-board-lane-chevron { margin-inline-start: 0; }
.zb-workspace .zb-board-lane-scroll {
  flex: 0 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior-block: contain;
  padding: 0.3em 0.45em 0.5em;
}
.zb-workspace .zb-board-cards { display: grid; gap: 0.4em; }
.zb-workspace .zb-board-card {
  --zb-choice-tone: initial;
  min-width: 0;
  padding: 0.4em 0.55em;
  border: 1px solid light-dark(rgb(0 0 0 / 8%), rgb(255 255 255 / 8%));
  border-radius: 0.42em;
  background: light-dark(#fff, color-mix(in srgb, var(--zb-bg) 91%, var(--zb-text)));
  box-shadow: 0 1px 2px light-dark(rgb(0 0 0 / 7%), rgb(0 0 0 / 22%));
}
.zb-workspace .zb-board-card[data-read-only] { border-inline-start-style: dashed; }
.zb-workspace .zb-board-card[data-pending] { cursor: progress; }
.zb-workspace .zb-board-card[data-dragging] { opacity: 0.55; }
.zb-workspace .zb-board-lane-empty {
  display: grid;
  place-items: center;
  min-block-size: 2.4em;
  margin: 0;
  padding: 0.2em 0.3em;
  border: 1px dashed color-mix(in srgb, var(--zb-lane-tone) 37%, transparent);
  border-radius: 4px;
  color: var(--zb-muted);
  font-size: 0.88em;
  text-align: center;
}
.zb-workspace .zb-board-lane-tail { height: 1px; }
`;

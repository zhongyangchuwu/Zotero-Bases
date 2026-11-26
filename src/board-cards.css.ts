export const boardCardsCSS = String.raw`
.zb-workspace .zb-board-card-title {
  margin: 0;
  font: inherit;
  font-weight: 600;
  overflow: hidden;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.zb-workspace .zb-board-card-fields {
  display: grid;
  gap: 0.28em;
  margin: 0.45em 0;
}
.zb-workspace .zb-board-card-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  align-items: first baseline;
  gap: 0.5em;
}
.zb-workspace .zb-board-card-label {
  color: var(--zb-muted);
  overflow-wrap: anywhere;
}
.zb-workspace .zb-board-card-value {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.zb-workspace .zb-board-card-value.zb-cell-number { text-align: start; }
.zb-workspace .zb-board-card-value .zb-cell-pills { flex-wrap: wrap; }
.zb-workspace .zb-board-card-value[data-column='tags'] .zb-cell-pill::before,
.zb-workspace .zb-board-card-value .zb-cell-pill[data-tone]::before {
  content: '';
  display: inline-block;
  inline-size: 4px;
  block-size: 4px;
  border-radius: 50%;
  margin-inline-end: 0.35em;
  vertical-align: middle;
  background: var(--zb-native-tag-color, var(--zb-choice-tone, var(--zb-muted)));
}
.zb-workspace .zb-board-card-value .zb-rating { opacity: 1; }
.zb-workspace .zb-board-card-value .zb-link-open {
  max-inline-size: 100%;
  white-space: nowrap;
}
.zb-workspace .zb-board-card-value[data-column='doi']:has(.zb-link-copy) {
  display: flex;
  align-items: center;
  gap: 0.2em;
}
.zb-workspace .zb-board-card-value .zb-link-copy {
  position: static;
  flex: none;
  transform: none;
  box-shadow: none;
  opacity: 1;
  pointer-events: auto;
}
.zb-workspace .zb-board-card-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35em;
  margin-block-start: 0.45em;
}
.zb-workspace .zb-board-card :is(.zb-board-card-pdf, .zb-board-card-locate) {
  min-height: 1.65em;
  padding-block: 0.1em;
  font-size: 0.9em;
}
.zb-workspace .zb-board-card-pdf {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  color: light-dark(#a52020, #ffa3a3);
}
`;

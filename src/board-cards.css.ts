export const boardCardsCSS = String.raw`
.zb-workspace .zb-board-card-content {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.22em;
  line-height: 1.3;
}
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
.zb-workspace .zb-board-card-byline {
  display: flex;
  align-items: baseline;
  gap: 0.28em;
  color: var(--zb-muted);
  font-size: 0.92em;
}
.zb-workspace .zb-board-card-byline > :is([data-column='year'], .zb-board-card-byline-dot) {
  flex: none;
}
.zb-workspace .zb-board-card-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.18em 0.55em;
  max-block-size: 7em;
  overflow: auto;
  color: var(--zb-muted);
  font-size: 0.92em;
}
.zb-workspace .zb-board-card-fields:empty { display: none; }
.zb-workspace .zb-board-card-value {
  display: block;
  min-inline-size: 0;
  max-inline-size: 100%;
  white-space: nowrap;
}
.zb-workspace .zb-board-card-value:not(:has(button)) {
  overflow: hidden;
  text-overflow: ellipsis;
}
.zb-workspace .zb-board-card-value.zb-cell-number { text-align: start; }
.zb-workspace .zb-board-card-value .zb-cell-pills {
  inline-size: auto;
  flex-wrap: nowrap;
}
.zb-workspace .zb-board-card-value .zb-cell-pill:not(.zb-cell-pill-more) {
  min-inline-size: 0;
  flex: 0 1 auto;
}
.zb-workspace .zb-board-card-value[data-column='tags'] .zb-cell-pill:not(.zb-cell-pill-more)::before,
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
.zb-workspace .zb-board-card-value .zb-link-open { max-inline-size: 100%; }
.zb-workspace .zb-board-card-value .zb-rating-star:focus-visible,
.zb-workspace .zb-board-card-value .zb-board-card-pdf:focus-visible { outline-offset: -1px; }
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
.zb-workspace .zb-board-card-content :is(.zb-board-card-pdf, .zb-board-card-locate) {
  display: inline-grid;
  place-items: center;
  inline-size: 1.6em;
  block-size: 1.5em;
  min-height: 0;
  padding: 0;
  line-height: 1;
  border-color: transparent;
}
.zb-workspace .zb-board-card-content .zb-board-card-pdf {
  vertical-align: middle;
  color: light-dark(#a52020, #ffa3a3);
  background: transparent;
}
.zb-workspace .zb-board-card-content .zb-board-card-locate {
  position: absolute;
  z-index: 1;
  inset-block-start: 0;
  inset-inline-end: 0;
  inline-size: auto;
  padding-inline: 0.38em;
  font-size: 0.86em;
  background: var(--zb-surface);
  color: var(--zb-muted);
  opacity: 0;
  pointer-events: none;
}
.zb-workspace .zb-board-card-content :is(.zb-board-card-pdf, .zb-board-card-locate):hover {
  background: var(--zb-selected);
}
.zb-workspace .zb-board-card-rating-name { display: none; }
.zb-workspace .zb-board-card-rating-tray {
  position: absolute;
  z-index: 1;
  inset-block-start: 1.65em;
  inset-inline-end: 0;
  inline-size: max-content;
  max-inline-size: min(100%, 13em);
  max-block-size: 0;
  overflow: clip;
  background: var(--zb-surface);
  opacity: 0;
  pointer-events: none;
}
.zb-workspace .zb-board-card-rating-tray:empty { display: none; }
.zb-workspace .zb-board-card:is(:hover, :focus-within) > .zb-board-card-content
  > :is(.zb-board-card-locate, .zb-board-card-rating-tray) {
  opacity: 1;
  pointer-events: auto;
}
.zb-workspace .zb-board-card:is(:hover, :focus-within) .zb-board-card-rating-tray:not(:empty) {
  max-block-size: min(12em, 35vh);
  overflow: auto;
  padding: 0.22em 0.35em;
  border: 1px solid var(--zb-border);
  border-radius: 0.3rem;
  box-shadow: 0 2px 5px rgb(0 0 0 / 16%);
}
.zb-workspace .zb-board-card-rating-tray .zb-board-card-value {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.45em;
}
.zb-workspace .zb-board-card-rating-tray .zb-board-card-rating-name {
  display: block;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--zb-muted);
  font-size: 0.9em;
}
.zb-workspace .zb-board-card-rating-tray > :only-child .zb-board-card-rating-name {
  display: none;
}
.zb-workspace .zb-board-card-rating-tray .zb-rating {
  flex: none;
  opacity: 1;
}
`;

export const popoverCSS = String.raw`
.zb-workspace > .zb-popover {
  position: fixed;
  inset: auto;
  left: var(--zb-popover-left, 0px);
  top: var(--zb-popover-top, 0px);
  visibility: var(--zb-popover-visibility, hidden);
  width: max-content;
  min-width: 0;
  max-width: var(--zb-popover-max-width, 100%);
  min-height: 0;
  max-height: var(--zb-popover-max-height, none);
  margin: 0;
  padding: 0.5rem;
  overflow: auto;
  overscroll-behavior: contain;
  color: inherit;
  background: var(--zb-surface);
  border: 1px solid var(--zb-border);
  border-radius: 0.5rem;
  box-shadow: var(--zb-floating-shadow);
  z-index: 10;
}
`;

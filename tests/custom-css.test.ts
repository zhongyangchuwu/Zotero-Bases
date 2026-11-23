// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { scopeCustomCSS } from '../src/custom-css';

function install(source: string): CSSRule[] {
  const style = document.createElement('style');
  style.textContent = scopeCustomCSS(source, document);
  style.dataset.customCssTest = '';
  document.head.append(style);
  return Array.from(style.sheet!.cssRules);
}

afterEach(() => {
  document.querySelector('[data-custom-css-test]')?.remove();
  document.body.replaceChildren();
});

describe('workspace custom CSS', () => {
  it('styles the workspace root and cells without styling matching elements outside it', () => {
    document.body.innerHTML = `
      <section class="zb-workspace">
        <table><tr><td id="inside">Inside</td></tr></table>
      </section>
      <button id="menu">Menu</button>
      <table><tr><td id="outside">Outside</td></tr></table>
    `;
    const computed = (selector: string) => getComputedStyle(document.querySelector(selector)!);
    const outside = ['html', 'body', '#outside', '#menu'];
    const backgrounds = outside.map((selector) => computed(selector).backgroundColor);
    install(`
      .zb-workspace { --zb-accent: #2357ae; }
      td { background-color: rgb(20, 30, 40); }
      html, body, .zb-workspace + #menu { background-color: rgb(100, 0, 0); }
    `);

    expect(computed('.zb-workspace').getPropertyValue('--zb-accent')).toBe('#2357ae');
    expect(computed('#inside').backgroundColor).toBe('rgb(20, 30, 40)');
    expect(outside.map((selector) => computed(selector).backgroundColor)).toEqual(backgrounds);
  });

  it('keeps theme media rules and scopes selectors in their lists', () => {
    document.body.innerHTML = `
      <section class="zb-workspace"><button class="control">Inside</button></section>
      <button class="control">Outside</button>
    `;
    const [rule] = install(`
      @media (prefers-color-scheme: dark) {
        body, .control { background-color: #535d6a; }
      }
    `);

    const media = rule as CSSMediaRule;
    expect(media.media.mediaText).toBe('(prefers-color-scheme: dark)');
    const style = media.cssRules[0] as CSSStyleRule;
    expect(style.style.getPropertyValue('background-color')).toBe('#535d6a');
    const matching = document.querySelectorAll(style.selectorText);
    expect(Array.from(matching, (node) => node.textContent)).toEqual(['Inside']);
  });

  it('does not turn a forged wrapper close into a global rule', () => {
    const scoped = scopeCustomCSS(
      'td { color: navy; } } body { position: fixed; } @media all {',
      document,
    );
    expect(scoped).not.toContain('position');
    expect(scopeCustomCSS('} body { display: none; } /*', document)).toBe('');
  });

  it('preserves benign comments and strings containing CSS-like delimiters', () => {
    const [rule] = install(`
      /* } body { display: none; } */
      .zb-workspace { --zb-caption: "} body { display: none; } /*"; }
    `);
    expect((rule as CSSStyleRule).style.getPropertyValue('--zb-caption')).toBe(
      '"} body { display: none; } /*"',
    );
    expect(getComputedStyle(document.body).display).not.toBe('none');
  });

  it.each([
    '@import "https://example.invalid/rules.css";',
    '@font-face { font-family: Global; src: local("Global"); }',
    '@property --example { syntax: "<color>"; initial-value: red; inherits: true; }',
    '@keyframes global { from { opacity: 0; } to { opacity: 1; } }',
    '@media (prefers-color-scheme: dark) { @font-face { font-family: Global; src: local("Global"); } }',
  ])('does not emit a global rule: %s', (source) => {
    expect(scopeCustomCSS(source, document)).toBe('');
  });
});

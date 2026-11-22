const WORKSPACE_SUBJECT = ':is(.zb-workspace, .zb-workspace *)';

export function scopeCustomCSS(source: string, document: Document): string {
  const window = document.defaultView;
  if (!window || !source.trim()) return '';
  const { CSSRule, CSSStyleSheet } = window;
  const sheet = new CSSStyleSheet();
  try {
    // insertRule parses exactly one rule. Never put the author's stylesheet in the live document.
    sheet.insertRule(`@media all {\n${source}\n}`, 0);
  } catch {
    return '';
  }
  const wrapper = sheet.cssRules[0];
  if (wrapper?.type !== CSSRule.MEDIA_RULE) return '';
  return serialize((wrapper as CSSMediaRule).cssRules);

  function serialize(rules: CSSRuleList): string {
    const result: string[] = [];
    for (const rule of rules) {
      switch (rule.type) {
        case CSSRule.STYLE_RULE: {
          const { selectorText, style } = rule as CSSStyleRule;
          if (!style.length || selectorText.startsWith('@')) break;
          // Constrain the subject, not the first selector in a complex selector or list.
          // :is() accepts element selectors only, so pseudo-elements cannot escape via this rule.
          result.push(`${WORKSPACE_SUBJECT}:is(${selectorText}) { ${style.cssText} }`);
          break;
        }
        case CSSRule.MEDIA_RULE: {
          const { media, cssRules } = rule as CSSMediaRule;
          const body = serialize(cssRules);
          if (body) result.push(`@media ${media.mediaText} {\n${body}\n}`);
          break;
        }
        case CSSRule.SUPPORTS_RULE: {
          const { conditionText, cssRules } = rule as CSSSupportsRule;
          const body = serialize(cssRules);
          if (body) result.push(`@supports ${conditionText} {\n${body}\n}`);
          break;
        }
      }
    }
    return result.join('\n');
  }
}

import type { OptionColorKey, Row, TagColorRule } from './contracts';

export function resolveTagColors(rules: readonly TagColorRule[] = []) {
  const exact = new Map<string, OptionColorKey>();
  const prefixes: TagColorRule[] = [];
  for (const rule of rules) {
    if (rule.kind === 'tag') exact.set(rule.name, rule.color);
    else prefixes.push(rule);
  }
  prefixes.sort((left, right) => right.name.length - left.name.length);
  return (row: Row, label: string): { native?: string; tone?: OptionColorKey } | undefined => {
    const name = label.normalize();
    const native = row.nativeTagColors?.get(name);
    if (native) return { native };
    const tone = exact.get(name) ?? prefixes.find((rule) => name.startsWith(rule.name))?.color;
    return tone ? { tone } : undefined;
  };
}

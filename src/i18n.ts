export type Language = 'en' | 'zh-CN';

type Catalog = Readonly<Record<string, readonly [string, string]>>;

export function messages<T extends Catalog>(catalog: T, language: Language) {
  const index = language === 'zh-CN' ? 1 : 0;
  return (key: keyof T): string => catalog[key]![index];
}

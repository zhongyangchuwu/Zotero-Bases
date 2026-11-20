export type PropertyType = 'text' | 'number' | 'checkbox' | 'single-select' | 'multi-select';
export type PropertyValue = string | boolean | readonly string[] | null;

export interface Property {
  readonly key: string;
  readonly type: PropertyType;
  readonly options?: readonly string[];
}

export const NATIVE_COLUMNS = [
  'title',
  'creators',
  'year',
  'source',
  'type',
  'tags',
  'pdf',
  'added',
] as const;
export type NativeColumn = (typeof NATIVE_COLUMNS)[number];
export type Column = NativeColumn | `property:${string}`;
export type Direction = 'asc' | 'desc';
export type Operator =
  | 'contains'
  | 'equals'
  | 'gte'
  | 'lte'
  | 'has'
  | 'missing'
  | 'before'
  | 'after';

export interface Filter {
  readonly column: Column;
  readonly operator: Operator;
  readonly value: string;
}

export type Grouping =
  | { readonly column: 'year' | 'type' | `property:${string}`; readonly direction: Direction }
  | { readonly column: 'tags'; readonly tag: string; readonly direction: Direction };

export interface View {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly columns: readonly Column[];
  readonly sort: { readonly column: Column; readonly direction: Direction };
  readonly filters: readonly Filter[];
  readonly group?: Grouping;
}

export interface Scope {
  readonly id: string;
  readonly label: string;
}

export interface Row {
  readonly id: number;
  readonly writable: boolean;
  readonly title: string;
  readonly creators: string;
  readonly year: string;
  readonly source: string;
  readonly type: string;
  readonly tags: readonly string[];
  readonly pdf: boolean;
  readonly added: string;
  readonly extra: string;
}

export interface Catalog {
  readonly rows: readonly Row[];
  readonly tags: ReadonlySet<string>;
}

export interface Preferences {
  readonly properties: readonly Property[];
  readonly views: readonly View[];
  readonly active: string;
}

export type ConfigChange =
  | { readonly kind: 'views'; readonly views: readonly View[]; readonly active: string }
  | { readonly kind: 'define'; readonly property: Property }
  | {
      readonly kind: 'rename-option';
      readonly key: string;
      readonly previous: string;
      readonly next: string;
    }
  | {
      readonly kind: 'delete-option';
      readonly key: string;
      readonly option: string;
      readonly clean: boolean;
    }
  | { readonly kind: 'delete-property'; readonly key: string; readonly clean: boolean };

export interface MutationResult {
  readonly changed: number;
  readonly skipped: number;
}

export type BulkChange =
  | { readonly kind: 'property'; readonly key: string; readonly value: PropertyValue }
  | { readonly kind: 'tag'; readonly tag: string; readonly add: boolean };

export type BulkResult = MutationResult & { readonly readOnly: number };

/** All DOM is created in the owning document; raw Zotero objects remain in the host. */
export interface WorkspaceHost {
  settings(): Preferences;
  change(change: ConfigChange): Promise<MutationResult>;
  scopes(): readonly Scope[];
  initialScope(): string;
  load(scope: string): Promise<Catalog>;
  setProperty(id: number, key: string, value: PropertyValue): Promise<void>;
  changeTag(id: number, tag: string, add: boolean): Promise<void>;
  bulk(ids: readonly number[], change: BulkChange): Promise<BulkResult>;
  suggestPropertyKey(key: string, existing: readonly Property[]): string | undefined;
  openItem(id: number, pdf: boolean): Promise<void>;
  subscribe(listener: (kind: 'data' | 'settings') => void): () => void;
}

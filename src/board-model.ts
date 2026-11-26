import {
  isNativeColumn,
  type BoardSettings,
  type Column,
  type Property,
  type Row,
} from './contracts';
import { readProperty } from './extra';

export interface BoardLane {
  readonly id: string;
  readonly value: string | null;
  readonly rows: readonly Row[];
  readonly collapsed: boolean;
  readonly writable: boolean;
}

const RATING_LANES = ['5', '4', '3', '2', '1'] as const;

function isLaneProperty(property: Property): boolean {
  return property.type === 'single-select' || property.type === 'rating';
}

export function laneProperties(properties: readonly Property[]): readonly Property[] {
  return properties.filter(isLaneProperty);
}

export function boardLaneProperty(
  settings: BoardSettings | undefined,
  properties: readonly Property[],
): Property | undefined {
  const key = settings?.laneField?.slice('property:'.length);
  let first: Property | undefined;
  for (const property of properties) {
    if (!isLaneProperty(property)) continue;
    if (key === property.key) return property;
    first ??= property;
  }
  return first;
}

function defaultCardFields(properties: readonly Property[]): readonly Column[] {
  const rating = properties.find((property) => property.type === 'rating');
  return rating
    ? ['creators', 'year', `property:${rating.key}`, 'tags', 'pdf']
    : ['creators', 'year', 'tags', 'pdf'];
}

export function defaultBoardSettings(properties: readonly Property[]): BoardSettings {
  const lane = properties.find(isLaneProperty);
  return {
    ...(lane && { laneField: `property:${lane.key}` as const }),
    cardFields: defaultCardFields(properties),
    hideEmptyLanes: false,
    collapsedLanes: [],
  };
}

export function boardCardFields(
  settings: BoardSettings | undefined,
  properties: readonly Property[],
): readonly Column[] {
  const lane = boardLaneProperty(settings, properties);
  return (settings?.cardFields ?? defaultCardFields(properties)).filter((field) => {
    if (field === 'title') return false;
    if (isNativeColumn(field)) return true;
    const key = field.slice('property:'.length);
    return key !== lane?.key && properties.some((property) => property.key === key);
  });
}

export function boardLanes(
  rows: readonly Row[],
  property: Property,
  settings: BoardSettings,
): readonly BoardLane[] {
  const collapsed = new Set(settings.collapsedLanes);
  const lanes = new Map<string | null, BoardLane & { rows: Row[] }>();
  const addLane = (value: string | null, writable: boolean) => {
    // The literal option "null" must not share the unset lane's persisted ID.
    const id = JSON.stringify(value);
    const rows: Row[] = [];
    const lane = { id, value, rows, collapsed: collapsed.has(id), writable };
    lanes.set(value, lane);
    return lane;
  };

  addLane(null, true);
  const options = property.type === 'rating' ? RATING_LANES : (property.options ?? []);
  for (const option of options) addLane(option, true);
  for (const row of rows) {
    const raw = readProperty(row.extra, property);
    const value = typeof raw === 'string' ? raw : null;
    const lane = lanes.get(value) ?? addLane(value, false);
    lane.rows.push(row);
  }

  const visible: BoardLane[] = [];
  for (const lane of lanes.values()) {
    if (!settings.hideEmptyLanes || lane.rows.length) visible.push(lane);
  }
  return visible;
}

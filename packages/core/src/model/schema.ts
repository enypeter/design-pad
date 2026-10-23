import { createDesignId } from './ids';
import type { DesignElement, DesignFile, PageRecord } from './types';

export const SCHEMA_VERSION = 1;

export class DesignFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignFormatError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Validate a design file and upgrade it to the current schema. Throws
 * DesignFormatError for input that is not a Design Pad design.
 */
export function migrateDesignFile(input: unknown): DesignFile {
  if (!isObject(input)) throw new DesignFormatError('Design must be an object');
  if (input.format !== 'design-pad')
    throw new DesignFormatError('Not a Design Pad design (format field)');
  const version = typeof input.schemaVersion === 'number' ? input.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new DesignFormatError(`Design was saved by a newer version (schema ${version})`);
  }
  if (!Array.isArray(input.pages) || !Array.isArray(input.elements)) {
    throw new DesignFormatError('Design is missing pages or elements');
  }
  const width = Number(input.width);
  const height = Number(input.height);
  if (!(width > 0) || !(height > 0)) throw new DesignFormatError('Design has an invalid size');

  const pages = (input.pages as unknown[]).filter(isObject) as unknown as PageRecord[];
  const pageIds = new Set(pages.map((p) => p.id));
  const elements = (input.elements as unknown[]).filter(isObject) as unknown as DesignElement[];
  const elementIds = new Set(elements.map((e) => e.id));
  // Drop orphans so a damaged file still opens.
  const valid = elements.filter(
    (e) => typeof e.id === 'string' && (pageIds.has(e.parentId) || elementIds.has(e.parentId)),
  );

  // Future migrations: if (version < 2) { ... }

  return {
    format: 'design-pad',
    schemaVersion: SCHEMA_VERSION,
    id: typeof input.id === 'string' && input.id ? input.id : createDesignId(),
    title: typeof input.title === 'string' ? input.title : 'Untitled design',
    width,
    height,
    unit: (['px', 'mm', 'cm', 'in'] as const).includes(input.unit as never)
      ? (input.unit as DesignFile['unit'])
      : 'px',
    dpi: typeof input.dpi === 'number' && input.dpi > 0 ? input.dpi : 96,
    pages: pages.map((p) => ({
      ...p,
      typeName: 'page' as const,
      notes: p.notes ?? '',
      title: p.title ?? '',
    })),
    elements: valid.map((e) => ({ ...e, typeName: 'element' as const })),
    assets: Array.isArray(input.assets)
      ? (input.assets as unknown[])
          .filter(isObject)
          .map(
            (a) =>
              ({ ...(a as object), typeName: 'asset' as const }) as DesignFile['assets'][number],
          )
      : [],
  };
}

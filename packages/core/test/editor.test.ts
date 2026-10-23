import { describe, expect, it } from 'vitest';
import { createShape, createText, migrateDesignFile } from '../src';
import { makeEditor } from './helpers';

describe('elements', () => {
  it('centres added elements on the page', () => {
    const editor = makeEditor({ width: 1000, height: 800 });
    const id = editor.addElement({ type: 'shape', width: 100, height: 100 });
    expect(editor.getElement(id)).toMatchObject({ x: 450, y: 350 });
    const id2 = editor.addElement(createShape({ width: 100, height: 100 }), { center: true });
    expect(editor.getElement(id2)).toMatchObject({ x: 450, y: 350 });
  });

  it('stacks new elements on top', () => {
    const editor = makeEditor();
    const a = editor.addElement(createShape());
    const b = editor.addElement(createShape());
    const order = editor.getChildren(editor.getCurrentPageId()).map((e) => e.id);
    expect(order).toEqual([a, b]);
  });

  it('duplicates with an offset and selects the copy', () => {
    const editor = makeEditor();
    const a = editor.addElement(createShape({ x: 10, y: 10 }));
    const [copy] = editor.duplicateElements([a]);
    expect(editor.getElement(copy!)).toMatchObject({ x: 30, y: 30 });
    expect(editor.getSelectedIds()).toEqual([copy]);
  });

  it('does not delete locked elements', () => {
    const editor = makeEditor();
    const a = editor.addElement(createShape({ locked: true }));
    editor.deleteElements([a]);
    expect(editor.getElement(a)).toBeDefined();
  });
});

describe('groups', () => {
  it('groups and ungroups preserving page positions', () => {
    const editor = makeEditor();
    const a = editor.addElement(createShape({ x: 100, y: 100, width: 50, height: 50 }));
    const b = editor.addElement(
      createShape({ x: 300, y: 200, width: 50, height: 50, rotation: 30 }),
    );
    const before = [a, b].map((id) => editor.getElementPageBounds(id));
    const g = editor.groupElements([a, b])!;
    expect(editor.getElement(a)!.parentId).toBe(g);
    expect(editor.getElementPageBounds(a)).toEqual(before[0]);

    // Rotate the group, then ungroup: children inherit the rotation.
    editor.updateElement(g, { rotation: 90 });
    const rotatedA = editor.getElementPageBounds(a);
    const ids = editor.ungroupElements(g);
    expect(ids.sort()).toEqual([a, b].sort());
    expect(editor.getElement(g)).toBeUndefined();
    const after = editor.getElementPageBounds(a);
    expect(after.x).toBeCloseTo(rotatedA.x);
    expect(after.y).toBeCloseTo(rotatedA.y);
    expect(editor.getElement(a)!.rotation).toBe(90);
  });

  it('hit-tests to the group unless focused', () => {
    const editor = makeEditor();
    const a = editor.addElement(createShape({ x: 0, y: 0, width: 50, height: 50 }));
    const b = editor.addElement(createShape({ x: 100, y: 0, width: 50, height: 50 }));
    const g = editor.groupElements([a, b])!;
    const page = editor.getCurrentPageId();
    expect(editor.hitTest(page, { x: 10, y: 10 })?.id).toBe(g);
    editor.focusGroup(g);
    expect(editor.hitTest(page, { x: 10, y: 10 })?.id).toBe(a);
    expect(editor.hitTest(page, { x: 75, y: 10 })).toBeNull();
  });

  it('scales group content uniformly', () => {
    const editor = makeEditor();
    const t = editor.addElement(
      createText({ text: 'Hi', x: 0, y: 0, width: 100, style: { fontSize: 20 } }),
    );
    const s = editor.addElement(createShape({ x: 200, y: 0, width: 50, height: 50 }));
    const g = editor.groupElements([t, s])!;
    const group = editor.getElement(g)!;
    editor.setElementBox(
      g,
      { ...group, width: group.width * 2, height: group.height * 2 },
      'scale',
    );
    expect(editor.getElement(t)).toMatchObject({ width: 200 });
    expect((editor.getElement(t) as { style: { fontSize: number } }).style.fontSize).toBe(40);
    expect(editor.getElement(s)!.x).toBe(400);
  });
});

describe('arrange', () => {
  it('reorders forward/backward/front/back', () => {
    const editor = makeEditor();
    const [a, b, c] = [0, 1, 2].map(() => editor.addElement(createShape()));
    const order = () => editor.getChildren(editor.getCurrentPageId()).map((e) => e.id);
    editor.reorderElements([a!], 'forward');
    expect(order()).toEqual([b, a, c]);
    editor.reorderElements([a!], 'front');
    expect(order()).toEqual([b, c, a]);
    editor.reorderElements([a!], 'back');
    expect(order()).toEqual([a, b, c]);
    editor.reorderElements([c!], 'backward');
    expect(order()).toEqual([a, c, b]);
  });

  it('aligns a single element to the page', () => {
    const editor = makeEditor({ width: 1000, height: 800 });
    const a = editor.addElement(createShape({ x: 10, y: 10, width: 100, height: 100 }));
    editor.alignElements([a], 'right');
    expect(editor.getElement(a)!.x).toBe(900);
    editor.alignElements([a], 'middle');
    expect(editor.getElement(a)!.y).toBe(350);
  });

  it('distributes horizontally', () => {
    const editor = makeEditor();
    const ids = [0, 50, 400].map((x) =>
      editor.addElement(createShape({ x, y: 0, width: 100, height: 10 })),
    );
    editor.distributeElements(ids, 'horizontal');
    expect(ids.map((id) => editor.getElement(id)!.x)).toEqual([0, 200, 400]);
  });

  it('flips a multi-selection within its bounds', () => {
    const editor = makeEditor();
    const a = editor.addElement(createShape({ x: 0, y: 0, width: 100, height: 100 }));
    const b = editor.addElement(createShape({ x: 300, y: 0, width: 100, height: 100 }));
    editor.flipElements([a, b], 'horizontal');
    expect(editor.getElement(a)!.x).toBe(300);
    expect(editor.getElement(b)!.x).toBe(0);
  });
});

describe('pages', () => {
  it('adds, duplicates, moves and deletes pages', () => {
    const editor = makeEditor();
    const first = editor.getPages()[0]!.id;
    editor.addElement(createShape());
    const dup = editor.duplicatePage(first)!;
    expect(editor.getChildren(dup.id)).toHaveLength(1);
    const added = editor.addPage({ after: first });
    expect(editor.getPages().map((p) => p.id)).toEqual([first, added.id, dup.id]);
    editor.movePage(first, 2);
    expect(editor.getPages().map((p) => p.id)).toEqual([added.id, dup.id, first]);
    editor.deletePage(dup.id);
    expect(editor.getPages()).toHaveLength(2);
  });

  it('clears instead of deleting the last page', () => {
    const editor = makeEditor();
    const page = editor.getPages()[0]!.id;
    editor.addElement(createShape());
    editor.deletePage(page);
    expect(editor.getPages()).toHaveLength(1);
    expect(editor.getChildren(page)).toHaveLength(0);
  });
});

describe('clipboard & serialization', () => {
  it('copies and pastes groups with new ids', () => {
    const editor = makeEditor();
    const a = editor.addElement(createShape({ x: 0, y: 0 }));
    const b = editor.addElement(createShape({ x: 200, y: 0 }));
    const g = editor.groupElements([a, b])!;
    const payload = editor.copy([g])!;
    const [pasted] = editor.paste(payload);
    expect(pasted).not.toBe(g);
    expect(editor.getChildren(pasted!)).toHaveLength(2);
    expect(editor.getElement(pasted!)!.x).toBe(editor.getElement(g)!.x + 20);
  });

  it('round-trips through JSON', () => {
    const editor = makeEditor();
    editor.addElement(createText({ text: 'Round trip' }));
    editor.addPage();
    const json = JSON.parse(JSON.stringify(editor.toJSON()));
    const other = makeEditor();
    other.load(json);
    expect(other.getPages()).toHaveLength(2);
    expect(other.toJSON().elements).toHaveLength(1);
    expect(other.canUndo()).toBe(false);
  });

  it('rejects foreign files and drops orphans', () => {
    expect(() => migrateDesignFile({ format: 'other' })).toThrow();
    const file = migrateDesignFile({
      format: 'design-pad',
      schemaVersion: 1,
      width: 100,
      height: 100,
      pages: [
        {
          id: 'p1',
          index: 'a0',
          background: { fill: { type: 'solid', color: '#fff' }, image: null },
        },
      ],
      elements: [{ id: 'e1', parentId: 'missing', type: 'shape' }],
      assets: [],
    });
    expect(file.elements).toHaveLength(0);
  });
});

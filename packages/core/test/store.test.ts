import { describe, expect, it } from 'vitest';
import { createShape, emptyDiff, invertDiff, recordPut, recordRemove, squashDiffs } from '../src';
import { makeEditor } from './helpers';

describe('diff', () => {
  it('squashes add then update into a single add', () => {
    const a = emptyDiff<{ id: string; v: number }>();
    recordPut(a, 'x', undefined, { id: 'x', v: 1 });
    const b = emptyDiff<{ id: string; v: number }>();
    recordPut(b, 'x', { id: 'x', v: 1 }, { id: 'x', v: 2 });
    const s = squashDiffs(a, b);
    expect(s.added.x).toEqual({ id: 'x', v: 2 });
    expect(Object.keys(s.updated)).toHaveLength(0);
  });

  it('squashes add then remove into nothing', () => {
    const a = emptyDiff<{ id: string }>();
    recordPut(a, 'x', undefined, { id: 'x' });
    const b = emptyDiff<{ id: string }>();
    recordRemove(b, 'x', { id: 'x' });
    const s = squashDiffs(a, b);
    expect(s).toEqual({ added: {}, updated: {}, removed: {} });
  });

  it('inverts updates', () => {
    const d = emptyDiff<{ id: string; v: number }>();
    recordPut(d, 'x', { id: 'x', v: 1 }, { id: 'x', v: 2 });
    expect(invertDiff(d).updated.x).toEqual([
      { id: 'x', v: 2 },
      { id: 'x', v: 1 },
    ]);
  });
});

describe('store transactions', () => {
  it('rolls back a failed transaction', () => {
    const editor = makeEditor();
    const before = editor.store.snapshot().length;
    expect(() =>
      editor.store.transact(() => {
        editor.createElements([createShape()]);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(editor.store.snapshot().length).toBe(before);
  });

  it('emits one diff per outer transaction', () => {
    const editor = makeEditor();
    let calls = 0;
    editor.store.listen(() => calls++);
    editor.batch(() => {
      editor.addElement(createShape());
      editor.addElement(createShape());
    });
    expect(calls).toBe(1);
  });
});

describe('history', () => {
  it('undoes and redoes element creation with selection', () => {
    const editor = makeEditor();
    const id = editor.addElement(createShape({ width: 50, height: 50 }));
    expect(editor.getSelectedIds()).toEqual([id]);
    editor.undo();
    expect(editor.getElement(id)).toBeUndefined();
    expect(editor.getSelectedIds()).toEqual([]);
    editor.redo();
    expect(editor.getElement(id)).toBeDefined();
    expect(editor.getSelectedIds()).toEqual([id]);
  });

  it('squashes an interaction into one undo step', () => {
    const editor = makeEditor();
    const id = editor.addElement(createShape({ x: 0, y: 0 }));
    editor.history.startInteraction();
    for (let i = 1; i <= 10; i++) editor.updateElement(id, { x: i * 10 });
    editor.history.endInteraction();
    expect(editor.getElement(id)!.x).toBe(100);
    editor.undo();
    expect(editor.getElement(id)!.x).toBe(0);
    editor.undo();
    expect(editor.getElement(id)).toBeUndefined();
  });

  it('cancels an interaction and restores state', () => {
    const editor = makeEditor();
    const id = editor.addElement(createShape({ x: 5, y: 5 }));
    editor.history.startInteraction();
    editor.updateElement(id, { x: 500 });
    editor.history.cancelInteraction();
    expect(editor.getElement(id)!.x).toBe(5);
  });

  it('does not record silent changes', () => {
    const editor = makeEditor();
    const id = editor.addElement(createShape());
    editor.silently(() => editor.updateElement(id, { opacity: 0.5 }));
    editor.undo();
    expect(editor.getElement(id)).toBeUndefined();
  });
});

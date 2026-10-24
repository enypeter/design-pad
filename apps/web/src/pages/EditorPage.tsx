import { type DesignFile, type Editor, pageThumbnail } from '@design-pad/core';
import { DesignPad } from '@design-pad/editor';
import '@design-pad/editor/styles.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { unsplashProvider } from '../photos/unsplash';
import { navigate } from '../router';
import { indexedDbAssets } from '../storage/assets';
import { loadDesign, saveDesign, saveThumbnail } from '../storage/designs';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

const photos = unsplashProvider(import.meta.env.VITE_UNSPLASH_ACCESS_KEY);

export function EditorPage({ id }: { id: string }) {
  const [file, setFile] = useState<DesignFile | null | undefined>(undefined);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const editorRef = useRef<Editor | null>(null);
  const thumbTimer = useRef(0);

  useEffect(() => {
    void loadDesign(id).then((entry) => setFile(entry?.file ?? null));
  }, [id]);

  useEffect(() => {
    if (file) document.title = `${file.title} – Design Pad`;
  }, [file]);

  const persist = useCallback(async (design: DesignFile, editor: Editor) => {
    setStatus('saving');
    try {
      await saveDesign(design);
      setStatus('saved');
      document.title = `${design.title} – Design Pad`;
      // Thumbnails are cheaper to refresh less often.
      window.clearTimeout(thumbTimer.current);
      thumbTimer.current = window.setTimeout(async () => {
        const first = editor.getPages()[0];
        if (first) await saveThumbnail(design.id, await pageThumbnail(editor, first.id, 480));
      }, 1500);
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }, []);

  // Save before leaving if a change is still pending.
  useEffect(() => {
    const onHide = () => {
      const editor = editorRef.current;
      if (editor && status === 'unsaved') void saveDesign(editor.toJSON());
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [status]);

  if (file === undefined) return <div className="app-loading">Loading…</div>;
  if (file === null) {
    return (
      <div className="app-missing">
        <h1>Design not found</h1>
        <p>It may have been deleted, or it was saved in another browser.</p>
        <button type="button" onClick={() => navigate('/')}>
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="app-editor">
      <DesignPad
        design={file}
        assets={indexedDbAssets}
        photos={photos}
        saveStatus={status}
        homeLabel="Home"
        onHome={async () => {
          const editor = editorRef.current;
          if (editor) await saveDesign(editor.toJSON());
          navigate('/');
        }}
        onReady={(editor) => {
          editorRef.current = editor;
          // Handy for debugging and end-to-end tests.
          if (import.meta.env.DEV)
            (window as unknown as { __designPad: Editor }).__designPad = editor;
          editor.events.on('change', ({ meta }) => {
            if (meta.source !== 'system') setStatus('unsaved');
          });
        }}
        onChange={(design, editor) => void persist(design, editor)}
        onSave={(design, editor) => persist(design, editor)}
      />
    </div>
  );
}

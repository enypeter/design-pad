# Roadmap

This is a proposal, not a commitment. Items marked **Decision** need a call from the product owner before work starts. Each one comes with a recommendation.

## Where v1 stands

Done: the editor (text, effects, shapes, frames, grids, photos, filters, drawing, pages, layers, resize), exports (PNG, JPG, WebP, raster PDF, ZIP, JSON), the local-first web app, and four ways to embed (React, `mountDesignPad`, iframe SDK, native WebViews).

It is tested by:
- unit tests for the engine;
- Playwright tests against a production build in Chromium;
- CI on every push.

[CANVA_STUDY.md](CANVA_STUDY.md) lists every gap against Canva.

## 1. Production-ready for a photography product

These come first because they block real customers.
1. **Print-grade PDF.** Add bleed and crop marks, and draw text as vectors (embedded, subset fonts) so print labs accept the files and text stays sharp. Today's PDFs are raster.
   - **Decision: colour.** Most print labs accept RGB PDFs. CMYK output needs ICC profile handling. Recommendation: stay RGB and add CMYK only when a named lab requires it.
2. **Backend and accounts.** Designs, assets and templates need a server once users work across devices.
   - **Decision: backend stack.** Option A is TypeScript (Node): it shares `DesignFile` types and `migrateDesignFile()` with the editor. Option B is Go: it fits a Go-first platform, but needs a JSON Schema for `DesignFile` validation, kept in sync with `core/src/model`.
   - Either way, assets go to S3 through presigned uploads, and `resolveUrl` hands out short-lived CloudFront or S3 signed URLs. `docs/EMBEDDING.md` already shows the adapter.
   - Recommendation: choose to match the rest of your platform. The editor does not care, because the contract is plain JSON plus the `AssetAdapter` and `TemplateProvider` interfaces.
3. **Server-side rendering for batch work.** Examples are print files for an album order, or thumbnails for a template library. The renderer uses the browser's Canvas 2D, so the dependable way to run it on a server is headless Chromium (Playwright) workers driving `exportDesign()`. A Node canvas port is possible later, but fonts and filters would need re-validating.
4. **Templates for photographers.** Albums, session announcements, price lists, testimonials, print layouts and social posts, served through `TemplateProvider`. Build them in the editor itself and export them as JSON.
5. **Language and font coverage.** Yoruba, Igbo and Hausa use letters such as ẹ, ọ, ṣ, ụ, ɓ, ɗ and ƙ, often with tone marks. Layout already works on grapheme clusters, but many display fonts lack these glyphs.
   - Missing glyphs currently fall back to the system sans-serif, which looks out of place in a serif or script design.
   - Show coverage in the font picker, and fall back to a matching font instead.
   - Right-to-left scripts (Arabic, Ajami) are not supported yet.
6. **Phone layout.** Use bottom-sheet panels and larger touch handles. Touch gestures already work; the layout is designed for tablet and desktop widths.
7. **Wider testing.** Add WebKit and Firefox to the Playwright projects, and add an accessibility check (axe) to the end-to-end suite.
8. **Release the packages.** Use semantic versions (changesets) and generate API docs from the TypeScript types.
   - **Decision: licence and registry.** Public npm with an open licence, or a private registry? The repository has no licence file yet. Choose before anyone outside the team uses it.

## 2. Closer to Canva

- Rename text effects to Canva's current set (Drop, Glow) and group them as Style, Color and Shape, once someone has checked side by side that Glow is the old Lift.
- Gradient text.
- Rulers, manual guides, and spacing guides between elements.
- In-editor brand kit and font upload. The engine already loads font assets.
- More shapes and graphics, plus an icon set.
- Simple tables and charts.
- SVG export, then animated GIF and MP4 page transitions. These rank low for photographers.
- Present mode.

## 3. Collaboration

The document is a flat set of records ordered by fractional index, and every change is a diff with a source tag. That is the shape real-time sync needs.
- **Decision: sync model.**
  - Server-ordered last-writer-wins per property, over WebSockets, is the approach [Figma describes for its multiplayer editing](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/). It is simple and predictable.
  - A CRDT such as Yjs adds offline editing and peer-to-peer at the cost of more state.
  - Recommendation: server-ordered, unless offline co-editing is a real requirement.
- Comments pinned to elements, share links with view, comment and edit roles, and version history (snapshots plus the diff log).

## 4. Photo tools and AI

- **Background removal and subject selection.** These also unlock "adjust only the subject or background", which Canva offers.
  - **Decision: on-device or server.** On-device runs a segmentation model with ONNX Runtime Web or MediaPipe: private, no per-image cost, but a heavier download and slower on low-end phones. Server-side is consistent and fast, but costs per image and sends client photos to a service.
  - Recommendation: on-device for the editor, with a server path for batch jobs.
- Smarter resize: re-flow layouts for a new aspect ratio instead of only scaling.
- Generated text for captions and promos, behind a host-provided provider interface like `PhotoProvider`, so the host chooses the model and pays for it.

## Performance and size

Today the editor chunk is 323 KB minified (104 KB gzip), plus React DOM (207 KB, 65 KB gzip). The home page does not load the editor.
- Lazy-load what most sessions never touch: the PDF and ZIP exporters, the WebGL filter code, and the template and graphics libraries.
- Cache each page as a bitmap while it is not being edited, and redraw only the page that changed.
- Move rendering to a worker with `OffscreenCanvas` where supported.

## Known limitations

- PDFs are raster images of each page. Text in them is not selectable.
- Only Chromium runs in the automated tests.
- Uploaded fonts load, but there is no UI to add them.
- Text effects use Canva's previous names (see the [Canva study](CANVA_STUDY.md#text-effects)).

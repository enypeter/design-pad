# Design Pad

A Canva-style design editor that runs as a standalone web app or embeds into other products as an SDK.

| Package | What it is |
| --- | --- |
| `@design-pad/core` | Headless engine: document model, undo/redo, text layout, Canvas 2D renderer, image filters, exporters. No UI. |
| `@design-pad/editor` | The editor UI (React). Use it as a component or mount it into any DOM node. |
| `@design-pad/embed` | Host-side SDK for embedding the hosted editor in an iframe or a mobile WebView. |
| `apps/web` | The standalone web app (local-first, designs stored in IndexedDB). |

## Develop

```bash
pnpm install
pnpm dev        # standalone app on http://localhost:5173
pnpm test       # unit tests
pnpm typecheck
pnpm lint
```

Requires Node 20+ and pnpm 10.

# Canva study and feature parity

This is what we took from Canva's editor, how Design Pad maps to it, and what is still missing. It reflects Canva's help centre and developer docs as indexed in October 2026. canva.com itself could not be loaded from the build environment, so each claim about Canva links to the page it came from, and claims that rest on third-party sources say so.

Status key: **Yes** (comparable), **Partial** (present but narrower), **No** (not built).

## What we copied on purpose

These are the interaction details that make Canva feel like Canva. We treated them as requirements rather than polish.
- **One contextual toolbar.** Selecting something swaps the toolbar above the canvas for that element type: text gets font, size, colour, style, alignment, list, spacing, Effects and Position. A small floating bar over the selection holds copy, delete, lock and a "more" menu.
- **Panels open beside the canvas, not over it.** The left rail switches panels. Font, colour, effects, photo editing and position open in the same slot and close back to where you were.
- **Direct manipulation everywhere.** Corner handles scale text (the font size changes). Side handles re-wrap it (the font size stays). Rotation shows the angle while you drag. Magenta guides snap to page and element edges and centres. Alt+drag duplicates.
- **Text is edited in place.** Double-click selects the word under the pointer. An editing session is one undo step, not one step per keystroke.
- **Uploads do not jump onto the page.** They land in the Uploads grid. You click or drag the one you want, or drop a file straight onto a frame.
- **Single-key insert shortcuts.** T, R, C and L add text, a rectangle, a circle and a line. The modifier shortcuts (group, layer order, duplicate, zoom) follow Canva's. Sources: [Jennifer Maker](https://jennifermaker.com/canva-keyboard-shortcuts/) and [Blogging Guide](https://bloggingguide.com/canva-keyboard-shortcuts/). Both are third party.
- **Multi-page by default.** Pages stack vertically, each with a title and its own page actions, plus a page strip for reordering.

## Feature parity

### Editor and navigation

| Canva                                                      | Design Pad | Notes                                                                         |
| ---------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| Header: home, file menu, resize, undo and redo, save state | Yes        | Hosts replace Share/Download with their own buttons (`headerActions`).        |
| Left rail of content panels                                | Yes        | Design, Elements, Text, Brand, Uploads, Photos, Draw. No Projects/Apps.       |
| Contextual toolbar and floating selection toolbar          | Yes        | The toolbar scrolls sideways, with visible arrows, when the editor is narrow. |
| Zoom, fit, full screen, page strip                         | Yes        | Ctrl/Cmd+wheel and trackpad pinch zoom; two-finger pinch on touch.            |
| Rulers and manual guides                                   | No         |                                                                               |
| Present mode, presenter notes                              | No         |                                                                               |

### Text

| Canva                                                      | Design Pad | Notes                                                                                                                  |
| ---------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Heading, subheading and body presets; font combinations    | Yes        | 14 presets and pairings.                                                                                               |
| Font library                                               | Partial    | 92 Google Fonts families, previewed in their own face. Canva's library is far larger.                                  |
| Uploaded brand fonts                                       | Partial    | The engine loads font assets; there is no upload UI yet.                                                               |
| Size, colour, bold, italic, underline, strikethrough, case | Yes        |                                                                                                                        |
| Alignment (with justify), bullet and numbered lists        | Yes        |                                                                                                                        |
| Letter and line spacing                                    | Yes        |                                                                                                                        |
| Mixed styles inside one text box                           | Yes        | Text is stored as styled runs.                                                                                         |
| Text effects                                               | Partial    | See [text effects](#text-effects) below.                                                                               |
| Curved text                                                | Yes        | Bend from -100 to 100.                                                                                                 |
| Gradient text                                              | No         | Canva supports it ([help](https://www.canva.com/help/text-effects/)). Our gradients cover shapes and backgrounds only. |

#### Text effects

Canva's current help centre groups text effects into **Style** (Drop, Glow, Echo, Outline, Background, Splice), **Color** (Hollow, Glitch, Neon) and **Shape** (Curve) ([Canva help](https://www.canva.com/help/text-effects/)). An older version of the same page lists Shadow, Lift, Hollow, Splice, Echo, Glitch, Neon and Curve ([canva.cn help](https://www.canva.cn/en/help/text-effects-cn/)).

Design Pad implements the older set: Shadow, Lift, Hollow, Splice, Outline, Echo, Glitch, Neon, Background and Curve. Each effect has sliders for its own parameters: offset, direction, blur, transparency, colour, thickness, roundness, spread or intensity.

Open question: an unofficial post says Canva renamed Lift to Glow ([Threads](https://www.threads.com/@yoursocialteam/post/DWxo8-YjFmL)). We have not confirmed that the two look the same. Shadow probably maps to Drop. Renaming our labels is cheap, because the stored effect ids would not change, but it should wait until someone compares them side by side in Canva.

### Elements

| Canva                                     | Design Pad | Notes                                                        |
| ----------------------------------------- | ---------- | ------------------------------------------------------------ |
| Lines with arrowheads and dashes          | Yes        | 10 presets; arrow, triangle, circle and bar caps.            |
| Shapes                                    | Partial    | 31 shapes, including polygons, stars, arrows and blobs.      |
| Graphics and stickers                     | Partial    | 38 bundled SVG graphics. Canva's library is in the millions. |
| Stock photos                              | Partial    | Unsplash, or the host's own gallery through `PhotoProvider`. |
| Frames                                    | Yes        | 14 frame shapes. Drop a photo in; it fills and crops.        |
| Photo grids                               | Yes        | 12 layouts.                                                  |
| Freehand drawing                          | Yes        | Pen, marker, highlighter, eraser.                            |
| Charts, tables, video, audio, mockups, QR | No         |                                                              |

### Photos

| Canva                                                                                                                   | Design Pad | Notes                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Upload, drag onto the page or into a frame                                                                              | Yes        |                                                                                                                                     |
| Crop, flip, transparency                                                                                                | Yes        | Crop mode keeps a dimmed view of the hidden part, as Canva does.                                                                    |
| Adjust sliders ([help](https://www.canva.com/help/image-settings/))                                                     | Yes        | 14: warmth, tint, brightness, contrast, highlights, shadows, whites, blacks, vibrance, saturation, sharpness, blur, vignette, fade. |
| Adjust only part of a photo (click, brush, foreground, background) ([help](https://www.canva.com/help/image-settings/)) | No         | Needs segmentation.                                                                                                                 |
| Filters with intensity                                                                                                  | Yes        | 18 presets.                                                                                                                         |
| Photo shadow                                                                                                            | Partial    | Drop shadow only.                                                                                                                   |
| Background remover, Magic Eraser, Magic Expand and other AI edits                                                       | No         |                                                                                                                                     |

### Colour

| Canva                               | Design Pad | Notes                                     |
| ----------------------------------- | ---------- | ----------------------------------------- |
| Document, brand and default colours | Yes        |                                           |
| Colour picker with hex input        | Yes        | Keyboard operable.                        |
| Eyedropper                          | Yes        | Where the browser has the EyeDropper API. |
| Linear and radial gradients         | Yes        | On shapes and page backgrounds.           |

### Pages, layout and resizing

| Canva                                         | Design Pad | Notes                                                                                                            |
| --------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Add, duplicate, delete, reorder, title pages  | Yes        |                                                                                                                  |
| Snapping to edges and centres                 | Yes        |                                                                                                                  |
| Align, space evenly, layer order, layers list | Yes        | Layers can be reordered by dragging.                                                                             |
| Group, lock                                   | Yes        |                                                                                                                  |
| Resize to another format                      | Partial    | Scales and re-centres content as one undo step. Canva's Magic Switch can also restructure layouts and translate. |

### Download

Canva offers PNG, JPG, PDF Standard, PDF Print with optional bleed and crop marks, SVG, MP4 and GIF. Transparent PNG and SVG are paid features ([Canva help](https://www.canva.com/help/download-file-types/)).

| Format                 | Design Pad | Notes                                                 |
| ---------------------- | ---------- | ----------------------------------------------------- |
| PNG, with transparency | Yes        | Size multiplier from 0.25× to 3×.                     |
| JPG                    | Yes        | Quality slider.                                       |
| WebP                   | Yes        | Not offered by Canva.                                 |
| PDF Standard           | Partial    | Raster pages at 150 DPI. Text is not selectable.      |
| PDF Print              | Partial    | Raster pages at 300 DPI. No bleed or crop marks yet.  |
| Several pages at once  | Yes        | Images are zipped; PDFs get one page per design page. |
| Editable design file   | Yes        | JSON. Re-open it with File > Open.                    |
| SVG, MP4, GIF          | No         |                                                       |

### Brand, collaboration and AI

| Canva                                          | Design Pad | Notes                                                                    |
| ---------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| Brand Kit (colours, fonts, logos)              | Partial    | Supplied by the host as `brand`; no in-editor brand management.          |
| Real-time co-editing, comments, sharing links  | No         | The record model and diff-based history were built so this can be added. |
| Version history                                | No         |                                                                          |
| Magic Studio (AI design, writing, image tools) | No         |                                                                          |

## Embedding: where Canva stops

The main reason to build this rather than integrate Canva is embedding. Canva's developer platform offers:
- **Connect APIs.** REST and OAuth: upload assets, create designs from brand templates, export results. Your users still design inside Canva, with Canva accounts ([Zuplo guide](https://zuplo.com/learning-center/canva-api.md)).
- **The Apps SDK.** Apps run inside Canva's editor, in an iframe in Canva's side panel. It is the reverse of embedding Canva in your product ([Canva developers](https://canva.dev/docs/apps/integrating-canva)).

Two vendors that sell embeddable editors, Polotno and IMG.LY, describe Connect as unable to give you a white-label canvas inside your own product ([Polotno](https://polotno.com/canva-api), [IMG.LY](https://img.ly/blog/img-ly-a-canva-connect-api-alternative-for-white-label-scalable-editing/)). They are competitors, so weigh that, but it matches Canva's own docs. One source also reports that Canva retired the Canva Button in December 2025. We have not confirmed that with Canva.

Design Pad embeds four ways, and all of them work without a Canva-style account:
1. A React component.
2. A framework-free mount, optionally isolated in a Shadow DOM.
3. A hosted editor in an iframe, driven over a private MessageChannel.
4. The same protocol over native WebView bridges on iOS, Android and Flutter.

See [EMBEDDING.md](EMBEDDING.md).

## Gaps that matter most for photographers

For a client-gallery product such as Gallerite, these are the gaps we expect to hit first, in rough order:
1. **Print PDF with bleed and crop marks**, and vector text in PDFs. Print labs ask for both.
2. **Background removal and subject selection.** These are common edits on portrait work.
3. **More templates** for albums, prints, price lists and social posts, loaded through `TemplateProvider`.
4. **Gradient text and the current effect names.**
5. **Collaboration**, so a photographer and a client can review a design together.

[ROADMAP.md](ROADMAP.md) turns this into a plan.

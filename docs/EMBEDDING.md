# Embedding Design Pad

There are four ways to put the editor in a product. Pick by where your code runs:

| Your app                              | Use                          | You get                                                     |
| ------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| React                                 | `<DesignPad />`              | Full control: same JS context, direct access to the engine. |
| Any other web stack                   | `mountDesignPad()`           | The same, without React in your code. Optional Shadow DOM.  |
| A web app on another origin, or a CMS | `openDesignPad()` + `/embed` | The editor in an iframe, deployed and versioned on its own. |
| iOS, Android or Flutter               | WebView + `/embed`           | The same protocol over the platform's JavaScript bridge.    |

The first two run in your bundle. The last two run the hosted editor (`apps/web`, route `/embed`) and talk to it over a message protocol.

The packages are not on npm yet. Until they are, publish them to a private registry (`pnpm -r publish` uses each package's `publishConfig`, which points at `dist/`), or consume them as a workspace or git dependency.

## React

```bash
pnpm add @design-pad/editor @design-pad/core
```

```tsx
import type { DesignFile } from '@design-pad/core';
import { DesignPad, type DesignPadHandle } from '@design-pad/editor';
import '@design-pad/editor/styles.css';
import { useRef } from 'react';

const save = (file: DesignFile) =>
  fetch(`/api/designs/${file.id}`, { method: 'PUT', body: JSON.stringify(file) });
const saveDraft = (file: DesignFile) =>
  localStorage.setItem(`draft:${file.id}`, JSON.stringify(file));

export function AlbumCoverEditor({ design }: { design?: DesignFile }) {
  const pad = useRef<DesignPadHandle>(null);
  return (
    <DesignPad
      ref={pad}
      design={design}
      size={{ width: 3000, height: 2000, title: 'Album cover' }}
      assets={s3Assets}
      photos={clientGallery('gal_123')}
      brand={{
        colors: ['#1f1f1f', '#ffbd59'],
        fonts: { heading: 'Playfair Display', body: 'Lato' },
      }}
      features={{ panels: ['design', 'elements', 'text', 'uploads', 'photos'] }}
      headerActions={[
        {
          label: 'Save to gallery',
          variant: 'primary',
          onClick: (editor) => save(editor.toJSON()),
        },
      ]}
      onChange={(file) => saveDraft(file)}
      style={{ height: '100vh' }}
    />
  );
}
```

`pad.current.editor` is the engine (`@design-pad/core` `Editor`). Use it to read or change the design from your own UI:

```ts
const editor = pad.current!.editor;
editor.addElement({ type: 'text', spans: [{ text: 'Jane & Tunde' }] });
const file = editor.toJSON(); // DesignFile, safe to store as JSON
```

### Options

| Option          | Type                                          | Purpose                                                         |
| --------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `design`        | `DesignFile`                                  | Design to open. Older files are migrated on load.               |
| `size`          | `{ width, height, unit?, dpi?, title? }`      | Size of a new blank design. `unit` is `px`, `mm`, `cm` or `in`. |
| `assets`        | `AssetAdapter`                                | Where uploads go. Defaults to in-memory object URLs.            |
| `photos`        | `PhotoProvider`                               | Search backend for the Photos panel.                            |
| `templates`     | `TemplateProvider`                            | Your templates in the Design panel.                             |
| `fonts`         | `FontFamilyDef[]`                             | Replace the font catalog (self-hosted or licensed fonts).       |
| `brand`         | `BrandKit`                                    | Colours, heading and body fonts, and logos for the Brand panel. |
| `features`      | `Partial<FeatureFlags>`                       | `panels`, `header`, `multiPage`, `download`, `resize`.          |
| `headerActions` | `HeaderAction[]`                              | Your buttons in the header, in place of Download.               |
| `theme`         | `'light' \| 'dark'`                           |                                                                 |
| `saveStatus`    | `'saved' \| 'saving' \| 'unsaved' \| 'error'` | Shown in the header.                                            |
| `onChange`      | `(design, editor) => void`                    | Debounced (600 ms) after edits.                                 |
| `onSave`        | `(design, editor) => void`                    | Ctrl/Cmd+S.                                                     |
| `onExport`      | `(result, editor) => boolean \| void`         | After an export. Return `false` to stop the browser download.   |
| `onReady`       | `(editor) => void`                            | Once per engine.                                                |
| `onError`       | `(error) => void`                             | A panel or toolbar failed to render. The editor keeps working.  |
| `editor`        | `Editor`                                      | Bring your own engine instance. You then own its lifetime.      |

### Storage: `AssetAdapter`

The editor never decides where files live. This adapter stores uploads in S3 with presigned URLs and keeps a private reference in the design:

```ts
import type { AssetAdapter } from '@design-pad/editor';

export const s3Assets: AssetAdapter = {
  async upload(file) {
    const { uploadUrl, key } = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type }),
    }).then((r) => r.json());
    await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    const { width, height } = await createImageBitmap(file);
    return { src: `s3://${key}`, mime: file.type, width, height, name: file.name };
  },
  list: () => fetch('/api/uploads').then((r) => r.json()),
  remove: (asset) =>
    fetch(`/api/uploads?src=${encodeURIComponent(asset.src)}`, { method: 'DELETE' }).then(() => {}),
  // Called whenever the editor needs pixels: return a short-lived signed GET URL.
  resolveUrl: (src) =>
    fetch(`/api/uploads/url?src=${encodeURIComponent(src)}`).then((r) => r.text()),
};
```

Images from another origin must be served with CORS headers (`Access-Control-Allow-Origin`). Without them, the browser blocks the editor from reading the pixels, so filters cannot run and exports fail. For S3, add a CORS rule to the bucket that allows `GET` from the editor's origin.

### Photos: `PhotoProvider`

Point the Photos panel at any searchable library, for example a client's gallery:

```ts
import type { PhotoProvider } from '@design-pad/editor';

export const clientGallery = (galleryId: string): PhotoProvider => ({
  name: 'Client gallery',
  async search(query, page) {
    const res = await fetch(
      `/api/galleries/${galleryId}/photos?q=${encodeURIComponent(query)}&page=${page}`,
    ).then((r) => r.json());
    return {
      results: res.items.map(
        (p: { id: string; url: string; thumb: string; w: number; h: number }) => ({
          id: p.id,
          url: p.url,
          thumbUrl: p.thumb,
          width: p.w,
          height: p.h,
        }),
      ),
      hasMore: res.hasMore,
    };
  },
  onUse: (photo) =>
    void fetch(`/api/galleries/${galleryId}/photos/${photo.id}/used`, { method: 'POST' }),
});
```

### Templates: `TemplateProvider`

```ts
const templates: TemplateProvider = {
  list: () => fetch('/api/templates').then((r) => r.json()), // TemplateSummary[]
  load: (id) => fetch(`/api/templates/${id}`).then((r) => r.json()), // DesignFile
};
```

## Any framework: `mountDesignPad`

```ts
import { mountDesignPad } from '@design-pad/editor';

const pad = mountDesignPad(document.querySelector('#editor')!, {
  isolate: true,
  design: await fetch('/api/designs/123').then((r) => r.json()),
  onSave: (file) => fetch('/api/designs/123', { method: 'PUT', body: JSON.stringify(file) }),
});

pad.update({ theme: 'dark' }); // change options later
pad.unmount(); // also disposes the engine it created
```

The stylesheet is injected for you. With `isolate: true`, the editor renders inside a Shadow DOM, so your page's CSS cannot reach it. Use that when your site has global styles on `button`, `input` or `*`. `apps/web/examples/mount.html` deliberately styles every button red and uppercase to show the difference.

The container needs a height. The editor fills its container and never sizes itself.

## Another origin: `openDesignPad` (iframe)

Host the editor (`pnpm build` in `apps/web`, then serve `dist/` with a fallback to `index.html`). Embed `/embed` from your app:

```bash
pnpm add @design-pad/embed
```

```ts
import { openDesignPad } from '@design-pad/embed';

const pad = await openDesignPad({
  container: document.getElementById('editor')!,
  editorUrl: 'https://design.example.com/embed',
  design: savedDesign, // or size: { width: 1080, height: 1080 }
  title: 'Client promo',
  brand: { colors: ['#1f1f1f', '#ffbd59'] },
  headerActions: [{ id: 'done', label: 'Save & close', variant: 'primary' }],
  assets: {
    upload: async (file) => uploadToS3(file), // a real File, name and type intact
    list: async () => listUploads(),
    resolveUrl: async (src) => signedUrl(src),
  },
  photos: { name: 'Client gallery', search: (q, page) => searchGallery(q, page) },
  onAction: async (id, design) => {
    if (id === 'done') await saveDesign(design);
  },
  onExport: (blob, { filename }) => uploadExport(blob, filename), // editor downloads go to you
  onChange: (design) => saveDraft(design),
});

await pad.addImage({ url: 'https://cdn.example.com/p/123.jpg', width: 3000, height: 2000 });
await pad.addText({ text: 'Lagos, 2026', fontSize: 72 });
const { blob } = await pad.export({ format: 'pdf', dpi: 300 });
pad.destroy();
```

| Handle method                                       | Does                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `getDesign()` / `loadDesign(design)`                | Read or replace the whole design.                                                                                                 |
| `export(options)`                                   | `{ blob, filename }`. Formats: `png`, `jpeg`, `webp`, `pdf`, `json`.                                                              |
| `addImage({ url, width?, height? })`                | Adds a photo scaled to fit the page. Returns the element id. Without a size, the image is loaded to measure it, so it needs CORS. |
| `addText({ text, fontSize?, fontFamily?, color? })` | Adds a text box centred on the page. Returns the element id.                                                                      |
| `setTheme(theme)`, `undo()`, `redo()`               |                                                                                                                                   |
| `destroy()`                                         | Closes the channel and removes the iframe.                                                                                        |

`onReady` fires each time the editor page loads. If the iframe reloads, the SDK reconnects on its own and the editor restarts from `design`. Keep the latest design from `onChange` and pass it back with `loadDesign()` if you need to.

### Locking it down

- Build the editor with `VITE_EMBED_ALLOWED_ORIGINS=https://app.example.com`. It then ignores configuration from any other parent.
- Serve the editor with `Content-Security-Policy: frame-ancestors https://app.example.com`, so other sites cannot frame it.
- After the handshake, all traffic uses a private `MessagePort`. Other scripts on the page cannot read it.

## iOS, Android and Flutter (WebView)

Load `https://design.example.com/embed` in a WebView and register one JavaScript bridge before the page loads:

| Platform | Bridge the editor looks for                                    |
| -------- | -------------------------------------------------------------- |
| iOS      | `window.webkit.messageHandlers.designPad`                      |
| Android  | `window.DesignPadAndroid.postMessage(string)`                  |
| Flutter  | `window.DesignPad.postMessage(string)` (a `JavaScriptChannel`) |

The conversation is JSON:
1. The editor sends `{"type":"design-pad:hello","version":1}`.
2. You answer by evaluating `window.designPadBridge.receive(<init>)` with an INIT message (below).
3. From then on, each side sends RPC messages: `request`, `response` and `event`. You send by evaluating `window.designPadBridge.receive(<message>)`.

Files cross as data URLs (`{ "name", "mime", "dataUrl" }`).

```json
{
  "type": "design-pad:init",
  "version": 1,
  "config": {
    "size": { "width": 1080, "height": 1350 },
    "title": "Album cover",
    "headerActions": [{ "id": "done", "label": "Done", "variant": "primary" }],
    "capabilities": {
      "uploadAsset": true,
      "listAssets": false,
      "resolveAssetUrl": false,
      "photos": null
    },
    "interceptExport": true,
    "emitChanges": false
  }
}
```

Set `interceptExport: true` in WebViews. The editor then sends downloads to you as `export` events instead of trying to save a file inside the WebView.

### iOS (Swift, WKWebView)

```swift
import UIKit
import WebKit

final class DesignPadViewController: UIViewController, WKScriptMessageHandler {
    private var webView: WKWebView!
    var onDone: ((Data) -> Void)?   // design JSON
    var onExport: ((Data, String) -> Void)?   // file bytes, filename

    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        // Register before loading: the editor checks for the bridge at start-up.
        // WeakHandler avoids the retain cycle WKUserContentController would create.
        config.userContentController.add(WeakHandler(self), name: "designPad")
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
        webView.load(URLRequest(url: URL(string: "https://design.example.com/embed")!))
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let json = (message.body as? String)?.data(using: .utf8),
              let msg = try? JSONSerialization.jsonObject(with: json) as? [String: Any] else { return }

        if msg["type"] as? String == "design-pad:hello" {
            send([
                "type": "design-pad:init", "version": 1,
                "config": [
                    "size": ["width": 1080, "height": 1350],
                    "headerActions": [["id": "done", "label": "Done", "variant": "primary"]],
                    "capabilities": ["uploadAsset": false, "listAssets": false,
                                     "resolveAssetUrl": false, "photos": NSNull()],
                    "interceptExport": true,
                ],
            ])
            return
        }

        guard msg["kind"] as? String == "event", let name = msg["name"] as? String,
              let payload = msg["payload"] as? [String: Any] else { return }
        switch name {
        case "action":   // the Done button: payload is { id, design }
            if let design = payload["design"],
               let data = try? JSONSerialization.data(withJSONObject: design) { onDone?(data) }
        case "export":   // payload is { file: { name, mime, dataUrl }, format }
            if let file = payload["file"] as? [String: Any],
               let dataUrl = file["dataUrl"] as? String,
               let base64 = dataUrl.split(separator: ",", maxSplits: 1).last,
               let bytes = Data(base64Encoded: String(base64)) {
                onExport?(bytes, file["name"] as? String ?? "design")
            }
        default:
            break
        }
    }

    private func send(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.designPadBridge.receive(\(json))")
    }
}

private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        target?.userContentController(c, didReceive: m)
    }
}
```

In SwiftUI, wrap the controller in a `UIViewControllerRepresentable`.

### Android (Kotlin)

```kotlin
class DesignPadActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // Register before loading: the editor checks for the bridge at start-up.
            addJavascriptInterface(Bridge(), "DesignPadAndroid")
            webViewClient = object : WebViewClient() {
                // The bridge is visible to every page this WebView shows; stay on the editor.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) =
                    request.url.host != "design.example.com"
            }
            loadUrl("https://design.example.com/embed")
        }
        setContentView(webView)
    }

    inner class Bridge {
        @JavascriptInterface // runs on a background thread
        fun postMessage(json: String) {
            val msg = JSONObject(json)
            if (msg.optString("type") == "design-pad:hello") {
                send(JSONObject().apply {
                    put("type", "design-pad:init")
                    put("version", 1)
                    put("config", JSONObject().apply {
                        put("size", JSONObject(mapOf("width" to 1080, "height" to 1350)))
                        put("headerActions", JSONArray().put(JSONObject(mapOf("id" to "done", "label" to "Done", "variant" to "primary"))))
                        put("capabilities", JSONObject().apply {
                            put("uploadAsset", false); put("listAssets", false)
                            put("resolveAssetUrl", false); put("photos", JSONObject.NULL)
                        })
                        put("interceptExport", true)
                    })
                })
                return
            }
            if (msg.optString("kind") != "event") return
            val payload = msg.optJSONObject("payload") ?: return
            when (msg.optString("name")) {
                "action" -> saveDesign(payload.getJSONObject("design").toString())
                "export" -> {
                    val file = payload.getJSONObject("file")
                    val bytes = Base64.decode(file.getString("dataUrl").substringAfter(','), Base64.DEFAULT)
                    saveExport(bytes, file.getString("name"))
                }
            }
        }
    }

    private fun send(message: JSONObject) {
        webView.post { webView.evaluateJavascript("window.designPadBridge.receive($message)", null) }
    }

    private fun saveDesign(json: String) {
        File(filesDir, "design.json").writeText(json)
    }

    private fun saveExport(bytes: ByteArray, name: String) {
        File(cacheDir, name).writeBytes(bytes)
    }
}
```

For the Upload button to open a picker, implement `WebChromeClient.onShowFileChooser`. On WebView versions that support it, `WebViewCompat.addWebMessageListener` from `androidx.webkit` is a stricter alternative to `addJavascriptInterface`. Register it under the name `DesignPadAndroid` with an allowed-origin rule; the editor uses it the same way.

### Flutter (`webview_flutter`)

```dart
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class DesignPadScreen extends StatefulWidget {
  const DesignPadScreen({super.key, required this.onDone});
  final void Function(Map<String, dynamic> design) onDone;

  @override
  State<DesignPadScreen> createState() => _DesignPadScreenState();
}

class _DesignPadScreenState extends State<DesignPadScreen> {
  late final WebViewController _controller = WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    // Register before loading: the editor checks for the bridge at start-up.
    ..addJavaScriptChannel('DesignPad', onMessageReceived: (m) => _onMessage(m.message))
    ..loadRequest(Uri.parse('https://design.example.com/embed'));

  int _nextId = 1;
  final _pending = <int, Completer<Object?>>{};

  void _send(Map<String, Object?> message) =>
      _controller.runJavaScript('window.designPadBridge.receive(${jsonEncode(message)})');

  /// Call an editor method, e.g. request('export', {'format': 'png'}).
  Future<Object?> request(String method, [Map<String, Object?>? params]) {
    final id = _nextId++;
    final completer = Completer<Object?>();
    _pending[id] = completer;
    _send({'kind': 'request', 'id': id, 'method': method, 'params': params});
    return completer.future;
  }

  void _onMessage(String raw) {
    final msg = jsonDecode(raw) as Map<String, dynamic>;
    if (msg['type'] == 'design-pad:hello') {
      _send({
        'type': 'design-pad:init',
        'version': 1,
        'config': {
          'size': {'width': 1080, 'height': 1350},
          'headerActions': [
            {'id': 'done', 'label': 'Done', 'variant': 'primary'},
          ],
          'capabilities': {
            'uploadAsset': false,
            'listAssets': false,
            'resolveAssetUrl': false,
            'photos': null,
          },
          'interceptExport': true,
        },
      });
      return;
    }
    switch (msg['kind']) {
      case 'response':
        final completer = _pending.remove(msg['id']);
        if (msg['ok'] == true) {
          completer?.complete(msg['result']);
        } else {
          completer?.completeError(Exception(msg['error']?['message']));
        }
      case 'event' when msg['name'] == 'action':
        widget.onDone(msg['payload']['design'] as Map<String, dynamic>);
      case 'event' when msg['name'] == 'export':
        final file = msg['payload']['file'] as Map<String, dynamic>;
        final bytes = UriData.parse(file['dataUrl'] as String).contentAsBytes();
        debugPrint('export ${file['name']}: ${bytes.length} bytes');
    }
  }

  @override
  Widget build(BuildContext context) =>
      Scaffold(body: SafeArea(child: WebViewWidget(controller: _controller)));
}
```

On Android, file uploads also need `AndroidWebViewController.setOnShowFileSelector` from `webview_flutter_android`.

### Answering editor requests (uploads)

If you advertise `"uploadAsset": true`, the editor sends uploads to you instead of keeping them inline in the design:

```json
{
  "kind": "request",
  "id": 7,
  "method": "uploadAsset",
  "params": {
    "file": {
      "name": "IMG_0042.jpg",
      "mime": "image/jpeg",
      "dataUrl": "data:image/jpeg;base64,..."
    }
  }
}
```

Store the file, then reply with the same `id`:

```json
{
  "kind": "response",
  "id": 7,
  "ok": true,
  "result": {
    "src": "https://cdn.example.com/u/42.jpg",
    "mime": "image/jpeg",
    "width": 4000,
    "height": 6000
  }
}
```

On failure, reply `{ "kind": "response", "id": 7, "ok": false, "error": { "message": "Upload failed" } }`. The editor then shows "Could not upload IMG_0042.jpg" and carries on.

## Protocol reference

Defined in `packages/embed/src/protocol.ts` (`PROTOCOL_VERSION = 1`).

**Editor methods** (you call them):

| Method         | Params                                                       | Result                            |
| -------------- | ------------------------------------------------------------ | --------------------------------- |
| `getDesign`    |                                                              | design JSON                       |
| `loadDesign`   | `{ design }`                                                 |                                   |
| `export`       | `{ format, pageIds?, scale?, quality?, transparent?, dpi? }` | `{ name, mime, blob or dataUrl }` |
| `addImage`     | `{ url, width?, height?, name? }`                            | element id                        |
| `addText`      | `{ text, fontSize?, fontFamily?, color? }`                   | element id                        |
| `setTheme`     | `{ theme: 'light' \| 'dark' }`                               |                                   |
| `undo`, `redo` |                                                              |                                   |

**Host methods** (the editor calls them, but only those you advertise in `capabilities`):

| Method            | Params            | Result                                |
| ----------------- | ----------------- | ------------------------------------- |
| `uploadAsset`     | `{ file }`        | `{ src, mime, width, height, name? }` |
| `listAssets`      |                   | array of the same                     |
| `resolveAssetUrl` | `{ src }`         | a URL the editor can load             |
| `searchPhotos`    | `{ query, page }` | `{ results, hasMore }`                |
| `usePhoto`        | `{ photo }`       |                                       |

**Editor events:**

| Event    | Payload            | When                                             |
| -------- | ------------------ | ------------------------------------------------ |
| `ready`  | `{ designId }`     | The editor finished loading.                     |
| `change` | `{ design }`       | Debounced edits (only if `emitChanges` is true). |
| `save`   | `{ design }`       | Ctrl/Cmd+S.                                      |
| `action` | `{ id, design }`   | A header action was clicked.                     |
| `export` | `{ file, format }` | A download, when `interceptExport` is true.      |
| `error`  | `{ message }`      |                                                  |

# Streamprocessing

The shared completion kernel lives in `src/`. The HTML application lives in
`app/html/`, including its server and bundled browser assets.

Run `npm start`, then open http://127.0.0.1:3000. The server connects to Ollama
at http://127.0.0.1:11434 and uses `qwen-local` by default. Override these with
`OLLAMA_HOST` and `MODEL`; use `HOST` and `PORT` to configure the web server.

`src/index.mjs` exports the headless completion controller, input session,
completion joining, and prompt helpers. `src/transports/http.mjs` provides the
shared streaming HTTP transport and request cache.

`CompletionKernel` adds a host-independent observable interface:
`request(input, { signal, fresh })`, `snapshot()`, and `onChange(snapshot)`.
Snapshots expose lifecycle, input, exact model payload, cache use, raw and
cleaned suggestions, errors, and interactions. `ContextStore` provides validated
pre/post-reference operations and snapshots. Hosts handle rendering, persistence,
editor selection, and model connection checks.

`.cut/` preserves the previous repository files, including models, builds,
tests, documentation, and earlier extension scaffolding. It is ignored by Git.
The extracted kernel and HTML app are copies; the original files remain there.

The shared VS Code / VSCodium extension lives in `app/vscode/`. Run
`npm --prefix app/vscode ci`, then `npm test` or `npm run package:extension`.
Install the generated `app/vscode/thoughtstream-0.1.0.vsix` through
**Extensions: Install from VSIX** in either editor. See `app/vscode/README.md`
for setup and development instructions.

The GitHub Actions pipeline tests and packages the extension on Linux and
Windows, then uploads a VSIX artifact. Builds use the committed dependency lock.

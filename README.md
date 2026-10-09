# Streamprocessing

The shared completion kernel lives in `src/`. The HTML application lives in
`app/html/`, including its server and bundled browser assets.

Run `npm start`, then open http://127.0.0.1:3000. The server connects to Ollama
at http://127.0.0.1:11434 and uses `qwen-local` by default. Override these with
`OLLAMA_HOST` and `MODEL`; use `HOST` and `PORT` to configure the web server.

`src/index.mjs` exports the headless completion controller, input session,
completion joining, and prompt helpers. `src/transports/http.mjs` provides the
shared streaming HTTP transport and request cache.

`.cut/` preserves the previous repository files, including models, builds,
tests, documentation, and earlier extension scaffolding. It is ignored by Git.
The extracted kernel and HTML app are copies; the original files remain there.

Editor extension development is the next step.

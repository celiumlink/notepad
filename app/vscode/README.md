# Thoughtstream

The same desktop extension works in VS Code and VSCodium 1.99 or newer.
It uses the portable Thoughtstream kernel to suggest prose through Ollama;
no HTML server is needed.

## Install and use

Install `thoughtstream-0.2.0.vsix` using **Extensions: Install from VSIX** in
either editor. Start Ollama, then set **Thoughtstream: Model** to an installed
model (default: `qwen-local`). Run **Thoughtstream: Check Model Connection**.

Open a Markdown or plain text file and type. Suggestions appear as ghost text
after a pause; **Tab** accepts and **Escape** dismisses using the editor's normal
inline suggestion controls. **Ctrl+Alt+Space** (**Cmd+Alt+Space** on macOS)
requests a fresh continuation. **Thoughtstream: Toggle Suggestions** enables or
disables the provider. The editor's `editor.inlineSuggest.enabled` must be on.

Settings under `thoughtstream` configure the host, model, enabled languages
(`*` for all), automatic suggestions, delay, context limit, generation length,
temperature, and optional writing direction. The kernel is tuned for prose.
Transport errors appear in **Output → Thoughtstream**.

Open the Thoughtstream activity bar icon for the writing companion: connection
status, background references, context for what comes next, writing direction,
and the current suggestion. **Under the hood** contains the raw response,
input context, cache state, and exact model request when you want to inspect them.
The status bar shows the model with a ready, busy, disabled, or warning icon;
the sidebar toolbar also indicates model readiness. Connection checks run
every 30 seconds and can be triggered by clicking the indicator.

Select text and use **Thoughtstream: Add Selection as Pre-context** or
**Add Selection as Post-context** (also in the editor context menu). Give it
a label; the kernel includes it in subsequent prompts. These references live
in the workspace state, with separate pre/post lists in the sidebar. Original
source excerpts are highlighted green/purple. Click a reference to edit its
Markdown in a second editor; changes update the context immediately. Remove
references using their remove button. Limits are 4,000 characters per reference,
8,000 characters and 16 references per side. Invalid edits retain the last
valid reference. Edited copies no longer highlight the original source.

Only the configured amount of text surrounding the cursor is sent to the
configured Ollama host. There is no telemetry or interaction logging.
Suggestions require a trusted workspace and one empty selection. Requests
are cancelled when the cursor, active editor, or document changes.
For SSH/containers, Ollama must be reachable from the remote extension host.

## Development

From this directory, run `npm ci`, then `npm test` or `npm run package`.
Open this directory in either editor and press **F5** to launch the extension
development host. The launch task bundles the kernel first.

`build.mjs` copies the shared `../../src` into the ignored `kernel/` directory
for a standalone VSIX. Edit the original kernel rather than the generated copy.
The editor adapter maps document context, cancellation, and inline items;
prompt building, streaming, joining, and caching stay in the kernel.

The publisher ID `thoughtstream-local` is for local packaging. Publishing to
the VS Code Marketplace or Open VSX requires a registered publisher identity.

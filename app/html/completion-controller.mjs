// Compatibility entry point for the existing browser editor.
export { CompletionController } from '../../src/completion-controller.mjs';
import { createCompletionTransport } from '../../src/transports/http.mjs';
import { buildModelRequest } from '../../src/prompt.mjs';
export const ollamaTransport = createCompletionTransport({ buildRequest: context => buildModelRequest(context, context.model || 'qwen-local') });

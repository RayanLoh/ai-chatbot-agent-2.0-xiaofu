import { endpoints } from './config';
import { requestJson } from './http';

export const generateResponse = (prompt, conversationId, model, signal, imageUrls = [], requestId) => requestJson(endpoints.generate, {
  method: 'POST',
  body: JSON.stringify({
    prompt, conversation_id: conversationId, model_name: model,
    image_urls: imageUrls, request_id: requestId,
  }),
  signal,
});

export const stopGeneration = (requestId) => requestJson(endpoints.stop, {
  method: 'POST', body: JSON.stringify({ request_id: requestId }),
});

export const getGeneration = (id, signal) => requestJson(`/generations/${encodeURIComponent(id)}`, { signal });

export async function recoverGeneration(id, signal) {
  // Poll the same job; never automatically pay for a second generation.
  for (let attempt = 0; attempt < 80; attempt += 1) {
    signal?.throwIfAborted();
    const job = await getGeneration(id, signal);
    if (job.status === 'succeeded') return job.result;
    if (job.status !== 'running') throw Object.assign(new Error('Generation failed. Your draft has been restored.'), { terminal: true });
    await new Promise((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, 2000);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
  throw new Error('Reply is still pending. Check recovery before sending again.');
}

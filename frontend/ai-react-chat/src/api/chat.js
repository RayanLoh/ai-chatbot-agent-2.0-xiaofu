import { endpoints } from './config';
import { requestJson, buildHeaders } from './http';
import { buildApiUrl } from './config';

export const generateResponse = async (prompt, conversationId, model, signal, imageUrls = []) => {
  const response = await fetch(buildApiUrl(endpoints.generate), {
    method: 'POST',
    headers: buildHeaders({ isJson: true }),
    body: JSON.stringify({
      prompt,
      conversation_id: conversationId,
      model_name: model,
      image_urls: imageUrls,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    const error = new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    error.status = response.status;
    error.detail = errorData.detail || response.statusText;
    error.code = errorData.code || errorData.error_code || errorData.reason || null;
    error.reason = errorData.reason || null;
    throw error;
  }

  return response.json();
};

export const stopGeneration = async () => requestJson(endpoints.stop, {
  method: 'POST',
});
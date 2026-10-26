import { endpoints } from './config';
import { requestJson } from './http';

export const getConversations = async () => requestJson(endpoints.conversations);

export const createConversation = async (title = 'new conversation') => requestJson(endpoints.conversations, {
  method: 'POST',
  body: JSON.stringify({ title }),
});

export const getConversationMessages = async (conversationId, signal, { before } = {}) => {
  const query = new URLSearchParams({ limit: '50' });
  if (before !== undefined && before !== null) query.set('before', String(before));
  return requestJson(`${endpoints.conversation(conversationId)}?${query}`, { signal });
};

export const updateConversationTitle = async (conversationId, title) => requestJson(endpoints.conversation(conversationId), {
  method: 'PUT',
  body: JSON.stringify({ title }),
});

export const deleteConversation = async (conversationId) => requestJson(endpoints.conversation(conversationId), {
  method: 'DELETE',
});

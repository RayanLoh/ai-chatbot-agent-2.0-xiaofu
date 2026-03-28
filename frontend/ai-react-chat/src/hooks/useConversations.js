import { useCallback, useEffect, useState } from 'react';

import * as api from '../api';

const EMPTY_CONVERSATION_TITLES = new Set(['', 'new chat', 'new conversation']);

function isDisposableConversation(conversation) {
  if (!conversation) return false;

  const normalizedTitle = (conversation.title || '').trim().toLowerCase();
  const messageCount = Number(conversation.message_count ?? conversation.messageCount ?? 0);

  return messageCount === 0 && EMPTY_CONVERSATION_TITLES.has(normalizedTitle);
}

export function useConversations({ isLoggedIn, isMounted }) {
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const cleanupDisposableConversations = useCallback(async (sourceConversations, excludeId = null) => {
    const disposableConversations = sourceConversations.filter(
      (conversation) => conversation.id !== excludeId && isDisposableConversation(conversation),
    );

    if (disposableConversations.length === 0) {
      return {
        remainingConversations: sourceConversations,
        deletedIds: [],
      };
    }

    const deletionResults = await Promise.allSettled(
      disposableConversations.map((conversation) => api.deleteConversation(conversation.id)),
    );

    const deletedIds = disposableConversations
      .filter((_, index) => deletionResults[index].status === 'fulfilled')
      .map((conversation) => conversation.id);

    return {
      remainingConversations: sourceConversations.filter((conversation) => !deletedIds.includes(conversation.id)),
      deletedIds,
    };
  }, []);

  const selectConversation = useCallback(async (id) => {
    if (id === conversationId && messages.length > 0) return;

    if (conversationId && conversationId !== id && messages.length === 0) {
      const currentConversation = conversations.find((conversation) => conversation.id === conversationId);

      if (isDisposableConversation(currentConversation)) {
        try {
          await api.deleteConversation(conversationId);
          setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
          localStorage.removeItem('lastConversationId');
        } catch (error) {
          console.warn('Failed to discard empty conversation draft:', error);
        }
      }
    }

    setConversationId(id);
    localStorage.setItem('lastConversationId', id);
    setIsLoadingMessages(true);
    setMessages([]);

    try {
      console.log(`☁️ Fetching messages for conversation ${id}...`);
      const data = await api.getConversationMessages(id);
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Failed to load conversation messages:', error);
      setMessages([
        {
          id: `err_${Date.now()}`,
          sender: 'bot',
          text: `❌ Failed to load conversation: ${error.message}`,
        },
      ]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [conversationId, conversations, messages.length]);

  const createNewChat = useCallback(async (switchFocus = true) => {
    try {
      const { remainingConversations, deletedIds } = await cleanupDisposableConversations(conversations);

      if (deletedIds.length > 0) {
        setConversations(remainingConversations);

        if (conversationId && deletedIds.includes(conversationId)) {
          setConversationId(null);
          setMessages([]);
          localStorage.removeItem('lastConversationId');
        }
      }

      const newConv = await api.createConversation();
      setConversations((prev) => [newConv, ...prev]);

      if (switchFocus) {
        setMessages([]);
        setConversationId(newConv.id);
        localStorage.setItem('lastConversationId', newConv.id);
      }

      return newConv;
    } catch (error) {
      console.error('❌ Failed to create new conversation:', error);
      return null;
    }
  }, [cleanupDisposableConversations, conversationId, conversations]);

  const loadConversations = useCallback(async () => {
    if (!isLoggedIn) {
      setIsLoadingConversations(false);
      setConversations([]);
      setConversationId(null);
      setMessages([]);
      return;
    }

    setIsLoadingConversations(true);
    try {
      console.log('📡 [Private] Loading conversations for logged-in user...');
      const data = await api.getConversations();
      const validConvList = Array.isArray(data.conversations) ? data.conversations : [];
      const { remainingConversations, deletedIds } = await cleanupDisposableConversations(validConvList);

      if (deletedIds.length > 0) {
        const lastConversationId = localStorage.getItem('lastConversationId');
        if (lastConversationId && deletedIds.includes(lastConversationId)) {
          localStorage.removeItem('lastConversationId');
        }
      }

      setConversations(remainingConversations);
    } catch (error) {
      console.error('❌ Failed to load conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [cleanupDisposableConversations, isLoggedIn]);

  const deleteConversation = useCallback(async (id) => {
    const originalConversations = conversations;
    const updatedConversations = conversations.filter((conv) => conv.id !== id);
    setConversations(updatedConversations);

    if (conversationId === id) {
      localStorage.removeItem('lastConversationId');
      if (updatedConversations.length > 0) {
        await selectConversation(updatedConversations[0].id);
      } else {
        await createNewChat();
      }
    }

    try {
      await api.deleteConversation(id);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert(`Failed to delete conversation: ${error.message}`);
      setConversations(originalConversations);
    }
  }, [conversationId, conversations, createNewChat, selectConversation]);

  const updateConversationTitle = useCallback(async (id, newTitle, options = {}) => {
    const { silent = false } = options;
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;

    const previousConversations = conversations;
    setConversations((prev) => prev.map((conversation) => (
      conversation.id === id
        ? { ...conversation, title: trimmedTitle }
        : conversation
    )));

    try {
      await api.updateConversationTitle(id, trimmedTitle);
    } catch (error) {
      setConversations(previousConversations);
      console.error('Failed to update title:', error);
      if (!silent) {
        alert(`Failed to update title: ${error.message}`);
      }
    }
  }, [conversations]);

  useEffect(() => {
    if (isMounted) {
      loadConversations();
    }
  }, [isMounted, loadConversations]);

  return {
    conversationId,
    setConversationId,
    conversations,
    messages,
    setMessages,
    isLoadingConversations,
    isLoadingMessages,
    selectConversation,
    createNewChat,
    loadConversations,
    deleteConversation,
    updateConversationTitle,
  };
}
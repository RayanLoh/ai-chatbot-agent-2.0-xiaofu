import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';

export function useConversations({ isMounted, authScopeKey }) {
  const [conversationError, setConversationError] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const scope = useRef(authScopeKey);
  scope.current = authScopeKey;
  const selection = useRef(0);
  const listVersion = useRef(0);
  const selected = useRef(null);
  const mounted = useRef(true);

  const loadConversations = useCallback(async () => {
    const version = ++listVersion.current;
    const owner = authScopeKey;
    setIsLoadingConversations(true);
    setConversationError('');
    try {
      // A first-time visitor has no server identity or history to restore.
      // Create a guest session only when they actually start using the chat.
      if (owner === 'guest' && !localStorage.getItem('guest_token')) {
        setConversations([]);
        return;
      }
      const data = await api.getConversations();
      if (!mounted.current || scope.current !== owner || version !== listVersion.current) return;
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } catch (error) {
      if (mounted.current && scope.current === owner && version === listVersion.current) {
        setConversationError('暂时无法读取历史对话，请检查连接后重试。');
        window.dispatchEvent(new CustomEvent('xiaofu:dynamic-island', { detail: {
          title: '暂时无法读取历史对话', message: '请检查连接后重试。',
        } }));
      }
    } finally {
      if (mounted.current && scope.current === owner && version === listVersion.current) setIsLoadingConversations(false);
    }
  }, [authScopeKey]);

  const selectConversation = useCallback(async (id) => {
    const version = ++selection.current;
    const owner = authScopeKey;
    selected.current = id;
    setConversationId(id);
    setMessages([]);
    setIsLoadingMessages(true);
    try {
      const data = await api.getConversationMessages(id);
      if (mounted.current && scope.current === owner && version === selection.current) setMessages(data.messages || []);
    } catch (error) {
      if (mounted.current && scope.current === owner && version === selection.current) {
        setMessages([{ id: `error:${id}`, sender: 'bot', text: error.message, isError: true }]);
      }
    } finally {
      if (mounted.current && scope.current === owner && version === selection.current) setIsLoadingMessages(false);
    }
  }, [authScopeKey]);

  const createNewChat = useCallback(async (switchFocus = true) => {
    const owner = authScopeKey;
    const version = switchFocus ? ++selection.current : selection.current;
    try {
      const created = await api.createConversation();
      if (!mounted.current || scope.current !== owner) return null;
      setConversations((prev) => [created, ...prev]);
      if (switchFocus && version === selection.current) {
        selected.current = created.id;
        setConversationId(created.id);
        setMessages([]);
        setIsLoadingMessages(false);
      }
      return created;
    } catch (error) {
      if (mounted.current && scope.current === owner) alert(error.message);
      return null;
    }
  }, [authScopeKey]);

  const deleteConversation = useCallback(async (id) => {
    const owner = authScopeKey;
    try {
      await api.deleteConversation(id);
      if (!mounted.current || scope.current !== owner) return;
      setConversations((prev) => prev.filter((item) => item.id !== id));
      if (selected.current === id) {
        ++selection.current;
        selected.current = null;
        setConversationId(null);
        setMessages([]);
        setIsLoadingMessages(false);
      }
    } catch (error) {
      if (mounted.current && scope.current === owner) alert(error.message);
    }
  }, [authScopeKey]);

  const updateConversationTitle = useCallback(async (id, title, { silent = false } = {}) => {
    const normalized = title.trim().slice(0, 200);
    if (!normalized) return;
    const owner = authScopeKey;
    try {
      await api.updateConversationTitle(id, normalized);
      if (mounted.current && scope.current === owner) {
        setConversations((prev) => prev.map((item) => item.id === id ? { ...item, title: normalized } : item));
      }
    } catch (error) {
      if (mounted.current && scope.current === owner && !silent) alert(error.message);
    }
  }, [authScopeKey]);

  useEffect(() => {
    mounted.current = true;
    ++selection.current;
    ++listVersion.current;
    selected.current = null;
    setConversationId(null);
    setConversations([]);
    setMessages([]);
    setIsLoadingMessages(false);
    if (isMounted) void loadConversations();
    return () => {
      mounted.current = false;
      ++selection.current;
      ++listVersion.current;
    };
  }, [authScopeKey, isMounted, loadConversations]);

  const chooseId = useCallback((id) => {
    ++selection.current;
    selected.current = id;
    setConversationId(id);
  }, []);

  return {
    conversationError, conversationId, setConversationId: chooseId, conversations, messages, setMessages,
    isLoadingConversations, isLoadingMessages, selectConversation,
    createNewChat, loadConversations, deleteConversation, updateConversationTitle,
  };
}

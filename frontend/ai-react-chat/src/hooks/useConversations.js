import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';

export function useConversations({ isMounted, authScopeKey }) {
  const [conversationError, setConversationError] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [messages, updateMessages] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [historyPage, setHistoryPage] = useState(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState('');
  const [historyPrependVersion, setHistoryPrependVersion] = useState(0);
  const scope = useRef(authScopeKey);
  scope.current = authScopeKey;
  const selection = useRef(0);
  const listVersion = useRef(0);
  const selected = useRef(null);
  const mounted = useRef(true);
  const historyCache = useRef(new Map());
  const historyRequest = useRef(null);
  const olderRequest = useRef(null);
  // Mutations from chat/recovery invalidate server snapshots, including drafts.
  const setMessages = useCallback((value) => {
    historyCache.current.delete(selected.current);
    updateMessages(value);
  }, []);

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
    if (selected.current === id && historyRequest.current?.owner === authScopeKey) return;
    historyRequest.current?.controller.abort();
    olderRequest.current?.controller.abort();
    olderRequest.current = null;
    setIsLoadingOlder(false);
    setOlderError('');
    setHistoryPage(null);
    const version = ++selection.current;
    const owner = authScopeKey;
    selected.current = id;
    setConversationId(id);
    const cached = historyCache.current.get(id);
    if (cached?.owner === owner && Date.now() - cached.time < 30000) {
      historyRequest.current = null;
      updateMessages(cached.messages);
      setHistoryPage({ id, ...cached.page });
      setIsLoadingMessages(false);
      return;
    }
    const current = { owner, controller: new AbortController() };
    historyRequest.current = current;
    updateMessages([]);
    setIsLoadingMessages(true);
    try {
      const data = await api.getConversationMessages(id, current.controller.signal);
      if (mounted.current && scope.current === owner && version === selection.current) {
        const loaded = data.messages || [];
        historyCache.current.delete(id);
        historyCache.current.set(id, { owner, time: Date.now(), messages: loaded, page: data });
        if (historyCache.current.size > 10) historyCache.current.delete(historyCache.current.keys().next().value);
        updateMessages(loaded);
        setHistoryPage({ ...data, id });
      }
    } catch (error) {
      if (error.name !== 'AbortError' && mounted.current && scope.current === owner && version === selection.current) {
        historyCache.current.delete(id);
        updateMessages([{ id: `error:${id}`, sender: 'bot', text: error.message, isError: true }]);
      }
    } finally {
      if (historyRequest.current === current) historyRequest.current = null;
      if (mounted.current && scope.current === owner && version === selection.current) setIsLoadingMessages(false);
    }
  }, [authScopeKey]);

  const loadOlderMessages = useCallback(async () => {
    const id = selected.current;
    if (olderRequest.current || historyPage?.id !== id || !historyPage.has_more ||
        !Number.isInteger(historyPage.next_before) || historyPage.next_before < 1) return false;
    const current = { controller: new AbortController(), owner: authScopeKey, version: selection.current };
    olderRequest.current = current;
    setIsLoadingOlder(true);
    setOlderError('');
    const isCurrent = () => mounted.current && scope.current === current.owner &&
      selection.current === current.version && olderRequest.current === current;
    try {
      const data = await api.getConversationMessages(id, current.controller.signal, { before: historyPage.next_before });
      if (!isCurrent()) return false;
      historyCache.current.delete(id);
      updateMessages((previous) => [...(data.messages || []), ...previous]);
      setHistoryPage({ ...data, id });
      setHistoryPrependVersion((value) => value + 1);
      return true;
    } catch (error) {
      if (isCurrent() && error.name !== 'AbortError') setOlderError(error.message);
      return false;
    } finally {
      if (olderRequest.current === current) {
        olderRequest.current = null;
        setIsLoadingOlder(false);
      }
    }
  }, [authScopeKey, historyPage]);

  const replaceHistory = useCallback((id, data) => {
    historyRequest.current?.controller.abort();
    historyRequest.current = null;
    olderRequest.current?.controller.abort();
    olderRequest.current = null;
    ++selection.current;
    selected.current = id;
    historyCache.current.delete(id);
    setConversationId(id);
    updateMessages(data.messages || []);
    setHistoryPage({ ...data, id });
    setIsLoadingMessages(false);
    setIsLoadingOlder(false);
    setOlderError('');
  }, []);

  const createNewChat = useCallback(async (switchFocus = true) => {
    if (switchFocus) {
      historyRequest.current?.controller.abort();
      historyRequest.current = null;
      olderRequest.current?.controller.abort();
      olderRequest.current = null;
      setIsLoadingOlder(false);
      setIsLoadingMessages(false);
    }
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
        setHistoryPage(null);
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
      historyCache.current.delete(id);
      setConversations((prev) => prev.filter((item) => item.id !== id));
      if (selected.current === id) {
        ++selection.current;
        selected.current = null;
        setConversationId(null);
        setMessages([]);
        setHistoryPage(null);
        olderRequest.current?.controller.abort();
        olderRequest.current = null;
        setIsLoadingOlder(false);
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
    historyCache.current.clear();
    setHistoryPage(null);
    setOlderError('');
    setIsLoadingOlder(false);
    ++selection.current;
    ++listVersion.current;
    selected.current = null;
    setConversationId(null);
    setConversations([]);
    setMessages([]);
    setIsLoadingMessages(false);
    if (isMounted) void loadConversations();
    return () => {
      olderRequest.current?.controller.abort();
      olderRequest.current = null;
      historyRequest.current?.controller.abort();
      historyRequest.current = null;
      historyCache.current.clear();
      mounted.current = false;
      ++selection.current;
      ++listVersion.current;
    };
  }, [authScopeKey, isMounted, loadConversations]);

  const chooseId = useCallback((id) => {
    historyRequest.current?.controller.abort();
    historyRequest.current = null;
    ++selection.current;
    selected.current = id;
    setConversationId(id);
    setIsLoadingMessages(false);
  }, []);

  return {
    conversationError, conversationId, setConversationId: chooseId, conversations, messages, setMessages,
    isLoadingConversations, isLoadingMessages, selectConversation,
    createNewChat, loadConversations, deleteConversation, updateConversationTitle,
    hasMoreMessages: historyPage?.id === conversationId && historyPage?.has_more === true,
    isLoadingOlder, olderError, loadOlderMessages, historyPrependVersion, replaceHistory,
  };
}

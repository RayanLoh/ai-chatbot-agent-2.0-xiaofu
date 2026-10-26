import { useEffect, useRef, useState } from 'react';
import * as api from '../api';
import { useLanguage } from '../i18n/LanguageProvider';

export function useChat({
  authScopeKey, onAuthRequired, onSubscriptionRequired, conversationId, setConversationId,
  messages, setMessages, loadConversations, updateConversationTitle, availableModels,
}) {
  const { t } = useLanguage();
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState(null);
  const pendingKey = `xiaofu:pending:${authScopeKey}`;
  const rememberPending = (value) => {
    setPendingRecovery(value);
    try {
      if (value) sessionStorage.setItem(pendingKey, JSON.stringify(value));
      else sessionStorage.removeItem(pendingKey);
    } catch { /* Recovery still works for the current page when storage is unavailable. */ }
  };
  const restoreDraft = (draft) => {
    if (inputRef.current && !inputRef.current.value.trim()) {
      inputRef.current.value = draft.text;
      inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setUploadedImageUrls(draft.images || []);
  };
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('aiModel') || '');
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const active = useRef(null);
  const upload = useRef(null);
  const scope = `${authScopeKey}:${conversationId || ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    try { setPendingRecovery(JSON.parse(sessionStorage.getItem(pendingKey) || 'null')); }
    catch { setPendingRecovery(null); }
  }, [pendingKey]);

  useEffect(() => {
    if (availableModels.length) {
      setAiModel((current) => availableModels.includes(current) ? current : availableModels[0]);
    }
  }, [availableModels]);

  useEffect(() => { if (aiModel) localStorage.setItem('aiModel', aiModel); }, [aiModel]);

  const cancel = (patch = true) => {
    const current = active.current;
    active.current = null;
    if (!current) return;
    current.controller.abort();
    if (patch && scopeRef.current === current.scope) {
      setMessages((prev) => prev.map((message) => message.id === current.botId
        ? { ...message, text: t('Generation stopped.'), isLoading: false, isStreaming: false } : message));
    }
    void api.stopGeneration(current.id).then(() => {
      if (patch && scopeRef.current === current.scope) rememberPending(null);
    }).catch(() => {});
  };

  useEffect(() => {
    setIsGenerating(false);
    setUploadedImageUrls([]);
    setIsUploading(false);
    return () => {
      cancel(false);
      upload.current?.controller.abort();
      upload.current = null;
    };
  }, [scope]);

  const stopGenerating = () => {
    cancel();
    setIsGenerating(false);
  };

  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || upload.current) return;
    if (files.length + uploadedImageUrls.length > 4) {
      alert(t('Attach at most four images.'));
      event.target.value = '';
      return;
    }
    const current = { scope, controller: new AbortController() };
    upload.current = current;
    setIsUploading(true);
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
          throw new Error('Use PNG, JPEG, WebP or GIF images up to 10 MiB.');
        }
        const result = await api.uploadImage(file, current.controller.signal);
        if (upload.current !== current || scopeRef.current !== current.scope) return;
        setUploadedImageUrls((prev) => [...prev, result.url]);
      }
    } catch (error) {
      if (upload.current === current && error.name !== 'AbortError' && scopeRef.current === current.scope) alert(t(error.message));
    } finally {
      if (upload.current === current) {
        upload.current = null;
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const resetComposer = () => {
    cancel();
    setIsGenerating(false);
    upload.current?.controller.abort();
    upload.current = null;
    setIsUploading(false);
    setUploadedImageUrls([]);
    if (inputRef.current) inputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = async () => {
    const text = inputRef.current?.value.trim();
    if (!text || active.current || pendingRecovery || upload.current || !availableModels.includes(aiModel)) return;
    if (text.length > 20000) { alert(t('Messages must be at most 20,000 characters.')); return; }
    const id = crypto.randomUUID();
    const botId = `${id}:bot`;
    const images = [...uploadedImageUrls];
    const title = messages.length === 0 ? text.replace(/\s+/g, ' ').slice(0, 70) : '';
    const current = { id, botId, scope, controller: new AbortController() };
    const draft = { id, text, images, conversationId };
    rememberPending(draft);
    active.current = current;
    const isCurrent = () => active.current === current && scopeRef.current === current.scope;
    setMessages((prev) => [...prev,
      { id: `${id}:user`, sender: 'user', text, images, createdAt: Date.now() },
      { id: botId, sender: 'bot', text: "I'm thinking", isLoading: true, createdAt: Date.now() },
    ]);
    inputRef.current.value = '';
    setIsGenerating(true);
    setUploadedImageUrls([]);
    try {
      let data;
      try {
        data = await api.generateResponse(text, conversationId, aiModel, current.controller.signal, images, id);
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        if (error.requestNotSent) { error.terminal = true; throw error; }
        if (!error.status || error.status >= 500 || error.code === 'GENERATION_RUNNING') {
          data = await api.recoverGeneration(id, current.controller.signal);
        } else {
          error.terminal = true;
          throw error;
        }
      }
      if (!isCurrent()) return;
      rememberPending(null);
      setMessages((prev) => prev.map((message) => message.id === botId
        ? { ...message, text: data.text || '', images: data.images || [], warnings: data.warnings || [], isLoading: false } : message));
      const resolvedId = data.conversation_id || conversationId;
      if (title && resolvedId) await updateConversationTitle(resolvedId, title, { silent: true }).catch(() => {});
      if (!isCurrent()) return;
      await loadConversations().catch(() => {});
      if (!isCurrent()) return;
      window.dispatchEvent(new CustomEvent('xiaofu:dynamic-island', { detail: {
        title: data.images?.length ? 'AI image generated' : 'New reply received',
        subtitle: 'Conversation updated', message: (data.text || 'Image ready').slice(0, 120),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      } }));
      if (resolvedId && resolvedId !== conversationId) setConversationId(resolvedId);
    } catch (error) {
      if (!isCurrent() || error.name === 'AbortError') return;
      if (error.terminal || error.status === 404) {
        rememberPending(null);
        restoreDraft(draft);
      }
      setMessages((prev) => prev.map((message) => message.id === botId ? {
        ...message, text: t(error.message || 'Unable to get a reply. Please retry.'),
        isError: true, isLoading: false,
      } : message));
      if (error.status === 401 || error.code === 'GUEST_LIMIT_REACHED') onAuthRequired();
      if (error.code === 'SUBSCRIPTION_REQUIRED' || error.code === 'PLAN_LIMIT_REACHED') onSubscriptionRequired?.();
    } finally {
      if (active.current === current) {
        active.current = null;
        setIsGenerating(false);
      }
    }
  };

  const resumePendingGeneration = async () => {
    if (!pendingRecovery || active.current) return;
    const draft = pendingRecovery;
    const current = { id: draft.id, scope, controller: new AbortController() };
    active.current = current;
    setIsGenerating(true);
    try {
      const result = await api.recoverGeneration(draft.id, current.controller.signal);
      if (active.current !== current || scopeRef.current !== current.scope) return;
      const data = await api.getConversationMessages(result.conversation_id);
      if (active.current !== current || scopeRef.current !== current.scope) return;
      rememberPending(null);
      setMessages(data.messages || []);
      await loadConversations().catch(() => {});
      if (active.current === current && scopeRef.current === current.scope) setConversationId(result.conversation_id);
    } catch (error) {
      if (active.current !== current || scopeRef.current !== current.scope || error.name === 'AbortError') return;
      if (error.terminal || error.status === 404) {
        rememberPending(null);
        restoreDraft(draft);
      }
      alert(t(error.message));
    } finally {
      if (active.current === current) { active.current = null; setIsGenerating(false); }
    }
  };

  const restorePendingDraft = () => {
    if (!pendingRecovery || active.current) return;
    if (!window.confirm(t('Restore this draft? The previous request may still finish. Sending again starts a new request.'))) return;
    const draft = pendingRecovery;
    rememberPending(null);
    restoreDraft(draft);
  };

  return {
    aiModel, setAiModel, inputRef, fileInputRef, isGenerating, uploadedImageUrls, isUploading,
    handleImageUpload, removeUploadedImage: (index) => setUploadedImageUrls((prev) => prev.filter((_, i) => i !== index)),
    resetComposer, stopGenerating, sendMessage, pendingRecovery, resumePendingGeneration, restorePendingDraft,
  };
}

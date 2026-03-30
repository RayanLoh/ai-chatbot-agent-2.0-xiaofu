import { useEffect, useRef, useState } from 'react';

import * as api from '../api';

const DEFAULT_AI_MODEL = 'models/gemini-2.5-flash';
const LEGACY_DEFAULT_MODELS = new Set([
  'models/gemini-3-flash-preview',
  'models/gemini-3.1-pro-preview',
]);

export function useChat({
  isLoggedIn,
  onAuthRequired,
  conversationId,
  setConversationId,
  messages,
  setMessages,
  loadConversations,
  selectConversation,
  updateConversationTitle,
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL);
  const [hasLoadedAiModel, setHasLoadedAiModel] = useState(false);

  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);
  const revealTimeoutRef = useRef(null);
  const activeRevealMessageIdRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedModel = localStorage.getItem('aiModel');
    if (savedModel && !LEGACY_DEFAULT_MODELS.has(savedModel)) {
      setAiModel(savedModel);
    } else {
      setAiModel(DEFAULT_AI_MODEL);
    }

    setHasLoadedAiModel(true);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && hasLoadedAiModel) {
      localStorage.setItem('aiModel', aiModel);
    }
  }, [aiModel, hasLoadedAiModel]);

  useEffect(() => () => {
    if (revealTimeoutRef.current) {
      window.clearTimeout(revealTimeoutRef.current);
    }
  }, []);

  const buildConversationTitle = (text) => {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    if (!normalizedText) return '';
    return normalizedText.length > 70 ? `${normalizedText.slice(0, 67).trimEnd()}...` : normalizedText;
  };

  const dispatchDynamicIsland = (payload) => {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(new CustomEvent('xiaofu:dynamic-island', {
      detail: payload,
    }));
  };

  const isAuthLimitError = (error) => {
    if (!error) return false;

    const status = Number(error.status);
    const candidates = [error.code, error.reason, error.detail, error.message]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const hasLimitSignal = /guest|trial|limit|quota|sign in|signin|login|auth required|authentication/.test(candidates);

    return (status === 401 || status === 403 || status === 429) && hasLimitSignal;
  };

  const getVisibleErrorMessage = (error) => {
    if (!error) {
      return 'Oops, the connection dropped... Ei-Heh?';
    }

    if (isAuthLimitError(error)) {
      return 'Guest trial finished. Please sign in with Google to continue chatting.';
    }

    const detail = typeof error.detail === 'string' ? error.detail.trim() : '';
    const message = typeof error.message === 'string' ? error.message.trim() : '';
    const status = Number(error.status || 0);

    if (detail) {
      return detail;
    }

    if (message && !message.startsWith('HTTP error!')) {
      return message;
    }

    if (status === 500) {
      return 'The AI service failed while processing this request. Please try again.';
    }

    if (status === 503) {
      return 'The AI service is temporarily unavailable. Please try again in a moment.';
    }

    if (status === 429) {
      return 'Too many requests were sent in a short time. Please wait a moment and retry.';
    }

    return 'Oops, the connection dropped... Ei-Heh?';
  };

  const handleImageUpload = async (event) => {
    const files = event.target.files;
    if (!files) return;

    setIsUploading(true);
    const newUrls = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        console.log(`📤 [${index + 1}/${files.length}] Uploading image: ${file.name}, size: ${(file.size / 1024).toFixed(2)}KB, type: ${file.type}`);

        try {
          const result = await api.uploadImage(file);
          console.log('📤 Upload response:', result);

          if (result && result.url) {
            newUrls.push(result.url);
            console.log(`✅ Image ${index + 1} uploaded successfully: ${result.url}`);
          } else {
            console.error(`❌ No URL returned for image ${index + 1}:`, result);
            alert(`Image ${file.name} upload failed: No URL returned`);
          }
        } catch (uploadError) {
          console.error(`❌ Upload failed for image ${index + 1}:`, uploadError);
          alert(`Failed to upload ${file.name}: ${uploadError.message}`);
        }
      }

      if (newUrls.length > 0) {
        console.log(`✅ Total ${newUrls.length} images uploaded, adding to state`);
        setUploadedImageUrls((prev) => [...prev, ...newUrls]);
      } else {
        console.warn('⚠️ No images were successfully uploaded');
      }
    } catch (error) {
      console.error('❌ Error uploading images:', error);
      alert(`Failed to upload images: ${error.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeUploadedImage = (index) => {
    setUploadedImageUrls((prev) => prev.filter((_, imageIndex) => imageIndex !== index));
  };

  const resetComposer = () => {
    setUploadedImageUrls([]);

    if (inputRef.current) {
      inputRef.current.value = '';
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const patchBotMessage = (messageId, updater) => {
    setMessages((prev) => prev.map((message) => (
      message.id === messageId
        ? { ...message, ...updater(message) }
        : message
    )));
  };

  const revealBotText = (messageId, fullText, images = []) => new Promise((resolve) => {
    const normalizedText = (fullText || '').trim();

    if (!normalizedText) {
      patchBotMessage(messageId, () => ({
        text: '',
        images,
        isLoading: false,
        isStreaming: false,
      }));
      resolve();
      return;
    }

    if (revealTimeoutRef.current) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }

    activeRevealMessageIdRef.current = messageId;
    let cursor = 0;
    const totalLength = normalizedText.length;

    const finishReveal = () => {
      patchBotMessage(messageId, () => ({
        text: normalizedText,
        images,
        isLoading: false,
        isStreaming: false,
      }));
      activeRevealMessageIdRef.current = null;
      revealTimeoutRef.current = null;
      resolve();
    };

    const stepReveal = () => {
      if (activeRevealMessageIdRef.current !== messageId) {
        resolve();
        return;
      }

      const remaining = totalLength - cursor;
      const stride = Math.max(1, Math.ceil(remaining / 26));
      cursor = Math.min(totalLength, cursor + stride);

      while (cursor < totalLength && /[\s，。！？；：,.!?;:]/.test(normalizedText[cursor])) {
        cursor += 1;
      }

      patchBotMessage(messageId, () => ({
        text: normalizedText.slice(0, cursor),
        images: [],
        isLoading: false,
        isStreaming: cursor < totalLength,
      }));

      if (cursor >= totalLength) {
        finishReveal();
        return;
      }

      revealTimeoutRef.current = window.setTimeout(stepReveal, normalizedText.length > 320 ? 18 : 28);
    };

    patchBotMessage(messageId, () => ({
      text: '',
      images: [],
      isLoading: false,
      isStreaming: true,
    }));

    stepReveal();
  });

  const stopGenerating = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (revealTimeoutRef.current) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }

    if (activeRevealMessageIdRef.current) {
      patchBotMessage(activeRevealMessageIdRef.current, (message) => ({
        text: message.text,
        isLoading: false,
        isStreaming: false,
      }));
      activeRevealMessageIdRef.current = null;
    }

    try {
      await api.stopGeneration();
    } catch (error) {
      console.error('Failed to request stop generation:', error);
    }

    setIsGenerating(false);
  };

  const sendMessage = async () => {
    const msg = inputRef.current?.value.trim();
    if (!msg || isGenerating) return;

    const currentConvId = conversationId;
    const shouldUseFirstMessageAsTitle = messages.length === 0;
    const derivedTitle = shouldUseFirstMessageAsTitle ? buildConversationTitle(msg) : '';
    const userMsgId = `msg_${Date.now()}_user`;
    const botMsgId = `msg_${Date.now()}_bot`;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: msg,
        images: uploadedImageUrls,
        createdAt: Date.now(),
      },
    ]);

    inputRef.current.value = '';
    setIsGenerating(true);

    setMessages((prev) => [
      ...prev,
      {
        id: botMsgId,
        sender: 'bot',
        text: 'I\'m Thinking',
        isLoading: true,
        createdAt: Date.now(),
      },
    ]);

    abortControllerRef.current = new AbortController();

    try {
      const data = await api.generateResponse(
        msg,
        currentConvId,
        aiModel,
        abortControllerRef.current.signal,
        uploadedImageUrls,
      );

      await revealBotText(botMsgId, data.text || '', data.images || []);

      if (data.conversation_id && currentConvId !== data.conversation_id) {
        await loadConversations();
        setConversationId?.(data.conversation_id);
        localStorage.setItem('lastConversationId', data.conversation_id);
      }

      const resolvedConversationId = data.conversation_id || currentConvId;
      if (shouldUseFirstMessageAsTitle && resolvedConversationId && derivedTitle) {
        await updateConversationTitle(resolvedConversationId, derivedTitle, { silent: true });
      }

      const generatedImages = Array.isArray(data.images) ? data.images.filter(Boolean) : [];

      if (generatedImages.length > 0) {
        dispatchDynamicIsland({
          title: generatedImages.length === 1 ? 'AI image generated' : 'AI images generated',
          subtitle: resolvedConversationId ? 'Image creation complete' : 'Image ready',
          message: generatedImages.length === 1
            ? '1 AI-generated image is ready in this conversation.'
            : `${generatedImages.length} AI-generated images are ready in this conversation.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      } else {
        dispatchDynamicIsland({
          title: 'New reply received',
          subtitle: resolvedConversationId ? 'Conversation updated' : 'Live response',
          message: ((data.text || '').trim() || 'Your assistant has sent a new message.').slice(0, 120),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }

      setUploadedImageUrls([]);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Front-end error:', error);
        if (revealTimeoutRef.current) {
          window.clearTimeout(revealTimeoutRef.current);
          revealTimeoutRef.current = null;
        }
        activeRevealMessageIdRef.current = null;
        setMessages((prev) => {
          const updated = [...prev];
          const lastMessageIndex = updated.findIndex((message) => message.id === botMsgId);

          if (lastMessageIndex !== -1) {
            updated[lastMessageIndex] = {
              id: botMsgId,
              sender: 'bot',
              text: getVisibleErrorMessage(error),
              isError: true,
              isLoading: false,
              isStreaming: false,
              createdAt: Date.now(),
            };
          }

          return updated;
        });

        if (isAuthLimitError(error)) {
          onAuthRequired();
        }
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  return {
    aiModel,
    setAiModel,
    inputRef,
    fileInputRef,
    isGenerating,
    uploadedImageUrls,
    isUploading,
    handleImageUpload,
    removeUploadedImage,
    resetComposer,
    stopGenerating,
    sendMessage,
  };
}
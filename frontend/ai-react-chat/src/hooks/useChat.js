import { useEffect, useRef, useState } from 'react';

import * as api from '../api';

export function useChat({
  isLoggedIn,
  onAuthRequired,
  conversationId,
  messages,
  setMessages,
  loadConversations,
  selectConversation,
  updateConversationTitle,
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [aiModel, setAiModel] = useState('models/gemini-3-flash-preview');
  const [hasLoadedAiModel, setHasLoadedAiModel] = useState(false);

  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedModel = localStorage.getItem('aiModel');
    if (savedModel) {
      setAiModel(savedModel);
    }

    setHasLoadedAiModel(true);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && hasLoadedAiModel) {
      localStorage.setItem('aiModel', aiModel);
    }
  }, [aiModel, hasLoadedAiModel]);

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

  const stopGenerating = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
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

    if (!isLoggedIn) {
      onAuthRequired();
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_system`,
          sender: 'bot',
          text: 'Please log in to send a message.',
          isError: true,
          createdAt: Date.now(),
        },
      ]);
      return;
    }

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

      setMessages((prev) => {
        const updated = [...prev];
        const lastMessageIndex = updated.findIndex((message) => message.id === botMsgId);

        if (lastMessageIndex !== -1) {
          updated[lastMessageIndex] = {
            id: botMsgId,
            sender: 'bot',
            text: (data.text || '').trim(),
            images: data.images || [],
            createdAt: Date.now(),
          };
        }

        return updated;
      });

      if (data.conversation_id && currentConvId !== data.conversation_id) {
        await loadConversations();
        await selectConversation(data.conversation_id);
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
        setMessages((prev) => {
          const updated = [...prev];
          const lastMessageIndex = updated.findIndex((message) => message.id === botMsgId);

          if (lastMessageIndex !== -1) {
            updated[lastMessageIndex] = {
              id: botMsgId,
              sender: 'bot',
              text: 'Oops, the connection dropped... Ei-Heh?',
              createdAt: Date.now(),
            };
          }

          return updated;
        });
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
    stopGenerating,
    sendMessage,
  };
}
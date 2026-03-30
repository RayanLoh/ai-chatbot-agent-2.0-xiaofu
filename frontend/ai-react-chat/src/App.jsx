import { useEffect, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import SlideBar from "./component/SlideBar";
import Header from "./component/Header";
import Footer from "./component/Footer";
import DynamicIsland from "./component/DynamicIsland";
import Settings from "./component/Settings";
import LoginModal from "./component/LoginModal";
import "./index.css";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Maximize2, Download, X, Image } from 'lucide-react';
import { buildDownloadImageUrl } from './api';
import { useAuth } from './hooks/useAuth';
import { useChat } from './hooks/useChat';
import { useConversations } from './hooks/useConversations';
import { useTheme } from './hooks/useTheme';

const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 768;
const MOBILE_TEXTAREA_MIN_HEIGHT = 48;
const DESKTOP_TEXTAREA_MIN_HEIGHT = 44;
const MOBILE_TEXTAREA_MAX_HEIGHT = 140;
const DESKTOP_TEXTAREA_MAX_HEIGHT = 84;
const PULL_REFRESH_THRESHOLD = 72;
const PULL_REFRESH_MAX_DISTANCE = 104;

const modelOptions = [
  { value: 'models/gemini-2.5-flash', label: 'Gemini 2.5 Flash', compactLabel: '2.5 Flash' },
  { value: 'models/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image', compactLabel: '2.5 Image' },
  { value: 'models/gemini-2.5-pro', label: 'Gemini 2.5 Pro', compactLabel: '2.5 Pro' },
  { value: 'models/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', compactLabel: '3 Pro' },
  { value: 'models/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', compactLabel: '3 Flash' },
  { value: 'models/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', compactLabel: '3.1 Pro' },
  { value: 'models/gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview', compactLabel: '3 Image' },
  { value: 'models/nano-banana-pro-preview', label: 'Nano Banana Pro Preview', compactLabel: 'Nano' },
  { value: 'models/deep-research-pro-preview-12-2025', label: 'Deep Research Pro Preview 12-2025', compactLabel: 'Research' },
];

const isTouchDevice = () => {
  if (typeof window === 'undefined') return false;

  return Boolean(
    navigator.maxTouchPoints > 0
    || window.matchMedia?.('(pointer: coarse)').matches
    || 'ontouchstart' in window
  );
};

const normalizeBotMarkdown = (value = '') => value
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/"\*\*([^*]+)\*\*"/g, '**"$1"**')
  .replace(/'\*\*([^*]+)\*\*'/g, "**'$1'**")
  .replace(/\*\*\s+(["'])/g, '**$1')
  .replace(/(["'])\s+\*\*/g, '$1**');

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [previewImage, setPreviewImage] = useState(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() => isMobile());
  const [isDesktopNonTouch, setIsDesktopNonTouch] = useState(() => !isMobile() && !isTouchDevice());
  const [pullDistance, setPullDistance] = useState(0);

  const {
    clientId,
    GoogleProvider,
    isLoggedIn,
    isMounted,
    openLoginModal,
    closeLoginModal,
    handleLoginSuccess,
    handleLogout,
    showLoginModal,
    user,
  } = useAuth();

  const {
    theme,
    handleThemeChange,
    toggleTheme,
  } = useTheme();

  const {
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
  } = useConversations({
    isLoggedIn,
    isMounted,
    authScopeKey: user?.sub || (isLoggedIn ? 'authenticated' : 'guest'),
  });

  const {
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
  } = useChat({
    isLoggedIn,
    onAuthRequired: openLoginModal,
    conversationId,
    setConversationId,
    messages,
    setMessages,
    loadConversations,
    selectConversation,
    updateConversationTitle,
  });

  const messagesContainerRef = useRef(null);
  const hasInitializedScrollRef = useRef(false);
  const scrollAnimationFrameRef = useRef(null);
  const imageScrollTimeoutRef = useRef(null);
  const pullStartYRef = useRef(null);
  const isPullingToRefreshRef = useRef(false);

  const resetTextareaHeight = (textarea) => {
    if (!textarea) {
      return;
    }

    const minHeight = isMobileViewport ? MOBILE_TEXTAREA_MIN_HEIGHT : DESKTOP_TEXTAREA_MIN_HEIGHT;
    textarea.style.height = `${minHeight}px`;
    textarea.style.overflowY = 'hidden';
  };

  const autoResizeTextarea = (textarea) => {
    if (!textarea) {
      return;
    }

    const minHeight = isMobileViewport ? MOBILE_TEXTAREA_MIN_HEIGHT : DESKTOP_TEXTAREA_MIN_HEIGHT;
    const maxHeight = isMobileViewport ? MOBILE_TEXTAREA_MAX_HEIGHT : DESKTOP_TEXTAREA_MAX_HEIGHT;
    textarea.style.height = `${minHeight}px`;

    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.max(nextHeight, minHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    const handleResize = () => {
      const mobileViewport = isMobile();
      setIsMobileViewport(mobileViewport);
      setIsDesktopNonTouch(!mobileViewport && !isTouchDevice());
      setIsSidebarOpen(!mobileViewport);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    autoResizeTextarea(inputRef.current);
  }, [isMobileViewport]);

  const scrollToBottom = (behavior = 'smooth') => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (scrollAnimationFrameRef.current) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    if (behavior === 'animated') {
      const startTop = container.scrollTop;
      const targetTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      const distance = targetTop - startTop;

      if (Math.abs(distance) < 4) {
        container.scrollTop = targetTop;
        return;
      }

      const duration = 420;
      const startTime = performance.now();
      const easeOutCubic = (progress) => 1 - Math.pow(1 - progress, 3);

      const step = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        container.scrollTop = startTop + distance * easeOutCubic(progress);

        if (progress < 1) {
          scrollAnimationFrameRef.current = window.requestAnimationFrame(step);
        } else {
          scrollAnimationFrameRef.current = null;
        }
      };

      scrollAnimationFrameRef.current = window.requestAnimationFrame(step);
      return;
    }

    container.scrollTo({
      top: Math.max(container.scrollHeight - container.clientHeight, 0),
      behavior,
    });
  };

  useEffect(() => {
    if (isLoadingMessages || messages.length === 0) {
      return undefined;
    }

    const behavior = hasInitializedScrollRef.current ? 'smooth' : 'animated';
    const frameId = window.requestAnimationFrame(() => {
      scrollToBottom(behavior);
      hasInitializedScrollRef.current = true;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [conversationId, isLoadingMessages, messages]);

  useEffect(() => {
    if (isLoadingMessages) {
      hasInitializedScrollRef.current = false;
    }
  }, [isLoadingMessages]);

  useEffect(() => () => {
    if (scrollAnimationFrameRef.current) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
    }

    if (imageScrollTimeoutRef.current) {
      window.clearTimeout(imageScrollTimeoutRef.current);
    }
  }, []);

  const handlePullRefreshStart = (event) => {
    if (!isMobileViewport) return;

    const container = messagesContainerRef.current;
    if (!container || container.scrollTop > 0) return;

    pullStartYRef.current = event.touches[0]?.clientY ?? null;
    isPullingToRefreshRef.current = pullStartYRef.current !== null;
  };

  const handlePullRefreshMove = (event) => {
    if (!isMobileViewport || !isPullingToRefreshRef.current || pullStartYRef.current === null) {
      return;
    }

    const container = messagesContainerRef.current;
    if (!container || container.scrollTop > 0) {
      isPullingToRefreshRef.current = false;
      pullStartYRef.current = null;
      setPullDistance(0);
      return;
    }

    const currentY = event.touches[0]?.clientY ?? pullStartYRef.current;
    const delta = currentY - pullStartYRef.current;

    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    setPullDistance(Math.min(Math.round(delta * 0.45), PULL_REFRESH_MAX_DISTANCE));
  };

  const handlePullRefreshEnd = () => {
    if (!isPullingToRefreshRef.current) {
      setPullDistance(0);
      return;
    }

    const shouldRefresh = pullDistance >= PULL_REFRESH_THRESHOLD;
    isPullingToRefreshRef.current = false;
    pullStartYRef.current = null;
    setPullDistance(0);

    if (shouldRefresh) {
      window.location.reload();
    }
  };

  const showNewConversationHint = !isLoadingMessages && messages.length === 0;
  const showDynamicIsland = isDesktopNonTouch;

const appContent = (
  <div className="app-container">
    {showDynamicIsland ? <DynamicIsland /> : null}
    <Header 
      onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      theme={theme}
      onThemeToggle={toggleTheme}
      user={user}
      isLoggedIn={isLoggedIn}
      onLogout={handleLogout}
      onLogin={openLoginModal}
    />
    <div className="main-container">
      <div className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`} onClick={() => setIsSidebarOpen(false)} />
      
      <SlideBar
        conversations={conversations}
        isLoading={isLoadingConversations}
        onSelectConversation={(id) => {
          selectConversation(id);
          if (isMobile()) setIsSidebarOpen(false);
        }}
        onDeleteConversation={deleteConversation}
        onNewChat={async () => {
          resetComposer();
          const newConversation = await createNewChat();

          if (inputRef.current) {
            inputRef.current.focus();
            resetTextareaHeight(inputRef.current);
          }

          if (newConversation && isMobile()) {
            setIsSidebarOpen(false);
          }
        }}
        onUpdateTitle={updateConversationTitle}
        currentConversationId={conversationId}
        isOpen={isSidebarOpen}
      />

      <div className={`chat-container ${isSidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        {isMobileViewport ? (
          <div className={`pull-refresh-indicator ${pullDistance >= PULL_REFRESH_THRESHOLD ? 'ready' : ''}`} style={{ height: `${pullDistance}px` }}>
            <span>{pullDistance >= PULL_REFRESH_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
          </div>
        ) : null}
        <div
          ref={messagesContainerRef}
          className="messages"
          style={pullDistance > 0 ? { transform: `translateY(${pullDistance}px)` } : undefined}
          onTouchStart={handlePullRefreshStart}
          onTouchMove={handlePullRefreshMove}
          onTouchEnd={handlePullRefreshEnd}
          onTouchCancel={handlePullRefreshEnd}
          onLoadCapture={(event) => {
            if (typeof HTMLImageElement === 'undefined') {
              return;
            }

            if (event.target instanceof HTMLImageElement) {
              if (imageScrollTimeoutRef.current) {
                window.clearTimeout(imageScrollTimeoutRef.current);
              }

              imageScrollTimeoutRef.current = window.setTimeout(() => {
                scrollToBottom('smooth');
                imageScrollTimeoutRef.current = null;
              }, 80);
            }
          }}
        >
          {isLoadingMessages ? (
            <div className="msg bot loading"><p>Loading messages...</p></div>
          ) : showNewConversationHint ? (
            <div className="empty-chat-hint">
              <p className="empty-chat-title">Start a new conversation</p>
              <p className="empty-chat-text">Type your message in the box below and press Send. Your new conversation will appear automatically after the first message is sent.</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={m.id || i} className={`msg ${m.sender} ${m.isLoading ? 'loading' : ''} ${m.isStreaming ? 'streaming' : ''} ${m.isError ? 'error' : ''}`}>
                {m.sender === "bot" ? (
                  <>
                    {m.text && (
                      m.isStreaming ? (
                        <pre>{normalizeBotMarkdown(m.text)}</pre>
                      ) : (
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            pre: ({ node, ...props }) => <div className="code-block-wrapper"><pre {...props} /></div>,
                            code: ({ node, inline, ...props }) => inline ? <code className="inline-code" {...props} /> : <code className="block-code" {...props} />
                          }}
                        >
                          {normalizeBotMarkdown(m.text)}
                        </ReactMarkdown>
                      )
                    )}
                    
                    {m.images && m.images.map((imgUrl, index) => (
                      <div key={index} className="image-result-container">
                        <img 
                          src={imgUrl} 
                          alt={`AI Generated Art ${index + 1}`}
                          className="generated-image"
                          loading="lazy"
                        />
                        <div className="image-overlay">
                          <div className="overlay-actions">
                            <button className="icon-btn" onClick={() => setPreviewImage(imgUrl)} title="Preview (Enlarge)">
                              <Maximize2 size={24} />
                            </button>
                            <a 
                              href={buildDownloadImageUrl(imgUrl)}
                              className="icon-btn"
                              title="Download Image"
                            >
                              <Download size={24} />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <pre>{m.text}</pre>
                    {m.images && m.images.length > 0 && (
                      <div className="user-images-container">
                        {m.images.map((imgUrl, index) => (
                          <div key={index} className="user-uploaded-image">
                            <img 
                              src={imgUrl} 
                              alt={`User Uploaded ${index + 1}`}
                              className="user-image"
                              loading="lazy"
                              onClick={() => setPreviewImage(imgUrl)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>

          {previewImage && (
            <div className="fullscreen-preview-modal" onClick={() => setPreviewImage(null)}>
              <span className="close-preview" onClick={() => setPreviewImage(null)}>×</span>
              <img src={previewImage} alt="Fullscreen Preview" className="preview-image-large" onClick={(e) => e.stopPropagation()} />
            </div>
          )}
          <div className="input-box">
            <div className="input-main-row">
              <select 
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="model-select-input"
                title="Choose AI Model"
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {isMobileViewport ? option.compactLabel : option.label}
                  </option>
                ))}
              </select>
              <textarea
                ref={inputRef}
                placeholder="Ask something..."
                rows="1"
                className="chat-textarea"
                onInput={(e) => autoResizeTextarea(e.target)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !isGenerating) {
                    e.preventDefault();
                    sendMessage();
                    resetTextareaHeight(e.target);
                  }
                }}
              ></textarea>
              <div className="input-actions">
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isGenerating}
                className="upload-btn"
                title="Upload image for AI analysis"
                aria-label={isUploading ? 'Uploading image' : 'Upload image'}
              >
                <Image size={20} />
                <span className="upload-btn-label">{isUploading ? 'Uploading...' : 'Image'}</span>
              </button>
              {isGenerating ? (
                <button onClick={stopGenerating} className="stop send-btn stop-btn">Stop</button>
              ) : (
                <button
                  onClick={() => {
                    sendMessage();
                    resetTextareaHeight(inputRef.current);
                  }}
                  className="send-btn"
                  aria-label="Send message"
                  title="Send message"
                >
                  <span className="send-btn-label">Send</span>
                  <span className="send-btn-icon" aria-hidden="true" />
                </button>
              )}
            </div>
            </div>
          </div>
          {uploadedImageUrls.length > 0 && (
            <div className="uploaded-images-preview">
              <p className="uploaded-images-title">📸 Uploaded ({uploadedImageUrls.length}):</p>
              <div className="images-grid">
                {uploadedImageUrls.map((url, index) => (
                  <div key={index} className="uploaded-image-item">
                    <img 
                      src={url} 
                      alt={`Uploaded ${index + 1}`}
                      onClick={() => setPreviewImage(url)}
                    />
                    <button 
                      className="remove-image-btn"
                      onClick={() => removeUploadedImage(index)}
                      title="Remove image"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
    </div>
    <Footer />
    {showLoginModal && (
      <LoginModal
        onClose={closeLoginModal}
        onLoginSuccess={handleLoginSuccess}
      />
    )}
  </div>
);

  const routesContent = (
    <Routes>
      <Route path="/" element={appContent} />
      <Route path="/settings" element={<>{showDynamicIsland ? <DynamicIsland /> : null}<Settings theme={theme} onThemeChange={handleThemeChange} /></>} />
    </Routes>
  );

  return (
    <div className="app-root" suppressHydrationWarning={true}>
      {GoogleProvider ? (
        <GoogleProvider clientId={clientId}>{routesContent}</GoogleProvider>
      ) : (
        routesContent
      )}
    </div>
  );
}

export default App;

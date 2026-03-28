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

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [previewImage, setPreviewImage] = useState(null);

  const {
    clientId,
    GoogleProvider,
    guestMessageCount,
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
  } = useConversations({ isLoggedIn, isMounted });

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
    stopGenerating,
    sendMessage,
  } = useChat({
    isLoggedIn,
    onAuthRequired: openLoginModal,
    conversationId,
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

  useEffect(() => {
    setIsSidebarOpen(!isMobile());
    const handleResize = () => setIsSidebarOpen(!isMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const showNewConversationHint = !isLoadingMessages && messages.length === 0;

const appContent = (
  <div className="app-container">
    <DynamicIsland />
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
          const newConversation = await createNewChat();
          if (newConversation && isMobile()) {
            setIsSidebarOpen(false);
          }
        }}
        onUpdateTitle={updateConversationTitle}
        currentConversationId={conversationId}
        isOpen={isSidebarOpen}
      />

      <div className={`chat-container ${isSidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <div
          ref={messagesContainerRef}
          className="messages"
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
              <div key={m.id || i} className={`msg ${m.sender} ${m.isLoading ? 'loading' : ''}`}>
                {m.sender === "bot" ? (
                  <>
                    {m.text && (
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          pre: ({ node, ...props }) => <div className="code-block-wrapper"><pre {...props} /></div>,
                          code: ({ node, inline, ...props }) => inline ? <code className="inline-code" {...props} /> : <code className="block-code" {...props} />
                        }}
                      >
                        {m.text}
                      </ReactMarkdown>
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
            <select 
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              className="model-select-input"
              title="Choose AI Model"
            >
              <option value="models/gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="models/gemini-2.5-pro">Gemini 2.5 Pro</option>
              <option value="models/gemini-2.5-flash-preview-tts">Gemini 2.5 Flash Preview TTS</option>
              <option value="models/gemini-2.5-pro-preview-tts">Gemini 2.5 Pro Preview TTS</option>
              <option value="models/gemma-3-1b-it">Gemma 3 1B IT</option>
              <option value="models/gemma-3-4b-it">Gemma 3 4B IT</option>
              <option value="models/gemma-3-12b-it">Gemma 3 12B IT</option>
              <option value="models/gemma-3-27b-it">Gemma 3 27B IT</option>
              <option value="models/gemma-3n-e4b-it">Gemma 3N E4B IT</option>
              <option value="models/gemma-3n-e2b-it">Gemma 3N E2B IT</option>
              <option value="models/gemini-pro-latest">Gemini Pro Latest</option>
              <option value="models/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
              <option value="models/gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
              <option value="models/gemini-2.5-flash-lite-preview-09-2025">Gemini 2.5 Flash Lite Preview 09-2025</option>
              <option value="models/gemini-3-pro-preview">Gemini 3 Pro Preview</option>
              <option value="models/gemini-3-flash-preview">Gemini 3 Flash Preview</option>
              <option value="models/gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
              <option value="models/gemini-3.1-pro-preview-customtools">Gemini 3.1 Pro Preview CustomTools</option>
              <option value="models/gemini-3-pro-image-preview">Gemini 3 Pro Image Preview</option>
              <option value="models/nano-banana-pro-preview">Nano Banana Pro Preview</option>
              <option value="models/gemini-2.5-computer-use-preview-10-2025">Gemini 2.5 Computer Use Preview 10-2025</option>
              <option value="models/deep-research-pro-preview-12-2025">Deep Research Pro Preview 12-2025</option>
            </select>
            <textarea
              ref={inputRef}
              placeholder="Ask something..."
              rows="1"
              className="chat-textarea"
              onInput={(e) => {
                e.target.style.height = '44px';
                const newHeight = e.target.scrollHeight;
                e.target.style.height = `${newHeight}px`;
                e.target.style.overflowY = newHeight > 84 ? 'auto' : 'hidden';
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !isGenerating) {
                  e.preventDefault();
                  sendMessage();
                  e.target.style.height = '44px';
                  e.target.style.overflowY = 'hidden';
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
              >
                <Image size={20} />
                {isUploading ? 'Uploading...' : 'Image'}
              </button>
              {isGenerating ? (
                <button onClick={stopGenerating} className="stop">Stop</button>
              ) : (
                <button onClick={sendMessage}>Send</button>
              )}
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
      <Route path="/settings" element={<><DynamicIsland /><Settings theme={theme} onThemeChange={handleThemeChange} /></>} />
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

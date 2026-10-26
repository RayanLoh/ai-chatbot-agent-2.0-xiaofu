import AssetImage from './component/AssetImage';
import SubscriptionModal from './component/SubscriptionModal';
import { useLanguage } from './i18n/LanguageProvider';
import { useEffect, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import SlideBar from "./component/SlideBar";
import Header from "./component/Header";
import Footer from "./component/Footer";
import DynamicIsland from "./component/DynamicIsland";
import Settings from "./component/Settings";
import LoginModal from "./component/LoginModal";
import ModelPicker from "./component/ModelPicker";
import "./index.css";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Maximize2, Download, X, Image, Sparkles, ArrowUp, PenLine, Compass, Palette, Square, ShieldCheck } from 'lucide-react';
import { downloadImage, getModels } from './api';
import { useAuth } from './hooks/useAuth';
import { useChat } from './hooks/useChat';
import { useConversations } from './hooks/useConversations';
import { useTheme } from './hooks/useTheme';
import { requestJson } from './api/http';

const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 768;
const MOBILE_TEXTAREA_MIN_HEIGHT = 48;
const DESKTOP_TEXTAREA_MIN_HEIGHT = 44;
const MOBILE_TEXTAREA_MAX_HEIGHT = 140;
const DESKTOP_TEXTAREA_MAX_HEIGHT = 84;
const PULL_REFRESH_THRESHOLD = 72;
const PULL_REFRESH_MAX_DISTANCE = 104;



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
  const { t, language } = useLanguage();
  const [hasDraft, setHasDraft] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [modelOptions, setModelOptions] = useState([]);
  const [modelError, setModelError] = useState('');
  useEffect(() => {
    let alive = true;
    getModels().then((models) => {
      if (alive) setModelOptions(models);
    }).catch((error) => { if (alive) setModelError(error.message); });
    return () => { alive = false; };
  }, []);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isMobile());
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

  const [recoveryAccess, setRecoveryAccess] = useState(null);
  const accountId = user?.sub;
  useEffect(() => {
    if (!isLoggedIn || !accountId) return;
    const controller = new AbortController();
    let expiryTimer;
    requestJson('/billing/status', { signal: controller.signal }).then((status) => {
      if (controller.signal.aborted) return;
      const remaining = new Date(status.valid_until).getTime() - Date.now();
      const enabled = status.plan === 'pro' && remaining > 0;
      setRecoveryAccess({ owner: accountId, enabled });
      if (enabled) {
        const expiresAt = new Date(status.valid_until).getTime();
        const expire = () => {
          const delay = expiresAt - Date.now();
          if (delay <= 0) setRecoveryAccess({ owner: accountId, enabled: false });
          else expiryTimer = setTimeout(expire, Math.min(delay, 2147483647));
        };
        expire();
      }
    }).catch(() => {
      // A billing outage must not erase a subscriber's saved recovery record.
      if (!controller.signal.aborted) setRecoveryAccess({ owner: accountId, enabled: null });
    });
    return () => { controller.abort(); clearTimeout(expiryTimer); };
  }, [isLoggedIn, accountId, showSubscription]);
  const recoveryEnabled = !isLoggedIn ? false : recoveryAccess?.owner === accountId ? recoveryAccess.enabled : null;

  const {
    theme,
    handleThemeChange,
    toggleTheme,
  } = useTheme();

  const {
    conversationError,
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
    pendingRecovery,
    resumePendingGeneration,
    restorePendingDraft,
  } = useChat({
    recoveryEnabled,
    authScopeKey: user?.sub || 'guest',
    availableModels: modelOptions.filter((option) => option.available !== false).map((option) => option.value),
    onAuthRequired: openLoginModal,
    onSubscriptionRequired: () => setShowSubscription(true),
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
      sidebarOpen={isSidebarOpen}
      onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      theme={theme}
      onThemeToggle={toggleTheme}
      user={user}
      isLoggedIn={isLoggedIn}
      onLogout={() => { resetComposer(); setHasDraft(false); handleLogout(); }}
      onLogin={openLoginModal}
    />
    <div className="main-container">
      <div className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`} onClick={() => setIsSidebarOpen(false)} />
      
      <SlideBar
        error={conversationError}
        onRetry={loadConversations}
        conversations={conversations}
        isLoading={isLoadingConversations}
        onSelectConversation={(id) => {
          resetComposer(); setHasDraft(false);
          selectConversation(id);
          if (isMobile()) setIsSidebarOpen(false);
        }}
        onDeleteConversation={deleteConversation}
        onNewChat={async () => {
          resetComposer(); setHasDraft(false);
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
            <span>{pullDistance >= PULL_REFRESH_THRESHOLD ? t("Release to refresh") : t("Pull to refresh")}</span>
          </div>
        ) : null}
        <div
          ref={messagesContainerRef}
          className="messages"
          aria-label={t("聊天消息")}
          aria-busy={isLoadingMessages}
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
            <div className="msg bot loading"><p>{t("Loading messages...")}</p></div>
          ) : showNewConversationHint ? (
            <section className="welcome">
              <div className="welcome-art" aria-hidden="true"><span className="welcome-orbit" /><Sparkles size={68} strokeWidth={1} /></div>
              <h1>{t("嗨，我是小芙。")}</h1>
              <p className="welcome-description">{t("想聊点什么？")}</p>
              <div className="starter-grid">
                {[
                  { icon: PenLine, title: '写点不一样的', description: '让文字，更像你自己', prompt: '帮我写一段有个人风格的自我介绍，先问我几个问题来了解我。' },
                  { icon: Compass, title: '理清一个想法', description: '把一团思绪，变成下一步', prompt: '我有一个还不成熟的想法，请通过提问帮我理清目标，再一起制定行动计划。' },
                  { icon: Palette, title: '想象一幅画面', description: '给灵感，一点形状和颜色', prompt: '请为我创作一幅温暖的插画：一只小猫坐在窗边看夕阳，柔和的杏桃色，手绘质感。', image: true },
                ].map((item) => <button key={item.title} className="starter-card" onClick={() => {
                  if (item.image) {
                    const imageModel = modelOptions.find((option) => option.imageGeneration && option.available !== false);
                    if (imageModel) setAiModel(imageModel.value);
                  }
                  if (inputRef.current) { inputRef.current.value = t(item.prompt); inputRef.current.focus(); autoResizeTextarea(inputRef.current); setHasDraft(true); }
                }}><item.icon size={20} strokeWidth={1.5} /><span><strong>{t(item.title)}</strong></span></button>)}
              </div>
            </section>
          ) : (
            messages.map((m, i) => (
              <div key={m.id || i} className={`msg ${m.sender} ${m.isLoading ? 'loading' : ''} ${m.isStreaming ? 'streaming' : ''} ${m.isError ? 'error' : ''}`}>
                {m.sender === "bot" ? (
                  <>
                    <div className="message-author"><Sparkles size={15} />{language === 'zh' ? '小芙' : 'Xiaofu'} <span>· XIAOFU</span></div>
                    {m.isLoading ? <div className="thinking-indicator" role="status"><i /><i /><i /><span>{t("小芙正在想一想…")}</span></div> : m.text && (
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
                    
                    {m.warnings?.includes('HISTORY_IMAGES_UNAVAILABLE') && <p className="message-notice" role="note">{t('Some older images are unavailable. Re-upload them if needed.')}</p>}
                    {m.images && m.images.map((imgUrl, index) => (
                      <div key={index} className="image-result-container">
                        <AssetImage scope={user?.sub || 'guest'} 
                          src={imgUrl} 
                          alt={t('Generated image {count}', { count: index + 1 })}
                          className="generated-image"
                          loading="lazy"
                        />
                        <div className="image-overlay">
                          <div className="overlay-actions">
                            <button className="icon-btn" onClick={() => setPreviewImage(imgUrl)} title={t("Preview (Enlarge)")}>
                              <Maximize2 size={24} />
                            </button>
                            <a 
                              href="#"
                              onClick={(event) => {
                                event.preventDefault();
                                downloadImage(imgUrl).catch((error) => alert(error.message));
                              }}
                              className="icon-btn"
                              title={t("Download Image")}
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
                            <AssetImage scope={user?.sub || 'guest'} 
                              src={imgUrl} 
                              alt={t('Reference image {count}', { count: index + 1 })}
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
              <button className="close-preview" aria-label={t("关闭图片预览")} onClick={() => setPreviewImage(null)}>×</button>
              <AssetImage scope={user?.sub || 'guest'} src={previewImage} alt={t('Image preview')} className="preview-image-large" onClick={(e) => e.stopPropagation()} />
            </div>
          )}
          <div className="composer-shell">
          {pendingRecovery && !isGenerating && <div className="composer-caption" role="status">
            <span>{t('A reply may still be pending.')}</span>
            <div className="recovery-actions">
              <button type="button" onClick={resumePendingGeneration}>{t('Recover reply')}</button>
              <button type="button" onClick={restorePendingDraft}>{t('Restore draft')}</button>
            </div>
          </div>}
          <div className="input-box">
            <div className="input-main-row">
              <textarea ref={inputRef} aria-label={t("发送给小芙的消息")} placeholder={t("有个想法？和小芙聊聊…")} rows="1" className="chat-textarea"
                onInput={(event) => { autoResizeTextarea(event.target); setHasDraft(Boolean(event.target.value.trim())); }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !isGenerating) {
                    event.preventDefault(); sendMessage(); setHasDraft(Boolean(inputRef.current?.value.trim())); resetTextareaHeight(event.target);
                  }
                }} />
              <div className="composer-toolbar">
                <div className="composer-left">
                  <input type="file" ref={fileInputRef} multiple accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={handleImageUpload} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={isUploading || isGenerating} className="upload-btn" title={t("添加参考图片")} aria-label={isUploading ? t("图片上传中") : t("添加图片")}><Image size={18} /></button>
                  <span className="toolbar-divider" />
                  <ModelPicker options={modelOptions} value={aiModel} onChange={setAiModel} disabled={isGenerating || isUploading} error={modelError} />
                </div>
                <div className="input-actions">
                  <span className="composer-keyboard"><kbd>Enter</kbd> {t("发送")} · <kbd>Shift + Enter</kbd> {t("换行")}</span>
                  {isGenerating ? <button onClick={stopGenerating} className="stop-btn" aria-label={t("停止生成")} title={t("停止生成")}><Square size={13} fill="currentColor" /></button>
                    : <button onClick={() => { sendMessage(); setHasDraft(Boolean(inputRef.current?.value.trim())); resetTextareaHeight(inputRef.current); }} disabled={!hasDraft || isUploading || !modelOptions.some((option) => option.available !== false) || Boolean(pendingRecovery)} className="send-btn" aria-label={t("发送消息")} title={t("发送消息")}><ArrowUp size={19} /></button>}
                </div>
              </div>
            </div>
          </div>
          <div className="composer-caption"><span><ShieldCheck size={11} />{isLoggedIn ? t("你的想法，值得被认真对待") : t("先随便聊聊，登录后继续探索")}</span><button className="subscription-secondary" style={{ margin: 0, padding: '3px 9px' }} onClick={() => setShowSubscription(true)}>{t('Usage & plans')}</button></div>
          {uploadedImageUrls.length > 0 && (
            <div className="uploaded-images-preview">
              <p className="uploaded-images-title">{t('Uploaded')} ({uploadedImageUrls.length}):</p>
              <div className="images-grid">
                {uploadedImageUrls.map((url, index) => (
                  <div key={index} className="uploaded-image-item">
                    <AssetImage scope={user?.sub || 'guest'} 
                      src={url} 
                      alt={t('Reference image {count}', { count: index + 1 })}
                      onClick={() => setPreviewImage(url)}
                    />
                    <button 
                      className="remove-image-btn"
                      onClick={() => removeUploadedImage(index)}
                      title={t("移除图片")}
                      aria-label={t("移除图片")}
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
    </div>
    <Footer />
    {showSubscription && <SubscriptionModal key={user?.sub || 'guest'} isLoggedIn={isLoggedIn} onClose={() => setShowSubscription(false)} onSignIn={() => { setShowSubscription(false); openLoginModal(); }} />}
    {showLoginModal && (
      <LoginModal
        enabled={Boolean(GoogleProvider && clientId)}
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
      {GoogleProvider && clientId ? (
        <GoogleProvider clientId={clientId}>{routesContent}</GoogleProvider>
      ) : (
        routesContent
      )}
    </div>
  );
}

export default App;


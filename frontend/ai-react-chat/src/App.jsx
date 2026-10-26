import AssetImage from './component/AssetImage';
import SubscriptionModal from './component/SubscriptionModal';
import { useLanguage } from './i18n/LanguageProvider';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import SlideBar from './component/SlideBar';
import Header from './component/Header';
import Footer from './component/Footer';
import DynamicIsland from './component/DynamicIsland';

import LoginModal from './component/LoginModal';
import ChatComposer from './component/ChatComposer';
import './index.css';
import ChatMessage from './component/ChatMessage';
import { Sparkles, PenLine, Compass, Palette } from 'lucide-react';
import { getModels } from './api';
import { useAuth } from './hooks/useAuth';
import { useChat } from './hooks/useChat';
import { useConversations } from './hooks/useConversations';
import HistoryLoading from './component/HistoryLoading';
import { useTheme } from './hooks/useTheme';
import { useRecoveryAccess } from './hooks/useRecoveryAccess';
import {
  useChatViewport,
  PULL_REFRESH_THRESHOLD,
} from './hooks/useChatViewport';
import { useGuestHistoryClaim } from './hooks/useGuestHistoryClaim';

const Settings = lazy(() => import('./component/Settings'));

function App() {
  const { t } = useLanguage();
  const [hasDraft, setHasDraft] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [modelOptions, setModelOptions] = useState([]);
  const [modelError, setModelError] = useState('');
  useEffect(() => {
    let alive = true;
    getModels()
      .then((models) => {
        if (alive) setModelOptions(models);
      })
      .catch((error) => {
        if (alive) setModelError(error.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const [previewImage, setPreviewImage] = useState(null);

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

  const accountId = user?.sub;
  const recoveryEnabled = useRecoveryAccess({
    isLoggedIn,
    accountId,
    refreshKey: showSubscription,
  });

  const { theme, resolvedTheme, handleThemeChange, toggleTheme } = useTheme();

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
    replaceHistory,
    hasMoreMessages,
    isLoadingOlder,
    olderError,
    loadOlderMessages,
    historyPrependVersion,
  } = useConversations({
    isMounted,
    authScopeKey: user?.sub || (isLoggedIn ? 'authenticated' : 'guest'),
  });

  const { claimError, retryClaim } = useGuestHistoryClaim({
    enabled: recoveryEnabled === true,
    owner: accountId,
    onClaimed: loadConversations,
  });

  const chat = useChat({
    recoveryEnabled,
    isLoadingHistory: isLoadingMessages,
    authScopeKey: user?.sub || 'guest',
    availableModels: modelOptions
      .filter((option) => option.available !== false)
      .map((option) => option.value),
    onAuthRequired: openLoginModal,
    onSubscriptionRequired: () => setShowSubscription(true),
    conversationId,
    setConversationId,
    messages,
    setMessages,
    loadConversations,
    updateConversationTitle,
    replaceHistory,
  });

  const { setAiModel, inputRef, resetComposer } = chat;

  const {
    isSidebarOpen,
    setIsSidebarOpen,
    isMobileViewport,
    isDesktopNonTouch,
    pullDistance,
    messagesContainerRef,
    resetTextareaHeight,
    autoResizeTextarea,
    handlePullRefreshStart,
    handlePullRefreshMove,
    handlePullRefreshEnd,
    onImageLoad,
    preserveHistoryPosition,
    cancelHistoryPosition,
  } = useChatViewport({
    inputRef,
    conversationId,
    isLoadingMessages,
    messages,
    historyPrependVersion,
  });

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
        onLogout={() => {
          resetComposer();
          setHasDraft(false);
          handleLogout();
        }}
        onLogin={openLoginModal}
      />
      <div className="main-container">
        <div
          className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`}
          onClick={() => setIsSidebarOpen(false)}
        />

        <SlideBar
          error={conversationError}
          onRetry={loadConversations}
          conversations={conversations}
          isLoading={isLoadingConversations}
          onSelectConversation={(id) => {
            resetComposer();
            setHasDraft(false);
            selectConversation(id);
            if (isMobileViewport) setIsSidebarOpen(false);
          }}
          onDeleteConversation={deleteConversation}
          onNewChat={async () => {
            resetComposer();
            setHasDraft(false);
            const newConversation = await createNewChat();

            if (inputRef.current) {
              inputRef.current.focus();
              resetTextareaHeight(inputRef.current);
            }

            if (newConversation && isMobileViewport) {
              setIsSidebarOpen(false);
            }
          }}
          onUpdateTitle={updateConversationTitle}
          currentConversationId={conversationId}
          isOpen={isSidebarOpen}
        />

        <div
          className={`chat-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}
        >
          {isMobileViewport ? (
            <div
              className={`pull-refresh-indicator ${pullDistance >= PULL_REFRESH_THRESHOLD ? 'ready' : ''}`}
              style={{ height: `${pullDistance}px` }}
            >
              <span>
                {pullDistance >= PULL_REFRESH_THRESHOLD
                  ? t('Release to refresh')
                  : t('Pull to refresh')}
              </span>
            </div>
          ) : null}
          <div
            ref={messagesContainerRef}
            className="messages"
            aria-label={t('聊天消息')}
            aria-busy={isLoadingMessages}
            style={
              pullDistance > 0
                ? { transform: `translateY(${pullDistance}px)` }
                : undefined
            }
            onTouchStart={handlePullRefreshStart}
            onTouchMove={handlePullRefreshMove}
            onTouchEnd={handlePullRefreshEnd}
            onTouchCancel={handlePullRefreshEnd}
            onLoadCapture={onImageLoad}
          >
            {hasMoreMessages && !isLoadingMessages && <div className="history-page-controls">
              <button className="retry-history" disabled={isLoadingOlder} onClick={async () => {
                preserveHistoryPosition();
                if (!await loadOlderMessages()) cancelHistoryPosition();
              }}>{t(isLoadingOlder ? 'Loading earlier messages…' : 'Load earlier messages')}</button>
              {olderError && <p role="alert">{t(olderError)}</p>}
            </div>}
            {isLoadingMessages ? (
              <HistoryLoading />
            ) : showNewConversationHint ? (
              <section className="welcome">
                <div className="welcome-art" aria-hidden="true">
                  <span className="welcome-orbit" />
                  <Sparkles size={68} strokeWidth={1} />
                </div>
                <h1>{t('嗨，我是小芙。')}</h1>
                <p className="welcome-description">{t('想聊点什么？')}</p>
                <div className="starter-grid">
                  {[
                    {
                      icon: PenLine,
                      title: '写点不一样的',
                      description: '让文字，更像你自己',
                      prompt:
                        '帮我写一段有个人风格的自我介绍，先问我几个问题来了解我。',
                    },
                    {
                      icon: Compass,
                      title: '理清一个想法',
                      description: '把一团思绪，变成下一步',
                      prompt:
                        '我有一个还不成熟的想法，请通过提问帮我理清目标，再一起制定行动计划。',
                    },
                    {
                      icon: Palette,
                      title: '想象一幅画面',
                      description: '给灵感，一点形状和颜色',
                      prompt:
                        '请为我创作一幅温暖的插画：一只小猫坐在窗边看夕阳，柔和的杏桃色，手绘质感。',
                      image: true,
                    },
                  ].map((item) => (
                    <button
                      key={item.title}
                      className="starter-card"
                      onClick={() => {
                        if (item.image) {
                          const imageModel = modelOptions.find(
                            (option) =>
                              option.imageGeneration &&
                              option.available !== false,
                          );
                          if (imageModel) setAiModel(imageModel.value);
                        }
                        if (inputRef.current) {
                          inputRef.current.value = t(item.prompt);
                          inputRef.current.focus();
                          autoResizeTextarea(inputRef.current);
                          setHasDraft(true);
                        }
                      }}
                    >
                      <item.icon size={20} strokeWidth={1.5} />
                      <span>
                        <strong>{t(item.title)}</strong>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              messages.map((m, i) => (
                <ChatMessage
                  key={m.id || i}
                  message={m}
                  scope={user?.sub || 'guest'}
                  onPreview={setPreviewImage}
                />
              ))
            )}
          </div>

          {previewImage && (
            <div
              className="fullscreen-preview-modal"
              onClick={() => setPreviewImage(null)}
            >
              <button
                className="close-preview"
                aria-label={t('关闭图片预览')}
                onClick={() => setPreviewImage(null)}
              >
                ×
              </button>
              <AssetImage
                scope={user?.sub || 'guest'}
                src={previewImage}
                alt={t('Image preview')}
                className="preview-image-large"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <ChatComposer
            chat={chat}
            modelOptions={modelOptions}
            modelError={modelError}
            isLoadingMessages={isLoadingMessages}
            isLoggedIn={isLoggedIn}
            scope={user?.sub || 'guest'}
            hasDraft={hasDraft}
            setHasDraft={setHasDraft}
            autoResizeTextarea={autoResizeTextarea}
            resetTextareaHeight={resetTextareaHeight}
            claimError={claimError}
            onRetryClaim={retryClaim}
            onSubscribe={() => setShowSubscription(true)}
            onPreview={setPreviewImage}
          />
        </div>
      </div>
      <Footer />
      {showSubscription && (
        <SubscriptionModal
          key={user?.sub || 'guest'}
          isLoggedIn={isLoggedIn}
          onClose={() => setShowSubscription(false)}
          onSignIn={() => {
            setShowSubscription(false);
            openLoginModal();
          }}
        />
      )}
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
      <Route
        path="/settings"
        element={
          <>
            {showDynamicIsland ? <DynamicIsland /> : null}
            <Suspense
              fallback={<div role="status">{t('Loading messages...')}</div>}
            >
              <Settings
                theme={theme}
                resolvedTheme={resolvedTheme}
                onThemeChange={handleThemeChange}
              />
            </Suspense>
          </>
        }
      />
    </Routes>
  );

  return (
    <div className="app-root">
      {GoogleProvider && clientId ? (
        <GoogleProvider clientId={clientId}>{routesContent}</GoogleProvider>
      ) : (
        routesContent
      )}
    </div>
  );
}

export default App;

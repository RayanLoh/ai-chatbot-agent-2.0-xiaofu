import { useState, useRef, useEffect, useCallback } from "react";
import { Routes, Route } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import SlideBar from "./component/SlideBar";
import Header from "./component/Header";
import Footer from "./component/Footer";
import Settings from "./component/Settings";
import LoginModal from "./component/LoginModal";
import "./index.css";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Maximize2, Download } from 'lucide-react';
import * as api from './api/client';
import { getApiBase } from './api/client';

const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 768;

const apiBase = getApiBase();

function App() {
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile());
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false); // New state for loading messages
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const [GoogleProvider, setGoogleProvider] = useState(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'system';
    }
    return 'system';
  });
  
  const [aiModel, setAiModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aiModel') || 'models/gemini-3-flash-preview';
    }
    return 'models/gemini-3-flash-preview';
  });
  const [guestMessageCount, setGuestMessageCount] = useState(0);

  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Theme application logic
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyTheme = (themeName) => {
      document.documentElement.classList.remove('light-theme', 'dark-theme');
      document.documentElement.classList.add(`${themeName}-theme`);
    };

    let mediaQueryListener;

    if (theme === 'system') {
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(systemIsDark.matches ? 'dark' : 'light');
      mediaQueryListener = (e) => applyTheme(e.matches ? 'dark' : 'light');
      systemIsDark.addEventListener('change', mediaQueryListener);
    } else {
      applyTheme(theme);
    }

    return () => {
      if (theme === 'system' && mediaQueryListener) {
        window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaQueryListener);
      }
    };
  }, [theme]);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme);
    }
  };
  
  const handleSelectConversation = useCallback(async (id) => {
    if (id === conversationId && messages.length > 0) return; // Don't re-fetch if already selected
    
    setConversationId(id);
    localStorage.setItem('lastConversationId', id);
    setIsLoadingMessages(true);
    setMessages([]); // Clear previous messages

    try {
      console.log(`☁️ Fetching messages for conversation ${id}...`);
      const data = await api.getConversationMessages(id);
      setMessages(data.messages || []);
    } catch (error) {
      console.error("Failed to load conversation messages:", error);
      setMessages([{ id: `err_${Date.now()}`, sender: "bot", text: `❌ Failed to load conversation: ${error.message}` }]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const createNewChat = useCallback(async (switchFocus = true) => {
    try {
      const newConv = await api.createConversation();
      // Manually update the state to avoid a full reload, providing a faster UI response.
      setConversations(prev => [newConv, ...prev]);

      if (switchFocus) {
        setMessages([]);
        setConversationId(newConv.id);
        localStorage.setItem('lastConversationId', newConv.id);
        if (isMobile()) setIsSidebarOpen(false);
      }
      return newConv;
    } catch (error) {
      console.error("❌ Failed to create new conversation:", error);
    }
  }, []);

  // Load user data and guest count on mount
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      const count = parseInt(localStorage.getItem('guestMessageCount') || '0', 10);
      setGuestMessageCount(count);
      const token = localStorage.getItem('auth_token');
      if (token) {
        try {
          const decoded = jwtDecode(token);
          const storedUserData = localStorage.getItem('user_data');
          if (storedUserData) {
            const userData = JSON.parse(storedUserData);
            decoded.picture = userData.picture || decoded.picture;
            decoded.avatar_url = userData.avatar_url || decoded.avatar_url;
          }
          setUser(decoded);
          setIsLoggedIn(true);
        } catch (e) {
          console.error("Invalid token:", e);
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user_data');
        }
      }
    }
  }, []);
  
  const loadConversations = useCallback(async () => {
      // 🟢 隐私逻辑：如果未登录，直接显示空列表并退出，不请求后端
      if (!isLoggedIn) {
          setIsLoadingConversations(false);
          setConversations([]); 
          if (!conversationId) setMessages([]);
          return; 
      }

      setIsLoadingConversations(true);
      try {
          console.log('📡 [Private] Loading conversations for logged-in user...');
          const data = await api.getConversations();
          const validConvList = Array.isArray(data.conversations) ? data.conversations : [];
          setConversations(validConvList);
          // ... 后续的选择逻辑保持不变 ...
      } catch (error) {
          console.error('❌ Failed to load conversations:', error);
      } finally {
          setIsLoadingConversations(false);
      }
  }, [isLoggedIn, conversationId, createNewChat, handleSelectConversation]);

  const handleLoginSuccess = (decoded, token) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('guestMessageCount', '0');
    localStorage.setItem('user_data', JSON.stringify({
      picture: decoded.picture,
      avatar_url: decoded.avatar_url,
      name: decoded.name
    }));
    setUser(decoded);
    setIsLoggedIn(true);
    setShowLoginModal(false);
    setConversationId(null);
    setMessages([]);
    loadConversations();
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.setItem('guestMessageCount', '0');
    localStorage.removeItem('lastConversationId');
    setUser(null);
    setIsLoggedIn(false);
    setConversations([]);
    setMessages([]);
    setConversationId(null);
  };

  // Initial load of conversations
  useEffect(() => {
    if (isMounted) {
        loadConversations();
    }
  }, [isMounted, loadConversations]);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    (async () => {
      try {
        const mod = await import('@react-oauth/google');
        setGoogleProvider(() => mod.GoogleOAuthProvider);
      } catch (e) {
        console.error('Provider load error:', e);
      }
    })();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsSidebarOpen(!isMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);
  
  useEffect(() => {
    if (isMounted && typeof window !== 'undefined') {
      localStorage.setItem('aiModel', aiModel);
    }
  }, [aiModel, isMounted]);

  const toggleTheme = () => {
    let currentTheme = theme === 'system' 
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    handleThemeChange(newTheme);
  };

  const stopGenerating = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    try {
      await api.stopGeneration();
    } catch (error) {
      console.error("Failed to request stop generation:", error);
    }
    setIsGenerating(false);
  };

  const sendMessage = async () => {
    const msg = inputRef.current.value.trim();
    if (!msg || isGenerating) return;

    if (!isLoggedIn) {
        setShowLoginModal(true);
        setMessages(prev => [...prev, { id: `msg_${Date.now()}_system`, sender: "bot", text: "Please log in to send a message.", isError: true, createdAt: Date.now() }]);
        return;
    }
    
    let currentConvId = conversationId;
    // If guest user starts chatting without a conversation ID, create one on the fly.
    if (!currentConvId && !isLoggedIn) {
        const newConv = await createNewChat(false); // Don't switch focus
        if (newConv) {
            currentConvId = newConv.id;
            setConversationId(newConv.id); // Set it for future messages in this session
        }
    }


    const userMsgId = `msg_${Date.now()}_user`;
    const botMsgId = `msg_${Date.now()}_bot`;

    setMessages(prev => [...prev, { id: userMsgId, sender: "user", text: msg, createdAt: Date.now() }]);
    inputRef.current.value = "";
    setIsGenerating(true);


    
    setMessages(prev => [...prev, { id: botMsgId, sender: "bot", text: "I'm Thinking", isLoading: true, createdAt: Date.now() }]);
    abortControllerRef.current = new AbortController();

    try {
      const data = await api.generateResponse(msg, currentConvId, aiModel, abortControllerRef.current.signal);

      setMessages(prev => {
        const updated = [...prev];
        const lastMessageIndex = updated.findIndex(m => m.id === botMsgId);
        if (lastMessageIndex !== -1) {
          updated[lastMessageIndex] = { 
            id: botMsgId,
            sender: "bot", 
            text: (data.text || '').trim(),
            images: data.images || [],
            createdAt: Date.now()
          };
        }
        return updated;
      });

      // If a new conversation was created on the backend
      if (data.conversation_id && currentConvId !== data.conversation_id) {
         await loadConversations(); // Refresh list to show new conversation
         handleSelectConversation(data.conversation_id);
      }

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error("Front-end error:", error);
        setMessages(prev => {
          const updated = [...prev];
          const lastMessageIndex = updated.findIndex(m => m.id === botMsgId);
          if (lastMessageIndex !== -1) {
            updated[lastMessageIndex] = { id: botMsgId, sender: "bot", text: "Oops, the connection dropped... Ei-Heh?", createdAt: Date.now() };
          }
          return updated;
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleDeleteConversation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this conversation?')) return;
    
    // Optimistically update UI
    const originalConversations = conversations;
    const updatedConversations = conversations.filter(conv => conv.id !== id);
    setConversations(updatedConversations);

    if (conversationId === id) {
        localStorage.removeItem('lastConversationId');
        if (updatedConversations.length > 0) {
          handleSelectConversation(updatedConversations[0].id);
        } else {
          createNewChat();
        }
    }

    try {
      await api.deleteConversation(id);
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      alert('Failed to delete conversation: ' + error.message);
      // Rollback UI on failure
      setConversations(originalConversations);
    }
  };
  
  const handleUpdateConversationTitle = async (id, newTitle) => {
    try {
      await api.updateConversationTitle(id, newTitle);
      // Refresh the list to show the new title
      await loadConversations();
    } catch (error) {
      console.error("Failed to update title:", error);
      alert('Failed to update title: ' + error.message);
    }
  };

  if (!isMounted) {
    return <div className="app-root" suppressHydrationWarning={true}></div>;
  }
  
const appContent = (
  <div className="app-container">
    <Header 
      onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      theme={theme}
      onThemeToggle={toggleTheme}
      user={user}
      isLoggedIn={isLoggedIn}
      onLogout={handleLogout}
      onLogin={() => setShowLoginModal(true)}
    />
    <div className="main-container">
      <div className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`} onClick={() => setIsSidebarOpen(false)} />
      
      <SlideBar
        conversations={conversations}
        isLoading={isLoadingConversations}
        onSelectConversation={(id) => {
          handleSelectConversation(id);
          if (isMobile()) setIsSidebarOpen(false);
        }}
        onDeleteConversation={handleDeleteConversation}
        onNewChat={createNewChat}
        onUpdateTitle={handleUpdateConversationTitle}
        currentConversationId={conversationId}
        isOpen={isSidebarOpen}
      />

      <div className={`chat-container ${isSidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <div className="messages">
          {isLoadingMessages ? (
            <div className="msg bot loading"><p>Loading messages...</p></div>
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
                              href={`${apiBase}/download-image?url=${encodeURIComponent(imgUrl)}`}
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
                  <pre>{m.text}</pre>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
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
            {isGenerating ? (
              <button onClick={stopGenerating} className="stop">Stop</button>
            ) : (
              <button onClick={sendMessage}>Send</button>
            )}
          </div>
        </div>
    </div>
    <Footer />
    {showLoginModal && (
      <LoginModal
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    )}
  </div>
);

  const routesContent = (
    <Routes>
      <Route path="/" element={appContent} />
      <Route path="/settings" element={<Settings theme={theme} onThemeChange={handleThemeChange} />} />
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

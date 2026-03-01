// 新版本
import { useState, useRef, useEffect } from "react";
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
import { useSmartStorage, useStorageInit } from './utils/useSmartStorage';
import { Maximize2, Download } from 'lucide-react';
import db, { autoCleanupOldImages } from './utils/db.js';

// 优先使用 Vite 环境变量，回退到本地代理
let API_BASE = (import.meta.env.VITE_API_BASE || "").trim();
if (API_BASE && !API_BASE.startsWith('http')) {
    API_BASE = `https://${API_BASE}`; // 自动补齐 https
}
const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 768;

const getAuthHeader = () => {
  const token = localStorage.getItem('auth_token');
  return {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

const saveConversationsToIndexedDB = async (serverList) => {
  try {
    for (const serverConv of serverList) {
      const existingConv = await db.conversations.get(serverConv.id);

      const mergedConv = {
        id: serverConv.id,
        conversationId: serverConv.id,
        title: serverConv.title || 'new chat',
        messages: existingConv ? existingConv.messages : [],
        createdAt: serverConv.createdAt || existingConv?.createdAt || Date.now(),
        updatedAt: serverConv.updatedAt || Date.now(),
        messageCount: serverConv.message_count || existingConv?.messageCount || 0,
        timestamp: serverConv.timestamp
      };
      
      await db.conversations.put(mergedConv);
    }
    console.log(`✅ Synced ${serverList.length} conversations with IndexedDB`);
  } catch (e) {
    console.error('❌ Failed to save conversations to IndexedDB:', e);
  }
};

function App() {
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile());
  const [isLoadingConversations, setIsLoadingConversations] = useState(true); // ✨ 添加加载状态
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // ✨ 用于全屏预览图片的 state
  const [previewImage, setPreviewImage] = useState(null);

  const [isMounted, setIsMounted] = useState(false);
  const [GoogleProvider, setGoogleProvider] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'system';
    }
    return 'system';
  });

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

      mediaQueryListener = (e) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };

      systemIsDark.addEventListener('change', mediaQueryListener);
    } else {
      applyTheme(theme);
    }

    return () => {
      if (theme === 'system' && mediaQueryListener) {
        const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)');
        systemIsDark.removeEventListener('change', mediaQueryListener);
      }
    };
  }, [theme]);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };
  
  const [apiBase, setApiBase] = useState(API_BASE);
  const [tempApiUrl, setTempApiUrl] = useState(apiBase);
  
  const [aiModel, setAiModel] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aiModel') || 'models/gemini-3-flash-preview';
    }
    return 'models/gemini-3-flash-preview';
  });
  const [guestMessageCount, setGuestMessageCount] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const count = parseInt(localStorage.getItem('guestMessageCount') || '0', 10);
      setGuestMessageCount(count);
      const token = localStorage.getItem('auth_token');
      if (token) {
        try {
          const decoded = jwtDecode(token);
          // 从 localStorage 恢复用户头像信息
          const storedUserData = localStorage.getItem('user_data');
          if (storedUserData) {
            const userData = JSON.parse(storedUserData);
            if (userData.picture) {
              decoded.picture = userData.picture;
            }
            if (userData.avatar_url) {
              decoded.avatar_url = userData.avatar_url;
            }
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

  const handleLoginSuccess = (decoded, token) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('guestMessageCount', '0');
    // 保存用户头像等信息
    localStorage.setItem('user_data', JSON.stringify({
      picture: decoded.picture,
      avatar_url: decoded.avatar_url,
      name: decoded.name
    }));
    setUser(decoded);
    setIsLoggedIn(true);
    setShowLoginModal(false);
    loadConversations();
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.setItem('guestMessageCount', '0');
    setUser(null);
    setIsLoggedIn(false);
  };

  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  useStorageInit();
  const storage = useSmartStorage();

  const loadConversations = async () => {
    setIsLoadingConversations(true); // 开始加载
    try {
      console.log('📡 Loading conversations...', { apiBase });
      const headers = getAuthHeader();
      const response = await fetch(`${apiBase}/conversations`, { headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const convList = data.conversations || data;
      const validConvList = Array.isArray(convList) ? convList : [];
      setConversations(validConvList);
      
      if (typeof window !== 'undefined') {
        await saveConversationsToIndexedDB(validConvList);
      }
      
      if (validConvList.length === 0 && !conversationId) {
        console.log('🤔 No conversations found, creating a new one.');
        await createNewChat(true); 
      }

    } catch (error) {
      console.error('❌ Failed to load conversations:', error);
      setConversations([{ id: 'error', title: 'Failed to load', message_count: 0, timestamp: null, error: error.message }]);
    } finally {
      setIsLoadingConversations(false); // 加载结束
    }
  };

  const saveMessagesToIndexedDB = async (msgs) => {
    if (conversationId && msgs.length > 0) {
      try {
        const conversationData = {
          id: conversationId,
          conversationId: conversationId,
          messages: msgs.map(m => ({
            id: m.id || `msg_${Date.now()}_${Math.random()}`,
            text: m.text,
            sender: m.sender,
            images: m.images || [], // ✨ Save the images array
            createdAt: m.createdAt || Date.now()
          })),
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        const db = (await import('./utils/db.js')).default;
        await db.conversations.put(conversationData);
        console.log('✅ Messages saved to IndexedDB (with images)');
      } catch (e) {
        console.error('❌ IndexedDB save failed:', e.message);
      }
    }
  };

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    setIsMounted(true);

    (async () => {
      try {
        const mod = await import('@react-oauth/google');
        setGoogleProvider(() => mod.GoogleOAuthProvider);
      } catch (e) {
        console.error('Provider load error:', e);
      }
    })();

    // 启动时在后台执行一次自动清理检查 (LRU 策略)
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        autoCleanupOldImages();
      }, 5000); // 延迟 5 秒执行，不影响首屏渲染
    }
    
    const savedApiBase = localStorage.getItem('apiBase');
    if (import.meta.env.VITE_API_BASE) {
      setApiBase(import.meta.env.VITE_API_BASE);
      API_BASE = import.meta.env.VITE_API_BASE;
      setTempApiUrl(import.meta.env.VITE_API_BASE);
      localStorage.removeItem('apiBase');
    } else if (savedApiBase) {
        setApiBase(savedApiBase);
        API_BASE = savedApiBase;
        setTempApiUrl(savedApiBase);
    }
  }, []);

  useEffect(() => {
    if (apiBase && apiBase.startsWith('http')) {
        loadConversations();
    }
  }, [apiBase]);

  useEffect(() => {
    const loadLastActiveData = async () => {
        const savedConvId = localStorage.getItem('lastConversationId');
        if (savedConvId) {
            setConversationId(savedConvId);
            try {
                const conversation = await db.conversations.get(savedConvId);
                if (conversation && conversation.messages) {
                    setMessages(conversation.messages);
                }
            } catch (e) {
                console.error('❌ Failed to load messages for last active conversation:', e);
            }
        } else if (conversations.length > 0) {
            const firstConvId = conversations[0].id;
            setConversationId(firstConvId);
            localStorage.setItem('lastConversationId', firstConvId);
        }
    };
    
    if (isMounted) {
        loadLastActiveData();
    }
  }, [isMounted, conversations]);


  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMounted && messages.length > 0) {
      saveMessagesToIndexedDB(messages);
      setTimeout(() => {
        scrollToBottom();
      }, 0);
    }
  }, [messages, isMounted]);

  useEffect(() => {
    if (isMounted && messages.length > 0) {
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [isMounted]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isMounted && typeof window !== 'undefined') {
      localStorage.setItem('aiModel', aiModel);
    }
  }, [aiModel, isMounted]);

  const toggleTheme = () => {
    let currentTheme = theme;
    // If theme is system, determine current actual theme
    if (currentTheme === 'system') {
      currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    // Toggle to the other theme
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    handleThemeChange(newTheme);
  };

  if (!isMounted || !isClient) {
    return <div className="app-root" suppressHydrationWarning={true}></div>;
  }

  const stopGenerating = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    try {
      await fetch(`${apiBase}/stop`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "69420"
        }
      });
    } catch (error) {
      console.error("Failed to stop generation:", error);
    }
    
    setIsGenerating(false);
  };

  const sendMessage = async () => {
    const msg = inputRef.current.value.trim();
    if (!msg || isGenerating) return;

    const token = localStorage.getItem('auth_token');
    if (!token) {
      if (guestMessageCount >= 10) {
        setShowLoginModal(true);
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}_system`,
          sender: "bot",
          text: "You have reached the 10-message limit for guest users. Please log in to continue.",
          isError: true, // You can use this to style the message differently
          createdAt: Date.now()
        }]);
        return;
      }
      if (guestMessageCount === 8) { // 因为计数通常从 0 开始，8 代表正在发第 9 条
      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}_warn`,
        sender: "bot",
        text: "Eh-Hei! This is your 9th message. You might want to login to continue using me! ✨",
        isWarning: true, // 可以在 CSS 给这个类加个橘色边框
        createdAt: Date.now()
      }]);
    }
    }

    const userMsgId = `msg_${Date.now()}_user`;
    const botMsgId = `msg_${Date.now()}_bot`;

    setMessages(prev => [...prev, { id: userMsgId, sender: "user", text: msg, createdAt: Date.now() }]);
    inputRef.current.value = "";
    setIsGenerating(true);

    if (!token) {
      const newCount = guestMessageCount + 1;
      setGuestMessageCount(newCount);
      localStorage.setItem('guestMessageCount', newCount.toString());
      if (newCount === 10) {
         setTimeout(() => {
          setMessages(prev => [...prev, {
            id: `msg_${Date.now()}_system_warning`,
            sender: "bot",
            text: "You have reached your message limit. Please log in to continue.",
            isWarning: true,
            createdAt: Date.now()
          }]);
          setShowLoginModal(true);
        }, 1000); // Delay the message slightly
      }
    }

    setMessages(prev => [...prev, { id: botMsgId, sender: "bot", text: "I'm Thinking", isLoading: true, createdAt: Date.now() }]);
    
    console.log("🚀 当前准备发送给后端的模型:", aiModel);

    try {
      const response = await fetch(`${apiBase}/generate`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
           ...getAuthHeader()
        },
        body: JSON.stringify({ 
          prompt: msg, 
          conversation_id: conversationId || null,
          model_name: aiModel
        }),
      });

      const data = await response.json();
      console.log("📥 Backend raw data:", data); 

      if (data.text || data.images) {
        setMessages(prev => {
          const updated = [...prev];
          const lastMessageIndex = updated.length - 1;
          
          let responseText = data.text || '';
          // 优先使用后端直接提供的images数组
          const responseImages = data.images || [];

          console.log("📝 Raw response text from backend:", responseText);

          // --- 增强的图片解析逻辑 ---
          // 正则表达式，用于匹配Markdown格式的Base64图片 ![]()
          const markdownImageRegex = /!\[.*?\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
          
          // 从文本中提取Markdown格式的图片
          let cleanedText = responseText.replace(markdownImageRegex, (fullMatch, imageBase64) => {
            console.log("🖼️ Found and parsed a markdown-formatted base64 image!");
            if (!responseImages.includes(imageBase64)) {
              responseImages.push(imageBase64);
            }
            return ""; // 从文本中移除图片标记
          });

          // 正则表达式，用于匹配可能残留的、独立的Base64 data URI
          const plainDataUriRegex = /(data:image\/\w+;base64,[a-zA-Z0-9+/=]+)/g;
          cleanedText = cleanedText.replace(plainDataUriRegex, (match) => {
            console.log("🖼️ Found and parsed a plain base64 data URI!");
             if (!responseImages.includes(match)) {
              responseImages.push(match);
            }
            return ""; // 从文本中移除
          });
          
          // 正则表达式，用于匹配后端返回的 IMG_DATA:格式 (Python backend: f"IMG_DATA:{img_base64}")
          const imgDataRegex = /IMG_DATA:([a-zA-Z0-9+/=]+)/g;
          cleanedText = cleanedText.replace(imgDataRegex, (match, base64Str) => {
            console.log("🖼️ Found and parsed an IMG_DATA base64 image from backend!");
            // 补充完整的 data uri 前缀 (默认使用 png 格式)
            const fullDataUri = `data:image/png;base64,${base64Str}`;
            if (!responseImages.includes(fullDataUri)) {
              responseImages.push(fullDataUri);
            }
            return ""; // 从文本中移除
          });
          // --- 图片解析逻辑结束 ---

          const finalMessage = { 
            id: botMsgId,
            sender: "bot", 
            text: cleanedText.trim(),
            images: [...new Set(responseImages)], // 去重确保唯一性
            createdAt: Date.now()
          };
          
          updated[lastMessageIndex] = finalMessage;

          console.log('📦 Parsed message object:', finalMessage);
          
          // 检查是否是第9条消息（从bot返回）且未登陆
          if (!token && guestMessageCount === 9) {
            console.log("💡 you want to login to continue use me");
          }

          return updated;
        });

        if (data.conversation_id && !conversationId) {
             setConversationId(data.conversation_id);
             await loadConversations();
        }
      } else {
        throw new Error("Didn't receive the AI's response.");
      }
    } catch (error) {
      console.error("Front-end error:", error);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { sender: "bot", text: "Oops, the connection dropped... Ei-Heh?" };
        return updated;
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const createNewChat = async (switchFocus = true) => {
    try {
      const response = await fetch(`${apiBase}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ title: "new conversation" })
      });
      
      const newConv = await response.json();
      
      setConversations(prev => [newConv, ...prev]);

      if (switchFocus) {
        setMessages([]);
        setConversationId(newConv.id);
        localStorage.setItem('lastConversationId', newConv.id);
        if (isMobile()) setIsSidebarOpen(false);
      }
      
      console.log("✅ New conversation created:", newConv.id);
      return newConv;
    } catch (error) {
      console.error("❌ Failed to create new conversation:", error);
    }
  };

  const handleSelectConversation = async (id) => {
    if (id === conversationId) return;
    
    // 1. 立即切换 UI 状态，不等待网络请求，实现“秒开”
    setConversationId(id);
    localStorage.setItem('lastConversationId', id);

    let hasLocalData = false;

    // 2. 优先从本地极速加载 (Local-First)
    try {
      const db = (await import('./utils/db.js')).default;
      const conversation = await db.conversations.get(id);
      if (conversation && conversation.messages && conversation.messages.length > 0) {
        setMessages(conversation.messages);
        hasLocalData = true;
        console.log('⚡ 极速加载：从本地 IndexedDB 加载完成');
      } else {
        setMessages([]); // 本地没数据先清空，等待网络
      }
    } catch (e) {
      console.warn('⚠️ 读取本地缓存失败:', e.message);
      setMessages([]);
    }

    // 3. 后台默默从服务器拉取以防本地数据丢失或不全（不阻塞 UI）
    try {
      const response = await fetch(`${apiBase}/conversations/${id}`, {
        headers: { ...getAuthHeader() }
      });
      if (!response.ok) throw new Error('Failed to load conversation');
      
      const data = await response.json();
      
      // 只有在本地真的没有数据时，才使用服务器返回的数据渲染
      if (!hasLocalData) {
        setMessages(data.messages || []);
        console.log('☁️ 从云端同步数据完成');
      }
    } catch (error) {
      console.error("后台同步服务器对话失败:", error);
      if (!hasLocalData) {
         setMessages([{ sender: "bot", text: `❌ failed to load conversation: ${error.message}` }]);
      }
    }
  };

  const handleDeleteConversation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this conversation?')) return;
    
    try {
      const response = await fetch(`${apiBase}/conversations/${id}`, {
        method: "DELETE",
        headers: getAuthHeader()
      });
      
      if (!response.ok) throw new Error('Failed to delete conversation');
      
      const updatedConversations = conversations.filter(conv => conv.id !== id);
      setConversations(updatedConversations);

      if (conversationId === id) {
        setMessages([]);
        setConversationId(null);
        localStorage.removeItem('lastConversationId');
      }
      
      if (updatedConversations.length === 0) {
        await createNewChat();
      } else if (conversationId === id) {
        const newConvId = updatedConversations[0].id;
        handleSelectConversation(newConvId);
      }
      
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      alert('Failed to delete conversation: ' + error.message);
    }
  };

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
          apiBase={apiBase}
          conversations={conversations}
          isLoading={isLoadingConversations}
          onSelectConversation={(id) => {
            handleSelectConversation(id);
            if (isMobile()) setIsSidebarOpen(false);
          }}
          onDeleteConversation={handleDeleteConversation}
          onNewChat={createNewChat}
          currentConversationId={conversationId}
          isOpen={isSidebarOpen}
          loadConversations={loadConversations}
        />
        <div className={`chat-container ${isSidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
          <div className="messages">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.sender} ${m.isLoading ? 'loading' : ''}`}>
                {m.sender === "bot" ? (
                  <>
                    {/* ✨ Always render text if it exists */}
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
                    
                    {/* ✨ Additionally, render any images */}
                    {m.images && m.images.map((imgData, index) => (
                        <div key={index} className="image-result-container">
                            <img 
                                src={imgData} 
                                alt={`AI Generated Art ${index + 1}`}
                                className="generated-image"
                            />
                            {/* 🖱️ 悬浮遮罩与按钮组 */}
                            <div className="image-overlay">
                              <div className="overlay-actions">
                                <button 
                                  className="icon-btn" 
                                  onClick={() => setPreviewImage(imgData)}
                                  title="Preview (Enlarge)"
                                >
                                  <Maximize2 size={24} />
                                </button>
                                <a 
                                    href={imgData} 
                                    download={`xiaofu-art-${Date.now()}-${index}.png`}
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
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* 🔎 全屏图片预览 Modal */}
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
                // 如果内容为空，直接重置高度
                if (!e.target.value.trim()) {
                  e.target.style.height = '44px';
                  e.target.style.overflowY = 'hidden';
                  return;
                }
                
                // 重置高度以获取正确的 scrollHeight
                e.target.style.height = '44px';
                // 计算新的高度
                const newHeight = e.target.scrollHeight;
                
                // 如果内容实际上只有一行（scrollHeight 小于等于 44，或者没有换行符且没有溢出），保持默认高度
                if (newHeight <= 44) {
                    e.target.style.height = '44px';
                } else {
                    // 设置新的高度（受 css 中的 max-height 限制）
                    e.target.style.height = `${newHeight}px`;
                }
                // 当内容超过最大高度时显示滚动条
                e.target.style.overflowY = newHeight > 84 ? 'auto' : 'hidden';
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isGenerating) {
                  if (e.shiftKey) {
                    // Shift + Enter: 插入换行，浏览器默认行为就是插入换行，这里不需要额外处理
                  } else {
                    // Enter: 发送消息
                    e.preventDefault();
                    sendMessage();
                    // 发送后重置高度
                    e.target.style.height = '44px';
                    e.target.style.overflowY = 'hidden';
                  }
                }
              }}
            ></textarea>
            {isGenerating ? (
              <button onClick={stopGenerating} className="stop">Stop</button>
            ) : (
              <button onClick={() => sendMessage()}>Send</button>
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
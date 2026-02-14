// 新版本
import { useState, useRef, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import SlideBar from "./component/SlideBar";
import Header from "./component/Header";
import Footer from "./component/Footer";
import Settings from "./component/Settings";
import "./index.css";
import ReactMarkdown from 'react-markdown';

// 优先使用 Vite 环境变量，回退到本地代理
let API_BASE = (import.meta.env.VITE_API_BASE || "/api").trim();
const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 768;

function App() {
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile());

  const [isMounted, setIsMounted] = useState(false);
  const [GoogleProvider, setGoogleProvider] = useState(null);
  const [isClient, setIsClient] = useState(false);
  
  // 👇 新增：API URL 状态
  const [apiBase, setApiBase] = useState(API_BASE);
  const [tempApiUrl, setTempApiUrl] = useState(apiBase);

  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

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

    const savedMessages = localStorage.getItem('lastMessages');
    if (savedMessages) setMessages(JSON.parse(savedMessages));

    const savedConvId = localStorage.getItem('lastConversationId');
    if (savedConvId) setConversationId(savedConvId);
    
    // 👇 新增：从 localStorage 加载保存的 API URL（仅当.env为默认值时）
    // 优先级：.env VITE_API_BASE > localStorage > 默认
    if (import.meta.env.VITE_API_BASE) {
      // 如果.env中明确设置了API_BASE，则使用它而不是localStorage
      setApiBase(import.meta.env.VITE_API_BASE);
      API_BASE = import.meta.env.VITE_API_BASE;
      setTempApiUrl(import.meta.env.VITE_API_BASE);
      // 清除过期的localStorage值
      localStorage.removeItem('apiBase');
    } else {
      // 只有当.env没有设置时，才从localStorage读取
      const savedApiBase = localStorage.getItem('apiBase');
      if (savedApiBase) {
        setApiBase(savedApiBase);
        API_BASE = savedApiBase;
        setTempApiUrl(savedApiBase);
      }
    }
  }, []);

  useEffect(() => {
  const handleResize = () => {
    // 窗口缩小时自动关闭，窗口放大时自动开启
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
      localStorage.setItem('lastMessages', JSON.stringify(messages));
      // 使用 setTimeout 确保 DOM 已经更新
      setTimeout(() => {
        scrollToBottom();
      }, 0);
    }
  }, [messages, isMounted]);

  // 页面刷新时自动滚动到底部
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

  // 只在客户端完全加载后才渲染完整内容
  if (!isMounted || !isClient) {
    return <div className="app-root" suppressHydrationWarning={true}></div>;
  }

  const stopGenerating = async () => {
    // 中止本地请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // 调用后端 stop 接口
    try {
      await fetch(`${apiBase}/stop`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "69420"
        }
      });
    } catch (error) {
      console.error("调用 stop 接口失败:", error);
    }
    
    setIsGenerating(false);
  };

const sendMessage = async () => {
  const msg = inputRef.current.value.trim();
  if (!msg || isGenerating) return;

  // 1. 先把用户的话放上去
  setMessages(prev => [...prev, { sender: "user", text: msg }]);
  inputRef.current.value = "";
  setIsGenerating(true);

  // 2. 预留一个 AI 的位置，初始显示“三粒点”
  setMessages(prev => [...prev, { sender: "bot", text: "I'm Thinking", isLoading: true }]);

  try {
    const response = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "69420" 
      },
      body: JSON.stringify({ 
        prompt: msg, 
        conversation_id: conversationId 
      }),
    });

    const data = await response.json(); // 获取后端返回的 JSON 

    if (data.text) {
      // 3. 核心修复：找到最后一条消息（就是刚才那三粒点），把它替换成真正的回复
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { 
          sender: "bot", 
          text: data.text 
        };
        return updated;
      });

      if (data.conversation_id) setConversationId(data.conversation_id);
    } else {
      throw new Error("没拿到 AI 的回复内容");
    }
  } catch (error) {
    console.error("前端报错:", error);
    // 如果失败了，把三粒点改成报错信息
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { sender: "bot", text: "哎呀，连接断开了...诶嘿？" };
      return updated;
    });
  } finally {
    setIsGenerating(false);
  }
};

const createNewChat = async () => {
  try {
    // 调用后端创建新对话
    const response = await fetch(`${apiBase}/conversations`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "69420"
      },
      body: JSON.stringify({ title: "新对话" })
    });
    
    const data = await response.json();
    const newConvId = data.id;
    
    setMessages([]);
    setConversationId(newConvId);
    localStorage.setItem('lastMessages', JSON.stringify([]));
    localStorage.setItem('lastConversationId', newConvId);
    
    if (window.innerWidth <= 768) setIsSidebarOpen(false);
    console.log("新对话已创建:", newConvId);
  } catch (error) {
    console.error("创建对话失败:", error);
    // 本地回退
    setMessages([]);
    setConversationId(null);
  }
};

  const handleSelectConversation = async (id) => {
    try {
      const response = await fetch(`${apiBase}/conversations/${id}`, {
        headers: { "ngrok-skip-browser-warning": "69420" }
      });
      if (!response.ok) throw new Error('获取对话失败');
      
      const data = await response.json();
      setMessages(data.messages || []);
      setConversationId(data.id);
      localStorage.setItem('lastConversationId', data.id);
      localStorage.setItem('lastMessages', JSON.stringify(data.messages || []));
    } catch (error) {
      console.error("加载对话失败:", error);
      setMessages(prev => [...prev, { sender: "bot", text: `❌ 加载对话失败: ${error.message}` }]);
    }
  };

  // 👇 新增：删除对话函数
  const handleDeleteConversation = async (id) => {
    if (!window.confirm('确定要删除这个对话吗？')) return;
    
    try {
      const response = await fetch(`${apiBase}/conversations/${id}`, {
        method: "DELETE",
        headers: { "ngrok-skip-browser-warning": "69420" }
      });
      
      if (!response.ok) throw new Error('删除失败');
      
      // 如果删除的是当前对话，创建新对话
      if (conversationId === id) {
        await createNewChat();
      } else {
        // 否则刷新列表
        if (window.location.pathname === '/') {
          window.location.reload();
        }
      }
    } catch (error) {
      console.error("删除对话失败:", error);
      alert('删除失败: ' + error.message);
    }
  };

  const appContent = (
    <div className="app-container">
      <Header 
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <div className="main-container">
        <div className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`} onClick={() => setIsSidebarOpen(false)} />
        <SlideBar
          apiBase={apiBase}
          onSelectConversation={(id) => {
            handleSelectConversation(id);
            if (window.innerWidth <= 768) setIsSidebarOpen(false);
          }}
          onDeleteConversation={handleDeleteConversation}
          onNewChat={createNewChat}
          currentConversationId={conversationId}
          isOpen={isSidebarOpen}
        />
        <div className={`chat-container ${isSidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
          <div className="messages">
              {messages.map((m, i) => (
                <div key={i} className={`msg ${m.sender} ${m.isLoading ? 'loading' : ''}`}>
                  {/* 核心修复：如果是 AI (bot)，使用 ReactMarkdown 解析；如果是用户，保留原样 */}
                  {m.sender === "bot" ? (
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                  ) : (
                    <pre>{m.text}</pre>
                  )}
                </div>
              ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="input-box">
            <input
              ref={inputRef}
              placeholder="Ask something..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !isGenerating) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            {isGenerating ? (
              <button onClick={stopGenerating} className="stop">Stop</button>
            ) : (
              <button onClick={sendMessage}>Send</button>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );

  const routesContent = (
    <Routes>
      <Route path="/" element={appContent} />
      <Route path="/settings" element={<Settings />} />
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
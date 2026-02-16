// 新版本
import { useState, useRef, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import SlideBar from "./component/SlideBar";
import Header from "./component/Header";
import Footer from "./component/Footer";
import Settings from "./component/Settings";
import "./index.css";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// 优先使用 Vite 环境变量，回退到本地代理
let API_BASE = (import.meta.env.VITE_API_BASE || "").trim();
if (API_BASE && !API_BASE.startsWith('http')) {
    API_BASE = `https://${API_BASE}`; // 自动补齐 https
}
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
    const response = await fetch(`${apiBase}/generate`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json"  // 🔥 必须加上这一行！
      },
      body: JSON.stringify({ 
        prompt: msg, 
        conversation_id: conversationId || null // 👈 增加容错，确保 ID 不为 undefined
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
      throw new Error("Didn't receive the AI's response.");
    }
  } catch (error) {
    console.error("Front-end error:", error);
    // 如果失败了，把三粒点改成报错信息
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { sender: "bot", text: "Oops, the connection dropped... Ei-Heh?" };
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
      body: JSON.stringify({ title: "new conversation" })
    });
    
    const data = await response.json();
    const newConvId = data.id;
    
    setMessages([]);
    setConversationId(newConvId);
    localStorage.setItem('lastMessages', JSON.stringify([]));
    localStorage.setItem('lastConversationId', newConvId);
    
    if (window.innerWidth <= 768) setIsSidebarOpen(false);
    console.log("New conversation created:", newConvId);
  } catch (error) {
    console.error("Failed to create new conversation:", error);
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
      if (!response.ok) throw new Error('Failed to load conversation');
      
      const data = await response.json();
      setMessages(data.messages || []);
      setConversationId(data.id);
      localStorage.setItem('lastConversationId', data.id);
      localStorage.setItem('lastMessages', JSON.stringify(data.messages || []));
    } catch (error) {
      console.error("Failed to load conversation:", error);
      setMessages(prev => [...prev, { sender: "bot", text: `❌ 加载对话失败: ${error.message}` }]);
    }
  };

  // 👇 新增：删除对话函数
  const handleDeleteConversation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this conversation?')) return;
    
    try {
      const response = await fetch(`${apiBase}/conversations/${id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) throw new Error('Failed to delete conversation');
      
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
      console.error("Failed to delete conversation:", error);
      alert('Failed to delete conversation: ' + error.message);
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
                {m.sender === "bot" ? (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // 1. 自定义多行代码块的容器
                      pre: ({ node, ...props }) => (
                        <div className="code-block-wrapper">
                          <pre {...props} />
                        </div>
                      ),
                      // 2. 自定义代码文字
                      code: ({ node, inline, ...props }) => (
                        inline 
                          ? <code className="inline-code" {...props} /> 
                          : <code className="block-code" {...props} />
                      )
                    }}
                  >
                    {m.text}
                  </ReactMarkdown>
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
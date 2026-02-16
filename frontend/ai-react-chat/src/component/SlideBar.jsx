import { useState, useEffect } from 'react';
import '../styles/SlideBar.css';

// 从环境变量或 localStorage 获取 API 基础 URL
const getApiBase = () => {
  if (typeof window !== 'undefined') {
    // 优先级：.env VITE_API_BASE > localStorage > 默认
    if (import.meta.env.VITE_API_BASE) {
      return import.meta.env.VITE_API_BASE;
    }
    return localStorage.getItem('apiBase') || "/api";
  }
  return import.meta.env.VITE_API_BASE || "/api";
};

// 获取认证头部
const getAuthHeader = () => {
  const token = localStorage.getItem('auth_token');
  return {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

function SlideBar({ apiBase: apiBaseProp, onSelectConversation, onDeleteConversation, currentConversationId, isOpen }) {
  const [conversations, setConversations] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('conversationsList');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  // 🔴 改动：优先使用从App.jsx传过来的apiBase，否则使用默认值
  const apiBase = apiBaseProp || getApiBase();

  // 🟢 加载所有对话
  const loadConversations = async () => {
    try {
      console.log('📡 正在加载对话...', { apiBase });
      const headers = getAuthHeader();
      console.log('📦 请求头:', headers);
      
      const response = await fetch(`${apiBase}/conversations`, { headers });
      console.log('✅ 响应状态:', response.status, response.statusText);
      
      if (!response.ok) {
        const text = await response.text();
        console.error('❌ 响应异常:', text.slice(0, 500));
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const contentType = response.headers.get('content-type') || '';
      // If backend returned HTML (likely wrong URL), surface it
      if (contentType.includes('text/html')) {
        const text = await response.text();
        throw new Error(`Expected JSON but got HTML from ${apiBase}/conversations. Response snippet: ${text.slice(0,200)}`);
      }
      let data;
      try {
        data = await response.json();
      } catch (err) {
        const text = await response.text();
        throw new Error(`Invalid JSON from ${apiBase}/conversations. Body snippet: ${text.slice(0,200)}`);
      }
      // 提取对话数组（后端返回 { conversations: [...], total: count }）
      const convList = data.conversations || data;
      setConversations(Array.isArray(convList) ? convList : []);
      if (typeof window !== 'undefined') {
        localStorage.setItem('conversationsList', JSON.stringify(convList));
      }
      console.log('✨ 对话加载成功:', convList.length);
    } catch (error) {
      console.error('❌ Failed to load conversations:', error);
      // show a helpful error message in sidebar
      setConversations([{ id: 'error', title: '加载对话失败', message_count: 0, timestamp: null, error: error.message }]);
      if (error.message.includes('401')) {
        localStorage.removeItem('conversationsList');
        setConversations([]);
      }
    }
  };

  // 🟢 创建新对话
  const createConversation = async () => {
    try {
      const headers = { ...getAuthHeader(), 'Content-Type': 'application/json' };
      const response = await fetch(`${apiBase}/conversations`, {
        method: 'POST',
        headers
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const newConv = await response.json();
      const convId = newConv.id;

      // 1. 更新侧边栏列表
      const updatedConversations = [newConv, ...conversations];
      setConversations(updatedConversations);
      localStorage.setItem('conversationsList', JSON.stringify(updatedConversations));

      // 2. 通知父组件切换到这个新 ID
      if (onSelectConversation) {
        onSelectConversation(convId); 
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  // 👇 新增：删除对话函数
  const deleteConversation = async (id, e) => {
    e.stopPropagation(); // 防止触发选择对话
    if (onDeleteConversation) {
      await onDeleteConversation(id);
      // 删除后重新加载列表
      await loadConversations();
    }
  };

  // 🟢 初始加载对话列表 - 当 apiBaseProp 改变时重新加载
  useEffect(() => {
    // 只在 apiBase 为有效的 URL 时加载（避免加载 /api 默认值或空值）
    if (apiBase && apiBase.startsWith('http')) {
      loadConversations();
    }
  }, [apiBase]);
  //       if (typeof window !== 'undefined') {
  //         localStorage.setItem('conversationsList', JSON.stringify(data));
  //       }
  //     } catch (error) {
  //       console.error('Failed to update conversations:', error);
  //       if (error.message.includes('401')) {
  //         localStorage.removeItem('conversationsList');
  //         setConversations([]);
  //       }
  //     }
  //   }, 3000);
  //   return () => clearInterval(intervalId);
  // }, []);

  // 🟢 更新标题
  const updateTitle = async (id) => {
    try {
      const headers = {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      };
      const response = await fetch(`${apiBase}/conversations/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ title: editTitle })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // 更新本地状态和存储
      const updatedConversations = conversations.map(conv => 
        conv.id === id ? { ...conv, title: editTitle } : conv
      );
      setConversations(updatedConversations);
      if (typeof window !== 'undefined') {
        localStorage.setItem('conversationsList', JSON.stringify(updatedConversations));
      }
      
      setIsEditing(null);
    } catch (error) {
      console.error('Failed to update title:', error);
      if (error.message.includes('401')) {
        alert('Please login to update conversation titles');
      }
      // 如果更新失败，重新加载确保数据一致性
      loadConversations();
    }
  };

  // 过滤搜索
  const filteredConversations = conversations.filter(conv => 
    (conv.title || 'new chat').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 格式化时间
const formatDate = (timestamp) => {
  if (!timestamp) return "Just now";
  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return "Just now";
  }
};

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <div className="sidebar-header">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {/* 新对话按钮 */}
        <button className="new-chat-btn" onClick={createConversation}>＋</button>
      </div>

      <div className="conversation-list">
        {filteredConversations.map((conv) => {
          // 渲染加载错误信息（由 loadConversations 设置）
          if (conv.id === 'error') {
            return (
              <div key="conv-error" className="conversation-item error">
                <div style={{padding: '12px', color: '#b00'}}>
                  <strong>无法加载对话列表：</strong>
                  <div style={{fontSize: '12px', marginTop: '6px'}}>{conv.error}</div>
                  <div style={{fontSize: '12px', marginTop: '8px'}}>
                    当前 API: <code style={{wordBreak: 'break-all'}}>{apiBase}</code>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div 
              key={conv.id}
              className={`conversation-item ${conv.id === currentConversationId ? 'active' : ''}`}
            >
              <div 
                className="conversation-content"
                onClick={() => onSelectConversation(conv.id)}
              >
                {isEditing === conv.id ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => updateTitle(conv.id)}
                    onKeyPress={(e) => e.key === 'Enter' && updateTitle(conv.id)}
                    autoFocus
                  />
                ) : (
                  <>
                    <div className="conversation-title">
                      {conv.title || 'new chat'}
                    </div>
                    <div className="conversation-info">
                      <span>{conv.message_count} messages</span>
                      <span>{formatDate(conv.timestamp)}</span>
                    </div>
                  </>
                )}
              </div>
              
              <div className="conversation-actions">
                <button
                  className="edit-btn"
                  onClick={() => {
                    setIsEditing(conv.id);
                    setEditTitle(conv.title || '');
                  }}
                >
                  ✎
                </button>
                <button
                  className="delete-btn"
                  onClick={(e) => deleteConversation(conv.id, e)}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SlideBar;
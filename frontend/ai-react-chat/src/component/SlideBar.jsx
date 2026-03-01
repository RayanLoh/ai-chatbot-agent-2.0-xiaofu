import { useState } from 'react';
import '../styles/SlideBar.css';
import db from '../utils/db.js';
import logoImg from '../assets/樱桃少女漫画版014.png'; // 引入自定义 Logo

// This component is now simplified to mostly display data passed via props.
// State management for the conversation list is handled by App.jsx.

function SlideBar({
  apiBase,
  conversations,
  isLoading,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
  currentConversationId,
  isOpen,
  loadConversations // Function passed from App.jsx to reload the list if needed
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const getAuthHeader = () => {
    const token = localStorage.getItem('auth_token');
    return {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  };

  const deleteConversation = (id, e) => {
    e.stopPropagation();
    onDeleteConversation(id);
  };

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
      
      // Instead of updating local state, we ask the parent to reload the list
      // to ensure data consistency across the app.
      await loadConversations();
      
      setIsEditing(null);
    } catch (error) {
      console.error('Failed to update title:', error);
      if (error.message.includes('401')) {
        alert('Please login to update conversation titles');
      }
      // If the update fails, reload to ensure data consistency
      await loadConversations();
    }
  };

  const filteredConversations = conversations.filter(conv => 
    (conv.title || 'new chat').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <button className="new-chat-btn" onClick={onNewChat}>＋</button>
      </div>

      <div className="conversation-list">
        {isLoading && conversations.length === 0 ? (
          <div className="loading-conversations">
            <img src={logoImg} alt="Loading..." className="loading-logo" />
            <p>Loading conversations...</p>
          </div>
        ) : filteredConversations.map((conv) => {
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
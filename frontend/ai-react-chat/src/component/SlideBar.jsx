import { useState } from 'react';
import DeleteConfirmModal from './DeleteConfirmModal';
import '../styles/SlideBar.css';
import logoImg from '../assets/樱桃少女漫画版014.png';

// This component is now simplified to mostly display data passed via props.
// State management and API calls are handled by the parent App.jsx.

function SlideBar({
  conversations,
  isLoading,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
  onUpdateTitle, // New prop for handling title updates
  currentConversationId,
  isOpen,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [conversationPendingDeletion, setConversationPendingDeletion] = useState(null);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);

  const handleDelete = (id, e) => {
    e.stopPropagation();
    const targetConversation = conversations.find((conversation) => conversation.id === id) || null;
    setConversationPendingDeletion(targetConversation);
  };

  const closeDeleteModal = () => {
    if (isDeletingConversation) return;
    setConversationPendingDeletion(null);
  };

  const confirmDeleteConversation = async () => {
    if (!conversationPendingDeletion) return;

    setIsDeletingConversation(true);

    try {
      await onDeleteConversation(conversationPendingDeletion.id);
      setConversationPendingDeletion(null);
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const handleUpdateTitle = async (id) => {
    if (editTitle && onUpdateTitle) {
      await onUpdateTitle(id, editTitle);
    }
    setIsEditing(null);
  };

  const filteredConversations = conversations.filter(conv => 
    (conv.title || 'new chat').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (timestamp) => {
    if (!timestamp) return "Just now";
    try {
      const date = new Date(timestamp);
      // Check if the date is valid before formatting
      if (isNaN(date.getTime())) return "Invalid date";
      return date.toLocaleString('zh-CN', {
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
    <>
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
                    <strong>Unable to load conversations:</strong>
                    <div style={{fontSize: '12px', marginTop: '6px'}}>{conv.error}</div>
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
                      onBlur={() => handleUpdateTitle(conv.id)}
                      onKeyPress={(e) => e.key === 'Enter' && handleUpdateTitle(conv.id)}
                      autoFocus
                      onClick={(e) => e.stopPropagation()} // Prevent conversation selection while editing
                    />
                  ) : (
                    <>
                      <div className="conversation-title">
                        {conv.title || 'new chat'}
                      </div>
                      <div className="conversation-info">
                        <span>{conv.message_count || 0} messages</span>
                        <span>{formatDate(conv.updated_at || conv.timestamp)}</span>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="conversation-actions">
                  <button
                    className="edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(conv.id);
                      setEditTitle(conv.title || 'new chat');
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="delete-btn"
                    onClick={(e) => handleDelete(conv.id, e)}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={Boolean(conversationPendingDeletion)}
        conversationTitle={conversationPendingDeletion?.title || 'new chat'}
        isDeleting={isDeletingConversation}
        onCancel={closeDeleteModal}
        onConfirm={confirmDeleteConversation}
      />
    </>
  );
}

export default SlideBar;
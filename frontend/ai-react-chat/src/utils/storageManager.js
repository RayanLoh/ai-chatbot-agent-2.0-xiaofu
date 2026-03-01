import db from './db.js';

/**
 * 存储管理工具
 * 功能分离：
 * - 文本、JSON 数据 → LocalStorage（快速访问）
 * - 图片、大文件 → IndexedDB（空间无限）
 */

// ==================== LocalStorage 管理 ====================

export const LocalStorageManager = {
  /**
   * 保存消息元数据到 LocalStorage
   * 只存储文本部分，图片引用存 imageIds
   */
  saveMessagesMetadata(conversationId, messages) {
    try {
      const metadata = messages.map(m => ({
        id: m.id,
        conversationId: m.conversationId,
        text: m.text?.startsWith('IMG_DATA:') ? '[Image]' : m.text,
        sender: m.sender,
        imageIds: m.imageIds || [],
        createdAt: m.createdAt,
        updatedAt: m.updatedAt
      }));
      
      localStorage.setItem(`messages_${conversationId}`, JSON.stringify(metadata));
      localStorage.setItem('lastConversationId', conversationId);
      return true;
    } catch (e) {
      console.warn('⚠️ LocalStorage 保存失败:', e.message);
      return false;
    }
  },

  /**
   * 从 LocalStorage 读取消息元数据
   */
  getMessagesMetadata(conversationId) {
    try {
      const data = localStorage.getItem(`messages_${conversationId}`);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('❌ LocalStorage 读取失败:', e);
      return [];
    }
  },

  /**
   * 保存用户信息、主题等小数据
   */
  setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`LocalStorage 保存 ${key} 失败:`, e);
    }
  },

  /**
   * 获取用户信息等小数据
   */
  getItem(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error(`LocalStorage 读取 ${key} 失败:`, e);
      return null;
    }
  },

  /**
   * 删除对话元数据
   */
  removeConversation(conversationId) {
    try {
      localStorage.removeItem(`messages_${conversationId}`);
    } catch (e) {
      console.error('删除本地对话失败:', e);
    }
  },

  /**
   * 清空所有对话
   */
  clearAllConversations() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('messages_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error('清空对话失败:', e);
    }
  }
};

// ==================== IndexedDB 管理 ====================

export const IndexedDBManager = {
  /**
   * 保存单个图片到 IndexedDB
   * @param {string} messageId - 消息 ID
   * @param {string} base64Data - Base64 编码的图片
   * @param {string} type - 图片类型 (jpeg/png 等)
   * @returns {Promise<string>} 返回图片 ID
   */
  async saveImage(messageId, base64Data, type = 'png') {
    try {
      // 计算大小（粗略估计）
      const size = Math.ceil(base64Data.length * 0.75);
      
      const imageId = `img_${messageId}_${Date.now()}`;
      await db.images.add({
        id: imageId,
        messageId,
        type,
        base64Data,
        size,
        createdAt: Date.now()
      });
      
      console.log(`✅ 图片已保存到 IndexedDB: ${imageId} (${(size / 1024).toFixed(2)} KB)`);
      return imageId;
    } catch (e) {
      console.error('❌ 图片保存失败:', e);
      throw e;
    }
  },

  /**
   * 获取图片数据
   * @param {string} imageId - 图片 ID
   * @returns {Promise<Object|null>} 返回图片对象或 null
   */
  async getImage(imageId) {
    try {
      return await db.images.get(imageId);
    } catch (e) {
      console.error('❌ 获取图片失败:', e);
      return null;
    }
  },

  /**
   * 获取消息的所有图片
   * @param {string} messageId - 消息 ID
   * @returns {Promise<Array>} 返回图片数组
   */
  async getMessageImages(messageId) {
    try {
      return await db.images.where('messageId').equals(messageId).toArray();
    } catch (e) {
      console.error('❌ 获取消息图片失败:', e);
      return [];
    }
  },

  /**
   * 删除单个图片
   * @param {string} imageId - 图片 ID
   */
  async deleteImage(imageId) {
    try {
      await db.images.delete(imageId);
      console.log(`✅ 图片已删除: ${imageId}`);
    } catch (e) {
      console.error('❌ 删除图片失败:', e);
    }
  },

  /**
   * 删除消息的所有图片
   * @param {string} messageId - 消息 ID
   */
  async deleteMessageImages(messageId) {
    try {
      const images = await db.images.where('messageId').equals(messageId).toArray();
      await db.images.bulkDelete(images.map(img => img.id));
      console.log(`✅ 已删除消息 ${messageId} 的所有图片`);
    } catch (e) {
      console.error('❌ 删除消息图片失败:', e);
    }
  },

  /**
   * 保存完整对话到 IndexedDB
   */
  async saveConversation(conversationId, messages) {
    try {
      const conversationData = {
        id: conversationId,
        conversationId,
        messages: messages.map(m => ({
          id: m.id,
          text: m.text,
          sender: m.sender,
          imageIds: m.imageIds || [],
          createdAt: m.createdAt
        })),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await db.conversations.put(conversationData);
      console.log(`✅ 对话已保存到 IndexedDB: ${conversationId}`);
    } catch (e) {
      console.error('❌ 对话保存失败:', e);
    }
  },

  /**
   * 获取对话
   */
  async getConversation(conversationId) {
    try {
      return await db.conversations.get(conversationId);
    } catch (e) {
      console.error('❌ 获取对话失败:', e);
      return null;
    }
  },

  /**
   * 获取所有对话列表
   */
  async getAllConversations() {
    try {
      return await db.conversations.orderBy('updatedAt').reverse().toArray();
    } catch (e) {
      console.error('❌ 获取对话列表失败:', e);
      return [];
    }
  },

  /**
   * 删除对话
   */
  async deleteConversation(conversationId) {
    try {
      // 删除对话中的所有图片
      const images = await db.images.where('messageId').anyOf(
        (await db.conversations.get(conversationId))?.messages.map(m => m.id) || []
      ).toArray();
      
      await db.images.bulkDelete(images.map(img => img.id));
      await db.conversations.delete(conversationId);
      console.log(`✅ 对话及其图片已删除: ${conversationId}`);
    } catch (e) {
      console.error('❌ 删除对话失败:', e);
    }
  },

  /**
   * 获取 IndexedDB 存储统计信息
   */
  async getStorageStats() {
    try {
      const imageCount = await db.images.count();
      const conversationCount = await db.conversations.count();
      const images = await db.images.toArray();
      const totalSize = images.reduce((sum, img) => sum + (img.size || 0), 0);

      return {
        imageCount,
        conversationCount,
        totalImageSize: totalSize,
        totalImageSizeKB: (totalSize / 1024).toFixed(2),
        totalImageSizeMB: (totalSize / 1024 / 1024).toFixed(2)
      };
    } catch (e) {
      console.error('❌ 获取统计信息失败:', e);
      return null;
    }
  },

  /**
   * 清空 IndexedDB
   */
  async clearAll() {
    try {
      await db.images.clear();
      await db.conversations.clear();
      console.log('✅ IndexedDB 已清空');
    } catch (e) {
      console.error('❌ 清空 IndexedDB 失败:', e);
    }
  }
};

// ==================== 智能存储管理 ====================

/**
 * 综合管理器：自动分离处理图片和文本
 */
export const StorageManager = {
  /**
   * 处理消息中的图片，提取到 IndexedDB
   * 返回处理后的消息（图片替换为 ID 引用）
   */
  async extractImages(message) {
    const imageIds = [];
    let processedText = message.text;

    // 检测 Base64 图片格式: IMG_DATA:base64,xxxxx
    const imageRegex = /IMG_DATA:([^,]+),([A-Za-z0-9+/=]+)/g;
    const matches = [...processedText.matchAll(imageRegex)];

    for (const match of matches) {
      const type = match[1]; // 图片类型
      const base64Data = match[2]; // Base64 数据
      
      const imageId = await IndexedDBManager.saveImage(message.id, base64Data, type);
      imageIds.push(imageId);
    }

    // 移除原始 Base64 数据，只保留占位符
    processedText = processedText.replace(imageRegex, '[Image]');

    return {
      ...message,
      text: processedText,
      imageIds
    };
  },

  /**
   * 恢复消息中的图片
   * 将 ID 引用替换回 Base64 数据
   */
  async restoreImages(message) {
    if (!message.imageIds || message.imageIds.length === 0) {
      return message;
    }

    let restoredText = message.text;
    
    for (const imageId of message.imageIds) {
      const imageData = await IndexedDBManager.getImage(imageId);
      if (imageData) {
        const fullData = `IMG_DATA:${imageData.type},${imageData.base64Data}`;
        restoredText = restoredText.replace('[Image]', fullData, 1);
      }
    }

    return {
      ...message,
      text: restoredText
    };
  },

  /**
   * 保存完整的消息列表（分离处理图片和文本）
   */
  async saveMessages(conversationId, messages) {
    // 提取图片到 IndexedDB
    const processedMessages = [];
    for (const msg of messages) {
      const processed = await this.extractImages(msg);
      processedMessages.push(processed);
    }

    // 文本元数据保存到 LocalStorage
    LocalStorageManager.saveMessagesMetadata(conversationId, processedMessages);

    // 完整对话保存到 IndexedDB
    await IndexedDBManager.saveConversation(conversationId, processedMessages);
  },

  /**
   * 加载消息列表
   */
  async loadMessages(conversationId) {
    // 从 LocalStorage 加载元数据
    const metadata = LocalStorageManager.getMessagesMetadata(conversationId);
    
    // 从 IndexedDB 恢复图片数据
    const messagesWithImages = [];
    for (const msg of metadata) {
      const restored = await this.restoreImages(msg);
      messagesWithImages.push(restored);
    }

    return messagesWithImages;
  },

  /**
   * 删除对话
   */
  async deleteConversation(conversationId) {
    LocalStorageManager.removeConversation(conversationId);
    await IndexedDBManager.deleteConversation(conversationId);
  },

  /**
   * 清空所有数据
   */
  async clearAll() {
    LocalStorageManager.clearAllConversations();
    await IndexedDBManager.clearAll();
  }
};

export default StorageManager;

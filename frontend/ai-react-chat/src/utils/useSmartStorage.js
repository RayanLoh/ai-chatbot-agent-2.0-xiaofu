import { useEffect } from 'react';
import StorageManager, { IndexedDBManager, LocalStorageManager } from './storageManager.js';

/**
 * React Hook: 使用智能存储管理
 * 自动处理图片和文本的分离存储
 * 
 * 使用示例：
 * const {
 *   loadMessages,
 *   saveMessages,
 *   getStorageStats
 * } = useSmartStorage();
 */
export function useSmartStorage() {
  return {
    /**
     * 加载消息（自动从 IndexedDB 恢复图片）
     */
    async loadMessages(conversationId) {
      return await StorageManager.loadMessages(conversationId);
    },

    /**
     * 保存消息（自动分离图片到 IndexedDB）
     */
    async saveMessages(conversationId, messages) {
      return await StorageManager.saveMessages(conversationId, messages);
    },

    /**
     * 删除对话
     */
    async deleteConversation(conversationId) {
      return await StorageManager.deleteConversation(conversationId);
    },

    /**
     * 清空所有数据
     */
    async clearAll() {
      return await StorageManager.clearAll();
    },

    /**
     * 获取存储统计信息
     */
    async getStorageStats() {
      return await IndexedDBManager.getStorageStats();
    },

    /**
     * 直接访问 LocalStorage（用于小数据）
     */
    localStorage: LocalStorageManager,

    /**
     * 直接访问 IndexedDB（高级用法）
     */
    indexedDB: IndexedDBManager,

    /**
     * 获取单个消息的所有图片
     */
    async getMessageImages(messageId) {
      return await IndexedDBManager.getMessageImages(messageId);
    }
  };
}

/**
 * Hook: 初始化存储系统
 * 在 App 组件 mount 时调用
 */
export function useStorageInit() {
  useEffect(() => {
    const initStorage = async () => {
      console.log('🚀 初始化存储系统...');
      
      try {
        const stats = await IndexedDBManager.getStorageStats();
        console.log('📊 IndexedDB 状态:', {
          图片数量: stats.imageCount,
          对话数量: stats.conversationCount,
          总大小: stats.totalImageSizeMB + ' MB'
        });
      } catch (e) {
        console.error('❌ 存储初始化失败:', e);
      }
    };

    initStorage();
  }, []);
}

export default useSmartStorage;

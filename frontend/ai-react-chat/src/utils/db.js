import Dexie from 'dexie';

/**
 * IndexedDB 数据库配置
 * 用于存储图片、文件等大文件数据
 */
export const db = new Dexie('AIChatbotDB');

// 定义数据库架构
db.version(1).stores({
  // conversations: 存储对话内容（包括图片 Base64）
  conversations: '&id, createdAt',
  // images: 专门存储图片（优化查询）
  images: '&id, messageId, type',
  // cache: 存储其他缓存数据
  cache: '&key'
});

/**
 * 对话表结构
 * @typedef {Object} Conversation
 * @property {string} id - 唯一 ID
 * @property {string} conversationId - 对话 ID
 * @property {string} text - 消息文本
 * @property {string} sender - 发送者 (user/assistant)
 * @property {Array<string>} imageIds - 关联的图片 ID 列表
 * @property {number} createdAt - 创建时间戳
 * @property {number} updatedAt - 更新时间戳
 */

/**
 * 图片表结构
 * @typedef {Object} Image
 * @property {string} id - 唯一 ID
 * @property {string} messageId - 关联的消息 ID
 * @property {string} type - 图片类型 (jpeg/png/webp 等)
 * @property {string} base64Data - Base64 编码的图片数据
 * @property {number} size - 文件大小（字节）
 * @property {number} createdAt - 创建时间戳
 */

/**
 * 自动清理机制 (LRU算法)
 * 检查 IndexedDB 存储使用量，当超过阈值（如 500MB）时，
 * 删除最旧对话中的图片数据，直到剩余空间安全（如 400MB）。
 */
export const autoCleanupOldImages = async () => {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return;

    const { usage } = await navigator.storage.estimate();
    // 设置阈值为 500MB
    const MAX_USAGE = 500 * 1024 * 1024;
    // 目标降至 400MB
    const TARGET_USAGE = 400 * 1024 * 1024;

    if (usage > MAX_USAGE) {
      console.log(`🧹 存储空间占用 ${(usage / 1024 / 1024).toFixed(2)}MB，超过 500MB 阈值，开始执行 LRU 图片清理...`);
      
      const bytesToFree = usage - TARGET_USAGE;
      let bytesFreed = 0;
      let cleanedCount = 0;

      // 获取所有对话并按最近更新时间升序排序（最旧的排前面）
      const allConvs = await db.conversations.orderBy('updatedAt').toArray();

      for (const conv of allConvs) {
        if (bytesFreed >= bytesToFree) break; // 已经释放足够的空间

        let modified = false;
        
        conv.messages.forEach(msg => {
          if (msg.images && msg.images.length > 0) {
            msg.images.forEach(imgData => {
              // 粗略计算 Base64 字符串的字节大小 (约等于其长度)
              bytesFreed += imgData.length;
            });
            // 清空该消息的图片
            msg.images = [];
            modified = true;
          }
        });

        if (modified) {
          // 只更新被修改的对话
          await db.conversations.put(conv);
          cleanedCount++;
        }
      }

      console.log(`✅ LRU 清理完成！共清理了 ${cleanedCount} 个最旧对话中的图片，释放了约 ${(bytesFreed / 1024 / 1024).toFixed(2)}MB 空间。旧对话的文字记录已保留。`);
    } else {
      console.log(`✅ 存储状况良好: ${(usage / 1024 / 1024).toFixed(2)}MB / 500MB`);
    }
  } catch (err) {
    console.error('❌ 自动清理缓存失败:', err);
  }
};

export default db;

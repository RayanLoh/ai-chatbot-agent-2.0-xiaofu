/**
 * ============================================================================
 * 🔍 IndexedDB 诊断和测试工具
 * ============================================================================
 * 
 * 使用方法：
 * 1. 在浏览器控制台中导入：
 *    import { runFullDiagnostics, quickTest } from './utils/diagnostics.js'
 * 
 * 2. 运行诊断：
 *    await runFullDiagnostics()
 * 
 * 3. 快速测试：
 *    await quickTest()
 * 
 * ============================================================================
 */

import db from './db.js';
import { IndexedDBManager, LocalStorageManager, StorageManager } from './storageManager.js';

// ============================================================================
// 1. 基础检查
// ============================================================================

export const CheckBasics = {
  /**
   * 检查浏览器是否支持 IndexedDB
   */
  isSupportedByBrowser() {
    const hasIndexedDB = !!window.indexedDB;
    const hasLocalStorage = !!window.localStorage;
    
    console.log('✅ 浏览器支持检查:');
    console.log(`   IndexedDB: ${hasIndexedDB ? '✅ 支持' : '❌ 不支持'}`);
    console.log(`   LocalStorage: ${hasLocalStorage ? '✅ 支持' : '❌ 不支持'}`);
    
    return {
      indexedDB: hasIndexedDB,
      localStorage: hasLocalStorage
    };
  },

  /**
   * 检查是否在隐私/无痕模式
   */
  isPrivateMode() {
    return new Promise((resolve) => {
      const test = window.indexedDB.open('_test_db_');
      
      test.onerror = () => {
        console.warn('⚠️ 检测到隐私/无痕模式 - IndexedDB 可能不可用');
        resolve(true);
      };
      
      test.onsuccess = () => {
        window.indexedDB.deleteDatabase('_test_db_');
        console.log('✅ 非隐私模式 - IndexedDB 正常可用');
        resolve(false);
      };
    });
  },

  /**
   * 检查存储配额
   */
  async checkStorageQuota() {
    if (!navigator.storage) {
      console.warn('⚠️ navigator.storage 不可用');
      return null;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percent = (usage / quota * 100).toFixed(2);

      console.log('📦 存储配额信息:');
      console.log(`   已使用: ${(usage / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   总配额: ${(quota / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   使用率: ${percent}%`);

      return {
        usage,
        quota,
        percentUsed: parseFloat(percent),
        usageMB: (usage / 1024 / 1024).toFixed(2),
        quotaMB: (quota / 1024 / 1024).toFixed(2)
      };
    } catch (e) {
      console.error('❌ 无法获取存储配额:', e.message);
      return null;
    }
  },

  /**
   * 检查持久化权限
   */
  async checkPersistence() {
    if (!navigator.storage?.persisted) {
      console.warn('⚠️ 持久化 API 不可用');
      return null;
    }

    try {
      const isPersisted = await navigator.storage.persisted();
      console.log(`🔒 持久化状态: ${isPersisted ? '✅ 已启用' : '❌ 未启用'}`);
      return isPersisted;
    } catch (e) {
      console.error('❌ 检查持久化失败:', e.message);
      return null;
    }
  }
};

// ============================================================================
// 2. 数据库连接测试
// ============================================================================

export const CheckDatabase = {
  /**
   * 测试 Dexie 连接
   */
  async testDexieConnection() {
    try {
      console.log('🔗 测试 Dexie 连接...');
      
      // 尝试打开数据库
      await db.open();
      console.log('✅ Dexie 连接成功');
      
      // 检查表
      const tables = Object.keys(db.tables || {});
      console.log(`✅ 数据库表: ${tables.join(', ')}`);
      
      return {
        success: true,
        tables: tables
      };
    } catch (e) {
      console.error('❌ Dexie 连接失败:', e.message);
      return {
        success: false,
        error: e.message
      };
    }
  },

  /**
   * 测试表是否可访问
   */
  async testTableAccess() {
    try {
      console.log('📋 测试表访问权限...');

      // 检查 images 表
      try {
        const imageCount = await db.images.count();
        console.log(`✅ images 表: 共 ${imageCount} 条记录`);
      } catch (e) {
        console.error('❌ images 表无法访问:', e.message);
      }

      // 检查 conversations 表
      try {
        const convCount = await db.conversations.count();
        console.log(`✅ conversations 表: 共 ${convCount} 条记录`);
      } catch (e) {
        console.error('❌ conversations 表无法访问:', e.message);
      }

      // 检查 cache 表
      try {
        const cacheCount = await db.cache.count();
        console.log(`✅ cache 表: 共 ${cacheCount} 条记录`);
      } catch (e) {
        console.error('❌ cache 表无法访问:', e.message);
      }

      return { success: true };
    } catch (e) {
      console.error('❌ 表访问测试失败:', e.message);
      return { success: false, error: e.message };
    }
  }
};

// ============================================================================
// 3. 读写测试
// ============================================================================

export const CheckReadWrite = {
  /**
   * 测试写入操作
   */
  async testWrite() {
    try {
      console.log('✍️ 测试写入操作...');

      // 测试写入图片
      const testImage = {
        id: `test_img_${Date.now()}`,
        messageId: `test_msg_${Date.now()}`,
        type: 'png',
        base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        size: 73,
        createdAt: Date.now()
      };

      await db.images.add(testImage);
      console.log(`✅ 图片写入成功: ${testImage.id}`);

      // 测试写入对话
      const testConversation = {
        id: `test_conv_${Date.now()}`,
        conversationId: `test_conv_${Date.now()}`,
        messages: [
          {
            id: `test_msg_${Date.now()}`,
            text: '测试消息',
            sender: 'user',
            imageIds: [testImage.id],
            createdAt: Date.now()
          }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await db.conversations.add(testConversation);
      console.log(`✅ 对话写入成功: ${testConversation.id}`);

      return {
        success: true,
        testImageId: testImage.id,
        testConversationId: testConversation.id
      };
    } catch (e) {
      console.error('❌ 写入测试失败:', e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * 测试读取操作
   */
  async testRead(imageId, conversationId) {
    try {
      console.log('📖 测试读取操作...');

      // 读取图片
      const image = await db.images.get(imageId);
      if (image) {
        console.log(`✅ 图片读取成功: ${image.id}`);
      } else {
        console.warn(`⚠️ 图片不存在: ${imageId}`);
      }

      // 读取对话
      const conversation = await db.conversations.get(conversationId);
      if (conversation) {
        console.log(`✅ 对话读取成功: ${conversation.id}`);
      } else {
        console.warn(`⚠️ 对话不存在: ${conversationId}`);
      }

      return { success: true };
    } catch (e) {
      console.error('❌ 读取测试失败:', e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * 测试删除操作
   */
  async testDelete(imageId, conversationId) {
    try {
      console.log('🗑️ 测试删除操作...');

      await db.images.delete(imageId);
      console.log(`✅ 图片删除成功: ${imageId}`);

      await db.conversations.delete(conversationId);
      console.log(`✅ 对话删除成功: ${conversationId}`);

      return { success: true };
    } catch (e) {
      console.error('❌ 删除测试失败:', e.message);
      return { success: false, error: e.message };
    }
  }
};

// ============================================================================
// 4. StorageManager 功能测试
// ============================================================================

export const CheckStorageManager = {
  /**
   * 测试图片保存和恢复
   */
  async testImageExtraction() {
    try {
      console.log('🖼️ 测试图片提取和恢复...');

      // 创建包含图片的消息
      const message = {
        id: `msg_${Date.now()}`,
        sender: 'user',
        text: 'Check this: IMG_DATA:png,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        imageIds: []
      };

      // 提取图片
      const extracted = await StorageManager.extractImages(message);
      console.log(`✅ 图片提取成功: ${extracted.imageIds.length} 张图片`);

      // 恢复图片
      const restored = await StorageManager.restoreImages(extracted);
      console.log(`✅ 图片恢复成功`);

      // 验证
      if (restored.text.includes('IMG_DATA:')) {
        console.log('✅ 图片恢复正确');
        return { success: true };
      } else {
        console.error('❌ 图片恢复异常');
        return { success: false, error: '图片数据未恢复' };
      }
    } catch (e) {
      console.error('❌ 图片处理测试失败:', e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * 测试完整消息流程
   */
  async testFullWorkflow() {
    try {
      console.log('🔄 测试完整工作流...');

      const convId = `test_workflow_${Date.now()}`;
      const messages = [
        {
          id: `msg1_${Date.now()}`,
          sender: 'user',
          text: 'Hello IMG_DATA:png,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          imageIds: []
        },
        {
          id: `msg2_${Date.now()}`,
          sender: 'bot',
          text: 'Response received'
        }
      ];

      // 保存
      await StorageManager.saveMessages(convId, messages);
      console.log('✅ 消息保存成功');

      // 加载
      const loaded = await StorageManager.loadMessages(convId);
      console.log(`✅ 消息加载成功: ${loaded.length} 条`);

      // 清理
      await StorageManager.deleteConversation(convId);
      console.log('✅ 测试数据清理成功');

      return { success: true };
    } catch (e) {
      console.error('❌ 工作流测试失败:', e.message);
      return { success: false, error: e.message };
    }
  }
};

// ============================================================================
// 5. 数据统计
// ============================================================================

export const CheckStatistics = {
  /**
   * 获取详细统计信息
   */
  async getStats() {
    try {
      console.log('📊 收集统计信息...');

      const stats = await IndexedDBManager.getStorageStats();
      
      console.log('📊 IndexedDB 统计:');
      console.log(`   📸 图片总数: ${stats.imageCount}`);
      console.log(`   💬 对话总数: ${stats.conversationCount}`);
      console.log(`   💾 图片总大小: ${stats.totalImageSizeMB} MB`);

      // LocalStorage info
      console.log('📊 LocalStorage 统计:');
      const lsSize = new Blob(Object.values(localStorage)).size / 1024 / 1024;
      console.log(`   📝 已用: ${lsSize.toFixed(2)} MB (限制 ~10 MB)`);
      console.log(`   📦 条目数: ${Object.keys(localStorage).length}`);

      return {
        indexedDB: stats,
        localStorage: {
          sizeMB: lsSize.toFixed(2),
          items: Object.keys(localStorage).length
        }
      };
    } catch (e) {
      console.error('❌ 统计失败:', e.message);
      return null;
    }
  }
};

// ============================================================================
// 6. 完整诊断
// ============================================================================

export const runFullDiagnostics = async () => {
  console.clear();
  console.log('='.repeat(60));
  console.log('🔍 IndexedDB 完整诊断开始');
  console.log('='.repeat(60));

  const results = {};

  // 1. 基础检查
  console.log('\n📋 第 1 步: 基础环境检查');
  console.log('-'.repeat(60));
  results.basics = CheckBasics.isSupportedByBrowser();
  const isPrivate = await CheckBasics.isPrivateMode();
  const quota = await CheckBasics.checkStorageQuota();
  const persistence = await CheckBasics.checkPersistence();

  // 2. 数据库连接
  console.log('\n📋 第 2 步: 数据库连接测试');
  console.log('-'.repeat(60));
  results.dexie = await CheckDatabase.testDexieConnection();
  results.tables = await CheckDatabase.testTableAccess();

  // 3. 读写测试
  console.log('\n📋 第 3 步: 读写操作测试');
  console.log('-'.repeat(60));
  const writeResult = await CheckReadWrite.testWrite();
  if (writeResult.success) {
    await CheckReadWrite.testRead(writeResult.testImageId, writeResult.testConversationId);
    await CheckReadWrite.testDelete(writeResult.testImageId, writeResult.testConversationId);
  }

  // 4. StorageManager 测试
  console.log('\n📋 第 4 步: StorageManager 功能测试');
  console.log('-'.repeat(60));
  results.imageExtraction = await CheckStorageManager.testImageExtraction();
  results.workflow = await CheckStorageManager.testFullWorkflow();

  // 5. 统计信息
  console.log('\n📋 第 5 步: 统计信息');
  console.log('-'.repeat(60));
  results.stats = await CheckStatistics.getStats();

  // 最终结果
  console.log('\n' + '='.repeat(60));
  console.log('✨ 诊断完成');
  console.log('='.repeat(60));

  const allSuccess = Object.values(results).every(r => 
    typeof r === 'object' ? r.success !== false : true
  );

  if (allSuccess) {
    console.log('✅ 所有测试通过！IndexedDB 运作正常');
  } else {
    console.warn('⚠️ 部分测试失败，请检查异常日志');
  }

  console.log('\n💡 诊断结果存储在 results 对象中，可通过以下方式查看:');
  console.log('   console.log(results)');

  return results;
};

// ============================================================================
// 7. 快速测试（简化版）
// ============================================================================

export const quickTest = async () => {
  console.log('\n🚀 快速测试 IndexedDB...\n');

  try {
    // 1. 基础检查
    CheckBasics.isSupportedByBrowser();

    // 2. 可用配额
    await CheckBasics.checkStorageQuota();

    // 3. 写入测试
    const writeResult = await CheckReadWrite.testWrite();

    if (writeResult.success) {
      // 4. 读取测试
      await CheckReadWrite.testRead(writeResult.testImageId, writeResult.testConversationId);

      // 5. 清理
      await CheckReadWrite.testDelete(writeResult.testImageId, writeResult.testConversationId);
    }

    // 6. 统计
    await CheckStatistics.getStats();

    console.log('\n✅ 快速测试完成！');
  } catch (e) {
    console.error('\n❌ 快速测试失败:', e);
  }
};

// ============================================================================
// 8. 导出报告
// ============================================================================

export const generateReport = async () => {
  const results = await runFullDiagnostics();

  const report = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    results: results
  };

  const json = JSON.stringify(report, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `indexeddb-report-${Date.now()}.json`;
  a.click();

  console.log('✅ 报告已导出');
  return report;
};

export default {
  runFullDiagnostics,
  quickTest,
  generateReport,
  CheckBasics,
  CheckDatabase,
  CheckReadWrite,
  CheckStorageManager,
  CheckStatistics
};

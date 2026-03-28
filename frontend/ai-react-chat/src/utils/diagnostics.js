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
    
    console.log('✅ Browser support check:');
    console.log(`   IndexedDB: ${hasIndexedDB ? '✅ Supported' : '❌ Not supported'}`);
    console.log(`   LocalStorage: ${hasLocalStorage ? '✅ Supported' : '❌ Not supported'}`);
    
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
        console.warn('⚠️ Private/Incognito mode detected - IndexedDB may be unavailable');
        resolve(true);
      };
      
      test.onsuccess = () => {
        window.indexedDB.deleteDatabase('_test_db_');
        console.log('✅ Not in private mode - IndexedDB is available');
        resolve(false);
      };
    });
  },

  /**
   * 检查存储配额
   */
  async checkStorageQuota() {
    if (!navigator.storage) {
      console.warn('⚠️ navigator.storage is unavailable');
      return null;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percent = (usage / quota * 100).toFixed(2);

      console.log('📦 Storage quota info:');
      console.log(`   Used: ${(usage / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Total quota: ${(quota / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Usage: ${percent}%`);

      return {
        usage,
        quota,
        percentUsed: parseFloat(percent),
        usageMB: (usage / 1024 / 1024).toFixed(2),
        quotaMB: (quota / 1024 / 1024).toFixed(2)
      };
    } catch (e) {
      console.error('❌ Failed to get storage quota:', e.message);
      return null;
    }
  },

  /**
   * 检查持久化权限
   */
  async checkPersistence() {
    if (!navigator.storage?.persisted) {
      console.warn('⚠️ Persistence API is unavailable');
      return null;
    }

    try {
      const isPersisted = await navigator.storage.persisted();
      console.log(`🔒 Persistence status: ${isPersisted ? '✅ Enabled' : '❌ Disabled'}`);
      return isPersisted;
    } catch (e) {
      console.error('❌ Failed to check persistence:', e.message);
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
      console.log('🔗 Testing Dexie connection...');
      
      // 尝试打开数据库
      await db.open();
      console.log('✅ Dexie connected successfully');
      
      // 检查表
      const tables = Object.keys(db.tables || {});
      console.log(`✅ Database tables: ${tables.join(', ')}`);
      
      return {
        success: true,
        tables: tables
      };
    } catch (e) {
      console.error('❌ Dexie connection failed:', e.message);
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
      console.log('📋 Testing table access...');

      // 检查 images 表
      try {
        const imageCount = await db.images.count();
        console.log(`✅ images table: ${imageCount} records`);
      } catch (e) {
        console.error('❌ images table is inaccessible:', e.message);
      }

      // 检查 conversations 表
      try {
        const convCount = await db.conversations.count();
        console.log(`✅ conversations table: ${convCount} records`);
      } catch (e) {
        console.error('❌ conversations table is inaccessible:', e.message);
      }

      // 检查 cache 表
      try {
        const cacheCount = await db.cache.count();
        console.log(`✅ cache table: ${cacheCount} records`);
      } catch (e) {
        console.error('❌ cache table is inaccessible:', e.message);
      }

      return { success: true };
    } catch (e) {
      console.error('❌ Table access test failed:', e.message);
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
      console.log('✍️ Testing write operations...');

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
      console.log(`✅ Image written successfully: ${testImage.id}`);

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
      console.log(`✅ Conversation written successfully: ${testConversation.id}`);

      return {
        success: true,
        testImageId: testImage.id,
        testConversationId: testConversation.id
      };
    } catch (e) {
      console.error('❌ Write test failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * 测试读取操作
   */
  async testRead(imageId, conversationId) {
    try {
      console.log('📖 Testing read operations...');

      // 读取图片
      const image = await db.images.get(imageId);
      if (image) {
        console.log(`✅ Image read successfully: ${image.id}`);
      } else {
        console.warn(`⚠️ Image not found: ${imageId}`);
      }

      // 读取对话
      const conversation = await db.conversations.get(conversationId);
      if (conversation) {
        console.log(`✅ Conversation read successfully: ${conversation.id}`);
      } else {
        console.warn(`⚠️ Conversation not found: ${conversationId}`);
      }

      return { success: true };
    } catch (e) {
      console.error('❌ Read test failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * 测试删除操作
   */
  async testDelete(imageId, conversationId) {
    try {
      console.log('🗑️ Testing delete operations...');

      await db.images.delete(imageId);
      console.log(`✅ Image deleted successfully: ${imageId}`);

      await db.conversations.delete(conversationId);
      console.log(`✅ Conversation deleted successfully: ${conversationId}`);

      return { success: true };
    } catch (e) {
      console.error('❌ Delete test failed:', e.message);
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
      console.log('🖼️ Testing image extraction and restoration...');

      // 创建包含图片的消息
      const message = {
        id: `msg_${Date.now()}`,
        sender: 'user',
        text: 'Check this: IMG_DATA:png,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        imageIds: []
      };

      // 提取图片
      const extracted = await StorageManager.extractImages(message);
      console.log(`✅ Image extraction succeeded: ${extracted.imageIds.length} image(s)`);

      // 恢复图片
      const restored = await StorageManager.restoreImages(extracted);
      console.log('✅ Image restoration succeeded');

      // 验证
      if (restored.text.includes('IMG_DATA:')) {
        console.log('✅ Image restoration is correct');
        return { success: true };
      } else {
        console.error('❌ Image restoration is incorrect');
        return { success: false, error: '图片数据未恢复' };
      }
    } catch (e) {
      console.error('❌ Image processing test failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * 测试完整消息流程
   */
  async testFullWorkflow() {
    try {
      console.log('🔄 Testing full workflow...');

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
      console.log('✅ Messages saved successfully');

      // 加载
      const loaded = await StorageManager.loadMessages(convId);
      console.log(`✅ Messages loaded successfully: ${loaded.length} item(s)`);

      // 清理
      await StorageManager.deleteConversation(convId);
      console.log('✅ Test data cleaned up successfully');

      return { success: true };
    } catch (e) {
      console.error('❌ Workflow test failed:', e.message);
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
      console.log('📊 Collecting statistics...');

      const stats = await IndexedDBManager.getStorageStats();
      
      console.log('📊 IndexedDB statistics:');
      console.log(`   📸 Total images: ${stats.imageCount}`);
      console.log(`   💬 Total conversations: ${stats.conversationCount}`);
      console.log(`   💾 Total image size: ${stats.totalImageSizeMB} MB`);

      // LocalStorage info
      console.log('📊 LocalStorage statistics:');
      const lsSize = new Blob(Object.values(localStorage)).size / 1024 / 1024;
      console.log(`   📝 Used: ${lsSize.toFixed(2)} MB (limit ~10 MB)`);
      console.log(`   📦 Items: ${Object.keys(localStorage).length}`);

      return {
        indexedDB: stats,
        localStorage: {
          sizeMB: lsSize.toFixed(2),
          items: Object.keys(localStorage).length
        }
      };
    } catch (e) {
      console.error('❌ Statistics collection failed:', e.message);
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
  console.log('🔍 Full IndexedDB diagnostics started');
  console.log('='.repeat(60));

  const results = {};

  // 1. 基础检查
  console.log('\n📋 Step 1: Basic environment checks');
  console.log('-'.repeat(60));
  results.basics = CheckBasics.isSupportedByBrowser();
  const isPrivate = await CheckBasics.isPrivateMode();
  const quota = await CheckBasics.checkStorageQuota();
  const persistence = await CheckBasics.checkPersistence();

  // 2. 数据库连接
  console.log('\n📋 Step 2: Database connection tests');
  console.log('-'.repeat(60));
  results.dexie = await CheckDatabase.testDexieConnection();
  results.tables = await CheckDatabase.testTableAccess();

  // 3. 读写测试
  console.log('\n📋 Step 3: Read/write tests');
  console.log('-'.repeat(60));
  const writeResult = await CheckReadWrite.testWrite();
  if (writeResult.success) {
    await CheckReadWrite.testRead(writeResult.testImageId, writeResult.testConversationId);
    await CheckReadWrite.testDelete(writeResult.testImageId, writeResult.testConversationId);
  }

  // 4. StorageManager 测试
  console.log('\n📋 Step 4: StorageManager feature tests');
  console.log('-'.repeat(60));
  results.imageExtraction = await CheckStorageManager.testImageExtraction();
  results.workflow = await CheckStorageManager.testFullWorkflow();

  // 5. 统计信息
  console.log('\n📋 Step 5: Statistics');
  console.log('-'.repeat(60));
  results.stats = await CheckStatistics.getStats();

  // 最终结果
  console.log('\n' + '='.repeat(60));
  console.log('✨ Diagnostics completed');
  console.log('='.repeat(60));

  const allSuccess = Object.values(results).every(r => 
    typeof r === 'object' ? r.success !== false : true
  );

  if (allSuccess) {
    console.log('✅ All tests passed! IndexedDB is working correctly');
  } else {
    console.warn('⚠️ Some tests failed, please check the error logs');
  }

  console.log('\n💡 Diagnostic results are stored in the results object and can be viewed with:');
  console.log('   console.log(results)');

  return results;
};

// ============================================================================
// 7. 快速测试（简化版）
// ============================================================================

export const quickTest = async () => {
  console.log('\n🚀 Running quick IndexedDB test...\n');

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

    console.log('\n✅ Quick test completed!');
  } catch (e) {
    console.error('\n❌ Quick test failed:', e);
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

  console.log('✅ Report exported successfully');
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

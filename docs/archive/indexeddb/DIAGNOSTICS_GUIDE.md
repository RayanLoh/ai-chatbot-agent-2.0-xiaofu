> 历史资料，已归档。这里描述的 IndexedDB 模块早已移除，命令和结论不适用于当前版本。当前实现见仓库 README 和 docs/ARCHITECTURE.md。

# 🔍 IndexedDB 诊断工具使用指南

## 快速开始

### 方法 1: 浏览器控制台运行诊断

**第 1 步：打开浏览器控制台**
```
F12 → Console 标签
```

**第 2 步：粘贴以下代码运行完整诊断**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const results = await m.runFullDiagnostics();
  console.table(results);
});
```

**第 3 步：查看输出结果**
```
🔍 IndexedDB 完整诊断开始
├─ 第 1 步: 基础环境检查
├─ 第 2 步: 数据库连接测试
├─ 第 3 步: 读写操作测试
├─ 第 4 步: StorageManager 功能测试
├─ 第 5 步: 统计信息
└─ ✅ 诊断完成
```

---

## 📖 诊断工具详解

### 工具 1: 快速测试（推荐新手）

```javascript
// 运行快速测试（2 秒完成）
import('./src/utils/diagnostics.js').then(m => m.quickTest());
```

**输出示例**:
```
🚀 快速测试 IndexedDB...

✅ 浏览器支持检查:
   IndexedDB: ✅ 支持
   LocalStorage: ✅ 支持

📦 存储配额信息:
   已使用: 15.50 MB
   总配额: 256.00 MB
   使用率: 6.05%

✍️ 测试写入操作...
✅ 图片写入成功: test_img_1708876543210
✅ 对话写入成功: test_conv_1708876543210

📖 测试读取操作...
✅ 图片读取成功: test_img_1708876543210
✅ 对话读取成功: test_conv_1708876543210

🗑️ 测试删除操作...
✅ 图片删除成功: test_img_1708876543210
✅ 对话删除成功: test_conv_1708876543210

📊 IndexedDB 统计:
   📸 图片总数: 0
   💬 对话总数: 0
   💾 图片总大小: 0.00 MB

📊 LocalStorage 统计:
   📝 已用: 0.02 MB (限制 ~10 MB)
   📦 条目数: 3

✅ 快速测试完成！
```

---

### 工具 2: 完整诊断（深入检查）

```javascript
// 运行完整诊断（5-10 秒）
import('./src/utils/diagnostics.js').then(async m => {
  const results = await m.runFullDiagnostics();
});
```

**包含的检查项**:

| 项目 | 检查内容 |
|------|---------|
| 基础检查 | 浏览器支持、隐私模式、存储配额 |
| 数据库连接 | Dexie 连接、表访问权限 |
| 读写操作 | 写入、读取、删除功能 |
| StorageManager | 图片提取、恢复、完整流程 |
| 统计信息 | 数据库大小、条目数量 |

---

### 工具 3: 单项诊断（针对性检查）

**检查浏览器支持**
```javascript
import('./src/utils/diagnostics.js').then(m => {
  m.CheckBasics.isSupportedByBrowser();
});
```

**检查隐私模式**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const isPrivate = await m.CheckBasics.isPrivateMode();
  console.log('隐私模式:', isPrivate ? '是' : '否');
});
```

**检查存储配额**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  await m.CheckBasics.checkStorageQuota();
});
```

**检查 Dexie 连接**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const result = await m.CheckDatabase.testDexieConnection();
  console.log(result);
});
```

**测试读写操作**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const writeResult = await m.CheckReadWrite.testWrite();
  console.log('写入结果:', writeResult);
  
  if (writeResult.success) {
    await m.CheckReadWrite.testRead(
      writeResult.testImageId,
      writeResult.testConversationId
    );
  }
});
```

**获取统计信息**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const stats = await m.CheckStatistics.getStats();
  console.log(stats);
});
```

---

## 🎯 常见诊断场景

### 场景 1: 第一次使用，想确认工作状态

```javascript
// 1. 运行快速测试
import('./src/utils/diagnostics.js').then(m => m.quickTest());

// 2. 如果看到 ✅ 完全绿色 → 正常！
// 3. 如果看到 ❌ 红色错误 → 继续看下面
```

**预期输出**:
```
✅ 浏览器支持检查
✅ 写入操作
✅ 读取操作
✅ 删除操作
✅ 快速测试完成
```

---

### 场景 2: 数据保存失败

**步骤 1: 检查是否在隐私模式**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const isPrivate = await m.CheckBasics.isPrivateMode();
  if (isPrivate) {
    console.error('❌ 在隐私模式下，IndexedDB 不可用');
    console.log('💡 解决: 使用普通窗口');
  }
});
```

**步骤 2: 检查存储配额**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const quota = await m.CheckBasics.checkStorageQuota();
  if (quota.percentUsed > 90) {
    console.error('❌ 存储空间几乎满了');
    console.log('💡 解决: 清理旧数据');
  }
});
```

**步骤 3: 检查数据库连接**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const result = await m.CheckDatabase.testDexieConnection();
  if (!result.success) {
    console.error('❌ Dexie 连接失败:', result.error);
  }
});
```

---

### 场景 3: 性能慢

**检查数据量**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const stats = await m.CheckStatistics.getStats();
  console.log('图片数:', stats.indexedDB.imageCount);
  console.log('大小:', stats.indexedDB.totalImageSizeMB, 'MB');
  
  if (stats.indexedDB.imageCount > 10000) {
    console.warn('⚠️ 数据量太大，建议清理');
  }
});
```

---

### 场景 4: 图片保存不正确

**诊断图片处理**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const result = await m.CheckStorageManager.testImageExtraction();
  if (result.success) {
    console.log('✅ 图片处理正常');
  } else {
    console.error('❌ 图片处理异常:', result.error);
  }
});
```

---

### 场景 5: 完整流程有问题

**诊断完整工作流**
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const result = await m.CheckStorageManager.testFullWorkflow();
  if (result.success) {
    console.log('✅ 完整流程正常');
  } else {
    console.error('❌ 流程异常:', result.error);
  }
});
```

---

## 📊 读懂诊断输出

### ✅ 所有测试通过（理想情况）

```
✅ 浏览器支持检查:
   IndexedDB: ✅ 支持
   LocalStorage: ✅ 支持

✅ Dexie 连接成功
✅ images 表: 共 42 条记录
✅ conversations 表: 共 5 条记录
✅ cache 表: 共 3 条记录

✅ 图片写入成功: test_img_xxx
✅ 对话写入成功: test_conv_xxx
✅ 图片读取成功: test_img_xxx
✅ 对话读取成功: test_conv_xxx
✅ 图片删除成功: test_img_xxx
✅ 对话删除成功: test_conv_xxx

✅ 图片提取成功: 1 张图片
✅ 图片恢复成功
✅ 消息保存成功
✅ 消息加载成功: 2 条
✅ 测试数据清理成功

📊 IndexedDB 统计:
   📸 图片总数: 42
   💬 对话总数: 5
   💾 图片总大小: 12.50 MB

✅ 所有测试通过！IndexedDB 运作正常
```

**判断**: 🟢 **完美**，无需修改

---

### ⚠️ 部分功能受限（常见）

```
✅ 浏览器支持检查:
   IndexedDB: ✅ 支持
   LocalStorage: ✅ 支持

⚠️ 检测到隐私/无痕模式 - IndexedDB 可能不可用

📦 存储配额信息:
   已使用: 128.00 MB
   总配额: 512.00 MB
   使用率: 25.00%

⚠️ 持久化 API 不可用

✅ Dexie 连接成功
```

**判断**: 🟡 **正常**，但在隐私模式下可能有问题

**解决**: 在普通窗口测试

---

### ❌ 严重错误（需要修复）

```
❌ 浏览器支持检查:
   IndexedDB: ❌ 不支持
   LocalStorage: ✅ 支持

❌ 无法获取存储配额

❌ Dexie 连接失败: FAIL: Error...

❌ 写入测试失败: QuotaExceededError
```

**判断**: 🔴 **有问题**，需要处理

**解决**:
1. 如果是 IE 11：无法支持 IndexedDB，需要降级方案
2. 如果是 QuotaExceededError：清理旧数据
3. 其他错误：查看具体错误消息

---

## 🔧 当诊断发现问题时

### 问题 1: IndexedDB 不支持

```
❌ IndexedDB: ❌ 不支持
```

**原因**: 浏览器不支持（通常是 IE 11）

**解决**:
```javascript
// 在 App.jsx 中
const [useIndexedDB, setUseIndexedDB] = useState(
  !!window.indexedDB
);

if (!useIndexedDB) {
  console.warn('浏览器不支持 IndexedDB，回退到 LocalStorage');
  // 使用 LocalStorage 降级方案
}
```

---

### 问题 2: 隐私模式

```
⚠️ 检测到隐私/无痕模式 - IndexedDB 可能不可用
```

**原因**: 用户在隐私/无痕浏览模式

**解决**:
```javascript
// 提示用户
const isPrivate = await CheckBasics.isPrivateMode();
if (isPrivate) {
  alert('请在普通窗口中使用此功能');
}
```

---

### 问题 3: 存储配额满了

```
❌ 写入测试失败: QuotaExceededError
```

**原因**: IndexedDB 超出浏览器配额

**解决**:
```javascript
// 清理旧数据
const stats = await storage.getStorageStats();
if (stats.totalImageSizeMB > 500) {
  // 删除 7 天前的对话
  await storage.clearAll();
}
```

---

### 问题 4: Dexie 连接失败

```
❌ Dexie 连接失败: FAIL: Error...
```

**原因**: 数据库初始化错误

**解决**:
```javascript
// 1. 检查是否导入了 Dexie
import Dexie from 'dexie';

// 2. 检查 db.js 是否正确
import db from './utils/db.js';

// 3. 尝试清空 IndexedDB
// 在浏览器 DevTools: Application → IndexedDB → 右击 AIChatbotDB → 删除
// 然后刷新页面
```

---

## 📈 监控数据库健康度

**创建定期检查**:
```javascript
// 每 5 分钟检查一次
setInterval(async () => {
  const stats = await storage.getStorageStats();
  
  console.log(`[${new Date().toLocaleTimeString()}] 数据库健康度`);
  console.log(`  图片: ${stats.imageCount}`);
  console.log(`  大小: ${stats.totalImageSizeMB} MB`);
  
  // 告警
  if (stats.totalImageSizeMB > 500) {
    console.warn('⚠️ 存储空间即将满');
  }
}, 5 * 60 * 1000);
```

---

## 📥 导出诊断报告

**生成 JSON 报告**:
```javascript
import('./src/utils/diagnostics.js').then(async m => {
  const report = await m.generateReport();
  // 自动下载 indexeddb-report-xxx.json
});
```

**报告内容**:
```json
{
  "timestamp": "2025-02-25T10:30:45.123Z",
  "userAgent": "Mozilla/5.0...",
  "results": {
    "basics": {...},
    "dexie": {...},
    "tables": {...},
    "stats": {...}
  }
}
```

---

## ✅ 所有检查清单

运行完整诊断后，检查以下项目：

- [ ] ✅ IndexedDB 浏览器支持
- [ ] ✅ LocalStorage 浏览器支持  
- [ ] ✅ 非隐私模式
- [ ] ✅ 存储配额充足（使用率 < 90%）
- [ ] ✅ Dexie 连接成功
- [ ] ✅ 所有表可访问
- [ ] ✅ 写入操作成功
- [ ] ✅ 读取操作成功
- [ ] ✅ 删除操作成功
- [ ] ✅ 图片提取成功
- [ ] ✅ 图片恢复成功
- [ ] ✅ 完整工作流成功

全部 ✅ 代表 IndexedDB 运作正常！

---

**需要帮助？** 运行诊断，将输出结果复制到你的问题中。 🚀

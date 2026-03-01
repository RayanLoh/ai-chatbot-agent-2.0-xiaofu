# 🚀 IndexedDB 集成方案 - 完整指南

> 专业级解决方案：**将所有图片存到 IndexedDB，文本保持在 LocalStorage**

## 📋 快速概览

| 方案 | 存储位置 | 容量 | 适用场景 |
|------|---------|------|---------|
| ❌ 只用 LocalStorage | LocalStorage | 5-10 MB | 纯文本应用 |
| ✅ **推荐方案** | LocalStorage + IndexedDB | 文本 5-10 MB + 图片 GB 级 | **图片为主的应用** |

## 📁 新建文件说明

已在 `src/utils/` 目录创建了 4 个文件：

### 1️⃣ `db.js` - Dexie 数据库定义
```javascript
import Dexie from 'dexie';
export const db = new Dexie('AIChatbotDB');
```
- 定义数据库架构
- conversations 表：存储对话元数据
- images 表：存储 Base64 图片

### 2️⃣ `storageManager.js` - 核心存储管理工具
```javascript
export const StorageManager = {
  async saveMessages(conversationId, messages) { ... },
  async loadMessages(conversationId) { ... },
  async deleteConversation(conversationId) { ... },
  // ... 更多方法
};

export const LocalStorageManager = { ... };
export const IndexedDBManager = { ... };
```

**特点：**
- 自动分离图片到 IndexedDB，文本到 LocalStorage
- 智能压缩和恢复数据
- 包含清理、统计、导出等工具函数

### 3️⃣ `useSmartStorage.js` - React Hook
```javascript
const storage = useSmartStorage();
await storage.saveMessages(convId, msgs);
const messages = await storage.loadMessages(convId);
```

**简化使用：**
- 在 React 组件中直接使用
- 自动处理异步操作
- 包含初始化 Hook

### 4️⃣ `INTEGRATION_GUIDE.md` - 集成指南
- 基础使用示例
- 高级用法展示
- 性能对比
- 10+ 个实用代码片段

### 5️⃣ `APP_MODIFICATION_EXAMPLE.md` - App.jsx 改造步骤
- 逐步改造说明
- 复制粘贴代码
- 新增可选功能

## 🎯 核心原理

### 📊 数据流
```
用户消息 (含图片)
    ↓
提取 Base64 图片 → ImageID
    ↓
┌─────────────────┬──────────────────┐
│ LocalStorage    │  IndexedDB       │
├─────────────────┼──────────────────┤
│ 消息文本        │  图片 Base64     │
│ ImageID 列表    │  完整对话数据    │
│ (5-10 MB)       │  (几百 MB ~ GB)  │
└─────────────────┴──────────────────┘
```

### 🔄 自动转换格式

**保存时：** 提取图片 Base64 → 存 IndexedDB，引用 ImageID
```
原始：{ text: "look: IMG_DATA:png,iVBORw0..." }
↓
转后：{ text: "[Image]", imageIds: ["img_msg_1_123456"] }
```

**加载时：** 恢复图片 Base64 从 IndexedDB
```
读出：{ text: "[Image]", imageIds: ["img_msg_1_123456"] }
↓
恢复：{ text: "look: IMG_DATA:png,iVBORw0..." }
```

## 🚀 快速开始 (3 步)

### 第 1 步：验证依赖
```bash
cd frontend/ai-react-chat
npm ls dexie  # 验证 Dexie 已安装
```

### 第 2 步：复制文件到 App.jsx
打开 `src/utils/APP_MODIFICATION_EXAMPLE.md`，复制相关代码段到 `App.jsx`

主要改动：
```javascript
// 导入
import { useSmartStorage, useStorageInit } from './utils/useSmartStorage.js';

// App 函数内
function App() {
  useStorageInit();  // 初始化
  const storage = useSmartStorage();  // 获取工具
  
  // 替换旧的 saveMessagesToLocal
  const saveMessagesToIndexedDB = async (msgs) => {
    await storage.saveMessages(conversationId, msgs);
  };
  
  // 修改 useEffect 调用方式
}
```

### 第 3 步：测试
浏览器 DevTools:
```javascript
// 检查存储统计
const stats = await db.images.count();
console.log('图片数:', stats);

// 查看 IndexedDB 数据库
// Application → IndexedDB → AIChatbotDB
```

## 📊 真实示例

### 场景：用户发送一张图片

**之前（LocalStorage 存储）：**
```
❌ 错误: QuotaExceededError: LocalStorage 存储空间不足
（图片 Base64 通常 1 MB+，容量不足）
```

**之后（LocalStorage + IndexedDB）：**
```
✅ 消息 1: "我的图片"（89 字）→ LocalStorage
✅ 图片 1: Base64 数据（1.2 MB）→ IndexedDB
✅ 成功！
```

### 保存 100 张图片的结果

**数据库中查看：**
```javascript
const stats = await db.images.count();
console.log(stats); // 输出: 100

const imageCount = await db.images.where('messageId').equals('msg_1').count();
console.log(imageCount); // 输出: 3（该消息有 3 张图片）
```

## 🔧 高级功能

### 1. 获取存储统计
```javascript
const storage = useSmartStorage();
const stats = await storage.getStorageStats();
console.log(stats);
// {
//   imageCount: 42,
//   conversationCount: 5,
//   totalImageSizeMB: "12.00"
// }
```

### 2. 清理旧数据
```javascript
// 删除特定对话
await storage.deleteConversation('conv_123');

// 清空所有数据
await storage.clearAll();
```

### 3. 导出备份
```javascript
// 以 JSON 格式导出所有对话
const conversations = await storage.indexedDB.getAllConversations();
const backup = JSON.stringify(conversations);
// 保存到文件...
```

### 4. 监控存储空间
```javascript
// 检查浏览器配额
const estimate = await navigator.storage.estimate();
const percentUsed = (estimate.usage / estimate.quota) * 100;
console.log(`使用: ${percentUsed.toFixed(2)}%`);
```

## ⚠️ 注意事项

### ✅ 支持的浏览器
- Chrome/Edge: ✅ 完全支持
- Firefox: ✅ 完全支持
- Safari (iOS): ⚠️ 有限制（15 MB 配额）
- IE 11: ❌ 不支持（无 IndexedDB）

### 💾 容量限制

| 浏览器 | 总配额 | 说明 |
|--------|--------|------|
| Chrome | 动态 | 通常几十 MB～GB |
| Firefox | 动态 | 通常 200 MB+ |
| Safari | 50 MB | (iOS 限制) |
| Edge | 动态 | 与 Chrome 同步 |

### 🔐 隐私模式
IndexedDB 在隐私/无痕浏览中可能不可用或清空，提醒用户。

## 📝 文件清单

```
✅ 已创建的文件：
src/utils/
├── db.js                        (数据库定义)
├── storageManager.js            (核心管理工具)
├── useSmartStorage.js           (React Hook)
├── INTEGRATION_GUIDE.md         (集成指南)
└── APP_MODIFICATION_EXAMPLE.md  (改造示例)

📄 需要修改的文件：
└── src/App.jsx                  (按 APP_MODIFICATION_EXAMPLE.md 修改)
```

## 🎓 学习资源

### 官方文档
- [MDN - IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Dexie.js 文档](https://dexie.org/)

### API 参考
```javascript
// Dexie 基本操作
await db.images.add(imageData);        // 添加
await db.images.get(imageId);           // 查询单个
await db.images.toArray();              // 获取全部
await db.images.delete(imageId);        // 删除
await db.images.clear();                // 清空表
```

## 🐛 常见问题

### Q: IndexedDB 数据会丢失吗？
A: 不会。IndexedDB 是持久化存储，浏览器不会自动清空（除非用户手动清缓存）。

### Q: 如何查看 IndexedDB 中存了什么？
A: 
1. 打开 DevTools (F12)
2. 找到 "Application" 标签
3. 左边栏 "IndexedDB" → "AIChatbotDB"
4. 查看 images 和 conversations 表

### Q: Base64 图片怎么显示？
A: 直接在 `<img>` 标签中使用：
```jsx
<img src={`data:image/png;base64,${base64Data}`} />
```

### Q: 能在多个标签页共享数据吗？
A: 可以！IndexedDB 是全局的，同个浏览器的多个标签共享数据。

## 🎉 完成检查清单

- [ ] npm 已安装 Dexie
- [ ] 复制了 4 个新文件到 `src/utils/`
- [ ] 按照 APP_MODIFICATION_EXAMPLE.md 修改了 App.jsx
- [ ] 在浏览器中打开 DevTools 验证 IndexedDB
- [ ] 发送包含图片的消息测试
- [ ] 刷新页面验证数据是否保留
- [ ] 检查 LocalStorage 是否不再包含 Base64

## 🚀 下一步优化

1. **压缩图片**：保存前压缩 Base64（可用 `sharp` 或 `imagemin`）
2. **缓存策略**：定期清理超过 7 天的旧图片
3. **服务端备份**：重要对话上传到服务器
4. **分片上传**：将大对话分段存储

---

**最终效果：**
- ✅ 存储空间永远充足
- ✅ 应用流畅不卡顿
- ✅ 数据安全不丢失
- ✅ 用户体验最佳

**🎊 祝你使用愉快！**

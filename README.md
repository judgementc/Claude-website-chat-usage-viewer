# Claude Usage Monitor

一个轻量级的 Chrome 扩展，用于实时监控 Claude.ai 的 5 小时使用配额和重置倒计时。

## 功能特性

- **实时使用量监控**：可视化显示当前 5 小时窗口内的使用百分比
- **智能倒计时**：精确显示配额重置剩余时间（时:分:秒）
- **动态颜色提示**：根据使用率自动调整进度条颜色（绿色→黄色→橙色→红色）
- **离线缓存**：在网络异常时自动使用本地缓存数据
- **极简界面**：暗色主题设计，信息密度适中

## 安装方法

### 从源码安装

1. 克隆或下载本仓库：
```bash
git clone https://github.com/your-username/claude-usage-monitor.git
```

2. 准备图标文件（可选）：
   - 在项目根目录添加 `icon16.png`、`icon48.png`、`icon128.png`
   - 或临时删除 manifest.json 中的 icons 相关配置

3. 加载扩展：
   - 打开 Chrome 浏览器，访问 `chrome://extensions/`
   - 开启右上角"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目文件夹

## 使用说明

1. **首次使用**：确保已登录 [claude.ai](https://claude.ai)
2. **查看用量**：点击浏览器工具栏中的扩展图标
3. **刷新数据**：点击"刷新"按钮更新最新数据
4. **快捷访问**：点击"打开 Claude"按钮直达官网

## 技术实现

### 核心机制

- **权限模型**：使用 Manifest V3 规范，最小化权限请求（cookies, storage, tabs, scripting）
- **数据获取**：通过 `chrome.scripting.executeScript` 在页面上下文中发起 API 请求，规避 CORS 限制
- **状态管理**：结合 `chrome.storage.local` 实现数据持久化和降级策略

### 关键 API
```javascript
// 使用量接口
GET https://claude.ai/api/organizations/{orgId}/usage
```

### 依赖的 Cookies

| Cookie 名称 | 用途 |
|------------|------|
| `lastActiveOrg` | 组织标识符 |
| `ajs_anonymous_id` | Segment 分析 ID |
| `anthropic-device-id` | 设备唯一标识 |

## 隐私声明

本扩展：
- ✅ 所有数据处理均在本地完成
- ✅ 不向第三方服务器传输任何信息
- ✅ 仅与 Claude 官方 API 通信
- ✅ 不收集键盘输入、浏览历史等额外数据
- ✅ 仅在用户主动点击时发起请求

## 兼容性

- Chrome 88+（Manifest V3 支持）
- Edge 88+（Chromium 内核）
- 其他 Chromium 浏览器

## 开发计划

- [ ] 添加历史使用趋势图表
- [ ] 支持自定义刷新间隔
- [ ] 桌面通知提醒（配额即将用尽时）
- [ ] 多语言支持（英文界面）

## 故障排查

**问题：显示"请先登录 claude.ai"**
- 解决：在新标签页访问 claude.ai 并完成登录

**问题：显示"请先打开 claude.ai 页面"**
- 解决：保持至少一个 claude.ai 标签页打开状态

**问题：数据获取失败**
- 检查网络连接
- 确认 Claude 服务正常运行
- 尝试刷新 claude.ai 页面后重新获取

## 许可证

MIT License

## 免责声明

本项目为非官方工具，与 Anthropic 公司无关联关系。使用本扩展即表示同意自行承担相关风险。

## 贡献

欢迎提交 Issue 和 Pull Request。

---

**Star ⭐ 本项目以支持开发**
---

**Star ⭐ 本项目以支持开发**

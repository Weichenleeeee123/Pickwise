# 浏览器历史实施计划

Goal: 历史列表本地持久化，服务端任务按浏览器凭据隔离。

1. 新增 test/browser-history.test.js 和 test/browser-isolation.test.js，先验证缺失行为失败。
2. 新增 src/ui/browser-history.js：生成和复用 256 位随机凭据；持久化紧凑摘要；去重排序；处理损坏和不可用存储；跨标签刷新读取。
3. 修改 src/ui/api.js：请求和导出携带浏览器凭据，成功响应更新历史，list 仅读本地。修改 src/ui/workspace.js 显示本地保存边界；main.js 保留已有逻辑，只在必要时处理失效历史。
4. 修改 server/app.js：创建任务记录 ownerHash；列表、读写、导出和证据缓存按 ownerHash 过滤；无所属旧记录不公开。调整现有 API 测试提供浏览器凭据。
5. 回归和浏览器验收；仅把本任务文件叠加到上一线上发布目录，www 跳转主域名，保留数据、旧版本和配置备份；部署后复验。

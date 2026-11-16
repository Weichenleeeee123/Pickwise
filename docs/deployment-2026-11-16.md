# Pickwise 部署记录

部署日期：2026-11-16（Asia/Taipei）。服务器：43.110.32.113。

## 上线状态

- 主站：https://pickwise.icu/
- www：https://www.pickwise.icu/
- 两个域名 A 记录均为 43.110.32.113；HTTP 自动跳转到 HTTPS。
- 按用户确认公开访问，不配置网站密码；后续已在同日上线匿名浏览器会话隔离，详见文末更新。真实分析会消耗已配置的数据源和模型额度。
- 服务端模型、Apify、DataForSEO 配置已从本机 .env 经 SSH 加密传输至服务器，不进入发布包或浏览器。
- 未迁移本机历史会话。线上数据从空目录开始，不触发旧会话的自动采样。

## 目录和服务

- 当前版本：/opt/pickwise/current（符号链接）。
- 发布目录：/opt/pickwise/releases/20261116T011619Z。
- 服务端环境：/etc/pickwise/pickwise.env，权限 600，仅 root 可读。
- 线上持久数据：/var/lib/pickwise/sessions，由 pickwise 系统账号读写。
- 应用服务：/etc/systemd/system/pickwise.service，开机自启、异常重启、内存限制 512 MB。
- Node.js：v22.22.0；应用仅监听 127.0.0.1:4173。
- 站点代理配置：/etc/pickwise/Caddyfile，由原有共享 Caddy 配置 import。
- 原有 Caddy：/root/coopagents-acceptance/20261031-bbb0b60/github-app/caddy。
- 原有共享配置：/root/coopagents-acceptance/20261031-bbb0b60/github-app/Caddyfile。
- Caddy 原站 43-110-32-113.sslip.io 保持正常；修改前配置已保留备份。
- 代理守护：pickwise-caddy.service 已启用。现有 Caddy 进程运行时只监视；其退出或服务器重启后，使用原配置、原证书存储接管启动，避免抢占端口。
- TLS 证书由 Caddy 自动申请和续期。本次验证有效期至 2027-02-14 UTC。

## 运维

在服务器执行：

~~~sh
systemctl status pickwise --no-pager
systemctl restart pickwise
journalctl -u pickwise -n 100 --no-pager
systemctl status pickwise-caddy --no-pager
curl -fsS https://pickwise.icu/api/config
~~~

使用本机已有 SSH 私钥连接服务器；私钥没有上传至服务器。

修改环境配置后重启 pickwise。升级时新建 releases 下的版本目录，仅更改 current 链接并重启服务；持久数据和环境配置不随发布目录替换。需要回退时把 current 指回已保留的旧版本，再重启；不要删除任何版本、数据或备份。

共享 Caddy 当前关闭管理 API，配置修改需先 validate，再向运行中的对应 Caddy 主进程发送 SIGUSR1 热加载。不要硬编码旧 PID，也不要停止其他站点服务。

## 验证证据与范围

- 本机 npm test：144/144 通过。
- 两个公网 HTTPS 首页返回 200，TLS 校验通过；HTTP 返回 308。
- 已实际在浏览器打开首页与完整预制演示；控制台 0 错误/0 警告，无缺失图片或失败资源。
- 线上应用重启后正常恢复，开机自启标志 enabled。
- 模型最小真实请求返回 OK；Apify 账号接口返回 200；DataForSEO 账号接口返回 200、业务码 20000。
- /api/config 确认三类服务已配置；不等于所有商品分析必然成功。
- /.env、/server.js、/server/llm.js、/data/sessions、/.git/config 均返回 404。
- 原有服务器站点 HTTPS 检查返回 200。
- 未执行完整真实商品采集和分析，未为验收创建线上业务会话。
- 截图：output/playwright/deploy-20261116-home.png、output/playwright/deploy-20261116-demo.png。
- 本机部署包、服务定义、安装脚本保留在 tmp/deploy-20261116T011619Z；未执行文件删除操作。

本环境未提供 Mem0 工具，因此本次未写入 Mem0；此文件用于后续维护和续接。


## 同日更新：浏览器本地历史与会话隔离

- 当前版本：/opt/pickwise/releases/20261116T013905Z；旧版本 20261116T011619Z 保留。
- 历史摘要、任务 ID 和随机浏览器凭据保存在 localStorage 的 pickwise.browser-history.v1；仅存紧凑索引，不把完整原始证据塞入浏览器存储。
- 前端历史列表不请求服务器全量会话；成功创建、打开和更新任务时写入当前浏览器历史。
- 服务端只保存凭据 SHA-256，读取、修改、导出及提供商内存/持久化证据缓存按所属浏览器隔离。已存在但无所属凭据的旧任务保留，不自动认领或公开。
- 清除网站存储会更换身份；旧请求响应不会重新写回历史。其他标签页同步清除，演示退出也不会恢复已清除的真实工作区。
- 浏览器存储被禁用或容量耗尽时退回当前页面内存，并在历史面板明确提示不持久。
- www 通过 301 跳转主域名，保留路径和查询，统一浏览器 origin。
- 已按当前工作区运行 165 项测试全部通过，其中含真实数据源 adapter 的缓存隔离、跨浏览器读写导出隔离、本地存储损坏/容量/清除、并发旧响应和演示切换回归。
- 本地两个独立浏览器验收：A 创建无外部费用的测试任务后刷新仍保留；B 历史为空且无法访问 A 的任务。线上空白浏览器历史为空、持久化可用、无全局列表请求、控制台 0 错误和 0 警告。
- 发布仅覆盖本任务 9 个文件，main.js/workspace.js 基于上一线上版本局部叠加，未将其他未提交界面改动带入发布。
- 修改前 Caddy 站点配置已保留备份，其他站点仍可用。未删除历史数据、文件、发布目录或备份。
- 上线截图：output/playwright/browser-history-live-20261116.png。

## 同日更新：公开参赛材料

- 用户授权把提交材料放到现有线上网站并提供表单链接；已发布 https://pickwise.icu/materials/。
- 静态根目录：/opt/pickwise/public-materials/current，指向 /opt/pickwise/public-materials/revisions/20261116T033430Z。
- Caddy 的 pickwise.icu 站点新增 /materials 到 /materials/ 的跳转，以及 handle_path /materials/* 的静态文件服务；其他路径由 handle 中的原有反向代理处理。
- 原配置备份：/etc/pickwise/Caddyfile.before-materials-20261116T033430Z。共享主配置保持原 import，向动态查得的 Caddy 主进程发送 SIGUSR1 完成热加载。
- 应用版本仍为 /opt/pickwise/releases/20261116T013905Z，未部署工作区其他尚未提交的应用改动。
- 商业模式表单字段：https://pickwise.icu/materials/business-model-and-role.pdf（包含手册必交岗位说明）。
- 单位经济账单：https://pickwise.icu/materials/unit-economics.pdf。
- BP/PPT：https://pickwise.icu/materials/pitch.pptx；预览：https://pickwise.icu/materials/pitch-preview.pdf。
- 成果说明：https://pickwise.icu/materials/development-disclosure.pdf；可粘贴文本：https://pickwise.icu/materials/development-summary.txt。
- Token 截图、ROI假设明细与全部材料 ZIP 均从资料页访问。发布仅含准备好的公开提交文件，不开放整个 output 或 data 目录。
- 发布记录、文件 SHA256、公开请求记录与页面截图保存在 output/submission/.work/public-materials/。12个公开文件全部返回200且哈希与本机一致；主页、配置、www跳转与共享旧站点可用。此后用户要求加快、不再继续亲自测试，未再扩展验收。

# 工作区整理记录

日期：2026-11-16（Asia/Taipei）。

- 已完成的项目定位、路演叙事与 PRD/README 对齐文档纳入版本管理。
- 26 个未被运行代码、测试和现行文档引用的旧版行走素材，以及一个旧实验生成脚本，保留在 output/archive/workspace-cleanup-20261116T014952Z；manifest.json 保存原始路径、大小及 SHA-256。
- output/ 是本地生成的路演材料、图片、预览与验收证据，保留原有引用路径，加入 Git 忽略。
- tmp/ 包含临时工具、浏览器缓存、验证副本等，完整归档到 D:/Projects/Pickwise-archives/20261116T015135Z/tmp。归档旁的 tmp-manifest.json 保存全部原始相对路径、大小和 SHA-256；移动后逐文件核验。
- tmp/ 加入 Git 忽略；把临时验证副本移出项目，避免 node --test 重复发现其中的测试。
- .env、data/、.playwright-cli/ 等原有本地配置和运行数据保持原位置；线上服务未作改动。
- 没有删除文件；归档均可按清单恢复。Git 忽略不等于数据备份，归档仍保存在本机。

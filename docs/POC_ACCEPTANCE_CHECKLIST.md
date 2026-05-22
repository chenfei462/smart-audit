# PoC 验收清单

## 部署

- 目标私有环境中服务可以正常启动
- `environmentMode=government_poc`
- HTTPS 后 `secureCookies=true` 已启用
- 反向代理透传 `X-Forwarded-Proto=https`
- 初始化后 `allowPublicRegistration=false`
- PoC 环境使用 `publicDemoMode=false`
- 未明确批准前，`aiEnabled=false`
- `AUDITLENS_SESSION_SECRET` 由环境变量注入，JSON 配置不保存 secret
- 管理后台不保存或回显 AI / 连接器 secret，只显示 secret 是否已配置

## 访问控制

- `admin` 可以登录并管理用户
- `auditor` 可以创建任务和导出报告
- `viewer` 只能查看结果，不能创建任务或导出敏感结果

## 数据验证

- 脱敏财政监督样例数据可完整导入并处理
- 如已批准，可在私有环境导入受控真实数据小样本
- 数据库审计仅能通过白名单模板和批准表名执行

## 审计流程

- 可以成功创建财政监督样板任务
- 可以成功创建文件审计任务
- 可以识别重点财政风险
- 可以保存整改状态和备注

## 输出结果

- PDF 标准报告导出成功
- 密封导出包生成成功
- 管理后台可查看审计留痕

## 运维

- `/api/health` 返回 `ok`
- `data/platform.db` 可备份和恢复
- 服务重启后使用同一 `sessionSecret` 仍可正常运行
- 启动日志记录配置加载指纹，且不包含 secret 原文

## AI 策略

- AI 关闭时系统仍能完整运行财政监督主流程
- AI 启用时，界面明确标注其为辅助解释层

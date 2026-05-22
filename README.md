# AuditLens 财政监督工作台

AuditLens 当前定位为面向政府财政监督场景的审计产品，按两阶段推进：

- 公网样板环境：用于汇报、演示和 PoC 机会获取
- 私有化 / 政务云 PoC 环境：用于单租户试点交付

当前核心能力：

- 租户、组织和角色账户体系
- `admin` / `auditor` / `viewer` 权限模型
- 以财政监督为主线的场景化审计任务流
- 受控数据源模板和白名单表接入
- 可按部署策略启停的 AI 辅助解读
- 财政监督标准 PDF 报告和密封导出包
- 审计留痕与整改闭环
- `预约汇报 / 申请 PoC` 线索收集入口

## 快速开始

### 1. 初始化本地运行文件

```powershell
./scripts/init-local.cmd
```

会创建：

- `data/`
- `config/runtime.local.json`
- `config/runtime.local.env`

### 2. 一键启动本地环境

```powershell
./scripts/start-local.cmd
```

`init-local.cmd` 会探测可用端口并写入 `config/runtime.local.json`：

- Web 端口依次尝试 `8081 -> 18080 -> 28080`
- OCR / ASR bridge 端口依次尝试 `8090 -> 18090 -> 28090`

启动脚本会输出实际 URL；请以输出和 `runtime.local.json` 为准。

### 3. 健康检查

```powershell
./scripts/check-health.cmd
```

### 4. 单独启动 Web 服务

```powershell
./scripts/start-web.cmd
```

默认地址以 `config/runtime.local.json` 的 `host` / `port` 为准。

### 5. 单独启动本地 OCR / ASR 桥接服务

```powershell
./scripts/start-multimodal.cmd
```

默认地址以 `config/runtime.local.json` 的 `ocrApiUrl` / `speechApiUrl` 为准。

### 6. 构建发布版本

```powershell
./scripts/build-release.cmd
```

## 运行配置

示例配置文件：

- `config/runtime.example.json`

本地配置文件：

- `config/runtime.local.json`

主要字段：

- `environmentMode`
- `host`
- `port`
- `cargoTargetDir`
- `platformDataDir`
- `useReleaseProfile`
- `healthPath`
- `secureCookies`
- `allowPublicRegistration`
- `aiEnabled`
- `publicDemoMode`
- `multimodalProvider`
- `ocrEnabled`
- `speechEnabled`
- `ocrApiUrl`
- `speechApiUrl`
- `ocrModel`
- `speechModel`

`runtime.local.json` 只承载环境模式、端口、路径和布尔策略。运行时 secret 只从环境变量注入：

- `AUDITLENS_SESSION_SECRET`
- `AUDITLENS_AI_API_KEY`
- `AUDITLENS_OCR_API_KEY`
- `AUDITLENS_SPEECH_API_KEY`
- `AUDITLENS_CONNECTOR_SECRET_<PROFILE_ID_UPPERCASE_WITH_UNDERSCORES>`

`AUDITLENS_SESSION_SECRET` 会由 `scripts/init-local.ps1` 自动生成并写入 `config/runtime.local.env`，不要提交这两个本地运行文件。

## PoC / Public profile

一键切换基线：

```powershell
./scripts/switch-profile.cmd poc
./scripts/switch-profile.cmd public
```

`poc` 基线：`secureCookies=true`、`allowPublicRegistration=false`、`aiEnabled=false`、`publicDemoMode=false`。

`public` 基线：`environmentMode=public_demo`，默认关闭真实数据入口，仅保留样板演示路径。

`government_poc` 模式要求 HTTPS 反向代理入口；非本地请求必须带 `X-Forwarded-Proto=https`。

Windows 如果默认端口被系统保留，可先检查：

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

推荐默认值：

- 公网样板环境：`secureCookies=false`、`allowPublicRegistration=false`、`aiEnabled=true`、`publicDemoMode=true`
- 政府 PoC 环境：`secureCookies=true`、`allowPublicRegistration=false`、`aiEnabled=false`、`publicDemoMode=false`
- 本地多模态快接通：`multimodalProvider=local`、`ocrEnabled=true`、`speechEnabled=true`
- 本地 OCR 端点：`ocrApiUrl=http://127.0.0.1:8090/ocr`
- 本地语音转写端点：`speechApiUrl=http://127.0.0.1:8090/speech`
- 本地状态目录建议：`platformDataDir=C:\Users\CYL\Documents\New project\smart-audit-data`

## CLI

执行文件审计：

```powershell
cargo run -- audit -i data.csv -f csv
```

校验规则配置：

```powershell
cargo run -- validate-config -c config/default_rules.toml
```

## 文档

- `docs/DEPLOYMENT.md`
- `docs/OPERATIONS.md`
- `docs/API.md`
- `docs/SALES_PLAYBOOK.md`
- `docs/GOVERNMENT_POC_PACKAGE.md`
- `docs/POC_ACCEPTANCE_CHECKLIST.md`

## 测试

```powershell
cargo test
```

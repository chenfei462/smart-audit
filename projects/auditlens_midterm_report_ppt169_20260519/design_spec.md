# AuditLens 中期汇报 - Design Spec

> Human-readable design narrative. Machine-readable execution contract is `spec_lock.md`.

## I. Project Information

| Item | Value |
| ---- | ----- |
| **Project Name** | AuditLens 中期汇报 |
| **Canvas Format** | PPT 16:9 (1280x720) |
| **Page Count** | 8 |
| **Design Style** | General Consulting + 政务科技中期答辩 |
| **Target Audience** | 中期答辩老师 / 项目评审组 |
| **Use Case** | 5 分钟项目中期汇报，重点介绍已完成工作、演示流程和后期进度安排 |
| **Created Date** | 2026-05-19 |

---

## II. Canvas Specification

| Property | Value |
| -------- | ----- |
| **Format** | PPT 16:9 |
| **Dimensions** | 1280x720 |
| **viewBox** | `0 0 1280 720` |
| **Margins** | left/right 56px, top 44px, bottom 38px |
| **Content Area** | 1168x618 |

---

## III. Visual Theme

### Theme Style

- **Style**: General Consulting + government briefing
- **Theme**: Light theme
- **Tone**: 专业、稳健、清晰、可演示

### Color Scheme

| Role | HEX | Purpose |
| ---- | --- | ------- |
| **Background** | `#F8FAFC` | Page background |
| **Panel** | `#FFFFFF` | Primary content panels |
| **Muted panel** | `#EAF2F0` | Secondary bands and status strips |
| **Primary** | `#0B3A53` | Titles, headers, structural lines |
| **Accent** | `#1F7A6D` | Completed work, capability highlights |
| **Secondary accent** | `#F59E0B` | Progress and roadmap highlights |
| **Warning** | `#C2410C` | Risks and constraints |
| **Body text** | `#1E293B` | Main copy |
| **Secondary text** | `#64748B` | Captions and annotations |
| **Tertiary text** | `#94A3B8` | Footer and light labels |
| **Border/divider** | `#CBD5E1` | Borders, dividers, placeholder outlines |
| **Success** | `#15803D` | Passed verification |

### Gradient Scheme

Use subtle linear gradients only for header bars and cover accents:

```xml
<linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0%" stop-color="#0B3A53"/>
  <stop offset="100%" stop-color="#1F7A6D"/>
</linearGradient>
```

---

## IV. Typography System

### Font Plan

**Typography direction**: Windows-safe CJK sans, high clarity for projection.

| Role | Chinese | English | Fallback tail |
| ---- | ------- | ------- | ------------- |
| **Title** | SimHei, Microsoft YaHei | Arial | sans-serif |
| **Body** | Microsoft YaHei | Arial | sans-serif |
| **Emphasis** | SimHei, Microsoft YaHei | Arial | sans-serif |
| **Code** | - | Consolas, Courier New | monospace |

**Per-role font stacks**

- Title: `SimHei, "Microsoft YaHei", Arial, sans-serif`
- Body: `"Microsoft YaHei", Arial, sans-serif`
- Emphasis: `SimHei, "Microsoft YaHei", Arial, sans-serif`
- Code: `Consolas, "Courier New", monospace`

### Font Size Hierarchy

**Baseline**: Body font size = 18px.

| Purpose | Size |
| ------- | ---- |
| Cover title | 58px |
| Page title | 32px |
| Subtitle | 22px |
| Body content | 18px |
| Annotation / caption | 14px |
| Page number / footnote | 11px |
| KPI / hero number | 42px |
| Small label | 12px |

---

## V. Layout Principles

### Page Structure

- **Header area**: 44-104px, title and one-sentence takeaway.
- **Content area**: 120-650px, consulting-style cards, flows, architecture layers, placeholder images.
- **Footer area**: 670-704px, source note and page number.

### Layout Pattern Library

| Pattern | Suitable Pages |
| ------- | -------------- |
| **Single column centered** | Cover and closing roadmap summary |
| **Agenda list** | 5-minute presentation path |
| **Icon grid** | Completed capability overview |
| **Layered architecture** | Technical architecture and deployment split |
| **Process flow** | Demo script and task workflow |
| **KPI cards** | Verification and test results |
| **Roadmap vertical** | Post-midterm schedule |
| **Image placeholder + native overlay** | Demo screenshots and future screenshots |

### Spacing Specification

| Element | Current Project |
| ------- | --------------- |
| Safe margin from canvas edge | 56px |
| Content block gap | 24-32px |
| Icon-text gap | 10-14px |
| Card gap | 22px |
| Card padding | 20-26px |
| Card border radius | 8px |

---

## VI. Icon Usage Specification

### Source

- **Built-in icon library**: `tabler-outline`
- **Stroke width**: 2
- **Usage method**: SVG placeholder `<use data-icon="tabler-outline/icon-name" .../>`

### Recommended Icon List

| Purpose | Icon Path | Page |
| ------- | --------- | ---- |
| Project briefing | `tabler-outline/presentation` | P01 |
| Agenda | `tabler-outline/route` | P02 |
| Access control | `tabler-outline/users` | P03 |
| Security/export | `tabler-outline/shield-check` | P03/P07 |
| Data source | `tabler-outline/database-import` | P03/P04 |
| Report output | `tabler-outline/file-report` | P03/P05 |
| Rectification | `tabler-outline/checklist` | P03/P05 |
| Architecture | `tabler-outline/server-cog` | P04 |
| Demo screenshot placeholder | `tabler-outline/photo` | P05 |
| Verification | `tabler-outline/circle-check` | P06 |
| Risk | `tabler-outline/shield-exclamation` | P07 |
| Schedule | `tabler-outline/calendar-stats` | P08 |
| Release | `tabler-outline/rocket` | P08 |

---

## VII. Visualization Reference List

Catalog read: 71 templates

| Page | Template | Path | Summary-quote (verbatim from `charts_index.json`) | Usage |
| ---- | -------- | ---- | ------------------------------------------------- | ----- |
| P02 | agenda_list | `templates/charts/agenda_list.svg` | "Pick for table of contents, meeting agendas, or presentation roadmap 鈥?numbered items + brief description + duration / owner per row. Skip for substantive content lists (use vertical_list) or single-page section dividers (use a cover layout)." | 5-minute reporting path |
| P03 | icon_grid | `templates/charts/icon_grid.svg` | "Pick for 4-9 parallel features/capabilities/services as icon cards 鈥?feature grid, service lineup, benefits matrix, brand values, product highlights. Skip for sequential ordering (use numbered_steps) or hierarchical layers (use pyramid_chart)." | Completed work capability grid |
| P04 | layered_architecture | `templates/charts/layered_architecture.svg` | "Pick for 3-4 horizontal architecture layers (presentation/service/data), 2-4 module cards per layer, each card = title + 1-line description (description required, even if source brief). Skip if no per-module descriptions (use icon_grid) or no horizontal layering (use module_composition)." | System architecture overview |
| P05 | process_flow | `templates/charts/process_flow.svg` | "Pick for 3-8 sequential steps connected by simple arrows 鈥?approval workflows, customer onboarding, request handling, lifecycle stages. Skip if cyclical (use circular_stages) or stages produce named outputs (use pipeline_with_stages)." | Live demo workflow |
| P06 | kpi_cards | `templates/charts/kpi_cards.svg` | "Pick for 4-8 standalone numeric metrics shown as overview cards (2x2 or 1x4) 鈥?exec summary opener, dashboard headline, quarterly recap, results-at-a-glance. Skip if metrics have target baselines (use bullet_chart) or single hero number (use gauge_chart)." | Verification results |
| P08 | roadmap_vertical | `templates/charts/roadmap_vertical.svg` | "Pick for 4-8 milestones on a vertical timeline with status indicators. Skip for horizontal time emphasis (use timeline) or tasks with durations (use gantt_chart)." | Post-midterm schedule |

**Runners-up considered**

- `vertical_list` | rejected for P02: agenda needs explicit time allocation, not only substantive key points.
- `module_composition` | rejected for P04: architecture has clear presentation/service/data layers rather than one parent container.
- `timeline` | rejected for P08: schedule is better shown vertically with status and phase emphasis.

---

## VIII. Image Resource List

All image-bearing places use placeholders. No image generation and no web sourcing.

| Filename | Dimensions | Ratio | Purpose | Type | Layout pattern | Acquire Via | Status | Reference | text_policy | page_role |
| -------- | ---------- | ----- | ------- | ---- | -------------- | ----------- | ------ | --------- | ----------- | --------- |
| cover_visual_placeholder | 520x360 | 1.44 | Optional project or product visual on cover | Placeholder | #19 Image floating in whitespace with thin frame and caption + #70 Image with thin colored matte frame | placeholder | Placeholder | Replace with product screenshot or project logo if needed | | local |
| demo_screenshot_placeholder | 650x360 | 1.81 | Live demo screenshot area | Placeholder | #45 Background image + numbered hotspots with sidebar legend + #65 Image with NO text 鈥?labels added as native SVG | placeholder | Placeholder | Replace with AuditLens dashboard screenshot | | local |
| architecture_visual_placeholder | 420x220 | 1.91 | Optional architecture or deployment screenshot | Placeholder | #43 Background image + native data chart on top + #65 Image with NO text 鈥?labels added as native SVG | placeholder | Placeholder | Replace with architecture screenshot if available | | local |

---

## IX. Content Outline

### Part 1: Opening

#### Slide 01 - 封面

- **Layout**: Asymmetric title block + right-side visual placeholder
- **Title**: AuditLens 财政监督工作台中期汇报
- **Subtitle**: 已完成工作、演示流程与后期进度安排
- **Content**: 项目名称、汇报日期、5分钟汇报定位
- **Visualization**: none

#### Slide 02 - 5分钟汇报路径

- **Layout**: Agenda list with time allocation
- **Title**: 本次汇报聚焦三个问题：做到了什么、如何演示、接下来怎么推进
- **Visualization**: agenda_list
- **Content**:
  - 已完成工作：产品主流程和工程基线
  - 演示路径：财政监督任务从创建到导出闭环
  - 后期安排：PoC 加固、产品化和验收准备

### Part 2: Completed Work

#### Slide 03 - 已完成能力

- **Layout**: 2x3 icon capability grid
- **Title**: 项目已完成可演示的财政监督闭环，而不是停留在单点算法
- **Visualization**: icon_grid
- **Content**:
  - 账号、租户和角色权限
  - 财政监督任务流与多类型数据导入
  - 规则识别与 AI 辅助解释开关
  - PDF 标准报告与密封导出
  - 整改闭环和审计留痕
  - Public / PoC 配置基线切换

#### Slide 04 - 系统架构

- **Layout**: Layered architecture + small placeholder
- **Title**: 架构围绕“前端工作台、服务层、规则与数据层、运维配置”展开
- **Visualization**: layered_architecture
- **Content**:
  - 前端：任务、案件、整改、管理后台
  - 服务：认证权限、任务 API、报告导出、密封校验
  - 数据：SQLite 状态库、白名单数据源、导入模板
  - 运维：runtime 配置、健康检查、备份恢复、审计归档脚本

### Part 3: Demonstration

#### Slide 05 - 演示流程

- **Layout**: Left process flow + right screenshot placeholder
- **Title**: 演示主线覆盖从数据进入到问题整改和报告导出的完整链路
- **Visualization**: process_flow
- **Content**:
  - 登录并选择角色
  - 创建财政监督样板任务
  - 导入预算、采购、支付、凭证等数据
  - 查看风险识别和关联证据
  - 生成 PDF / 密封包
  - 更新整改状态并查看审计留痕

#### Slide 06 - 验证结果

- **Layout**: KPI cards + concise evidence notes
- **Title**: 回归验证显示核心流程已经具备中期答辩演示稳定性
- **Visualization**: kpi_cards
- **Content**:
  - Rust 测试：95+ 单元与集成测试通过
  - Node 测试：120/120 通过
  - Fullstack smoke：44/44 通过
  - Follow-up smoke：7/7 通过
  - 备份恢复、归档、profile 切换已演练

### Part 4: Risks and Roadmap

#### Slide 07 - 当前边界与控制

- **Layout**: Two-column risk/control table
- **Title**: 剩余工作重点不是继续堆功能，而是把 PoC 交付边界做实
- **Visualization**: custom consulting table
- **Content**:
  - 安全合规：密钥管理、审计日志、登录策略
  - 数据可信：来源追溯、模板版本、解析摘要
  - 规则解释：规则说明、误报标记、回归样本
  - 产品体验：Web 入口、导出按钮、证据附件操作

#### Slide 08 - 后期进度安排

- **Layout**: Vertical roadmap
- **Title**: 后期以“真实 PoC 可交付”为主线，分三阶段推进
- **Visualization**: roadmap_vertical
- **Content**:
  - 近期：PoC 安全与数据可信加固
  - 中期：报告模板、整改台账、前端流程体验
  - 长期：模块拆分、CI/E2E、可观测性和多环境基线
  - 答辩后输出：可运行环境、演示脚本、验收清单和后续迭代计划

---

## X. Speaker Notes Requirements

One complete `notes/total.md` master file, then split into one note file per page.

- **Total duration**: within 5 minutes
- **Notes style**: conclusion-first, formal but natural Chinese narration
- **Presentation purpose**: report progress, prove demonstrability, clarify next phase
- **Filename**: match SVG names, e.g. `01_cover.md`

---

## XI. Technical Constraints Reminder

### SVG Generation Must Follow:

1. viewBox: `0 0 1280 720`
2. Background uses `<rect>` elements.
3. Text wrapping uses `<tspan>`; `<foreignObject>` is forbidden.
4. Transparency uses `fill-opacity` / `stroke-opacity`; `rgba()` is forbidden.
5. Forbidden: `mask`, `<style>`, `class`, `foreignObject`, `textPath`, `animate*`, `script`.
6. Icons use `data-icon="tabler-outline/<name>"` and are embedded during post-processing.
7. Placeholder images are drawn as editable dashed rectangles and labels, not as external image references.

### PPT Compatibility Rules:

- No group opacity.
- Use system fonts only.
- Keep top-level semantic groups for editable PowerPoint grouping and animation.

const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "AuditLens Team";
pres.title = "AuditLens 财政监督工作台 · 结题答辩";

// IKB Swiss palette
const C = {
  ikb: "002FA7",
  ink: "0A0A0A",
  paper: "FAFAF8",
  grey1: "F0F0EE",
  grey2: "D4D4D2",
  grey3: "737373",
  white: "FFFFFF",
};

const FONT = { sans: "Arial", mono: "Consolas" };
const W = 10, H = 5.625;
const MX = 0.6, MY = 0.45; // margins

// ─── Slide 1: Cover ───
{
  const s = pres.addSlide();
  s.background = { color: C.ikb };
  // kicker
  s.addText("FISCAL AUDIT WORKBENCH", {
    x: MX, y: MY + 0.3, w: W - 2 * MX, h: 0.3,
    fontFace: FONT.mono, fontSize: 10, color: "FFFFFF", charSpacing: 4,
    transparency: 30, margin: 0,
  });
  // main title
  s.addText([
    { text: "AuditLens", options: { breakLine: true, fontSize: 44, fontFace: FONT.sans, bold: false } },
    { text: "财政监督", options: { fontSize: 44, fontFace: FONT.sans, bold: false } },
    { text: "工作台", options: { fontSize: 44, fontFace: FONT.sans, italic: true } },
  ], {
    x: MX, y: 1.4, w: 7, h: 2.2, color: C.white, lineSpacingMultiple: 0.9, margin: 0,
  });
  // bottom hairline
  s.addShape(pres.shapes.LINE, {
    x: MX, y: H - 1.4, w: W - 2 * MX, h: 0,
    line: { color: C.white, width: 0.5, transparency: 70 },
  });
  // subtitle
  s.addText("面向政府财政监督场景的一体化审计平台 · Rust 构建 · 单二进制部署", {
    x: MX, y: H - 1.3, w: 7, h: 0.35,
    fontFace: FONT.sans, fontSize: 13, color: C.white, transparency: 20, margin: 0,
  });
  // bottom meta
  s.addText("项目结题答辩 · 2025", {
    x: MX, y: H - 0.65, w: 4, h: 0.3,
    fontFace: FONT.mono, fontSize: 9, color: C.white, transparency: 40, margin: 0,
  });
  s.addText("01 / 10", {
    x: W - MX - 2, y: H - 0.65, w: 2, h: 0.3,
    fontFace: FONT.mono, fontSize: 9, color: C.white, transparency: 40, align: "right", margin: 0,
  });
}

// ─── Slide 2: 背景与目标 (Duo Compare) ───
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  addHeader(s, "PROBLEM & GOAL", "背景与目标", "02 / 10");

  const colW = 4.0, colY = 2.0;
  // Left column - Pain Points
  s.addText("A", {
    x: MX, y: colY, w: 0.32, h: 0.32,
    fontFace: FONT.mono, fontSize: 10, color: C.ink, align: "center", valign: "middle",
    border: { type: "solid", color: C.ink, pt: 1 }, margin: 0,
  });
  s.addText("PAIN POINTS", {
    x: MX + 0.42, y: colY, w: 2, h: 0.32,
    fontFace: FONT.mono, fontSize: 9, color: C.grey3, charSpacing: 2, margin: 0,
  });
  s.addText("传统审计困境", {
    x: MX, y: colY + 0.55, w: colW, h: 0.5,
    fontFace: FONT.sans, fontSize: 26, color: C.ink, margin: 0,
  });
  const painPts = [
    "财政审计依赖人工经验，效率低下",
    "数据分散多系统，缺乏统一入口",
    "风险识别滞后，整改追踪困难",
    "证据易篡改，缺乏可信存证",
  ];
  s.addText(painPts.map((t, i) => ({
    text: t, options: { breakLine: i < painPts.length - 1, bullet: { code: "2022" }, fontSize: 12, color: C.grey3 },
  })), {
    x: MX, y: colY + 1.35, w: colW, h: 2, fontFace: FONT.sans, lineSpacingMultiple: 1.5, margin: 0,
  });

  // Vertical rule
  const ruleX = W / 2;
  s.addShape(pres.shapes.LINE, {
    x: ruleX, y: colY, w: 0, h: 3.0,
    line: { color: C.grey2, width: 0.75 },
  });

  // Right column - Goals
  const rx = ruleX + 0.5;
  s.addText("B", {
    x: rx, y: colY, w: 0.32, h: 0.32,
    fontFace: FONT.mono, fontSize: 10, color: C.ikb, align: "center", valign: "middle",
    border: { type: "solid", color: C.ikb, pt: 1 }, margin: 0,
  });
  s.addText("GOALS", {
    x: rx + 0.42, y: colY, w: 2, h: 0.32,
    fontFace: FONT.mono, fontSize: 9, color: C.grey3, charSpacing: 2, margin: 0,
  });
  s.addText("一体化审计工作台", {
    x: rx, y: colY + 0.55, w: colW, h: 0.5,
    fontFace: FONT.sans, fontSize: 26, color: C.ikb, margin: 0,
  });
  const goals = [
    "统一财政监督场景化工作流",
    "规则引擎自动识别财政风险",
    "AI 辅助解读 + 多模态票据识别",
    "密封导出实现证据不可篡改",
  ];
  s.addText(goals.map((t, i) => ({
    text: t, options: { breakLine: i < goals.length - 1, bullet: { code: "2022" }, fontSize: 12, color: C.grey3 },
  })), {
    x: rx, y: colY + 1.35, w: colW, h: 2, fontFace: FONT.sans, lineSpacingMultiple: 1.5, margin: 0,
  });

  addPageNum(s, "02 / 10");
}

// ─── Slide 3: 六大创新点 ───
{
  const s = pres.addSlide();
  s.background = { color: C.ink };
  addHeader(s, "SIX INNOVATIONS", "六大创新点", "03 / 10", true);

  const innovations = [
    { num: "01", title: "Rust 高性能引擎", desc: "单二进制部署，零运行时依赖" },
    { num: "02", title: "AI 安全定位", desc: "仅作解释层，不作结论引擎" },
    { num: "03", title: "密封导出包", desc: "AES-GCM 加密 + SHA-256 校验" },
    { num: "04", title: "三方协同工作流", desc: "财政局 · 纪委 · 信息中心" },
    { num: "05", title: "多模态票据识别", desc: "OCR 自动识别 + ASR 语音转写" },
    { num: "06", title: "双环境部署策略", desc: "公网样板 + 政务云 PoC" },
  ];

  const cols = 3, rows = 2;
  const cw = 2.7, ch = 1.5, gapX = 0.3, gapY = 0.3;
  const startX = MX + 0.1, startY = 2.1;

  innovations.forEach((item, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = startX + col * (cw + gapX);
    const y = startY + row * (ch + gapY);
    const isAccent = i === 5;
    const bg = isAccent ? C.ikb : "1A1A1A";
    const tc = isAccent ? C.white : C.white;

    s.addShape(pres.shapes.RECTANGLE, { x, y, w: cw, h: ch, fill: { color: bg } });
    s.addText(item.num, {
      x: x + 0.2, y: y + 0.15, w: 0.6, h: 0.25,
      fontFace: FONT.mono, fontSize: 9, color: isAccent ? C.white : C.grey3, margin: 0,
    });
    s.addText(item.title, {
      x: x + 0.2, y: y + 0.5, w: cw - 0.4, h: 0.35,
      fontFace: FONT.sans, fontSize: 14, bold: true, color: tc, margin: 0,
    });
    s.addText(item.desc, {
      x: x + 0.2, y: y + 0.9, w: cw - 0.4, h: 0.4,
      fontFace: FONT.sans, fontSize: 11, color: isAccent ? "CCCCCC" : C.grey3, margin: 0,
    });
  });

  addPageNum(s, "03 / 10", true);
}

// ─── Slide 4: 技术架构 ───
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  addHeader(s, "FOUR-LAYER ARCHITECTURE", "技术架构", "04 / 10");

  const layers = [
    { label: "LAYER 01", title: "前端展示层", desc: "纯 HTML/JS · 响应式工作台 · 数据可视化图表 · 零框架依赖", bg: C.grey1, tc: C.ink },
    { label: "LAYER 02", title: "Web 服务层", desc: "Actix-Web 4 · REST API · Cookie Session · RBAC 三级权限", bg: C.grey1, tc: C.ink },
    { label: "LAYER 03", title: "业务引擎层", desc: "规则引擎 · AI 辅助解读 · OCR/ASR · PDF 报告 · 密封导出", bg: C.ink, tc: C.white },
    { label: "LAYER 04", title: "数据持久层", desc: "SQLite / MySQL / PostgreSQL · 加密存储 · 审计日志", bg: C.grey1, tc: C.ink },
  ];

  const lh = 0.72, gap = 0.18, startY = 1.9;
  layers.forEach((l, i) => {
    const y = startY + i * (lh + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x: MX, y, w: W - 2 * MX, h: lh, fill: { color: l.bg },
    });
    s.addText(l.label, {
      x: MX + 0.3, y, w: 1.4, h: lh,
      fontFace: FONT.mono, fontSize: 9, color: l.bg === C.ink ? C.ikb : C.ikb,
      bold: true, valign: "middle", charSpacing: 2, margin: 0,
    });
    s.addText(l.title, {
      x: MX + 1.8, y, w: 2, h: lh,
      fontFace: FONT.sans, fontSize: 15, color: l.tc, valign: "middle", margin: 0,
    });
    s.addText(l.desc, {
      x: MX + 3.9, y, w: 5, h: lh,
      fontFace: FONT.sans, fontSize: 11, color: l.bg === C.ink ? "AAAAAA" : C.grey3,
      valign: "middle", margin: 0,
    });
  });

  // tech stack footer
  s.addText("Rust  ·  Actix-Web  ·  printpdf  ·  AES-GCM  ·  reqwest  ·  SQLite", {
    x: MX, y: H - 0.7, w: W - 2 * MX, h: 0.3,
    fontFace: FONT.mono, fontSize: 9, color: C.grey3, charSpacing: 1, margin: 0,
  });

  addPageNum(s, "04 / 10");
}

// ─── Slide 5: 四大审计场景 ───
{
  const s = pres.addSlide();
  s.background = { color: C.grey1 };
  // accent top bar
  s.addShape(pres.shapes.RECTANGLE, {
    x: MX, y: 0.45, w: 0.6, h: 0.03, fill: { color: C.ikb },
  });
  s.addText("四大审计场景", {
    x: MX, y: 0.6, w: 6, h: 0.65,
    fontFace: FONT.sans, fontSize: 36, color: C.ink, margin: 0,
  });

  const scenarios = [
    { num: "01", tag: "BUDGET", title: "预算执行", desc: "追踪预算执行率偏差，识别超支、挪用等异常模式" },
    { num: "02", tag: "PROCUREMENT", title: "采购审计", desc: "项目编号与预算金额联动，发现围标串标线索" },
    { num: "03", tag: "TREASURY", title: "国库支付", desc: "支付单号与收款单位匹配，检查重复支付与异常流向" },
    { num: "04", tag: "VOUCHER", title: "会计凭证", desc: "借贷金额与入账时间核验，确保凭证真实性", accent: true },
  ];

  const cw = 2.05, startX = MX, startY = 1.6;
  scenarios.forEach((sc, i) => {
    const x = startX + i * (cw + 0.2);
    const tc = sc.accent ? C.ikb : C.ink;
    s.addText(`— ${sc.num} / ${sc.tag}`, {
      x, y: startY, w: cw, h: 0.3,
      fontFace: FONT.mono, fontSize: 9, color: sc.accent ? C.ikb : C.grey3, margin: 0,
    });
    s.addText(sc.title, {
      x, y: startY + 0.5, w: cw, h: 0.4,
      fontFace: FONT.sans, fontSize: 18, color: tc, margin: 0,
    });
    s.addText(sc.desc, {
      x, y: startY + 1.1, w: cw, h: 0.9,
      fontFace: FONT.sans, fontSize: 11, color: C.grey3, lineSpacingMultiple: 1.4, margin: 0,
    });
  });

  addPageNum(s, "05 / 10");
}

// ─── Slide 6: 演示路径 ───
{
  const s = pres.addSlide();
  s.background = { color: C.ikb };
  s.addText("DEMO PATH · 2 MIN", {
    x: MX, y: MY + 0.2, w: 5, h: 0.3,
    fontFace: FONT.mono, fontSize: 10, color: C.white, transparency: 30, charSpacing: 3, margin: 0,
  });
  s.addText("现场演示路径", {
    x: MX, y: 1.1, w: 6, h: 0.7,
    fontFace: FONT.sans, fontSize: 36, color: C.white, margin: 0,
  });

  const steps = [
    "登录系统 → 工作台总览",
    "创建审计任务 → 导入数据",
    "运行规则引擎 → 查看异常发现",
    "AI 辅助解读 → 生成报告",
    "导出密封包 → 验证完整性",
  ];

  steps.forEach((step, i) => {
    const y = 2.1 + i * 0.52;
    s.addText(`STEP ${i + 1}`, {
      x: MX, y, w: 1.0, h: 0.35,
      fontFace: FONT.mono, fontSize: 10, color: C.white, transparency: 45, margin: 0,
    });
    s.addText(step, {
      x: MX + 1.2, y, w: 6, h: 0.35,
      fontFace: FONT.sans, fontSize: 16, color: C.white, transparency: 10, margin: 0,
    });
  });

  s.addShape(pres.shapes.LINE, {
    x: MX, y: H - 0.9, w: W - 2 * MX, h: 0,
    line: { color: C.white, width: 0.5, transparency: 70 },
  });
  s.addText("→ 切换至浏览器 · http://127.0.0.1:3000", {
    x: MX, y: H - 0.75, w: 6, h: 0.3,
    fontFace: FONT.mono, fontSize: 9, color: C.white, transparency: 40, margin: 0,
  });
  s.addText("06 / 10", {
    x: W - MX - 1.5, y: H - 0.75, w: 1.5, h: 0.3,
    fontFace: FONT.mono, fontSize: 9, color: C.white, transparency: 40, align: "right", margin: 0,
  });
}

// ─── Slide 7: 全流程闭环 (Timeline) ───
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  addHeader(s, "AUDIT LIFECYCLE", "全流程闭环", "07 / 10");

  const nodes = [
    { num: "01", name: "数据接入", desc: "Excel/CSV 批量导入" },
    { num: "02", name: "规则审计", desc: "引擎自动匹配风险" },
    { num: "03", name: "AI 解读", desc: "辅助解释异常原因" },
    { num: "04", name: "风险标记", desc: "分级标记审计发现" },
    { num: "05", name: "报告导出", desc: "PDF + 密封导出包", accent: true },
    { num: "06", name: "整改闭环", desc: "跟踪整改完成率" },
  ];

  const lineY = 3.2;
  // horizontal dashed line
  s.addShape(pres.shapes.LINE, {
    x: MX + 0.3, y: lineY, w: W - 2 * MX - 0.6, h: 0,
    line: { color: C.grey2, width: 1, dashType: "dash" },
  });

  const nodeW = (W - 2 * MX - 0.6) / 6;
  nodes.forEach((n, i) => {
    const cx = MX + 0.3 + nodeW * i + nodeW / 2;
    const dotColor = n.accent ? C.ikb : C.ink;
    const up = i % 2 === 0;

    // dot
    s.addShape(pres.shapes.OVAL, {
      x: cx - 0.05, y: lineY - 0.05, w: 0.1, h: 0.1,
      fill: { color: dotColor },
    });

    const labelY = up ? lineY - 1.35 : lineY + 0.25;
    s.addText(`STEP ${n.num}`, {
      x: cx - 0.7, y: labelY, w: 1.4, h: 0.25,
      fontFace: FONT.mono, fontSize: 8, color: n.accent ? C.ikb : C.grey3,
      align: "center", margin: 0,
    });
    s.addText(n.name, {
      x: cx - 0.7, y: labelY + 0.28, w: 1.4, h: 0.3,
      fontFace: FONT.sans, fontSize: 13, color: n.accent ? C.ikb : C.ink,
      align: "center", bold: true, margin: 0,
    });
    s.addText(n.desc, {
      x: cx - 0.7, y: labelY + 0.6, w: 1.4, h: 0.3,
      fontFace: FONT.sans, fontSize: 9, color: C.grey3, align: "center", margin: 0,
    });
  });

  addPageNum(s, "07 / 10");
}

// ─── Slide 8: 项目成果 (KPI) ───
{
  const s = pres.addSlide();
  s.background = { color: C.ink };
  addHeader(s, "PROJECT OUTCOMES", "项目成果", "08 / 10", true);

  s.addText("覆盖审计全生命周期的一体化财政监督平台", {
    x: W / 2, y: 0.7, w: W / 2 - MX, h: 0.6,
    fontFace: FONT.sans, fontSize: 12, color: C.grey3, align: "right", margin: 0,
  });
  // hairline
  s.addShape(pres.shapes.LINE, {
    x: MX, y: 1.6, w: W - 2 * MX, h: 0,
    line: { color: C.grey3, width: 0.5, transparency: 60 },
  });

  const kpis = [
    { num: "10+", label: "功能模块", barH: 2.2, accent: true },
    { num: "4", label: "审计场景", barH: 1.5, accent: false },
    { num: "3", label: "角色体系", barH: 1.1, accent: false },
    { num: "40+", label: "验收项", barH: 1.9, accent: true },
  ];

  const kw = 2.0, startX = MX + 0.3;
  kpis.forEach((k, i) => {
    const x = startX + i * (kw + 0.15);
    const baseY = H - 0.5;

    // bar
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.3, y: baseY - k.barH, w: kw - 0.6, h: k.barH,
      fill: { color: k.accent ? C.ikb : C.grey3, transparency: k.accent ? 0 : 50 },
    });
    // number
    s.addText(k.num, {
      x, y: 1.9, w: kw, h: 0.9,
      fontFace: FONT.sans, fontSize: 48, color: k.accent ? C.white : C.paper,
      align: "center", margin: 0,
    });
    // label
    s.addText(k.label, {
      x, y: 2.8, w: kw, h: 0.35,
      fontFace: FONT.mono, fontSize: 9, color: C.grey3, align: "center",
      charSpacing: 1, margin: 0,
    });
  });

  addPageNum(s, "08 / 10", true);
}

// ─── Slide 9: 项目价值 (Why Now) ───
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  addHeader(s, "THREE DIMENSIONS OF VALUE", "项目价值", "09 / 10");

  const values = [
    {
      cat: "技术价值", title: "高性能与安全并重",
      desc: "Rust 系统级性能保障，单二进制零依赖部署，密码学级别证据保全机制",
      num: "01",
    },
    {
      cat: "业务价值", title: "全生命周期覆盖",
      desc: "三方协同提升监督效率，规则引擎 + AI 双层风险识别体系",
      num: "02",
    },
    {
      cat: "社会价值", title: "数字化治理转型",
      desc: "助力政府数字化治理，提升财政资金透明度，强化公共资金监督问责",
      num: "03", accent: true,
    },
  ];

  const colW = 2.7, startY = 1.9;
  values.forEach((v, i) => {
    const x = MX + i * (colW + 0.35);
    const catColor = v.accent ? C.ikb : C.ink;

    s.addText(v.cat, {
      x, y: startY, w: colW, h: 0.3,
      fontFace: FONT.sans, fontSize: 11, bold: true, color: catColor, charSpacing: 1, margin: 0,
    });
    s.addText(v.title, {
      x, y: startY + 0.5, w: colW, h: 0.4,
      fontFace: FONT.sans, fontSize: 17, color: v.accent ? C.ikb : C.ink, margin: 0,
    });
    s.addText(v.desc, {
      x, y: startY + 1.1, w: colW, h: 1.0,
      fontFace: FONT.sans, fontSize: 11, color: C.grey3, lineSpacingMultiple: 1.5, margin: 0,
    });
    // big ghost number
    s.addText(v.num, {
      x, y: H - 1.5, w: colW, h: 0.9,
      fontFace: FONT.sans, fontSize: 54, color: v.accent ? C.ikb : C.ink,
      transparency: v.accent ? 80 : 88, margin: 0,
    });
  });

  addPageNum(s, "09 / 10");
}

// ─── Slide 10: Closing ───
{
  const s = pres.addSlide();
  // left half IKB
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: W / 2, h: H, fill: { color: C.ikb },
  });
  // right half paper
  s.addShape(pres.shapes.RECTANGLE, {
    x: W / 2, y: 0, w: W / 2, h: H, fill: { color: C.paper },
  });

  // Left side
  s.addText("AUDITLENS", {
    x: 0.5, y: 0.9, w: 4, h: 0.3,
    fontFace: FONT.mono, fontSize: 10, color: C.white, transparency: 30, charSpacing: 4, margin: 0,
  });
  s.addText([
    { text: "让财政监督", options: { breakLine: true } },
    { text: "更", options: {} },
    { text: "智能", options: { italic: true } },
    { text: "、更透明、", options: { breakLine: true } },
    { text: "更高效", options: {} },
  ], {
    x: 0.5, y: 1.8, w: 4.2, h: 2.2,
    fontFace: FONT.sans, fontSize: 32, color: C.white, lineSpacingMultiple: 0.95, margin: 0,
  });
  s.addText("感谢各位老师的指导与聆听，敬请指正。", {
    x: 0.5, y: 4.0, w: 4, h: 0.3,
    fontFace: FONT.sans, fontSize: 11, color: C.white, transparency: 20, margin: 0,
  });
  s.addShape(pres.shapes.LINE, {
    x: 0.5, y: H - 0.7, w: W / 2 - 1, h: 0,
    line: { color: C.white, width: 0.5, transparency: 70 },
  });
  s.addText("AuditLens Team", {
    x: 0.5, y: H - 0.55, w: 2, h: 0.25,
    fontFace: FONT.mono, fontSize: 9, color: C.white, transparency: 40, margin: 0,
  });
  s.addText("2025", {
    x: W / 2 - 1.5, y: H - 0.55, w: 1, h: 0.25,
    fontFace: FONT.mono, fontSize: 9, color: C.white, transparency: 40, align: "right", margin: 0,
  });

  // Right side
  s.addText("TAKEAWAYS", {
    x: W / 2 + 0.4, y: 0.5, w: 3, h: 0.3,
    fontFace: FONT.mono, fontSize: 10, color: C.grey3, charSpacing: 2, margin: 0,
  });
  s.addText("03 POINTS", {
    x: W - MX - 1.5, y: 0.5, w: 1.5, h: 0.3,
    fontFace: FONT.mono, fontSize: 9, color: C.grey3, align: "right", margin: 0,
  });

  const takeaways = [
    { num: "01", title: "Rust 构建，单文件交付", desc: "高性能后端无运行时依赖，一个二进制即完整系统。" },
    { num: "02", title: "AI 仅解释，规则出结论", desc: "AI 安全定位确保审计权威性，规则引擎才是正式结论。" },
    { num: "03", title: "密封存证，不可篡改", desc: "AES-GCM 加密 + SHA-256 校验，审计证据具备法律级别可信度。", accent: true },
  ];

  takeaways.forEach((t, i) => {
    const ty = 1.2 + i * 1.25;
    const rx = W / 2 + 0.4;
    // hairline
    s.addShape(pres.shapes.LINE, {
      x: rx, y: ty, w: W / 2 - 0.8, h: 0,
      line: { color: t.accent ? C.ikb : C.grey2, width: t.accent ? 1.5 : 0.75 },
    });
    s.addText(t.num, {
      x: rx, y: ty + 0.12, w: 0.6, h: 0.6,
      fontFace: FONT.sans, fontSize: 28, color: t.accent ? C.ikb : C.ink, margin: 0,
    });
    s.addText(t.title, {
      x: rx + 0.7, y: ty + 0.12, w: 3.5, h: 0.35,
      fontFace: FONT.sans, fontSize: 14, color: t.accent ? C.ikb : C.ink, margin: 0,
    });
    s.addText(t.desc, {
      x: rx + 0.7, y: ty + 0.52, w: 3.5, h: 0.45,
      fontFace: FONT.sans, fontSize: 10, color: C.grey3, lineSpacingMultiple: 1.4, margin: 0,
    });
  });

  s.addText("→ 完 · END OF PRESENTATION", {
    x: W / 2 + 0.4, y: H - 0.6, w: W / 2 - 0.8, h: 0.25,
    fontFace: FONT.mono, fontSize: 9, color: C.grey3, align: "right", margin: 0,
  });
}

// ─── Helpers ───
function addHeader(s, meta, title, pageNum, dark = false) {
  const tc = dark ? C.paper : C.ink;
  const mc = dark ? C.grey3 : C.grey3;
  s.addText(meta, {
    x: MX, y: MY, w: 5, h: 0.3,
    fontFace: FONT.mono, fontSize: 9, color: mc, charSpacing: 2, margin: 0,
  });
  s.addText(title, {
    x: MX, y: MY + 0.4, w: 6, h: 0.65,
    fontFace: FONT.sans, fontSize: 36, color: tc, margin: 0,
  });
}

function addPageNum(s, text, dark = false) {
  s.addText(text, {
    x: W - MX - 1.5, y: H - 0.45, w: 1.5, h: 0.25,
    fontFace: FONT.mono, fontSize: 8, color: dark ? C.grey3 : C.grey3,
    align: "right", margin: 0,
  });
}

const outPath = "D:/Desktop/smart-audit/docs/delivery/AuditLens_Swiss.pptx";
pres.writeFile({ fileName: outPath }).then(() => {
  console.log("PPTX saved to: " + outPath);
}).catch(err => {
  console.error("Error:", err);
});

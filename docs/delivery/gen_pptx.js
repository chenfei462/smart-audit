const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");

// Icon libraries
const { FaShieldAlt, FaRocket, FaCogs, FaBrain, FaFileAlt, FaUsers, FaLock, FaChartBar, FaDatabase, FaCheckCircle, FaEye, FaClipboardCheck } = require("react-icons/fa");
const { MdSecurity, MdSpeed } = require("react-icons/md");

function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

// Color palette - Midnight Executive with gold accent
const C = {
  navy:      "1A2A4A",
  navyDark:  "0F1B33",
  navyLight: "2D4A7A",
  gold:      "C49A3C",
  goldLight: "E8C97A",
  white:     "FFFFFF",
  offWhite:  "F0F2F5",
  textDark:  "1A1A2E",
  textMid:   "5A6577",
  textLight: "8A95A5",
  accent:    "2A6DB2",
  green:     "27724B",
  red:       "C0392B",
  teal:      "0D9488",
};

const mkShadow = () => ({ type: "outer", color: "000000", blur: 6, offset: 2, angle: 45, opacity: 0.12 });

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "AuditLens Team";
  pres.title = "AuditLens 财政监督工作台 - 结题答辩";

  // Pre-render icons
  const icons = {
    shield:   await iconToBase64Png(FaShieldAlt, "#C49A3C"),
    rocket:   await iconToBase64Png(FaRocket, "#FFFFFF"),
    cogs:     await iconToBase64Png(FaCogs, "#FFFFFF"),
    brain:    await iconToBase64Png(FaBrain, "#C49A3C"),
    file:     await iconToBase64Png(FaFileAlt, "#FFFFFF"),
    users:    await iconToBase64Png(FaUsers, "#C49A3C"),
    lock:     await iconToBase64Png(FaLock, "#FFFFFF"),
    chart:    await iconToBase64Png(FaChartBar, "#C49A3C"),
    db:       await iconToBase64Png(FaDatabase, "#FFFFFF"),
    check:    await iconToBase64Png(FaCheckCircle, "#27724B"),
    eye:      await iconToBase64Png(FaEye, "#C49A3C"),
    clipboard:await iconToBase64Png(FaClipboardCheck, "#FFFFFF"),
    shieldW:  await iconToBase64Png(FaShieldAlt, "#FFFFFF"),
    checkW:   await iconToBase64Png(FaCheckCircle, "#FFFFFF"),
    brainW:   await iconToBase64Png(FaBrain, "#FFFFFF"),
    usersW:   await iconToBase64Png(FaUsers, "#FFFFFF"),
    chartW:   await iconToBase64Png(FaChartBar, "#FFFFFF"),
    lockGold: await iconToBase64Png(FaLock, "#C49A3C"),
    rocketGold: await iconToBase64Png(FaRocket, "#C49A3C"),
    cogsGold: await iconToBase64Png(FaCogs, "#C49A3C"),
  };

  // ========== SLIDE 1: Title ==========
  {
    const s = pres.addSlide();
    s.background = { color: C.navyDark };

    s.addImage({ data: icons.shieldW, x: 4.25, y: 0.6, w: 0.7, h: 0.7 });

    s.addText("AuditLens", {
      x: 0.5, y: 1.4, w: 9, h: 0.9,
      fontSize: 44, fontFace: "Calibri", bold: true,
      color: C.white, align: "center", margin: 0,
      charSpacing: 6,
    });
    s.addText("财政监督工作台", {
      x: 0.5, y: 2.2, w: 9, h: 0.7,
      fontSize: 28, fontFace: "Calibri",
      color: C.goldLight, align: "center", margin: 0,
      charSpacing: 4,
    });

    s.addShape(pres.shapes.LINE, {
      x: 3.5, y: 3.1, w: 3, h: 0,
      line: { color: C.gold, width: 1.5 }
    });

    s.addText("项目结题答辩", {
      x: 0.5, y: 3.4, w: 9, h: 0.5,
      fontSize: 18, fontFace: "Calibri",
      color: C.textLight, align: "center", margin: 0,
    });

    s.addText("2025 年度", {
      x: 0.5, y: 4.8, w: 9, h: 0.4,
      fontSize: 12, fontFace: "Calibri",
      color: C.textLight, align: "center", margin: 0,
    });

    s.addNotes("开场：各位老师好，我们是 XX 组，今天汇报的项目是 AuditLens 财政监督工作台。");
  }

  // ========== SLIDE 2: 目录 ==========
  {
    const s = pres.addSlide();
    s.background = { color: C.white };

    s.addText("汇报提纲", {
      x: 0.8, y: 0.4, w: 8.4, h: 0.7,
      fontSize: 32, fontFace: "Calibri", bold: true,
      color: C.navy, margin: 0,
    });

    const items = [
      { num: "01", title: "项目背景与目标", icon: icons.eye },
      { num: "02", title: "特色与创新点", icon: icons.rocketGold },
      { num: "03", title: "核心功能与架构", icon: icons.cogsGold },
      { num: "04", title: "项目成果展示", icon: icons.chart },
      { num: "05", title: "项目价值与展望", icon: icons.brain },
    ];

    items.forEach((item, i) => {
      const y = 1.4 + i * 0.78;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y, w: 8.4, h: 0.62,
        fill: { color: i % 2 === 0 ? C.offWhite : C.white },
        rectRadius: 0.05,
      });
      s.addImage({ data: item.icon, x: 1.1, y: y + 0.11, w: 0.4, h: 0.4 });
      s.addText(item.num, {
        x: 1.7, y, w: 0.7, h: 0.62,
        fontSize: 20, fontFace: "Calibri", bold: true,
        color: C.gold, valign: "middle", margin: 0,
      });
      s.addText(item.title, {
        x: 2.4, y, w: 6, h: 0.62,
        fontSize: 18, fontFace: "Calibri",
        color: C.textDark, valign: "middle", margin: 0,
      });
    });

    s.addNotes("今天汇报五个部分：背景目标、特色创新、核心功能、成果展示、价值展望。");
  }

  // ========== SLIDE 3: 项目背景 ==========
  {
    const s = pres.addSlide();
    s.background = { color: C.white };

    s.addText("项目背景与目标", {
      x: 0.8, y: 0.4, w: 8.4, h: 0.7,
      fontSize: 32, fontFace: "Calibri", bold: true,
      color: C.navy, margin: 0,
    });

    // Left column - pain points
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 1.4, w: 4, h: 3.5,
      fill: { color: "F8F9FB" }, rectRadius: 0.1,
      shadow: mkShadow(),
    });
    s.addText("现实痛点", {
      x: 1.1, y: 1.5, w: 3.4, h: 0.45,
      fontSize: 18, fontFace: "Calibri", bold: true,
      color: C.red, margin: 0,
    });
    s.addText([
      { text: "财政审计依赖人工经验，效率低下", options: { bullet: true, breakLine: true, fontSize: 14, color: C.textDark } },
      { text: "数据分散在多系统，缺乏统一分析入口", options: { bullet: true, breakLine: true, fontSize: 14, color: C.textDark } },
      { text: "风险识别滞后，整改追踪困难", options: { bullet: true, breakLine: true, fontSize: 14, color: C.textDark } },
      { text: "审计证据易被篡改，缺乏可信存证", options: { bullet: true, fontSize: 14, color: C.textDark } },
    ], {
      x: 1.1, y: 2.1, w: 3.4, h: 2.5,
      fontFace: "Calibri", valign: "top", margin: 0,
      paraSpaceAfter: 10,
    });

    // Right column - goals
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 5.2, y: 1.4, w: 4, h: 3.5,
      fill: { color: "F0F7F3" }, rectRadius: 0.1,
      shadow: mkShadow(),
    });
    s.addText("项目目标", {
      x: 5.5, y: 1.5, w: 3.4, h: 0.45,
      fontSize: 18, fontFace: "Calibri", bold: true,
      color: C.green, margin: 0,
    });
    s.addText([
      { text: "构建一体化财政监督工作台", options: { bullet: true, breakLine: true, fontSize: 14, color: C.textDark } },
      { text: "自动化规则引擎识别财政风险", options: { bullet: true, breakLine: true, fontSize: 14, color: C.textDark } },
      { text: "AI 辅助解读 + 多模态票据识别", options: { bullet: true, breakLine: true, fontSize: 14, color: C.textDark } },
      { text: "实现审计全流程闭环管理", options: { bullet: true, fontSize: 14, color: C.textDark } },
    ], {
      x: 5.5, y: 2.1, w: 3.4, h: 2.5,
      fontFace: "Calibri", valign: "top", margin: 0,
      paraSpaceAfter: 10,
    });

    s.addNotes("传统财政审计存在效率低、数据分散、风险滞后、证据不可信四大痛点。我们的目标是构建一体化工作台解决这些问题。");
  }

  // ========== SLIDE 4: 特色与创新点 ==========
  {
    const s = pres.addSlide();
    s.background = { color: C.navyDark };

    s.addText("特色与创新点", {
      x: 0.8, y: 0.3, w: 8.4, h: 0.7,
      fontSize: 32, fontFace: "Calibri", bold: true,
      color: C.white, margin: 0,
    });

    const innovations = [
      { icon: icons.rocketGold, title: "Rust 高性能引擎", desc: "单二进制部署，零运行时依赖\n启动秒级，内存安全无 GC 停顿" },
      { icon: icons.brainW, title: "AI 安全定位", desc: "AI 仅作解释层，不作结论引擎\n规则结果才是正式审计结论" },
      { icon: icons.lockGold, title: "密封导出包", desc: "AES-GCM 加密 + SHA-256 校验\n审计证据不可篡改、可验真" },
      { icon: icons.usersW, title: "三方协同工作流", desc: "财政局 · 纪委 · 信息中心\n三级权限精细管控" },
      { icon: icons.cogsGold, title: "多模态识别", desc: "OCR 票据自动识别\nASR 语音转写辅助" },
      { icon: icons.chartW, title: "双环境策略", desc: "公网样板 + 政务云 PoC\n灵活适配不同部署场景" },
    ];

    innovations.forEach((item, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 0.8 + col * 3.0;
      const y = 1.2 + row * 2.1;

      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y, w: 2.7, h: 1.85,
        fill: { color: C.navyLight, transparency: 40 },
        rectRadius: 0.1,
      });
      s.addImage({ data: item.icon, x: x + 0.2, y: y + 0.18, w: 0.42, h: 0.42 });
      s.addText(item.title, {
        x: x + 0.75, y: y + 0.15, w: 1.8, h: 0.5,
        fontSize: 15, fontFace: "Calibri", bold: true,
        color: C.goldLight, valign: "middle", margin: 0,
      });
      s.addText(item.desc, {
        x: x + 0.2, y: y + 0.75, w: 2.3, h: 1.0,
        fontSize: 12, fontFace: "Calibri",
        color: "CADCFC", valign: "top", margin: 0,
        lineSpacingMultiple: 1.3,
      });
    });

    s.addNotes("六大创新点：Rust 高性能引擎实现单文件部署；AI 仅作解释层确保审计权威；密封包保证证据不可篡改；三方角色协同；多模态票据识别；双环境灵活部署。");
  }

  // ========== SLIDE 5: 核心功能架构 ==========
  {
    const s = pres.addSlide();
    s.background = { color: C.white };

    s.addText("核心功能与技术架构", {
      x: 0.8, y: 0.3, w: 8.4, h: 0.7,
      fontSize: 32, fontFace: "Calibri", bold: true,
      color: C.navy, margin: 0,
    });

    // Architecture layers - top to bottom
    const layers = [
      { label: "前端展示层", detail: "纯 HTML/JS  ·  响应式工作台  ·  数据可视化图表", color: "E8F0FE", textColor: C.accent },
      { label: "Web 服务层", detail: "Actix-Web 4  ·  REST API  ·  Cookie Session  ·  RBAC 三级权限", color: "DBEAFE", textColor: C.accent },
      { label: "业务引擎层", detail: "规则引擎  ·  AI 辅助解读  ·  OCR/ASR  ·  PDF 报告  ·  密封导出", color: "C7D9F5", textColor: C.navy },
      { label: "数据持久层", detail: "SQLite / MySQL / PostgreSQL  ·  加密存储  ·  审计日志", color: "B0CAE8", textColor: C.navy },
    ];

    layers.forEach((layer, i) => {
      const y = 1.2 + i * 1.0;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8, y, w: 8.4, h: 0.82,
        fill: { color: layer.color }, rectRadius: 0.08,
        shadow: mkShadow(),
      });
      s.addText(layer.label, {
        x: 1.1, y, w: 2.2, h: 0.82,
        fontSize: 16, fontFace: "Calibri", bold: true,
        color: layer.textColor, valign: "middle", margin: 0,
      });
      s.addText(layer.detail, {
        x: 3.3, y, w: 5.6, h: 0.82,
        fontSize: 13, fontFace: "Calibri",
        color: C.textDark, valign: "middle", margin: 0,
      });

      if (i < layers.length - 1) {
        s.addText("▼", {
          x: 4.6, y: y + 0.75, w: 0.8, h: 0.3,
          fontSize: 12, color: C.textLight, align: "center", margin: 0,
        });
      }
    });

    // Bottom tech stack summary
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 5.0, w: 8.4, h: 0.45,
      fill: { color: C.navyDark }, rectRadius: 0.05,
    });
    s.addText("Rust  ·  Actix-Web  ·  SQLite/MySQL/PostgreSQL  ·  printpdf  ·  AES-GCM  ·  reqwest", {
      x: 0.8, y: 5.0, w: 8.4, h: 0.45,
      fontSize: 11, fontFace: "Calibri",
      color: C.goldLight, align: "center", valign: "middle", margin: 0,
    });

    s.addNotes("四层架构：前端纯 HTML/JS 无框架依赖；Actix-Web 高性能服务层；业务层集成规则引擎、AI、OCR 等能力；底层支持三种数据库。");
  }

  // ========== SLIDE 6: 功能模块详解 ==========
  {
    const s = pres.addSlide();
    s.background = { color: C.white };

    s.addText("十大功能模块", {
      x: 0.8, y: 0.3, w: 8.4, h: 0.7,
      fontSize: 32, fontFace: "Calibri", bold: true,
      color: C.navy, margin: 0,
    });

    const modules = [
      { name: "租户与权限体系", desc: "admin/auditor/viewer 三级角色" },
      { name: "场景化审计任务", desc: "预算·采购·支付·凭证四大场景" },
      { name: "规则引擎", desc: "自动化财政风险识别与预警" },
      { name: "AI 辅助解读", desc: "解释层定位，不替代审计判断" },
      { name: "多模态识别", desc: "OCR 票据 + ASR 语音转写" },
      { name: "数据源管理", desc: "受控模板 + 白名单表接入" },
      { name: "PDF 标准报告", desc: "一键生成财政监督标准报告" },
      { name: "密封导出包", desc: "AES-GCM 加密密封证据包" },
      { name: "整改闭环", desc: "审计留痕 + 状态追踪管理" },
      { name: "PoC 线索管理", desc: "预约汇报与试点申请入口" },
    ];

    modules.forEach((m, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 0.8 + col * 4.5;
      const y = 1.15 + row * 0.82;

      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y, w: 4.1, h: 0.68,
        fill: { color: col === 0 ? "F8F9FB" : "F0F7F3" },
        rectRadius: 0.06,
      });

      s.addText((i + 1).toString().padStart(2, "0"), {
        x: x + 0.15, y, w: 0.45, h: 0.68,
        fontSize: 14, fontFace: "Calibri", bold: true,
        color: C.gold, valign: "middle", margin: 0,
      });
      s.addText(m.name, {
        x: x + 0.6, y: y + 0.05, w: 3.2, h: 0.32,
        fontSize: 14, fontFace: "Calibri", bold: true,
        color: C.textDark, valign: "middle", margin: 0,
      });
      s.addText(m.desc, {
        x: x + 0.6, y: y + 0.35, w: 3.2, h: 0.28,
        fontSize: 11, fontFace: "Calibri",
        color: C.textMid, valign: "top", margin: 0,
      });
    });

    s.addNotes("十大功能模块覆盖了从数据接入、风险识别、AI 解读到报告导出、整改追踪的完整审计闭环。");
  }

  // ========== SLIDE 7: 项目成果 ==========
  {
    const s = pres.addSlide();
    s.background = { color: C.white };

    s.addText("项目成果", {
      x: 0.8, y: 0.3, w: 8.4, h: 0.7,
      fontSize: 32, fontFace: "Calibri", bold: true,
      color: C.navy, margin: 0,
    });

    // Big stat callouts
    const stats = [
      { num: "10+", label: "功能模块", sub: "完整覆盖审计全流程" },
      { num: "4", label: "审计场景", sub: "预算·采购·支付·凭证" },
      { num: "3", label: "角色体系", sub: "管理员·审计员·查看员" },
      { num: "2", label: "部署策略", sub: "公网样板 + 政务云 PoC" },
    ];

    stats.forEach((st, i) => {
      const x = 0.8 + i * 2.3;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.2, w: 2.0, h: 1.7,
        fill: { color: i % 2 === 0 ? C.navyDark : C.navyLight },
        rectRadius: 0.1,
        shadow: mkShadow(),
      });
      s.addText(st.num, {
        x, y: 1.3, w: 2.0, h: 0.7,
        fontSize: 36, fontFace: "Calibri", bold: true,
        color: C.goldLight, align: "center", valign: "middle", margin: 0,
      });
      s.addText(st.label, {
        x, y: 1.95, w: 2.0, h: 0.35,
        fontSize: 14, fontFace: "Calibri", bold: true,
        color: C.white, align: "center", valign: "middle", margin: 0,
      });
      s.addText(st.sub, {
        x, y: 2.35, w: 2.0, h: 0.4,
        fontSize: 10, fontFace: "Calibri",
        color: "CADCFC", align: "center", valign: "top", margin: 0,
      });
    });

    // Deliverables
    s.addText("交付成果清单", {
      x: 0.8, y: 3.2, w: 8.4, h: 0.45,
      fontSize: 18, fontFace: "Calibri", bold: true,
      color: C.navy, margin: 0,
    });

    const deliverables = [
      { item: "可运行的完整系统（Rust 单二进制 + 前端静态文件）" },
      { item: "政府 PoC 验收清单（含 8 大类 40+ 验收项）" },
      { item: "完整技术文档（部署、运维、API、用户手册）" },
      { item: "自动化规则引擎配置体系" },
      { item: "密封导出包与校验工具" },
    ];

    s.addText(
      deliverables.map((d, i) => ({
        text: d.item,
        options: { bullet: true, breakLine: i < deliverables.length - 1, fontSize: 13, color: C.textDark }
      })),
      {
        x: 1.0, y: 3.7, w: 8.0, h: 1.7,
        fontFace: "Calibri", valign: "top", margin: 0,
        paraSpaceAfter: 6,
      }
    );

    s.addNotes("核心数据：10+功能模块、4大审计场景、3级角色体系、2种部署策略。交付物包括完整可运行系统、验收清单、技术文档等。");
  }

  // ========== SLIDE 8: 演示路径 ==========
  {
    const s = pres.addSlide();
    s.background = { color: C.offWhite };

    s.addText("系统演示路径", {
      x: 0.8, y: 0.3, w: 8.4, h: 0.7,
      fontSize: 32, fontFace: "Calibri", bold: true,
      color: C.navy, margin: 0,
    });

    const steps = [
      { step: "1", title: "登录系统", desc: "三种角色分别登录\n展示权限差异" },
      { step: "2", title: "创建审计任务", desc: "选择财政监督场景\n导入样本数据" },
      { step: "3", title: "查看风险发现", desc: "规则引擎自动识别\nAI 辅助解读" },
      { step: "4", title: "生成报告", desc: "PDF 标准报告\n密封导出包" },
      { step: "5", title: "整改闭环", desc: "状态追踪\n审计留痕" },
    ];

    steps.forEach((st, i) => {
      const x = 0.5 + i * 1.9;
      // Circle with step number
      s.addShape(pres.shapes.OVAL, {
        x: x + 0.55, y: 1.3, w: 0.65, h: 0.65,
        fill: { color: C.navy },
      });
      s.addText(st.step, {
        x: x + 0.55, y: 1.3, w: 0.65, h: 0.65,
        fontSize: 22, fontFace: "Calibri", bold: true,
        color: C.white, align: "center", valign: "middle", margin: 0,
      });

      // Arrow between steps
      if (i < steps.length - 1) {
        s.addText("→", {
          x: x + 1.35, y: 1.35, w: 0.5, h: 0.55,
          fontSize: 18, color: C.gold, align: "center", valign: "middle", margin: 0,
        });
      }

      s.addText(st.title, {
        x: x + 0.1, y: 2.15, w: 1.55, h: 0.4,
        fontSize: 14, fontFace: "Calibri", bold: true,
        color: C.textDark, align: "center", valign: "middle", margin: 0,
      });
      s.addText(st.desc, {
        x: x + 0.1, y: 2.6, w: 1.55, h: 0.7,
        fontSize: 11, fontFace: "Calibri",
        color: C.textMid, align: "center", valign: "top", margin: 0,
        lineSpacingMultiple: 1.3,
      });
    });

    // Demo environment info
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 3.7, w: 8.4, h: 1.5,
      fill: { color: C.white }, rectRadius: 0.1,
      shadow: mkShadow(),
    });
    s.addText("演示环境说明", {
      x: 1.1, y: 3.8, w: 3, h: 0.4,
      fontSize: 16, fontFace: "Calibri", bold: true,
      color: C.navy, margin: 0,
    });
    s.addText([
      { text: "当前为公网样板演示环境，仅使用脱敏样本数据", options: { bullet: true, breakLine: true, fontSize: 13, color: C.textDark } },
      { text: "真实数据仅在私有化 PoC 环境中使用，确保数据安全", options: { bullet: true, breakLine: true, fontSize: 13, color: C.textDark } },
      { text: "AI 辅助功能可按部署策略启停，PoC 默认关闭", options: { bullet: true, fontSize: 13, color: C.textDark } },
    ], {
      x: 1.1, y: 4.2, w: 7.8, h: 0.9,
      fontFace: "Calibri", valign: "top", margin: 0,
      paraSpaceAfter: 4,
    });

    s.addNotes("演示按5步走：登录→创建任务→查看风险→生成报告→整改闭环。注意强调这是样板环境，真实数据只进私有PoC。");
  }

  // ========== SLIDE 9: 项目价值 ==========
  {
    const s = pres.addSlide();
    s.background = { color: C.navyDark };

    s.addText("项目价值", {
      x: 0.8, y: 0.3, w: 8.4, h: 0.7,
      fontSize: 32, fontFace: "Calibri", bold: true,
      color: C.white, margin: 0,
    });

    const values = [
      { title: "技术价值", items: ["Rust 系统级性能与安全保障", "单二进制零依赖部署方案", "密码学级别证据保全机制"], icon: icons.rocketGold },
      { title: "业务价值", items: ["覆盖财政审计全生命周期", "三方角色协同提升监督效率", "规则+AI 双层风险识别体系"], icon: icons.chart },
      { title: "社会价值", items: ["助力政府数字化治理转型", "提升财政资金使用透明度", "强化公共资金监督问责能力"], icon: icons.usersW },
    ];

    values.forEach((v, i) => {
      const x = 0.6 + i * 3.1;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.2, w: 2.85, h: 3.8,
        fill: { color: C.navyLight, transparency: 40 },
        rectRadius: 0.12,
      });
      s.addImage({ data: v.icon, x: x + 1.1, y: 1.4, w: 0.55, h: 0.55 });
      s.addText(v.title, {
        x, y: 2.05, w: 2.85, h: 0.45,
        fontSize: 18, fontFace: "Calibri", bold: true,
        color: C.goldLight, align: "center", valign: "middle", margin: 0,
      });

      s.addText(
        v.items.map((item, j) => ({
          text: item,
          options: { bullet: true, breakLine: j < v.items.length - 1, fontSize: 13, color: "CADCFC" }
        })),
        {
          x: x + 0.25, y: 2.65, w: 2.35, h: 2.2,
          fontFace: "Calibri", valign: "top", margin: 0,
          paraSpaceAfter: 8,
        }
      );
    });

    s.addNotes("从技术、业务、社会三个维度总结项目价值。Rust 保障性能安全，业务上覆盖全流程，社会层面助力政府数字化治理。");
  }

  // ========== SLIDE 10: 总结致谢 ==========
  {
    const s = pres.addSlide();
    s.background = { color: C.navyDark };

    s.addImage({ data: icons.shieldW, x: 4.25, y: 0.8, w: 0.6, h: 0.6 });

    s.addText("AuditLens 财政监督工作台", {
      x: 0.5, y: 1.6, w: 9, h: 0.6,
      fontSize: 28, fontFace: "Calibri", bold: true,
      color: C.white, align: "center", margin: 0,
    });

    s.addShape(pres.shapes.LINE, {
      x: 3.5, y: 2.4, w: 3, h: 0,
      line: { color: C.gold, width: 1.5 }
    });

    s.addText("让财政监督更智能、更透明、更高效", {
      x: 0.5, y: 2.6, w: 9, h: 0.5,
      fontSize: 18, fontFace: "Calibri",
      color: C.goldLight, align: "center", margin: 0,
    });

    s.addText("感谢各位老师的指导与聆听", {
      x: 0.5, y: 3.6, w: 9, h: 0.5,
      fontSize: 20, fontFace: "Calibri",
      color: C.white, align: "center", margin: 0,
    });

    s.addText("敬请指正", {
      x: 0.5, y: 4.2, w: 9, h: 0.5,
      fontSize: 16, fontFace: "Calibri",
      color: C.textLight, align: "center", margin: 0,
    });

    s.addNotes("感谢各位老师。接下来欢迎提问，我们准备好了。");
  }

  const outPath = "D:/Desktop/smart-audit/docs/delivery/AuditLens_结题答辩.pptx";
  await pres.writeFile({ fileName: outPath });
  console.log("PPTX generated:", outPath);
}

main().catch(err => { console.error(err); process.exit(1); });

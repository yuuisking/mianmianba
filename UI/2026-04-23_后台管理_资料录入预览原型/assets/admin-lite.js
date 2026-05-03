/* 后台管理（轻量版）：上传链接/文档 → 预览 → 人工确认入库（原型） */

const STORAGE_KEY = "kb_admin_ingest_lite_v1";

const KB_OPTIONS = [
  { id: "java", name: "Java 知识库", categories: ["Java 基础", "Java 集合", "Java 并发", "JVM", "框架"] },
  { id: "backend", name: "后端通用体系", categories: ["网络", "数据库", "缓存", "分布式", "工程化"] },
  { id: "behavioral", name: "行为面（STAR）体系", categories: ["自我介绍", "冲突协作", "失败复盘", "影响力", "反问"] },
];

const state = loadState();

const $ = (s) => document.querySelector(s);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { jobs: [], lastKb: "java", lastCat: "Java 并发" };
    return JSON.parse(raw);
  } catch {
    return { jobs: [], lastKb: "java", lastCat: "Java 并发" };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function now() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setCategories(kbId) {
  const kb = KB_OPTIONS.find((k) => k.id === kbId) || KB_OPTIONS[0];
  const sel = $("#category");
  sel.innerHTML = kb.categories.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
  // keep last
  if (kb.categories.includes(state.lastCat)) sel.value = state.lastCat;
}

function renderJobs() {
  const list = $("#jobList");
  list.innerHTML = "";
  if (state.jobs.length === 0) {
    list.innerHTML = `<div class="notice">暂无任务。你可以先上传一个 GitHub 文档链接或本地文档生成预览。</div>`;
    return;
  }
  for (const j of state.jobs) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div>
          <div style="font-family:Poppins,Arial,sans-serif;font-weight:650">${escapeHtml(j.title || j.sourceName)}</div>
          <div class="muted" style="font-size:12px;margin-top:2px;">${escapeHtml(j.kbName)} · ${escapeHtml(j.category)} · ${escapeHtml(j.createdAt)}</div>
        </div>
        <div>
          <span class="tag">状态：${escapeHtml(j.status)}</span>
        </div>
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn" data-act="preview" data-id="${escapeAttr(j.id)}">预览</button>
        <button class="btn btn-primary" data-act="approve" data-id="${escapeAttr(j.id)}">确认入库</button>
        <button class="btn" data-act="delete" data-id="${escapeAttr(j.id)}">删除</button>
      </div>
    `;
    div.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => onJobAction(b.dataset.act, b.dataset.id));
    });
    list.appendChild(div);
  }
}

function onJobAction(act, id) {
  const job = state.jobs.find((x) => x.id === id);
  if (!job) return;
  if (act === "delete") {
    state.jobs = state.jobs.filter((x) => x.id !== id);
    saveState();
    renderJobs();
    return;
  }
  if (act === "approve") {
    job.status = "已入库";
    saveState();
    renderJobs();
    toast("已确认入库（原型：实际会写入体系化知识库）");
    return;
  }
  if (act === "preview") {
    renderPreview(job.preview);
    toast("已打开预览");
  }
}

function renderPreview(preview) {
  $("#previewTitle").textContent = preview?.title || "（未生成预览）";
  $("#previewBody").innerHTML = preview
    ? `
      <div class="notice" style="margin-bottom:12px;">
        这是“归纳后的体系内容预览”（典型回答/追问点/要点），不是把文档原文直接搬过来。
      </div>
      <div class="field">
        <div class="label">典型回答（预览）</div>
        <textarea readonly>${preview.typicalAnswer}</textarea>
      </div>
      <div class="field">
        <div class="label">扩展要点（预览）</div>
        <textarea readonly>${preview.extra}</textarea>
      </div>
      <div class="field">
        <div class="label">常见追问（预览）</div>
        <textarea readonly>${preview.questions}</textarea>
      </div>
      <div class="hr"></div>
      <div class="muted" style="font-size:12px;">来源：${escapeHtml(preview.sourceSummary || "")}</div>
    `
    : `<div class="notice">请先“生成预览”。</div>`;
}

function buildMockPreview({ kbName, category, sourceName }) {
  // 原型：用固定示例模拟“专用归纳模型”的输出
  const title = kbName.includes("Java") && category.includes("并发") ? "什么是多线程中的上下文切换？" : "知识点归纳预览（示例）";
  return {
    title,
    typicalAnswer:
      "上下文切换指 CPU 从一个线程切换到另一个线程执行时，需要保存当前线程的寄存器/栈/PC 等上下文，并恢复下一线程上下文继续运行。",
    extra:
      "触发：时间片耗尽、阻塞/唤醒、锁竞争、优先级抢占、中断等。\n开销：状态保存恢复 + 调度开销 + 缓存/TLB 失效，导致吞吐下降、RT 抖动。\n优化：减少阻塞与锁竞争、合理设置线程池并发度、提升任务粒度、减少共享可变状态。",
    questions:
      "为什么上下文切换有开销？\n什么情况下会频繁发生？\n如何减少上下文切换？\n如何定位：线程状态分布与锁竞争？",
    sourceSummary: sourceName ? `${sourceName}（原型：此处可展示引用片段与溯源链接）` : "（未提供来源）",
  };
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "panel";
  el.style.position = "fixed";
  el.style.right = "16px";
  el.style.bottom = "16px";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "14px";
  el.style.background = "rgba(255,255,255,0.92)";
  el.style.border = "1px solid var(--border)";
  el.style.boxShadow = "var(--shadow)";
  el.innerHTML = `<div style="font-family:Poppins,Arial,sans-serif;font-weight:650;font-size:13px;">${escapeHtml(msg)}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s) {
  return String(s).replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

async function readFileAsText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  // init KB dropdown
  const kbSel = $("#kb");
  kbSel.innerHTML = KB_OPTIONS.map((k) => `<option value="${escapeAttr(k.id)}">${escapeHtml(k.name)}</option>`).join("");
  kbSel.value = state.lastKb;
  setCategories(kbSel.value);

  kbSel.addEventListener("change", () => {
    state.lastKb = kbSel.value;
    setCategories(kbSel.value);
    saveState();
  });
  $("#category").addEventListener("change", () => {
    state.lastCat = $("#category").value;
    saveState();
  });

  // buttons
  $("#btnGenerate").addEventListener("click", async () => {
    const kbId = kbSel.value;
    const kb = KB_OPTIONS.find((x) => x.id === kbId) || KB_OPTIONS[0];
    const category = $("#category").value;
    const githubUrl = $("#githubUrl").value.trim();
    const file = $("#fileInput").files?.[0];

    if (!githubUrl && !file) {
      toast("请先输入 GitHub 链接或选择一个文档文件");
      return;
    }

    let sourceName = githubUrl || (file ? file.name : "未命名来源");
    let sourceText = "";
    if (file && file.type.startsWith("text/")) {
      sourceText = await readFileAsText(file);
    }

    const preview = buildMockPreview({ kbName: kb.name, category, sourceName });
    // 原型：如果是文本文件，展示前 400 字作为“引用片段”
    if (sourceText) {
      preview.sourceSummary = `${sourceName} · 引用片段：${sourceText.slice(0, 400).replace(/\s+/g, " ").trim()}…`;
    }

    renderPreview(preview);
    toast("已生成预览（原型：实际应由归纳模型生成）");
  });

  $("#btnCreateJob").addEventListener("click", () => {
    const kbId = kbSel.value;
    const kb = KB_OPTIONS.find((x) => x.id === kbId) || KB_OPTIONS[0];
    const category = $("#category").value;
    const githubUrl = $("#githubUrl").value.trim();
    const file = $("#fileInput").files?.[0];

    if (!githubUrl && !file) {
      toast("请先输入 GitHub 链接或选择一个文档文件");
      return;
    }

    const sourceName = githubUrl || file.name;
    const job = {
      id: `job-${Math.random().toString(16).slice(2, 8)}`,
      kbId,
      kbName: kb.name,
      category,
      sourceName,
      status: "待确认",
      createdAt: now(),
      title: $("#previewTitle").textContent || sourceName,
      preview: ($("#previewTitle").textContent && $("#previewTitle").textContent !== "（未生成预览）")
        ? {
            title: $("#previewTitle").textContent,
            typicalAnswer: $("#previewBody textarea")?.value || buildMockPreview({ kbName: kb.name, category, sourceName }).typicalAnswer,
            extra: buildMockPreview({ kbName: kb.name, category, sourceName }).extra,
            questions: buildMockPreview({ kbName: kb.name, category, sourceName }).questions,
            sourceSummary: sourceName,
          }
        : buildMockPreview({ kbName: kb.name, category, sourceName }),
    };
    state.jobs.unshift(job);
    saveState();
    renderJobs();
    toast("已创建待确认任务");
  });

  $("#btnOpenLearning").addEventListener("click", () => {
    window.open("../2026-04-23_学习中心_体系化知识库原型/learning-center.html#/kb/java/context-switch", "_blank");
  });

  renderJobs();
  renderPreview(null);
});


/* 学习中心（公开）- 体系化知识库 UI 原型（taxonomy-first） */

const KB_DATA = [
  {
    id: "java",
    name: "Java 知识库",
    subtitle: "体系化整理：基础 → 集合 → 并发 → JVM → 框架",
    tags: ["校招", "1–3 年", "中文/英文"],
    updatedAt: "2026-04-23",
    stats: { topics: 86, paths: 6 },
  },
  {
    id: "backend",
    name: "后端通用体系",
    subtitle: "网络、数据库、缓存、分布式与工程化",
    tags: ["技术岗", "中文/英文"],
    updatedAt: "2026-04-18",
    stats: { topics: 112, paths: 8 },
  },
  {
    id: "behavioral",
    name: "行为面（STAR）体系",
    subtitle: "冲突协作、失败复盘、领导力与影响力",
    tags: ["校招", "社招", "中文/英文"],
    updatedAt: "2026-04-20",
    stats: { topics: 54, paths: 4 },
  },
];

// 示例：Java 体系树（管理端维护；学习中心只消费并展示）
const JAVA_TREE = {
  id: "java",
  title: "Java 体系",
  groups: [
    {
      id: "java-basics",
      title: "Java 基础",
      children: [
        { id: "oop", title: "面向对象与三大特性" },
        { id: "exceptions", title: "异常体系与最佳实践" },
        { id: "generics", title: "泛型与类型擦除" },
      ],
    },
    {
      id: "collections",
      title: "Java 集合",
      children: [
        { id: "hashmap", title: "HashMap 原理与扩容" },
        { id: "concurrenthashmap", title: "ConcurrentHashMap 演进" },
        { id: "arraylist", title: "ArrayList vs LinkedList" },
      ],
    },
    {
      id: "concurrency",
      title: "Java 并发",
      children: [
        { id: "thread-state", title: "线程状态与生命周期" },
        { id: "context-switch", title: "什么是多线程中的上下文切换？" },
        { id: "locks", title: "synchronized / Lock / AQS" },
      ],
    },
    {
      id: "jvm",
      title: "JVM",
      children: [
        { id: "gc", title: "GC 算法与调优思路" },
        { id: "classloading", title: "类加载机制与双亲委派" },
      ],
    },
    {
      id: "frameworks",
      title: "框架",
      children: [
        { id: "spring-ioc", title: "Spring IOC 与生命周期" },
        { id: "spring-aop", title: "AOP 原理与应用场景" },
      ],
    },
  ],
};

// 示例：知识点内容（这里展示的是“归纳后的体系内容”，非文档原文）
const JAVA_CONTENT = {
  "context-switch": {
    title: "什么是多线程中的上下文切换？",
    breadcrumb: ["Java 知识库", "Java 并发", "上下文切换"],
    quickFacts: [
      { k: "一句话", v: "CPU 从一个线程切到另一个线程执行，需要保存/恢复运行现场，这个过程就是上下文切换。" },
      { k: "常见触发", v: "时间片耗尽、阻塞/唤醒、优先级抢占、中断、锁竞争等。" },
      { k: "代价", v: "调度开销 + 缓存/TLB 失效 + 状态保存恢复，吞吐下降、RT 抖动。" },
      { k: "优化方向", v: "减少阻塞/锁竞争，控制线程数（线程池），提升任务粒度，选用合适并发结构。" },
    ],
    sections: [
      {
        id: "typical",
        h2: "典型回答",
        paragraphs: [
          "上下文切换指 CPU 从一个线程切换到另一个线程时，需要保存当前线程的上下文（如寄存器、程序计数器、栈等），并恢复下一个线程的上下文，以便其继续执行。",
          "在多线程场景下，线程会因为时间片用完、I/O 阻塞、锁竞争等原因被切出，操作系统调度器选择另一线程运行，从而发生上下文切换。",
        ],
      },
      {
        id: "why-cost",
        h2: "为什么上下文切换有开销？",
        paragraphs: [
          "切换时要做状态保存与恢复；同时 CPU 缓存与 TLB 可能失效，导致后续指令/数据需要重新加载，影响性能。",
          "频繁切换通常意味着线程过多或大量阻塞/唤醒，系统把时间花在调度而不是做有效工作。",
        ],
      },
      {
        id: "reduce",
        h2: "如何减少上下文切换？（面试追问常见）",
        bullets: [
          "减少线程数：用线程池、限制并发度，避免“线程数远大于 CPU 核数”。",
          "减少阻塞：优化 I/O、减少锁持有时间、使用更细粒度锁或读写锁。",
          "用更合适的并发结构：无锁/低锁队列、原子类、减少共享可变状态。",
          "提升任务粒度：把极小任务合并，避免频繁提交/切换。",
          "观测与定位：线程状态分布（RUNNABLE/BLOCKED/WAITING）、火焰图、perf/top/vmstat 等。",
        ],
      },
      {
        id: "interview",
        h2: "你可以顺带补充的“加分点”",
        callout: "面试官更关心：你能否把“上下文切换”与真实问题（吞吐下降、RT 抖动、CPU 飙高但业务慢）关联起来，并给出定位思路。",
        bullets: [
          "大量线程处于 BLOCKED：优先怀疑锁竞争；WAITING/TIMED_WAITING 多：可能在等待条件/队列/定时器。",
          "CPU 很高但 QPS 不高：检查是否忙等/自旋过度/频繁调度。",
        ],
      },
    ],
  },
};

const $ = (sel) => document.querySelector(sel);

function route() {
  const hash = location.hash.replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  // routes:
  // - "" -> home
  // - "kb/:id" -> kb home (falls back to first topic demo)
  // - "kb/:id/:nodeId" -> kb node
  if (parts.length === 0) return { name: "home" };
  if (parts[0] !== "kb") return { name: "home" };
  if (parts.length === 2) return { name: "kb", kbId: parts[1] };
  return { name: "node", kbId: parts[1], nodeId: parts.slice(2).join("/") };
}

function render() {
  const r = route();
  if (r.name === "home") return renderHome();
  if (r.kbId === "java") return renderJava(r.nodeId);
  return renderComingSoon(r.kbId);
}

function renderHome() {
  $("#page").innerHTML = `
    <div class="page">
      <div class="panel">
        <div class="hero">
          <div class="breadcrumbs">
            <span class="chip">学习中心</span>
            <span>·</span>
            <span class="muted">体系化知识库（不是文档堆砌）</span>
          </div>
          <h1>选择你的知识体系</h1>
          <p class="muted">先看到“大类”，再进入体系树；每个知识点都有典型回答、追问点与训练建议。</p>
        </div>
        <div class="section">
          <div class="grid" id="kbGrid"></div>
        </div>
      </div>
    </div>
  `;
  const grid = $("#kbGrid");
  for (const kb of KB_DATA) {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <h3>${escapeHtml(kb.name)}</h3>
      <p class="muted">${escapeHtml(kb.subtitle)}</p>
      <div class="card-meta">
        <span class="tag">主题 ${kb.stats.topics}</span>
        <span class="tag">路径 ${kb.stats.paths}</span>
        <span class="tag">更新 ${kb.updatedAt}</span>
      </div>
      <div class="card-meta">
        ${kb.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
      </div>
    `;
    el.addEventListener("click", () => (location.hash = `#/kb/${kb.id}`));
    grid.appendChild(el);
  }
}

function renderComingSoon(kbId) {
  $("#page").innerHTML = `
    <div class="page">
      <div class="panel">
        <div class="hero">
          <div class="breadcrumbs"><a href="#/">学习中心</a><span>›</span><span>${escapeHtml(kbId)}</span></div>
          <h1>该知识库的体系正在搭建中</h1>
          <p class="muted">你可以先查看 Java 知识库的展示原型：左侧体系树 + 中间内容 + 右侧大纲。</p>
          <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="location.hash='#/kb/java'">打开 Java 知识库</button>
            <button class="btn" onclick="location.hash='#/'">返回知识库列表</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderJava(nodeId) {
  const currentNodeId = nodeId || "context-switch";
  const content = JAVA_CONTENT[currentNodeId] || JAVA_CONTENT["context-switch"];

  $("#page").innerHTML = `
    <div class="page">
      <div class="shell">
        <aside class="panel sidebar">
          <div class="panel-header">
            <div class="panel-title">Java 知识库</div>
            <span class="chip">体系树</span>
          </div>
          <div class="panel-body">
            <div class="tree" id="tree"></div>
            <div class="hr"></div>
            <div class="notice">
              提示：学习中心展示的是“体系化知识点”。底层可关联多个来源文档，但这里呈现的是“归纳后的内容”。
            </div>
          </div>
        </aside>

        <main class="panel">
          <div class="hero">
            <div class="breadcrumbs">
              <a href="#/">学习中心</a><span>›</span>
              <a href="#/kb/java">Java 知识库</a><span>›</span>
              <span>${escapeHtml(content.title)}</span>
            </div>
            <h1>${escapeHtml(content.title)}</h1>
            <div class="kvs" style="margin-top:12px;">
              ${content.quickFacts.map((x) => `
                <div class="kv">
                  <div class="k">${escapeHtml(x.k)}</div>
                  <div class="v">${escapeHtml(x.v)}</div>
                </div>
              `).join("")}
            </div>
          </div>
          <div id="content"></div>
        </main>

        <aside class="panel outline">
          <div class="panel-header">
            <div class="panel-title">大纲</div>
            <span class="chip">本页</span>
          </div>
          <div class="panel-body" id="outline"></div>
        </aside>
      </div>
    </div>
  `;

  buildTree(currentNodeId);
  buildContent(content);
  buildOutline(content);
}

function buildTree(activeNodeId) {
  const root = $("#tree");
  root.innerHTML = "";

  for (const g of JAVA_TREE.groups) {
    const group = document.createElement("div");
    group.className = "tree-group";
    const btn = document.createElement("button");
    btn.innerHTML = `<span>${escapeHtml(g.title)}</span><span class="muted">+</span>`;

    const children = document.createElement("div");
    children.className = "tree-children";
    children.style.display = "none";

    btn.addEventListener("click", () => {
      group.classList.toggle("open");
      children.style.display = group.classList.contains("open") ? "flex" : "none";
      btn.querySelector(".muted").textContent = group.classList.contains("open") ? "–" : "+";
    });

    for (const c of g.children) {
      const item = document.createElement("div");
      item.className = "tree-item";
      const a = document.createElement("a");
      a.href = `#/kb/java/${c.id}`;
      a.className = c.id === activeNodeId ? "active" : "";
      a.innerHTML = `<span>${escapeHtml(c.title)}</span><span class="muted">›</span>`;
      item.appendChild(a);
      children.appendChild(item);
    }

    // auto-open group if active within
    const isActiveInGroup = g.children.some((x) => x.id === activeNodeId);
    if (isActiveInGroup) {
      group.classList.add("open");
      children.style.display = "flex";
      btn.querySelector(".muted").textContent = "–";
    }

    group.appendChild(btn);
    group.appendChild(children);
    root.appendChild(group);
  }
}

function buildContent(content) {
  const el = $("#content");
  el.innerHTML = content.sections
    .map((s) => {
      const paras = (s.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join("");
      const bullets = (s.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("");
      const callout = s.callout
        ? `<div class="callout"><strong class="mono">提示</strong><div style="height:6px"></div>${escapeHtml(s.callout)}</div>`
        : "";
      return `
        <section class="section" id="${escapeAttr(s.id)}">
          <h2>${escapeHtml(s.h2)}</h2>
          ${callout}
          ${paras}
          ${bullets ? `<ul style="margin:10px 0 0 18px;">${bullets}</ul>` : ""}
        </section>
      `;
    })
    .join("");
}

function buildOutline(content) {
  const el = $("#outline");
  el.innerHTML = content.sections
    .map((s, idx) => `<a href="#${escapeAttr(s.id)}" data-id="${escapeAttr(s.id)}">${idx + 1}. ${escapeHtml(s.h2)}</a>`)
    .join("");

  const links = [...el.querySelectorAll("a")];
  const sectionEls = content.sections.map((s) => document.getElementById(s.id)).filter(Boolean);
  const onScroll = () => {
    let active = null;
    for (const sec of sectionEls) {
      const r = sec.getBoundingClientRect();
      if (r.top <= 140) active = sec;
    }
    for (const a of links) a.classList.toggle("active", active && a.dataset.id === active.id);
  };
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
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

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  const search = document.querySelector("#searchInput");
  if (search) {
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const q = search.value.trim();
        if (!q) return;
        const found = Object.entries(JAVA_CONTENT).find(([, v]) => v.title.includes(q));
        if (found) location.hash = `#/kb/java/${found[0]}`;
        else alert("原型：搜索仅支持演示数据（后续可接入真实检索）");
      }
    });
  }
  render();
});


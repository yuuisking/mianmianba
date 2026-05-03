/* 面试房间（语音+视频一体）静态原型（布局对齐用户线框图） */

const state = {
  camOn: false,
  micOn: false,
  startAt: null,
  audio: { ctx: null, analyser: null, source: null, raf: null, stream: null },
  video: { stream: null },
  subtitles: [],
  userName: "杨宇",
};

const $ = (s) => document.querySelector(s);

function getQueryParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function lastChar(s) {
  const t = String(s || "").trim();
  if (!t) return "你";
  // 支持 emoji/代理对：简单取 Array.from 的最后一个
  const arr = Array.from(t);
  return arr[arr.length - 1] || "你";
}

function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function setTimer() {
  const el = $("#timer");
  if (!state.startAt) {
    el.textContent = "00:00";
    return;
  }
  el.textContent = formatTime(Date.now() - state.startAt);
}

function setPresenceUI() {
  const dot = $("#presenceDot");
  dot.classList.toggle("off", !state.micOn);
  const wave = $("#wave");
  wave.classList.toggle("off", !state.micOn);
  $("#camBtn").classList.toggle("on", state.camOn);
  $("#micBtn").classList.toggle("on", state.micOn);

  // avatar/video switch
  const vid = $("#video");
  const avatar = $("#avatar");
  if (state.camOn && state.video.stream) {
    vid.style.display = "block";
    avatar.style.display = "none";
  } else {
    vid.style.display = "none";
    avatar.style.display = "grid";
  }
}

async function toggleCam() {
  state.camOn = !state.camOn;
  if (state.camOn) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      state.video.stream = stream;
      $("#video").srcObject = stream;
      $("#video").play().catch(() => {});
    } catch (e) {
      state.camOn = false;
      alert("无法打开摄像头（原型）。请检查浏览器权限。");
    }
  } else {
    if (state.video.stream) {
      state.video.stream.getTracks().forEach((t) => t.stop());
      state.video.stream = null;
    }
    $("#video").srcObject = null;
  }
  setPresenceUI();
}

function stopMicGraph() {
  const a = state.audio;
  if (a.raf) cancelAnimationFrame(a.raf);
  a.raf = null;
  if (a.source) try { a.source.disconnect(); } catch {}
  a.source = null;
  if (a.analyser) try { a.analyser.disconnect(); } catch {}
  a.analyser = null;
  if (a.ctx) try { a.ctx.close(); } catch {}
  a.ctx = null;
  if (a.stream) {
    a.stream.getTracks().forEach((t) => t.stop());
    a.stream = null;
  }
}

async function toggleMic() {
  state.micOn = !state.micOn;
  if (state.micOn) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      state.audio.stream = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      state.audio.ctx = ctx;
      state.audio.analyser = analyser;
      state.audio.source = source;

      animateWaveform();
    } catch (e) {
      state.micOn = false;
      alert("无法打开麦克风（原型）。请检查浏览器权限。");
      stopMicGraph();
    }
  } else {
    stopMicGraph();
    // reset bars
    [...document.querySelectorAll(".bar")].forEach((b) => (b.style.height = "6px"));
  }
  setPresenceUI();
}

function animateWaveform() {
  const analyser = state.audio.analyser;
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  const bars = [...document.querySelectorAll(".bar")];

  const tick = () => {
    analyser.getByteFrequencyData(data);
    // compute a rough energy
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const energy = sum / data.length / 255; // 0..1

    // update bars with slight randomness for a natural look
    for (let i = 0; i < bars.length; i++) {
      const base = 6 + i * 1.2;
      const v = base + (Math.random() * 14 + 6) * energy;
      bars[i].style.height = `${Math.max(6, Math.min(26, v))}px`;
    }
    state.audio.raf = requestAnimationFrame(tick);
  };
  tick();
}

function pushSubtitle({ speaker, text, type }) {
  state.subtitles.push({ speaker, text, type, at: Date.now() });
  // 实时字幕：不是横向跑马灯，而是在容器内追加，新内容把旧内容顶上去
  if (type !== "ai") return;
  const list = $("#subtitleList");
  const item = document.createElement("div");
  item.className = "subtitle-line";
  item.innerHTML = `
    <div class="who">AI 面试官</div>
    <div class="txt">${escapeHtml(text)}</div>
  `;
  list.appendChild(item);

  // 只保留最近 N 条，避免无限增长
  const MAX = 6;
  while (list.children.length > MAX) list.removeChild(list.firstElementChild);

  // 自动滚动到底部
  list.scrollTop = list.scrollHeight;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function seedDemoSubtitles() {
  pushSubtitle({
    speaker: "AI 面试官",
    text: "你好，我们开始吧。请你用 1 分钟做一个自我介绍，并强调与你应聘岗位最相关的 2 个优势。",
    type: "ai",
  });
  setTimeout(() => {
    pushSubtitle({
      speaker: "AI 面试官",
      text: "你提到做过“性能优化”，能具体说一下：问题是怎么定位的？你采取了哪些措施？最终指标提升了多少？",
      type: "ai",
    });
  }, 4200);
  setTimeout(() => {
    pushSubtitle({
      speaker: "AI 面试官",
      text: "如果让你复盘一次失败的上线事故，你会怎么讲：背景、你的角色、根因、改进措施？",
      type: "ai",
    });
  }, 9000);
}

function bindUI() {
  $("#camBtn").addEventListener("click", toggleCam);
  $("#micBtn").addEventListener("click", toggleMic);
  $("#endBtn").addEventListener("click", () => {
    if (!confirm("结束本次面试（原型）？")) return;
    stopMicGraph();
    if (state.video.stream) state.video.stream.getTracks().forEach((t) => t.stop());
    state.video.stream = null;
    state.camOn = false;
    state.micOn = false;
    setPresenceUI();
    pushSubtitle({ speaker: "AI 面试官", text: "本次面试结束。你可以生成总结与改进建议。", type: "ai" });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  // user name / initial
  const nameFromQuery = getQueryParam("name");
  if (nameFromQuery) state.userName = nameFromQuery;
  const nameLabel = $("#userNameLabel");
  const initial = $("#userInitial");
  if (nameLabel) nameLabel.textContent = state.userName;
  if (initial) initial.textContent = lastChar(state.userName);

  state.startAt = Date.now();
  setTimer();
  setInterval(setTimer, 250);
  setPresenceUI();
  bindUI();
  seedDemoSubtitles();
});

const $ = (id) => document.getElementById(id);

const video = $("video");
const audioPlayer = $("audioPlayer");
const canvas = $("emojiCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const visCanvas = $("visualizerCanvas");
const vCtx = visCanvas.getContext("2d");

const ui = {
  videoUpload: $("videoUpload"),
  audioUpload: $("audioUpload"),
  playBtn: $("playBtn"),
  pauseBtn: $("pauseBtn"),
  fullscreenBtn: $("fullscreenBtn"),
  exportPngBtn: $("exportPngBtn"),
  exportWebmBtn: $("exportWebmBtn"),
  resSlider: $("resSlider"),
  resLabel: $("resLabel"),
  resWarning: $("resWarning"),
  emojiMode: $("emojiMode"),
  colorProfile: $("colorProfile"),
  toggleAudioSource: $("toggleAudioSource"),
  toggleRainbow: $("toggleRainbow"),
  visType: $("visType"),
  visColor: $("visColor"),
  visSensitivity: $("visSensitivity"),
  smoothing: $("smoothing"),
  rainbowSpeed: $("rainbowSpeed"),
  videoUrlInput: $("videoUrlInput"),
  loadUrlBtn: $("loadUrlBtn"),
  copyGuideBtn: $("copyGuideBtn"),
  trimStart: $("trimStart"),
  trimEnd: $("trimEnd"),
  trimStartLabel: $("trimStartLabel"),
  trimEndLabel: $("trimEndLabel"),
  previewTrimBtn: $("previewTrimBtn"),
  jumpStartBtn: $("jumpStartBtn"),
  exportTrimBtn: $("exportTrimBtn"),
  trimStatus: $("trimStatus"),
  durationInfo: $("durationInfo"),
  fpsState: $("fpsState"),
  resState: $("resState"),
  audioState: $("audioState"),
  modeState: $("modeState"),
};

const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const BW = ["⬛", "⬜"];
const GLITCH = ["?", "!", "@", "#", "$", "%", "X", "0", "1"];
const THERMAL = ["🟦", "🟩", "🟨", "🟧", "🟥"];
const FULL = ["⬛", "⬜", "🟥", "🟧", "🟨", "🟩", "🟦", "🔥", "✨", "🌑", "🌕"];

const offCanvas = document.createElement("canvas");
const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });

const state = {
  playing: false,
  clipPreviewing: false,
  useVideoAudio: true,
  rainbow: false,
  currentFont: 0,
  frameCount: 0,
  lastFrameT: 0,
  lastFpsT: 0,
  lastW: 0,
  lastH: 0,
  maxInternal: 560,
  frameInterval: 1000 / 30,
};

let audioCtx;
let analyser;
let source;
let dataArray;

function setVideoSource(url) {
  video.src = url;
  video.load();
  video.onloadedmetadata = () => {
    const scale = Math.min(1, state.maxInternal / video.videoWidth);
    offCanvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
    offCanvas.height = Math.max(1, Math.floor(video.videoHeight * scale));
    ui.resState.textContent = `Internal: ${offCanvas.width}x${offCanvas.height}`;
    ui.modeState.textContent = `Mode: ${ui.emojiMode.value}`;

    ui.durationInfo.textContent = `Duration: ${video.duration.toFixed(1)}s`;
    ui.trimStart.max = video.duration;
    ui.trimEnd.max = video.duration;
    ui.trimStart.value = 0;
    ui.trimEnd.value = video.duration;
    syncTrimLabels();

    resizeSurface();
  };
}

function pickChar(norm, mode) {
  if (mode === "ascii" || mode === "ascii_blur") return ASCII[Math.floor(norm * (ASCII.length - 1))];
  if (mode === "bw") return norm > 0.5 ? BW[1] : BW[0];
  if (mode === "glitch") return GLITCH[Math.floor(Math.abs((norm + Math.random() * 0.25) % 1) * (GLITCH.length - 1))];
  if (mode === "thermal") return norm < 0.2 ? THERMAL[0] : norm < 0.4 ? THERMAL[1] : norm < 0.6 ? THERMAL[2] : norm < 0.8 ? THERMAL[3] : THERMAL[4];
  return FULL[Math.floor(norm * (FULL.length - 1))];
}

function pickColor(r, g, b, luma) {
  const p = ui.colorProfile.value;
  if (p === "matrix") return `rgb(0,${luma | 0},0)`;
  if (p === "cyber") return `rgb(${luma | 0},0,${(luma * 0.55) | 0})`;
  if (p === "mono") return `rgb(${luma | 0},${luma | 0},${luma | 0})`;
  if (p === "duotone") return luma > 125 ? "rgb(0,242,255)" : "rgb(126,139,255)";
  return `rgb(${r},${g},${b})`;
}

function resizeSurface() {
  if (!video.videoWidth) return;
  const w = canvas.clientWidth || video.videoWidth;
  const h = Math.max(240, Math.floor(w * (video.videoHeight / video.videoWidth)));
  if (w !== state.lastW || h !== state.lastH) {
    canvas.width = w;
    canvas.height = h;
    visCanvas.width = w;
    visCanvas.height = 180;
    state.lastW = w;
    state.lastH = h;
  }
}

function render(size) {
  if (!video.videoWidth) return;
  if (size <= 6 && ui.emojiMode.value === "full") ui.emojiMode.value = "ascii";

  const scale = Math.min(1, state.maxInternal / video.videoWidth);
  const cols = Math.max(1, Math.floor((video.videoWidth * scale) / size));
  const rows = Math.max(1, Math.floor((video.videoHeight * scale) / size));

  if (offCanvas.width !== cols || offCanvas.height !== rows) {
    offCanvas.width = cols;
    offCanvas.height = rows;
    ui.resState.textContent = `Internal: ${cols}x${rows}`;
  }

  offCtx.drawImage(video, 0, 0, cols, rows);
  const px = offCtx.getImageData(0, 0, cols, rows).data;
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;
  const fs = Math.max(8, Math.floor(ch));

  if (fs !== state.currentFont) {
    ctx.font = `${fs}px monospace`;
    ctx.textBaseline = "top";
    state.currentFont = fs;
  }

  ctx.globalAlpha = ui.emojiMode.value === "ascii_blur" ? 0.36 : 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0, p = 0; i < cols * rows; i++, p += 4) {
    const x = i % cols;
    const y = (i / cols) | 0;
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    const norm = luma / 255;

    ctx.fillStyle = pickColor(r, g, b, luma);
    ctx.fillText(pickChar(norm, ui.emojiMode.value), x * cw, y * ch);
  }

  ctx.globalAlpha = 1;
}

function syncTrimLabels() {
  const s = Number(ui.trimStart.value);
  const e = Number(ui.trimEnd.value);
  if (s >= e) ui.trimEnd.value = Math.min(Number(ui.trimEnd.max), s + 0.2);
  ui.trimStartLabel.textContent = `${Number(ui.trimStart.value).toFixed(1)}s`;
  ui.trimEndLabel.textContent = `${Number(ui.trimEnd.value).toFixed(1)}s`;
}

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = Number(ui.smoothing.value);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
}

function connectSource(mediaEl) {
  initAudio();
  if (source) source.disconnect();
  source = audioCtx.createMediaElementSource(mediaEl);
  source.connect(analyser).connect(audioCtx.destination);
  ui.audioState.textContent = `Audio: ${mediaEl === video ? "video" : "uploaded"}`;
}

function visColor(t) {
  if (!state.rainbow) return ui.visColor.value;
  const hue = ((t / 16) * Number(ui.rainbowSpeed.value)) % 360;
  return `hsl(${hue} 100% 60%)`;
}

function drawBars(w, h, c, g) {
  analyser.getByteFrequencyData(dataArray);
  const bw = Math.max(2, w / dataArray.length - 1);
  vCtx.fillStyle = c;
  for (let i = 0; i < dataArray.length; i++) {
    const bh = Math.min(h, (dataArray[i] / 255) * g * h);
    vCtx.fillRect(i * (bw + 1), h - bh, bw, bh);
  }
}

function drawWave(w, h, c, g) {
  analyser.getByteTimeDomainData(dataArray);
  vCtx.strokeStyle = c;
  vCtx.lineWidth = 2;
  vCtx.beginPath();
  for (let i = 0; i < dataArray.length; i++) {
    const x = (i / dataArray.length) * w;
    const y = ((dataArray[i] / 255) - 0.5) * (h * g) + h / 2;
    i ? vCtx.lineTo(x, y) : vCtx.moveTo(x, y);
  }
  vCtx.stroke();
}

function drawCircle(w, h, c, g) {
  analyser.getByteFrequencyData(dataArray);
  const cx = w / 2, cy = h / 2, base = Math.min(w, h) * 0.2;
  vCtx.strokeStyle = c;
  vCtx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const idx = Math.floor(t * (dataArray.length - 1));
    const amp = (dataArray[idx] / 255) * g * 46;
    const a = t * Math.PI * 2;
    const x = cx + Math.cos(a) * (base + amp);
    const y = cy + Math.sin(a) * (base + amp);
    i ? vCtx.lineTo(x, y) : vCtx.moveTo(x, y);
  }
  vCtx.stroke();
}

function drawRadial(w, h, c, g) {
  analyser.getByteFrequencyData(dataArray);
  const cx = w / 2, cy = h / 2;
  vCtx.strokeStyle = c;
  for (let i = 0; i < 140; i++) {
    const a = (i / 140) * Math.PI * 2;
    const amp = (dataArray[i] / 255) * g;
    const inner = 20;
    const outer = inner + amp * Math.min(w, h) * 0.45;
    vCtx.beginPath();
    vCtx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    vCtx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    vCtx.stroke();
  }
}

function drawEnergy(w, h, c, g) {
  analyser.getByteFrequencyData(dataArray);
  const bands = 28;
  const step = Math.floor(dataArray.length / bands);
  const sh = h / bands;
  vCtx.fillStyle = c;
  for (let b = 0; b < bands; b++) {
    let sum = 0;
    for (let i = 0; i < step; i++) sum += dataArray[b * step + i] || 0;
    const level = ((sum / Math.max(1, step)) / 255) * g;
    vCtx.fillRect(0, h - (b + 1) * sh, level * w, sh - 1);
  }
}

function drawVisualizer(t = 0) {
  const w = visCanvas.width;
  const h = visCanvas.height;
  vCtx.fillStyle = "rgba(0,0,0,0.25)";
  vCtx.fillRect(0, 0, w, h);

  if (analyser && dataArray) {
    const c = visColor(t);
    const g = Number(ui.visSensitivity.value);
    const mode = ui.visType.value;
    if (mode === "wave") drawWave(w, h, c, g);
    else if (mode === "circle") drawCircle(w, h, c, g);
    else if (mode === "radial") drawRadial(w, h, c, g);
    else if (mode === "energy") drawEnergy(w, h, c, g);
    else drawBars(w, h, c, g);
  }

  requestAnimationFrame(drawVisualizer);
}

function engineLoop(ts) {
  if (ts - state.lastFrameT >= state.frameInterval) {
    resizeSurface();
    if (state.playing && !video.paused && !video.ended) {
      render(Number(ui.resSlider.value));
      state.frameCount++;
      if (state.clipPreviewing && video.currentTime >= Number(ui.trimEnd.value)) {
        video.pause();
        state.clipPreviewing = false;
        ui.trimStatus.textContent = "Trim status: preview complete";
      }
    }
    state.lastFrameT = ts;
  }

  if (ts - state.lastFpsT >= 1000) {
    ui.fpsState.textContent = `FPS: ${state.frameCount}`;
    state.frameCount = 0;
    state.lastFpsT = ts;
  }

  requestAnimationFrame(engineLoop);
}

async function exportWebm(seconds = 4) {
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  setTimeout(() => rec.stop(), seconds * 1000);
  await new Promise((resolve) => (rec.onstop = resolve));

  const blob = new Blob(chunks, { type: "video/webm" });
  const a = document.createElement("a");
  a.download = `emoji-canvas-${Date.now()}.webm`;
  a.href = URL.createObjectURL(blob);
  a.click();
}

function wireEvents() {
  ui.videoUpload.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) setVideoSource(URL.createObjectURL(f));
  });

  ui.audioUpload.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    audioPlayer.src = URL.createObjectURL(f);
    state.useVideoAudio = false;
    ui.toggleAudioSource.textContent = "Use Video Audio";
    connectSource(audioPlayer);
    audioPlayer.play().catch(() => {});
  });

  ui.resSlider.addEventListener("input", () => {
    ui.resLabel.textContent = `${ui.resSlider.value}px`;
    ui.resWarning.style.display = Number(ui.resSlider.value) <= 6 ? "block" : "none";
  });

  ui.playBtn.addEventListener("click", async () => {
    if (!video.src) return;
    state.playing = true;
    ui.modeState.textContent = `Mode: ${ui.emojiMode.value}`;
    try {
      if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
      await video.play();
      if (state.useVideoAudio) connectSource(video);
    } catch {
      ui.modeState.textContent = "Mode: autoplay blocked";
    }
  });

  ui.pauseBtn.addEventListener("click", () => video.pause());

  ui.fullscreenBtn.addEventListener("click", async () => {
    const app = document.querySelector(".app-shell");
    if (!document.fullscreenElement) await app.requestFullscreen();
    else await document.exitFullscreen();
    resizeSurface();
  });

  ui.toggleRainbow.addEventListener("click", () => {
    state.rainbow = !state.rainbow;
    ui.toggleRainbow.textContent = state.rainbow ? "Rainbow ON" : "Rainbow OFF";
  });

  ui.toggleAudioSource.addEventListener("click", () => {
    state.useVideoAudio = !state.useVideoAudio;
    if (state.useVideoAudio) {
      ui.toggleAudioSource.textContent = "Use Uploaded Audio";
      if (audioPlayer.src) audioPlayer.pause();
      if (video.src) connectSource(video);
    } else {
      ui.toggleAudioSource.textContent = "Use Video Audio";
      if (audioPlayer.src) connectSource(audioPlayer);
    }
  });

  ui.loadUrlBtn.addEventListener("click", () => {
    const url = ui.videoUrlInput.value.trim();
    if (url) setVideoSource(url);
  });

  ui.copyGuideBtn.addEventListener("click", async () => {
    const text = "Use a backend downloader service/API to convert YouTube/TikTok links into direct media URLs and then load them in this UI.";
    try {
      await navigator.clipboard.writeText(text);
      ui.copyGuideBtn.textContent = "Copied";
    } catch {
      ui.copyGuideBtn.textContent = "Copy failed";
    }
    setTimeout(() => (ui.copyGuideBtn.textContent = "Copy Downloader Guide"), 1000);
  });

  [ui.trimStart, ui.trimEnd].forEach((el) => el.addEventListener("input", syncTrimLabels));

  ui.previewTrimBtn.addEventListener("click", async () => {
    if (!video.src) return;
    state.clipPreviewing = true;
    ui.trimStatus.textContent = `Trim status: previewing ${Number(ui.trimStart.value).toFixed(1)}s to ${Number(ui.trimEnd.value).toFixed(1)}s`;
    video.currentTime = Number(ui.trimStart.value);
    await video.play().catch(() => {});
  });

  ui.jumpStartBtn.addEventListener("click", () => {
    if (video.src) video.currentTime = Number(ui.trimStart.value);
  });

  ui.exportTrimBtn.addEventListener("click", async () => {
    if (!video.src) return;
    const start = Number(ui.trimStart.value);
    const end = Number(ui.trimEnd.value);
    const dur = Math.max(0.3, end - start);

    const stream = video.captureStream();
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    ui.trimStatus.textContent = "Trim status: recording";

    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    video.currentTime = start;
    await video.play().catch(() => {});
    rec.start();

    setTimeout(() => {
      rec.stop();
      video.pause();
    }, dur * 1000);

    await new Promise((resolve) => (rec.onstop = resolve));
    const blob = new Blob(chunks, { type: "video/webm" });
    const a = document.createElement("a");
    a.download = `trim-${Date.now()}.webm`;
    a.href = URL.createObjectURL(blob);
    a.click();
    ui.trimStatus.textContent = "Trim status: exported";
  });

  ui.exportPngBtn.addEventListener("click", () => {
    const a = document.createElement("a");
    a.download = `emoji-frame-${Date.now()}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  });

  ui.exportWebmBtn.addEventListener("click", () => exportWebm(4));

  ui.smoothing.addEventListener("input", () => {
    if (analyser) analyser.smoothingTimeConstant = Number(ui.smoothing.value);
  });

  window.addEventListener("resize", resizeSurface);
}

wireEvents();
requestAnimationFrame(engineLoop);
requestAnimationFrame(drawVisualizer);

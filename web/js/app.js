import { astar, nearestWalkable } from "./router.js";
import { evaluate } from "./eva.js";

const DATA = "../data/out/";
const $ = (id) => document.getElementById(id);

const canvas = $("map");
const ctx = canvas.getContext("2d");
const profileCanvas = $("profile");
const pctx = profileCanvas.getContext("2d");
const dpr = Math.min(window.devicePixelRatio || 1, 2);

const RAMP_TEMP = [
  [38, 62, 122], [58, 118, 158], [122, 168, 148],
  [208, 194, 122], [208, 134, 86], [166, 66, 58],
];

const state = {
  meta: null,
  W: 0, H: 0,
  imgs: {},
  cost: null,
  elev: null,
  temp8: null,
  tempColor: null,
  view: { scale: 1, tx: 0, ty: 0, fit: 1 },
  A: null, // {x,y}
  B: null,
  path: null,
  metrics: null,
  active: "b",
  layers: { terrain: true, thermal: false, temp: false, hazard: true, route: true },
  rems: null,
  drag: null,
};

// ---------------------------------------------------------------- helpers

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("failed to load " + src));
    im.src = src;
  });
}

const safeImage = (src) => loadImage(src).catch(() => null);

function toWorld(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return [
    (clientX - r.left - state.view.tx) / state.view.scale,
    (clientY - r.top - state.view.ty) / state.view.scale,
  ];
}

function worldToLonLat(x, y) {
  const [w, s, e, n] = state.meta.bbox_lonlat;
  return [w + (x / state.W) * (e - w), n - (y / state.H) * (n - s)];
}

function lonLatToWorld(lon, lat) {
  const [w, s, e, n] = state.meta.bbox_lonlat;
  return [((lon - w) / (e - w)) * state.W, ((n - lat) / (n - s)) * state.H];
}

function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}H ${String(m).padStart(2, "0")}M` : `${m} MIN`;
}

function fmtDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

// ---------------------------------------------------------------- loading

async function boot() {
  state.meta = await (await fetch(DATA + "meta.json")).json();
  const meta = state.meta;
  [state.W, state.H] = meta.grid_px;

  const [basemap, costImg, hazard, tempImg, slopeImg, roughImg, themisImg, rems] = await Promise.all([
    loadImage(DATA + meta.images.basemap),
    loadImage(DATA + meta.images.cost),
    loadImage(DATA + meta.images.hazard),
    loadImage(DATA + "temp8.png"),
    loadImage(DATA + "slope8.png"),
    loadImage(DATA + "rough8.png"),
    safeImage(DATA + "themis.png"),
    fetch(DATA + "rems.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  state.imgs.themis = themisImg;
  state.rems = rems;
  if (rems) {
    $("sol").textContent = `SOL ${rems.sol}`;
    $("sol-num").textContent = `SOL ${rems.sol}`;
    $("sol-date").textContent = `${rems.terrestrial_date || ""} · LATEST`;
    const f = (v, d = 0) => (v === null || v === undefined ? "—" : Number(v).toFixed(d));
    $("wx-air").textContent = `${f(rems.air_temp_min_c)}…${f(rems.air_temp_max_c)} °C`;
    $("wx-ground").textContent = `${f(rems.ground_temp_min_c)}…${f(rems.ground_temp_max_c)} °C`;
    $("wx-press").textContent = `${f(rems.pressure_pa)} Pa`;
    $("wx-sky").textContent = rems.opacity || "—";
    $("wx-uv").textContent = rems.uv_index || "—";
    $("wx-day").textContent = `${rems.sunrise || "—"}–${rems.sunset || "—"}`;
  }

  state.imgs.basemap = basemap;
  state.imgs.hazard = hazard;

  // cost grid -> Uint8Array
  const c = document.createElement("canvas");
  c.width = state.W; c.height = state.H;
  const cc = c.getContext("2d", { willReadFrequently: true });
  cc.drawImage(costImg, 0, 0);
  const cd = cc.getImageData(0, 0, state.W, state.H).data;
  state.cost = new Uint8Array(state.W * state.H);
  for (let i = 0, j = 0; i < state.cost.length; i++, j += 4) state.cost[i] = cd[j];

  // temperature grid -> Uint8Array + colourised canvas
  cc.drawImage(tempImg, 0, 0);
  const td = cc.getImageData(0, 0, state.W, state.H).data;
  state.temp8 = new Uint8Array(state.W * state.H);
  for (let i = 0, j = 0; i < state.temp8.length; i++, j += 4) state.temp8[i] = td[j];

  // terrain slope grid -> Uint8Array (0..255 maps to 0..90 deg)
  cc.drawImage(slopeImg, 0, 0);
  const sd = cc.getImageData(0, 0, state.W, state.H).data;
  state.slope8 = new Uint8Array(state.W * state.H);
  for (let i = 0, j = 0; i < state.slope8.length; i++, j += 4) state.slope8[i] = sd[j];

  // roughness grid -> Uint8Array (0..255 normalised to p98)
  cc.drawImage(roughImg, 0, 0);
  const rd = cc.getImageData(0, 0, state.W, state.H).data;
  state.rough8 = new Uint8Array(state.W * state.H);
  for (let i = 0, j = 0; i < state.rough8.length; i++, j += 4) state.rough8[i] = rd[j];

  const tc = document.createElement("canvas");
  tc.width = state.W; tc.height = state.H;
  const tcx = tc.getContext("2d");
  const out = tcx.createImageData(state.W, state.H);
  for (let i = 0, j = 0; i < state.temp8.length; i++, j += 4) {
    const t = state.temp8[i] / 255;
    const p = t * (RAMP_TEMP.length - 1);
    const k = Math.min(RAMP_TEMP.length - 2, Math.floor(p));
    const f = p - k;
    const a = RAMP_TEMP[k], b = RAMP_TEMP[k + 1];
    out.data[j] = a[0] + (b[0] - a[0]) * f;
    out.data[j + 1] = a[1] + (b[1] - a[1]) * f;
    out.data[j + 2] = a[2] + (b[2] - a[2]) * f;
    out.data[j + 3] = 255;
  }
  tcx.putImageData(out, 0, 0);
  state.tempColor = tc;

  // elevation as int16
  const buf = await (await fetch(DATA + meta.elevation.file)).arrayBuffer();
  state.elev = new Int16Array(buf);

  // defaults
  const hab = meta.route.hab_lonlat;
  const [ax, ay] = lonLatToWorld(hab[0], hab[1]);
  state.A = { x: ax, y: ay };

  let best = null, bestD = -1;
  for (const wp of meta.waypoints) {
    const [x, y] = lonLatToWorld(wp.lon, wp.lat);
    const d = (x - ax) ** 2 + (y - ay) ** 2;
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  state.B = best;

  $("budget").value = String(meta.route.eva_budget_min);
  if (!state.rems) $("sol").textContent = "Sol 4995";
  $("site").textContent = meta.name;

  resize();
  fitView();
  route();
}

// ---------------------------------------------------------------- view

function resize() {
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  const pr = profileCanvas.getBoundingClientRect();
  profileCanvas.width = Math.round(pr.width * dpr);
  profileCanvas.height = Math.round(pr.height * dpr);
  draw();
  drawProfile();
}

function fitView() {
  const r = canvas.getBoundingClientRect();
  const contain = Math.min(r.width / state.W, r.height / state.H);
  const cover = Math.max(r.width / state.W, r.height / state.H);
  state.view.scale = cover;
  state.view.fit = contain * 0.92;
  state.view.tx = (r.width - state.W * cover) / 2;
  state.view.ty = (r.height - state.H * cover) / 2;
  draw();
}

// ---------------------------------------------------------------- routing

function route() {
  if (!state.A || !state.B) return;
  const { W, H } = state;
  let [ax, ay] = nearestWalkable(state.cost, W, H, state.A.x, state.A.y) || [];
  let [bx, by] = nearestWalkable(state.cost, W, H, state.B.x, state.B.y) || [];

  if (ax === undefined || bx === undefined) {
    state.path = null;
    state.metrics = null;
    $("warn").textContent = "NO VALID ENDPOINT";
    $("warn").hidden = false;
    updateStats();
    return;
  }

  state.A.x = ax; state.A.y = ay;
  state.B.x = bx; state.B.y = by;

  const t0 = performance.now();
  const path = astar(state.cost, W, H, ax, ay, bx, by);
  const ms = performance.now() - t0;

  if (!path) {
    state.path = null;
    state.metrics = null;
    $("warn").textContent = "NO ROUTE — TERRAIN BLOCKS";
    $("warn").hidden = false;
    updateStats();
    draw();
    return;
  }

  state.path = path;
  state.metrics = evaluate(path, {
    W,
    cell: state.meta.cell_size_m,
    elev: state.elev,
    cost: state.cost,
    temp8: state.temp8,
    slope8: state.slope8,
    rough8: state.rough8,
    tempMin: state.meta.temperature.min_c,
    tempMax: state.meta.temperature.max_c,
    p10: state.meta.temperature.p10_c,
    cfg: {
      ...state.meta.route,
      eva_budget_min: Number($("budget").value),
    },
  });
  state.metrics.ms = Math.round(ms);

  $("warn").hidden = true;
  updateStats();
  draw();
  drawProfile();
}

// ---------------------------------------------------------------- stats

function updateSep() {
  const on = $("sep").checked;
  document.body.classList.toggle("sep-on", on);
  const el = $("masterwarn");
  if (!on) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const m = state.metrics;
  $("masterwarn-text").textContent = m
    ? `SEP EVENT \u00b7 SEEK SHELTER NOW \u00b7 RETURN ${fmtDist(m.distance_m)} \u00b7 ${fmtTime(m.time_s)}`
    : "SEP EVENT \u00b7 SEEK SHELTER NOW";
}

function updateStats() {
  const m = state.metrics;
  updateSep();
  if (!m) {
    for (const id of ["time", "dist", "asc", "desc", "tmin", "tmax", "dose", "dosepct", "slope", "budgetleft"]) {
      $(id).textContent = "—";
    }
    $("thermaladv").hidden = true;
    return;
  }

  $("time").textContent = fmtTime(m.time_s);
  $("dist").textContent = fmtDist(m.distance_m);
  $("asc").textContent = `+${Math.round(m.ascent_m)} m`;
  $("desc").textContent = `−${Math.round(m.descent_m)} m`;
  $("tmin").textContent = `${m.temp_min.toFixed(1)}`;
  $("tmax").textContent = `${m.temp_max.toFixed(1)} °C`;

  const sepDose = $("sep").checked ? 25.0 : 0;
  const dose = m.dose_mSv + sepDose;
  $("dose").textContent = `${dose.toFixed(3)} mSv`;
  $("dose").style.color = sepDose > 0 ? "var(--red)" : "var(--text)";

  const pct = (dose / state.meta.radiation.career_limit_mSv) * 100;
  const ref = state.meta.radiation.career_limit_mSv;
  $("dosepct").textContent = sepDose > 0
    ? `+25 mSv SIM · ${pct.toFixed(2)}% / ${ref} mSv ref`
    : `${pct.toFixed(3)}% / ${ref} mSv ref · GCR`;
  $("slope").textContent = `${m.max_slope_deg.toFixed(0)}°`;

  const left = m.remaining_min;
  $("budgetleft").textContent = `${Math.round(left)} min`;
  $("budgetleft").style.color = left < 0 ? "var(--red)" : left < 45 ? "var(--amber)" : "var(--green)";

  const adv = $("thermaladv");
  const p10s = state.meta.temperature.p10_c.toFixed(1).replace("-", "\u2212");
  adv.hidden = false;
  if (m.cold_fraction > 0.01) {
    adv.className = "alert cold";
    adv.textContent = `THERMAL ${(m.cold_fraction * 100).toFixed(0)}% BELOW · P10 ${p10s}°`;
  } else {
    adv.className = "alert clear";
    adv.textContent = `THERMAL CLEAR · P10 ${p10s}°`;
  }

  const pnr = $("pnr");
  if (m.pnr_index < state.path.length) {
    pnr.hidden = false;
    pnr.textContent = `EST PNR ${fmtDist(m.pnr_distance_m)}`;
  } else {
    pnr.hidden = true;
  }

  const [alon, alat] = worldToLonLat(state.A.x, state.A.y);
  const [blon, blat] = worldToLonLat(state.B.x, state.B.y);
  $("a-lonlat").textContent = `${alat.toFixed(4)}°, ${alon.toFixed(4)}°`;
  $("b-lonlat").textContent = `${blat.toFixed(4)}°, ${blon.toFixed(4)}°`;
}

// ---------------------------------------------------------------- draw map

function draw() {
  if (!state.meta) return;
  const { W, H, view } = state;
  const r = canvas.getBoundingClientRect();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  ctx.fillStyle = "#08090b";
  ctx.fillRect(0, 0, r.width, r.height);

  ctx.save();
  ctx.translate(view.tx, view.ty);
  ctx.scale(view.scale, view.scale);

  if (state.layers.terrain) ctx.drawImage(state.imgs.basemap, 0, 0, W, H);

  if (state.layers.thermal && state.imgs.themis) {
    ctx.globalAlpha = 0.55;
    ctx.drawImage(state.imgs.themis, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  if (state.layers.temp) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(state.tempColor, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  if (state.layers.hazard) {
    ctx.globalAlpha = 0.85;
    ctx.drawImage(state.imgs.hazard, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  if (state.layers.route && state.path) drawRoute();

  drawMarker(state.A, "A", "#7bc86c");
  drawMarker(state.B, "B", "#e8a33d");

  ctx.restore();
}

function drawRoute() {
  const { W, path } = state;
  const m = state.metrics;
  const lw = Math.max(1.2, 2.4 / state.view.scale);

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const seg = (from, to, color, dashed) => {
    if (to <= from) return;
    ctx.beginPath();
    for (let i = from; i < to; i++) {
      const x = path[i] % W;
      const y = (path[i] / W) | 0;
      i === from ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.setLineDash(dashed ? [lw * 3, lw * 2.5] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // halo
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const x = path[i] % W;
    const y = (path[i] / W) | 0;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = lw * 2.6;
  ctx.stroke();

  // thermal advisory underlay: coldest-decile stretches highlighted in amber
  if (m && m.samples && m.cold_fraction > 0) {
    ctx.beginPath();
    let open = false;
    for (let i = 0; i < path.length; i++) {
      const cold = m.samples[i] && m.samples[i].cold;
      if (!cold) { open = false; continue; }
      const x = path[i] % W;
      const y = (path[i] / W) | 0;
      if (open) ctx.lineTo(x, y);
      else { ctx.moveTo(x, y); open = true; }
    }
    ctx.strokeStyle = "rgba(232,163,61,0.9)";
    ctx.lineWidth = lw * 3.4;
    ctx.stroke();
  }

  const cut = m && m.pnr_index < path.length ? m.pnr_index : path.length;
  seg(0, cut, "#4ecdc4", false);
  seg(cut, path.length, "#e2574c", true);

  if (m && m.pnr_index < path.length) {
    const i = path[m.pnr_index];
    const x = i % W;
    const y = (i / W) | 0;
    const rr = 7 / state.view.scale;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.strokeStyle = "#e2574c";
    ctx.lineWidth = lw * 1.4;
    ctx.stroke();
  }
}

function drawMarker(pt, label, color) {
  if (!pt) return;
  const s = 1 / state.view.scale;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 7 * s, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = "rgba(8,9,11,0.9)";
  ctx.stroke();

  ctx.font = `${10 * s}px ui-monospace, monospace`;
  ctx.fillStyle = "rgba(8,9,11,0.9)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, pt.x, pt.y + 0.5 * s);
}

// ---------------------------------------------------------------- profile

function drawProfile() {
  const r = profileCanvas.getBoundingClientRect();
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pctx.clearRect(0, 0, r.width, r.height);

  const m = state.metrics;
  if (!m || !m.samples || m.samples.length < 2) {
    pctx.fillStyle = "rgba(255,255,255,0.28)";
    pctx.font = "11px ui-monospace, monospace";
    pctx.textAlign = "center";
    pctx.fillText("no route", r.width / 2, r.height / 2);
    return;
  }

  const pad = { l: 58, r: 58, t: 10, b: 16 };
  const w = r.width - pad.l - pad.r;
  const h = r.height - pad.t - pad.b;
  const S = m.samples;
  const totalD = S[S.length - 1].d || 1;

  let zMin = Infinity, zMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  for (const p of S) {
    if (p.z < zMin) zMin = p.z;
    if (p.z > zMax) zMax = p.z;
    if (p.temp < tMin) tMin = p.temp;
    if (p.temp > tMax) tMax = p.temp;
  }
  if (zMax - zMin < 1) { zMax += 1; zMin -= 1; }
  if (tMax - tMin < 0.5) { tMax += 0.5; tMin -= 0.5; }

  const X = (d) => pad.l + (d / totalD) * w;
  const Z = (z) => pad.t + h - ((z - zMin) / (zMax - zMin)) * h;
  const T = (t) => pad.t + h - ((t - tMin) / (tMax - tMin)) * h;

  // elevation fill
  pctx.beginPath();
  pctx.moveTo(X(0), pad.t + h);
  for (const p of S) pctx.lineTo(X(p.d), Z(p.z));
  pctx.lineTo(X(totalD), pad.t + h);
  pctx.closePath();
  const grad = pctx.createLinearGradient(0, pad.t, 0, pad.t + h);
  grad.addColorStop(0, "rgba(78,205,196,0.30)");
  grad.addColorStop(1, "rgba(78,205,196,0.02)");
  pctx.fillStyle = grad;
  pctx.fill();

  pctx.beginPath();
  for (let i = 0; i < S.length; i++) {
    const p = S[i];
    i === 0 ? pctx.moveTo(X(p.d), Z(p.z)) : pctx.lineTo(X(p.d), Z(p.z));
  }
  pctx.strokeStyle = "#4ecdc4";
  pctx.lineWidth = 1.4;
  pctx.stroke();

  // temperature line
  pctx.beginPath();
  for (let i = 0; i < S.length; i++) {
    const p = S[i];
    i === 0 ? pctx.moveTo(X(p.d), T(p.temp)) : pctx.lineTo(X(p.d), T(p.temp));
  }
  pctx.strokeStyle = "rgba(232,163,61,0.85)";
  pctx.lineWidth = 1.1;
  pctx.setLineDash([3, 3]);
  pctx.stroke();
  pctx.setLineDash([]);

  // thermal advisory threshold (box 10th percentile)
  const p10 = state.meta.temperature && state.meta.temperature.p10_c;
  if (typeof p10 === "number" && p10 > tMin && p10 < tMax) {
    const y = T(p10);
    pctx.beginPath();
    pctx.moveTo(pad.l, y);
    pctx.lineTo(pad.l + w, y);
    pctx.strokeStyle = "rgba(232,163,61,0.35)";
    pctx.lineWidth = 1;
    pctx.setLineDash([1, 4]);
    pctx.stroke();
    pctx.setLineDash([]);
  }

  // PNR marker
  if (m.pnr_index < S.length) {
    const x = X(S[m.pnr_index].d);
    pctx.beginPath();
    pctx.moveTo(x, pad.t);
    pctx.lineTo(x, pad.t + h);
    pctx.strokeStyle = "rgba(226,87,76,0.9)";
    pctx.lineWidth = 1;
    pctx.setLineDash([2, 3]);
    pctx.stroke();
    pctx.setLineDash([]);
  }

  pctx.font = "10px ui-monospace, monospace";
  pctx.textAlign = "right";
  pctx.textBaseline = "middle";
  pctx.fillStyle = "rgba(78,205,196,0.9)";
  pctx.fillText(`${Math.round(zMax)} m`, pad.l - 6, pad.t + 4);
  pctx.fillText(`${Math.round(zMin)} m`, pad.l - 6, pad.t + h - 4);

  pctx.textAlign = "left";
  pctx.fillStyle = "rgba(232,163,61,0.9)";
  pctx.fillText(`${tMax.toFixed(0)}°`, pad.l + w + 6, pad.t + 4);
  pctx.fillText(`${tMin.toFixed(0)}°`, pad.l + w + 6, pad.t + h - 4);

  pctx.textAlign = "left";
  pctx.fillStyle = "rgba(78,205,196,0.6)";
  pctx.fillText("elevation", pad.l, r.height - 4);
  const ew = pctx.measureText("elevation").width;
  pctx.fillStyle = "rgba(232,163,61,0.7)";
  pctx.fillText("temperature", pad.l + ew + 14, r.height - 4);
  pctx.textAlign = "right";
  pctx.fillText(`${fmtDist(totalD)}`, pad.l + w, r.height - 4);
}

// ---------------------------------------------------------------- input

function hitMarker(clientX, clientY) {
  const [wx, wy] = toWorld(clientX, clientY);
  const tol = 14 / state.view.scale;
  for (const [name, pt] of [["a", state.A], ["b", state.B]]) {
    if (pt && Math.hypot(pt.x - wx, pt.y - wy) < tol) return name;
  }
  return null;
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const hit = hitMarker(e.clientX, e.clientY);
  if (hit) {
    state.drag = { mode: hit };
    state.active = hit;
    markActive();
  } else {
    state.drag = { mode: "pan", sx: e.clientX, sy: e.clientY, tx: state.view.tx, ty: state.view.ty, moved: false };
  }
});

canvas.addEventListener("pointermove", (e) => {
  const [wx, wy] = toWorld(e.clientX, e.clientY);
  if (wx >= 0 && wy >= 0 && wx < state.W && wy < state.H) {
    const [lon, lat] = worldToLonLat(wx, wy);
    $("coords").textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°  ·  ${Math.round(state.elev[(Math.round(wy) * state.W) + Math.round(wx)] ?? 0)} m`;
  }

  const d = state.drag;
  if (!d) return;

  if (d.mode === "pan") {
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    state.view.tx = d.tx + dx;
    state.view.ty = d.ty + dy;
    draw();
  } else if (d.mode === "a" || d.mode === "b") {
    const pt = d.mode === "a" ? state.A : state.B;
    pt.x = clamp(wx, 0, state.W - 1);
    pt.y = clamp(wy, 0, state.H - 1);
    draw();
  }
});

canvas.addEventListener("pointerup", (e) => {
  const d = state.drag;
  state.drag = null;
  if (!d) return;

  if (d.mode === "a" || d.mode === "b") {
    route();
    return;
  }
  if (d.mode === "pan" && !d.moved) {
    // click on empty ground: place the armed endpoint
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    if (wx < 0 || wy < 0 || wx >= state.W || wy >= state.H) return;
    const pt = state.active === "a" ? state.A : state.B;
    pt.x = wx; pt.y = wy;
    route();
  }
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;
  const wx = (mx - state.view.tx) / state.view.scale;
  const wy = (my - state.view.ty) / state.view.scale;
  const factor = Math.exp(-e.deltaY * 0.0016);
  const min = state.view.fit * 0.7;
  const max = 14;
  state.view.scale = clamp(state.view.scale * factor, min, max);
  state.view.tx = mx - wx * state.view.scale;
  state.view.ty = my - wy * state.view.scale;
  draw();
}, { passive: false });

// ---------------------------------------------------------------- UI wiring

function markActive() {
  $("set-a").classList.toggle("on", state.active === "a");
  $("set-b").classList.toggle("on", state.active === "b");
  $("hint").textContent =
    state.active === "a" ? "PLACE A" : "PLACE B";
}

$("set-a").addEventListener("click", () => { state.active = "a"; markActive(); });
$("set-b").addEventListener("click", () => { state.active = "b"; markActive(); });
$("swap").addEventListener("click", () => {
  const t = state.A; state.A = state.B; state.B = t; route();
});
$("fit").addEventListener("click", fitView);
$("budget").addEventListener("input", () => {
  $("budget-val").textContent = `${$("budget").value} min`;
  route();
});
$("sep").addEventListener("change", updateStats);

for (const [id, key] of [
  ["lyr-terrain", "terrain"], ["lyr-thermal", "thermal"], ["lyr-temp", "temp"],
  ["lyr-hazard", "hazard"], ["lyr-route", "route"],
]) {
  $(id).addEventListener("change", (e) => {
    state.layers[key] = e.target.checked;
    if (key === "temp") {
      $("tleg").hidden = !e.target.checked;
      const t = state.meta.temperature;
      $("tleg-rng").textContent = `${t.min_c.toFixed(0)} °C  →  ${t.max_c.toFixed(0)} °C`;
    }
    if (key === "thermal") $("thleg").hidden = !e.target.checked;
    draw();
  });
}

window.addEventListener("resize", resize);

// ---------------------------------------------------------------- start

markActive();
$("budget-val").textContent = `${$("budget").value} min`;
boot().catch((err) => {
  document.body.innerHTML =
    `<pre style="color:#e2574c;padding:24px;font:13px ui-monospace">A.R.E.S failed to load: ${err.message}\n\nServe the project root over HTTP:\n  python3 -m http.server 8000\n  open http://localhost:8000/web/</pre>`;
});

(() => {
  "use strict";

  const canvas = document.querySelector("#map");
  const ctx = canvas.getContext("2d");
  const toggle = document.querySelector(".motion-toggle");
  const legend = document.querySelector(".legend");
  const keepClear = [...document.querySelectorAll(".map-note, .version-switch")];
  const zoomControls = document.querySelector(".zoom-controls");
  const zoomIn = document.querySelector(".zoom-in"), zoomOut = document.querySelector(".zoom-out");
  if (!ctx) return;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const params = new URLSearchParams(location.search);
  const debug = params.has("debug"), testing = debug || params.has("test");
  // The map opens close up; visitors can zoom out as far as the wide view and back.
  const ZOOM_MIN = .46, ZOOM_MAX = 1;
  const zoomParam = params.get("zoom") || document.documentElement.dataset.zoom;
  const zoomStart = { nah: ZOOM_MAX, weit: ZOOM_MIN }[zoomParam] || Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parseFloat(zoomParam) || ZOOM_MAX));

  // Isometric projection: plan units (gx ↘, gy ↙) to projected units (x →, y ↓, z ↑).
  const C = Math.cos(Math.PI / 6), S = .5, Z = .86, R2 = Math.SQRT2;
  const project = (gx, gy, z = 0) => [(gx - gy) * C, (gx + gy) * S - z * Z];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  const INK = "#080b0b";
  const FACE = { top: "#2a3230", left: "#1c2221", right: "#121716", edge: "rgba(236, 237, 218, .16)" };
  const FILLER_FACE = { top: "#1d2422", left: "#151a19", right: "#0e1211" };

  // Stations and routes are written in screen-grid coordinates: a runs →, b runs ↓.
  const P = (a, b) => [(a + b) / 2, (b - a) / 2];

  // Laid out like a city metro: an event ring around the platform core, lines radiating out
  // to their own termini. A station sits on every line it really uses.
  const LINES = [
    { id: "api", label: "API · REST", color: "#ff6035", glow: "#ffb899" },
    { id: "ring", label: "Event-Ring · Kafka", color: "#e8e5cf", glow: "#fffdf0", rail: true, loop: true },
    { id: "data", label: "Datenbanken", color: "#c99d46", glow: "#f4d996" },
    { id: "auth", label: "Auth · OIDC", color: "#c07585", glow: "#f3bcc7" },
    { id: "ml", label: "KI · ML", color: "#9a83c4", glow: "#d4c6ee" },
    { id: "security", label: "Sicherheit", color: "#6f8fb6", glow: "#bcd0ea" },
    { id: "finance", label: "Finanzen", color: "#b98257", glow: "#ecc49f" },
    { id: "hr", label: "Personal", color: "#9a5f86", glow: "#dcaacb" },
    { id: "build", label: "CI/CD", color: "#86a47f", glow: "#cde8c5" },
    { id: "logistics", label: "Logistik", color: "#b5574a", glow: "#eca296" },
    { id: "iot", label: "IoT", color: "#3f9b92", glow: "#a3e2d8" },
  ];

  const STATIONS = [
    // Platform core inside the ring.
    { id: "gw", at: P(0, -8), kind: "gate", name: "API-Gateway", tag: "REST · GraphQL", tol: 1.3 },
    { id: "sso", at: P(-4, -12), kind: "tool", name: "SSO", tag: "OpenID Connect" },
    { id: "inference", at: P(4, -12), kind: "box", h: .6, name: "Inferenz-API", tag: "REST", minor: true },
    { id: "vault", at: P(3, -16), kind: "tool", name: "Vault", tag: "Secrets", minor: true },
    { id: "mssql", at: P(1, 1), kind: "db", h: 1.4, name: "MS SQL", tag: ":1433" },
    { id: "pg", at: P(9, -7), kind: "db", h: 1.2, name: "PostgreSQL", tag: ":5432" },
    { id: "datev", at: P(-3, 1), kind: "box", h: .5, name: "DATEV-Export", tag: "Buchungsstapel", minor: true },
    // Stations on the event ring: every domain publishes and consumes here.
    { id: "dwh", at: P(-3, -21), kind: "db", h: 1.6, r: .6, name: "Data Warehouse", tag: "Sternschema" },
    { id: "siem", at: P(3, -21), kind: "tower", h: 1.1, name: "SIEM", tag: "Alarme", minor: true },
    { id: "features", at: P(9, -17), kind: "box", h: .8, name: "Feature Store", tag: "Merkmale", minor: true },
    { id: "crm", at: P(13, -11), kind: "tower", h: 1.8, name: "CRM", tag: "Kontakte" },
    { id: "edge", at: P(13, -5), kind: "box", h: .5, name: "Edge-Gateway", tag: "OPC UA", minor: true },
    { id: "shop", at: P(9, 1), kind: "tower", h: 1.5, name: "Shop", tag: "Bestellungen" },
    { id: "warehouse", at: P(3, 5), kind: "tower", h: 1.2, f: [.6, .5], name: "Lager", tag: "WMS", minor: true },
    { id: "erp", at: P(-3, 5), kind: "tower", h: 2.6, f: [.55, .5], name: "ERP", tag: "Aufträge · Rechnungen" },
    { id: "ledger", at: P(-9, 1), kind: "tower", h: 1.3, name: "Buchhaltung", tag: "Hauptbuch" },
    { id: "push", at: P(-15, -8), kind: "box", h: .6, name: "Push-Dienst", tag: "WebSocket", minor: true },
    { id: "hris", at: P(-9, -17), kind: "tower", h: 1.4, name: "HR-System", tag: "Personalakte" },
    // Clients and partners.
    { id: "web", at: P(-21, -8), kind: "tower", h: 1.1, f: [.45, .45], name: "Web-App", tag: "SPA" },
    { id: "mobile", at: P(-29, -8), kind: "tower", h: 1.3, f: [.26, .44], name: "Mobile App", tag: "iOS · Android" },
    { id: "partner", at: P(15, 7), kind: "box", h: .7, name: "Partner-API", tag: "B2B", minor: true },
    // Outer stations of the domain lines.
    { id: "ad", at: P(-15, -23), kind: "tool", name: "Active Directory", tag: "LDAP", minor: true },
    { id: "payroll", at: P(-9, -23), kind: "box", h: .7, name: "Lohnabrechnung", tag: "Entgelt", minor: true },
    { id: "jobs", at: P(-9, -29), kind: "tower", h: 1, name: "Bewerberportal", tag: "Stellen", minor: true },
    { id: "firewall", at: P(3, -27), kind: "box", h: .7, f: [.55, .3], name: "Firewall", tag: "Regelwerk", minor: true },
    { id: "waf", at: P(3, -33), kind: "box", h: .5, name: "WAF", tag: "Layer 7", minor: true },
    { id: "training", at: P(14, -22), kind: "tower", h: 1.6, name: "Training", tag: "GPU-Cluster", minor: true },
    { id: "lake", at: P(20, -28), kind: "db", h: .9, r: .7, name: "Data Lake", tag: "Parquet", minor: true },
    { id: "backup", at: P(-9, 11), kind: "db", h: .8, r: .5, name: "Backup", tag: "3-2-1", minor: true },
    { id: "payments", at: P(-14, 6), kind: "box", h: .6, name: "Zahlungsverkehr", tag: "SEPA", minor: true },
    { id: "bank", at: P(-19, 11), kind: "tower", h: 1.8, name: "Bank", tag: "EBICS", minor: true },
    { id: "k8s", at: P(-19, -3), kind: "tool", name: "Kubernetes", tag: "Cluster" },
    { id: "registry", at: P(-25, 3), kind: "tool", name: "Registry", tag: "Container-Images", minor: true },
    { id: "pipeline", at: P(-31, 9), kind: "tool", name: "Pipeline", tag: "Build 412", minor: true },
    { id: "git", at: P(-37, 15), kind: "tool", name: "Git", tag: "main", minor: true },
    { id: "carrier", at: P(7, 9), kind: "box", h: .6, name: "Spedition", tag: "Lieferavis", minor: true },
    { id: "tracking", at: P(11, 13), kind: "tool", name: "Sendungsverfolgung", tag: "Status", minor: true },
    { id: "mqtt", at: P(19, -5), kind: "tool", name: "MQTT-Broker", tag: ":1883", minor: true },
    { id: "sensors", at: P(27, -5), kind: "tool", name: "Sensoren", tag: "Messwerte", minor: true },
  ];

  // Routes list stations or points in order; a line ends at its last station unless it runs on.
  const ROUTES = {
    api: [P(-60, -8), "mobile", "web", "push", "gw", "shop", "partner", P(40, 32)],
    // Not a perfect octagon: the west side bulges out and kinks back, like a ring grown around old tracks.
    ring: [P(-1, -21), P(5, -21), P(13, -13), P(13, -3), P(5, 5), P(-5, 5), P(-15, -5), P(-15, -11), P(-13, -13), P(-5, -21), P(-1, -21)],
    data: [P(-20, 22), "backup", "erp", "mssql", "pg", "crm"],
    auth: [P(-40, -48), "ad", "hris", "sso", "gw"],
    ml: ["gw", "inference", "features", "training", "lake", P(40, -48)],
    security: ["vault", "siem", "firewall", "waf", P(3, -60)],
    finance: [P(-40, 32), "bank", "payments", "ledger", "datev"],
    hr: ["hris", "payroll", "jobs", P(-9, -60)],
    build: [P(-60, 38), "git", "pipeline", "registry", "k8s"],
    logistics: ["warehouse", "carrier", "tracking", P(40, 42)],
    iot: ["edge", "mqtt", "sensors", P(60, -5)],
  };

  // Ground lettering: x runs ↘, y runs ↗, h runs flat across the screen.
  const DISTRICTS = [
    { name: "PLATTFORM", at: P(-8, -2.6), axis: "h" },
    { name: "CLIENTS", at: P(-31, -6.2), axis: "h" },
    { name: "BETRIEB", at: P(-29, -1), axis: "h" },
    { name: "FINANZEN", at: P(-25, 9.6), axis: "h" },
    { name: "SICHERHEIT", at: P(5, -31), axis: "h" },
    { name: "PERSONAL", at: P(-7, -27), axis: "h" },
    { name: "KI · ML", at: P(16, -19.6), axis: "h" },
    { name: "IOT", at: P(19, -3.2), axis: "h" },
    { name: "LOGISTIK", at: P(13, 10.4), axis: "h" },
  ];

  // ---------- Network geometry ----------
  const byId = Object.fromEntries(STATIONS.map(st => [st.id, st]));

  function route(spec) {
    const pts = [];
    for (const item of spec) {
      let mode = "x", target = item;
      if (typeof item === "string") {
        const parts = item.split(":");
        if (parts.length > 1) mode = parts[0];
        target = byId[parts[parts.length - 1]].at;
      }
      if (pts.length) {
        const [x0, y0] = pts[pts.length - 1], [x1, y1] = target;
        const dx = x1 - x0, dy = y1 - y0;
        if (dx && dy && Math.abs(dx) !== Math.abs(dy)) pts.push(mode === "y" ? [x0, y1] : [x1, y0]);
      }
      pts.push(target.slice());
    }
    const clean = [];
    for (const p of pts) {
      const n = clean.length;
      if (n && clean[n - 1][0] === p[0] && clean[n - 1][1] === p[1]) continue;
      if (n >= 2) {
        const a = clean[n - 2], b = clean[n - 1];
        const cross = (b[0] - a[0]) * (p[1] - b[1]) - (b[1] - a[1]) * (p[0] - b[0]);
        const dot = (b[0] - a[0]) * (p[0] - b[0]) + (b[1] - a[1]) * (p[1] - b[1]);
        if (cross === 0 && dot > 0) clean.pop();
      }
      clean.push(p);
    }
    return clean;
  }

  function smooth(points, lane) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0 || i === points.length - 1) { out.push(p); continue; }
      const a = points[i - 1], b = points[i + 1];
      const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]), l2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const r = Math.min(1.1, l1 * .5, l2 * .5);
      const q0 = [p[0] - (p[0] - a[0]) / l1 * r, p[1] - (p[1] - a[1]) / l1 * r];
      const q2 = [p[0] + (b[0] - p[0]) / l2 * r, p[1] + (b[1] - p[1]) / l2 * r];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10, m = 1 - t;
        out.push([m * m * q0[0] + 2 * m * t * p[0] + t * t * q2[0], m * m * q0[1] + 2 * m * t * p[1] + t * t * q2[1]]);
      }
    }
    if (!lane) return out;
    return out.map((p, i) => {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      return [p[0] - ty / l * lane, p[1] + tx / l * lane];
    });
  }

  const lines = LINES.map((def, index) => {
    const plan = smooth(route(ROUTES[def.id]), def.lane);
    const cum = [0];
    for (let i = 1; i < plan.length; i++) cum.push(cum[i - 1] + Math.hypot(plan[i][0] - plan[i - 1][0], plan[i][1] - plan[i - 1][1]));
    return { ...def, index, plan, pts: plan.map(([x, y]) => project(x, y)), cum, length: cum[cum.length - 1], stops: [], vis: 1, boost: 0, range: [0, 0] };
  });

  for (const st of STATIONS) {
    st.lines = []; st.pulse = 0; st.pulseColor = "#fff"; st.vis = 1; st.appear = 0;
  }
  const INTRO_DELAY = .35, INTRO_STEP = .08, INTRO_DURATION = 2.4;
  for (const line of lines) {
    for (const st of STATIONS) {
      let best = Infinity, bestS = 0;
      for (let i = 1; i < line.plan.length; i++) {
        const [ax, ay] = line.plan[i - 1], [bx, by] = line.plan[i];
        const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
        const t = clamp(((st.at[0] - ax) * vx + (st.at[1] - ay) * vy) / l2, 0, 1);
        const d = Math.hypot(ax + vx * t - st.at[0], ay + vy * t - st.at[1]);
        if (d < best) { best = d; bestS = line.cum[i - 1] + t * Math.sqrt(l2); }
      }
      if (best <= (st.tol || .5)) { line.stops.push({ st, s: bestS }); st.lines.push(line); }
    }
    line.stops.sort((a, b) => a.s - b.s);
    // Each line grows outward from its stop nearest the gateway.
    let hub = { d: Infinity, s: line.length / 2 };
    for (const stop of line.stops) {
      const d = Math.hypot(stop.st.at[0], stop.st.at[1]);
      if (d < hub.d) hub = { d, s: stop.s };
    }
    line.origin = hub.s;
    line.reach = Math.max(line.origin, line.length - line.origin);
    line.start = INTRO_DELAY + line.index * INTRO_STEP;
  }

  const appearAt = (line, s) => {
    const q = clamp(Math.abs(s - line.origin) / line.reach, 0, 1);
    return line.start + (1 - Math.cbrt(1 - q)) * INTRO_DURATION;
  };

  for (const st of STATIONS) {
    const main = st.lines[0];
    st.accent = main ? main.color : "#ff6035";
    st.glow = main ? main.glow : "#ffb899";
    const times = st.lines.map(line => appearAt(line, line.stops.find(stop => stop.st === st).s));
    st.appear = times.length ? Math.min(...times) : 1;
    const [fx, fy] = st.f || [.48, .42];
    const shapes = {
      gate: { half: 1.15 * 2 * C, top: 1.76 },
      stack: { half: 1.22 * C, top: .76 },
      box: { half: (fx + fy) * C, top: st.h || .7 },
      tower: { half: (fx + fy) * C, top: st.h || 1.6 },
      tool: { half: .68 * C, top: .72 },
      bars: { half: 1.35 * C, top: 1.1 },
      db: { half: (st.r || .5) * C * R2, top: st.h || 1 },
    };
    Object.assign(st, shapes[st.kind]);
  }

  // Unlabelled blocks fill the empty plots between the lines, like the city around a metro map.
  const FILLERS = [];
  const distanceToLine = (line, x, y) => {
    let best = Infinity;
    for (let i = 1; i < line.plan.length; i++) {
      const [ax, ay] = line.plan[i - 1], [bx, by] = line.plan[i];
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      const t = clamp(((x - ax) * vx + (y - ay) * vy) / l2, 0, 1);
      best = Math.min(best, Math.hypot(ax + vx * t - x, ay + vy * t - y));
    }
    return best;
  };
  for (let gx = -72; gx <= 50; gx++) {
    for (let gy = -72; gy <= 50; gy++) {
      const a = gx - gy, b = gx + gy, n = gx * 91 + gy * 37;
      if (b < -64 || b > 16 || Math.abs(a) > 86 || hash(n) > .18) continue;
      if (STATIONS.some(st => Math.hypot(st.at[0] - gx, st.at[1] - gy) < 1.7)) continue;
      if (FILLERS.some(f => Math.hypot(f.at[0] - gx, f.at[1] - gy) < 1.2)) continue;
      if (lines.some(line => distanceToLine(line, gx, gy) < 1)) continue;
      FILLERS.push({
        kind: "filler", at: [gx, gy], vis: 1, lit: hash(n + 5) > .55,
        f: [.2 + hash(n + 1) * .22, .2 + hash(n + 2) * .22],
        h: .2 + Math.pow(hash(n + 3), 2) * 1.5,
        appear: .9 + Math.hypot(gx, gy) * .055,
      });
    }
  }
  const depthSorted = [...STATIONS, ...FILLERS].sort((a, b) => (a.at[0] + a.at[1]) - (b.at[0] + b.at[1]));
  const labelOrder = [...STATIONS].sort((a, b) => (a.minor ? 1 : 0) - (b.minor ? 1 : 0));

  if (testing) {
    // Flags lines that brush past a station they do not serve, and stations crowding each other.
    for (const st of STATIONS) {
      for (const line of lines) {
        if (st.lines.includes(line)) continue;
        const d = distanceToLine(line, st.at[0], st.at[1]);
        if (d < 1.5) console.warn(`near miss: ${line.id} passes ${st.id} at ${d.toFixed(2)}`);
      }
      for (const other of STATIONS) {
        const d = Math.hypot(st.at[0] - other.at[0], st.at[1] - other.at[1]);
        if (st.id < other.id && d < 2.2) console.warn(`crowded: ${st.id} and ${other.id} at ${d.toFixed(2)}`);
      }
      if (!st.lines.length) console.warn(`orphan: ${st.id}`);
    }
  }

  // ---------- Packets ----------
  const packets = [];
  let seed = 1;
  for (const line of lines) {
    const count = Math.max(2, Math.round(line.length / (line.rail ? 26 : 12)));
    for (let k = 0; k < count; k++) {
      packets.push({
        line,
        s: (k + hash(seed++) * .6) / count * line.length,
        dir: line.rail || k % 2 === 0 ? 1 : -1,
        speed: line.rail ? 3.2 : 1.9 + hash(seed++) * 1.4,
      });
    }
  }

  const sprites = {};
  for (const line of lines) {
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const g = sprite.getContext("2d");
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, .95)");
    gradient.addColorStop(.18, line.glow);
    gradient.addColorStop(.42, line.color + "55");
    gradient.addColorStop(1, line.color + "00");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
    sprites[line.id] = sprite;
  }

  // ---------- State ----------
  const ground = document.createElement("canvas");
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, cx: -1, cy: -1 };
  let w = 0, h = 0, u = 40, lw = 4, dpr = 1, margin = 60, quality = 1;
  let focal = [0, 0], cam = [0, 0];
  let paused = reducedMotion.matches, intro = paused ? 99 : 0, drift = 0;
  let frame = 0, last = 0, slow = 0;
  let hovered = null, hoverLine = null, pinnedLine = null;
  let view = [0, 0, 0, 0], reserved = [];
  let zoom = zoomStart, zoomTarget = zoomStart, base = 40;

  function layout() {
    w = innerWidth; h = innerHeight;
    const small = w <= 600;
    base = Math.hypot(w, h) / (small ? 58 : 54);
    // Desktop: the network sits upper right, clear of the wordmark on the left.
    focal = small ? [w * .5, h * .34] : [w * .62, h * .47];
    // Sized for the closest zoom so zooming only redraws the ground, never reallocates it.
    margin = Math.ceil(clamp(base * ZOOM_MAX, 9, 52) * 1.1 + 28);
    dpr = Math.min(devicePixelRatio || 1, 2) * quality;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ground.width = Math.ceil((w + margin * 2) * dpr);
    ground.height = Math.ceil((h + margin * 2) * dpr);
    reserved = keepClear.map(el => {
      const r = el.getBoundingClientRect();
      return { x0: r.left - 8, x1: r.right + 8, y0: r.top - 8, y1: r.bottom + 8 };
    });
    scale();
  }

  function scale() {
    u = clamp(base * zoom, 9, 52);
    lw = clamp(u * .1, 1.6, 4.6);
    buildGround();
  }

  function setZoom(target) {
    zoomTarget = clamp(target, ZOOM_MIN, ZOOM_MAX);
    zoomOut.disabled = zoomTarget <= ZOOM_MIN + .001;
    zoomIn.disabled = zoomTarget >= ZOOM_MAX - .001;
    if (paused || document.hidden) { zoom = zoomTarget; scale(); settle(1); render(); }
  }

  function buildGround() {
    const g = ground.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, ground.width, ground.height);
    const ox = focal[0] + margin, oy = focal[1] + margin;
    const toPlan = (x, y) => { const px = (x - ox) / u, py = (y - oy) / u; return [(px / C + py / S) / 2, (py / S - px / C) / 2]; };
    const corners = [toPlan(0, 0), toPlan(w + margin * 2, 0), toPlan(0, h + margin * 2), toPlan(w + margin * 2, h + margin * 2)];
    const gx0 = Math.floor(Math.min(...corners.map(c => c[0]))), gx1 = Math.ceil(Math.max(...corners.map(c => c[0])));
    const gy0 = Math.floor(Math.min(...corners.map(c => c[1]))), gy1 = Math.ceil(Math.max(...corners.map(c => c[1])));

    g.setTransform(dpr * u, 0, 0, dpr * u, dpr * ox, dpr * oy);
    g.lineWidth = 1 / u;
    for (const major of [false, true]) {
      g.beginPath();
      for (let k = gx0; k <= gx1; k++) {
        if ((k % 5 === 0) !== major) continue;
        g.moveTo(...project(k, gy0)); g.lineTo(...project(k, gy1));
      }
      for (let k = gy0; k <= gy1; k++) {
        if ((k % 5 === 0) !== major) continue;
        g.moveTo(...project(gx0, k)); g.lineTo(...project(gx1, k));
      }
      g.strokeStyle = major ? "rgba(196, 208, 186, .075)" : "rgba(196, 208, 186, .038)";
      g.stroke();
    }
    g.fillStyle = "rgba(196, 208, 186, .16)";
    for (let x = Math.ceil(gx0 / 5) * 5; x <= gx1; x += 5) {
      for (let y = Math.ceil(gy0 / 5) * 5; y <= gy1; y += 5) {
        const [px, py] = project(x, y);
        g.fillRect(px - 1.5 / u, py - .5 / u, 3 / u, 1 / u);
        g.fillRect(px - .5 / u, py - 1.5 / u, 1 / u, 3 / u);
      }
    }

    for (const district of DISTRICTS) {
      const [px, py] = project(...district.at);
      const k = dpr * u * .028, x = dpr * (ox + px * u), y = dpr * (oy + py * u);
      if (district.axis === "y") g.setTransform(C * k, -S * k, C * k, S * k, x, y);
      else if (district.axis === "h") g.setTransform(C * R2 * k, 0, 0, S * R2 * k, x, y);
      else g.setTransform(C * k, S * k, -C * k, S * k, x, y);
      g.font = '600 20px "Segoe UI", system-ui, sans-serif';
      if ("letterSpacing" in g) g.letterSpacing = "7px";
      g.fillStyle = "rgba(196, 208, 186, .15)";
      g.fillText(district.name, 0, 0);
      if ("letterSpacing" in g) g.letterSpacing = "0px";
    }

    if (debug) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.font = "8px Consolas, monospace";
      g.fillStyle = "rgba(255, 255, 255, .35)";
      for (let x = gx0; x <= gx1; x++) {
        for (let y = gy0; y <= gy1; y++) {
          if ((x + y) % 2) continue;
          const [px, py] = project(x, y);
          g.fillText(`${x},${y}`, ox + px * u + 2, oy + py * u - 2);
        }
      }
    }
  }

  // ---------- Drawing ----------
  function pointAt(line, s) {
    const c = line.cum;
    s = clamp(s, 0, line.length);
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= s) lo = mid; else hi = mid; }
    const t = (s - c[lo]) / ((c[hi] - c[lo]) || 1);
    return [lerp(line.pts[lo][0], line.pts[hi][0], t), lerp(line.pts[lo][1], line.pts[hi][1], t), lo, hi];
  }

  function trace(line, s0, s1) {
    const a = pointAt(line, s0), b = pointAt(line, s1);
    ctx.moveTo(a[0], a[1]);
    for (let i = a[3]; i <= b[2]; i++) ctx.lineTo(line.pts[i][0], line.pts[i][1]);
    ctx.lineTo(b[0], b[1]);
  }

  function updateRanges() {
    for (const line of lines) {
      const r = line.reach * easeOut((intro - line.start) / INTRO_DURATION);
      line.range = [Math.max(0, line.origin - r), Math.min(line.length, line.origin + r)];
    }
  }

  function drawLines() {
    const px = 1 / u;
    ctx.lineJoin = "round";
    for (const line of lines) {
      const [a, b] = line.range;
      if (b - a < .01) continue;
      const width = lw * (1 + line.boost * .35);
      ctx.globalAlpha = line.vis;
      ctx.lineCap = "round";
      ctx.beginPath();
      trace(line, a, b);
      ctx.strokeStyle = INK;
      ctx.lineWidth = (width + 3) * px;
      ctx.stroke();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = width * px;
      ctx.stroke();
      if (line.rail) {
        ctx.lineCap = "butt";
        ctx.setLineDash([.16, .3]);
        ctx.strokeStyle = INK;
        ctx.lineWidth = width * .48 * px;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;
  }

  const TRAIL = [.05, .12, .26, .55];
  function drawPackets() {
    const px = 1 / u;
    ctx.lineCap = "round";
    for (const p of packets) {
      const line = p.line;
      if (line.vis < .4) continue;
      const [a, b] = line.range;
      const length = line.rail ? 1.5 : 2.4;
      const head = p.s, tail = head - p.dir * length;
      const lo = Math.max(a, Math.min(head, tail)), hi = Math.min(b, Math.max(head, tail));
      if (hi <= lo) continue;
      const [hx, hy] = pointAt(line, head);
      if (hx < view[0] || hx > view[2] || hy < view[1] || hy > view[3]) continue;
      ctx.globalCompositeOperation = "lighter";
      if (line.rail) {
        ctx.globalAlpha = .9 * line.vis;
        ctx.beginPath(); trace(line, lo, hi);
        ctx.strokeStyle = line.glow; ctx.lineWidth = lw * .62 * px; ctx.stroke();
      } else {
        for (let k = 0; k < 4; k++) {
          const s0 = clamp(lerp(tail, head, k / 4), lo, hi), s1 = clamp(lerp(tail, head, (k + 1) / 4), lo, hi);
          if (Math.abs(s1 - s0) < .01) continue;
          ctx.globalAlpha = TRAIL[k] * line.vis;
          ctx.beginPath(); trace(line, Math.min(s0, s1), Math.max(s0, s1));
          ctx.strokeStyle = line.glow; ctx.lineWidth = lw * .78 * px; ctx.stroke();
        }
      }
      if (head >= a && head <= b) {
        const x = hx, y = hy;
        const size = lw * (line.rail ? 4.5 : 6.5) * px * (1 + line.boost * .3);
        ctx.globalAlpha = line.vis;
        ctx.drawImage(sprites[line.id], x - size / 2, y - size / 2, size, size);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  function ellipse(gx, gy, z, r) {
    const [x, y] = project(gx, gy, z);
    ctx.beginPath();
    ctx.ellipse(x, y, r * C * R2, r * S * R2, 0, 0, Math.PI * 2);
  }

  function drawRings() {
    for (const st of STATIONS) {
      if (st.pulse < .02 || st.vis < .4) continue;
      ellipse(st.at[0], st.at[1], 0, 1 + (1 - st.pulse) * 1.6);
      ctx.globalAlpha = st.pulse * .55 * st.vis;
      ctx.strokeStyle = st.pulseColor;
      ctx.lineWidth = 1.4 / u;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function poly(points, fill) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function block(gx, gy, fx, fy, z0, height, faces = FACE) {
    const A = project(gx - fx, gy + fy, z0), B = project(gx + fx, gy + fy, z0), Cr = project(gx + fx, gy - fy, z0);
    const z1 = z0 + height;
    const At = project(gx - fx, gy + fy, z1), Bt = project(gx + fx, gy + fy, z1);
    const Ct = project(gx + fx, gy - fy, z1), Dt = project(gx - fx, gy - fy, z1);
    poly([A, B, Bt, At], faces.left);
    poly([B, Cr, Ct, Bt], faces.right);
    poly([At, Bt, Ct, Dt], faces.top);
    ctx.strokeStyle = FACE.edge;
    ctx.lineWidth = 1 / u;
    ctx.beginPath();
    ctx.moveTo(...Dt); ctx.lineTo(...At); ctx.lineTo(...Bt); ctx.lineTo(...Ct); ctx.closePath();
    ctx.moveTo(...Bt); ctx.lineTo(...B);
    ctx.stroke();
  }

  function floors(st, fx, fy, z0, height) {
    const [gx, gy] = st.at;
    ctx.strokeStyle = st.accent;
    ctx.lineWidth = 1.3 / u;
    let n = 0;
    for (let z = z0 + .24; z < z0 + height - .12; z += .26) {
      n++;
      if (hash(gx * 13 + gy * 7 + n) < .3) continue;
      ctx.globalAlpha = (.28 + .3 * hash(n + gx)) * st.vis;
      ctx.beginPath();
      ctx.moveTo(...project(gx - fx + .07, gy + fy, z)); ctx.lineTo(...project(gx + fx - .07, gy + fy, z));
      ctx.moveTo(...project(gx + fx, gy + fy - .07, z)); ctx.lineTo(...project(gx + fx, gy - fy + .07, z));
      ctx.stroke();
    }
    ctx.globalAlpha = st.vis;
  }

  function topRing(st, z, r) {
    ellipse(st.at[0], st.at[1], z, r);
    if (st.pulse > .02) {
      ctx.globalAlpha = st.pulse * st.vis;
      ctx.fillStyle = st.pulseColor;
      ctx.fill();
      ctx.globalAlpha = st.vis;
    }
    ctx.strokeStyle = st.accent;
    ctx.lineWidth = 2 / u;
    ctx.stroke();
  }

  function plate(st) {
    ellipse(st.at[0], st.at[1], 0, .92);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.strokeStyle = "rgba(232, 229, 207, .8)";
    ctx.lineWidth = 1.6 / u;
    ctx.stroke();
  }

  const KINDS = {
    gate(st, k) {
      const [gx, gy] = st.at;
      block(gx, gy, 1.15, 1.15, 0, .26);
      ctx.strokeStyle = "rgba(232, 229, 207, .75)";
      ctx.lineWidth = 1.4 / u;
      ctx.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
        const p = project(gx + sx * .98, gy + sy * .98, .26);
        i ? ctx.lineTo(...p) : ctx.moveTo(...p);
      });
      ctx.closePath();
      ctx.stroke();
      const height = 1.5 * k;
      block(gx, gy, .52, .52, .26, height);
      floors(st, .52, .52, .26, height);
      topRing(st, .26 + height, .36);
    },
    stack(st, k) {
      const [gx, gy] = st.at;
      for (let i = 0; i < 3; i++) {
        block(gx, gy, .72, .5, i * .3 * k, .16);
        ctx.strokeStyle = st.accent;
        ctx.globalAlpha = .7 * st.vis;
        ctx.lineWidth = 1.4 / u;
        ctx.beginPath();
        ctx.moveTo(...project(gx - .72, gy + .5, i * .3 * k + .08)); ctx.lineTo(...project(gx + .72, gy + .5, i * .3 * k + .08));
        ctx.lineTo(...project(gx + .72, gy - .5, i * .3 * k + .08));
        ctx.stroke();
        ctx.globalAlpha = st.vis;
      }
      topRing(st, .6 * k + .16, .26);
    },
    box(st, k) {
      const [fx, fy] = st.f || [.48, .42];
      const height = (st.h || .7) * k;
      block(st.at[0], st.at[1], fx, fy, 0, height);
      topRing(st, height, .22);
    },
    tower(st, k) {
      const [fx, fy] = st.f || [.48, .42];
      const height = (st.h || 1.6) * k;
      block(st.at[0], st.at[1], fx, fy, 0, height);
      floors(st, fx, fy, 0, height);
      topRing(st, height, Math.min(fx, fy) * .6);
    },
    tool(st, k) {
      const [gx, gy] = st.at;
      const height = .72 * k;
      block(gx, gy, .34, .34, 0, height);
      const s = .17;
      ctx.beginPath();
      [[-s, -s], [s, -s], [s, s], [-s, s]].forEach(([dx, dy], i) => {
        const p = project(gx + dx, gy + dy, height);
        i ? ctx.lineTo(...p) : ctx.moveTo(...p);
      });
      ctx.closePath();
      ctx.fillStyle = st.pulse > .02 ? st.pulseColor : st.accent;
      ctx.globalAlpha = (.75 + .25 * st.pulse) * st.vis;
      ctx.fill();
      ctx.globalAlpha = st.vis;
    },
    bars(st, k) {
      const [gx, gy] = st.at;
      block(gx, gy, .8, .55, 0, .18);
      const tops = { top: st.accent, left: FACE.left, right: FACE.right };
      [[-.48, .45], [0, .9], [.48, .65]].forEach(([dx, bh], i) => {
        const height = bh * k;
        block(gx + dx, gy, .15, .15, .18, height, i === 1 ? tops : FACE);
      });
      if (st.pulse > .02) topRing(st, .18, .2);
    },
    db(st, k) {
      const [gx, gy] = st.at;
      const r = st.r || .5, height = (st.h || 1) * k;
      const [x, yb] = project(gx, gy, 0), yt = yb - height * Z;
      const rx = r * C * R2, ry = r * S * R2;
      const body = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
      body.addColorStop(0, "#232b29"); body.addColorStop(.45, "#1a201f"); body.addColorStop(1, "#0f1413");
      ctx.beginPath();
      ctx.moveTo(x - rx, yt); ctx.lineTo(x - rx, yb);
      ctx.ellipse(x, yb, rx, ry, 0, Math.PI, 0, true);
      ctx.lineTo(x + rx, yt);
      ctx.closePath();
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = st.accent;
      ctx.lineWidth = 1.3 / u;
      for (const f of [.3, .62]) {
        ctx.globalAlpha = .6 * st.vis;
        ctx.beginPath();
        ctx.ellipse(x, yb - height * f * Z, rx, ry, 0, Math.PI, 0, true);
        ctx.stroke();
      }
      ctx.globalAlpha = st.vis;
      ctx.beginPath();
      ctx.ellipse(x, yt, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = FACE.top;
      ctx.fill();
      ctx.strokeStyle = FACE.edge;
      ctx.lineWidth = 1 / u;
      ctx.stroke();
      topRing(st, height, r * .55);
    },
    filler(st, k) {
      const [gx, gy] = st.at, [fx, fy] = st.f, height = st.h * k;
      block(gx, gy, fx, fy, 0, height, FILLER_FACE);
      if (!st.lit || height < .5) return;
      ctx.strokeStyle = "#e8e5cf";
      ctx.lineWidth = 1 / u;
      ctx.globalAlpha = .1 * st.vis;
      ctx.beginPath();
      for (let z = .22; z < height - .1; z += .22) {
        ctx.moveTo(...project(gx - fx + .05, gy + fy, z)); ctx.lineTo(...project(gx + fx - .05, gy + fy, z));
        ctx.moveTo(...project(gx + fx, gy + fy - .05, z)); ctx.lineTo(...project(gx + fx, gy - fy + .05, z));
      }
      ctx.stroke();
      ctx.globalAlpha = st.vis;
    },
  };

  function drawStations(ox, oy) {
    for (const st of depthSorted) {
      const rise = easeOut((intro - st.appear) / .75);
      if (rise <= 0) continue;
      const [px, py] = project(st.at[0], st.at[1]);
      const x = ox + px * u, y = oy + py * u;
      if (x < -3 * u || x > w + 3 * u || y < -u || y > h + 4 * u) continue;
      ctx.globalAlpha = st.vis * Math.min(1, rise * 2.5);
      if (st.lines && st.lines.length > 1 && st.kind !== "gate") plate(st);
      KINDS[st.kind](st, Math.max(.05, rise));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "lighter";
    for (const st of STATIONS) {
      if (st.pulse < .05) continue;
      const [x, y] = project(st.at[0], st.at[1], st.top);
      const size = (1.2 + st.pulse * 1.4) * (st.kind === "gate" ? 1.4 : 1);
      ctx.globalAlpha = st.pulse * .7 * st.vis;
      ctx.drawImage(sprites[st.lines[0].id], x - size / 2, y - size / 2, size, size);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  function drawLabels(ox, oy) {
    const small = w <= 600, compact = u < 27;
    const nameSize = small ? 10 : compact ? 10 : 11.5, tagSize = small ? 8.5 : compact ? 8.5 : 9.5;
    ctx.lineJoin = "round";
    // Main stations claim their label space first; a label that fits nowhere is left out.
    const placed = [...reserved];
    const free = r => r.x0 >= 8 && r.x1 <= w - 8 && !placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
    for (const st of labelOrder) {
      if (small && st.minor) continue;
      const alpha = clamp((intro - st.appear - .35) / .6, 0, 1) * st.vis;
      if (alpha <= 0) continue;
      const [px, py] = project(st.at[0], st.at[1], st.top);
      const x = ox + px * u, y = oy + py * u;
      if (x < 0 || x > w || y < 50 || y > h + 40) continue;
      ctx.font = `${tagSize}px Consolas, "SFMono-Regular", monospace`;
      const tagWidth = small ? 0 : ctx.measureText(st.tag).width + 9;
      ctx.font = `600 ${nameSize}px "Segoe UI", system-ui, sans-serif`;
      const width = Math.max(ctx.measureText(st.name).width, tagWidth);
      const gap = st.half * u + 7;
      const box = side => {
        const x0 = side > 0 ? x + gap : x - gap - width;
        return { x0: x0 - 3, x1: x0 + width + 3, y0: y + 2 - nameSize, y1: small ? y + 6 : y + 15 + tagSize };
      };
      let side = 0;
      for (const s of x > w * .72 ? [-1, 1] : [1, -1]) {
        if (free(box(s))) { side = s; break; }
      }
      if (!side) continue;
      placed.push(box(side));
      const nx = x + side * gap;
      ctx.globalAlpha = alpha;
      ctx.textAlign = side > 0 ? "left" : "right";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(8, 11, 11, .9)";
      ctx.strokeText(st.name, nx, y + 3);
      ctx.fillStyle = "#ecedda";
      ctx.fillText(st.name, nx, y + 3);
      if (small) continue;
      ctx.font = `${tagSize}px Consolas, "SFMono-Regular", monospace`;
      const tw = ctx.measureText(st.tag).width, th = tagSize + 6;
      const tx = side > 0 ? nx : nx - tw - 9, ty = y + 8;
      ctx.fillStyle = "rgba(8, 11, 11, .82)";
      ctx.fillRect(tx, ty, tw + 9, th);
      ctx.globalAlpha = alpha * .75;
      ctx.strokeStyle = st.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx + .5, ty + .5, tw + 8, th - 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = st.glow;
      ctx.textAlign = "left";
      ctx.fillText(st.tag, tx + 4.5, ty + th - 4.5);
    }
    ctx.globalAlpha = 1;
  }

  function drawDebug(ox, oy) {
    ctx.font = "bold 10px Consolas, monospace";
    ctx.fillStyle = "#ff0";
    ctx.textAlign = "center";
    for (const st of STATIONS) {
      const [px, py] = project(st.at[0], st.at[1]);
      ctx.fillText(`${st.id} ${st.at}`, ox + px * u, oy + py * u + 16);
    }
  }

  function render() {
    updateRanges();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ox = focal[0] + cam[0], oy = focal[1] + cam[1];
    view = [-ox / u - 3, -oy / u - 3, (w - ox) / u + 3, (h - oy) / u + 3];
    ctx.globalAlpha = easeOut(intro / 1.1);
    ctx.drawImage(ground, (cam[0] - margin) * dpr, (cam[1] - margin) * dpr);
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr * u, 0, 0, dpr * u, dpr * ox, dpr * oy);
    drawLines();
    drawPackets();
    drawRings();
    drawStations(ox, oy);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLabels(ox, oy);
    if (debug) drawDebug(ox, oy);
  }

  // ---------- Simulation ----------
  function focusSet() {
    if (hovered) return new Set(hovered.lines);
    const id = hoverLine || pinnedLine;
    return id ? new Set(lines.filter(line => line.id === id)) : null;
  }

  function settle(t) {
    const focus = focusSet();
    for (const line of lines) {
      line.vis = lerp(line.vis, !focus || focus.has(line) ? 1 : .16, t);
      line.boost = lerp(line.boost, focus && focus.has(line) ? 1 : 0, t);
    }
    for (const st of STATIONS) {
      const on = !focus || st === hovered || st.lines.some(line => focus.has(line));
      st.vis = lerp(st.vis, on ? 1 : .28, t);
    }
    for (const filler of FILLERS) filler.vis = lerp(filler.vis, focus ? .35 : 1, t);
  }

  function step(dt) {
    if (zoom !== zoomTarget) {
      zoom = Math.abs(zoomTarget - zoom) < .002 ? zoomTarget : lerp(zoom, zoomTarget, 1 - Math.exp(-dt * 8));
      scale();
    }
    intro += dt;
    drift += dt;
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
    cam = [Math.sin(drift * .061) * u * .7 - pointer.x * 16, Math.sin(drift * .047 + 1.3) * u * .4 - pointer.y * 10];
    settle(1 - Math.exp(-dt * 9));
    for (const st of STATIONS) st.pulse *= Math.exp(-dt * 2.1);
    if (intro < 1.4) return;
    for (const p of packets) {
      const line = p.line, before = p.s;
      p.s += p.dir * p.speed * dt;
      // The ring wraps around; every other line ends at a terminus, so packets turn back there.
      if (line.loop) {
        if (p.s > line.length) { p.s -= line.length; continue; }
        if (p.s < 0) { p.s += line.length; continue; }
      } else if (p.s > line.length || p.s < 0) {
        p.s = p.s > line.length ? 2 * line.length - p.s : -p.s;
        p.dir = -p.dir;
        continue;
      }
      const lo = Math.min(before, p.s), hi = Math.max(before, p.s);
      for (const stop of line.stops) {
        if (stop.s > lo && stop.s <= hi && stop.s >= line.range[0] && stop.s <= line.range[1]) {
          stop.st.pulse = 1;
          stop.st.pulseColor = line.glow;
        }
      }
    }
  }

  function animate(now) {
    frame = requestAnimationFrame(animate);
    const dt = last ? Math.min((now - last) / 1000, .1) : 1 / 60;
    last = now;
    step(dt);
    render();
    slow = dt > .028 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 50 && quality > .6) { quality *= .8; slow = 0; layout(); }
  }

  function schedule() {
    cancelAnimationFrame(frame);
    last = 0;
    if (!paused && !document.hidden) frame = requestAnimationFrame(animate);
    else { settle(1); render(); }
    toggle.setAttribute("aria-pressed", String(paused));
    const label = paused ? "Animation starten" : "Animation pausieren";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  }

  function refocus() { if (paused) { settle(1); render(); } }

  // ---------- Interaction ----------
  legend.innerHTML = lines.map(line =>
    `<li><button type="button" data-line="${line.id}" aria-pressed="false"${line.rail ? ' class="rail"' : ""} style="--c:${line.color}"><i aria-hidden="true"></i>${line.label}</button></li>`
  ).join("");
  legend.hidden = false;
  const buttons = [...legend.querySelectorAll("button")];
  for (const button of buttons) {
    const id = button.dataset.line;
    const enter = () => { hoverLine = id; refocus(); };
    const leave = () => { if (hoverLine === id) hoverLine = null; refocus(); };
    button.addEventListener("pointerenter", enter);
    button.addEventListener("pointerleave", leave);
    button.addEventListener("focus", enter);
    button.addEventListener("blur", leave);
    button.addEventListener("click", () => {
      pinnedLine = pinnedLine === id ? null : id;
      buttons.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.line === pinnedLine)));
      refocus();
    });
  }

  addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse") return;
    pointer.tx = event.clientX / w - .5;
    pointer.ty = event.clientY / h - .5;
    let next = null;
    if (!event.target.closest("button, a")) {
      const ox = focal[0] + cam[0], oy = focal[1] + cam[1];
      let best = Infinity;
      for (const st of STATIONS) {
        if (intro < st.appear + .5) continue;
        const [px, py] = project(st.at[0], st.at[1], st.top * .5);
        const d = Math.hypot(ox + px * u - event.clientX, oy + py * u - event.clientY);
        if (d < Math.max(18, st.half * u + 8) && d < best) { best = d; next = st; }
      }
    }
    if (next !== hovered) { hovered = next; refocus(); }
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    pointer.tx = pointer.ty = 0;
    if (hovered) { hovered = null; refocus(); }
  });

  zoomIn.addEventListener("click", () => setZoom(zoomTarget * 1.3));
  zoomOut.addEventListener("click", () => setZoom(zoomTarget / 1.3));
  addEventListener("wheel", event => {
    if (!event.ctrlKey) setZoom(zoomTarget * Math.exp(-event.deltaY * .0012));
  }, { passive: true });

  addEventListener("resize", () => { layout(); render(); });
  document.addEventListener("visibilitychange", schedule);
  reducedMotion.addEventListener("change", () => {
    paused = reducedMotion.matches;
    if (paused) intro = Math.max(intro, 99);
    schedule();
  });
  toggle.addEventListener("click", () => {
    paused = !paused;
    if (paused) intro = Math.max(intro, 99);
    schedule();
  });

  if (testing) {
    // Lets a test harness advance time when requestAnimationFrame is throttled.
    window.__karte = {
      render,
      zoom(value) { zoom = zoomTarget = value; scale(); render(); },
      stops: () => Object.fromEntries(lines.map(line => [line.id, line.stops.map(stop => stop.st.id).join(" → ")])),
      advance(seconds) { for (let t = 0; t < seconds; t += 1 / 30) step(1 / 30); layout(); render(); } };
  }

  layout();
  setZoom(zoomStart);
  document.documentElement.classList.add("map-ready");
  toggle.hidden = false;
  zoomControls.hidden = false;
  schedule();
})();

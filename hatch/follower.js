document.addEventListener("DOMContentLoaded", function() {
 
  // ═══════════════════════════════════════════════════════════════
  // 1. MOVEMENT CONTROLS
  // ═══════════════════════════════════════════════════════════════
 
  const SPRING_STIFFNESS = 0.25;  // pull force toward target per frame (higher = snappier)
  const SPRING_DAMPING   = 0.5;   // velocity decay per frame (lower = more overshoot/bounce)
  const DELAY_FRAMES     = 1;     // ring buffer size: frames the follower lags behind cursor
 
  const TRAIL_STIFFNESS  = 0.15;  // same as above but for the trail (lower = lazier pull)
  const TRAIL_DAMPING    = 0.35;  // trail damps slightly more than follower
  const TRAIL_DELAY      = 2;     // trail lags this many frames more than the follower
 
  // ═══════════════════════════════════════════════════════════════
  // 2. COLORS
  // ═══════════════════════════════════════════════════════════════
 
  function toRGB(color) {
    var c = document.createElement("canvas");
    c.width = c.height = 1;
    var x = c.getContext("2d");
    x.fillStyle = color;
    x.fillRect(0, 0, 1, 1);
    var d = x.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  }
 
  const COLORS = {
    primary:   toRGB("oklch(0.8883 0.0586 205.57)"),
    secondary: toRGB("oklch(0.8375 0.1029 307.72)"),
    accent:    toRGB("oklch(0.9379 0.2146 115.41)"),
    neutral:   toRGB("oklch(0.8181 0.0161 86.44)"),
  };
 
  // ═══════════════════════════════════════════════════════════════
  // 3. CANVAS
  // ═══════════════════════════════════════════════════════════════
 
  const BASE_RADIUS  = 1200;  // base gradient radius in pixels (scale multiplies this)
  const SHOW_TRAIL   = true;  // set false to disable the trail
 
  // ═══════════════════════════════════════════════════════════════
  // 4. PRESETS
  // ═══════════════════════════════════════════════════════════════
  //
  //  preset( color, midA, innerStop, midStop, scale, opacity )
  //
  //  innerStop → flat bright core (0 = none, 0.1 = 10% solid)
  //  midStop   → where mid alpha applies (0–1 fraction of radius)
  //  midA      → alpha at midStop, fades to 0 at edge
  //  scale     → multiplies BASE_RADIUS, or "full" to cover the viewport
  //  opacity   → overall opacity
  //
  // ═══════════════════════════════════════════════════════════════
 
  function preset(color, midA, innerStop, midStop, scale, opacity) {
    return {
      r: color.r,  g: color.g,  b: color.b,
      midA:      midA,
      innerStop: innerStop,
      midStop:   midStop,
      scale:     scale,
      opacity:   opacity,
    };
  }
 
  const PRESETS = {
    softPrimary:       preset(COLORS.primary,   0.2, 0.3,  0.5,  0.5, .4),
    softSecondary:     preset(COLORS.secondary, 0.2, 0.2,  0.5,  1,   .4),
    softAccent:        preset(COLORS.accent,    0.2, 0.2,  0.5,  1,   .2),
    hidden:            preset(COLORS.primary,   0,   0.10, 0.50, 0.2, 0),
    focusedPrimary:    preset(COLORS.primary,   0.2, 0.2,  0.4,  0.1, 0),
    focusedSecondary:  preset(COLORS.secondary, 0.2, 0.2,  0.5,  0.5, .6),
    centeredPrimary:   preset(COLORS.primary,   0.4, 0.25, 0.55, 0.8, 1),
    centeredSecondary: preset(COLORS.secondary, 0.4, 0.25, 0.55, 1,   .5),
 
    fullPrimary:       preset(COLORS.primary,   1,   0.85, 0.95, "full", 1),
    fullSecondary:     preset(COLORS.secondary, 1,   0.85, 0.95, "full", 1),
    fullAccent:        preset(COLORS.accent,    1,   0.85, 0.95, "full", 1),
    fullNeutral:       preset(COLORS.neutral,   1,   0.85, 0.95, "full", 1),
  };
 
  // ═══════════════════════════════════════════════════════════════
  // 5. DEFAULTS
  // ═══════════════════════════════════════════════════════════════
 
  const DEFAULT_STATE   = "default";
  const DEFAULT_RETURN  = { duration: 1, ease: "back.out(2)" };
  const FULL_TRANSITION = { duration: 0.6, ease: "power3.inOut" };
 
  // ═══════════════════════════════════════════════════════════════
  // 6. AMBIENT MODE (tablet and below)
  // ═══════════════════════════════════════════════════════════════
  //
  //  Below the breakpoint the follower and all hover states are off.
  //  Three blobs circle the screen a third of a turn apart (so they keep
  //  their distance), each swinging in and out between near the centre
  //  and the screen edge. Everything repeats seamlessly every AMBIENT_LOOP
  //  seconds. With reduced motion turned on (any screen size) the desktop
  //  blobs stay still in the centre instead.
  //
  //  All speeds are "times per loop" and must be whole numbers,
  //  otherwise the loop jumps when it restarts.
  //
  // ═══════════════════════════════════════════════════════════════
 
  const AMBIENT_QUERY  = "(max-width: 991px)";
  const AMBIENT_LOOP   = 60;   // seconds per seamless loop
  const AMBIENT_TURNS  = 2;    // laps around the screen per loop (position speed)
  const AMBIENT_SWING  = 3;    // in-and-out swings per loop
  const AMBIENT_COLORS = 4;    // primary → secondary → accent cycles per loop
  const AMBIENT_PULSES = 2;    // size swell cycles per loop
  const AMBIENT_REACH  = [0.3, 1];  // distance from centre: 0 = centre, 1 = centre touches the edge
 
  //  Dedicated mobile blobs (colour is cycled, so none is set here).
  //  size  → radius as a fraction of the viewport width
  //  pulse → how much size swells and shrinks (± fraction)
  const AMBIENT_BLOBS = [
    { midA: 0.25, innerStop: 0.2, midStop: 0.5, size: 0.7, pulse: 0.15, opacity: 0.5  },
    { midA: 0.25, innerStop: 0.2, midStop: 0.5, size: 0.6, pulse: 0.15, opacity: 0.45 },
    { midA: 0.2,  innerStop: 0.1, midStop: 0.5, size: 0.8, pulse: 0.1,  opacity: 0.4  },
  ];
 
  // ═══════════════════════════════════════════════════════════════
  // 7. STATE DEFINITIONS
  // ═══════════════════════════════════════════════════════════════
  //
  //  Trigger usage:  data-follower="stateName"
  //
  //  follower / trail  → preset reference (trail falls back to follower)
  //  centered          → locks movement, tweens to trigger element center
  //  transition        → { duration, ease }
  //
  // ═══════════════════════════════════════════════════════════════
 
  const STATES = {
 
    default: {
      follower: PRESETS.softPrimary,
      trail:    PRESETS.softSecondary,
    },
 
    secondary: {
      follower: PRESETS.softPrimary,
      trail:    PRESETS.softAccent,
    },
 
    hide: {
      follower:   PRESETS.hidden,
      transition: { duration: 1.5, ease: "back.out(2)" },
    },
 
    focus: {
      follower:   PRESETS.focusedPrimary,
      trail:      PRESETS.focusedSecondary,
      transition: { duration: 1, ease: "back.out(3)" },
    },
 
    centered: {
      centered: true,
      follower:   PRESETS.centeredPrimary,
      trail:      PRESETS.centeredSecondary,
      transition: { duration: 1, ease: "back.out(2)" },
    },
 
    "full-screen-primary": {
      follower:   PRESETS.fullPrimary,
      trail:      PRESETS.hidden,
      transition: FULL_TRANSITION,
    },
 
    "full-screen-secondary": {
      follower:   PRESETS.fullSecondary,
      trail:      PRESETS.hidden,
      transition: FULL_TRANSITION,
    },
 
    "full-screen-accent": {
      follower:   PRESETS.fullAccent,
      trail:      PRESETS.hidden,
      transition: FULL_TRANSITION,
    },
 
    "full-screen-neutral": {
      follower:   PRESETS.fullNeutral,
      trail:      PRESETS.hidden,
      transition: FULL_TRANSITION,
    },
 
    // sentinel — participates in enter/leave stack bookkeeping
    // but never changes the visual; nested trigger keeps the parent's state.
    inherit: {}
  };
 
  // Topmost stack entry that isn't "inherit" (null if none).
  function resolveState() {
    for (var i = activeStack.length - 1; i >= 0; i--) {
      if (activeStack[i] !== "inherit") return activeStack[i];
    }
    return null;
  }
 
 
  // ═══════════════════════════════════════════════════════════════
  // ENGINE
  // ═══════════════════════════════════════════════════════════════
 
  var triggers    = document.querySelectorAll("[data-follower]");
  var activeStack = [];
  var needsDraw   = true;  // forces one redraw when nothing is moving or tweening
 
  // ── Canvas ───────────────────────────────────────────────────
 
  var canvas = document.querySelector('[cs-el="followerCanvas"]');
  if (!canvas) {
    console.warn("Follower: missing [cs-el=\"followerCanvas\"] — skipping init.");
    return;
  }
 
  var ctx = canvas.getContext("2d");
  var dpr = 1;
 
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    needsDraw = true;
  }
  resizeCanvas();
 
  var resizeTimer = null;
  window.addEventListener("resize", function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      resizeCanvas();
      updateCenteredRect();
      // Recalculate the fill size if a full-screen state is active
      var current = resolveState();
      if (current && current.indexOf("full-screen") === 0) {
        transitionTo(current, { transition: { duration: 0.3, ease: "power2.out" } });
      }
    }, 150);
  });
 
  // ── Live state objects (tweened by GSAP, read by draw) ───────
 
  var initState = STATES[DEFAULT_STATE];
  var fLive = Object.assign({}, initState.follower, { opacity: 0 });
  var tLive = Object.assign({}, initState.trail || initState.follower, { opacity: 0 });
 
  // Intro fade. Held in a variable so a trigger firing during the delay
  // can cancel it — a delayed tween is not "active", so overwrite: "auto"
  // would not catch it, and it would later drag opacity back to default.
  var introTweens = [
    gsap.to(fLive, { opacity: initState.follower.opacity,                      duration: 2, ease: "power2.out", delay: 0.7 }),
    gsap.to(tLive, { opacity: (initState.trail || initState.follower).opacity, duration: 2, ease: "power2.out", delay: 0.9 })
  ];
 
  function killIntro() {
    if (!introTweens) return;
    introTweens.forEach(function(tw) { tw.kill(); });
    introTweens = null;
  }
 
  // ── Draw ─────────────────────────────────────────────────────
 
  function drawGradient(x, y, live) {
    var radius = BASE_RADIUS * live.scale;
    var alpha  = Math.min(live.opacity, 1);
 
    // Never pass a non-finite value to the canvas; warn once for debugging
    if (![x, y, radius, alpha].every(Number.isFinite)) {
      if (!drawGradient.warned) {
        console.warn("Follower: non-finite draw", {
          x: x, y: y, radius: radius, scale: live.scale, opacity: live.opacity
        });
        drawGradient.warned = true;
      }
      return;
    }
    if (radius <= 0 || alpha <= 0) return;
 
    // Clamp stops so overshooting eases can't make addColorStop throw
    var inner = Math.min(Math.max(live.innerStop, 0), 1);
    var mid   = Math.min(Math.max(live.midStop, inner), 1);
    var midA  = Math.min(Math.max(live.midA, 0), 1);
 
    var r = Math.round(live.r);
    var g = Math.round(live.g);
    var b = Math.round(live.b);
 
    var grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(inner, "rgba(" + r + "," + g + "," + b + ",1)");
    grad.addColorStop(mid,   "rgba(" + r + "," + g + "," + b + "," + midA + ")");
    grad.addColorStop(1,     "rgba(" + r + "," + g + "," + b + ",0)");
 
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
 
  // ── Transitions ───────────────────────────────────────────────
 
  // Turns scale: "full" into the scale needed for the solid core
  // to cover the whole viewport, even with the cursor in a corner.
  function resolveDef(def) {
    if (def.scale !== "full") return def;
    var diag = Math.hypot(window.innerWidth, window.innerHeight);
    return Object.assign({}, def, { scale: diag / (BASE_RADIUS * def.innerStop) });
  }
 
  function transitionTo(stateName, opts) {
    opts = opts || {};
    var state = STATES[stateName];
    if (!state) { console.warn("Follower: unknown state \"" + stateName + "\""); return; }
 
    killIntro();
 
    var fDef = resolveDef(state.follower);
    var tDef = resolveDef(state.trail || state.follower);
    var tr   = opts.transition || state.transition || { duration: 0.5, ease: "power2.out" };
 
    gsap.to(fLive, Object.assign({}, fDef, { duration: tr.duration, ease: tr.ease, overwrite: "auto" }));
    gsap.to(tLive, Object.assign({}, tDef, { duration: tr.duration, ease: tr.ease, overwrite: "auto" }));
  }
 
  // ── Movement ──────────────────────────────────────────────────
 
  var mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
 
  var fPos    = { x: mouse.x, y: mouse.y };
  var fBufLen = Math.max(DELAY_FRAMES, 1);
  var fBuf    = [];
  for (var i = 0; i < fBufLen; i++) fBuf.push({ x: mouse.x, y: mouse.y });
  var fHead = 0;
 
  var tPos    = { x: mouse.x, y: mouse.y };
  var tBufLen = Math.max(TRAIL_DELAY, 1);
  var tBuf    = [];
  for (var j = 0; j < tBufLen; j++) tBuf.push({ x: mouse.x, y: mouse.y });
  var tHead = 0;
 
  window.addEventListener("pointermove", function(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
 
  // ── Ambient loop ──────────────────────────────────────────────
 
  // Random start, direction and swing phases per page load
  var TAU    = Math.PI * 2;
  var start  = Math.random() * TAU;
  var dir    = Math.random() < 0.5 ? -1 : 1;
  var swings = AMBIENT_BLOBS.map(function() { return Math.random() * TAU; });
  var blobs  = AMBIENT_BLOBS.map(function(b) { return Object.assign({ x: 0, y: 0, scale: 0, r: 0, g: 0, b: 0 }, b, { opacity: 0 }); });
 
  function ambientUpdate(t) {
    var a = (t / AMBIENT_LOOP) * TAU;  // 0 → TAU over one loop
    var w = window.innerWidth, h = window.innerHeight;
    var lo = AMBIENT_REACH[0], hi = AMBIENT_REACH[1];
    blobs.forEach(function(b, i) {
      var off   = i * TAU / blobs.length;  // a third of a turn apart
      var angle = start + dir * AMBIENT_TURNS * a + off + 0.3 * Math.sin(AMBIENT_TURNS * a);
      var reach = lo + (hi - lo) * (0.5 + 0.5 * Math.sin(AMBIENT_SWING * a + swings[i]));
      b.x = w / 2 + (w / 2) * reach * Math.cos(angle);
      b.y = h / 2 + (h / 2) * reach * Math.sin(angle);
      cycleColor(b, (AMBIENT_COLORS * a + off) / TAU);
      b.scale = w * b.size * (1 + b.pulse * Math.sin(AMBIENT_PULSES * a + off)) / BASE_RADIUS;
    });
  }
 
  // Smooth loop through primary → secondary → accent → primary (p: 1 = one full cycle)
  var CYCLE = [COLORS.primary, COLORS.secondary, COLORS.accent];
  function cycleColor(live, p) {
    p = ((p % 1) + 1) % 1 * CYCLE.length;
    var i = Math.floor(p), f = p - i;
    f = f * f * (3 - 2 * f);  // ease between colours
    var c0 = CYCLE[i], c1 = CYCLE[(i + 1) % CYCLE.length];
    live.r = c0.r + (c1.r - c0.r) * f;
    live.g = c0.g + (c1.g - c0.g) * f;
    live.b = c0.b + (c1.b - c0.b) * f;
  }
 
  // ── Ticker ────────────────────────────────────────────────────
 
  var movementLocked    = false;
  var centeredTriggerEl = null;
  var centeredRect      = null;
  var fVelX = 0, fVelY = 0;
  var tVelX = 0, tVelY = 0;
 
  function updateCenteredRect() {
    if (!centeredTriggerEl) return;
    var rect = centeredTriggerEl.getBoundingClientRect();
    centeredRect = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    needsDraw = true;
  }
  window.addEventListener("scroll", updateCenteredRect, { passive: true });
 
  function releaseCentered() {
    gsap.killTweensOf(fPos);
    gsap.killTweensOf(tPos);
    centeredTriggerEl = null;
    centeredRect = null;
    fVelX = 0; fVelY = 0;
    tVelX = 0; tVelY = 0;
    for (var i = 0; i < fBufLen; i++) { fBuf[i].x = mouse.x; fBuf[i].y = mouse.y; }
    for (var j = 0; j < tBufLen; j++) { tBuf[j].x = mouse.x; tBuf[j].y = mouse.y; }
    movementLocked = false;
  }
 
  // "follow" (desktop), "ambient" (tablet and below), "static" (reduced motion)
  var mode = null;
  var smallMQ  = window.matchMedia(AMBIENT_QUERY);
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
 
  function setMode() {
    var next = reduceMQ.matches ? "static" : smallMQ.matches ? "ambient" : "follow";
    if (next === mode) return;
    if (mode) {
      // Switching after load (resize/rotate): drop hover states, back to default look
      activeStack.length = 0;
      releaseCentered();
      if (next !== "ambient") transitionTo(DEFAULT_STATE);
    }
    mode = next;
    needsDraw = true;
    // Fade the mobile blobs in, or reset them for next time
    blobs.forEach(function(b, i) {
      gsap.killTweensOf(b);
      if (mode === "ambient") gsap.to(b, { opacity: AMBIENT_BLOBS[i].opacity, duration: 2, ease: "power2.out", delay: 0.7 + i * 0.3 });
      else b.opacity = 0;
    });
  }
  setMode();
  smallMQ.addEventListener("change", setMode);
  reduceMQ.addEventListener("change", setMode);
 
  function isTweening() {
    return gsap.isTweening(fLive) || gsap.isTweening(tLive) ||
           gsap.isTweening(fPos)  || gsap.isTweening(tPos);
  }
 
  var frame = 0;
 
  gsap.ticker.add(function() {
 
    if (mode === "ambient") {
      if (frame++ % 2) return;  // ~30fps is plenty for a slow drift
      ambientUpdate(gsap.ticker.time);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);
      blobs.forEach(function(b) { if (b.opacity > 0.001) drawGradient(b.x, b.y, b); });
      ctx.restore();
      return;
 
    } else if (mode === "static") {
      fPos.x = tPos.x = window.innerWidth  / 2;
      fPos.y = tPos.y = window.innerHeight / 2;
      if (!needsDraw && !isTweening()) return;
 
    } else {
      // Recover from a broken position instead of staying stuck on NaN
      if (!Number.isFinite(fPos.x) || !Number.isFinite(fPos.y)) { fPos.x = mouse.x; fPos.y = mouse.y; fVelX = fVelY = 0; }
      if (!Number.isFinite(tPos.x) || !Number.isFinite(tPos.y)) { tPos.x = mouse.x; tPos.y = mouse.y; tVelX = tVelY = 0; }
 
      var settled = true;
 
      if (movementLocked) {
        if (centeredRect) {
          fPos.x = centeredRect.x;
          fPos.y = centeredRect.y;
          tPos.x = fPos.x;
          tPos.y = fPos.y;
        }
      } else {
        fBuf[fHead].x = mouse.x;
        fBuf[fHead].y = mouse.y;
        var fDelayed  = fBuf[(fHead + 1) % fBufLen];
        fHead = (fHead + 1) % fBufLen;
 
        var dx = fDelayed.x - fPos.x;
        var dy = fDelayed.y - fPos.y;
        fVelX = (fVelX + dx * SPRING_STIFFNESS) * SPRING_DAMPING;
        fVelY = (fVelY + dy * SPRING_STIFFNESS) * SPRING_DAMPING;
        fPos.x += fVelX;
        fPos.y += fVelY;
 
        tBuf[tHead].x = mouse.x;
        tBuf[tHead].y = mouse.y;
        var tDelayed  = tBuf[(tHead + 1) % tBufLen];
        tHead = (tHead + 1) % tBufLen;
 
        dx = tDelayed.x - tPos.x;
        dy = tDelayed.y - tPos.y;
        tVelX = (tVelX + dx * TRAIL_STIFFNESS) * TRAIL_DAMPING;
        tVelY = (tVelY + dy * TRAIL_STIFFNESS) * TRAIL_DAMPING;
        tPos.x += tVelX;
        tPos.y += tVelY;
 
        // Settled = both blobs sit on the cursor and have stopped moving
        settled = Math.abs(mouse.x - fPos.x) + Math.abs(mouse.y - fPos.y) < 0.2 &&
                  Math.abs(mouse.x - tPos.x) + Math.abs(mouse.y - tPos.y) < 0.2 &&
                  Math.abs(fVelX) + Math.abs(fVelY) + Math.abs(tVelX) + Math.abs(tVelY) < 0.05;
        if (settled) {
          fPos.x = tPos.x = mouse.x;
          fPos.y = tPos.y = mouse.y;
          fVelX = fVelY = tVelX = tVelY = 0;
        }
      }
 
      // Nothing moving or tweening: keep the last frame on screen
      if (settled && !needsDraw && !isTweening()) return;
    }
 
    needsDraw = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    try {
      ctx.scale(dpr, dpr);
      if (SHOW_TRAIL && tLive.opacity > 0.001) drawGradient(tPos.x, tPos.y, tLive);
      if (fLive.opacity > 0.001) drawGradient(fPos.x, fPos.y, fLive);
    } finally {
      ctx.restore();
    }
  });
 
  // ── Triggers ──────────────────────────────────────────────────
 
  if (triggers.length === 0) return;
 
  for (var t = 0; t < triggers.length; t++) {
    (function(trigger) {
      trigger.addEventListener("mouseenter", function() {
        if (mode !== "follow") return;  // hover states only on desktop
        var name = trigger.getAttribute("data-follower");
        if (!name || !STATES[name]) return;
 
        activeStack.push(name);
        var state = STATES[name];
 
        if (state.centered) {
          movementLocked = true;
          fVelX = 0; fVelY = 0;
          tVelX = 0; tVelY = 0;
          var rect = trigger.getBoundingClientRect();
          var cx   = rect.left + rect.width  / 2;
          var cy   = rect.top  + rect.height / 2;
          var dur  = (state.transition && state.transition.duration) || 0.6;
          var ease = (state.transition && state.transition.ease) || "power3.inOut";
 
          gsap.to(fPos, {
            x: cx, y: cy,
            duration:  dur,
            ease:      ease,
            overwrite: "auto",
            onComplete: function() { centeredTriggerEl = trigger; updateCenteredRect(); },
          });
          gsap.to(tPos, {
            x: cx, y: cy,
            duration:  dur * 1.2,
            ease:      ease,
            overwrite: "auto",
          });
        }
 
        transitionTo(resolveState() || DEFAULT_STATE);
      });
 
      trigger.addEventListener("mouseleave", function() {
        var name = trigger.getAttribute("data-follower");
        if (!name) return;
 
        var idx = activeStack.lastIndexOf(name);
        if (idx === -1) return;
        activeStack.splice(idx, 1);
 
        if (STATES[name].centered) releaseCentered();
 
        var returnTo = resolveState();
        if (returnTo) {
          transitionTo(returnTo);
        } else {
          transitionTo(DEFAULT_STATE, { transition: DEFAULT_RETURN });
        }
      });
    })(triggers[t]);
  }
 
});
 
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
  // 6. TOUCH (tablet and below)
  // ═══════════════════════════════════════════════════════════════
  //
  //  Below the breakpoint the hover states are off. The blob appears
  //  under the finger, follows it while dragging (same spring as on
  //  desktop) and fades out when the finger lifts. Scrolling and taps
  //  are not affected. With reduced motion turned on (any screen size)
  //  the blob stays still in the centre instead.
  //
  // ═══════════════════════════════════════════════════════════════

  const TOUCH_QUERY = "(max-width: 991px)";
  const TOUCH_STATE = "focus";  // look while touching (any non-full-screen state)
  const TOUCH_SIZE  = 0.6;      // largest blob radius as a fraction of the screen width
  const TOUCH_IN    = { duration: 0.4, ease: "power2.out" };
  const TOUCH_OUT   = { duration: 0.8, ease: "power2.inOut" };

  //  Velocity (touch only). Speeds are in pixels per frame.
  const TOUCH_STRETCH     = 0.012;  // stretch per unit of speed (oval along the swipe)
  const TOUCH_STRETCH_MAX = 0.35;   // max stretch (0.35 = 35% longer, matching thinner)
  const TOUCH_SWELL       = 0.008;  // size and brightness gain per unit of speed
  const TOUCH_SWELL_MAX   = 0.3;    // max gain (0.3 = 30% bigger and brighter)
  const TOUCH_EASE        = 0.12;   // how quickly stretch and swell follow speed (lower = softer)
  const TOUCH_FLING       = 0.9;    // momentum kept when the finger lifts mid-swipe (0 = off)
  const TOUCH_FRICTION    = 0.93;   // how quickly the fling slows each frame (lower = shorter)

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

  // d (optional) = { s: stretch, w: swell, a: angle } from touch velocity
  function drawGradient(x, y, live, d) {
    var w      = d ? 1 + d.w : 1;
    var radius = BASE_RADIUS * live.scale * w;
    var alpha  = Math.min(live.opacity * w, 1);

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

    var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    grad.addColorStop(inner, "rgba(" + r + "," + g + "," + b + ",1)");
    grad.addColorStop(mid,   "rgba(" + r + "," + g + "," + b + "," + midA + ")");
    grad.addColorStop(1,     "rgba(" + r + "," + g + "," + b + ",0)");

    ctx.save();
    ctx.translate(x, y);
    if (d && d.s > 0.001) {
      ctx.rotate(d.a);
      ctx.scale(1 + d.s, 1 / (1 + d.s));
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
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

  // ── Touch ─────────────────────────────────────────────────────

  // Same look as TOUCH_STATE, resized to the screen
  function touchShow() {
    var st = STATES[TOUCH_STATE], f = st.follower, t = st.trail || f;
    var k  = window.innerWidth * TOUCH_SIZE / (BASE_RADIUS * Math.max(f.scale, t.scale));
    gsap.to(fLive, Object.assign({}, f, { scale: f.scale * k }, TOUCH_IN, { overwrite: "auto" }));
    gsap.to(tLive, Object.assign({}, t, { scale: t.scale * k }, TOUCH_IN, { overwrite: "auto" }));
  }

  var fDef  = { s: 0, w: 0, a: 0 }, tDef = { s: 0, w: 0, a: 0 };  // stretch/swell per blob
  var fling = { x: 0, y: 0, on: false, t: 0 };                       // finger speed, then momentum

  function touchPoint(e) {
    var p = e.touches[0];
    if (!p) return;
    var now = performance.now(), dt = Math.max(now - fling.t, 1);
    if (fling.t) {
      // Finger speed in px per frame (~16.7ms), lightly smoothed
      fling.x = fling.x * 0.5 + (p.clientX - mouse.x) / dt * 16.7 * 0.5;
      fling.y = fling.y * 0.5 + (p.clientY - mouse.y) / dt * 16.7 * 0.5;
    }
    fling.t = now;
    mouse.x = p.clientX; mouse.y = p.clientY;
  }

  // Eases a blob's stretch and swell toward its current speed
  function deform(d, vx, vy) {
    var sp = Math.hypot(vx, vy);
    d.s += (Math.min(sp * TOUCH_STRETCH, TOUCH_STRETCH_MAX) - d.s) * TOUCH_EASE;
    d.w += (Math.min(sp * TOUCH_SWELL,   TOUCH_SWELL_MAX)   - d.w) * TOUCH_EASE;
    if (sp > 0.5) d.a = Math.atan2(vy, vx);
    return d.s + d.w > 0.001;
  }

  window.addEventListener("touchstart", function(e) {
    if (mode !== "touch") return;
    fling.on = false; fling.x = fling.y = 0; fling.t = 0;
    touchPoint(e);
    // Fully faded out: appear right under the finger instead of flying in
    if (fLive.opacity < 0.01 && tLive.opacity < 0.01) {
      releaseCentered();
      fPos.x = tPos.x = mouse.x;
      fPos.y = tPos.y = mouse.y;
    }
    touchShow();
  }, { passive: true });

  window.addEventListener("touchmove", function(e) {
    if (mode === "touch") touchPoint(e);
  }, { passive: true });

  function touchEnd(e) {
    if (mode !== "touch" || e.touches.length) return;
    // Lifted mid-swipe (moved in the last 80ms): carry on with momentum
    fling.on = performance.now() - fling.t < 80 && Math.hypot(fling.x, fling.y) > 2;
    fling.x *= TOUCH_FLING; fling.y *= TOUCH_FLING;
    gsap.to([fLive, tLive], Object.assign({ opacity: 0 }, TOUCH_OUT, { overwrite: "auto" }));
  }
  window.addEventListener("touchend", touchEnd, { passive: true });
  window.addEventListener("touchcancel", touchEnd, { passive: true });

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

  // "follow" (desktop), "touch" (tablet and below), "static" (reduced motion)
  var mode = null;
  var smallMQ  = window.matchMedia(TOUCH_QUERY);
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  function setMode() {
    var next = reduceMQ.matches ? "static" : smallMQ.matches ? "touch" : "follow";
    if (next === mode) return;
    if (mode) {
      // Switching after load (resize/rotate): drop hover states, back to default look
      activeStack.length = 0;
      releaseCentered();
      if (next !== "touch") transitionTo(DEFAULT_STATE);
    }
    mode = next;
    needsDraw = true;
    if (mode === "touch") {
      // Hidden until a finger touches the screen
      killIntro();
      gsap.killTweensOf([fLive, tLive]);
      fLive.opacity = tLive.opacity = 0;
    }
  }
  setMode();
  smallMQ.addEventListener("change", setMode);
  reduceMQ.addEventListener("change", setMode);

  function isTweening() {
    return gsap.isTweening(fLive) || gsap.isTweening(tLive) ||
           gsap.isTweening(fPos)  || gsap.isTweening(tPos);
  }

  gsap.ticker.add(function() {

    if (mode === "static") {
      fPos.x = tPos.x = window.innerWidth  / 2;
      fPos.y = tPos.y = window.innerHeight / 2;
      if (!needsDraw && !isTweening()) return;

    } else {
      // Recover from a broken position instead of staying stuck on NaN
      if (!Number.isFinite(fPos.x) || !Number.isFinite(fPos.y)) { fPos.x = mouse.x; fPos.y = mouse.y; fVelX = fVelY = 0; }
      if (!Number.isFinite(tPos.x) || !Number.isFinite(tPos.y)) { tPos.x = mouse.x; tPos.y = mouse.y; tVelX = tVelY = 0; }

      // Fling: the target keeps gliding after release, slowing down
      if (fling.on) {
        mouse.x += fling.x; mouse.y += fling.y;
        fling.x *= TOUCH_FRICTION; fling.y *= TOUCH_FRICTION;
        if (Math.hypot(fling.x, fling.y) < 0.1) fling.on = false;
      }

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

      if (mode === "touch") {
        var deforming = deform(fDef, fVelX, fVelY) | deform(tDef, tVelX, tVelY);
        if (deforming || fling.on) settled = false;
      }

      // Nothing moving or tweening: keep the last frame on screen
      if (settled && !needsDraw && !isTweening()) return;
    }

    needsDraw = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    try {
      ctx.scale(dpr, dpr);
      var touch = mode === "touch";
      if (SHOW_TRAIL && tLive.opacity > 0.001) drawGradient(tPos.x, tPos.y, tLive, touch && tDef);
      if (fLive.opacity > 0.001) drawGradient(fPos.x, fPos.y, fLive, touch && fDef);
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

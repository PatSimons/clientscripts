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
    neutral:   toRGB("oklch(0.9824 0.013 71.33)"),
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

  const DEFAULT_STATE  = "default";
  const DEFAULT_RETURN = { duration: 1, ease: "back.out(2)" };
  const FULL_TRANSITION = { duration: 0.6, ease: "power3.inOut" };

  // ═══════════════════════════════════════════════════════════════
  // 6. STATE DEFINITIONS
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
      follower:   PRESETS.focusedPrimary,
      trail:       PRESETS.fullSecondary,
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

  gsap.to(fLive, { opacity: initState.follower.opacity,                      duration: 2, ease: "power2.out", delay: 0.7 });
  gsap.to(tLive, { opacity: (initState.trail || initState.follower).opacity, duration: 2, ease: "power2.out", delay: 0.9 });

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
  }
  window.addEventListener("scroll", updateCenteredRect, { passive: true });

  gsap.ticker.add(function() {

    // Recover from a broken position instead of staying stuck on NaN
    if (!Number.isFinite(fPos.x) || !Number.isFinite(fPos.y)) { fPos.x = mouse.x; fPos.y = mouse.y; fVelX = fVelY = 0; }
    if (!Number.isFinite(tPos.x) || !Number.isFinite(tPos.y)) { tPos.x = mouse.x; tPos.y = mouse.y; tVelX = tVelY = 0; }

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
    }

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

        var state = STATES[name];

        if (state.centered) {
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
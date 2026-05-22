/**
 * wolf.js  —  Apex Fitness Wolf Mascot  (v1)
 *
 * Four animated loading scenes matching the app's four tabs:
 *   login     — Wolf howling (moon rising, sound rings expanding)
 *   training  — Wolf in power stance (lightning bolts, energy aura)
 *   nutrition — Wolf sniffing a bowl (steam wisps rising)
 *   stats     — Wolf studying (data lines drawing across screen)
 *
 * Also exports:
 *   WolfMascot.svg(size)  — static wolf head SVG string for inline use
 *
 * Usage:
 *   await WolfLoader.show('training', 1700);
 *   WolfLoader.hide();
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// WOLF HEAD SVG  — geometric, fierce, indigo palette
// Used both in the loader overlay and as a static inline mascot
// ─────────────────────────────────────────────────────────────────────────────

function _wolfHeadSVG(size = 120, opts = {}) {
  const { glow = true, eyeColor = '#818CF8', bg = 'none' } = opts;
  return `
<svg width="${size}" height="${size}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
  <defs>
    <radialGradient id="wg-eye" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="${eyeColor}" stop-opacity="1"/>
      <stop offset="100%" stop-color="#4338CA" stop-opacity="0.3"/>
    </radialGradient>
    <radialGradient id="wg-head" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#2D2A6E"/>
      <stop offset="100%" stop-color="#1A1840"/>
    </radialGradient>
    <radialGradient id="wg-muzzle" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#3730A3"/>
      <stop offset="100%" stop-color="#1E1B4B"/>
    </radialGradient>
    ${glow ? `
    <filter id="wg-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>` : ''}
  </defs>

  ${bg !== 'none' ? `<circle cx="100" cy="110" r="90" fill="${bg}" opacity="0.15"/>` : ''}

  <!-- Left ear — outer -->
  <polygon points="38,105 22,22 75,78" fill="#1E1B4B"/>
  <!-- Left ear — inner highlight -->
  <polygon points="43,98 35,38 70,80" fill="#4F46E5" opacity="0.75"/>

  <!-- Right ear — outer -->
  <polygon points="162,105 178,22 125,78" fill="#1E1B4B"/>
  <!-- Right ear — inner highlight -->
  <polygon points="157,98 165,38 130,80" fill="#4F46E5" opacity="0.75"/>

  <!-- Head base -->
  <path d="M42,105 Q30,128 34,158 Q52,188 100,192 Q148,188 166,158 Q170,128 158,105 Q138,82 100,78 Q62,82 42,105 Z"
        fill="url(#wg-head)"/>

  <!-- Forehead angular planes -->
  <path d="M60,100 Q100,85 140,100 L130,92 Q100,80 70,92 Z" fill="#4F46E5" opacity="0.25"/>

  <!-- Brow ridge — left -->
  <path d="M52,110 Q68,102 82,108" stroke="#6366F1" stroke-width="2.5" fill="none"
        stroke-linecap="round" opacity="0.6"/>
  <!-- Brow ridge — right -->
  <path d="M118,108 Q132,102 148,110" stroke="#6366F1" stroke-width="2.5" fill="none"
        stroke-linecap="round" opacity="0.6"/>

  <!-- Left eye — glow ring -->
  ${glow ? `<ellipse cx="74" cy="122" rx="17" ry="15" fill="${eyeColor}" opacity="0.18" filter="url(#wg-glow)"/>` : ''}
  <!-- Left eye — iris -->
  <ellipse cx="74" cy="122" rx="13" ry="12" fill="url(#wg-eye)"/>
  <!-- Left eye — pupil -->
  <ellipse cx="74" cy="122" rx="7" ry="7.5" fill="#0D0C1E"/>
  <!-- Left eye — catch light -->
  <ellipse cx="78" cy="118" rx="3" ry="2.5" fill="white" opacity="0.92"/>
  <ellipse cx="70" cy="127" rx="1.5" ry="1.5" fill="white" opacity="0.4"/>

  <!-- Right eye — glow ring -->
  ${glow ? `<ellipse cx="126" cy="122" rx="17" ry="15" fill="${eyeColor}" opacity="0.18" filter="url(#wg-glow)"/>` : ''}
  <!-- Right eye — iris -->
  <ellipse cx="126" cy="122" rx="13" ry="12" fill="url(#wg-eye)"/>
  <!-- Right eye — pupil -->
  <ellipse cx="126" cy="122" rx="7" ry="7.5" fill="#0D0C1E"/>
  <!-- Right eye — catch light -->
  <ellipse cx="130" cy="118" rx="3" ry="2.5" fill="white" opacity="0.92"/>
  <ellipse cx="122" cy="127" rx="1.5" ry="1.5" fill="white" opacity="0.4"/>

  <!-- Cheek fur — left (angular marks) -->
  <path d="M42,138 L32,148 L46,145 Z" fill="#4338CA" opacity="0.5"/>
  <path d="M36,152 L24,162 L40,158 Z" fill="#4338CA" opacity="0.35"/>

  <!-- Cheek fur — right -->
  <path d="M158,138 L168,148 L154,145 Z" fill="#4338CA" opacity="0.5"/>
  <path d="M164,152 L176,162 L160,158 Z" fill="#4338CA" opacity="0.35"/>

  <!-- Muzzle -->
  <ellipse cx="100" cy="160" rx="32" ry="26" fill="url(#wg-muzzle)"/>

  <!-- Nose -->
  <path d="M85,152 Q100,147 115,152 Q112,164 100,166 Q88,164 85,152 Z" fill="#0D0C1E"/>
  <!-- Nose shine -->
  <ellipse cx="93" cy="153" rx="5" ry="3" fill="white" opacity="0.22"/>

  <!-- Mouth -->
  <line x1="100" y1="166" x2="100" y2="171" stroke="#0D0C1E" stroke-width="1.5"/>
  <path d="M86,174 Q100,183 114,174" stroke="#3730A3" stroke-width="2"
        fill="none" stroke-linecap="round"/>

  <!-- Chin crease -->
  <path d="M80,185 Q100,192 120,185" stroke="#4338CA" stroke-width="1" fill="none" opacity="0.4"/>
</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAY CSS
// ─────────────────────────────────────────────────────────────────────────────

const OVERLAY_CSS = `
  #wolf-overlay {
    position: fixed; inset: 0; z-index: 9000;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: rgba(10,10,18,0.97);
    opacity: 0; pointer-events: none;
    transition: opacity 0.28s cubic-bezier(0.22,1,0.36,1);
    gap: 18px;
    font-family: 'Outfit','Segoe UI',sans-serif;
  }
  #wolf-overlay.wolf-visible { opacity: 1; pointer-events: auto; }

  #wolf-stage  { position: relative; width: 160px; height: 160px; }
  #wolf-head   { position: absolute; inset: 0; display: flex;
                 align-items: center; justify-content: center; }

  #wolf-label  { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.16em;
                 text-transform: uppercase; color: rgba(255,255,255,0.28); }

  @keyframes wf-breathe {
    0%,100% { transform: scale(1); }
    50%      { transform: scale(1.04); }
  }
  @keyframes wf-eye-pulse {
    0%,100% { opacity: 0.18; }
    50%      { opacity: 0.45; }
  }
  @keyframes wf-ring-expand {
    0%   { transform: scale(0.6); opacity: 0.7; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  @keyframes wf-bolt {
    0%,100% { opacity: 0; transform: translateY(0) scaleY(1); }
    20%     { opacity: 1; }
    80%     { opacity: 1; transform: translateY(-6px) scaleY(1.15); }
  }
  @keyframes wf-spark {
    0%   { transform: translate(0,0) scale(1); opacity: 1; }
    100% { transform: translate(var(--sx),var(--sy)) scale(0); opacity: 0; }
  }
  @keyframes wf-steam {
    0%   { transform: translateY(0) scaleX(1); opacity: 0.7; }
    100% { transform: translateY(-40px) scaleX(0.4); opacity: 0; }
  }
  @keyframes wf-scan {
    0%   { width: 0; opacity: 0.9; }
    100% { width: 100%; opacity: 0; }
  }
  @keyframes wf-moon-rise {
    0%   { transform: translateY(20px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes wf-howl-ring {
    0%   { r: 15; opacity: 0.6; stroke-width: 3; }
    100% { r: 80; opacity: 0; stroke-width: 0.5; }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// SCENE BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

const SCENES = {

  // ── Login / home — wolf howling at the moon ─────────────────────────────
  login(stage) {
    stage.innerHTML = `
      <!-- Moon -->
      <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);
                  animation:wf-moon-rise 0.6s 0.1s both">
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" fill="#312E81" opacity="0.5"/>
          <circle cx="22" cy="22" r="14" fill="#C7D2FE" opacity="0.85"/>
          <circle cx="28" cy="17" r="5" fill="#312E81" opacity="0.45"/>
          <circle cx="16" cy="25" r="3" fill="#312E81" opacity="0.35"/>
        </svg>
      </div>
      <!-- Sound rings from wolf's howl -->
      <div id="wl-rings" style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%)">
        <svg width="140" height="70" viewBox="0 0 140 70" style="overflow:visible">
          <circle cx="70" cy="70" r="15" fill="none" stroke="#6366F1" stroke-width="2"
                  style="animation:wf-ring-expand 1.8s 0.5s ease-out infinite"/>
          <circle cx="70" cy="70" r="15" fill="none" stroke="#818CF8" stroke-width="2"
                  style="animation:wf-ring-expand 1.8s 0.9s ease-out infinite"/>
          <circle cx="70" cy="70" r="15" fill="none" stroke="#A5B4FC" stroke-width="1.5"
                  style="animation:wf-ring-expand 1.8s 1.3s ease-out infinite"/>
        </svg>
      </div>
      <!-- Wolf head — tilted back slightly for howl -->
      <div id="wolf-head" style="position:absolute;bottom:0;left:50%;
           transform:translateX(-50%) rotate(-12deg);animation:wf-breathe 2.5s ease-in-out infinite">
        ${_wolfHeadSVG(130)}
      </div>
    `;
  },

  // ── Training — wolf with lightning energy ───────────────────────────────
  training(stage) {
    const bolts = Array.from({length: 5}, (_, i) => {
      const x = 20 + i * 30;
      const h = 24 + (i % 2) * 14;
      const delay = (i * 0.18).toFixed(2);
      return `<line x1="${x}" y1="0" x2="${x - 6}" y2="${h}" x2="${x + 4}" y2="${h}"
                    stroke="#818CF8" stroke-width="2.5" stroke-linecap="round" opacity="0.8"
                    style="animation:wf-bolt 0.9s ${delay}s ease-in-out infinite"/>`;
    }).join('');

    const sparks = Array.from({length: 8}, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      const sx = Math.round(Math.cos(angle) * 55);
      const sy = Math.round(Math.sin(angle) * 40);
      const delay = (i * 0.14).toFixed(2);
      return `<div style="position:absolute;width:5px;height:5px;border-radius:50%;
              background:#818CF8;top:50%;left:50%;margin:-2.5px;
              --sx:${sx}px;--sy:${sy}px;
              animation:wf-spark 0.9s ${delay}s ease-out infinite"/>`;
    }).join('');

    stage.innerHTML = `
      <!-- Energy aura -->
      <div style="position:absolute;inset:-10px;border-radius:50%;
                  background:radial-gradient(circle,rgba(99,102,241,0.18) 0%,transparent 70%);
                  animation:wf-breathe 1.4s ease-in-out infinite"/>
      <!-- Sparks -->
      ${sparks}
      <!-- Lightning bolts above -->
      <div style="position:absolute;top:2px;left:50%;transform:translateX(-50%)">
        <svg width="140" height="40" viewBox="0 0 140 40">${bolts}</svg>
      </div>
      <!-- Wolf -->
      <div id="wolf-head" style="animation:wf-breathe 1.4s ease-in-out infinite">
        ${_wolfHeadSVG(140)}
      </div>
    `;
  },

  // ── Nutrition — wolf with rising steam ──────────────────────────────────
  nutrition(stage) {
    const steams = Array.from({length: 4}, (_, i) => {
      const x = 28 + i * 28;
      const delay = (i * 0.35).toFixed(2);
      const dur = (1.6 + i * 0.15).toFixed(2);
      return `
        <path d="M${x},40 Q${x-8},28 ${x},18 Q${x+8},8 ${x},0"
              stroke="rgba(165,180,252,0.5)" stroke-width="2.5" fill="none"
              stroke-linecap="round"
              style="animation:wf-steam ${dur}s ${delay}s ease-out infinite"/>`;
    }).join('');

    stage.innerHTML = `
      <!-- Steam wisps -->
      <div style="position:absolute;top:4px;left:50%;transform:translateX(-50%)">
        <svg width="140" height="44" viewBox="0 0 140 44" style="overflow:visible">
          ${steams}
        </svg>
      </div>
      <!-- Subtle glow -->
      <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);
                  width:120px;height:40px;border-radius:50%;
                  background:rgba(99,102,241,0.15);filter:blur(12px)"/>
      <!-- Wolf -->
      <div id="wolf-head" style="animation:wf-breathe 2.8s ease-in-out infinite">
        ${_wolfHeadSVG(135)}
      </div>
    `;
  },

  // ── Stats — wolf with scanning data lines ───────────────────────────────
  stats(stage) {
    const lines = Array.from({length: 5}, (_, i) => {
      const y = 12 + i * 26;
      const w = 60 + Math.random() * 55;
      const delay = (i * 0.22).toFixed(2);
      return `<div style="position:absolute;top:${y}px;left:10px;height:2px;
              background:linear-gradient(90deg,#6366F1,#818CF8);border-radius:1px;
              animation:wf-scan 1.4s ${delay}s ease-in-out infinite"/>`;
    }).join('');

    stage.innerHTML = `
      <!-- Data scan lines (left side) -->
      <div style="position:absolute;left:-8px;top:10px;width:50px;height:130px;
                  border-radius:6px;background:rgba(99,102,241,0.04)">
        ${lines}
      </div>
      <!-- Data scan lines (right side) -->
      <div style="position:absolute;right:-8px;top:10px;width:50px;height:130px;
                  border-radius:6px;background:rgba(99,102,241,0.04);transform:scaleX(-1)">
        ${lines}
      </div>
      <!-- Wolf -->
      <div id="wolf-head" style="animation:wf-breathe 3s ease-in-out infinite">
        ${_wolfHeadSVG(138)}
      </div>
    `;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

window.WolfLoader = (function () {
  let _overlay = null;
  let _hideTimer = null;

  const LABELS = {
    login:    'APEX FITNESS',
    training: 'LOADING TRAINING',
    nutrition:'LOADING DIARY',
    stats:    'LOADING STATS',
  };

  function _ensureOverlay() {
    if (_overlay) return;

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    document.head.appendChild(style);

    // Build overlay
    _overlay = document.createElement('div');
    _overlay.id = 'wolf-overlay';
    _overlay.innerHTML = `
      <div id="wolf-stage"></div>
      <div id="wolf-label"></div>
    `;
    document.body.appendChild(_overlay);
  }

  async function show(scene = 'login', minMs = 1400) {
    _ensureOverlay();
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

    const stage = document.getElementById('wolf-stage');
    const label = document.getElementById('wolf-label');

    label.textContent = LABELS[scene] ?? 'APEX FITNESS';
    (SCENES[scene] ?? SCENES.login)(stage);

    void _overlay.offsetWidth;
    _overlay.classList.add('wolf-visible');

    return new Promise(resolve => {
      _hideTimer = setTimeout(() => {
        hide();
        resolve();
      }, minMs);
    });
  }

  function hide() {
    if (!_overlay) return;
    _overlay.classList.remove('wolf-visible');
  }

  return { show, hide };
})();

// ─────────────────────────────────────────────────────────────────────────────
// STATIC MASCOT  — export a wolf head SVG string for inline use
// ─────────────────────────────────────────────────────────────────────────────

window.WolfMascot = {
  /** Returns an SVG string of the wolf head at the given pixel size */
  svg: (size = 120, opts = {}) => _wolfHeadSVG(size, opts),

  /** Injects the wolf head into a DOM element */
  render(el, size = 120, opts = {}) {
    if (!el) return;
    el.innerHTML = _wolfHeadSVG(size, opts);
  },
};

/**
 * panda.js  —  Apex Fitness Buff Panda Loader  (v2 BADASS EDITION)
 *
 * Four high-energy loading scenes:
 *   login     — Violent door kick (camera shake, shockwave, 7 dust particles)
 *   training  — Electric double-bicep flex (SVG glow filter, 8 sparks, aura pulse)
 *   nutrition — Industrial scale drop (cubic-bezier spring bounce, needle spin, steam)
 *   stats     — Pencil snap (rapid scribble, eye flare filter, 6 splinter particles)
 *
 * Usage:
 *   await PandaLoader.show('training');   // resolves after animation + minMs
 *   PandaLoader.hide();                   // instant dismiss
 */

'use strict';

window.PandaLoader = (function () {

  // ─────────────────────────────────────────────────────────────────────────
  // OVERLAY CSS
  // ─────────────────────────────────────────────────────────────────────────
  const OVERLAY_CSS = `
    #panda-overlay {
      position: fixed;
      inset: 0;
      z-index: 9000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(10, 10, 12, 0.96);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s cubic-bezier(0.22,1,0.36,1);
      gap: 14px;
      font-family: 'Outfit', 'Segoe UI', sans-serif;
    }
    #panda-overlay.panda-visible {
      opacity: 1;
      pointer-events: auto;
    }
    #panda-overlay svg { overflow: visible; }
    .panda-msg {
      font-size: 1.3rem;
      font-weight: 700;
      color: #F8F8F6;
      letter-spacing: -0.03em;
      margin: 0;
    }
    .panda-sub {
      font-size: 0.82rem;
      font-weight: 400;
      color: rgba(248,248,246,.36);
      margin: -8px 0 0;
    }
  `;

  // ─────────────────────────────────────────────────────────────────────────
  // DOM & INIT
  // ─────────────────────────────────────────────────────────────────────────
  let _overlay = null;
  let _stylesInjected = false;

  function _init() {
    if (!_stylesInjected) {
      const s = document.createElement('style');
      s.id = 'panda-styles';
      s.textContent = OVERLAY_CSS;
      document.head.appendChild(s);
      _stylesInjected = true;
    }
    if (!_overlay) {
      _overlay = document.createElement('div');
      _overlay.id = 'panda-overlay';
      document.body.appendChild(_overlay);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COPY
  // ─────────────────────────────────────────────────────────────────────────
  const COPY = {
    login:     { msg: "Let's get it.",       sub: 'Stepping in\u2026' },
    training:  { msg: 'Time to get swole.',  sub: 'Loading your program\u2026' },
    nutrition: { msg: 'Fueling the grind.',  sub: 'Building your meal plan\u2026' },
    stats:     { msg: "Numbers don\u2019t lie.", sub: 'Crunching your data\u2026' },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED: PANDA HEAD
  // Centered at cx=120 cy=72 in a 240-unit-wide coordinate space.
  // expr: 'roar' | 'smug' | 'focus'
  // glasses: boolean — adds translucent frames for the stats scene
  // ─────────────────────────────────────────────────────────────────────────
  function _head(expr, glasses) {
    const brow = (expr === 'smug')
      ? ''
      : `<path d="M86 55L105 63" stroke="#0A0A0A" stroke-width="3.5" stroke-linecap="round"/>
         <path d="M154 55L135 63" stroke="#0A0A0A" stroke-width="3.5" stroke-linecap="round"/>`;

    const eyes = (expr === 'smug')
      ? `<path d="M87 70L111 70L111 77C111 77 105 82 99 81C93 80 87 77 87 77Z" fill="#1A1A18"/>
         <path d="M129 70L153 70L153 77C153 77 147 82 141 81C135 80 129 77 129 77Z" fill="#1A1A18"/>
         <circle cx="100" cy="72" r="2.5" fill="white"/>
         <circle cx="142" cy="72" r="2.5" fill="white"/>`
      : `<circle cx="98" cy="74" r="11" fill="white"/>
         <circle cx="142" cy="74" r="11" fill="white"/>
         <circle cx="100" cy="77" r="6"  fill="#1A1A18"/>
         <circle cx="144" cy="77" r="6"  fill="#1A1A18"/>
         <circle cx="103" cy="73" r="3"  fill="white"/>
         <circle cx="147" cy="73" r="3"  fill="white"/>`;

    const mouth = (expr === 'roar')
      ? `<path d="M99 104Q120 120 141 104" fill="#1A1A18"/>
         <path d="M103 107C106 115 134 115 137 107" fill="#7A0000"/>
         <rect x="105" y="105" width="30" height="6" rx="1.5" fill="white"/>
         <line x1="120" y1="105" x2="120" y2="111" stroke="#CCC" stroke-width=".8"/>
         <line x1="111" y1="105" x2="111" y2="111" stroke="#CCC" stroke-width=".8"/>
         <line x1="129" y1="105" x2="129" y2="111" stroke="#CCC" stroke-width=".8"/>`
      : (expr === 'smug')
      ? `<path d="M106 106Q120 112 134 104" fill="none" stroke="#1A1A18" stroke-width="2.5" stroke-linecap="round"/>`
      : `<path d="M103 107L137 107" fill="none" stroke="#1A1A18" stroke-width="2.5" stroke-linecap="round"/>`;

    const glassesEl = glasses
      ? `<ellipse cx="98"  cy="77" rx="16" ry="13" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>
         <ellipse cx="142" cy="77" rx="16" ry="13" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>
         <line x1="114" y1="77" x2="126" y2="77" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>
         <line x1="76"  y1="70" x2="82"  y2="74" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>
         <line x1="164" y1="74" x2="158" y2="70" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>`
      : '';

    return `
      <ellipse cx="120" cy="72" rx="52" ry="50" fill="#F0EDE8" stroke="#0A0A0A" stroke-width="2.5"/>
      <circle cx="76"  cy="28" r="22" fill="#1A1A18" stroke="#0A0A0A" stroke-width="2"/>
      <circle cx="164" cy="28" r="22" fill="#1A1A18" stroke="#0A0A0A" stroke-width="2"/>
      <circle cx="76"  cy="30" r="12" fill="#262420"/>
      <circle cx="164" cy="30" r="12" fill="#262420"/>
      ${brow}
      <ellipse cx="100" cy="78" rx="23" ry="20" fill="#1A1A18" transform="rotate(-18 100 78)"/>
      <ellipse cx="140" cy="78" rx="23" ry="20" fill="#1A1A18" transform="rotate(18 140 78)"/>
      ${eyes}
      <ellipse cx="120" cy="98" rx="21" ry="14" fill="#E8E4DE"/>
      <path d="M111 93C115 89 125 89 129 93C129 98 125 100 120 100C115 100 111 98 111 93Z" fill="#1A1A18"/>
      ${mouth}
      ${glassesEl}
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED: MUSCULAR TORSO
  // Wide V-taper silhouette with chest, pec, and ab definition lines.
  // ─────────────────────────────────────────────────────────────────────────
  function _torso() {
    return `
      <path d="M50 120 C44 146 70 196 78 224 L96 224 L94 202 C78 182 70 160 76 136 Z"
            fill="#BDBAB2"/>
      <path d="M190 120 C196 146 170 196 162 224 L144 224 L146 202 C162 182 170 160 164 136 Z"
            fill="#B4B0A8"/>

      <path d="M50 120 C44 146 70 196 78 224 L162 224 C170 196 196 146 190 120 Q164 108 120 107 Q76 108 50 120 Z"
            fill="#F0EDE8" stroke="#0A0A0A" stroke-width="2.5"/>

      <path d="M50 120 C44 146 70 196 78 224 L92 224 L90 202 C74 182 66 158 72 134 Z"
            fill="#D6D0C6"/>
      <path d="M190 120 C196 146 170 196 162 224 L148 224 L150 202 C166 182 174 158 168 134 Z"
            fill="#CAC4BA"/>

      <path d="M186 138 C182 126 166 118 142 122 L138 158 C150 168 174 166 184 158 Z" fill="#E0DCD4"/>
      <path d="M180 136 C170 126 158 121 148 124 L150 146 C162 152 174 150 180 144 Z" fill="#ECEAE2"/>
      <path d="M184 158 C176 168 160 172 140 168 L138 160 C158 165 174 162 184 158 Z" fill="#C4BEB4"/>

      <path d="M54 138 C58 126 74 118 98 122 L102 158 C90 168 66 166 56 158 Z" fill="#EAE6DE"/>
      <path d="M62 134 C70 124 82 119 94 123 L92 146 C78 152 66 150 60 144 Z" fill="#FAF8F4"/>
      <path d="M56 158 C64 168 80 172 100 168 L102 160 C82 165 66 162 56 158 Z" fill="#C8C2B8"/>

      <line x1="120" y1="120" x2="120" y2="162" stroke="#BCBAB0" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M56 158 Q88 172 120 170 Q152 172 184 158" fill="none" stroke="#C4C0B6" stroke-width="1.5"/>

      <ellipse cx="120" cy="196" rx="30" ry="26" fill="#E4E0D6"/>

      <path d="M90 172 L118 172 L118 184 C110 188 96 187 90 183 Z"             fill="#F2EFE9"/>
      <path d="M90 183 C96 188 110 189 118 185 L118 190 C108 193 94 192 90 188 Z" fill="#C6C0B6"/>
      <path d="M122 172 L150 172 L150 183 C144 186 130 187 122 184 Z"            fill="#ECE9E1"/>
      <path d="M122 184 C130 188 144 188 150 184 L150 190 C140 193 126 192 122 188 Z" fill="#BEBAB0"/>
      <path d="M90 190 L118 190 L118 202 C110 205 96 204 90 201 Z"              fill="#EEEAE2"/>
      <path d="M90 201 C96 205 110 206 118 203 L118 208 C108 211 94 210 90 206 Z"  fill="#C2BCB2"/>
      <path d="M122 190 L150 190 L150 201 C144 204 130 205 122 202 Z"            fill="#E6E2DA"/>
      <path d="M122 202 C130 206 144 206 150 202 L150 208 C140 211 126 210 122 206 Z" fill="#BBBAB0"/>
      <path d="M92 208 L118 208 L116 218 C108 220 96 219 92 215 Z"              fill="#F0EDE7"/>
      <path d="M122 208 L148 208 L148 215 C144 219 130 220 122 217 Z"            fill="#E8E5DF"/>

      <line x1="120" y1="168" x2="120" y2="220"   stroke="#BCBAB0" stroke-width="1.8"/>
      <path d="M88 188 Q120 190 152 188"  fill="none" stroke="#BCBAB0" stroke-width="1.5"/>
      <path d="M88 206 Q120 208 152 206"  fill="none" stroke="#BCBAB0" stroke-width="1.5"/>

      <path d="M76 162 C66 170 62 180 66 190"  fill="none" stroke="#D0CAC0" stroke-width="2"   stroke-linecap="round"/>
      <path d="M78 176 C68 184 64 194 70 204"  fill="none" stroke="#D0CAC0" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M164 162 C174 170 178 180 174 190" fill="none" stroke="#D0CAC0" stroke-width="2"   stroke-linecap="round"/>
      <path d="M162 176 C172 184 176 194 170 204" fill="none" stroke="#D0CAC0" stroke-width="1.8" stroke-linecap="round"/>

      <path d="M80 112 C94 108 108 106 120 106 C132 106 146 108 160 112"
            fill="none" stroke="#D4D0C8" stroke-width="1.8" stroke-linecap="round"/>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENE 1 — LOGIN: VIOLENT DOOR KICK
  // Zoom-in entry. At 38 % of animation: doors explode open with
  // cubic-bezier overshoot, camera shake fires, shockwave ring expands,
  // 7 dust particles scatter from the kick impact point.
  // ─────────────────────────────────────────────────────────────────────────
  function _login() {
    return `
    <svg viewBox="0 0 310 315" width="272" height="252"
         xmlns="http://www.w3.org/2000/svg" overflow="visible">
      <defs>
        <filter id="l1gf" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <style>
          @keyframes l1-zoom {
            from { transform:scale(1.1) }
            to   { transform:scale(1) }
          }
          @keyframes l1-shake {
            0%,100% { transform:translate(0,0) rotate(0deg) }
            7%  { transform:translate(-7px,-5px) rotate(-.9deg) }
            14% { transform:translate(8px,6px)   rotate(.8deg) }
            21% { transform:translate(-6px,7px)  rotate(-.7deg) }
            28% { transform:translate(7px,-6px)  rotate(.7deg) }
            35% { transform:translate(-5px,5px)  rotate(-.5deg) }
            42% { transform:translate(5px,-4px)  rotate(.5deg) }
            49% { transform:translate(-4px,4px)  rotate(-.4deg) }
            56% { transform:translate(4px,-3px)  rotate(.3deg) }
            63% { transform:translate(-3px,3px)  rotate(-.3deg) }
            70% { transform:translate(2px,-2px)  rotate(.2deg) }
            77% { transform:translate(-2px,2px)  rotate(-.2deg) }
            84% { transform:translate(1px,-1px)  rotate(.1deg) }
          }
          @keyframes l1-dL {
            0%,38% { transform:rotate(0deg) }
            72%    { transform:rotate(-96deg) }
            84%    { transform:rotate(-87deg) }
            100%   { transform:rotate(-90deg) }
          }
          @keyframes l1-dR {
            0%,38% { transform:rotate(0deg) }
            72%    { transform:rotate(96deg) }
            84%    { transform:rotate(87deg) }
            100%   { transform:rotate(90deg) }
          }
          @keyframes l1-kick {
            0%,22% { transform:rotate(0deg) }
            60%,100% { transform:rotate(32deg) }
          }
          @keyframes l1-dust {
            0%   { opacity:0; transform:translate(0,0) scale(0) }
            22%  { opacity:.9; transform:translate(calc(var(--dx)*.4),calc(var(--dy)*.4)) scale(1) }
            100% { opacity:0; transform:translate(var(--dx),var(--dy)) scale(.22) }
          }
          @keyframes l1-flash {
            0%,36%,100% { opacity:0 }
            41%,53%     { opacity:.55 }
          }
          @keyframes l1-ring {
            0%,36% { r:0;  opacity:.88 }
            100%   { r:58; opacity:0 }
          }
          @keyframes l1-breathe {
            0%,100% { transform:scaleY(1) }
            50%     { transform:scaleY(1.022) }
          }
          #l1-scene   { animation:l1-zoom .52s cubic-bezier(0.22,1,0.36,1) forwards }
          #l1-shake   { animation:l1-shake .48s cubic-bezier(0.36,.07,.19,.97) .52s both }
          #l1-dL      { transform-origin:218px 64px;
                        animation:l1-dL 1.2s cubic-bezier(0.34,1.5,0.64,1) .48s forwards }
          #l1-dR      { transform-origin:260px 64px;
                        animation:l1-dR 1.2s cubic-bezier(0.34,1.5,0.64,1) .48s forwards }
          #l1-kleg    { transform-origin:110px 218px;
                        animation:l1-kick .38s cubic-bezier(0.22,1.6,0.36,1) .36s both }
          .l1d        { animation:l1-dust 1s cubic-bezier(0.22,1,0.36,1) .58s forwards }
          .l1d:nth-child(1){--dx:-26px;--dy:-36px}
          .l1d:nth-child(2){--dx:-12px;--dy:-50px;animation-delay:.62s}
          .l1d:nth-child(3){--dx:16px; --dy:-42px;animation-delay:.57s}
          .l1d:nth-child(4){--dx:30px; --dy:-28px;animation-delay:.64s}
          .l1d:nth-child(5){--dx:-20px;--dy:-32px;animation-delay:.69s}
          .l1d:nth-child(6){--dx:8px;  --dy:-52px;animation-delay:.54s}
          .l1d:nth-child(7){--dx:-30px;--dy:-22px;animation-delay:.72s}
          #l1-flash   { animation:l1-flash .5s .48s both }
          #l1-ring    { animation:l1-ring 1.1s cubic-bezier(0.22,1,0.36,1) .5s forwards }
          #l1-breath  { transform-origin:107px 178px;
                        animation:l1-breathe 2.5s ease-in-out 1.1s infinite }
        </style>
      </defs>

      <!-- Blue energy flash at impact -->
      <rect id="l1-flash" x="200" y="54" width="114" height="252" rx="5"
            fill="#4488EE" opacity="0"/>

      <g id="l1-scene"><g id="l1-shake">

        <!-- Floor lines -->
        <line x1="0" y1="292" x2="310" y2="292"
              stroke="rgba(255,255,255,.15)" stroke-width="2"/>
        <line x1="0" y1="296" x2="310" y2="296"
              stroke="rgba(255,255,255,.05)" stroke-width="1"/>

        <!-- Shockwave ring -->
        <circle id="l1-ring" cx="237" cy="175" r="0"
                fill="none" stroke="#4488EE" stroke-width="3" opacity="0"/>

        <!-- Door frame — heavy industrial steel -->
        <rect x="212" y="60" width="56" height="234" rx="2"
              fill="none" stroke="rgba(255,255,255,.3)" stroke-width="3.5"/>
        <circle cx="216" cy="70"  r="3.5" fill="rgba(255,255,255,.22)"/>
        <circle cx="264" cy="70"  r="3.5" fill="rgba(255,255,255,.22)"/>
        <circle cx="216" cy="288" r="3.5" fill="rgba(255,255,255,.22)"/>
        <circle cx="264" cy="288" r="3.5" fill="rgba(255,255,255,.22)"/>

        <!-- Left door panel -->
        <g id="l1-dL">
          <rect x="215" y="64" width="24" height="226"
                fill="#252420" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/>
          <line x1="220" y1="74" x2="220" y2="282" stroke="rgba(255,255,255,.05)" stroke-width="1"/>
          <line x1="226" y1="74" x2="226" y2="282" stroke="rgba(255,255,255,.04)" stroke-width="1"/>
          <rect x="218" y="84"  width="18" height="86" rx="2"
                fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1"/>
          <rect x="218" y="180" width="18" height="86" rx="2"
                fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1"/>
        </g>

        <!-- Right door panel -->
        <g id="l1-dR">
          <rect x="239" y="64" width="24" height="226"
                fill="#221F1D" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/>
          <line x1="244" y1="74" x2="244" y2="282" stroke="rgba(255,255,255,.05)" stroke-width="1"/>
          <line x1="250" y1="74" x2="250" y2="282" stroke="rgba(255,255,255,.04)" stroke-width="1"/>
          <rect x="242" y="84"  width="18" height="86" rx="2"
                fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1"/>
          <rect x="242" y="180" width="18" height="86" rx="2"
                fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1"/>
          <circle cx="241" cy="185" r="5.5" fill="#7A6040" stroke="#9A7A50" stroke-width="1.5"/>
        </g>

        <!-- Impact star cluster (glowing) -->
        <g filter="url(#l1gf)">
          <path d="M237 175L241 159L245 175L261 170L247 179L252 195L237 187L222 195L227 179L213 170Z"
                fill="#4488EE" opacity=".85"/>
          <path d="M237 175L240 164L243 175L254 172L244 178L247 189L237 183L227 189L230 178L220 172Z"
                fill="#88BBFF" opacity=".5"/>
        </g>

        <!-- Floor shadow -->
        <ellipse cx="107" cy="295" rx="48" ry="8" fill="rgba(0,0,0,.42)"/>

        <!-- PANDA KICK POSE -->
        <g id="l1-breath">

          <!-- Support leg (left, planted) -->
          <rect x="68" y="220" width="34" height="54" rx="16"
                fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
          <ellipse cx="85" cy="277" rx="23" ry="10"
                   fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>

          <!-- Kicking leg (right) — thigh raised, shin drives right -->
          <g id="l1-kleg">
            <rect x="110" y="202" width="34" height="52" rx="16"
                  fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
            <rect x="128" y="216" width="68" height="30" rx="14"
                  fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"
                  transform="rotate(-20 128 231)"/>
            <ellipse cx="200" cy="218" rx="28" ry="12"
                     fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"
                     transform="rotate(-20 200 218)"/>
          </g>

          <!-- Torso -->
          ${_torso()}

          <!-- Left arm — extended outward for balance -->
          <path d="M16 132C8 138 2 152 4 168C6 182 14 190 24 190L50 188C60 186 66 176 64 162C62 148 54 136 44 132C34 128 22 128 16 132Z"
                fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
          <path d="M12 142C6 154 6 170 10 180"
                fill="none" stroke="#2E2E2C" stroke-width="2"/>
          <rect x="8" y="190" width="32" height="46" rx="14"
                fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
          <ellipse cx="24" cy="240" rx="18" ry="11"
                   fill="#F0EDE8" stroke="#0A0A0A" stroke-width="2"/>

          <!-- Right arm — coiled back for power -->
          <path d="M146 132C156 128 170 130 178 140C186 150 184 166 174 174C164 182 152 184 142 182L120 176C110 172 106 162 110 150C114 140 128 132 146 132Z"
                fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
          <path d="M174 138C182 150 182 168 174 178"
                fill="none" stroke="#2E2E2C" stroke-width="2"/>
          <rect x="114" y="182" width="32" height="46" rx="14"
                fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
          <!-- Clenched fist -->
          <path d="M110 228C106 236 110 246 120 248L152 246C162 244 164 234 158 228L136 224C124 222 112 224 110 228Z"
                fill="#F0EDE8" stroke="#0A0A0A" stroke-width="2"/>
          <line x1="126" y1="224" x2="126" y2="244" stroke="#D8D4CE" stroke-width="1"/>
          <line x1="138" y1="224" x2="138" y2="244" stroke="#D8D4CE" stroke-width="1"/>
          <line x1="150" y1="224" x2="150" y2="244" stroke="#D8D4CE" stroke-width="1"/>

          <!-- Head (roaring) -->
          ${_head('roar')}
        </g>

        <!-- Dust particles at kick foot -->
        <g class="l1d"><ellipse cx="197" cy="226" rx="10" ry="7"
            fill="rgba(220,215,205,.75)" opacity="0"/></g>
        <g class="l1d"><ellipse cx="203" cy="224" rx="7"  ry="5"
            fill="rgba(200,195,185,.65)" opacity="0"/></g>
        <g class="l1d"><ellipse cx="208" cy="229" rx="8"  ry="4"
            fill="rgba(210,205,195,.70)" opacity="0"/></g>
        <g class="l1d"><ellipse cx="193" cy="222" rx="6"  ry="5"
            fill="rgba(220,215,205,.65)" opacity="0"/></g>
        <g class="l1d"><ellipse cx="188" cy="228" rx="7"  ry="4"
            fill="rgba(215,210,200,.60)" opacity="0"/></g>
        <g class="l1d"><ellipse cx="200" cy="218" rx="5"  ry="4"
            fill="rgba(225,220,210,.55)" opacity="0"/></g>
        <g class="l1d"><ellipse cx="212" cy="222" rx="6"  ry="3"
            fill="rgba(220,215,205,.50)" opacity="0"/></g>

      </g></g>
    </svg>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENE 2 — TRAINING: ELECTRIC DOUBLE-BICEP FLEX
  // SVG feGaussianBlur + feColorMatrix teal glow on bicep peaks.
  // 8 zigzag lightning sparks stagger around the body.
  // Aura ellipse and floor shadow pulse together.
  // Teal pupils glow in sync with the aura.
  // ─────────────────────────────────────────────────────────────────────────
  function _training() {
    return `
    <svg viewBox="0 0 260 318" width="258" height="252"
         xmlns="http://www.w3.org/2000/svg" overflow="visible">
      <defs>
        <!-- Teal glow for bicep peaks -->
        <filter id="t2-bic" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="11" result="b"/>
          <feColorMatrix in="b" type="matrix"
            values="0 0 0 0 .11  0 0 0 0 .62  0 0 0 0 .46  0 0 0 2.8 -1.2"
            result="teal"/>
          <feMerge><feMergeNode in="teal"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <!-- Soft glow for spark bolts -->
        <filter id="t2-spk" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <style>
          @keyframes t2-aura {
            0%,100% { transform:scale(1);   opacity:.20 }
            50%     { transform:scale(1.14); opacity:.38 }
          }
          @keyframes t2-bicep {
            0%,100% { transform:scale(1) }
            35%     { transform:scale(1.12) }
            65%     { transform:scale(1.07) }
          }
          @keyframes t2-body {
            0%,100% { transform:scaleY(1)    }
            50%     { transform:scaleY(1.024) }
          }
          @keyframes t2-shadow {
            0%,100% { rx:52; opacity:.32 }
            50%     { rx:60; opacity:.50 }
          }
          @keyframes t2-spark {
            0%,100% { opacity:0; transform:scale(0)    rotate(0deg) }
            18%,55% { opacity:1; transform:scale(1)    rotate(var(--sr)) }
            85%     { opacity:0; transform:scale(.15)  rotate(calc(var(--sr)*2)) }
          }
          @keyframes t2-pupil {
            0%,100% { opacity:.55 }
            50%     { opacity:1 }
          }
          #t2-aura   { transform-origin:130px 180px;
                       animation:t2-aura 1.15s cubic-bezier(0.45,.05,.55,.95) infinite }
          #t2-bL     { transform-origin:20px 108px;
                       animation:t2-bicep 1.15s cubic-bezier(0.34,1.56,0.64,1) infinite }
          #t2-bR     { transform-origin:240px 108px;
                       animation:t2-bicep 1.15s cubic-bezier(0.34,1.56,0.64,1) .08s infinite }
          #t2-body   { transform-origin:130px 185px;
                       animation:t2-body 2.6s ease-in-out infinite }
          #t2-shadow { animation:t2-shadow 1.15s ease-in-out infinite }
          .t2sp      { animation:t2-spark 1.05s ease-in-out infinite }
          .t2sp:nth-child(1){--sr:22deg;  animation-delay:0s}
          .t2sp:nth-child(2){--sr:-38deg; animation-delay:.14s}
          .t2sp:nth-child(3){--sr:58deg;  animation-delay:.28s}
          .t2sp:nth-child(4){--sr:-18deg; animation-delay:.42s}
          .t2sp:nth-child(5){--sr:76deg;  animation-delay:.56s}
          .t2sp:nth-child(6){--sr:-52deg; animation-delay:.70s}
          .t2sp:nth-child(7){--sr:32deg;  animation-delay:.84s}
          .t2sp:nth-child(8){--sr:-66deg; animation-delay:.98s}
          .t2gp      { animation:t2-pupil 1.15s ease-in-out infinite }
        </style>
      </defs>

      <!-- Pulsing teal aura -->
      <ellipse id="t2-aura" cx="130" cy="185" rx="96" ry="122" fill="#1D9E75" opacity=".20"/>

      <!-- Ground shadow (pulses with aura) -->
      <ellipse id="t2-shadow" cx="130" cy="298" rx="52" ry="8"
               fill="rgba(29,158,117,.40)"/>
      <line x1="0" y1="293" x2="260" y2="293"
            stroke="rgba(255,255,255,.12)" stroke-width="1.5"/>

      <!-- 8 staggered lightning bolt sparks -->
      <g class="t2sp" filter="url(#t2-spk)">
        <path d="M22 94L32 80L26 92L38 78"
              fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round"/>
      </g>
      <g class="t2sp" filter="url(#t2-spk)">
        <path d="M226 86L236 72L230 84L242 70"
              fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round"/>
      </g>
      <g class="t2sp" filter="url(#t2-spk)">
        <path d="M8 140L18 126L12 138L24 124"
              fill="none" stroke="#1D9E75" stroke-width="2.5" stroke-linecap="round"/>
      </g>
      <g class="t2sp" filter="url(#t2-spk)">
        <path d="M238 134L248 120L242 132L254 118"
              fill="none" stroke="#1D9E75" stroke-width="2.5" stroke-linecap="round"/>
      </g>
      <g class="t2sp" filter="url(#t2-spk)">
        <path d="M54 44L64 30L58 42L70 28"
              fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g class="t2sp" filter="url(#t2-spk)">
        <path d="M196 46L206 32L200 44L212 30"
              fill="none" stroke="#FFD700" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g class="t2sp" filter="url(#t2-spk)">
        <path d="M4 182L14 168L8 180L20 166"
              fill="none" stroke="#1D9E75" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g class="t2sp" filter="url(#t2-spk)">
        <path d="M246 176L256 162L250 174L262 160"
              fill="none" stroke="#1D9E75" stroke-width="2" stroke-linecap="round"/>
      </g>

      <g id="t2-body">
        <!-- Legs -->
        <rect x="78"  y="226" width="36" height="54" rx="17"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <ellipse cx="96"  cy="283" rx="24" ry="10"
                 fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <rect x="146" y="226" width="36" height="54" rx="17"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <ellipse cx="164" cy="283" rx="24" ry="10"
                 fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>

        <!-- Torso -->
        ${_torso()}

        <!-- LEFT FLEX ARM — upper arm angled up-left, massive glowing bicep -->
        <path d="M10 90C2 96-2 112-2 126C-2 140 6 152 18 154L44 152C56 150 62 138 60 124C58 110 48 96 36 92C24 88 14 86 10 90Z"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <g id="t2-bL" filter="url(#t2-bic)">
          <ellipse cx="20" cy="108" rx="26" ry="30" fill="#141412" stroke="#0A0A0A" stroke-width="1.5"/>
        </g>
        <path d="M8 98C2 110 2 128 8 140"
              fill="none" stroke="#2E2E2C" stroke-width="2"/>
        <!-- Forearm pointing up -->
        <rect x="4"  y="46" width="34" height="52" rx="16"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <ellipse cx="21" cy="42" rx="19" ry="13"
                 fill="#F0EDE8" stroke="#0A0A0A" stroke-width="2"
                 transform="rotate(8 21 42)"/>

        <!-- RIGHT FLEX ARM — mirror -->
        <path d="M210 90C218 86 228 88 236 94C244 100 248 116 244 130C240 144 228 152 216 152L190 150C178 148 174 136 178 122C182 108 196 94 210 90Z"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <g id="t2-bR" filter="url(#t2-bic)">
          <ellipse cx="240" cy="108" rx="26" ry="30" fill="#141412" stroke="#0A0A0A" stroke-width="1.5"/>
        </g>
        <path d="M252 98C258 110 258 128 252 140"
              fill="none" stroke="#2E2E2C" stroke-width="2"/>
        <rect x="222" y="46" width="34" height="52" rx="16"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <ellipse cx="239" cy="42" rx="19" ry="13"
                 fill="#F0EDE8" stroke="#0A0A0A" stroke-width="2"
                 transform="rotate(-8 239 42)"/>

        <!-- Head (roar) -->
        ${_head('roar')}

        <!-- Teal glowing pupils (pulsing) -->
        <circle class="t2gp" cx="100" cy="77" r="4"
                fill="#1D9E75" opacity=".55" filter="url(#t2-spk)"/>
        <circle class="t2gp" cx="140" cy="77" r="4"
                fill="#1D9E75" opacity=".55" filter="url(#t2-spk)"/>
      </g>
    </svg>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENE 3 — NUTRITION: INDUSTRIAL SCALE DROP
  // Panda drops onto a heavy steel scale. Scale platform spring-bounces
  // with a 6-stage cubic-bezier(0.34,1.7,0.64,1) settle. Analog dial
  // needle spins 720° + then snaps to reading. Camera shake on impact.
  // Three steam wisps rise continuously from the panda's shoulders.
  // ─────────────────────────────────────────────────────────────────────────
  function _nutrition() {
    return `
    <svg viewBox="0 0 240 330" width="240" height="252"
         xmlns="http://www.w3.org/2000/svg" overflow="visible">
      <defs>
        <style>
          @keyframes n3-drop {
            0%,22% { transform:translateY(-22px) }
            35%    { transform:translateY(0) scaleY(.93) }
            100%   { transform:translateY(0) scaleY(1) }
          }
          @keyframes n3-bounce {
            0%,22% { transform:translateY(0)   scaleY(1)    }
            38%    { transform:translateY(15px) scaleY(.91)  }
            54%    { transform:translateY(-6px) scaleY(1.05) }
            67%    { transform:translateY(3px)  scaleY(.98)  }
            78%    { transform:translateY(-2px) scaleY(1.01) }
            88%    { transform:translateY(1px)  scaleY(1)    }
            100%   { transform:translateY(0)   scaleY(1)    }
          }
          @keyframes n3-needle {
            0%,20% { transform:rotate(-70deg) }
            80%    { transform:rotate(162deg)  }
            93%    { transform:rotate(138deg)  }
            100%   { transform:rotate(148deg)  }
          }
          @keyframes n3-steam {
            0%   { opacity:0;   transform:translate(0,0)   scaleX(1)   }
            18%  { opacity:.60; transform:translate(0,-10px) scaleX(1) }
            100% { opacity:0;   transform:translate(var(--sx),-54px) scaleX(2.2) }
          }
          @keyframes n3-shake {
            0%,100% { transform:translate(0,0) }
            8%  { transform:translate(-5px, 3px) }
            16% { transform:translate( 5px,-4px) }
            24% { transform:translate(-4px, 4px) }
            40% { transform:translate( 3px,-3px) }
            60% { transform:translate(-2px, 2px) }
            80% { transform:translate( 1px,-1px) }
          }
          @keyframes n3-ring {
            0%,22% { r:0;  opacity:.82 }
            100%   { r:60; opacity:0  }
          }
          @keyframes n3-breathe {
            0%,100% { transform:scaleY(1)    }
            50%     { transform:scaleY(1.022) }
          }
          #n3-panda  { animation:n3-drop .55s cubic-bezier(0.22,1,0.36,1) .28s both }
          #n3-scale  { transform-origin:120px 286px;
                       animation:n3-bounce 1.6s cubic-bezier(0.34,1.7,0.64,1) .3s }
          #n3-needle { transform-origin:120px 265px;
                       animation:n3-needle 1.8s cubic-bezier(0.34,1.9,0.64,1) .34s both }
          #n3-sw     { animation:n3-shake .32s cubic-bezier(0.36,.07,.19,.97) .42s both }
          .n3stm     { animation:n3-steam 2.2s cubic-bezier(0.22,1,0.36,1) .82s infinite }
          .n3stm:nth-child(1){--sx:-7px; animation-delay:.82s}
          .n3stm:nth-child(2){--sx: 5px; animation-delay:.96s}
          .n3stm:nth-child(3){--sx:-11px;animation-delay:1.12s}
          #n3-ring   { animation:n3-ring 1.3s cubic-bezier(0.22,1,0.36,1) .36s forwards }
          #n3-breath { transform-origin:120px 178px;
                       animation:n3-breathe 2.5s ease-in-out infinite }
        </style>
      </defs>

      <!-- Floor + shadow -->
      <ellipse cx="120" cy="305" rx="46" ry="8" fill="rgba(0,0,0,.42)"/>
      <line x1="0" y1="301" x2="240" y2="301"
            stroke="rgba(255,255,255,.12)" stroke-width="1.5"/>

      <!-- Shockwave ring at impact -->
      <circle id="n3-ring" cx="120" cy="278" r="0"
              fill="none" stroke="#4488EE" stroke-width="3" opacity="0"/>

      <!-- INDUSTRIAL SCALE (bounces on impact) -->
      <g id="n3-sw"><g id="n3-scale">
        <!-- Heavy base with grip grating -->
        <rect x="50" y="282" width="140" height="24" rx="5"
              fill="#484C50" stroke="#383C40" stroke-width="2"/>
        <line x1="60" y1="287" x2="170" y2="287" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
        <line x1="60" y1="291" x2="170" y2="291" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
        <line x1="60" y1="295" x2="170" y2="295" stroke="rgba(0,0,0,.2)" stroke-width="1"/>
        <!-- Scale legs -->
        <rect x="58"  y="302" width="16" height="10" rx="3" fill="#3A3E42"/>
        <rect x="166" y="302" width="16" height="10" rx="3" fill="#3A3E42"/>
        <!-- Dial housing — heavy industrial ring -->
        <circle cx="120" cy="266" r="34"
                fill="#383C40" stroke="#505458" stroke-width="3"/>
        <circle cx="120" cy="266" r="27"
                fill="#282C30" stroke="#404448" stroke-width="1.5"/>
        <!-- Tick marks around dial face -->
        <line x1="120" y1="242" x2="120" y2="246" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
        <line x1="143" y1="249" x2="141" y2="252" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>
        <line x1="150" y1="266" x2="146" y2="266" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>
        <line x1="143" y1="283" x2="141" y2="280" stroke="rgba(255,255,255,.25)" stroke-width="1"/>
        <line x1="97"  y1="249" x2="99"  y2="252" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>
        <line x1="90"  y1="266" x2="94"  y2="266" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>
        <line x1="97"  y1="283" x2="99"  y2="280" stroke="rgba(255,255,255,.25)" stroke-width="1"/>
        <!-- Spinning needle -->
        <line id="n3-needle" x1="120" y1="265" x2="120" y2="244"
              stroke="#FF4422" stroke-width="3" stroke-linecap="round"
              transform="rotate(-70 120 265)"/>
        <circle cx="120" cy="265" r="5" fill="#606468" stroke="#808488" stroke-width="1.5"/>
        <!-- Platform with grip lines -->
        <rect x="58" y="262" width="124" height="22" rx="4"
              fill="#545860" stroke="#404448" stroke-width="1.5"/>
        <line x1="68" y1="268" x2="172" y2="268" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
        <line x1="68" y1="273" x2="172" y2="273" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
        <line x1="68" y1="278" x2="172" y2="278" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
      </g></g>

      <!-- Steam wisps rising from shoulders -->
      <g class="n3stm">
        <path d="M80 126Q75 114 80 102Q85 90 80 78"
              fill="none" stroke="rgba(160,205,245,.5)" stroke-width="4"
              stroke-linecap="round" opacity="0"/>
      </g>
      <g class="n3stm">
        <path d="M85 122Q81 110 85 98Q89 86 85 74"
              fill="none" stroke="rgba(160,205,245,.4)" stroke-width="3"
              stroke-linecap="round" opacity="0"/>
      </g>
      <g class="n3stm">
        <path d="M76 130Q72 116 76 104Q80 92 76 80"
              fill="none" stroke="rgba(160,205,245,.45)" stroke-width="3"
              stroke-linecap="round" opacity="0"/>
      </g>

      <!-- PANDA (drops onto scale) -->
      <g id="n3-breath"><g id="n3-panda">

        <!-- Legs (feet flat on platform) -->
        <rect x="70"  y="220" width="34" height="46" rx="16"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <ellipse cx="87"  cy="268" rx="23" ry="10"
                 fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <rect x="136" y="220" width="34" height="46" rx="16"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <ellipse cx="153" cy="268" rx="23" ry="10"
                 fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>

        <!-- Body -->
        ${_torso()}

        <!-- Left arm — confident akimbo -->
        <path d="M18 132C10 138 4 152 6 166C8 180 18 188 28 188L54 186C64 184 70 174 68 160C66 148 56 136 46 132C36 128 24 128 18 132Z"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <path d="M12 142C6 154 6 170 12 180"
              fill="none" stroke="#2E2E2C" stroke-width="2"/>
        <rect x="16" y="188" width="32" height="44" rx="14"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <path d="M14 232C10 238 12 248 22 250C32 252 46 250 54 244C60 238 58 228 50 224L28 222C20 222 16 228 14 232Z"
              fill="#F0EDE8" stroke="#0A0A0A" stroke-width="2"/>

        <!-- Right arm — other side akimbo -->
        <path d="M178 132C190 128 204 130 210 140C216 150 212 166 202 174C192 182 180 184 170 182L148 176C138 172 134 162 140 150C146 140 160 132 178 132Z"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <path d="M208 140C216 152 214 170 206 180"
              fill="none" stroke="#2E2E2C" stroke-width="2"/>
        <rect x="192" y="184" width="32" height="44" rx="14"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <path d="M186 232C184 238 186 248 196 250C206 252 220 250 226 242C230 236 226 226 218 224L198 222C190 222 186 228 186 232Z"
              fill="#F0EDE8" stroke="#0A0A0A" stroke-width="2"/>

        <!-- Head (smug half-lidded) -->
        ${_head('smug')}

      </g></g>
    </svg>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENE 4 — STATS: PENCIL SNAP + EYE FLARE
  // Rapid multi-stage scribble (9-keyframe cubic-bezier arm).
  // feColorMatrix red filter builds on eye overlay (0 → full at 82 %).
  // At 83 %: pencil whole vanishes; top half flies; bottom stays; 6 splinters
  // burst outward with CSS custom property per-particle transforms.
  // Screen flashes white 3 times. Eye glow persists at high intensity.
  // ─────────────────────────────────────────────────────────────────────────
  function _stats() {
    return `
    <svg viewBox="0 0 250 315" width="245" height="252"
         xmlns="http://www.w3.org/2000/svg" overflow="visible">
      <defs>
        <!-- Red eye-flare filter -->
        <filter id="s4-eye" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b"/>
          <feColorMatrix in="b" type="matrix"
            values="4 0 0 0 0  0 .15 0 0 0  0 0 .05 0 0  0 0 0 3.5 -1.5"
            result="r"/>
          <feMerge><feMergeNode in="r"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <!-- Soft glow for particle splinters -->
        <filter id="s4-prt" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <style>
          @keyframes s4-scrib {
            0%,100% { transform:rotate(-9deg)  translate(0,0) }
            11%     { transform:rotate(8deg)   translate(5px,5px) }
            22%     { transform:rotate(-6deg)  translate(-2px,7px) }
            33%     { transform:rotate(10deg)  translate(6px,3px) }
            44%     { transform:rotate(-7deg)  translate(-1px,6px) }
            55%     { transform:rotate(11deg)  translate(7px,4px) }
            66%     { transform:rotate(-8deg)  translate(-3px,5px) }
            77%     { transform:rotate(12deg)  translate(8px,3px) }
            88%     { transform:rotate(-5deg)  translate(-1px,7px) }
          }
          @keyframes s4-glow {
            0%       { opacity:0 }
            40%      { opacity:.35; filter:brightness(1.3) }
            75%      { opacity:.85; filter:brightness(2)   drop-shadow(0 0 8px  #FF4422) }
            82%      { opacity:.90; filter:brightness(2.5) drop-shadow(0 0 14px #FF5533) }
            84%,86%,88%,90%
                     { opacity:1;   filter:brightness(4)   drop-shadow(0 0 18px #FF6644) }
            85%,87%,89%
                     { opacity:.5;  filter:brightness(2.5) drop-shadow(0 0 10px #FF4422) }
            100%     { opacity:.9;  filter:brightness(2.2) drop-shadow(0 0 10px #FF4422) }
          }
          @keyframes s4-pw   { 0%,82%{opacity:1} 83%,100%{opacity:0} }
          @keyframes s4-pt   {
            0%,82%{opacity:0;transform:translate(0,0)rotate(0)}
            83%   {opacity:1}
            100%  {opacity:1;transform:translate(-32px,-40px)rotate(-55deg)}
          }
          @keyframes s4-pb   {
            0%,82%{opacity:0;transform:translate(0,0)rotate(0)}
            83%   {opacity:1}
            100%  {opacity:1;transform:translate(14px,20px)rotate(26deg)}
          }
          @keyframes s4-spl  {
            0%,82%{opacity:0;transform:translate(0,0)scale(0)}
            83%   {opacity:1;transform:translate(0,0)scale(1)}
            100%  {opacity:0;transform:translate(var(--sdx),var(--sdy))scale(.14)}
          }
          @keyframes s4-flash{
            0%,81%,100%{opacity:0}
            83%,87%,91%{opacity:.28}
            85%,89%    {opacity:0}
          }
          @keyframes s4-breathe{
            0%,100%{transform:scaleY(1)}
            50%    {transform:scaleY(1.025)}
          }
          #s4-arm   { transform-origin:172px 172px;
                      animation:s4-scrib .5s cubic-bezier(0.34,1.56,0.64,1) infinite }
          #s4-glow  { animation:s4-glow  2.2s cubic-bezier(0.22,1,0.36,1)   forwards }
          #s4-pw    { animation:s4-pw    2.2s linear forwards }
          #s4-pt    { animation:s4-pt    2.2s cubic-bezier(0.22,2,0.36,1)   forwards }
          #s4-pb    { animation:s4-pb    2.2s cubic-bezier(0.22,1.6,0.36,1) forwards }
          .s4sp     { animation:s4-spl   2.2s cubic-bezier(0.22,1.3,0.36,1) forwards }
          .s4sp:nth-child(1){--sdx:-34px;--sdy:-32px}
          .s4sp:nth-child(2){--sdx: 32px;--sdy:-26px;animation-delay:.010s}
          .s4sp:nth-child(3){--sdx:-20px;--sdy: 30px;animation-delay:.030s}
          .s4sp:nth-child(4){--sdx: 36px;--sdy: 24px;animation-delay:.020s}
          .s4sp:nth-child(5){--sdx:-28px;--sdy:-22px;animation-delay:.040s}
          .s4sp:nth-child(6){--sdx: 22px;--sdy: 34px;animation-delay:.005s}
          #s4-fl    { animation:s4-flash   2.2s linear forwards }
          #s4-body  { transform-origin:125px 178px;
                      animation:s4-breathe 2.6s ease-in-out infinite }
        </style>
      </defs>

      <!-- White strobe flash at pencil snap -->
      <ellipse id="s4-fl" cx="140" cy="196" rx="52" ry="40" fill="white" opacity="0"/>

      <!-- Floor + shadow -->
      <ellipse cx="125" cy="297" rx="46" ry="8" fill="rgba(0,0,0,.38)"/>
      <line x1="0" y1="294" x2="250" y2="294"
            stroke="rgba(255,255,255,.12)" stroke-width="1.5"/>

      <g id="s4-body">
        <!-- Legs -->
        <rect x="76"  y="224" width="34" height="54" rx="16"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <ellipse cx="93"  cy="281" rx="23" ry="10"
                 fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <rect x="140" y="224" width="34" height="54" rx="16"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <ellipse cx="157" cy="281" rx="23" ry="10"
                 fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>

        <!-- Body -->
        ${_torso()}

        <!-- LEFT ARM holding notebook -->
        <path d="M20 132C12 138 6 154 8 168C10 182 20 190 30 190L56 188C66 186 72 176 70 162C68 148 58 136 48 132C38 128 26 128 20 132Z"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <path d="M14 142C8 154 8 170 14 182"
              fill="none" stroke="#2E2E2C" stroke-width="2"/>
        <rect x="18" y="182" width="70" height="30" rx="14"
              fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
        <ellipse cx="92" cy="197" rx="16" ry="10"
                 fill="#F0EDE8" stroke="#0A0A0A" stroke-width="2"/>

        <!-- Clipboard — detailed ruled notebook -->
        <rect x="46" y="154" width="78" height="94" rx="6"
              fill="#F2E4CC" stroke="#C8A060" stroke-width="2.5"/>
        <rect x="68" y="147" width="34" height="13" rx="5"
              fill="#C8A060" stroke="#A88040" stroke-width="1.5"/>
        <line x1="54" y1="173" x2="116" y2="173" stroke="#D8C090" stroke-width="1.5"/>
        <line x1="54" y1="184" x2="116" y2="184" stroke="#D8C090" stroke-width="1.5"/>
        <line x1="54" y1="195" x2="116" y2="195" stroke="#D8C090" stroke-width="1.5"/>
        <line x1="54" y1="206" x2="112" y2="206" stroke="#D8C090" stroke-width="1.5"/>
        <line x1="54" y1="217" x2="106" y2="217" stroke="#D8C090" stroke-width="1.5"/>
        <!-- Aggressive scribble marks already on page -->
        <path d="M56 177Q66 173 74 178Q82 183 90 176Q98 169 108 175"
              fill="none" stroke="#444" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M56 188Q68 184 74 189Q82 194 90 188Q98 182 110 188"
              fill="none" stroke="#444" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M56 199Q64 196 72 201Q80 206 88 200"
              fill="none" stroke="#333" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M56 210Q62 207 70 212"
              fill="none" stroke="#333" stroke-width="1.8" stroke-linecap="round"/>

        <!-- RIGHT ARM — rapid scribble, animated -->
        <g id="s4-arm">
          <path d="M172 132C182 128 196 130 202 140C208 150 206 166 198 174C190 182 178 184 168 182L146 176C136 172 132 162 138 150C144 140 158 132 172 132Z"
                fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"/>
          <path d="M200 140C208 152 206 170 198 180"
                fill="none" stroke="#2E2E2C" stroke-width="2"/>
          <rect x="136" y="178" width="52" height="28" rx="13"
                fill="#1A1A18" stroke="#0A0A0A" stroke-width="2.5"
                transform="rotate(-24 162 192)"/>
          <ellipse cx="118" cy="200" rx="15" ry="10"
                   fill="#F0EDE8" stroke="#0A0A0A" stroke-width="2"
                   transform="rotate(-24 118 200)"/>

          <!-- Whole pencil (disappears at snap) -->
          <g id="s4-pw">
            <rect x="90" y="192" width="46" height="9" rx="3.5"
                  fill="#FFD700" stroke="#DAA520" stroke-width="1.5"
                  transform="rotate(-32 90 196)"/>
            <polygon points="90,201 81,196 90,192" fill="#F4A460"
                     transform="rotate(-32 90 196)"/>
            <polygon points="82,195 79,196 81,198" fill="#1A1A18"
                     transform="rotate(-32 90 196)"/>
            <rect x="134" y="191" width="9" height="9" rx="2.5"
                  fill="#FF9999" stroke="#DAA520" stroke-width="1"
                  transform="rotate(-32 90 196)"/>
          </g>

          <!-- Pencil top half (flies up-left on snap) -->
          <g id="s4-pt" opacity="0">
            <rect x="108" y="190" width="26" height="9" rx="3.5"
                  fill="#FFD700" stroke="#DAA520" stroke-width="1.5"
                  transform="rotate(-32 108 194)"/>
            <rect x="132" y="189" width="9"  height="9" rx="2.5"
                  fill="#FF9999" stroke="#DAA520" stroke-width="1"
                  transform="rotate(-32 108 194)"/>
          </g>

          <!-- Pencil bottom half (stays in fist) -->
          <g id="s4-pb" opacity="0">
            <rect x="86" y="194" width="24" height="9" rx="3.5"
                  fill="#FFD700" stroke="#DAA520" stroke-width="1.5"
                  transform="rotate(-32 86 198)"/>
            <polygon points="86,203 77,198 86,194" fill="#F4A460"
                     transform="rotate(-32 86 198)"/>
            <polygon points="78,197 75,198 77,200" fill="#1A1A18"
                     transform="rotate(-32 86 198)"/>
          </g>
        </g>

        <!-- Pencil snap particle splinters -->
        <g filter="url(#s4-prt)">
          <g class="s4sp">
            <rect x="109" y="194" width="7" height="2.5" rx="1.2"
                  fill="#8B6914" opacity="0" transform="rotate(-32 113 195)"/>
          </g>
          <g class="s4sp">
            <rect x="113" y="196" width="5" height="2" rx="1"
                  fill="#DAA520" opacity="0" transform="rotate(22 116 197)"/>
          </g>
          <g class="s4sp">
            <rect x="105" y="192" width="8" height="2.5" rx="1.2"
                  fill="#8B6914" opacity="0" transform="rotate(-58 109 193)"/>
          </g>
          <g class="s4sp">
            <rect x="111" y="198" width="5" height="2" rx="1"
                  fill="#F4A460" opacity="0" transform="rotate(48 114 199)"/>
          </g>
          <g class="s4sp">
            <rect x="107" y="190" width="6" height="2" rx="1"
                  fill="#DAA520" opacity="0" transform="rotate(-72 110 191)"/>
          </g>
          <g class="s4sp">
            <rect x="116" y="193" width="5" height="2" rx="1"
                  fill="#8B6914" opacity="0" transform="rotate(62 119 194)"/>
          </g>
        </g>

        <!-- Head (focused intensity, glasses) -->
        ${_head('focus', true)}

        <!-- Red eye-glow layer — builds over time, explodes at snap -->
        <g id="s4-glow" filter="url(#s4-eye)" opacity="0">
          <circle cx="100" cy="77" r="7.5" fill="#FF4422"/>
          <circle cx="140" cy="77" r="7.5" fill="#FF4422"/>
        </g>

      </g>
    </svg>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENE REGISTRY
  // ─────────────────────────────────────────────────────────────────────────
  const _scenes = {
    login:     _login,
    training:  _training,
    nutrition: _nutrition,
    stats:     _stats,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Show a panda loading scene for at least minMs milliseconds.
   * Designed for concurrent use with Promise.all:
   *
   *   await Promise.all([PandaLoader.show('training', 1800), loadTab('training')]);
   *
   * @param {'login'|'training'|'nutrition'|'stats'} scene
   * @param {number} [minMs=2000]
   * @returns {Promise<void>}
   */
  function show(scene = 'login', minMs = 2000) {
    _init();
    const { msg, sub } = COPY[scene] ?? COPY.login;
    const svg = (_scenes[scene] ?? _scenes.login)();

    _overlay.innerHTML = `${svg}<p class="panda-msg">${msg}</p><p class="panda-sub">${sub}</p>`;

    const startMs = Date.now();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => _overlay.classList.add('panda-visible'));
    });

    return new Promise(resolve => {
      setTimeout(
        () => { _overlay.classList.remove('panda-visible'); setTimeout(resolve, 270); },
        Math.max(0, minMs - (Date.now() - startMs))
      );
    });
  }

  /** Instantly hide the overlay without waiting. */
  function hide() {
    if (_overlay) _overlay.classList.remove('panda-visible');
  }

  return { show, hide };

})();
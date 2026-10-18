/**
 * Ookla-style Speedometer Gauge for Data Waster
 * High-performance SVG gauge with smooth physics, non-linear logarithmic scale,
 * glowing neon effects, and adaptive dark/light themes.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Speedometer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TICK_VALUES = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000];
  const START_ANGLE = 135;
  const END_ANGLE = 405;
  const TOTAL_SWEEP = 270;
  const CX = 180;
  const CY = 155;
  const RADIUS_TRACK = 118;
  const RADIUS_TICK_OUTER = 135;
  const RADIUS_TICK_MAJOR_INNER = 124;
  const RADIUS_TICK_MINOR_INNER = 128;
  const RADIUS_LABEL = 104;

  function polarToCartesian(cx, cy, r, angleInDegrees) {
    const rad = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: Number((cx + r * Math.cos(rad)).toFixed(2)),
      y: Number((cy + r * Math.sin(rad)).toFixed(2))
    };
  }

  function describeArc(cx, cy, r, startAngle, endAngle) {
    if (endAngle <= startAngle + 0.3) {
      return '';
    }
    const safeEnd = Math.min(endAngle, 408);
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, safeEnd);
    const sweep = safeEnd - startAngle;
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  function speedToAngle(speed) {
    if (speed <= 0 || isNaN(speed)) return START_ANGLE;
    if (speed >= 1000) {
      const excess = Math.min((speed - 1000) / 1000, 1);
      return Math.min(END_ANGLE + excess * 5, 410);
    }

    for (let i = 0; i < TICK_VALUES.length - 1; i++) {
      const v1 = TICK_VALUES[i];
      const v2 = TICK_VALUES[i + 1];
      if (speed >= v1 && speed <= v2) {
        const segmentFraction = (speed - v1) / (v2 - v1);
        const totalFraction = (i + segmentFraction) / (TICK_VALUES.length - 1);
        return START_ANGLE + totalFraction * TOTAL_SWEEP;
      }
    }
    return START_ANGLE;
  }

  class Speedometer {
    /** @type {HTMLElement} */
    #container;

    /** @type {SVGElement} */
    #svg;

    /** @type {SVGPathElement} */
    #activeArc;

    /** @type {SVGGElement} */
    #needle;

    /** @type {SVGTextElement} */
    #speedValueText;

    /** @type {SVGTextElement} */
    #speedUnitText;

    /** @type {HTMLElement} */
    #statusBadge;

    /** @type {HTMLElement} */
    #statusText;

    /** @type {HTMLElement} */
    #statusDot;

    /** @type {SVGLineElement[]} */
    #tickElements = [];

    /** @type {number} */
    #currentAngle = START_ANGLE;

    /** @type {number} */
    #targetAngle = START_ANGLE;

    /** @type {number} */
    #displaySpeed = 0;

    /** @type {number} */
    #targetSpeed = 0;

    /** @type {boolean} */
    #isRunning = false;

    /** @type {boolean} */
    #isCompleted = false;

    /** @type {number|null} */
    #animId = null;

    /** @type {number} */
    #lastFrameTime = performance.now();

    /** @type {string} */
    #mode = 'idle'; // 'download', 'upload', 'both', 'idle', 'completed'

    /** @type {object} */
    #lang = {};

    constructor(container) {
      if (typeof container === 'string') {
        this.#container = document.getElementById(container);
      } else {
        this.#container = container;
      }

      if (!this.#container) {
        throw new Error('Speedometer container not found');
      }

      this.#buildDOM();
      this.#startAnimationLoop();
    }

    #buildDOM() {
      this.#container.innerHTML = `
        <div class="speedometer-card">
          <svg class="speedometer-svg" viewBox="0 0 360 270" role="img" aria-label="Speedometer">
            <defs>
              <!-- Glow Filters -->
              <filter id="speedNeedleGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="speedArcGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <!-- Color Gradients -->
              <linearGradient id="downloadGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#00f2fe" />
                <stop offset="60%" stop-color="#00c6ff" />
                <stop offset="100%" stop-color="#0d6efd" />
              </linearGradient>

              <linearGradient id="uploadGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#00f5a0" />
                <stop offset="60%" stop-color="#00d9e9" />
                <stop offset="100%" stop-color="#198754" />
              </linearGradient>

              <linearGradient id="dualGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#00f2fe" />
                <stop offset="50%" stop-color="#0d6efd" />
                <stop offset="100%" stop-color="#20c997" />
              </linearGradient>

              <linearGradient id="idleGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#6c757d" />
                <stop offset="100%" stop-color="#adb5bd" />
              </linearGradient>

              <linearGradient id="needleGradientDownload" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#00f2fe" />
                <stop offset="100%" stop-color="#0d6efd" />
              </linearGradient>

              <linearGradient id="needleGradientUpload" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#00f5a0" />
                <stop offset="100%" stop-color="#198754" />
              </linearGradient>

              <linearGradient id="needleGradientDual" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#00f2fe" />
                <stop offset="100%" stop-color="#20c997" />
              </linearGradient>
            </defs>

            <!-- Background Track Arc -->
            <path class="gauge-track" d="${describeArc(CX, CY, RADIUS_TRACK, START_ANGLE, END_ANGLE)}" />

            <!-- Active Glowing Progress Arc -->
            <path id="gaugeActiveArc" class="gauge-active-arc" d="" filter="url(#speedArcGlow)" stroke="url(#downloadGradient)" />

            <!-- Ticks and Scale Labels Group -->
            <g id="gaugeTicksGroup"></g>

            <!-- Needle Group -->
            <g id="gaugeNeedle" class="gauge-needle" transform="rotate(${START_ANGLE}, ${CX}, ${CY})">
              <!-- Needle Counterweight Tail -->
              <polygon points="160,${CY} 171,${CY - 4} 171,${CY + 4}" class="needle-tail" fill="url(#downloadGradient)" />
              <!-- Needle Main Blade -->
              <polygon points="171,${CY - 3.5} 288,${CY - 1} 293,${CY} 288,${CY + 1} 171,${CY + 3.5}" class="needle-body" fill="url(#downloadGradient)" filter="url(#speedNeedleGlow)" />
              <!-- Center Highlight Ridge -->
              <line x1="172" y1="${CY}" x2="290" y2="${CY}" stroke="#ffffff" stroke-width="1.2" opacity="0.8" />
              <!-- Needle Tip Glow Dot -->
              <circle cx="292" cy="${CY}" r="2" fill="#ffffff" filter="url(#speedNeedleGlow)" />
            </g>

            <!-- Center Hub -->
            <circle cx="${CX}" cy="${CY}" r="16" class="gauge-hub-outer" />
            <circle cx="${CX}" cy="${CY}" r="10" class="gauge-hub-inner" />
            <circle id="gaugeHubCenterDot" cx="${CX}" cy="${CY}" r="4.5" fill="#00f2fe" />

            <!-- Center Digital Speed Readout -->
            <text id="gaugeSpeedVal" x="${CX}" y="${CY + 45}" text-anchor="middle" class="gauge-speed-val">0.00</text>
            <text id="gaugeSpeedUnit" x="${CX}" y="${CY + 66}" text-anchor="middle" class="gauge-speed-unit">MB/s</text>
          </svg>

          <!-- Status Indicator Pill -->
          <div id="gaugeStatusBadge" class="speedometer-status-badge idle">
            <span class="status-pulse-dot"></span>
            <span id="gaugeStatusText">IDLE</span>
          </div>
        </div>
      `;

      this.#svg = this.#container.querySelector('.speedometer-svg');
      this.#activeArc = this.#container.querySelector('#gaugeActiveArc');
      this.#needle = this.#container.querySelector('#gaugeNeedle');
      this.#speedValueText = this.#container.querySelector('#gaugeSpeedVal');
      this.#speedUnitText = this.#container.querySelector('#gaugeSpeedUnit');
      this.#statusBadge = this.#container.querySelector('#gaugeStatusBadge');
      this.#statusText = this.#container.querySelector('#gaugeStatusText');
      this.#statusDot = this.#container.querySelector('.status-pulse-dot');

      this.#generateTicks();
    }

    #generateTicks() {
      const ticksGroup = this.#container.querySelector('#gaugeTicksGroup');
      const step = TOTAL_SWEEP / (TICK_VALUES.length - 1); // 30 degrees per step
      this.#tickElements = [];

      for (let i = 0; i < TICK_VALUES.length; i++) {
        const angle = START_ANGLE + i * step;
        const val = TICK_VALUES[i];

        // Major tick mark
        const p1 = polarToCartesian(CX, CY, RADIUS_TICK_MAJOR_INNER, angle);
        const p2 = polarToCartesian(CX, CY, RADIUS_TICK_OUTER, angle);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', p1.x);
        line.setAttribute('y1', p1.y);
        line.setAttribute('x2', p2.x);
        line.setAttribute('y2', p2.y);
        line.setAttribute('class', 'gauge-tick-major');
        line.dataset.angle = angle.toString();
        ticksGroup.appendChild(line);
        this.#tickElements.push(line);

        // Major tick label
        const pLabel = polarToCartesian(CX, CY, RADIUS_LABEL, angle);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pLabel.x);
        text.setAttribute('y', pLabel.y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('class', 'gauge-tick-label');
        text.dataset.angle = angle.toString();
        text.textContent = val.toString();
        ticksGroup.appendChild(text);

        // Minor ticks between major ticks (2 minor ticks at +10 and +20 deg)
        if (i < TICK_VALUES.length - 1) {
          for (let m = 1; m <= 2; m++) {
            const minorAngle = angle + m * (step / 3);
            const mp1 = polarToCartesian(CX, CY, RADIUS_TICK_MINOR_INNER, minorAngle);
            const mp2 = polarToCartesian(CX, CY, RADIUS_TICK_OUTER, minorAngle);

            const mLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            mLine.setAttribute('x1', mp1.x);
            mLine.setAttribute('y1', mp1.y);
            mLine.setAttribute('x2', mp2.x);
            mLine.setAttribute('y2', mp2.y);
            mLine.setAttribute('class', 'gauge-tick-minor');
            mLine.dataset.angle = minorAngle.toString();
            ticksGroup.appendChild(mLine);
            this.#tickElements.push(mLine);
          }
        }
      }
    }

    #startAnimationLoop() {
      const loop = (time) => {
        const dt = Math.min((time - this.#lastFrameTime) / 1000, 0.1);
        this.#lastFrameTime = time;

        // Smooth speed value
        const speedDelta = this.#targetSpeed - this.#displaySpeed;
        this.#displaySpeed += speedDelta * Math.min(dt * 9, 1);

        if (!this.#isRunning && !this.#isCompleted && this.#displaySpeed < 0.05) {
          this.#displaySpeed = 0;
        }

        // Determine target needle angle
        let targetAngle = speedToAngle(this.#targetSpeed);

        // Organic Ookla-style needle flutter when running at active speed
        if (this.#isRunning && this.#targetSpeed > 0.5) {
          const flutter = (Math.random() - 0.5) * Math.min(this.#targetSpeed * 0.03, 1.2);
          targetAngle = speedToAngle(Math.max(0, this.#targetSpeed + flutter));
        } else if (!this.#isRunning && !this.#isCompleted) {
          targetAngle = START_ANGLE;
        }

        // Smooth angle with spring/damping interpolation
        const angleDelta = targetAngle - this.#currentAngle;
        this.#currentAngle += angleDelta * Math.min(dt * 8, 1);

        if (!this.#isRunning && !this.#isCompleted && Math.abs(this.#currentAngle - START_ANGLE) < 0.2) {
          this.#currentAngle = START_ANGLE;
        }

        // Rotate needle
        this.#needle.setAttribute(
          'transform',
          `rotate(${this.#currentAngle.toFixed(2)}, ${CX}, ${CY})`
        );

        // Update active arc
        const arcPath = describeArc(CX, CY, RADIUS_TRACK, START_ANGLE, Math.max(START_ANGLE + 0.1, this.#currentAngle));
        this.#activeArc.setAttribute('d', arcPath);

        // Update digital readout
        this.#speedValueText.textContent = this.#displaySpeed.toFixed(2);

        // Highlight active ticks
        const currentAngleVal = this.#currentAngle;
        this.#tickElements.forEach((el) => {
          const elAngle = parseFloat(el.dataset.angle || '0');
          if (elAngle <= currentAngleVal && currentAngleVal > START_ANGLE + 1) {
            el.classList.add('active');
          } else {
            el.classList.remove('active');
          }
        });

        this.#animId = requestAnimationFrame(loop);
      };

      this.#animId = requestAnimationFrame(loop);
    }

    setMode(isDownload, isUpload) {
      const activeArc = this.#activeArc;
      const needleTails = this.#container.querySelectorAll('.needle-tail, .needle-body');
      const centerDot = this.#container.querySelector('#gaugeHubCenterDot');

      if (isDownload && isUpload) {
        this.#mode = 'both';
        activeArc.setAttribute('stroke', 'url(#dualGradient)');
        needleTails.forEach(el => el.setAttribute('fill', 'url(#dualGradient)'));
        if (centerDot) centerDot.setAttribute('fill', '#00f2fe');
      } else if (isUpload) {
        this.#mode = 'upload';
        activeArc.setAttribute('stroke', 'url(#uploadGradient)');
        needleTails.forEach(el => el.setAttribute('fill', 'url(#uploadGradient)'));
        if (centerDot) centerDot.setAttribute('fill', '#00f5a0');
      } else {
        this.#mode = 'download';
        activeArc.setAttribute('stroke', 'url(#downloadGradient)');
        needleTails.forEach(el => el.setAttribute('fill', 'url(#downloadGradient)'));
        if (centerDot) centerDot.setAttribute('fill', '#00f2fe');
      }

      this.#updateStatusUI();
    }

    setLanguage(lang) {
      this.#lang = lang || {};
      if (this.#lang.speedUnit) {
        this.#speedUnitText.textContent = this.#lang.speedUnit;
      }
      this.#updateStatusUI();
    }

    start() {
      this.#isRunning = true;
      this.#isCompleted = false;
      this.#targetSpeed = 0;
      this.#updateStatusUI();
    }

    updateSpeed(speedMBps) {
      if (this.#isRunning) {
        this.#targetSpeed = Math.max(0, speedMBps);
      }
    }

    stop() {
      this.#isRunning = false;
      this.#targetSpeed = 0;
      this.#updateStatusUI();
    }

    complete(finalSpeed = 0) {
      this.#isRunning = false;
      this.#isCompleted = true;
      this.#targetSpeed = Math.max(0, finalSpeed);
      this.#updateStatusUI();
    }

    #updateStatusUI() {
      this.#statusBadge.className = 'speedometer-status-badge';

      if (this.#isCompleted) {
        this.#statusBadge.classList.add('completed');
        this.#statusText.textContent = this.#lang.statusCompleted || 'COMPLETED';
      } else if (!this.#isRunning) {
        this.#statusBadge.classList.add('idle');
        this.#statusText.textContent = this.#lang.statusIdle || 'IDLE';
      } else {
        if (this.#mode === 'both') {
          this.#statusBadge.classList.add('dual');
          this.#statusText.textContent = this.#lang.statusDual || 'TRANSFERRING';
        } else if (this.#mode === 'upload') {
          this.#statusBadge.classList.add('upload');
          this.#statusText.textContent = this.#lang.statusUpload || 'UPLOADING';
        } else {
          this.#statusBadge.classList.add('download');
          this.#statusText.textContent = this.#lang.statusDownload || 'DOWNLOADING';
        }
      }
    }

    destroy() {
      if (this.#animId) {
        cancelAnimationFrame(this.#animId);
        this.#animId = null;
      }
    }
  }

  return Speedometer;
});

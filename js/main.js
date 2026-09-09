/**
 * ==========================================================================
 * KENTIBA BAKERY LONDON - CORE ENGINE
 * Implements 10K Websites Scrub Pipeline & Motion Standards
 * ==========================================================================
 */

(function () {
  'use strict';

  // 1. Configuration & Constants
  const VIDEO_URL = 'assets/hero-scrub.mp4';
  const VIDEO_BYTES = 3259433; // Exact byte size of assets/hero-scrub.mp4
  const POSTER_URL = 'assets/hero-poster.jpg';

  const GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];

  // DOM Elements
  const container = document.querySelector('.hero-scroll-container');
  const stage = document.querySelector('.hero-sticky-stage');
  const video = document.getElementById('hero-video');
  const posterLayer = document.querySelector('.poster-fallback');
  const ringBox = document.querySelector('.stream-ring-box');
  const ringCircle = document.querySelector('.ring-circle');
  const ringLabel = document.querySelector('.ring-label');
  const bands = document.querySelectorAll('.band');

  // State
  let scrubOn = false;
  let startedFetch = false;
  let target = 0;
  let shown = 0;
  let rafId = null;
  let lastTick = 0;
  let heroOnScreen = true;
  let seekBusy = false;
  let pendingTime = null;

  // Initialize band metadata
  const bandData = Array.from(bands).map((b, index) => {
    const start = parseFloat(b.dataset.start || (index * 0.25));
    const end = parseFloat(b.dataset.end || ((index + 1) * 0.25));
    return {
      el: b,
      start: start,
      end: end,
      lastOpacity: -1,
      lastK: -1
    };
  });

  // 2. The Five Static-Hero Gates
  function checkGates() {
    return GATES.some(q => window.matchMedia(q).matches);
  }

  function applyHeroMode() {
    if (!stage) return;
    if (checkGates()) {
      disableScrub();
    } else {
      enableScrub();
    }
  }

  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    initHeroMedia();
    window.addEventListener('scroll', onScroll, { passive: true });
    bandData.forEach(b => { b.lastOpacity = -1; b.lastK = -1; });
    onScroll();
  }

  function disableScrub() {
    if (!scrubOn) return;
    scrubOn = false;
    window.removeEventListener('scroll', onScroll);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // Live query change listeners
  const mqls = GATES.map(q => window.matchMedia(q));
  mqls.forEach(m => m.addEventListener('change', applyHeroMode));

  // 3. Blob Streaming Loader with Ring Feedback
  function initHeroMedia() {
    if (!posterLayer) return;
    posterLayer.style.backgroundImage = `url('${POSTER_URL}')`;

    if (startedFetch) return;
    startedFetch = true;

    const img = new Image();
    img.onload = startBlobStream;
    img.onerror = startBlobStream;
    img.src = POSTER_URL;

    // Safety timeout: hung poster doesn't stall video forever
    setTimeout(startBlobStream, 3500);
  }

  async function startBlobStream() {
    if (!video) return;
    try {
      const ctrl = new AbortController();
      let watchdog = setTimeout(() => ctrl.abort(), 20000);

      const res = await fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal });
      if (!res.ok) throw new Error('Video fetch error: ' + res.status);

      const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      let lastRingUpdate = 0;

      for (; ;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(watchdog);
        watchdog = setTimeout(() => ctrl.abort(), 20000);

        chunks.push(value);
        got += value.length;
        const fraction = Math.min(1, got / total);
        const now = performance.now();

        if (now - lastRingUpdate > 100 || fraction === 1) {
          lastRingUpdate = now;
          if (ringCircle) {
            // Stroke circumference ~ 126
            const offset = Math.round(126 * (1 - fraction));
            ringCircle.style.strokeDashoffset = offset;
          }
          if (ringLabel) {
            ringLabel.textContent = Math.round(fraction * 100) + '%';
          }
        }
      }

      clearTimeout(watchdog);
      if (ringBox) ringBox.classList.add('loaded');

      const blob = new Blob(chunks, { type: 'video/mp4' });
      video.src = URL.createObjectURL(blob);
      video.load();

      video.addEventListener('canplay', () => {
        if (stage) stage.classList.add('video-ready');
        requestSeek(heroProgress() * (video.duration || 6));
      }, { once: true });

    } catch (err) {
      console.warn('Scrub video loading fallback:', err);
      failVideo();
    }
  }

  function failVideo() {
    if (stage) stage.classList.add('video-failed');
    if (ringBox) ringBox.style.display = 'none';
  }

  if (video) {
    video.addEventListener('error', () => {
      seekBusy = false;
      pendingTime = null;
      failVideo();
    });

    video.addEventListener('seeked', () => {
      seekBusy = false;
      if (pendingTime !== null) {
        const nextTime = pendingTime;
        pendingTime = null;
        requestSeek(nextTime);
      }
    });
  }

  // 4. Deadlock-Safe Seek Gating
  function requestSeek(t) {
    if (!video || !video.duration || isNaN(video.duration)) return;
    const clamped = Math.max(0, Math.min(video.duration, t));
    if (seekBusy) {
      pendingTime = clamped;
      return;
    }
    seekBusy = true;
    video.currentTime = clamped;
  }

  // 5. Scroll Progress Calculation
  function heroProgress() {
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    const scrollDistance = container.offsetHeight - window.innerHeight;
    if (scrollDistance <= 0) return 0;
    const current = -rect.top;
    return Math.max(0, Math.min(1, current / scrollDistance));
  }

  // 6. dt-Normalized Lerp Loop (rAF that rests)
  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now));
    lastTick = now;

    // Normalizing smoothing factor to 60fps
    const k = 0.16;
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));

    if (Math.abs(target - shown) < 0.0005) {
      shown = target;
      rafId = null;
      lastTick = 0; // Converged: loop rests
    } else {
      rafId = requestAnimationFrame(tick);
    }

    if (video && video.duration) {
      requestSeek(shown * video.duration);
    }

    updateCaptions(shown);
  }

  function onScroll() {
    target = heroProgress();
    if (rafId === null && heroOnScreen) {
      rafId = requestAnimationFrame(tick);
    }
  }

  // 7. Caption Bands Pacing & Smoothstep
  const smoothstep = (p, e0, e1) => {
    if (p <= e0) return 0;
    if (p >= e1) return 1;
    const t = (p - e0) / (e1 - e0);
    return t * t * (3 - 2 * t);
  };

  function updateCaptions(p) {
    bandData.forEach((band, idx) => {
      const a = band.start;
      const b = band.end;
      const ramp = Math.min(0.03, (b - a) / 4);

      let opacity = 0;
      if (idx === 0) {
        // First band starts fully visible at top
        opacity = p <= a ? 1 : 1 - smoothstep(p, b - ramp, b);
      } else if (idx === bandData.length - 1) {
        // Final band settles and stays visible
        opacity = smoothstep(p, a, a + ramp);
      } else {
        opacity = smoothstep(p, a, a + ramp) * (1 - smoothstep(p, b - ramp, b));
      }

      // Delta-gated write: touch DOM only when opacity changes noticeably
      if (Math.abs(opacity - band.lastOpacity) > 0.01) {
        band.lastOpacity = opacity;
        band.el.style.opacity = opacity.toFixed(3);
        if (opacity > 0.05) {
          band.el.classList.add('active');
        } else {
          band.el.classList.remove('active');
        }
      }

      // Assembly progress variable (--k)
      const kVal = Math.max(0, Math.min(1, (p - a) / ramp));
      if (Math.abs(kVal - band.lastK) > 0.015) {
        band.lastK = kVal;
        band.el.style.setProperty('--k', kVal.toFixed(3));
      }
    });
  }

  // IntersectionObserver to pause rAF when hero is offscreen
  if (container) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        heroOnScreen = entry.isIntersecting;
        if (heroOnScreen && target !== shown && rafId === null) {
          rafId = requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.05 });
    observer.observe(container);
  }

  // 8. Interactive Signature Moment:
  // "The Layer & Flavour Anatomy Explorer"
  function initInteractiveAnatomy() {
    const holdBtn = document.getElementById('press-hold-explore');
    const progressBar = document.querySelector('.hold-progress-bar');
    const slices = document.querySelectorAll('.layer-slice');
    if (!holdBtn || !progressBar) return;

    let holdProgress = 0;
    let holdRaf = null;
    let isHolding = false;

    function startHold(e) {
      if (e.type === 'touchstart') e.preventDefault();
      isHolding = true;
      if (!holdRaf) holdRaf = requestAnimationFrame(stepHold);
    }

    function endHold() {
      isHolding = false;
    }

    function stepHold() {
      if (isHolding) {
        holdProgress = Math.min(100, holdProgress + 1.8);
      } else {
        holdProgress = Math.max(0, holdProgress - 2.5); // Smooth ease down on release
      }

      progressBar.style.width = holdProgress + '%';

      // Progressive disclosure of layers
      const revealCount = Math.floor((holdProgress / 100) * (slices.length + 0.99));
      slices.forEach((slice, idx) => {
        if (idx < revealCount) {
          slice.classList.add('revealed');
        } else {
          slice.classList.remove('revealed');
        }
      });

      if ((isHolding && holdProgress < 100) || (!isHolding && holdProgress > 0)) {
        holdRaf = requestAnimationFrame(stepHold);
      } else {
        holdRaf = null;
      }
    }

    holdBtn.addEventListener('mousedown', startHold);
    window.addEventListener('mouseup', endHold);
    holdBtn.addEventListener('touchstart', startHold, { passive: false });
    window.addEventListener('touchend', endHold);

    // Reduced motion instant reveal
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      slices.forEach(s => s.classList.add('revealed'));
      progressBar.style.width = '100%';
    }
  }

  // 9. Order Enquiry Form Handler
  function initOrderForm() {
    const form = document.getElementById('cake-order-form');
    const feedback = document.getElementById('order-form-feedback');
    if (!form || !feedback) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const name = form.querySelector('[name="name"]').value.trim();
      const email = form.querySelector('[name="email"]').value.trim();
      const date = form.querySelector('[name="date"]').value;
      const guests = form.querySelector('[name="guests"]').value;
      const notes = form.querySelector('[name="notes"]').value.trim();

      if (!name || !email) {
        alert('Please fill in your name and email address.');
        return;
      }

      // Build structured email body
      const subject = encodeURIComponent(`Bespoke Cake Enquiry: ${name} (${date})`);
      const body = encodeURIComponent(
        `Hello Kentiba Bakery London,\n\n` +
        `I would like to enquire about a bespoke cake order:\n\n` +
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Event Date: ${date || 'TBD'}\n` +
        `Estimated Guests: ${guests || 'N/A'}\n` +
        `Vision & Flavour Notes:\n${notes}\n\n` +
        `Sent via kentibabakery.com web form`
      );

      // Open user's default email client
      window.location.href = `mailto:kentibabakery@gmail.com?subject=${subject}&body=${body}`;

      feedback.classList.add('success');
      feedback.textContent = `Thank you, ${name}! Your email client has been prepared. You can also reach us directly at kentibabakery@gmail.com.`;
      form.reset();
    });
  }

  // 10. Document Lifecycle & Visibility Pause
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.body.classList.add('paused');
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    } else {
      document.body.classList.remove('paused');
      if (scrubOn && heroOnScreen && target !== shown && rafId === null) {
        rafId = requestAnimationFrame(tick);
      }
    }
  });

  // Initialization on DOM Ready
  document.addEventListener('DOMContentLoaded', () => {
    applyHeroMode();
    initInteractiveAnatomy();
    initOrderForm();
  });

})();

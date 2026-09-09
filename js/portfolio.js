/**
 * ==========================================================================
 * KENTIBA BAKERY LONDON - PORTFOLIO & REELS CONTROLLER
 * Controls 3 Interactive 9:16 Vertical Video Cards & Instagram Embeds
 * ==========================================================================
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    initReelCards();
    initEmbedToggles();
  });

  function initReelCards() {
    const reelCards = document.querySelectorAll('.reel-card');

    reelCards.forEach((card, idx) => {
      const playBtn = card.querySelector('.reel-play-btn');
      const container = card.querySelector('.reel-player-container');
      const videoEl = card.querySelector('.reel-video');
      const directLink = card.dataset.instagramUrl || 'https://www.instagram.com/kentiba_bakery/';

      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // If video element exists, play/pause; otherwise open Instagram reel
          if (videoEl) {
            if (videoEl.paused) {
              videoEl.play();
              playBtn.style.opacity = '0.15';
            } else {
              videoEl.pause();
              playBtn.style.opacity = '1';
            }
          } else {
            window.open(directLink, '_blank', 'noopener,noreferrer');
          }
        });
      }

      // Smooth hover behavior
      card.addEventListener('mouseenter', () => {
        if (videoEl && videoEl.paused) {
          videoEl.play().catch(() => {});
        }
      });

      card.addEventListener('mouseleave', () => {
        if (videoEl && !videoEl.paused) {
          videoEl.pause();
          videoEl.currentTime = 0;
          if (playBtn) playBtn.style.opacity = '1';
        }
      });
    });
  }

  function initEmbedToggles() {
    const toggleBtns = document.querySelectorAll('.embed-toggle-btn');

    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.nextElementSibling;
        if (!panel) return;
        const isOpen = panel.classList.contains('open');

        // Close all other panels
        document.querySelectorAll('.embed-code-panel').forEach(p => p.classList.remove('open'));

        if (!isOpen) {
          panel.classList.add('open');
          btn.innerHTML = '▲ Close Embed Code';
        } else {
          panel.classList.remove('open');
          btn.innerHTML = '▼ Attach Instagram Embed';
        }
      });
    });

    // Custom Embed apply buttons
    const applyBtns = document.querySelectorAll('.btn-apply-embed');
    applyBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.closest('.embed-code-panel');
        const textarea = panel.querySelector('.embed-input');
        const card = btn.closest('.reel-card');
        const container = card.querySelector('.reel-player-container');

        const code = textarea.value.trim();
        if (!code) {
          alert('Please paste an Instagram Reel embed HTML or iframe snippet.');
          return;
        }

        // Render the embedded code inside the container
        container.innerHTML = code;
        panel.classList.remove('open');
        const toggle = card.querySelector('.embed-toggle-btn');
        if (toggle) toggle.textContent = '✓ Embed Attached';
      });
    });
  }

})();

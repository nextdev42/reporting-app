// Run this after the DOM loads
document.addEventListener('DOMContentLoaded', () => {
  // Select all mention links
  const mentions = document.querySelectorAll('.mention');

  mentions.forEach(mention => {
    mention.addEventListener('click', e => {
      e.preventDefault(); // Prevent default jump

      // Get the target ID from href (e.g., "#user123")
      const targetId = mention.getAttribute('href')?.substring(1);
      if (!targetId) return;

      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      // Scroll smoothly
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Optional: briefly highlight the target
      targetEl.style.transition = 'background 0.5s';
      const originalBg = targetEl.style.background;
      targetEl.style.background = 'rgba(64, 93, 230, 0.2)';

      setTimeout(() => {
        targetEl.style.background = originalBg || 'transparent';
      }, 800);
    });
  });
});

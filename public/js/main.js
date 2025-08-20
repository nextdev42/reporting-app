document.addEventListener("DOMContentLoaded", () => {
  // Fetch mentions from server
  async function fetchMentions() {
    try {
      const res = await fetch("/api/mentions");
      const mentions = await res.json();
      return mentions;
    } catch (err) {
      console.error("Error fetching mentions:", err);
      return [];
    }
  }

  // Update bell count
  async function updateMentionBell() {
    const mentions = await fetchMentions();
    const countSpan = document.querySelector("#mention-count");
    if (countSpan) {
      countSpan.textContent = mentions.length > 0 ? mentions.length : "";
    }
  }

  // Show dropdown
  async function showMentionsDropdown() {
    const mentions = await fetchMentions();
    const container = document.querySelector("#mentions-list");
    if (!container) return;

    container.innerHTML = "";

    if (mentions.length === 0) {
      container.innerHTML = "<p style='padding:10px;'>Hakuna mentions mpya.</p>";
      return;
    }

    mentions.forEach(m => {
      const div = document.createElement("div");
      div.style.padding = "8px";
      div.style.borderBottom = "1px solid #eee";
      div.innerHTML = `
        <strong>@${m.comment_user}</strong> kwenye ripoti: <em>${m.title}</em><br>
        "${m.comment}"<br>
        <small>${new Date(m.timestamp).toLocaleString()}</small>
      `;
      container.appendChild(div);
    });
  }

  // Toggle dropdown on bell click
  const bell = document.querySelector("#mention-bell");
  if (bell) {
    bell.addEventListener("click", () => {
      const dropdown = document.querySelector("#mentions-dropdown");
      if (dropdown) {
        dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
        if (dropdown.style.display === "block") showMentionsDropdown();
      }
    });
  }

  // Initial load + auto refresh every 30s
  updateMentionBell();
  setInterval(updateMentionBell, 30000);
});

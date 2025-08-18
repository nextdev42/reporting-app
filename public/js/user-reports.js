document.addEventListener("DOMContentLoaded", () => {
  const username = window.USERNAME;
  const loggedInUser = window.LOGGED_IN_USER;
  const container = document.getElementById("reports-container");
  const totalPostsEl = document.getElementById("totalPosts");
  const totalThumbsUpEl = document.getElementById("totalThumbsUp");
  const totalThumbsDownEl = document.getElementById("totalThumbsDown");

  async function loadReports(page = 1, limit = 10) {
    try {
      const res = await fetch(`/user/${encodeURIComponent(username)}?page=${page}&limit=${limit}`);
      const data = await res.json();  // <-- we assume server returns JSON
      console.log("API response:", data);

      if (!data.reports || data.reports.length === 0) {
        container.innerHTML = `<p>Hakuna ripoti zilizopatikana</p>`;
        totalPostsEl.textContent = "0 Ripoti";
        totalThumbsUpEl.textContent = "0 👍";
        totalThumbsDownEl.textContent = "0 👎";
        return;
      }

      // Update stats
      totalPostsEl.textContent = `${data.totalPosts} Ripoti`;
      totalThumbsUpEl.textContent = `${data.totalThumbsUp} 👍`;
      totalThumbsDownEl.textContent = `${data.totalThumbsDown} 👎`;

      // Render reports
      container.innerHTML = data.reports.map(r => `
        <div class="report-card">
          <h3>${r.title}</h3>
          <p>${r.description}</p>
          ${r.image ? `<img src="${r.image}" alt="report image">` : ""}
          <div class="report-stats">
            <span>${r.thumbs_up} 👍</span>
            <span>${r.thumbs_down} 👎</span>
          </div>
        </div>
      `).join("");

    } catch(err) {
      console.error("Error fetching reports:", err);
      container.innerHTML = `<p>Hitilafu katika kupakia ripoti</p>`;
    }
  }

  loadReports();
});

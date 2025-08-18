document.addEventListener("DOMContentLoaded", async () => {
  const pathParts = window.location.pathname.split("/");
  const username = pathParts[2]; // /user/:username
  const userAvatar = document.getElementById("userAvatar");
  const pageTitle = document.getElementById("pageTitle");
  const usernameEl = document.getElementById("username");
  const loggedInUserEl = document.getElementById("loggedInUser");
  const avatarForm = document.getElementById("avatarForm");
  const reportsContainer = document.getElementById("reports-container");
  const totalPostsEl = document.getElementById("totalPosts");
  const totalThumbsUpEl = document.getElementById("totalThumbsUp");
  const totalThumbsDownEl = document.getElementById("totalThumbsDown");
  const paginationEl = document.getElementById("pagination");

  const limit = 10;
  let currentPage = 1;

  async function fetchReports(page = 1) {
    const res = await fetch(`/api/user/${username}?page=${page}&limit=${limit}`);
    if (!res.ok) return;
    const data = await res.json();

    usernameEl.textContent = data.username;
    loggedInUserEl.textContent = data.loggedInUser;
    pageTitle.textContent = `Ripoti za ${data.username}`;
    userAvatar.src = `https://ui-avatars.com/api/?name=${data.username}&background=405DE6&color=fff`;

    if (data.username === data.loggedInUser) avatarForm.style.display = "block";

    totalPostsEl.textContent = `${data.stats.totalPosts} Ripoti`;
    totalThumbsUpEl.textContent = `${data.stats.totalThumbsUp} 👍`;
    totalThumbsDownEl.textContent = `${data.stats.totalThumbsDown} 👎`;

    reportsContainer.innerHTML = data.reports.map(r => `
      <div class="report-card">
        <h3>${r.title}</h3>
        <p>${r.description}</p>
        ${r.image ? `<img src="${r.image}" alt="report image">` : ""}
        <small>${r.timestamp}</small>
        <div>
          👍 ${r.thumbs_up} | 👎 ${r.thumbs_down} | Maoni: ${r.comments.length}
        </div>
      </div>
    `).join("");

    // Pagination
    paginationEl.innerHTML = "";
    for (let i = 1; i <= data.stats.totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.disabled = i === data.stats.currentPage;
      btn.addEventListener("click", () => {
        currentPage = i;
        fetchReports(i);
      });
      paginationEl.appendChild(btn);
    }
  }

  fetchReports(currentPage);
});

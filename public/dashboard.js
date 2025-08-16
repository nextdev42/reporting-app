// public/dashboard.js
const toggleFormBtn = document.getElementById("toggleFormBtn");
const reportFormSection = document.getElementById("reportFormSection");
const reportForm = document.getElementById("reportForm");
const formStatus = document.getElementById("formStatus");
const reportsContainer = document.getElementById("reportsContainer");
const greeting = document.getElementById("greeting");

const clinicFilter = document.getElementById("clinicFilter");
const usernameFilter = document.getElementById("nameFilter");
const searchFilter = document.getElementById("searchFilter");

toggleFormBtn.addEventListener("click", () => {
  reportFormSection.style.display = reportFormSection.style.display === "none" ? "block" : "none";
  toggleFormBtn.textContent = reportFormSection.style.display === "none" ? "Ongeza Ripoti" : "Ficha Fomu";
});

// Load user greeting
async function loadGreeting() {
  const res = await fetch("/api/user");
  const user = await res.json();
  const now = new Date();
  const t = new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000);
  const h = t.getHours();
  let g = "Habari";
  if (h >= 5 && h < 12) g = "Habari ya asubuhi";
  else if (h >= 12 && h < 17) g = "Habari ya mchana";
  else if (h >= 17 && h < 21) g = "Habari ya jioni";
  else g = "Habari usiku";
  greeting.textContent = `${g} ${user.jina} ${user.kituo}`;
}
loadGreeting();

let currentPage = 1;
const limit = 15;
let fetchTimeout;

// Fetch reports with filters and pagination
async function fetchReports(page = 1) {
  currentPage = page;
  if (fetchTimeout) clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(async () => {
    const clinic = clinicFilter.value;
    const username = usernameFilter.value.trim();
    const search = searchFilter.value.trim();

    reportsContainer.innerHTML = "Inapakia ripoti...";

    const params = new URLSearchParams({ page, limit, clinic, username, search });
    const res = await fetch("/api/reports?" + params.toString());
    const data = await res.json();

    reportsContainer.innerHTML = "";
    if (!data.reports.length) {
      reportsContainer.innerHTML = "<p>Hakuna ripoti bado.</p>";
      document.getElementById("pagination").innerHTML = "";
      return;
    }

    data.reports.forEach(report => {
      const card = document.createElement("div");
      card.className = "report-card";
      card.innerHTML = `
        <p><strong>Muda:</strong> ${report.timestamp}</p>
        <p><strong>Jina la Mtumiaji:</strong> ${report.username}</p>
        <p><strong>Kliniki:</strong> ${report.clinic}</p>
        <p><strong>Kichwa:</strong> ${report.title}</p>
        <p><strong>Maelezo:</strong> ${report.description}</p>
        ${report.image ? `<img src="${report.image}" alt="Ripoti">` : ""}
        <div class="votes">
          <button class="vote-up">👍 ${report.thumbs_up || 0}</button>
          <button class="vote-down">👎 ${report.thumbs_down || 0}</button>
        </div>
        <div class="comments">
          <h4>Maoni:</h4>
          <div class="commentsList">
            ${report.comments.map(c => `
              <div class="comment-item">
                <div class="comment-header">
                  <span class="username">${c.username} (${c.clinic})</span>
                  <span class="time">${c.timestamp}</span>
                </div>
                <p>${c.comment}</p>
              </div>`).join('')}
          </div>
          <input type="text" placeholder="Andika maoni yako" name="commentText">
          <button>Add</button>
        </div>
      `;

      // Vote buttons
      const voteUpBtn = card.querySelector(".vote-up");
      const voteDownBtn = card.querySelector(".vote-down");

      voteUpBtn.addEventListener("click", async () => {
        await fetch(`/api/vote/${report.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vote: 1 })
        });
        fetchReports(currentPage);
      });

      voteDownBtn.addEventListener("click", async () => {
        await fetch(`/api/vote/${report.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vote: -1 })
        });
        fetchReports(currentPage);
      });

      // Comments submission
      const commentBtn = card.querySelector(".comments button");
      commentBtn.addEventListener("click", async () => {
        const inp = card.querySelector("input[name='commentText']");
        const txt = inp.value.trim();
        if (!txt) return alert("Andika maoni yako.");
        await fetch(`/api/comments/${report.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: txt })
        });
        inp.value = "";
        fetchReports(currentPage);
      });

      reportsContainer.appendChild(card);
    });

    // Scroll comments to bottom
    document.querySelectorAll('.commentsList').forEach(list => { list.scrollTop = list.scrollHeight; });

    // Pagination
    const pag = document.getElementById("pagination");
    pag.innerHTML = "";
    for (let p = 1; p <= data.totalPages; p++) {
      const b = document.createElement("button");
      b.textContent = p;
      b.style.fontWeight = p === data.page ? "bold" : "normal";
      b.addEventListener("click", () => fetchReports(p));
      pag.appendChild(b);
    }

  }, 300); // 300ms debounce
}

// Event listeners for filters
clinicFilter.addEventListener("change", () => fetchReports(1));
usernameFilter.addEventListener("input", () => fetchReports(1));
searchFilter.addEventListener("input", () => fetchReports(1));

// Initial load
fetchReports();

// Submit report
reportForm.addEventListener("submit", async e => {
  e.preventDefault();
  formStatus.textContent = "Inatuma ripoti...";
  const fd = new FormData(reportForm);
  const res = await fetch("/submit", { method: "POST", body: fd });
  if (!res.ok) { 
    formStatus.textContent = "Tatizo: " + await res.text(); 
    return; 
  }
  formStatus.textContent = "Ripoti imehifadhiwa!";
  reportForm.reset();
  fetchReports(1);
});

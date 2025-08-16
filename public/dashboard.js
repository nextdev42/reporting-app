// ======================
// DASHBOARD.JS UPDATED
// ======================

const toggleFormBtn     = document.getElementById("toggleFormBtn");
const reportFormSection = document.getElementById("reportFormSection");
const reportForm        = document.getElementById("reportForm");
const formStatus        = document.getElementById("formStatus");
const reportsContainer  = document.getElementById("reportsContainer");
const greeting          = document.getElementById("greeting");

const clinicFilter      = document.getElementById("clinicFilter");
const usernameFilter    = document.getElementById("usernameFilter");
const searchFilter      = document.getElementById("searchFilter");
const startDateFilter   = document.getElementById("startDate");
const endDateFilter     = document.getElementById("endDate");

// Toggle report form
toggleFormBtn.addEventListener("click", () => {
  const show = reportFormSection.style.display === "none";
  reportFormSection.style.display = show ? "block" : "none";
  toggleFormBtn.textContent = show ? "Ficha Fomu" : "Ongeza Ripoti";
});

// Greeting
async function loadGreeting() {
  try {
    const res = await fetch("/api/user");
    const user = await res.json();
    const h   = new Date().getHours();
    let g     = "Habari";
    if (h >= 5 && h < 12) g = "Habari ya asubuhi";
    else if (h >= 12 && h < 17) g = "Habari ya mchana";
    else if (h >= 17 && h < 21) g = "Habari ya jioni";
    else g = "Habari usiku";
    greeting.textContent = `${g} ${user.jina} ${user.kituo}`;
  } catch (err) {
    console.error("Greeting error:", err);
  }
}
loadGreeting();

// ======== Reports ========
let currentPage = 1;
const reportsPerPage = 15;

async function fetchReports(page = 1) {
  currentPage = page;
  const params = new URLSearchParams({
    clinic: clinicFilter.value,
    username: usernameFilter.value.trim(),
    search: searchFilter.value.trim(),
    startDate: startDateFilter.value,
    endDate: endDateFilter.value,
    page,
    limit: reportsPerPage
  });

  reportsContainer.innerHTML = "<p>Inapakia ripoti...</p>";

  try {
    const res = await fetch("/api/reports?" + params.toString());
    const data = await res.json();
    reportsContainer.innerHTML = "";

    if (!data.reports.length) {
      reportsContainer.innerHTML = "<p>Hakuna ripoti bado.</p>";
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
        <div class="thumbs">
          <button class="thumb-up">👍 <span>${report.thumbs_up}</span></button>
          <button class="thumb-down">👎 <span>${report.thumbs_down}</span></button>
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
              </div>
            `).join('')}
          </div>
          <input type="text" name="commentText" placeholder="Andika maoni yako">
          <button>Tuma</button>
        </div>
      `;

      // ===== Reactions =====
      card.querySelector(".thumb-up").onclick = async () => {
        const r = await fetch(`/api/reports/${report.id}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "up" })
        });
        const d = await r.json();
        card.querySelector(".thumb-up span").textContent = d.thumbs_up;
        card.querySelector(".thumb-down span").textContent = d.thumbs_down;
      };
      card.querySelector(".thumb-down").onclick = async () => {
        const r = await fetch(`/api/reports/${report.id}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "down" })
        });
        const d = await r.json();
        card.querySelector(".thumb-up span").textContent = d.thumbs_up;
        card.querySelector(".thumb-down span").textContent = d.thumbs_down;
      };

      // ===== Comments =====
      const commentBtn = card.querySelector(".comments button");
      commentBtn.onclick = async () => {
        const input = card.querySelector("input[name='commentText']");
        const text = input.value.trim();
        if (!text) return alert("Andika maoni yako.");
        await fetch(`/api/comments/${report.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: text })
        });
        input.value = "";
        fetchReports(currentPage);
      };

      reportsContainer.appendChild(card);
    });

    // ===== Pagination =====
    const pagination = document.createElement("div");
    pagination.className = "pagination";

    if (currentPage > 1) {
      const prev = document.createElement("button");
      prev.textContent = "<<< Awali";
      prev.onclick = () => fetchReports(currentPage - 1);
      pagination.appendChild(prev);
    }

    const counter = document.createElement("span");
    counter.textContent = ` Uk. ${currentPage} `;
    pagination.appendChild(counter);

    if (data.hasMore) {
      const next = document.createElement("button");
      next.textContent = "Ifuatayo >>>";
      next.onclick = () => fetchReports(currentPage + 1);
      pagination.appendChild(next);
    }

    reportsContainer.appendChild(pagination);

  } catch (err) {
    console.error("Error fetching reports:", err);
    reportsContainer.innerHTML = "<p>Tatizo la kupakua ripoti.</p>";
  }
}

// ===== Filters =====
[clinicFilter, usernameFilter, searchFilter, startDateFilter, endDateFilter]
  .forEach(input => input.addEventListener("input", () => fetchReports(1)));

// ===== Submit Report =====
reportForm.addEventListener("submit", async e => {
  e.preventDefault();
  formStatus.textContent = "Inatuma ripoti...";
  const fd = new FormData(reportForm);

  try {
    const r = await fetch("/submit", { method: "POST", body: fd });
    if (!r.ok) {
      formStatus.textContent = "Tatizo: " + await r.text();
      return;
    }
    formStatus.textContent = "Imehifadhiwa!";
    reportForm.reset();
    fetchReports(currentPage);
  } catch (err) {
    console.error("Submit error:", err);
    formStatus.textContent = "Tatizo la kutuma ripoti.";
  }
});

// ===== Initial Load =====
fetchReports();

// public/dashboard.js

const toggleFormBtn = document.getElementById("toggleFormBtn");
const reportFormSection = document.getElementById("reportFormSection");
const reportForm = document.getElementById("reportForm");
const formStatus = document.getElementById("formStatus");
const reportsContainer = document.getElementById("reportsContainer");
const greeting = document.getElementById("greeting");

const clinicFilter = document.getElementById("clinicFilter");
const usernameFilter = document.getElementById("nameFilter"); // fixed ID to match HTML
const searchFilter = document.getElementById("searchFilter");

// Toggle report form
toggleFormBtn.addEventListener("click", () => {
  reportFormSection.style.display = reportFormSection.style.display === "none" ? "block" : "none";
  toggleFormBtn.textContent = reportFormSection.style.display === "none" ? "Ongeza Ripoti" : "Ficha Fomu";
});

// Load greeting
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

// Fetch reports and render
let currentPage = 1;
async function fetchReports(page = 1) {
  currentPage = page;

  const clinic = clinicFilter.value;
  const username = usernameFilter.value.trim();
  const search = searchFilter.value.trim();

  const params = new URLSearchParams({ clinic, username, search, page });
  reportsContainer.innerHTML = "Inapakia ripoti...";

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
        <div>
          <button onclick="vote(${report.id},1)">👍 ${report.thumbs_up || 0}</button>
          <button onclick="vote(${report.id},-1)">👎 ${report.thumbs_down || 0}</button>
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
          <input type="text" placeholder="Andika maoni yako" name="commentText">
          <button>Add</button>
        </div>
      `;

      // Comment submit
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

    // Pagination
    const pag = document.getElementById("pagination");
    if (pag) {
      pag.innerHTML = "";
      for (let p = 1; p <= (data.totalPages || 1); p++) {
        const b = document.createElement("button");
        b.textContent = p;
        b.style.fontWeight = p === currentPage ? "bold" : "normal";
        b.onclick = () => fetchReports(p);
        pag.appendChild(b);
      }
    }

  } catch (err) {
    console.error(err);
    reportsContainer.innerHTML = "<p>Tatizo kupata ripoti.</p>";
  }
}

// Vote function
async function vote(reportId, v) {
  try {
    await fetch(`/api/vote/${reportId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote: v })
    });
    fetchReports(currentPage);
  } catch (err) {
    console.error(err);
  }
}

// Filters
clinicFilter.addEventListener("change", () => fetchReports(1));
usernameFilter.addEventListener("input", () => fetchReports(1));
searchFilter.addEventListener("input", () => fetchReports(1));

// Submit report
reportForm.addEventListener("submit", async e => {
  e.preventDefault();
  formStatus.textContent = "Inatuma ripoti...";
  const fd = new FormData(reportForm);
  try {
    const res = await fetch("/submit", { method: "POST", body: fd });
    if (!res.ok) {
      formStatus.textContent = "Tatizo: " + await res.text();
      return;
    }
    formStatus.textContent = "Ripoti imehifadhiwa!";
    reportForm.reset();
    fetchReports(1);
  } catch (err) {
    console.error(err);
    formStatus.textContent = "Tatizo ku-save ripoti.";
  }
});

// Initial load
fetchReports();

// public/dashboard.js

const toggleFormBtn = document.getElementById("toggleFormBtn");
const reportFormSection = document.getElementById("reportFormSection");
const reportForm = document.getElementById("reportForm");
const formStatus = document.getElementById("formStatus");
const reportsContainer = document.getElementById("reportsContainer");
const greeting = document.getElementById("greeting");
const paginationContainer = document.getElementById("pagination");

const clinicFilter = document.getElementById("clinicFilter");
const usernameFilter = document.getElementById("usernameFilter");
const searchFilter = document.getElementById("searchFilter");

let currentPage = 1;

// Toggle Add Report Form
toggleFormBtn.addEventListener("click", () => {
  reportFormSection.style.display = reportFormSection.style.display === "none" ? "block" : "none";
  toggleFormBtn.textContent = reportFormSection.style.display === "none" ? "Ongeza Ripoti" : "Ficha Fomu";
});

// Load Greeting
async function loadGreeting() {
  try {
    const res = await fetch("/api/user");
    const user = await res.json();
    const now = new Date();
    const t = new Date(now.getTime() + (3*60 + now.getTimezoneOffset())*60000);
    const h = t.getHours();
    let g = "Habari";
    if (h >= 5 && h < 12) g = "Habari ya asubuhi";
    else if (h >= 12 && h < 17) g = "Habari ya mchana";
    else if (h >= 17 && h < 21) g = "Habari ya jioni";
    else g = "Habari usiku";

    greeting.textContent = `${g} ${user.jina} ${user.kituo}`;
  } catch(err) {
    console.error("Greeting error:", err);
    greeting.textContent = "Habari...";
  }
}
loadGreeting();

// Fetch Reports with Pagination, Filters, Comments, Votes
async function fetchReports(page = 1) {
  currentPage = page;
  reportsContainer.innerHTML = "Inapakia ripoti...";
  paginationContainer.innerHTML = "";

  try {
    const params = new URLSearchParams({
      clinic: clinicFilter.value,
      username: usernameFilter.value.trim(),
      search: searchFilter.value.trim(),
      page
    });

    const res = await fetch("/api/reports?" + params.toString());
    if (!res.ok) {
      const text = await res.text();
      reportsContainer.innerHTML = `Tatizo kupata ripoti: ${text}`;
      return;
    }

    const data = await res.json();
    const reports = data.reports || data;
    const totalPages = data.totalPages || 1;

    reportsContainer.innerHTML = "";
    if (!reports.length) {
      reportsContainer.innerHTML = "<p>Hakuna ripoti bado.</p>";
      return;
    }

    reports.forEach(report => {
      const card = document.createElement("div");
      card.className = "report-card";

      card.innerHTML = `
        <p><strong>Muda:</strong> ${new Date(report.timestamp).toLocaleString()}</p>
        <p><strong>Jina la Mtumiaji:</strong> ${report.username}</p>
        <p><strong>Kliniki:</strong> ${report.clinic}</p>
        <p><strong>Kichwa:</strong> ${report.title}</p>
        <p><strong>Maelezo:</strong> ${report.description}</p>
        ${report.image ? `<img src="${report.image}" alt="Ripoti" style="max-width:200px;">` : ""}
        <div class="votes">
          <button class="vote-btn" data-id="${report.id}" data-vote="1">👍 ${report.thumbs_up || 0}</button>
          <button class="vote-btn" data-id="${report.id}" data-vote="-1">👎 ${report.thumbs_down || 0}</button>
        </div>
        <div class="comments">
          <h4>Maoni:</h4>
          <div class="commentsList" style="max-height:150px; overflow:auto;">
            ${(report.comments || []).map(c => `
              <div class="comment-item">
                <div class="comment-header">
                  <span class="username">${c.username} (${c.clinic})</span>
                  <span class="time">${new Date(c.timestamp).toLocaleString()}</span>
                </div>
                <p>${c.comment}</p>
              </div>`).join('')}
          </div>
          <input type="text" placeholder="Andika maoni yako" name="commentText">
          <button class="comment-btn">Tuma</button>
        </div>
      `;

      // Vote Buttons
      card.querySelectorAll(".vote-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const voteValue = parseInt(btn.dataset.vote);
          const id = btn.dataset.id;
          try {
            await fetch(`/api/vote/${id}`, {
              method: "POST",
              headers: {"Content-Type":"application/json"},
              body: JSON.stringify({vote: voteValue})
            });
            fetchReports(currentPage);
          } catch(err) {
            console.error("Vote error:", err);
          }
        });
      });

      // Comment Button
      const commentBtn = card.querySelector(".comment-btn");
      commentBtn.addEventListener("click", async () => {
        const inp = card.querySelector("input[name='commentText']");
        const txt = inp.value.trim();
        if (!txt) return alert("Andika maoni yako.");
        try {
          await fetch(`/api/comments/${report.id}`, {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({comment: txt})
          });
          inp.value = "";
          fetchReports(currentPage);
        } catch(err) {
          console.error("Comment error:", err);
        }
      });

      reportsContainer.appendChild(card);
    });

    // Pagination Buttons
    for (let p = 1; p <= totalPages; p++) {
      const btn = document.createElement("button");
      btn.textContent = p;
      btn.className = (p === currentPage) ? "active-page" : "";
      btn.addEventListener("click", () => fetchReports(p));
      paginationContainer.appendChild(btn);
    }

  } catch (err) {
    console.error("FetchReports error:", err);
    reportsContainer.innerHTML = "Tatizo kupata ripoti.";
  }
}

// Live Filter Events
clinicFilter.addEventListener("change", () => fetchReports(1));
usernameFilter.addEventListener("input", () => fetchReports(1));
searchFilter.addEventListener("input", () => fetchReports(1));

fetchReports();

// Submit Report Form
reportForm.addEventListener("submit", async e => {
  e.preventDefault();
  formStatus.textContent = "Inatuma ripoti...";
  const fd = new FormData(reportForm);

  try {
    const res = await fetch("/submit", { method: "POST", body: fd });
    if (!res.ok) {
      const text = await res.text();
      formStatus.textContent = "Tatizo: " + text;
      return;
    }
    formStatus.textContent = "Ripoti imehifadhiwa!";
    reportForm.reset();
    fetchReports(1);
  } catch(err) {
    console.error("Submit error:", err);
    formStatus.textContent = "Tatizo ku-submit ripoti.";
  }
});

// ====== ELEMENT REFERENCES ======
const toggleFormBtn = document.getElementById("toggleFormBtn");
const reportFormSection = document.getElementById("reportFormSection");
const reportForm = document.getElementById("reportForm");
const formStatus = document.getElementById("formStatus");
const reportsContainer = document.getElementById("reportsContainer");
const greetingEl = document.getElementById("greeting");

const clinicFilter = document.getElementById("clinicFilter");
const usernameFilter = document.getElementById("usernameFilter");
const searchFilter = document.getElementById("searchFilter");
const startDateFilter = document.getElementById("startDate");
const endDateFilter = document.getElementById("endDate");

// ====== STATE ======
let currentPage = 1;
let totalPages = 1;
let fetchTimeout;
let currentUser = {};

// ====== TOGGLE REPORT FORM ======
toggleFormBtn.addEventListener("click", () => {
  const isHidden = reportFormSection.style.display === "none";
  reportFormSection.style.display = isHidden ? "block" : "none";
  toggleFormBtn.textContent = isHidden ? "Ficha Fomu" : "Ongeza Ripoti";
});

// ====== GREETING & CURRENT USER ======
async function loadGreeting() {
  try {
    const res = await fetch("/api/user");
    currentUser = await res.json();

    const now = new Date();
    const localTime = new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000);
    const hour = localTime.getHours();

    let greeting = "Habari";
    if (hour >= 5 && hour < 12) greeting = "Habari ya asubuhi";
    else if (hour >= 12 && hour < 17) greeting = "Habari ya mchana";
    else if (hour >= 17 && hour < 21) greeting = "Habari ya jioni";
    else greeting = "Habari usiku";

    greetingEl.textContent = `${greeting} ${currentUser.jina} ${currentUser.kituo}`;
  } catch (err) {
    console.error("Error loading greeting:", err);
  }
}
loadGreeting();

// ====== PARSE SWAHILI DATE ======
function parseSwahiliDate(str) {
  if (!str) return null;
  const months = {
    "Januari": 0, "Februari": 1, "Machi": 2, "Aprili": 3, "Mei": 4,
    "Juni": 5, "Julai": 6, "Agosti": 7, "Septemba": 8, "Oktoba": 9,
    "Novemba": 10, "Desemba": 11
  };
  const match = str.match(/(\d{1,2}) (\w+) (\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [ , day, monthStr, year, hour, minute, second ] = match;
  const month = months[monthStr];
  if (month === undefined) return null;
  return new Date(year, month, day, hour, minute, second);
}

// ====== FORMAT DATE ======
function formatDate(timestamp) {
  if (!timestamp) return "Haijulikani";
  let date = new Date(timestamp);
  if (isNaN(date)) {
    date = parseSwahiliDate(timestamp);
  }
  if (!date) return "Haijulikani";
  return date.toLocaleString("sw-TZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

// ====== FETCH REPORTS ======
async function fetchReports(page = 1) {
  if (fetchTimeout) clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(async () => {
    currentPage = page;

    const params = new URLSearchParams({
      clinic: clinicFilter.value,
      username: usernameFilter.value.trim(),
      search: searchFilter.value.trim(),
      startDate: startDateFilter.value ? new Date(startDateFilter.value).toISOString() : "",
      endDate: endDateFilter.value ? (() => {
        const d = new Date(endDateFilter.value);
        d.setHours(23, 59, 59, 999);
        return d.toISOString();
      })() : "",
      page,
      limit: 15
    });

    reportsContainer.innerHTML = "Inapakia ripoti...";

    try {
      const res = await fetch(`/api/reports?${params.toString()}`);
      const data = await res.json();

      reportsContainer.innerHTML = "";
      if (!data.reports.length) {
        reportsContainer.innerHTML = "<p>Hakuna ripoti bado.</p>";
        return;
      }

      totalPages = data.totalPages;

      // Sort newest first
      const sortedReports = data.reports.sort((a, b) => {
        const dateA = parseSwahiliDate(a.timestamp) || new Date(a.timestamp);
        const dateB = parseSwahiliDate(b.timestamp) || new Date(b.timestamp);
        return dateB - dateA;
      });

      sortedReports.forEach(r => reportsContainer.appendChild(renderReportCard(r)));
      renderPagination();
    } catch (err) {
      reportsContainer.innerHTML = "<p>Tatizo kupakua ripoti.</p>";
      console.error(err);
    }
  }, 300);
}

// ====== RENDER REPORT CARD ======
function renderReportCard(report) {
  const card = document.createElement("div");
  card.className = "report-card";

  const formattedDate = formatDate(report.timestamp);

  card.innerHTML = `
    <p><strong>Muda:</strong> ${formattedDate}</p>
    <p><strong>Jina la Mtumiaji:</strong> ${report.username}</p>
    <p><strong>Kliniki:</strong> ${report.clinic}</p>
    <p><strong>Kichwa:</strong> ${report.title}</p>
    <p><strong>Maelezo:</strong> ${report.description}</p>
    ${report.image ? `<img src="${report.image}" alt="Ripoti">` : ""}
    <div class="comments">
      <h4>Maoni:</h4>
      <div class="commentsList">
        ${report.comments.map(c => `
          <div class="comment-item">
            <div class="comment-header">
              <span class="username">${c.username} (${c.clinic})</span>
              <span class="time">${formatDate(c.timestamp)}</span>
            </div>
            <p>${c.comment}</p>
          </div>`).join('')}
      </div>
      <input type="text" placeholder="Andika maoni yako" name="commentText">
      <button>Add</button>
    </div>
    <div class="thumbs">
      <button class="thumb-up">👍 ${report.thumbs_up || 0}</button>
      <button class="thumb-down">👎 ${report.thumbs_down || 0}</button>
    </div>
  `;

  const commentsList = card.querySelector(".commentsList");
  const commentBtn = card.querySelector(".comments button");
  const thumbUpBtn = card.querySelector(".thumb-up");
  const thumbDownBtn = card.querySelector(".thumb-down");

  // ===== COMMENTS =====
  commentBtn.addEventListener("click", async () => {
    const inp = card.querySelector("input[name='commentText']");
    const txt = inp.value.trim();
    if (!txt) return alert("Andika maoni yako.");

    const now = new Date().toISOString();
    const newCommentDiv = document.createElement("div");
    newCommentDiv.className = "comment-item";
    newCommentDiv.innerHTML = `
      <div class="comment-header">
        <span class="username">Wewe (${currentUser.kituo})</span>
        <span class="time">${formatDate(now)}</span>
      </div>
      <p>${txt}</p>
    `;
    commentsList.appendChild(newCommentDiv);
    commentsList.scrollTop = commentsList.scrollHeight;
    inp.value = "";

    try {
      await fetch(`/api/comments/${report.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: txt })
      });
    } catch (err) {
      alert("Tatizo ku-post comment");
      newCommentDiv.remove();
    }
  });

  // ===== THUMBS UP/DOWN =====
  if (report.username === currentUser.jina && report.clinic === currentUser.kituo) {
    thumbUpBtn.disabled = true;
    thumbDownBtn.disabled = true;
  } else {
    thumbUpBtn.addEventListener("click", async () => {
      try {
        const res = await fetch(`/api/reactions/${report.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "up" })
        });
        const data = await res.json();
        report.thumbs_up = data.thumbs_up;
        report.thumbs_down = data.thumbs_down;
        thumbUpBtn.textContent = `👍 ${report.thumbs_up}`;
        thumbDownBtn.textContent = `👎 ${report.thumbs_down}`;
      } catch (err) {
        alert("Tatizo ku-update thumbs up");
      }
    });

    thumbDownBtn.addEventListener("click", async () => {
      try {
        const res = await fetch(`/api/reactions/${report.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "down" })
        });
        const data = await res.json();
        report.thumbs_up = data.thumbs_up;
        report.thumbs_down = data.thumbs_down;
        thumbUpBtn.textContent = `👍 ${report.thumbs_up}`;
        thumbDownBtn.textContent = `👎 ${report.thumbs_down}`;
      } catch (err) {
        alert("Tatizo ku-update thumbs down");
      }
    });
  }

  return card;
}

// ====== RENDER PAGINATION ======
function renderPagination() {
  const oldPagination = reportsContainer.querySelector(".pagination");
  if (oldPagination) oldPagination.remove();

  const pagination = document.createElement("div");
  pagination.className = "pagination";

  if (currentPage > 1) {
    const prevBtn = document.createElement("button");
    prevBtn.textContent = "Prev";
    prevBtn.addEventListener("click", () => fetchReports(currentPage - 1));
    pagination.appendChild(prevBtn);
  }

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    if (i === currentPage) {
      btn.classList.add("current");
      btn.disabled = true;
      btn.setAttribute("aria-current", "page");
    }
    btn.addEventListener("click", () => fetchReports(i));
    pagination.appendChild(btn);
  }

  if (currentPage < totalPages) {
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next";
    nextBtn.addEventListener("click", () => fetchReports(currentPage + 1));
    pagination.appendChild(nextBtn);
  }

  reportsContainer.appendChild(pagination);
}

// ====== FILTER EVENTS ======
[clinicFilter, usernameFilter, searchFilter, startDateFilter, endDateFilter].forEach(el => {
  el.addEventListener("input", () => fetchReports(1));
});

// ====== INITIAL FETCH ======
fetchReports();

// ====== SUBMIT REPORT FORM ======
reportForm.addEventListener("submit", async e => {
  e.preventDefault();
  formStatus.textContent = "Inatuma ripoti...";
  const fd = new FormData(reportForm);

  try {
    const res = await fetch("/submit", { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
    const newReport = await res.json();
    formStatus.textContent = "Ripoti imehifadhiwa!";
    reportForm.reset();

    // Render new report on top
    reportsContainer.prepend(renderReportCard(newReport));
    reportsContainer.scrollTop = 0;
  } catch (err) {
    formStatus.textContent = "Tatizo: " + err.message;
  }
});

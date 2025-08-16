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

// ====== TOGGLE FORM VISIBILITY ======
toggleFormBtn.addEventListener("click", () => {
  const isHidden = reportFormSection.style.display === "none";
  reportFormSection.style.display = isHidden ? "block" : "none";
  toggleFormBtn.textContent = isHidden ? "Ficha Fomu" : "Ongeza Ripoti";
});

// ====== GREETING ======
async function loadGreeting() {
  const res = await fetch("/api/user");
  const user = await res.json();
  const now = new Date();
  const localTime = new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000);
  const hour = localTime.getHours();

  let greeting = "Habari";
  if (hour >= 5 && hour < 12) greeting = "Habari ya asubuhi";
  else if (hour >= 12 && hour < 17) greeting = "Habari ya mchana";
  else if (hour >= 17 && hour < 21) greeting = "Habari ya jioni";
  else greeting = "Habari usiku";

  greetingEl.textContent = `${greeting} ${user.jina} ${user.kituo}`;
}
loadGreeting();

// ====== FETCH REPORTS ======
async function fetchReports(page = 1) {
  if (fetchTimeout) clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(async () => {
    currentPage = page;

    const clinic = clinicFilter.value;
    const username = usernameFilter.value.trim();
    const search = searchFilter.value.trim();
    let startDate = startDateFilter.value;
    let endDate = endDateFilter.value;

    // Format dates to ISO if provided
    if (startDate) startDate = new Date(startDate).toISOString();
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // include the full day
      endDate = end.toISOString();
    }

    reportsContainer.innerHTML = "Inapakia ripoti...";

    const params = new URLSearchParams({ 
      clinic, 
      username, 
      search, 
      startDate, 
      endDate, 
      page, 
      limit: 15 
    });

    const res = await fetch(`/api/reports?${params.toString()}`);
    const data = await res.json();

    reportsContainer.innerHTML = "";
    if (!data.reports.length) {
      reportsContainer.innerHTML = "<p>Hakuna ripoti bado.</p>";
      return;
    }

    totalPages = data.totalPages;
    data.reports.forEach(renderReportCard);
    renderPagination();
  }, 300);
}

// ====== RENDER REPORT CARD ======
function renderReportCard(report) {
  const card = document.createElement("div");
  card.className = "report-card";

  // Format the timestamp
  let formattedDate = "Haijulikani";
  if (report.timestamp) {
    const reportDate = new Date(report.timestamp);
    if (!isNaN(reportDate)) {
      formattedDate = reportDate.toLocaleString("sw-TZ", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
    }
  }

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
              <span class="time">${c.timestamp}</span>
            </div>
            <p>${c.comment}</p>
          </div>`).join('')}
      </div>
      <input type="text" placeholder="Andika maoni yako" name="commentText">
      <button>Add</button>
    </div>
  `;

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
  card.querySelector(".commentsList").scrollTop = card.querySelector(".commentsList").scrollHeight;
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
  const res = await fetch("/submit", { method: "POST", body: fd });
  if (!res.ok) {
    formStatus.textContent = "Tatizo: " + await res.text();
    return;
  }
  formStatus.textContent = "Ripoti imehifadhiwa!";
  reportForm.reset();
  fetchReports(currentPage);
});

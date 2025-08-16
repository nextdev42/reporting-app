// dashboard.js
document.addEventListener("DOMContentLoaded", async () => {
  const toggleFormBtn = document.getElementById("toggleFormBtn");
  const reportFormSection = document.getElementById("reportFormSection");
  const reportForm = document.getElementById("reportForm");
  const formStatus = document.getElementById("formStatus");
  const reportsContainer = document.getElementById("reportsContainer");
  const greeting = document.getElementById("greeting");

  const clinicFilter = document.getElementById("clinicFilter");
  const usernameFilter = document.getElementById("usernameFilter");
  const searchFilter = document.getElementById("searchFilter");

  // Toggle report form
  toggleFormBtn.addEventListener("click", () => {
    reportFormSection.style.display = reportFormSection.style.display === "none" ? "block" : "none";
    toggleFormBtn.textContent = reportFormSection.style.display === "none" ? "Ongeza Ripoti" : "Ficha Fomu";
  });

  // Greeting with Tanzania time
  async function loadGreeting() {
    const res = await fetch("/api/user");
    const user = await res.json();
    const now = new Date();
    const t = new Date(now.getTime() + (3*60 + now.getTimezoneOffset())*60000);
    const h = t.getHours();
    let g = "Habari";
    if(h >= 5 && h < 12) g = "Habari ya asubuhi";
    else if(h >= 12 && h < 17) g = "Habari ya mchana";
    else if(h >= 17 && h < 21) g = "Habari ya jioni";
    else g = "Habari usiku";
    greeting.textContent = `${g} ${user.jina} (${user.kituo})`;
  }
  loadGreeting();

  // Fetch and display reports
  let fetchTimeout;
  async function fetchReports() {
    if(fetchTimeout) clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(async () => {
      const clinic = clinicFilter.value;
      const username = usernameFilter.value.trim();
      const search = searchFilter.value.trim();
      reportsContainer.innerHTML = "Inapakia ripoti...";
      const params = new URLSearchParams({ clinic, username, search });
      const res = await fetch("/api/reports?" + params.toString());
      const data = await res.json();
      reportsContainer.innerHTML = "";

      if(!data.reports.length) {
        reportsContainer.innerHTML = "<p>Hakuna ripoti bado.</p>";
        return;
      }

      data.reports.forEach(report => {
        const card = document.createElement("div");
        card.className = "report-card";
        card.dataset.id = report.id;

        card.innerHTML = `
          <p><strong>Muda:</strong> ${report.timestamp}</p>
          <p><strong>Jina la Mtumiaji:</strong> ${report.username}</p>
          <p><strong>Kliniki:</strong> ${report.clinic}</p>
          <p><strong>Kichwa:</strong> ${report.title}</p>
          <p><strong>Maelezo:</strong> ${report.description}</p>
          ${report.image ? `<img src="${report.image}" alt="Ripoti">` : ""}
          <p>
            <button class="thumb-up">👍 <span class="count">${report.thumbs_up}</span></button>
            <button class="thumb-down">👎 <span class="count">${report.thumbs_down}</span></button>
          </p>
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
            <input type="text" placeholder="Andika maoni yako" class="comment-input">
            <button class="comment-btn">Tuma</button>
          </div>
        `;

        // Thumbs up/down event
        card.querySelector(".thumb-up").addEventListener("click", async () => {
          const res = await fetch(`/api/reports/${report.id}/react`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "up" })
          });
          const data = await res.json();
          card.querySelector(".thumb-up .count").textContent = data.thumbs_up;
          card.querySelector(".thumb-down .count").textContent = data.thumbs_down;
        });

        card.querySelector(".thumb-down").addEventListener("click", async () => {
          const res = await fetch(`/api/reports/${report.id}/react`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "down" })
          });
          const data = await res.json();
          card.querySelector(".thumb-up .count").textContent = data.thumbs_up;
          card.querySelector(".thumb-down .count").textContent = data.thumbs_down;
        });

        // Comment submit event
        card.querySelector(".comment-btn").addEventListener("click", async () => {
          const input = card.querySelector(".comment-input");
          const txt = input.value.trim();
          if(!txt) return alert("Andika maoni yako.");
          await fetch(`/api/comments/${report.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ comment: txt })
          });
          input.value = "";
          fetchReports();
        });

        reportsContainer.appendChild(card);
      });

      // Scroll comments to bottom
      document.querySelectorAll('.commentsList').forEach(list => { list.scrollTop = list.scrollHeight; });

    }, 300); // debounce
  }

  // Filters
  clinicFilter.addEventListener("change", fetchReports);
  usernameFilter.addEventListener("input", fetchReports);
  searchFilter.addEventListener("input", fetchReports);

  fetchReports();

  // Submit report
  reportForm.addEventListener("submit", async e => {
    e.preventDefault();
    formStatus.textContent = "Inatuma ripoti...";
    const fd = new FormData(reportForm);
    const res = await fetch("/submit", { method: "POST", body: fd });
    if(!res.ok) {
      formStatus.textContent = "Tatizo: " + await res.text();
      return;
    }
    formStatus.textContent = "Ripoti imehifadhiwa!";
    reportForm.reset();
    fetchReports();
  });
});

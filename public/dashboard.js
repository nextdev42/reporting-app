// dashboard.js
document.addEventListener("DOMContentLoaded", async () => {
  const greetingEl = document.getElementById("greeting");
  const reportsContainer = document.getElementById("reportsContainer");
  const reportFormSection = document.getElementById("reportFormSection");
  const toggleFormBtn = document.getElementById("toggleFormBtn");

  // Toggle report form
  toggleFormBtn.addEventListener("click", () => {
    reportFormSection.style.display = reportFormSection.style.display === "none" ? "block" : "none";
  });

  // Format timestamp for Swahili TZ
  function formatTimestamp(ts){
    const date = new Date(ts);
    const options = { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute:'2-digit', second:'2-digit', hour12:false };
    return date.toLocaleString('sw-TZ', options);
  }

  // Fetch user info
  const userRes = await fetch("/api/user");
  const user = await userRes.json();
  greetingEl.textContent = `Habari ${user.jina} kutoka ${user.kituo}`;

  // Fetch and display reports
  async function fetchReports() {
    const clinic = document.getElementById("clinicFilter").value;
    const username = document.getElementById("usernameFilter").value;
    const search = document.getElementById("searchFilter").value;

    const url = `/api/reports?clinic=${clinic}&username=${username}&search=${search}`;
    const res = await fetch(url);
    const data = await res.json();

    reportsContainer.innerHTML = "";

    data.reports.forEach(report => {
      const div = document.createElement("div");
      div.classList.add("report");
      div.dataset.id = report.id;

      div.innerHTML = `
        <p><strong>Muda:</strong> ${formatTimestamp(report.timestamp)}</p>
        <p><strong>Jina la Mtumiaji:</strong> ${report.username}</p>
        <p><strong>Kliniki:</strong> ${report.clinic}</p>
        <p><strong>Kichwa:</strong> ${report.title}</p>
        <p><strong>Maelezo:</strong> ${report.description}</p>
        ${report.image ? `<img src="${report.image}" alt="Image" class="report-img">` : ""}
        <p>
          <button class="thumb-up">👍 <span class="count">${report.thumbs_up}</span></button>
          <button class="thumb-down">👎 <span class="count">${report.thumbs_down}</span></button>
        </p>
        <div class="comments">
          <h4>Maoni:</h4>
          <div class="commentsList">
            ${report.comments.map(c => `
              <div class="comment-item">
                <strong>${c.username} (${c.clinic})</strong> ${formatTimestamp(c.timestamp)}<br>
                ${c.comment}
              </div>
            `).join("")}
          </div>
          <input type="text" placeholder="Andika maoni..." class="comment-input">
          <button class="comment-btn">Tuma</button>
        </div>
      `;

      reportsContainer.appendChild(div);
    });

    attachEventListeners();
  }

  // Attach event listeners for thumbs and comments
  function attachEventListeners() {
    document.querySelectorAll(".thumb-up, .thumb-down").forEach(btn => {
      btn.onclick = async e => {
        const reportEl = e.target.closest(".report");
        const reportId = reportEl.dataset.id;
        const type = btn.classList.contains("thumb-up") ? 'up' : 'down';

        const res = await fetch(`/api/reports/${reportId}/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type })
        });
        const data = await res.json();
        reportEl.querySelector(".thumb-up .count").textContent = data.thumbs_up;
        reportEl.querySelector(".thumb-down .count").textContent = data.thumbs_down;
      };
    });

    document.querySelectorAll(".comment-btn").forEach(btn => {
      btn.onclick = async e => {
        const reportEl = e.target.closest(".report");
        const reportId = reportEl.dataset.id;
        const input = reportEl.querySelector(".comment-input");
        const comment = input.value.trim();
        if (!comment) return;

        await fetch(`/api/comments/${reportId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment })
        });

        input.value = "";
        fetchReports();
      };
    });
  }

  // Filters
  document.getElementById("clinicFilter").addEventListener("change", fetchReports);
  document.getElementById("usernameFilter").addEventListener("input", fetchReports);
  document.getElementById("searchFilter").addEventListener("input", fetchReports);

  // Submit report
  const reportForm = document.getElementById("reportForm");
  reportForm.onsubmit = async e => {
    e.preventDefault();
    const formData = new FormData(reportForm);
    const res = await fetch("/submit", { method: "POST", body: formData });
    if(res.ok){
      reportForm.reset();
      reportFormSection.style.display = "none";
      fetchReports();
    } else {
      const status = await res.text();
      document.getElementById("formStatus").textContent = status;
    }
  };

  // Initial fetch
  fetchReports();
});

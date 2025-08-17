// ====== ELEMENT REFERENCES ======
const toggleFormBtn      = document.getElementById("toggleFormBtn");
const reportFormSection  = document.getElementById("reportFormSection");
const reportForm         = document.getElementById("reportForm");
const formStatus         = document.getElementById("formStatus");
const reportsContainer   = document.getElementById("reportsContainer");
const greetingEl         = document.getElementById("greeting");

const clinicFilter       = document.getElementById("clinicFilter");
const usernameFilter     = document.getElementById("usernameFilter");
const searchFilter       = document.getElementById("searchFilter");
const startDateFilter    = document.getElementById("startDate");
const endDateFilter      = document.getElementById("endDate");

// ====== STATE ======
let currentPage = 1;
let totalPages  = 1;
let fetchTimeout;
let currentUser = {};
let allUsers    = []; // for mention suggestion

// ====== TOGGLE REPORT FORM ======
// ====== TOGGLE REPORT FORM ======
toggleFormBtn.addEventListener("click", () => {
  const isHidden = reportFormSection.style.display === "none" || !reportFormSection.style.display;
  reportFormSection.style.display = isHidden ? "block" : "none";
  toggleFormBtn.textContent = isHidden ? "Zificha Fomu" : "Ongeza Ripoti";
});

// ====== TOGGLE FILTER SECTION ======
const toggleFilterBtn = document.getElementById("toggleFilterBtn");
const filtersContent = document.getElementById("filtersContent");

// initialize filter as visible
filtersContent.style.display = "block";
toggleFilterBtn.textContent = "Zificha";

toggleFilterBtn.addEventListener("click", () => {
  const isHidden = filtersContent.style.display === "none";
  filtersContent.style.display = isHidden ? "block" : "none";
  toggleFilterBtn.textContent = isHidden ? "Zificha" : "Onyesha";
});



// ====== GREETING & CURRENT USER ======
async function loadGreeting() {
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

  // fetch usernames for mention
  const r = await fetch("/api/users");
  allUsers = await r.json();
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
  const m = str.match(/(\d{1,2}) (\w+) (\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [,d,mo,y,h,mi,s] = m;
  return new Date(y, months[mo], d, h, mi, s);
}

// ====== FORMAT DATE ======
function formatDate(ts) {
  if (!ts) return "Haijulikani";
  let d = new Date(ts);
  if (isNaN(d)) d = parseSwahiliDate(ts);
  if (!d) return "Haijulikani";
  return d.toLocaleString("sw-TZ", {
    day:"2-digit", month:"long", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit",
    hour12: false
  });
}

// ====== HIGHLIGHT @MENTIONS ======
function highlightMentions(text) {
  return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

// ====== FETCH REPORTS ======
async function fetchReports(page=1) {
  if (fetchTimeout) clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(async () => {
    currentPage=page;
    const params = new URLSearchParams({
      clinic:clinicFilter.value,
      username:usernameFilter.value.trim(),
      search:searchFilter.value.trim(),
      startDate:startDateFilter.value?new Date(startDateFilter.value).toISOString():"",
      endDate:endDateFilter.value?(()=>{
        const d=new Date(endDateFilter.value);d.setHours(23,59,59,999);return d.toISOString();
      })():"",
      page,limit:15
    });
    reportsContainer.innerHTML="Inapakia ripoti...";
    const res = await fetch(`/api/reports?${params.toString()}`);
    const data = await res.json();
    reportsContainer.innerHTML="";
    if(!data.reports.length){ reportsContainer.innerHTML="<p>Hakuna ripoti bado.</p>";return;}
    totalPages=data.totalPages;
    data.reports.sort((a,b)=>{
      const A=parseSwahiliDate(a.timestamp)||new Date(a.timestamp);
      const B=parseSwahiliDate(b.timestamp)||new Date(b.timestamp);
      return B-A;
    }).forEach(r=>reportsContainer.appendChild(renderReportCard(r)));
    renderPagination();
  },300);
}

// ====== RENDER ONE REPORT ======


  function renderReportCard(report) {
  const card = document.createElement("div");
  card.className = "report-card";

  card.innerHTML = `
    <div class="report-header">
      <div class="avatar">${report.username.charAt(0).toUpperCase()}</div>
      <div class="user-info">
        <span class="username">${report.username}</span>
        <span class="clinic">${report.clinic}</span>
      </div>
    </div>

    ${report.image ? `<div class="report-image"><img src="${report.image}" alt="Ripoti"></div>` : ""}

    <div class="report-caption">${highlightMentions(report.description)}</div>

    <div class="report-actions">
      <button class="thumb-up">👍 ${report.thumbs_up || 0}</button>
      <button class="thumb-down">👎 ${report.thumbs_down || 0}</button>
    </div>

    <div class="comments-section">
      <div class="commentsList">
        ${report.comments.map(c => `
          <div class="comment-item">
            <div class="comment-header">
              <span class="username">${c.username} (${c.clinic})</span>
              <span class="time">${formatDate(c.timestamp)}</span>
            </div>
            <p>${highlightMentions(c.comment)}</p>
          </div>
        `).join('')}
      </div>
      <input type="text" placeholder="Andika maoni yako" name="commentText">
      <div class="mentionBox" style="display:none;"></div>
      <button>Add</button>
    </div>
  `;

  const commentsList = card.querySelector(".commentsList");
  const inp = card.querySelector("input[name='commentText']");
  const mentionBox = card.querySelector(".mentionBox");
  const commentBtn = card.querySelector(".comments-section button");

  // ===== Mention Suggest =====
// ===== Mention Suggest =====
inp.addEventListener("keyup", () => {
  const match = inp.value.match(/@(\w*)$/);
  if (match) {
    const q = match[1].toLowerCase();
    const suggest = Array.from(new Set(allUsers.filter(u => u.toLowerCase().startsWith(q))));
    if (suggest.length) {
      mentionBox.innerHTML = suggest.map(u => `<div class="sItem">${u}</div>`).join('');
      mentionBox.style.display = 'block';

      // Smooth scroll for mention dropdown
      mentionBox.scrollTop = 0; // reset scroll to top
      mentionBox.style.scrollBehavior = 'smooth';
    } else {
      mentionBox.style.display = 'none';
    }
  } else {
    mentionBox.style.display = 'none';
  }
});

  // Click on mention item
mentionBox.addEventListener("click", (e) => {
  if (e.target.classList.contains("sItem")) {
    inp.value = inp.value.replace(/@(\w*)$/, '@' + e.target.innerText + ' ');
    mentionBox.style.display = 'none';
    inp.focus();
  }
});

  // ===== Add Comment =====
  // ===== Add Comment =====
commentBtn.addEventListener("click", async () => {
  const txt = inp.value.trim();
  if (!txt) return alert("Andika maoni yako.");
  inp.value = "";

  const tempDiv = document.createElement("div");
  tempDiv.className = "comment-item";
  tempDiv.innerHTML = `
    <div class="comment-header">
      <span class="username">Wewe (${currentUser.kituo})</span>
      <span class="time">${formatDate(new Date().toISOString())}</span>
    </div>
    <p>${highlightMentions(txt)}</p>
  `;
  commentsList.prepend(tempDiv);

  // Smooth scroll to the new comment
  tempDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Auto-scroll input into view on mobile
  inp.scrollIntoView({ behavior: 'smooth', block: 'center' });

  try {
    const res = await fetch(`/api/comments/${report.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: txt })
    });
    if (!res.ok) throw new Error(await res.text());
    const saved = await res.json();
    tempDiv.querySelector(".username").textContent = `${saved.username} (${saved.clinic})`;
    tempDiv.querySelector(".time").textContent = formatDate(saved.timestamp);
    report.comments.unshift(saved);
  } catch (err) {
    alert("Tatizo ku-post comment");
    tempDiv.remove();
  }
});

// ===== Mention Suggest =====
inp.addEventListener("keyup", () => {
  const match = inp.value.match(/@(\w*)$/);
  if (match) {
    const q = match[1].toLowerCase();
    const suggest = Array.from(new Set(allUsers.filter(u => u.toLowerCase().startsWith(q))));
    if (suggest.length) {
      mentionBox.innerHTML = suggest.map(u => `<div class="sItem">${u}</div>`).join('');
      mentionBox.style.display = 'block';

      // Smooth scroll for mention dropdown
      mentionBox.scrollTop = 0; // reset scroll to top
      mentionBox.style.scrollBehavior = 'smooth';
    } else {
      mentionBox.style.display = 'none';
    }
  } else {
    mentionBox.style.display = 'none';
  }
});

// Click on mention item
mentionBox.addEventListener("click", (e) => {
  if (e.target.classList.contains("sItem")) {
    inp.value = inp.value.replace(/@(\w*)$/, '@' + e.target.innerText + ' ');
    mentionBox.style.display = 'none';
    inp.focus();
  }
});


  // ===== Thumbs =====
  const thumbUp = card.querySelector(".thumb-up");
  const thumbDown = card.querySelector(".thumb-down");

  if (report.username === currentUser.jina && report.clinic === currentUser.kituo) {
    thumbUp.disabled = true; 
    thumbDown.disabled = true;
  } else {
    thumbUp.addEventListener("click", async () => {
      const r = await fetch(`/api/reactions/${report.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "up" })
      });
      const d = await r.json();
      report.thumbs_up = d.thumbs_up;
      report.thumbs_down = d.thumbs_down;
      thumbUp.textContent = `👍 ${d.thumbs_up}`;
      thumbDown.textContent = `👎 ${d.thumbs_down}`;
    });

    thumbDown.addEventListener("click", async () => {
      const r = await fetch(`/api/reactions/${report.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "down" })
      });
      const d = await r.json();
      report.thumbs_up = d.thumbs_up;
      report.thumbs_down = d.thumbs_down;
      thumbUp.textContent = `👍 ${d.thumbs_up}`;
      thumbDown.textContent = `👎 ${d.thumbs_down}`;
    });
  }

  return card;
}



  



// ====== RENDER PAGINATION ======
function renderPagination() {
  const old = reportsContainer.querySelector(".pagination");
  if(old)old.remove();
  const p=document.createElement("div"); p.className="pagination";
  if(currentPage>1){
    const b=document.createElement("button");
    b.textContent="Prev";
    b.onclick=()=>fetchReports(currentPage-1);
    p.appendChild(b);
  }
  for(let i=1; i<=totalPages;i++){
    const b=document.createElement("button");
    b.textContent=i;
    if(i===currentPage){ b.disabled=true; b.classList.add("current");}
    b.onclick=()=>fetchReports(i);
    p.appendChild(b);
  }
  if(currentPage<totalPages){
    const b=document.createElement("button");
    b.textContent="Next";
    b.onclick=()=>fetchReports(currentPage+1);
    p.appendChild(b);
  }
  reportsContainer.appendChild(p);
}

// ====== FILTER EVENTS ======
[clinicFilter,usernameFilter,searchFilter,startDateFilter,endDateFilter]
  .forEach(el=>el.addEventListener("input",()=>fetchReports(1)));

// ====== SUBMIT NEW REPORT ======
reportForm.addEventListener("submit",async e=>{
  e.preventDefault();
  formStatus.textContent="Inatuma ripoti...";
  const fd=new FormData(reportForm);
  const r=await fetch("/submit",{method:"POST",body:fd});
  if(!r.ok) return formStatus.textContent="Tatizo ku-hifadhi ripoti";
  const json=await r.json();
  reportsContainer.prepend(renderReportCard(json));
  formStatus.textContent="Ripoti imehifadhiwa!";
  reportForm.reset();
});

// ====== INITIAL ======
fetchReports();

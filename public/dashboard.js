const toggleFormBtn    = document.getElementById("toggleFormBtn");
const reportFormSection= document.getElementById("reportFormSection");
const reportForm       = document.getElementById("reportForm");
const formStatus       = document.getElementById("formStatus");
const reportsContainer = document.getElementById("reportsContainer");
const greeting         = document.getElementById("greeting");

const clinicFilter     = document.getElementById("clinicFilter");
const usernameFilter   = document.getElementById("usernameFilter");
const searchFilter     = document.getElementById("searchFilter");
const startDateFilter  = document.getElementById("startDate");
const endDateFilter    = document.getElementById("endDate");

toggleFormBtn.addEventListener("click", () => {
  const show = reportFormSection.style.display === "none";
  reportFormSection.style.display = show ? "block" : "none";
  toggleFormBtn.textContent = show ? "Ficha Fomu" : "Ongeza Ripoti";
});

// Greeting
async function loadGreeting(){
  const res = await fetch("/api/user");
  const user= await res.json();
  const now = new Date();
  const t   = new Date(now.getTime() + (3*60 + now.getTimezoneOffset())*60000);
  const h   = t.getHours();
  let g     = "Habari";
  if(h>=5 && h<12) g="Habari ya asubuhi";
  else if(h>=12 && h<17) g="Habari ya mchana";
  else if(h>=17 && h<21) g="Habari ya jioni";
  else g="Habari usiku";
  greeting.textContent = `${g} ${user.jina} ${user.kituo}`;
}
loadGreeting();

let currentPage = 1;
const reportsPerPage = 15;

async function fetchReports(page = 1){
  currentPage = page;
  
  const clinic    = clinicFilter.value;
  const username  = usernameFilter.value.trim();
  const search    = searchFilter.value.trim();
  const startDate = startDateFilter.value;
  const endDate   = endDateFilter.value;

  reportsContainer.innerHTML = "Inapakia ripoti...";

  const params = new URLSearchParams({
    clinic, username, search, startDate, endDate,
    page, limit: reportsPerPage
  });

  const res  = await fetch("/api/reports?" + params.toString());
  const data = await res.json();

  reportsContainer.innerHTML = "";

  if(!data.reports.length){
    reportsContainer.innerHTML="<p>Hakuna ripoti bado.</p>";
    return;
  }

  data.reports.forEach(report=>{
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
          ${report.comments.map(c=>`
           <div class="comment-item">
            <div class="comment-header">
               <span class="username">${c.username} (${c.clinic})</span>
               <span class="time">${c.timestamp}</span>
            </div>
            <p>${c.comment}</p>
           </div>`).join('')}
        </div>
        <input type="text" name="commentText" placeholder="Andika maoni yako">
        <button>Tuma</button>
      </div>
    `;
  
    // thumbs events
    card.querySelector(".thumb-up").onclick  = async ()=>{
      const r = await fetch(`/api/reports/${report.id}/react`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({type:"up"})
      });
      const d=await r.json();
      card.querySelector(".thumb-up span").textContent = d.thumbs_up;
      card.querySelector(".thumb-down span").textContent= d.thumbs_down;
    };
    card.querySelector(".thumb-down").onclick= async ()=>{
      const r = await fetch(`/api/reports/${report.id}/react`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({type:"down"})
      });
      const d=await r.json();
      card.querySelector(".thumb-up span").textContent = d.thumbs_up;
      card.querySelector(".thumb-down span").textContent= d.thumbs_down;
    };

    // comment event
    card.querySelector(".comments button").onclick = async ()=>{
      const inp = card.querySelector("input[name='commentText']");
      const txt = inp.value.trim();
      if(!txt) return alert("Andika maoni yako.");
      await fetch(`/api/comments/${report.id}`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({comment:txt})
      });
      inp.value="";
      fetchReports(currentPage);
    };

    reportsContainer.appendChild(card);
  });

  // ===== Pagination =====
  const pagination = document.createElement("div");
  pagination.className="pagination";
  // previous
  if(currentPage>1){
    const prev = document.createElement("button");
    prev.textContent="<<< Awali";
    prev.onclick=()=>fetchReports(currentPage-1);
    pagination.appendChild(prev);
  }
  // show current page
  const counter = document.createElement("span");
  counter.textContent= ` Uk. ${currentPage} `;
  pagination.appendChild(counter);

  // next
  if(data.hasMore){
    const next = document.createElement("button");
    next.textContent="Ifuatayo >>>";
    next.onclick=()=>fetchReports(currentPage+1);
    pagination.appendChild(next);
  }

  reportsContainer.appendChild(pagination);
}

// Filters trigger refresh
clinicFilter.addEventListener("change", ()=>fetchReports(1));
usernameFilter.addEventListener("input", ()=>fetchReports(1));
searchFilter.addEventListener("input", ()=>fetchReports(1));
startDateFilter.addEventListener("change", ()=>fetchReports(1));
endDateFilter.addEventListener("change", ()=>fetchReports(1));

// submit form
reportForm.addEventListener("submit", async(e)=>{
  e.preventDefault();
  formStatus.textContent="Inatuma ripoti...";
  const fd = new FormData(reportForm);
  const r  = await fetch("/submit",{method:"POST",body:fd});
  if(!r.ok){
    formStatus.textContent="Tatizo : "+await r.text();
    return;
  }
  formStatus.textContent="Imehifadhiwa!";
  reportForm.reset();
  fetchReports(currentPage);
});

// initial
fetchReports();

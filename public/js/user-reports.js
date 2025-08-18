document.addEventListener("DOMContentLoaded", () => {
  const username = window.USERNAME;
  const loggedInUser = window.LOGGED_IN_USER;

  let currentPage = 1;
  let totalPages = 1;
  const limit = 10; // reports per page

  function linkUsernames(text) {
    // @mentions become clickable
    return text.replace(/@(\w+)/g, '<a href="/user/$1" class="mention">@$1</a>');
  }

  function createReportCard(r) {
    const card = document.createElement("div");
    card.className = "card";

    const totalComments = r.comments.length || 0;

    card.innerHTML = `
      <div class="card-header">
        <div class="report-avatar"><a href="/user/${r.username}">${r.username.charAt(0).toUpperCase()}</a></div>
        <div>
          <div class="report-title">${linkUsernames(r.title||'')}</div>
          <div class="report-meta"><a href="/user/${r.username}">${r.username}</a> - ${r.clinic} | ${r.timestamp}</div>
        </div>
      </div>
      <div class="report-description">${linkUsernames(r.description||'')}</div>
      ${r.image ? `<img class="report-image" src="${r.image}">` : ''}
      <div class="card-footer">
        <div class="reaction-container">
          <div class="report-thumbs">
            <span class="thumb-up">👍 <span class="count">${r.thumbs_up||0}</span></span>
            <span class="thumb-down">👎 <span class="count">${r.thumbs_down||0}</span></span>
          </div>
          <span class="comment-toggle">💬 ${totalComments} Maoni</span>
        </div>
        <div class="report-comments">
          <ul class="comments-list"></ul>
          <form class="comment-form">
            <input type="text" name="comment" placeholder="Andika maoni..." required/>
            <button type="submit">Tuma</button>
          </form>
        </div>
      </div>
    `;

    const thumbsUp = card.querySelector(".thumb-up");
    const thumbsDown = card.querySelector(".thumb-down");
    const toggleBtn = card.querySelector('.comment-toggle');
    const commentSection = card.querySelector('.report-comments');
    const form = card.querySelector('.comment-form');
    const ul = card.querySelector('.comments-list');

    // grey-out if already reacted
    if (r.user_thumb === "up") thumbsUp.classList.add("reacted");
    if (r.user_thumb === "down") thumbsDown.classList.add("reacted");

    async function react(type) {
      try {
        const res = await fetch(`/api/reactions/${r.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type })
        });
        if(!res.ok) return alert(await res.text() || "Tatizo kupiga thumb");
        const data = await res.json();
        thumbsUp.querySelector(".count").textContent = data.thumbs_up;
        thumbsDown.querySelector(".count").textContent = data.thumbs_down;
        thumbsUp.classList.toggle("reacted", type==="up");
        thumbsDown.classList.toggle("reacted", type==="down");
      } catch(err){ console.error(err); alert("Tatizo kupiga thumb"); }
    }

    if(!r.user_thumb){
      thumbsUp.addEventListener("click", () => react("up"));
      thumbsDown.addEventListener("click", () => react("down"));
    }

    toggleBtn.addEventListener('click', () => commentSection.classList.toggle('active'));
    form.style.display = r.username === loggedInUser ? 'none' : 'flex';

    // populate comments
    r.comments.forEach(c => {
      const li = document.createElement('li');
      li.className = 'comment-item';
      li.innerHTML = `
        <div class="comment-avatar"><a href="/user/${c.username}">${c.username.charAt(0).toUpperCase()}</a></div>
        <div>
          <div class="comment-user"><a href="/user/${c.username}">${c.username}</a></div>
          <div class="comment-text">${linkUsernames(c.comment)}</div>
          <div class="comment-time">${c.timestamp}</div>
        </div>`;
      ul.appendChild(li);
    });

    // submit new comment
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.comment;
      if (!input.value.trim()) return;
      const txt = input.value; input.value = "";
      try {
        const res = await fetch(`/api/comments/${r.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: txt })
        });
        if (!res.ok) throw new Error();
        const c = await res.json();
        const li = document.createElement('li');
        li.className = 'comment-item';
        li.innerHTML = `
          <div class="comment-avatar"><a href="/user/${c.username}">${c.username.charAt(0).toUpperCase()}</a></div>
          <div>
            <div class="comment-user"><a href="/user/${c.username}">${c.username}</a></div>
            <div class="comment-text">${linkUsernames(c.comment)}</div>
            <div class="comment-time">${c.timestamp}</div>
          </div>`;
        ul.prepend(li);
        toggleBtn.innerHTML = `💬 ${ul.children.length} Maoni`;
        updateCounters(); // update totals dynamically
      } catch { alert("Tatizo kutuma maoni"); }
    });

    return card;
  }

  async function loadReports(page=1) {
    const wrap = document.getElementById('reports-container');
    wrap.innerHTML = "<div>Inapakia...</div>";

    try {
      const res = await fetch(`/api/reports?username=${encodeURIComponent(username)}&page=${page}&limit=${limit}`);
      const data = await res.json();

      wrap.innerHTML = "";
      totalPages = data.totalPages || 1;
      currentPage = page;

      data.reports.forEach(r => wrap.appendChild(createReportCard(r)));

      renderPagination();
      updateCounters(data.reports);

    } catch (err) {
      wrap.innerHTML = `<div class="error">Hitilafu katika kupakia ripoti</div>`;
      console.error(err);
    }
  }

  function renderPagination() {
    const wrap = document.getElementById('reports-container');
    let old = wrap.querySelector(".pagination");
    if(old) old.remove();

    const p = document.createElement("div");
    p.className = "pagination";

    if(currentPage > 1){
      const prev = document.createElement("button");
      prev.textContent = "Prev";
      prev.onclick = () => loadReports(currentPage-1);
      p.appendChild(prev);
    }

    for(let i=1;i<=totalPages;i++){
      const btn = document.createElement("button");
      btn.textContent = i;
      if(i===currentPage){ btn.disabled=true; btn.classList.add("current"); }
      btn.onclick = () => loadReports(i);
      p.appendChild(btn);
    }

    if(currentPage < totalPages){
      const next = document.createElement("button");
      next.textContent = "Next";
      next.onclick = () => loadReports(currentPage+1);
      p.appendChild(next);
    }

    wrap.appendChild(p);
  }

  function updateCounters(reports=[]) {
    // update dynamic totals per current page
    const totalP = reports.length;
    const totalUp = reports.reduce((sum,r) => sum+(r.thumbs_up||0), 0);
    const totalDown = reports.reduce((sum,r) => sum+(r.thumbs_down||0), 0);

    document.getElementById('totalPosts').textContent = totalP + " Ripoti";
    document.getElementById('totalThumbsUp').textContent = totalUp + " 👍";
    document.getElementById('totalThumbsDown').textContent = totalDown + " 👎";
  }

  loadReports();
});

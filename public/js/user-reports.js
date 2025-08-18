document.addEventListener("DOMContentLoaded", () => {
  const username = window.USERNAME;
  const loggedInUser = window.LOGGED_IN_USER;

  function linkUsernames(text) {
    return text.replace(/@(\w+)/g, '<a href="/user/$1" class="mention">@$1</a>');
  }

  
  function createReportCard(r) {
  const card = document.createElement("div");
  card.className = "card";

  const totalComments = r.comments.length || 0;

  // Helper to convert @username to links
  function linkUsernames(text) {
    return text.replace(/@([a-zA-Z0-9_.-]+)/g, '<a href="/user/$1" class="mention">@$1</a>');
  }

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

  // --- Thumb reactions ---
  const thumbsUp = card.querySelector(".thumb-up");
  const thumbsDown = card.querySelector(".thumb-down");

  if (r.user_thumb === "up") thumbsUp.classList.add("reacted");
  if (r.user_thumb === "down") thumbsDown.classList.add("reacted");

  async function react(type) {
    try {
      const res = await fetch(`/api/reactions/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      if(!res.ok){ alert(await res.text() || "Tatizo kupiga thumb"); return; }
      const data = await res.json();

      thumbsUp.querySelector(".count").textContent = data.thumbs_up;
      thumbsDown.querySelector(".count").textContent = data.thumbs_down;

      if(type==="up"){
        thumbsUp.classList.add("reacted");
        thumbsDown.classList.remove("reacted");
      } else {
        thumbsDown.classList.add("reacted");
        thumbsUp.classList.remove("reacted");
      }

      // Update total thumbs
      let totalUp = 0, totalDown = 0;
      document.querySelectorAll(".card").forEach(c => {
        totalUp += parseInt(c.querySelector(".thumb-up .count").textContent) || 0;
        totalDown += parseInt(c.querySelector(".thumb-down .count").textContent) || 0;
      });
      document.getElementById('totalThumbsUp').textContent = totalUp + " 👍";
      document.getElementById('totalThumbsDown').textContent = totalDown + " 👎";
    } catch(err){
      console.error(err);
      alert("Tatizo kupiga thumb");
    }
  }

  if(!r.user_thumb){
    thumbsUp.addEventListener("click", () => react("up"));
    thumbsDown.addEventListener("click", () => react("down"));
  }

  // --- Comment toggle ---
  const toggleBtn = card.querySelector('.comment-toggle');
  const commentSection = card.querySelector('.report-comments');
  toggleBtn.addEventListener('click', () => commentSection.classList.toggle('active'));

  const form = card.querySelector('.comment-form');
  form.style.display = r.username === window.LOGGED_IN_USER ? 'none' : 'flex';

  const ul = card.querySelector('.comments-list');
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

  // --- Mention autocomplete ---
  const input = form.comment;
  const suggestionBox = document.createElement('div');
  suggestionBox.className = 'mention-suggestions';
  suggestionBox.style.position = 'absolute';
  suggestionBox.style.background = '#fff';
  suggestionBox.style.border = '1px solid #ccc';
  suggestionBox.style.display = 'none';
  suggestionBox.style.zIndex = 1000;
  suggestionBox.style.maxHeight = '150px';
  suggestionBox.style.overflowY = 'auto';
  form.style.position = 'relative';
  form.appendChild(suggestionBox);

  let currentQuery = '';
  let fetchController = null;
  let selectedIndex = -1;

  input.addEventListener('input', async () => {
    const cursorPos = input.selectionStart;
    const textBeforeCursor = input.value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);
    
    if (!match) { 
      suggestionBox.style.display='none';
      return; 
    }

    currentQuery = match[1];
    selectedIndex = -1;

    if(fetchController) fetchController.abort();
    fetchController = new AbortController();

    try {
      const res = await fetch('/api/users?search=' + encodeURIComponent(currentQuery), { signal: fetchController.signal });
      if(!res.ok) throw new Error('Failed to fetch users');
      const users = await res.json();
      if(!users.length){ suggestionBox.style.display='none'; return; }

      suggestionBox.innerHTML='';
      users.forEach(u=>{
        const div = document.createElement('div');
        div.textContent = u.username;
        div.className = 'suggestion-item';
        div.addEventListener('click', ()=>insertUsername(u.username));
        suggestionBox.appendChild(div);
      });

      suggestionBox.style.display='block';
    } catch(err){
      if(err.name !== 'AbortError') console.error(err);
      suggestionBox.style.display='none';
    }
  });

  function insertUsername(username) {
    const cursorPos = input.selectionStart;
    const textBeforeCursor = input.value.slice(0, cursorPos);
    const start = textBeforeCursor.lastIndexOf('@');
    input.value = input.value.slice(0, start) + '@' + username + ' ' + input.value.slice(cursorPos);
    input.focus();
    suggestionBox.style.display='none';
  }

  // Keyboard navigation
  input.addEventListener('keydown', (e) => {
    const items = Array.from(suggestionBox.children);
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      selectedIndex = (selectedIndex + 1) % items.length;
      updateHighlight(items);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateHighlight(items);
      e.preventDefault();
    } else if (e.key === 'Enter' && selectedIndex > -1) {
      insertUsername(items[selectedIndex].textContent);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      suggestionBox.style.display = 'none';
    }
  });

  function updateHighlight(items) {
    items.forEach((item, i) => {
      item.style.background = i === selectedIndex ? '#eef' : '#fff';
    });
  }

  document.addEventListener('click', (e)=>{
    if(!input.contains(e.target) && !suggestionBox.contains(e.target)){
      suggestionBox.style.display='none';
    }
  });

  // --- Comment submission ---
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!input.value.trim()) return;
    const txt = input.value;
    input.value = "";
    try {
      const res = await fetch(`/api/comments/${r.id}`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({comment: txt})
      });
      if(!res.ok) throw new Error();
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
    } catch(err){ alert("Tatizo kutuma maoni"); }
  });

  return card;
}



      




  async function loadReports() {
    const wrap = document.getElementById('reports-container');
    wrap.innerHTML = "<div>Inapakia...</div>";

    try {
      const res = await fetch(`/api/reports?username=${encodeURIComponent(username)}`);
      const data = await res.json();

      wrap.innerHTML = "";

      // Reset counters
      let totalP = 0;
      let totalUp = 0;
      let totalDown = 0;

      data.reports.forEach(r => {
        wrap.appendChild(createReportCard(r));
        totalP++;
      });

      totalUp = data.reports.reduce((sum,r) => sum+(r.thumbs_up||0), 0);
      totalDown = data.reports.reduce((sum,r) => sum+(r.thumbs_down||0), 0);

      document.getElementById('totalPosts').textContent = totalP + " Ripoti";
      document.getElementById('totalThumbsUp').textContent = totalUp + " 👍";
      document.getElementById('totalThumbsDown').textContent = totalDown + " 👎";

    } catch (err) {
      wrap.innerHTML = `<div class="error">Hitilafu katika kupakia ripoti</div>`;
      console.error(err);
    }
  }

  loadReports();
});

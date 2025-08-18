document.addEventListener("DOMContentLoaded", () => {
  const username = window.USERNAME;
  const loggedInUser = window.LOGGED_IN_USER;
  let totalP = 0, totalUp = 0, totalDown = 0;

  function linkUsernames(text) {
    return text.replace(/@(\w+)/g, '<a href="/user/$1" class="mention">@$1</a>');
  }

  
function createReportCard(r) {
  const card = document.createElement("div");
  card.className = "card";

  const totalComments = r.comments.length || 0;
  const userThumb = r.user_thumb; // 'up', 'down', or null

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
          <span class="thumb-up ${userThumb==='up'?'reacted':''}">👍 <span class="count">${r.thumbs_up||0}</span></span>
          <span class="thumb-down ${userThumb==='down'?'reacted':''}">👎 <span class="count">${r.thumbs_down||0}</span></span>
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

  // Populate comments
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

  // Toggle comment section
  const toggleBtn = card.querySelector('.comment-toggle');
  const commentSection = card.querySelector('.report-comments');
  toggleBtn.addEventListener('click', () => commentSection.classList.toggle('active'));

  // Hide comment form if the report belongs to logged-in user
  const form = card.querySelector('.comment-form');
  form.style.display = r.username === loggedInUser ? 'none' : 'flex';

  // Submit new comment
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.comment;
    if (!input.value.trim()) return;
    const txt = input.value;
    input.value = "";
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
    } catch (err) {
      alert("Tatizo kutuma maoni");
    }
  });

  // ======= Thumb functionality with header stats update =======
  const thumbsUp = card.querySelector(".thumb-up");
  const thumbsDown = card.querySelector(".thumb-down");

  function updateThumbsUI(userThumb) {
    thumbsUp.classList.toggle("reacted", userThumb === "up");
    thumbsDown.classList.toggle("reacted", userThumb === "down");
  }

  async function react(type) {
    if ((type==='up' && thumbsUp.classList.contains("reacted")) || 
        (type==='down' && thumbsDown.classList.contains("reacted")) ||
        r.username === loggedInUser) return;

    try {
      const res = await fetch(`/api/reactions/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      // Update card thumbs
      thumbsUp.querySelector(".count").textContent = data.thumbs_up;
      thumbsDown.querySelector(".count").textContent = data.thumbs_down;
      updateThumbsUI(type);

      // Update global header stats
      const headerUp = document.getElementById('totalThumbsUp');
      const headerDown = document.getElementById('totalThumbsDown');

      if (type === "up") {
        totalUp += 1;
      } else {
        totalDown += 1;
      }

      headerUp.textContent = totalUp + " 👍";
      headerDown.textContent = totalDown + " 👎";

    } catch {
      alert("Tatizo kupiga thumb");
    }
  }

  thumbsUp.addEventListener("click", () => react("up"));
  thumbsDown.addEventListener("click", () => react("down"));

  return card;
}


  
    

  async function loadReports() {
    const wrap = document.getElementById('reports-container');
    wrap.innerHTML = "<div>Inapakia...</div>";
    try {
      const res = await fetch(`/api/reports?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      wrap.innerHTML = "";
      data.reports.forEach(r => wrap.appendChild(createReportCard(r)));

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

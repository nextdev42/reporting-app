document.addEventListener("DOMContentLoaded", () => {
  const username = window.USERNAME;
  const loggedInUser = window.LOGGED_IN_USER;

  // --- Global Bell Update ---
  function updateGlobalBell() {
    const navBell = document.getElementById('nav-bell');
    if (!navBell) return;

    let totalUnread = 0;
    document.querySelectorAll('.mention-count').forEach(el => {
      totalUnread += parseInt(el.textContent) || 0;
    });

    const isOwner = loggedInUser === username;

    if (isOwner && totalUnread > 0) {
      navBell.style.display = 'inline-block';
      navBell.querySelector('.bell-count').textContent = totalUnread;
      navBell.classList.add('highlight');
    } else {
      navBell.style.display = 'none';
      navBell.classList.remove('highlight');
    }
  }

  // --- Link @usernames ---
  function linkUsernames(text) {
    return text.replace(/@([a-zA-Z0-9_.-]+)/g, '<a href="/user/$1" class="mention">@$1</a>');
  }

  // --- Global Mention Suggestion Box ---
  const suggestionBox = document.createElement('div');
  suggestionBox.className = 'mention-suggestions';
  Object.assign(suggestionBox.style, {
    position: 'absolute',
    background: '#fff',
    border: '1px solid #ccc',
    display: 'none',
    zIndex: '9999',
    maxHeight: '150px',
    overflowY: 'auto',
    borderRadius: '8px'
  });
  document.body.appendChild(suggestionBox);

  // --- Create Report Card ---
  function createReportCard(r) {
    const card = document.createElement("div");
    card.className = "card";

    const totalComments = r.comments.length || 0;

    card.innerHTML = `
      <div class="card-header">
        <div class="report-avatar">
          <a href="/user/${r.username}">${r.username.charAt(0).toUpperCase()}</a>
        </div>
        <div>
          <div class="report-title">${linkUsernames(r.title || '')}</div>
          <div class="report-meta"><a href="/user/${r.username}">${r.username}</a> - ${r.clinic} | ${r.timestamp}</div>
        </div>
      </div>
      <div class="report-description">${linkUsernames(r.description || '')}</div>
      ${r.image ? `<div class="report-image"><img src="${r.image}" alt="Ripoti Image"></div>` : ''}
      <div class="card-footer">
        <div class="reaction-container">
          <div class="report-thumbs">
            <span class="thumb-up">👍 <span class="count">${r.thumbs_up || 0}</span></span>
            <span class="thumb-down">👎 <span class="count">${r.thumbs_down || 0}</span></span>
            <span class="mention-count" style="display:none">0</span>
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

    // --- Thumbs reactions ---
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
        if (!res.ok) { alert(await res.text() || "Tatizo kupiga thumb"); return; }
        const data = await res.json();

        thumbsUp.querySelector(".count").textContent = data.thumbs_up;
        thumbsDown.querySelector(".count").textContent = data.thumbs_down;

        thumbsUp.classList.toggle("reacted", type === "up");
        thumbsDown.classList.toggle("reacted", type === "down");

        // Update global thumbs
        let totalUp = 0, totalDown = 0;
        document.querySelectorAll(".card").forEach(c => {
          totalUp += parseInt(c.querySelector(".thumb-up .count").textContent) || 0;
          totalDown += parseInt(c.querySelector(".thumb-down .count").textContent) || 0;
        });
        document.getElementById('totalThumbsUp').textContent = `👍 ${totalUp}`;
        document.getElementById('totalThumbsDown').textContent = `👎 ${totalDown}`;
      } catch (err) {
        console.error(err); alert("Tatizo kupiga thumb");
      }
    }

    if (!r.user_thumb) {
      thumbsUp.addEventListener("click", () => react("up"));
      thumbsDown.addEventListener("click", () => react("down"));
    }

    // --- Comments & Mention Notifications ---
    const toggleBtn = card.querySelector('.comment-toggle');
    const commentSection = card.querySelector('.report-comments');
    const mentionCountEl = card.querySelector('.mention-count');
    const ul = card.querySelector('.comments-list');

    // Load existing comments
    r.comments.forEach((c, idx) => {
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

    // Hide comment form if user's own report
    const form = card.querySelector('.comment-form');
    const input = form.querySelector('input[name="comment"]');
    form.style.display = r.username === loggedInUser ? 'none' : 'flex';

    // --- Check mentions ---
    function checkMentions() {
      let unread = 0;
      r.comments.forEach((c, idx) => {
        const key = `${r.id}_${idx}_@${loggedInUser}`;
        if (c.comment.includes('@' + loggedInUser) && !localStorage.getItem(key)) unread++;
      });
      mentionCountEl.textContent = unread;
      updateGlobalBell();
    }
    checkMentions();

    toggleBtn.addEventListener('click', () => {
      commentSection.classList.toggle('active');
      if (commentSection.classList.contains('active')) {
        // Mark mentions as read
        r.comments.forEach((c, idx) => {
          const key = `${r.id}_${idx}_@${loggedInUser}`;
          if (c.comment.includes('@' + loggedInUser)) localStorage.setItem(key, 'read');
        });
        mentionCountEl.textContent = 0;
        updateGlobalBell();
      }
    });

    // --- Comment Submission ---
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      try {
        const res = await fetch(`/api/comments/${r.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: text })
        });
        if (!res.ok) { alert(await res.text() || "Tatizo ku-tuma comment"); return; }
        const newComment = await res.json();

        // Append new comment
        const li = document.createElement('li');
        li.className = 'comment-item';
        li.innerHTML = `
          <div class="comment-avatar"><a href="/user/${newComment.username}">${newComment.username.charAt(0).toUpperCase()}</a></div>
          <div>
            <div class="comment-user"><a href="/user/${newComment.username}">${newComment.username}</a></div>
            <div class="comment-text">${linkUsernames(newComment.comment)}</div>
            <div class="comment-time">${newComment.timestamp}</div>
          </div>`;
        ul.prepend(li);

        input.value = '';
        r.comments.push(newComment);
        const countEl = card.querySelector('.comment-toggle');
        const currentCount = parseInt(countEl.textContent.match(/\d+/)) || 0;
        countEl.textContent = `💬 ${currentCount + 1} Maoni`;

        checkMentions();

      } catch (err) { console.error(err); alert("Tatizo ku-tuma comment"); }
    });

    // --- Mention Suggestions ---
    input.addEventListener('input', async () => {
      const cursorPos = input.selectionStart;
      const textBefore = input.value.slice(0, cursorPos);
      const match = textBefore.match(/@([a-zA-Z0-9_.-]*)$/);
      if (!match) { suggestionBox.style.display = 'none'; return; }

      const query = match[1].toLowerCase();
      try {
        const res = await fetch('/api/users?search=' + encodeURIComponent(query));
        const users = await res.json();
        if (!users.length) { suggestionBox.style.display = 'none'; return; }

        suggestionBox.innerHTML = '';
        users.forEach(u => {
          const item = document.createElement('div');
          item.className = 'suggestion-item';
          item.textContent = u.trim();
          item.addEventListener('click', () => {
            const atPos = textBefore.lastIndexOf('@');
            input.value = input.value.slice(0, atPos) + '@' + item.textContent + ' ' + input.value.slice(cursorPos);
            suggestionBox.style.display = 'none';
            input.focus();
          });
          suggestionBox.appendChild(item);
        });

        const rect = input.getBoundingClientRect();
        suggestionBox.style.width = rect.width + 'px';
        suggestionBox.style.left = rect.left + 'px';
        suggestionBox.style.top = rect.bottom + 'px';
        suggestionBox.style.display = 'block';
      } catch (err) { console.error(err); suggestionBox.style.display = 'none'; }
    });

    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !suggestionBox.contains(e.target)) {
        suggestionBox.style.display = 'none';
      }
    });

    return card;
  }

  // --- Load Reports ---
  async function loadReports() {
    const wrap = document.getElementById('reports-container');
    wrap.innerHTML = "<div>Inapakia...</div>";

    try {
      const res = await fetch(`/api/reports?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      wrap.innerHTML = "";

      let totalP = 0;
      data.reports.forEach(r => {
        wrap.appendChild(createReportCard(r));
        totalP++;
      });

      const totalUp = data.reports.reduce((sum,r) => sum + (r.thumbs_up||0), 0);
      const totalDown = data.reports.reduce((sum,r) => sum + (r.thumbs_down||0), 0);

      document.getElementById('totalPosts').textContent = "Ripoti " + totalP;
      document.getElementById('totalThumbsUp').textContent = "👍 " + totalUp;
      document.getElementById('totalThumbsDown').textContent = "👎 " + totalDown;

      // Update global bell after initial load
      updateGlobalBell();
    } catch (err) {
      wrap.innerHTML = `<div class="error">Hitilafu katika kupakia ripoti</div>`;
      console.error(err);
    }
  }

  loadReports();
});

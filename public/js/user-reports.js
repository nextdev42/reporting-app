document.addEventListener("DOMContentLoaded", () => {
  // --- Restore logged-in user from localStorage ---
  const storedUser = localStorage.getItem('LOGGED_IN_USER');
  const username     = (window.USERNAME || "").toLowerCase(); // profile being viewed
  const loggedInUser = (window.LOGGED_IN_USER || storedUser || "").toLowerCase();
  if(!window.LOGGED_IN_USER && storedUser) {
    window.LOGGED_IN_USER = storedUser; // restore globally if missing
  }

  const navBell = document.getElementById('nav-bell');

  // --- Global bell update ---
  function updateGlobalBell() {
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

  // --- Suggestion box ---
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

  // --- Helper to link @username ---
  function linkUsernames(text) {
    return text.replace(/@([a-zA-Z0-9_.-]+)/g, '<a href="/user/$1" class="mention">@$1</a>');
  }

  // --- Create report card ---
  function createReportCard(r) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.reportId = r.id;

    const totalComments = r.comments.length || 0;
    const thumbsUpCount = parseInt(r.thumbs_up, 10) || 0;
    const thumbsDownCount = parseInt(r.thumbs_down, 10) || 0;

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
            <span class="thumb-up">👍 <span class="count">${thumbsUpCount}</span></span>
            <span class="thumb-down">👎 <span class="count">${thumbsDownCount}</span></span>
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
        if (!res.ok) { alert(await res.text() || "Tatizo kupiga thumb"); return; }
        const data = await res.json();

        thumbsUp.querySelector(".count").textContent = parseInt(data.thumbs_up, 10) || 0;
        thumbsDown.querySelector(".count").textContent = parseInt(data.thumbs_down, 10) || 0;

        if (type === "up") {
          thumbsUp.classList.add("reacted");
          thumbsDown.classList.remove("reacted");
        } else {
          thumbsDown.classList.add("reacted");
          thumbsUp.classList.remove("reacted");
        }

        // Update global thumbs
        let totalUp = 0, totalDown = 0;
        document.querySelectorAll(".card").forEach(c => {
          totalUp += parseInt(c.querySelector(".thumb-up .count").textContent, 10) || 0;
          totalDown += parseInt(c.querySelector(".thumb-down .count").textContent, 10) || 0;
        });
        document.getElementById('totalThumbsUp').textContent = `👍 ${totalUp}`;
        document.getElementById('totalThumbsDown').textContent = `👎 ${totalDown}`;
      } catch(err) { console.error(err); alert("Tatizo kupiga thumb"); }
    }

    if (!r.user_thumb) {
      thumbsUp.addEventListener("click", () => react("up"));
      thumbsDown.addEventListener("click", () => react("down"));
    }

    // --- Load comments ---
    const ul = card.querySelector('.comments-list');
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

    // Hide comment form if own report
    const form = card.querySelector('.comment-form');
    //form.style.display = r.username === loggedInUser ? 'none' : 'flex';
    form.style.display = 'flex';

    // --- Mention checking ---
    const toggleBtn = card.querySelector('.comment-toggle');
    const commentSection = card.querySelector('.report-comments');
    const mentionEl = card.querySelector('.mention-count');

    function checkMentions() {
      let unread = 0;
      if (!loggedInUser) return;

      card.querySelectorAll('.comment-item').forEach((c, idx) => {
        const text = c.querySelector('.comment-text')?.textContent.toLowerCase() || "";
        const key = `${card.dataset.reportId}_${idx}_@${loggedInUser}`;
        if (text.includes(`@${loggedInUser}`) && !localStorage.getItem(key)) unread++;
      });

      mentionEl.textContent = unread || 0;
      updateGlobalBell();
    }

    checkMentions();

    toggleBtn.addEventListener('click', () => {
      commentSection.classList.toggle('active');
      if (commentSection.classList.contains('active')) {
        card.querySelectorAll('.comment-item').forEach((c, idx) => {
          const text = c.querySelector('.comment-text')?.textContent.toLowerCase() || "";
          const key = `${card.dataset.reportId}_${idx}_@${loggedInUser}`;
          if (text.includes(`@${loggedInUser}`)) localStorage.setItem(key, 'read');
        });
        mentionEl.textContent = 0;
        updateGlobalBell();
      }
    });

    // --- Suggestion box ---
    const input = card.querySelector('.comment-form input[name="comment"]');
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

    // --- Fix redirect links for avatar/profile ---
    const avatarLinks = card.querySelectorAll('a[href^="/user/"]');
    avatarLinks.forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const targetUser = link.getAttribute('href').split('/user/')[1];
        if(targetUser) window.location.href = `/user/${targetUser}`;
      });
    });

    return card;
  }
// --- Load reports ---
  async function loadReports() {
    const wrap = document.getElementById('reports-container');
    wrap.innerHTML = "<div>Inapakia...</div>";

    try {
      const res = await fetch(`/api/reports?username=${encodeURIComponent(username)}`);
      const data = await res.json();

      wrap.innerHTML = "";
      let totalPosts = 0, totalUp = 0, totalDown = 0;

      data.reports.forEach(r => {
        const card = createReportCard(r);
        wrap.appendChild(card);
        totalPosts++;
        totalUp += parseInt(r.thumbs_up, 10) || 0;
        totalDown += parseInt(r.thumbs_down, 10) || 0;
      });

      document.getElementById('totalPosts').textContent = "Ripoti " + totalPosts;
      document.getElementById('totalThumbsUp').textContent = `👍 ${totalUp}`;
      document.getElementById('totalThumbsDown').textContent = `👎 ${totalDown}`;

      // After cards loaded, update mentions and bell
      document.querySelectorAll('.card').forEach(card => {
        const evt = new Event('checkMentions');
        card.dispatchEvent(evt);
      });

      // Run global bell update
      updateGlobalBell();

    } catch (err) {
      wrap.innerHTML = `<div class="error">Hitilafu katika kupakia ripoti</div>`;
      console.error(err);
    }
  }

  loadReports();

  // --- Optional: persist logged-in user on login event ---
  const loginForm = document.querySelector('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', () => {
      const inputUser = document.querySelector('#login-username')?.value || '';
      if (inputUser) localStorage.setItem('LOGGED_IN_USER', inputUser.toLowerCase());
    });
  }

});
  

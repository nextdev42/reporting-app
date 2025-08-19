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

  // Thumb reactions
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
    } catch(err){
      console.error(err);
      alert("Tatizo kupiga thumb");
    }
  }

  if(!r.user_thumb){
    thumbsUp.addEventListener("click", () => react("up"));
    thumbsDown.addEventListener("click", () => react("down"));
  }

  // Toggle comments
  const toggleBtn = card.querySelector('.comment-toggle');
  const commentSection = card.querySelector('.report-comments');
  toggleBtn.addEventListener('click', () => commentSection.classList.toggle('active'));

  // Load existing comments
  const form = card.querySelector('.comment-form');
  const ul = card.querySelector('.comments-list');
  r.comments.forEach(c=>{
    const li=document.createElement('li');
    li.className='comment-item';
    li.innerHTML=`
      <div class="comment-avatar"><a href="/user/${c.username}">${c.username.charAt(0).toUpperCase()}</a></div>
      <div>
        <div class="comment-user"><a href="/user/${c.username}">${c.username}</a></div>
        <div class="comment-text">${linkUsernames(c.comment)}</div>
        <div class="comment-time">${c.timestamp}</div>
      </div>`;
    ul.appendChild(li);
  });

  // Hide comment form if it's owner's card
  form.style.display = r.username === window.LOGGED_IN_USER ? 'none' : 'flex';

  // ========== GLOBAL SUGGESTION BOX ==========
  const input = form.comment;
  const suggestionBox = document.createElement('div');
  suggestionBox.className = 'mention-suggestions';
  suggestionBox.style.position = 'fixed';
  suggestionBox.style.background = '#fff';
  suggestionBox.style.border = '1px solid #ccc';
  suggestionBox.style.display = 'none';
  suggestionBox.style.zIndex = '9999';
  suggestionBox.style.maxHeight = '150px';
  suggestionBox.style.overflowY = 'auto';
  document.body.appendChild(suggestionBox);

  let fetchController=null, selectedIndex=0, currentQuery='';

  function updateSelection(){
    const items = suggestionBox.querySelectorAll('.suggestion-item');
    items.forEach((item,i)=>item.classList.toggle('selected',i===selectedIndex));
  }

  input.addEventListener('input', async () => {
    const cursorPos = input.selectionStart;
    const textBefore = input.value.slice(0,cursorPos);
    const match = textBefore.match(/@([a-zA-Z0-9_.-]*)$/);
    if(!match){
      suggestionBox.style.display='none';
      return;
    }
    currentQuery=match[1].toLowerCase();
    if(fetchController) fetchController.abort();
    fetchController=new AbortController();
    try{
      const res=await fetch('/api/users?search='+encodeURIComponent(currentQuery),{signal:fetchController.signal});
      const users=await res.json();
      if(!users.length){
        suggestionBox.style.display='none';
        return;
      }
      suggestionBox.innerHTML='';
      users.forEach(u=>{
        const item=document.createElement('div');
        item.className='suggestion-item';
        item.textContent=u.trim();
        item.addEventListener('click',()=>{
          const start=textBefore.lastIndexOf('@');
          input.value=input.value.slice(0,start)+'@'+item.textContent+' '+input.value.slice(cursorPos);
          suggestionBox.style.display='none';
          input.focus();
        });
        suggestionBox.appendChild(item);
      });
      selectedIndex=0;
      updateSelection();

      // Position the suggestion box
      const rect=input.getBoundingClientRect();
      suggestionBox.style.top=rect.bottom+'px';
      suggestionBox.style.left=rect.left+'px';
      suggestionBox.style.width=rect.width+'px';
      suggestionBox.style.display='block';

      // --- SCROLL INTO VIEW FOR MOBILE KEYBOARD ---
      setTimeout(() => {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);

    } catch(e){
      if(e.name!=='AbortError') console.error(e);
      suggestionBox.style.display='none';
    }
  });

  // Keyboard navigation
  input.addEventListener('keydown',e=>{
    const items = suggestionBox.querySelectorAll('.suggestion-item');
    if(!items.length) return;
    if(e.key==='ArrowDown'){
      selectedIndex=(selectedIndex+1)%items.length;
      updateSelection();
      e.preventDefault();
    } else if(e.key==='ArrowUp'){
      selectedIndex=(selectedIndex-1+items.length)%items.length;
      updateSelection();
      e.preventDefault();
    } else if(e.key==='Enter'){
      const item=items[selectedIndex];
      const cursorPos=input.selectionStart;
      const before=input.value.slice(0,cursorPos);
      const atPos=before.lastIndexOf('@');
      input.value=input.value.slice(0,atPos)+'@'+item.textContent+' '+input.value.slice(cursorPos);
      suggestionBox.style.display='none';
      e.preventDefault();
    } else if(e.key==='Escape'){
      suggestionBox.style.display='none';
    }
  });

  // click outside
  document.addEventListener('click',(e)=>{
    if(!input.contains(e.target) && !suggestionBox.contains(e.target)){
      suggestionBox.style.display='none';
    }
  });

  // Comment submit
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!input.value.trim())return;
    const txt=input.value;
    input.value="";
    try{
      const res=await fetch(`/api/comments/${r.id}`,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({comment:txt})
      });
      const c=await res.json();
      const li=document.createElement('li');
      li.className='comment-item';
      li.innerHTML=`
        <div class="comment-avatar"><a href="/user/${c.username}">${c.username.charAt(0).toUpperCase()}</a></div>
        <div>
          <div class="comment-user"><a href="/user/${c.username}">${c.username}</a></div>
          <div class="comment-text">${linkUsernames(c.comment)}</div>
          <div class="comment-time">${c.timestamp}</div>
        </div>`;
      ul.prepend(li);
      toggleBtn.innerHTML=`💬 ${ul.children.length} Maoni`;
    }catch(err){
      alert("Tatizo kutuma maoni");
    }
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

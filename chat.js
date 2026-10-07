let chatUnsubscribe = null;
let isChatOpen = false;
let isInitialLoad = true;
let adminUsersList = [];
let activeReplyData = null;

// 1. Toggle Slide-Out Drawer
function toggleAdminChatDrawer() {
  const drawer = document.getElementById('adminChatDrawer');
  const overlay = document.getElementById('chatDrawerOverlay');

  if (!drawer) return;

  isChatOpen = drawer.classList.contains('open');

  if (isChatOpen) {
    // Close Drawer
    drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    isChatOpen = false;
  } else {
    // Open Drawer
    drawer.classList.add('open');
    if (overlay) overlay.classList.add('open');
    isChatOpen = true;

    // Clear red notification dot when opening
    clearUnreadNotification();

    // Scroll feed to bottom
    const container = document.getElementById('chatMessagesBody');
    if (container) container.scrollTop = container.scrollHeight;
  }
}

function clearUnreadNotification() {
  const badge = document.getElementById('unreadChatBadge');
  if (badge) badge.style.display = 'none';
}

function showUnreadNotification() {
    const badge = document.getElementById('unreadChatBadge');
    if (badge) {
      badge.style.display = 'inline-block';
    }
  }

// Date Formatter Helper for Arabic Separators
function formatArabicDateSeparator(date) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
  
    // Reset time portions for accurate date comparison
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const y = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
  
    const diffDays = Math.round((t - d) / (1000 * 60 * 60 * 24));
  
    if (diffDays === 0) {
      return 'اليوم'; // Today
    } else if (diffDays === 1) {
      return 'الأمس'; // Yesterday
    } else if (diffDays < 7) {
      // Weekday name in Arabic (e.g., 'الثلاثاء')
      return date.toLocaleDateString('ar-EG', { weekday: 'long' });
    } else {
      // Formatted date (e.g., 'الخميس، 30 أكتوبر')
      return date.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'long' });
    }
  }
  
  // Updated Listener with Date Separators
  function startBackgroundChatListener() {
    const firestoreDb = window.db || (typeof firebase !== 'undefined' ? firebase.firestore() : null);
    const container = document.getElementById('chatMessagesBody');
  
    if (!firestoreDb) return;
  
    const sessionData = localStorage.getItem('currentUser');
    const currentUser = sessionData ? JSON.parse(sessionData) : { username: 'admin' };
    
    const rawUsername = currentUser.username || currentUser.name || currentUser.email?.split('@')[0] || 'admin';
    const cleanMyUsername = rawUsername.toLowerCase().replace(/\s+/g, '').trim();
  
    if (chatUnsubscribe) chatUnsubscribe();
  
    chatUnsubscribe = firestoreDb.collection('admin_chat')
      .orderBy('timestamp', 'asc')
      .limitToLast(50)
      .onSnapshot((snapshot) => {
        if (!container) return;
  
        if (snapshot.empty) {
          container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px 0;">لا توجد رسائل سابقة. ابدأ المحادثة الآن!</p>';
          return;
        }
  
        if (!isInitialLoad && !isChatOpen) {
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
              const newMsg = change.doc.data();
              const sender = (newMsg.sender || '').toLowerCase().replace(/\s+/g, '').trim();
              if (sender !== cleanMyUsername) {
                showUnreadNotification();
              }
            }
          });
        }
  
        container.innerHTML = '';
        let lastRenderedDateStr = null; // Track date changes
  
        snapshot.forEach(doc => {
            const msg = doc.data();
            const msgId = doc.id;
            const msgSender = (msg.sender || 'admin').toLowerCase().replace(/\s+/g, '').trim();
            const isMine = msgSender === cleanMyUsername;
            const textContent = msg.text || '';
            const cleanTextLower = textContent.toLowerCase().replace(/\s+/g, '');
            const isMentioned = !isMine && cleanMyUsername && cleanTextLower.includes(`@${cleanMyUsername}`);
            const dateObj = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
            const timeStr = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            const formattedSenderName = formatCapitalizedUsername(msg.senderName || msg.sender);
          
            // Styled mentions
            const styledText = textContent.replace(/@([a-zA-Z0-9_]+)/g, (match, username) => {
              const cleanUser = username.toLowerCase().trim();
              const foundAdmin = adminUsersList.find(a => a.username === cleanUser);
              return `<span class="mention-tag-highlight">@${foundAdmin ? foundAdmin.name : username}</span>`;
            });
          
            // Quoted Reply HTML
            let quotedHTML = '';
            if (msg.replyTo) {
              quotedHTML = `
                <div class="quoted-reply-box">
                  <span class="quoted-reply-sender">${msg.replyTo.senderName}</span>
                  <div class="quoted-reply-text">${msg.replyTo.text}</div>
                </div>
              `;
            }
          
            // Wrapper element
            const wrapper = document.createElement('div');
            wrapper.className = `chat-bubble-wrapper ${isMine ? 'mine' : 'other'}`;
          
            // Bubble element
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${isMine ? 'mine' : 'other'} ${isMentioned ? 'mentioned' : ''}`;
            bubble.innerHTML = `
              ${!isMine ? `<span class="chat-sender-tag">${formattedSenderName}</span>` : ''}
              ${quotedHTML}
              <div class="chat-text-content">${styledText}</div>
              <span class="chat-time-tag">${timeStr}</span>
            `;
          
            // Hover Reply Button (Desktop)
            const replyBtn = document.createElement('button');
            replyBtn.type = 'button';
            replyBtn.className = 'hover-reply-btn';
            replyBtn.title = 'رد على هذه الرسالة';
            replyBtn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2.5">
                <polyline points="9 17 4 12 9 7"></polyline>
                <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
              </svg>
            `;
            replyBtn.onclick = () => setReplyMode(msgId, formattedSenderName, textContent);
          
            if (isMine) {
              wrapper.appendChild(bubble);
              wrapper.appendChild(replyBtn);
            } else {
              wrapper.appendChild(replyBtn);
              wrapper.appendChild(bubble);
            }
          
            // Attach Touch Gesture for Mobile
            attachSwipeToReply(wrapper, bubble, msgId, formattedSenderName, textContent);
          
            container.appendChild(wrapper);
          });
  
        if (isChatOpen) {
          container.scrollTop = container.scrollHeight;
        }
  
        isInitialLoad = false;
      }, (err) => {
        console.error("Error listening to admin chat:", err);
      });
  }

// 3. Send Message Handler
async function handleSendAdminMessage(e) {
    if (e) e.preventDefault();
  
    const input = document.getElementById('chatTextInput');
    const firestoreDb = window.db || (typeof firebase !== 'undefined' ? firebase.firestore() : null);
  
    if (!input || !firestoreDb) return;
  
    const text = input.value.trim();
    if (!text) return;
  
    const sessionData = localStorage.getItem('currentUser');
    const currentUser = sessionData ? JSON.parse(sessionData) : null;
  
    if (!currentUser) {
      alert('يرجى تسجيل الدخول أولاً');
      return;
    }
  
    try {
      const payload = {
        sender: currentUser.username || 'admin',
        senderName: currentUser.name || currentUser.username || 'مشرف',
        gender: currentUser.gender || 'male',
        text: text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
  
      // Attach reply reference if replying
      if (activeReplyData) {
        payload.replyTo = {
          messageId: activeReplyData.id,
          senderName: activeReplyData.senderName,
          text: activeReplyData.text
        };
      }
  
      input.value = '';
      cancelReplyMode(); // Reset reply state
  
      await firestoreDb.collection('admin_chat').add(payload);
    } catch (err) {
      console.error("Error sending chat message:", err);
      alert('فشل إرسال الرسالة، يرجى المحاولة مرة أخرى');
    }
  }

// Helper to capitalize usernames
function formatCapitalizedUsername(username) {
  if (!username) return 'Admin';
  const cleaned = username.replace(/[_-]/g, ' ');
  return cleaned
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

async function loadAdminUsersForMentions() {
    const firestoreDb = window.db || (typeof firebase !== 'undefined' ? firebase.firestore() : null);
    if (!firestoreDb) return;
  
    try {
      const snapshot = await firestoreDb.collection('users').get();
      adminUsersList = [];
  
      snapshot.forEach(doc => {
        const data = doc.data();
        const role = (data.role || 'student').toLowerCase().trim();
        
        // Strictly restrict autocomplete list to admins and superadmins only
        if (role === 'admin' || role === 'superadmin') {
          const cleanUsername = (data.username || doc.id).toLowerCase().replace(/\s+/g, '');
          adminUsersList.push({
            username: cleanUsername,
            name: data.name || cleanUsername
          });
        }
      });
    } catch (err) {
      console.error("Error loading admins for mention list:", err);
    }
  }
  

  function handleChatInput(e) {
    const input = e.target;
    const value = input.value;
    const cursorIndex = input.selectionStart;
  
    const textBeforeCursor = value.slice(0, cursorIndex);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');
  
    if (lastAtPos !== -1) {
      const query = textBeforeCursor.slice(lastAtPos + 1).toLowerCase().trim();
      if (!query.includes(' ')) {
        showMentionDropdown(query, lastAtPos);
        return;
      }
    }
  
    hideMentionDropdown();
  }
  
  function showMentionDropdown(query, atIndex) {
    const popup = document.getElementById('mentionDropdown');
    if (!popup) return;
  
    const matches = adminUsersList.filter(admin => 
      admin.username.includes(query) || admin.name.toLowerCase().includes(query)
    );
  
    if (matches.length === 0) {
      hideMentionDropdown();
      return;
    }
  
    popup.innerHTML = '';
    matches.forEach(admin => {
      const item = document.createElement('div');
      item.className = 'mention-item';
      item.innerHTML = `
        <div class="mention-item-name">${admin.name}</div>
        <div class="mention-item-username">@${admin.username}</div>
      `;
  
      item.onclick = () => selectMentionUser(admin.username, atIndex);
      popup.appendChild(item);
    });
  
    popup.style.display = 'block';
  }
  
  function selectMentionUser(username, atIndex) {
    const input = document.getElementById('chatTextInput');
    if (!input) return;
  
    const value = input.value;
    const beforeAt = value.slice(0, atIndex);
    const afterAt = value.slice(input.selectionStart);
  
    input.value = `${beforeAt}@${username} ${afterAt}`;
    hideMentionDropdown();
    input.focus();
  }
  
  function hideMentionDropdown() {
    const popup = document.getElementById('mentionDropdown');
    if (popup) popup.style.display = 'none';
  }

// 1. Enable Reply Mode
function setReplyMode(msgId, senderName, messageText) {
  activeReplyData = { id: msgId, senderName, text: messageText };

  const container = document.getElementById('replyPreviewContainer');
  const senderEl = document.getElementById('replyPreviewSender');
  const textEl = document.getElementById('replyPreviewText');
  const input = document.getElementById('chatTextInput');

  if (container && senderEl && textEl) {
    senderEl.textContent = `الرد على: ${senderName}`;
    textEl.textContent = messageText;
    container.style.display = 'flex';
  }

  if (input) input.focus();
}

// 2. Cancel Reply Mode
function cancelReplyMode() {
  activeReplyData = null;
  const container = document.getElementById('replyPreviewContainer');
  if (container) container.style.display = 'none';
}

// 3. Attach Touch Swipe Listener for Mobile
function attachSwipeToReply(wrapper, bubble, msgId, senderName, messageText) {
  let startX = 0;
  let currentX = 0;
  let isSwiping = false;

  // Create swipe icon element behind bubble
  const swipeIcon = document.createElement('div');
  swipeIcon.className = 'swipe-reply-icon';
  swipeIcon.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="9 17 4 12 9 7"></polyline>
      <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
    </svg>
  `;
  wrapper.appendChild(swipeIcon);

  bubble.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isSwiping = true;
  }, { passive: true });

  bubble.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    currentX = e.touches[0].clientX - startX;

    // Only allow swipe to the right (positive X in standard layout)
    if (currentX > 0 && currentX < 90) {
      bubble.style.transform = `translateX(${currentX}px)`;
      bubble.classList.add('swiping');

      if (currentX > 40) {
        swipeIcon.classList.add('visible');
      } else {
        swipeIcon.classList.remove('visible');
      }
    }
  }, { passive: true });

  bubble.addEventListener('touchend', () => {
    if (!isSwiping) return;
    isSwiping = false;

    if (currentX > 50) {
      // Trigger reply when swiped past threshold
      setReplyMode(msgId, senderName, messageText);
    }

    // Spring back bubble
    bubble.style.transition = 'transform 0.2s ease-out';
    bubble.style.transform = 'translateX(0px)';
    swipeIcon.classList.remove('visible');

    setTimeout(() => {
      bubble.style.transition = '';
      bubble.classList.remove('swiping');
    }, 200);
  });
}

// Initialize listener when page loads
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    loadAdminUsersForMentions();
    startBackgroundChatListener();
  }, 800);
});
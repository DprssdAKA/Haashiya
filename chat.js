let chatUnsubscribe = null;
let isChatOpen = false;
let isInitialLoad = true;
let adminUsersList = [];

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
          const dateObj = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
  
          // 1. Check if we need to insert a Date Separator
          const dateKey = dateObj.toDateString();
          if (dateKey !== lastRenderedDateStr) {
            const datePill = document.createElement('div');
            datePill.className = 'chat-date-separator';
            datePill.textContent = formatArabicDateSeparator(dateObj);
            container.appendChild(datePill);
            lastRenderedDateStr = dateKey;
          }
  
          // 2. Render Message Bubble
          const msgSender = (msg.sender || 'admin').toLowerCase().replace(/\s+/g, '').trim();
          const isMine = msgSender === cleanMyUsername;
          const textContent = msg.text || '';
          const cleanTextLower = textContent.toLowerCase().replace(/\s+/g, '');
  
          const isMentioned = !isMine && cleanMyUsername && cleanTextLower.includes(`@${cleanMyUsername}`);
          const timeStr = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
          const formattedSenderName = formatCapitalizedUsername(msg.senderName || msg.sender);
// Replace @username with @DisplayName inside the bubble text
const styledText = textContent.replace(/@([a-zA-Z0-9_]+)/g, (match, username) => {
    const cleanUser = username.toLowerCase().trim();
    // Find matching user in adminUsersList cache
    const foundAdmin = adminUsersList.find(a => a.username === cleanUser);
    const displayName = foundAdmin ? foundAdmin.name : username;
    
    return `<span class="mention-tag-highlight">@${displayName}</span>`;
  });  
          const bubble = document.createElement('div');
          bubble.className = `chat-bubble ${isMine ? 'mine' : 'other'} ${isMentioned ? 'mentioned' : ''}`;
  
          bubble.innerHTML = `
            ${!isMine ? `<span class="chat-sender-tag">${formattedSenderName}</span>` : ''}
            <div class="chat-text-content">${styledText}</div>
            <span class="chat-time-tag">${timeStr}</span>
          `;
  
          container.appendChild(bubble);
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
    input.value = '';

    await firestoreDb.collection('admin_chat').add({
      sender: currentUser.username || 'admin',
      senderName: currentUser.name || currentUser.username || 'مشرف',
      gender: currentUser.gender || 'male',
      text: text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
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

  

// Initialize listener when page loads
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    loadAdminUsersForMentions();
    startBackgroundChatListener();
  }, 800);
});
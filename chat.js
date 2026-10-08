let chatUnsubscribe = null;
let isChatOpen = false;
let isInitialLoad = true;
let adminUsersList = [];
let activeReplyData = null;
let editingMessageId = null ;
let pendingDeleteMsgId = null;

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
            const now = new Date();
            const diffMinutes = (now - dateObj) / (1000 * 60);
            const isEditable = isMine && diffMinutes <= 10;
            const editedTagHTML = msg.isEdited ? `<span class="chat-edited-tag">(معدّل) </span>` : '';
            
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
                <div class="quoted-reply-box" onclick="event.stopPropagation(); scrollToRepliedMessage('${msg.replyTo.messageId}')" title="الانتقال إلى الرسالة الأصلية">
                  <span class="quoted-reply-sender">${msg.replyTo.senderName}</span>
                  <div class="quoted-reply-text">${msg.replyTo.text}</div>
                </div>
              `;
            }
          
            // Wrapper element
            const wrapper = document.createElement('div');
            wrapper.id = `msg-wrapper-${msgId}`;
            wrapper.className = `chat-bubble-wrapper ${isMine ? 'mine' : 'other'}`;
          
            // Bubble element
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${isMine ? 'mine' : 'other'} ${isMentioned ? 'mentioned' : ''}`;
            bubble.innerHTML = `
              ${!isMine ? `<span class="chat-sender-tag">${formattedSenderName}</span>` : ''}
              ${quotedHTML}
              <div class="chat-text-content">${styledText}</div>
              <span class="chat-time-tag">${editedTagHTML}${timeStr}</span>
            `;

            // 1. Desktop Hover Reply Button
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

            // 2. Desktop Hover Action Group
            const actionGroup = document.createElement('div');
            actionGroup.className = 'chat-action-btns';

            if (isMine) {
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'hover-delete-btn';
                deleteBtn.title = 'حذف الرسالة';
                deleteBtn.innerHTML = `
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                `;
                deleteBtn.onclick = () => openDeleteChatModal(msgId);
                actionGroup.appendChild(deleteBtn);
              }

            if (isEditable) {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'hover-edit-btn';
            editBtn.title = 'تعديل الرسالة';
            editBtn.innerHTML = `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            `;
            editBtn.onclick = () => setEditMode(msgId, textContent, dateObj);
            actionGroup.appendChild(editBtn);
            }

            actionGroup.appendChild(replyBtn);

            // Assemble Wrapper correctly
    // Assemble Wrapper
wrapper.appendChild(bubble);
wrapper.appendChild(actionGroup);

            // Attach Mobile Gestures
            
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
    const currentUser = sessionData ? JSON.parse(sessionData) : { username: 'admin' };
  
    try {
      if (editingMessageId) {
        // Update existing Firestore document
        await firestoreDb.collection('admin_chat').doc(editingMessageId).update({
          text: text,
          isEdited: true,
          editedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        cancelEditMode();
      } else {
        // Send new message
        const payload = {
          sender: currentUser.username || 'admin',
          senderName: currentUser.name || currentUser.username || 'مشرف',
          gender: currentUser.gender || 'male',
          text: text,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
  
        if (activeReplyData) {
          payload.replyTo = {
            messageId: activeReplyData.id,
            senderName: activeReplyData.senderName,
            text: activeReplyData.text
          };
        }
  
        await firestoreDb.collection('admin_chat').add(payload);
        cancelReplyMode();
      }
  
      input.value = '';
      input.style.height = '42px';
    } catch (err) {
      console.error("Error sending or editing message:", err);
      alert('حدث خطأ أثناء حفظ الرسالة');
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
  
// 1. Automatically expand/shrink textarea height based on content
function autoExpandTextarea(textarea) {
    textarea.style.height = '42px'; // Reset height to calculate scrollHeight correctly
    const newHeight = Math.min(textarea.scrollHeight, 120); // Cap at 120px
    textarea.style.height = `${newHeight}px`;
  
    // Toggle scrollbar when text exceeds max-height
    textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';
  }
  
  // 2. Handle Enter vs Shift+Enter behavior
  function handleChatTextareaEnter(e) {
    // On desktop, pressing Enter sends message; Shift+Enter inserts a new line
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
      e.preventDefault();
      handleSendAdminMessage(e);
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

// 1. Delete Modal Triggers
function openDeleteChatModal(msgId) {
  pendingDeleteMsgId = msgId;
  const modal = document.getElementById('deleteChatModal');
  if (modal) modal.classList.add('show');
}

function closeDeleteChatModal() {
  pendingDeleteMsgId = null;
  const modal = document.getElementById('deleteChatModal');
  if (modal) modal.classList.remove('show');
}

async function confirmDeleteChatMessage() {
  if (!pendingDeleteMsgId) return;

  const firestoreDb = window.db || (typeof firebase !== 'undefined' ? firebase.firestore() : null);
  if (!firestoreDb) return;

  try {
    await firestoreDb.collection('admin_chat').doc(pendingDeleteMsgId).delete();
    closeDeleteChatModal();
  } catch (err) {
    console.error("Error deleting chat message:", err);
    alert('حدث خطأ أثناء حذف الرسالة');
  }
}

// 2. Mobile Long-Press Options Sheet
function openMobileContextMenu(msgId, senderName, textContent, timestampDate, isMine) {
  const overlay = document.getElementById('mobileChatContextMenu');
  const replyBtn = document.getElementById('mobileContextReplyBtn');
  const editBtn = document.getElementById('mobileContextEditBtn');
  const deleteBtn = document.getElementById('mobileContextDeleteBtn');

  if (!overlay) return;

  const now = new Date();
  const diffMinutes = (now - timestampDate) / (1000 * 60);
  const isEditable = isMine && diffMinutes <= 10;

  // Configure Reply Option
  if (replyBtn) {
    replyBtn.onclick = () => {
      closeMobileContextMenu();
      setReplyMode(msgId, senderName, textContent);
    };
  }

  // Configure Edit Option (Only if owned & within 10 mins)
  if (editBtn) {
    editBtn.style.display = isEditable ? 'flex' : 'none';
    editBtn.onclick = () => {
      closeMobileContextMenu();
      setEditMode(msgId, textContent, timestampDate);
    };
  }

  // Configure Delete Option (Only if owned)
  if (deleteBtn) {
    deleteBtn.style.display = isMine ? 'flex' : 'none';
    deleteBtn.onclick = () => {
      closeMobileContextMenu();
      openDeleteChatModal(msgId);
    };
  }

  overlay.classList.add('show');
}

function closeMobileContextMenu() {
  const overlay = document.getElementById('mobileChatContextMenu');
  if (overlay) overlay.classList.remove('show');
}

// Update Mobile Long-Press Touch Listener
function attachLongPressToEdit(bubble, msgId, senderName, messageText, timestampDate, isMine) {
  let pressTimer = null;

  bubble.addEventListener('touchstart', (e) => {
    pressTimer = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(40);
      openMobileContextMenu(msgId, senderName, messageText, timestampDate, isMine);
    }, 500);
  }, { passive: true });

  bubble.addEventListener('touchend', () => clearTimeout(pressTimer));
  bubble.addEventListener('touchmove', () => clearTimeout(pressTimer));
}

// Jump & Scroll to Original Replied Message
function scrollToRepliedMessage(targetMsgId) {
    if (!targetMsgId) return;
  
    const targetWrapper = document.getElementById(`msg-wrapper-${targetMsgId}`);
    const chatBody = document.getElementById('chatMessagesBody');
  
    if (targetWrapper && chatBody) {
      // Smooth scroll to target message
      targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
      // Trigger pulse animation
      targetWrapper.classList.remove('target-highlight');
      void targetWrapper.offsetWidth; // Force CSS reflow to restart animation
      targetWrapper.classList.add('target-highlight');
  
      // Remove animation class after completion
      setTimeout(() => {
        targetWrapper.classList.remove('target-highlight');
      }, 1500);
    }
  }

// 1. Enable Edit Mode (Validates 10-Minute Window)
function setEditMode(msgId, messageText, timestampDate) {
  const now = new Date();
  const diffMinutes = (now - timestampDate) / (1000 * 60);

  if (diffMinutes > 10) {
    alert('عذراً، لا يمكنك تعديل الرسالة بعد مرور 10 دقائق على إرسالها.');
    return;
  }

  cancelReplyMode(); // Cancel reply if active
  editingMessageId = msgId;

  const container = document.getElementById('editPreviewContainer');
  const textEl = document.getElementById('editPreviewText');
  const input = document.getElementById('chatTextInput');

  if (container && textEl) {
    textEl.textContent = messageText;
    container.style.display = 'flex';
  }

  if (input) {
    input.value = messageText;
    autoExpandTextarea(input);
    input.focus();
  }
}

// 2. Cancel Edit Mode
function cancelEditMode() {
  editingMessageId = null;
  const container = document.getElementById('editPreviewContainer');
  const input = document.getElementById('chatTextInput');

  if (container) container.style.display = 'none';
  if (input) {
    input.value = '';
    input.style.height = '42px';
  }
}

// 3. Attach Mobile Long-Press Gesture (Hold 500ms to Edit)
function attachLongPressToEdit(bubble, msgId, messageText, timestampDate) {
  let pressTimer = null;

  bubble.addEventListener('touchstart', (e) => {
    pressTimer = setTimeout(() => {
      // Trigger haptic feedback if supported on mobile
      if (navigator.vibrate) navigator.vibrate(40);
      setEditMode(msgId, messageText, timestampDate);
    }, 550);
  }, { passive: true });

  bubble.addEventListener('touchend', () => clearTimeout(pressTimer));
  bubble.addEventListener('touchmove', () => clearTimeout(pressTimer));
}
// Initialize listener when page loads
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    loadAdminUsersForMentions();
    startBackgroundChatListener();
  }, 800);
});
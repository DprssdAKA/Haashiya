let chatUnsubscribe = null;
let isChatOpen = false;
let isInitialLoad = true;
let adminUsersList = [];
let activeReplyData = null;
let editingMessageId = null;
let pendingDeleteMsgId = null;
let closeActiveSwipeMenu = null; // closes the currently open swipe popup (mobile)
let pendingAttachments = [];     // staged files waiting to be sent
let isChatSending = false;
let chatMessagesCache = {};      // msgId -> message data (used for edit/delete lookups)

// 1. Toggle Slide-Out Drawer
function toggleAdminChatDrawer() {
  closeOpenSwipeMenu();
  const drawer = document.getElementById('adminChatDrawer');
  const overlay = document.getElementById('chatDrawerOverlay');

  if (!drawer) return;

  isChatOpen = drawer.classList.contains('open');

  if (isChatOpen) {
    drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    isChatOpen = false;
  } else {
    drawer.classList.add('open');
    if (overlay) overlay.classList.add('open');
    isChatOpen = true;

    clearUnreadNotification();

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

  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const diffDays = Math.round((t - d) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'اليوم';
  if (diffDays === 1) return 'الأمس';
  if (diffDays < 7) return date.toLocaleDateString('ar-EG', { weekday: 'long' });
  return date.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'long' });
}

// Background Chat Listener
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

      closeActiveSwipeMenu = null;
      chatMessagesCache = {};
      container.innerHTML = '';

      snapshot.forEach(doc => {
        const msg = doc.data();
        const msgId = doc.id;
        const msgSender = (msg.sender || 'admin').toLowerCase().replace(/\s+/g, '').trim();
        const isMine = msgSender === cleanMyUsername;
        const textContent = msg.text || '';
        chatMessagesCache[msgId] = msg;
        const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
        const replyPreviewText = textContent || getAttachmentLabel(attachments);
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

        // 1. Outer Wrapper
        const wrapper = document.createElement('div');
        wrapper.id = `msg-wrapper-${msgId}`;
        wrapper.className = `chat-bubble-wrapper ${isMine ? 'mine' : 'other'}`;

        // 2. Tightly Fitted Relative Wrapper
        const bubbleRelative = document.createElement('div');
        bubbleRelative.className = 'chat-bubble-relative';

        // 3. Message Bubble
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${isMine ? 'mine' : 'other'} ${isMentioned ? 'mentioned' : ''}`;
        bubble.innerHTML = `
          ${!isMine ? `<span class="chat-sender-tag">${formattedSenderName}</span>` : ''}
          ${quotedHTML}
          <div class="chat-text-content">${styledText}</div>
          <span class="chat-time-tag">${editedTagHTML}${timeStr}</span>
        `;

        // Attachments (images / videos / files)
        if (attachments.length) {
          const textEl = bubble.querySelector('.chat-text-content');
          bubble.insertBefore(buildAttachmentsElement(attachments), textEl);
          if (!textContent) textEl.style.display = 'none';
        }

        // 4. Action Buttons Group
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
        replyBtn.onclick = () => setReplyMode(msgId, formattedSenderName, replyPreviewText);
        actionGroup.appendChild(replyBtn);

        // Assemble DOM Elements in correct order
        bubbleRelative.appendChild(bubble);
        bubbleRelative.appendChild(actionGroup);
        wrapper.appendChild(bubbleRelative);

        // Touch Gestures for Mobile
        attachSwipeGestures(wrapper, bubble, msgId, formattedSenderName, textContent, dateObj, isMine, replyPreviewText);

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

// Send Message Handler (text + optional attachments)
async function handleSendAdminMessage(e) {
  if (e) e.preventDefault();
  if (isChatSending) return;

  const input = document.getElementById('chatTextInput');
  const firestoreDb = window.db || (typeof firebase !== 'undefined' ? firebase.firestore() : null);

  if (!input || !firestoreDb) return;

  const text = input.value.trim();
  const isEditing = !!editingMessageId;

  if (isEditing) {
    // An attachment-only message may have its caption cleared
    const hasAttachments = (chatMessagesCache[editingMessageId]?.attachments || []).length > 0;
    if (!text && !hasAttachments) return;
  } else if (!text && pendingAttachments.length === 0) {
    return;
  }

  const sessionData = localStorage.getItem('currentUser');
  const currentUser = sessionData ? JSON.parse(sessionData) : { username: 'admin' };

  setChatSending(true);

  try {
    if (isEditing) {
      await firestoreDb.collection('admin_chat').doc(editingMessageId).update({
        text: text,
        isEdited: true,
        editedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      cancelEditMode();
    } else {
      let attachments = [];
      if (pendingAttachments.length) {
        attachments = await uploadPendingAttachments();
      }

      const payload = {
        sender: currentUser.username || 'admin',
        senderName: currentUser.name || currentUser.username || 'مشرف',
        gender: currentUser.gender || 'male',
        text: text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (attachments.length) {
        payload.attachments = attachments;
      }

      if (activeReplyData) {
        payload.replyTo = {
          messageId: activeReplyData.id,
          senderName: activeReplyData.senderName,
          text: activeReplyData.text
        };
      }

      await firestoreDb.collection('admin_chat').add(payload);
      cancelReplyMode();
      clearPendingAttachments();
    }

    input.value = '';
    input.style.height = '42px';
  } catch (err) {
    console.error("Error sending or editing message:", err);
    showChatToast(pendingAttachments.length ? 'فشل رفع الملفات، حاول مرة أخرى' : 'حدث خطأ أثناء حفظ الرسالة');
  } finally {
    setChatSending(false);
  }
}

// Helper to Capitalize Username
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

function autoExpandTextarea(textarea) {
  textarea.style.height = '42px';
  const newHeight = Math.min(textarea.scrollHeight, 120);
  textarea.style.height = `${newHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';
}

function handleChatTextareaEnter(e) {
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

function cancelReplyMode() {
  activeReplyData = null;
  const container = document.getElementById('replyPreviewContainer');
  if (container) container.style.display = 'none';
}

// --- MOBILE SWIPE GESTURES ---
// Swipe right  -> reply (any message)
// Swipe left   -> Edit / Delete popup (own messages only)
const SWIPE_REPLY_THRESHOLD = 50;
const SWIPE_MENU_THRESHOLD = 40;
const SWIPE_MENU_OFFSET = 52;   // how far the bubble slides to make room for the popup
const EDIT_WINDOW_MINUTES = 10;

function closeOpenSwipeMenu() {
  if (closeActiveSwipeMenu) {
    const close = closeActiveSwipeMenu;
    closeActiveSwipeMenu = null;
    close();
  }
}

function attachSwipeGestures(wrapper, bubble, msgId, senderName, messageText, timestampDate, isMine, replyText = messageText) {
  // Touch devices only (desktop uses hover buttons)
  if (window.matchMedia('(pointer: fine)').matches) return;

  let startX = 0;
  let startY = 0;
  let pos = 0;
  let axis = null;       // 'x' | 'y' | null
  let tracking = false;
  let menuOpen = false;
  let popup = null;

  const swipeIcon = document.createElement('div');
  swipeIcon.className = 'swipe-reply-icon';
  swipeIcon.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="9 17 4 12 9 7"></polyline>
      <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
    </svg>
  `;
  wrapper.appendChild(swipeIcon);

  function animateTo(x) {
    bubble.classList.remove('swiping');
    bubble.style.transition = 'transform 0.2s ease-out';
    bubble.style.transform = `translateX(${x}px)`;
    setTimeout(() => { bubble.style.transition = ''; }, 200);
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    animateTo(0);
    bubble.classList.remove('swipe-open');
    if (popup) {
      const p = popup;
      popup = null;
      p.classList.remove('visible');
      setTimeout(() => p.remove(), 200);
    }
    wrapper.style.minHeight = '';
    wrapper.style.alignItems = '';
  }

  function makeActionBtn(type, label, svg, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `swipe-action-btn ${type}`;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.innerHTML = svg;
    btn.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };
    return btn;
  }

  function openMenu() {
    closeOpenSwipeMenu();
    menuOpen = true;

    // Edit window is checked at the moment of opening, not at render time
    const canEdit = (new Date() - timestampDate) / (1000 * 60) <= EDIT_WINDOW_MINUTES;

    popup = document.createElement('div');
    popup.className = 'swipe-actions-popup';

    if (canEdit) {
      popup.appendChild(makeActionBtn('edit', 'تعديل الرسالة', `
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>`, () => {
          closeOpenSwipeMenu();
          setEditMode(msgId, messageText, timestampDate);
        }));
    }

    popup.appendChild(makeActionBtn('delete', 'حذف الرسالة', `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>`, () => {
        closeOpenSwipeMenu();
        openDeleteChatModal(msgId);
      }));

    wrapper.appendChild(popup);

    // Make sure the popup never overlaps neighbouring messages
    wrapper.style.alignItems = 'center';
    wrapper.style.minHeight = `${popup.offsetHeight + 8}px`;

    bubble.classList.add('swipe-open');
    animateTo(-SWIPE_MENU_OFFSET);
    requestAnimationFrame(() => popup && popup.classList.add('visible'));

    closeActiveSwipeMenu = closeMenu;
  }

  bubble.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    pos = menuOpen ? -SWIPE_MENU_OFFSET : 0;
    axis = null;
    tracking = true;
  }, { passive: true });

  bubble.addEventListener('touchmove', (e) => {
    if (!tracking) return;

    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    // Decide direction once, so vertical scrolling is never hijacked
    if (axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis !== 'x') return;

    const base = menuOpen ? -SWIPE_MENU_OFFSET : 0;
    let next = base + dx;

    if (menuOpen) {
      next = Math.min(0, Math.max(-SWIPE_MENU_OFFSET - 16, next));
    } else if (isMine) {
      next = Math.min(90, Math.max(-SWIPE_MENU_OFFSET - 16, next));
    } else {
      next = Math.min(90, Math.max(0, next));   // others' messages: reply only
    }

    pos = next;
    bubble.classList.add('swiping');
    bubble.style.transform = `translateX(${pos}px)`;

    if (!menuOpen && pos > 40) {
      swipeIcon.classList.add('visible');
    } else {
      swipeIcon.classList.remove('visible');
    }
  }, { passive: true });

  bubble.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = false;
    swipeIcon.classList.remove('visible');

    // Plain tap on an open bubble closes the popup
    if (axis === null) {
      if (menuOpen) closeOpenSwipeMenu();
      return;
    }
    if (axis !== 'x') return;

    if (menuOpen) {
      if (pos > -SWIPE_MENU_OFFSET / 2) {
        closeOpenSwipeMenu();
      } else {
        animateTo(-SWIPE_MENU_OFFSET);
      }
      return;
    }

    if (pos > SWIPE_REPLY_THRESHOLD) {
      animateTo(0);
      setReplyMode(msgId, senderName, replyText);
    } else if (isMine && pos < -SWIPE_MENU_THRESHOLD) {
      openMenu();
    } else {
      animateTo(0);
    }
  });

  bubble.addEventListener('touchcancel', () => {
    tracking = false;
    swipeIcon.classList.remove('visible');
    if (menuOpen) {
      animateTo(-SWIPE_MENU_OFFSET);
    } else {
      animateTo(0);
    }
  });
}

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

  const msgId = pendingDeleteMsgId;
  const filePaths = (chatMessagesCache[msgId]?.attachments || []).map(a => a.path).filter(Boolean);

  try {
    await firestoreDb.collection('admin_chat').doc(msgId).delete();
    closeDeleteChatModal();

    // Best-effort cleanup of the files in Supabase Storage
    if (filePaths.length && window.supabaseClient) {
      window.supabaseClient.storage.from(CHAT_STORAGE_BUCKET).remove(filePaths)
        .then(({ error }) => { if (error) console.warn('Could not remove chat files:', error.message); })
        .catch(err => console.warn('Could not remove chat files:', err));
    }
  } catch (err) {
    console.error("Error deleting chat message:", err);
    alert('حدث خطأ أثناء حذف الرسالة');
  }
}

function scrollToRepliedMessage(targetMsgId) {
  if (!targetMsgId) return;

  const targetWrapper = document.getElementById(`msg-wrapper-${targetMsgId}`);
  const chatBody = document.getElementById('chatMessagesBody');

  if (targetWrapper && chatBody) {
    targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });

    targetWrapper.classList.remove('target-highlight');
    void targetWrapper.offsetWidth;
    targetWrapper.classList.add('target-highlight');

    setTimeout(() => {
      targetWrapper.classList.remove('target-highlight');
    }, 1500);
  }
}

function setEditMode(msgId, messageText, timestampDate) {
  const now = new Date();
  const diffMinutes = (now - timestampDate) / (1000 * 60);

  if (diffMinutes > 10) {
    alert('عذراً، لا يمكنك تعديل الرسالة بعد مرور 10 دقائق على إرسالها.');
    return;
  }

  cancelReplyMode();
  if (pendingAttachments.length) {
    clearPendingAttachments();
    showChatToast('تم إلغاء المرفقات أثناء تعديل الرسالة');
  }
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

// =====================================================================
// ATTACHMENTS (photos / videos / files) -> Supabase Storage
// =====================================================================
const CHAT_STORAGE_BUCKET = 'admin-chat';   // <-- change if you want to use another bucket
const CHAT_MAX_FILE_MB = 50;                // keep <= your bucket / plan limit
const CHAT_MAX_FILES = 5;                   // per message

const CHAT_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'];
const CHAT_VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v'];
const CHAT_FILE_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'rar', '7z', 'heic', 'heif'];

function getFileExt(name) {
  const i = (name || '').lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function getAttachmentKind(ext) {
  if (CHAT_IMAGE_EXT.includes(ext)) return 'image';
  if (CHAT_VIDEO_EXT.includes(ext)) return 'video';
  if (CHAT_FILE_EXT.includes(ext)) return 'file';
  return null; // not allowed
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSafeHttpsUrl(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function getAttachmentLabel(attachments) {
  if (!attachments || !attachments.length) return '';
  if (attachments.length > 1) return `📎 ${attachments.length} مرفقات`;
  const a = attachments[0];
  if (a.kind === 'image') return '📷 صورة';
  if (a.kind === 'video') return '🎥 فيديو';
  return `📎 ${a.name || 'ملف'}`;
}

// --- small toast inside the drawer ---
let chatToastTimer = null;
function showChatToast(message) {
  const drawer = document.getElementById('adminChatDrawer');
  if (!drawer) return;

  let toast = document.getElementById('chatToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'chatToast';
    toast.className = 'chat-toast';
    drawer.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(chatToastTimer);
  chatToastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function setChatSending(flag) {
  isChatSending = flag;
  const sendBtn = document.querySelector('#chatInputForm .chat-send-btn');
  const attachBtn = document.getElementById('chatAttachBtn');
  if (sendBtn) sendBtn.disabled = flag;
  if (attachBtn) attachBtn.disabled = flag;
  const tray = document.getElementById('chatAttachmentTray');
  if (tray) tray.classList.toggle('is-sending', flag);
}

function readImageSize(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
}

// --- staging files ---
async function addFilesToChat(fileList) {
  if (editingMessageId) {
    showChatToast('لا يمكن إرفاق ملفات أثناء تعديل رسالة');
    return;
  }
  if (isChatSending) return;

  const files = Array.from(fileList || []);
  const problems = [];

  for (const file of files) {
    if (pendingAttachments.length >= CHAT_MAX_FILES) {
      problems.push(`الحد الأقصى ${CHAT_MAX_FILES} ملفات في الرسالة الواحدة`);
      break;
    }

    const kind = getAttachmentKind(getFileExt(file.name));
    if (!kind) {
      problems.push(`نوع الملف غير مدعوم: ${file.name}`);
      continue;
    }
    if (file.size === 0) {
      problems.push(`الملف فارغ: ${file.name}`);
      continue;
    }
    if (file.size > CHAT_MAX_FILE_MB * 1024 * 1024) {
      problems.push(`الملف "${file.name}" أكبر من ${CHAT_MAX_FILE_MB} ميجابايت`);
      continue;
    }

    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      kind,
      previewUrl: kind === 'image' ? URL.createObjectURL(file) : null,
      width: 0,
      height: 0,
      status: 'ready',
      uploaded: null
    };

    if (kind === 'image') {
      const size = await readImageSize(item.previewUrl);
      item.width = size.w;
      item.height = size.h;
    }

    pendingAttachments.push(item);
  }

  renderAttachmentTray();
  if (problems.length) showChatToast(problems[0]);

  const input = document.getElementById('chatTextInput');
  if (input && pendingAttachments.length) input.focus();
}

function removePendingAttachment(id) {
  const item = pendingAttachments.find(i => i.id === id);
  if (item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  pendingAttachments = pendingAttachments.filter(i => i.id !== id);
  renderAttachmentTray();
}

function clearPendingAttachments() {
  pendingAttachments.forEach(i => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl); });
  pendingAttachments = [];
  renderAttachmentTray();
}

function renderAttachmentTray() {
  const tray = document.getElementById('chatAttachmentTray');
  if (!tray) return;

  tray.innerHTML = '';
  if (!pendingAttachments.length) {
    tray.style.display = 'none';
    return;
  }
  tray.style.display = 'flex';

  pendingAttachments.forEach(item => {
    const chip = document.createElement('div');
    chip.className = `tray-item ${item.status}`;

    const thumb = document.createElement('div');
    thumb.className = `tray-thumb ${item.kind}`;
    if (item.previewUrl) {
      const img = document.createElement('img');
      img.src = item.previewUrl;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.textContent = item.kind === 'video' ? '▶' : getFileExt(item.file.name).toUpperCase().slice(0, 4);
    }

    const meta = document.createElement('div');
    meta.className = 'tray-meta';
    const nameEl = document.createElement('span');
    nameEl.className = 'tray-name';
    nameEl.setAttribute('dir', 'auto');
    nameEl.textContent = item.file.name;
    const sizeEl = document.createElement('span');
    sizeEl.className = 'tray-size';
    sizeEl.textContent = item.status === 'uploading' ? 'جاري الرفع...'
      : item.status === 'error' ? 'فشل الرفع'
      : formatFileSize(item.file.size);
    meta.appendChild(nameEl);
    meta.appendChild(sizeEl);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'tray-remove';
    removeBtn.setAttribute('aria-label', 'إزالة المرفق');
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = () => removePendingAttachment(item.id);

    chip.appendChild(thumb);
    chip.appendChild(meta);
    chip.appendChild(removeBtn);
    tray.appendChild(chip);
  });
}

function handleChatFilePick(e) {
  addFilesToChat(e.target.files);
  e.target.value = ''; // allow picking the same file again
}

function handleChatPaste(e) {
  const files = e.clipboardData && e.clipboardData.files;
  if (!files || !files.length) return; // plain text paste -> default behaviour

  e.preventDefault();
  const named = Array.from(files).map(f => {
    if (f.name && getFileExt(f.name)) return f;
    const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    return new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type });
  });
  addFilesToChat(named);
}

// --- drag & drop onto the drawer ---
function initChatDragAndDrop() {
  const drawer = document.getElementById('adminChatDrawer');
  const overlay = document.getElementById('chatDropOverlay');
  if (!drawer || !overlay) return;

  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

  drawer.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    overlay.classList.add('show');
  });

  drawer.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  drawer.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) overlay.classList.remove('show');
  });

  drawer.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.classList.remove('show');
    addFilesToChat(e.dataTransfer.files);
  });
}

// --- upload to Supabase Storage ---
async function uploadPendingAttachments() {
  const sb = window.supabaseClient;
  if (!sb) throw new Error('Supabase client is not available');

  const uploadOne = async (item) => {
    item.status = 'uploading';
    renderAttachmentTray();

    // Storage keys must be ASCII-safe, so the original (Arabic) name is only kept in Firestore
    const ext = getFileExt(item.file.name);
    const d = new Date();
    const folder = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { error } = await sb.storage.from(CHAT_STORAGE_BUCKET).upload(path, item.file, {
      contentType: item.file.type || 'application/octet-stream',
      cacheControl: '31536000',
      upsert: false
    });
    if (error) {
      item.status = 'error';
      throw error;
    }

    const { data } = sb.storage.from(CHAT_STORAGE_BUCKET).getPublicUrl(path);
    item.status = 'done';
    const att = {
      url: data.publicUrl,
      path,
      name: item.file.name,
      type: item.file.type || '',
      size: item.file.size,
      kind: item.kind
    };
    if (item.kind === 'image' && item.width && item.height) {
      att.width = item.width;
      att.height = item.height;
    }
    item.uploaded = att;
    return att;
  };

  const results = await Promise.allSettled(pendingAttachments.map(uploadOne));
  const failed = results.find(r => r.status === 'rejected');

  if (failed) {
    // Don't leave orphan files behind, and let the user retry
    const orphanPaths = results.filter(r => r.status === 'fulfilled').map(r => r.value.path);
    if (orphanPaths.length) sb.storage.from(CHAT_STORAGE_BUCKET).remove(orphanPaths).catch(() => {});
    pendingAttachments.forEach(i => { if (i.status !== 'error') i.status = 'ready'; i.uploaded = null; });
    renderAttachmentTray();
    throw failed.reason;
  }

  return results.map(r => r.value);
}

// --- rendering attachments inside a bubble (DOM only, no innerHTML -> no XSS) ---
function buildFileCard(att) {
  const card = document.createElement('a');
  card.className = 'chat-file-card';
  card.href = isSafeHttpsUrl(att.url) ? att.url : '#';
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.addEventListener('click', (e) => e.stopPropagation());

  const badge = document.createElement('span');
  badge.className = 'chat-file-badge';
  badge.textContent = (getFileExt(att.name) || 'FILE').toUpperCase().slice(0, 4);

  const info = document.createElement('span');
  info.className = 'chat-file-info';
  const nameEl = document.createElement('span');
  nameEl.className = 'chat-file-name';
  nameEl.setAttribute('dir', 'auto');
  nameEl.textContent = att.name || 'ملف';
  const sizeEl = document.createElement('span');
  sizeEl.className = 'chat-file-size';
  sizeEl.textContent = formatFileSize(att.size);
  info.appendChild(nameEl);
  info.appendChild(sizeEl);

  card.appendChild(badge);
  card.appendChild(info);
  return card;
}

function buildAttachmentsElement(attachments) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-attachments';

  attachments.forEach(att => {
    if (!att || !isSafeHttpsUrl(att.url)) return;

    let node;
    if (att.kind === 'image') {
      const img = document.createElement('img');
      img.className = 'chat-att-img';
      img.alt = att.name || '';
      img.decoding = 'async';
      // Reserve space up-front so the list doesn't jump while images load
      img.style.aspectRatio = (att.width && att.height) ? `${att.width} / ${att.height}` : '4 / 3';
      img.src = att.url;
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        openChatLightbox(att.url, att.name);
      });
      img.addEventListener('error', () => node.replaceWith(buildFileCard(att)));
      node = img;
    } else if (att.kind === 'video') {
      const video = document.createElement('video');
      video.className = 'chat-att-video';
      video.controls = true;
      video.preload = 'metadata';
      video.setAttribute('playsinline', '');
      video.src = `${att.url}#t=0.1`;
      video.addEventListener('click', (e) => e.stopPropagation());
      video.addEventListener('error', () => node.replaceWith(buildFileCard(att)));
      node = video;
    } else {
      node = buildFileCard(att);
    }

    wrap.appendChild(node);
  });

  return wrap;
}

function openChatLightbox(url, name) {
  const old = document.getElementById('chatLightbox');
  if (old) old.remove();

  const box = document.createElement('div');
  box.id = 'chatLightbox';
  box.className = 'chat-lightbox';

  const img = document.createElement('img');
  img.src = url;
  img.alt = name || '';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'chat-lightbox-close';
  closeBtn.setAttribute('aria-label', 'إغلاق');
  closeBtn.innerHTML = '&times;';

  const openLink = document.createElement('a');
  openLink.className = 'chat-lightbox-open';
  openLink.href = url;
  openLink.target = '_blank';
  openLink.rel = 'noopener noreferrer';
  openLink.textContent = 'فتح الأصل';

  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  box.addEventListener('click', (e) => { if (e.target === box || e.target === closeBtn) close(); });
  document.addEventListener('keydown', onKey);

  box.appendChild(img);
  box.appendChild(closeBtn);
  box.appendChild(openLink);
  document.body.appendChild(box);
}

document.addEventListener('DOMContentLoaded', () => {
  initChatDragAndDrop();

  // Close the swipe popup when tapping elsewhere or scrolling the list
  document.addEventListener('touchstart', (e) => {
    if (!closeActiveSwipeMenu) return;
    if (e.target.closest('.swipe-actions-popup') || e.target.closest('.chat-bubble.swipe-open')) return;
    closeOpenSwipeMenu();
  }, { passive: true });

  const chatBody = document.getElementById('chatMessagesBody');
  if (chatBody) chatBody.addEventListener('scroll', closeOpenSwipeMenu, { passive: true });

  setTimeout(() => {
    loadAdminUsersForMentions();
    startBackgroundChatListener();
  }, 800);
});
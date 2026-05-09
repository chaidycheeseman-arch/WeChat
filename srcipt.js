// ============================================================
        // [DB-INIT] Dexie.js 数据库初始化
        // 使用 IndexedDB 替代 localStorage，支持存储大图（Base64）
        // 数据库名：WeChatDB，版本1
        // ============================================================
        const db = new Dexie('WeChatDB');

        // [DB-SCHEMA] 定义数据库表结构
        db.version(1).stores({
            // [TABLE-KV] 通用键值对表：存储设置、配置、简单数据
            // key: 主键（字符串），value: 任意值
            kv: 'key',

            // [TABLE-CONTACTS] 联系人表：每条记录是一个完整联系人对象
            // id: 自动递增主键（联系人唯一ID）
            contacts: '++id',

            // [TABLE-MESSAGES] 消息表：按 contactId 索引
            // id: 自动递增主键，contactId: 所属联系人ID
            messages: '++id, contactId',

            // [TABLE-WORLDBOOK] 世界书条目表
            // id: 自动递增主键
            worldbook: '++id',

            // [TABLE-PRESETS] API 预设表（聊天API快捷预设）
            // id: 自动递增主键
            presets: '++id',

            // [TABLE-CUSTOM-PRESETS] 自设（用户人设）表，类似世界书列表
            // id: 自动递增主键
            customPresets: '++id'
        });

        // ============================================================
        // [DB-HELPER] Dexie 数据库读写封装函数
        // 所有存储操作统一通过这些 async 函数调用
        // ============================================================

        /** [DB-SET] 通用KV写入：await dbSet('key', value) */
        async function dbSet(key, value) {
            await db.kv.put({ key, value });
        }

        /** [DB-GET] 通用KV读取：const val = await dbGet('key', defaultValue) */
        async function dbGet(key, defaultVal = null) {
            const row = await db.kv.get(key);
            return row ? row.value : defaultVal;
        }

        /** [DB-DEL] 通用KV删除：await dbDel('key') */
        async function dbDel(key) {
            await db.kv.delete(key);
        }

        // ============================================================
        // [DB-MIGRATE] 从 localStorage 迁移数据到 IndexedDB
        // 仅在首次加载时执行（通过 migrated 标志判断）
        // ============================================================
        async function migrateFromLocalStorage() {
            const migrated = await dbGet('__migrated__');
            if (migrated) return; // 已迁移过则跳过

            console.log('[DB-MIGRATE] 开始从 localStorage 迁移数据...');

            // [MIGRATE-KV] 迁移简单键值对数据
            const simpleKeys = [
                'wechat_unread', 'wechat_avatar', 'wechat_nickname', 'wechat_wxid',
                'chat_api_url', 'chat_api_key', 'chat_api_model', 'chat_api_model_options',
                'chat_api_history', 'chat_api_temperature',
                'moments_background', 'moments_avatar', 'moments_nickname', 'moments_signature',
                'wechat_recent_chats', 'wechat_pinned_chats', 'wallet_balance'
            ];
            for (const k of simpleKeys) {
                const v = localStorage.getItem(k);
                if (v !== null) {
                    try { await dbSet(k, JSON.parse(v)); }
                    catch { await dbSet(k, v); }
                }
            }

            // [MIGRATE-CONTACTS] 迁移联系人列表
            const rawContacts = localStorage.getItem('wechat_contacts');
            if (rawContacts) {
                const contactArr = JSON.parse(rawContacts);
                for (const c of contactArr) {
                    await db.contacts.put(c); // id 已存在，直接 put
                }
            }

            // [MIGRATE-MESSAGES] 迁移聊天记录（key格式：wechat_chat_history_<contactId>）
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('wechat_chat_history_')) {
                    const contactId = parseInt(k.replace('wechat_chat_history_', ''));
                    const msgs = JSON.parse(localStorage.getItem(k) || '[]');
                    for (const msg of msgs) {
                        await db.messages.add({ ...msg, contactId });
                    }
                }
            }

            // [MIGRATE-WORLDBOOK] 迁移世界书条目
            const rawWb = localStorage.getItem('worldbook_entries');
            if (rawWb) {
                const wbArr = JSON.parse(rawWb);
                for (const e of wbArr) {
                    await db.worldbook.put(e);
                }
            }

            // [MIGRATE-PRESETS] 迁移 API 预设
            const rawPresets = localStorage.getItem('chat_api_presets');
            if (rawPresets) {
                const pArr = JSON.parse(rawPresets);
                for (const p of pArr) {
                    await db.presets.add(p);
                }
            }

            // [MIGRATE-CUSTOM-PRESETS] 迁移自设预设
            const rawCustom = localStorage.getItem('user_custom_presets');
            if (rawCustom) {
                const cArr = JSON.parse(rawCustom);
                for (const c of cArr) {
                    await db.customPresets.add(c);
                }
            }

            await dbSet('__migrated__', true);
            console.log('[DB-MIGRATE] 迁移完成');
        }

        // ============================================================
        // [COMPAT] localStorage 兼容层
        // 保留原有 localStorage 读写接口，内部转发到 Dexie
        // 注意：所有兼容层函数均为异步，调用时需 await
        // ============================================================

        /** [COMPAT-GET-CONTACTS] 获取所有联系人（从 IndexedDB contacts 表） */
        async function getContacts() {
            return await db.contacts.toArray();
        }

        /** [COMPAT-SAVE-CONTACTS] 保存联系人列表（清空重写） */
        async function saveContacts(arr) {
            await db.contacts.clear();
            for (const c of arr) {
                await db.contacts.put(c);
            }
        }

        /** [COMPAT-ADD-CONTACT] 添加单个联系人 */
        async function addContact(contact) {
            return await db.contacts.add(contact);
        }

        /** [COMPAT-PUT-CONTACT] 更新单个联系人 */
        async function putContact(contact) {
            return await db.contacts.put(contact);
        }

        /** [COMPAT-DEL-CONTACT] 删除单个联系人 */
        async function deleteContact(id) {
            await db.contacts.delete(id);
        }

        /** [COMPAT-GET-HISTORY] 获取某联系人的聊天记录 */
        async function getChatHistory(contactId) {
            return await db.messages.where('contactId').equals(contactId).sortBy('id');
        }

        /** [COMPAT-SAVE-HISTORY] 覆盖保存某联系人的聊天记录 */
        async function saveChatHistory(contactId, msgs) {
            await db.messages.where('contactId').equals(contactId).delete();
            for (const msg of msgs) {
                await db.messages.add({ ...msg, contactId });
            }
        }

        /** [COMPAT-ADD-MSG] 追加一条消息 */
        async function addMessage(contactId, msg) {
            await db.messages.add({ ...msg, contactId });
        }

        /** [COMPAT-DEL-HISTORY] 删除某联系人全部消息 */
        async function deleteChatHistory(contactId) {
            await db.messages.where('contactId').equals(contactId).delete();
        }

        /** [COMPAT-GET-WB] 获取世界书所有条目 */
        async function getWorldbookEntries() {
            return await db.worldbook.toArray();
        }

        /** [COMPAT-SAVE-WB] 保存世界书条目列表（清空重写） */
        async function saveWorldbookEntries(arr) {
            await db.worldbook.clear();
            for (const e of arr) {
                await db.worldbook.put(e);
            }
        }

        /** [COMPAT-GET-PRESETS] 获取 API 预设列表 */
        async function getApiPresets() {
            return await db.presets.toArray();
        }

        /** [COMPAT-SAVE-PRESETS] 保存 API 预设列表 */
        async function saveApiPresets(arr) {
            await db.presets.clear();
            for (const p of arr) {
                if (p.id) { await db.presets.put(p); }
                else { await db.presets.add(p); }
            }
        }

        /** [COMPAT-GET-CUSTOM-PRESETS] 获取自设列表 */
        async function getCustomPresets() {
            return await db.customPresets.toArray();
        }

        /** [COMPAT-SAVE-CUSTOM-PRESETS] 保存自设列表（清空重写） */
        async function saveCustomPresets(arr) {
            await db.customPresets.clear();
            for (const c of arr) {
                if (c.id) { await db.customPresets.put(c); }
                else { await db.customPresets.add(c); }
            }
        }

        // ============================================================
        // [RUNTIME] 运行时变量
        // ============================================================

        /** [UNREAD] 未读消息计数对象：{ contactId: count } */
        let unreadMessages = {}; 

        function getUnreadCount(contactId) {
            return unreadMessages[contactId] || 0;
        }

        function getTotalUnreadCount() {
            return Object.values(unreadMessages).reduce((sum, count) => sum + count, 0);
        }

        /** [UNREAD-MARK] 标记某联系人消息已读，持久化到 IndexedDB */
        function markAsRead(contactId) {
            console.log('标记已读:', contactId);
            unreadMessages[contactId] = 0;
            // [DB-WRITE] 持久化未读数到 IndexedDB kv 表
            dbSet('wechat_unread', unreadMessages);
            updateUnreadDisplay();
        }

        /** [UNREAD-INC] 当前未在聊天时，增加某联系人未读数 */
        function incrementUnread(contactId) {
    
    if (!currentChatContact || currentChatContact.id !== contactId) {
        unreadMessages[contactId] = (unreadMessages[contactId] || 0) + 1;
        console.log('增加未读:', contactId, '当前未读数:', unreadMessages[contactId]);
        // [DB-WRITE] 持久化未读数到 IndexedDB kv 表
        dbSet('wechat_unread', unreadMessages);
        updateUnreadDisplay();
    }
}


        function updateUnreadDisplay() {
            const total = getTotalUnreadCount();
            document.querySelector('#page-chats .nav-title').textContent = `微信 (${total})`;
            renderChatList(); 
        }
        function updateClock() {
            const now = new Date();
            let hours = now.getHours().toString().padStart(2, '0');
            let minutes = now.getMinutes().toString().padStart(2, '0');
            document.getElementById('clock').textContent = `${hours}:${minutes}`;
        }
        setInterval(updateClock, 1000);
        updateClock();


        /** [REPLY-NOTIFY] 回复横幅、清脆提示音、后台系统通知 */
        let replyAudioCtx = null;
        function escapeAttrText(text) {
            return String(text || '').replace(/[&<>\"]/g, function(ch) {
                return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]);
            });
        }
        function getActivePageId() {
            const pages = Array.from(document.querySelectorAll('.page.active'));
            return pages.length ? pages[pages.length - 1].id : '';
        }
        function shouldAlertForReply(contactId) {
            const chatPageOpen = getActivePageId() === 'page-chat' && currentChatContact && String(currentChatContact.id) === String(contactId);
            return document.hidden || !chatPageOpen;
        }
        function playReplySound() {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                replyAudioCtx = replyAudioCtx || new AudioContext();
                if (replyAudioCtx.state === 'suspended') replyAudioCtx.resume();
                const now = replyAudioCtx.currentTime;
                const gain = replyAudioCtx.createGain();
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.18, now + 0.012);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
                gain.connect(replyAudioCtx.destination);
                [1046.5, 1318.5, 1760].forEach(function(freq, index) {
                    const osc = replyAudioCtx.createOscillator();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + index * 0.045);
                    osc.connect(gain);
                    osc.start(now + index * 0.045);
                    osc.stop(now + 0.18 + index * 0.045);
                });
            } catch (e) {
                console.warn('消息提示音播放失败：', e);
            }
        }
        function ensureReplyPermission() {
            if (!('Notification' in window)) return;
            if (Notification.permission === 'default') {
                Notification.requestPermission().catch(function(){});
            }
        }
        function showReplyBanner(payload) {
            if (document.hidden) return;
            const stack = document.getElementById('reply-banner-stack');
            if (!stack) return;
            const item = document.createElement('div');
            item.className = 'reply-banner';
            const avatarHtml = payload.avatar ? `<img src="${escapeAttrText(payload.avatar)}" alt="">` : escapeAttrText(String(payload.name || '').slice(0, 1) || '微');
            item.innerHTML = `<div class="reply-banner-avatar">${avatarHtml}</div><div class="reply-banner-main"><div class="reply-banner-head"><div class="reply-banner-name">${escapeAttrText(payload.name)}</div><div class="reply-banner-time">${escapeAttrText(payload.time)}</div></div><div class="reply-banner-text">${escapeAttrText(payload.message)}</div></div>`;
            item.onclick = function() {
                if (typeof openChatByContactId === 'function') openChatByContactId(payload.contactId);
                item.classList.add('hide');
                setTimeout(function(){ item.remove(); }, 180);
            };
            stack.appendChild(item);
            setTimeout(function(){
                item.classList.add('hide');
                setTimeout(function(){ item.remove(); }, 220);
            }, 4200);
        }
        async function showReplySystemNotification(payload) {
            if (!('Notification' in window)) return;
            if (Notification.permission === 'default') {
                try { await Notification.requestPermission(); } catch (e) {}
            }
            if (Notification.permission !== 'granted') return;
            const title = `${payload.name} ${payload.time}`;
            const options = {
                body: payload.message,
                icon: payload.avatar || './icons/icon-192.png',
                badge: './icons/icon-192.png',
                tag: `wechat-reply-${payload.contactId}-${payload.timestamp}`,
                renotify: true,
                data: { contactId: payload.contactId }
            };
            if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    await reg.showNotification(title, options);
                    return;
                } catch (e) {}
            }
            try { new Notification(title, options); } catch (e) {}
        }
        async function notifyReplyMessage(contact, message, timestamp, index) {
            if (!contact || !message) return;
            const payload = {
                contactId: contact.id,
                name: contact.char && contact.char.username ? contact.char.username : '联系人',
                avatar: contact.char && contact.char.avatar ? contact.char.avatar : '',
                message: String(message || ''),
                time: new Date(timestamp || Date.now()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                timestamp: timestamp || Date.now()
            };
            setTimeout(function() {
                if (!shouldAlertForReply(contact.id)) return;
                playReplySound();
                showReplyBanner(payload);
                if (document.hidden) showReplySystemNotification(payload);
            }, Math.max(0, index || 0) * 650);
        }
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) ensureReplyPermission();
        });
        document.addEventListener('pointerdown', function() {
            ensureReplyPermission();
        }, { once: true });

        /** [BACKGROUND-KEEPALIVE] 后台保活：维持 Service Worker 通道与可用通知权限 */
        let backgroundKeepAliveTimer = null;
        function startBackgroundKeepAlive() {
            if (backgroundKeepAliveTimer) return;
            backgroundKeepAliveTimer = setInterval(function() {
                if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({ type: 'KEEP_ALIVE', time: Date.now() });
                }
            }, 25000);
        }
        window.addEventListener('load', startBackgroundKeepAlive);
        document.addEventListener('visibilitychange', function() {
            startBackgroundKeepAlive();
        });
        async function updateBattery() {
            const batteryLevelEl = document.getElementById('battery-level');
            if ('getBattery' in navigator) {
                try {
                    const battery = await navigator.getBattery();
                    const setLevel = () => { batteryLevelEl.style.width = (battery.level * 100) + '%'; };
                    setLevel();
                    battery.addEventListener('levelchange', setLevel);
                } catch (e) { batteryLevelEl.style.width = '80%'; }
            } else { batteryLevelEl.style.width = '80%'; }
        }
        updateBattery();

        function switchTab(pageId, element) {
            document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
            document.querySelectorAll('.dock-item').forEach(item => item.classList.remove('active'));
            document.getElementById('page-' + pageId).classList.add('active');
            element.classList.add('active');
            if(pageId === 'chats') renderChatList(); 
        }

        function openSettings() { document.getElementById('page-settings').classList.add('active'); document.querySelector('.dock').style.display = 'none'; }
        function closeSettings() { document.getElementById('page-settings').classList.remove('active'); document.querySelector('.dock').style.display = 'flex'; }

        // ========== [PAYMENT] 支付 / 零钱页 ==========
        let walletBalance = 10.8;
        let currentPaymentAction = 'recharge';

        function formatWalletAmount(amount) {
            const num = Number(amount || 0);
            return '¥ ' + num.toFixed(2);
        }

        function updateWalletDisplay() {
            const balanceEl = document.getElementById('wallet-balance-text');
            if (balanceEl) balanceEl.textContent = formatWalletAmount(walletBalance);
        }

        async function initPaymentPage() {
            const savedBalance = await dbGet('wallet_balance', 10.8);
            const parsed = Number(savedBalance);
            walletBalance = Number.isFinite(parsed) ? parsed : 10.8;
            updateWalletDisplay();
        }

        async function openPaymentPage() {
            await initPaymentPage();
            document.getElementById('page-payment').classList.add('active');
            document.querySelector('.dock').style.display = 'none';
        }

        function closePaymentPage() {
            document.getElementById('page-payment').classList.remove('active');
            document.querySelector('.dock').style.display = 'flex';
        }

        function showPaymentHint() {
            alert('零钱通入口已预留，后续可继续完善收益与转入转出逻辑。');
        }

        function showPaymentFaq() {
            alert('常见问题：可点击充值增加零钱余额；余额充足时可点击提现减少零钱余额。');
        }

        function openPaymentAmountModal(action) {
            currentPaymentAction = action === 'withdraw' ? 'withdraw' : 'recharge';
            const modal = document.getElementById('payment-amount-modal');
            const title = document.getElementById('payment-modal-title');
            const tip = document.getElementById('payment-modal-tip');
            const input = document.getElementById('payment-amount-input');
            if (title) title.textContent = currentPaymentAction === 'withdraw' ? '提现' : '充值';
            if (tip) tip.textContent = currentPaymentAction === 'withdraw' ? '请输入提现金额' : '请输入充值金额';
            if (input) {
                input.value = '';
                input.placeholder = currentPaymentAction === 'withdraw' ? '请输入提现金额' : '请输入充值金额';
            }
            if (modal) modal.style.display = 'flex';
            setTimeout(function(){ if (input) input.focus(); }, 30);
        }

        function closePaymentAmountModal() {
            const modal = document.getElementById('payment-amount-modal');
            if (modal) modal.style.display = 'none';
        }

        async function confirmPaymentAmountAction() {
            const input = document.getElementById('payment-amount-input');
            const amount = Number(input ? input.value : 0);
            if (!Number.isFinite(amount) || amount <= 0) {
                alert('请输入正确金额');
                return;
            }
            const fixedAmount = Number(amount.toFixed(2));
            if (currentPaymentAction === 'withdraw') {
                if (fixedAmount > walletBalance) {
                    alert('零钱余额不足');
                    return;
                }
                walletBalance = Number((walletBalance - fixedAmount).toFixed(2));
            } else {
                walletBalance = Number((walletBalance + fixedAmount).toFixed(2));
            }
            await dbSet('wallet_balance', walletBalance);
            updateWalletDisplay();
            closePaymentAmountModal();
            alert((currentPaymentAction === 'withdraw' ? '提现' : '充值') + '成功');
        }
        
        function openChatApiPage() { document.getElementById('page-chat-api').classList.add('active'); }
        function closeChatApiPage() { document.getElementById('page-chat-api').classList.remove('active'); }

        /** [MOMENTS-OPEN] 打开朋友圈，从 IndexedDB 读取背景/头像/昵称/签名 */
        async function openMoments() {
    document.getElementById('page-moments').classList.add('active');
    document.querySelector('.dock').style.display = 'none';
    
    // [DB-READ] 从 IndexedDB 读取朋友圈设置
    const savedBackground = await dbGet('moments_background');
    const savedAvatar = await dbGet('moments_avatar');
    const savedNickname = await dbGet('moments_nickname');
    const savedSignature = await dbGet('moments_signature');
    if (savedBackground) {
        document.getElementById('moments-bg').src = savedBackground;
    } else {
        document.getElementById('moments-bg').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%23000000'/%3E%3C/svg%3E";
    }
    if (savedAvatar) {
        const imgEl = document.getElementById('moments-avatar-img');
        const svgEl = document.getElementById('moments-avatar-svg');
        imgEl.src = savedAvatar;
        imgEl.style.display = 'block';
        svgEl.style.display = 'none';
    }
    if (savedNickname) {
        document.getElementById('moments-nickname').textContent = savedNickname;
    }
    if (savedSignature) {
        document.getElementById('moments-signature').textContent = savedSignature;
    }
}
        function closeMoments() { document.getElementById('page-moments').classList.remove('active'); document.querySelector('.dock').style.display = 'flex'; }

        function openWorldBookList() { document.getElementById('page-worldbook-list').classList.add('active'); document.querySelector('.dock').style.display = 'none'; renderWorldBookList(); }
        function closeWorldBookList() { document.getElementById('page-worldbook-list').classList.remove('active'); document.querySelector('.dock').style.display = 'flex'; }

        // [CUSTOM-LIST-OPEN] 打开自设列表页（非直接进编辑）
        function openCustomList() {
            document.getElementById('page-custom-list').classList.add('active');
            document.querySelector('.dock').style.display = 'none';
            renderCustomList(); // [CUSTOM-LIST-RENDER] 渲染列表
        }
        // [CUSTOM-LIST-CLOSE] 关闭自设列表页
        function closeCustomList() {
            document.getElementById('page-custom-list').classList.remove('active');
            document.querySelector('.dock').style.display = 'flex';
        }

        // [CUSTOM-SETTINGS-OPEN] 打开自设编辑页（id=null 为新建，id有值为编辑）
        function openCustomSettings(id) {
            const titleEl = document.getElementById('custom-settings-title');
            const deleteBtn = document.getElementById('custom-delete-btn');
            document.getElementById('custom-edit-id').value = '';
            document.getElementById('custom-nickname').value = '';
            document.getElementById('custom-realname').value = '';
            document.querySelector('input[name="custom-gender"][value="男"]').checked = true;
            document.getElementById('custom-detail').value = '';
            document.getElementById('custom-avatar-preview').style.display = 'none';
            document.getElementById('custom-avatar-placeholder').style.display = 'block';

            if (id !== null && id !== undefined) {
                // [CUSTOM-EDIT-LOAD] 编辑模式：从 IndexedDB 加载已有自设
                titleEl.innerText = '编辑自设';
                deleteBtn.style.display = 'block';
                db.customPresets.get(id).then(preset => {
                    if (!preset) return;
                    document.getElementById('custom-edit-id').value = preset.id;
                    document.getElementById('custom-nickname').value = preset.nickname || '';
                    document.getElementById('custom-realname').value = preset.realname || '';
                    const g = preset.gender || '男';
                    document.querySelector(`input[name="custom-gender"][value="${g}"]`).checked = true;
                    document.getElementById('custom-detail').value = preset.detail || '';
                    if (preset.avatar) {
                        document.getElementById('custom-avatar-preview').src = preset.avatar;
                        document.getElementById('custom-avatar-preview').style.display = 'block';
                        document.getElementById('custom-avatar-placeholder').style.display = 'none';
                    }
                });
            } else {
                // [CUSTOM-NEW] 新建模式
                titleEl.innerText = '新建自设';
                deleteBtn.style.display = 'none';
            }
            document.getElementById('page-custom-settings').classList.add('active');
            document.querySelector('.dock').style.display = 'none';
            renderUserPresets();
        }
        function closeCustomSettings() {
            document.getElementById('page-custom-settings').classList.remove('active');
            // [CUSTOM-CLOSE] 关闭编辑页后返回列表页（若列表页已开启）
            if (document.getElementById('page-custom-list').classList.contains('active')) {
                renderCustomList();
            } else {
                document.querySelector('.dock').style.display = 'flex';
            }
        }

        // [NEW-FRIEND-OPEN] 打开"新的朋友"验证页
        function openNewFriendPage() {
            document.getElementById('page-new-friend').classList.add('active');
            document.querySelector('.dock').style.display = 'none';
        }
        // [NEW-FRIEND-CLOSE] 关闭"新的朋友"验证页
        function closeNewFriendPage() {
            document.getElementById('page-new-friend').classList.remove('active');
            document.querySelector('.dock').style.display = 'flex';
        }

        function openAddContactPage() { document.getElementById('page-add-contact').classList.add('active'); document.querySelector('.dock').style.display = 'none'; }
        function closeAddContactPage() { document.getElementById('page-add-contact').classList.remove('active'); document.querySelector('.dock').style.display = 'flex'; }

        
        let currentChatContact = null;

        
        /** [CHAT-START] 打开聊天页面，从 IndexedDB 读取历史消息 */
        async function startChat(contactIndex) {
            let contacts = await getContacts(); // [DB-READ] 从 IndexedDB 读联系人
            contacts.sort((a, b) => a.char.username.localeCompare(b.char.username, 'zh-Hans-CN', {sensitivity: 'accent'}));
            const contact = contacts[contactIndex];
            if(!contact) return;

            currentChatContact = contact;
            
            // [UNREAD-CLEAR] 进入聊天后清除未读计数
            markAsRead(contact.id);
            
            document.getElementById('chat-title').textContent = contact.char.username;
            
            await renderChatMessages(); // [ASYNC] 异步渲染消息

            document.getElementById('page-contact-profile').classList.remove('active');
            document.getElementById('page-chat').classList.add('active');
            document.querySelector('.dock').style.display = 'none';
            document.getElementById('modal-contact-picker').style.display = 'none'; 
            
            initChatContainerEvents();
            
            const chatContainer = document.getElementById('chat-messages');
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function closeChat() {
            document.getElementById('page-chat').classList.remove('active');
            document.querySelector('.dock').style.display = 'flex';
            closeActionBar(); 
            currentChatContact = null;
            renderChatList(); 
        }

        /** [CHAT-RENDER] 渲染聊天消息列表，从 IndexedDB messages 表读取 */
        async function renderChatMessages() {
            if(!currentChatContact) return;
            const chatContainer = document.getElementById('chat-messages');
            // [DB-READ] 从 IndexedDB 读取该联系人的全部消息
            const history = await getChatHistory(currentChatContact.id);
            
            let html = '';
            history.forEach((msg, index) => {
                
                if (msg.type === 'recalled') {
                    const recallerName = msg.role === 'user' ? '你' : currentChatContact.char.username;
                    html += `
                    <div class="message-recalled">
                        <div class="recalled-box">
                            <span>${recallerName}撤回了一条消息</span>
                            <span class="recalled-view" onclick="viewRecalledMessage(${index})">查看</span>
                        </div>
                    </div>`;
                    return;
                }
                
                const isSelf = msg.role === 'user';
                const avatar = isSelf ? (currentChatContact.user.avatar || '') : (currentChatContact.char.avatar || '');
                const avatarHtml = avatar 
                    ? `<img src="${avatar}">` 
                    : `<svg viewBox="0 0 24 24" style="fill:#fff; padding:8px;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
                
                let bubbleContent = '';
                
                
                if (msg.type === 'quote' && msg.quoteData) {
                    const quoteTime = new Date(msg.quoteData.timestamp).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    const quoteSender = msg.quoteData.role === 'user' ? currentChatContact.user.username : currentChatContact.char.username;
                    bubbleContent += `
                    <div class="quote-box">
                        <div class="quote-header">
                            <div class="quote-sender">${quoteSender}</div>
                            <div class="quote-time">${quoteTime}</div>
                        </div>
                        <div class="quote-content">${msg.quoteData.content}</div>
                    </div>
                    <div class="message-reply-content">${msg.content}</div>`;
                } else {
                    bubbleContent += msg.content;
                }
                
                html += `
                <div class="message-row ${isSelf ? 'self' : 'other'}" data-msg-index="${index}">
                    <div class="message-avatar">${avatarHtml}</div>
                    <div class="message-bubble" ondblclick="showMessageActions(event, ${index}, ${isSelf})">${bubbleContent}</div>
                </div>`;
            });
            chatContainer.innerHTML = html;
        }
        
        
        function initChatContainerEvents() {
            const chatContainer = document.getElementById('chat-messages');
            if (chatContainer && !chatContainer.dataset.eventBound) {
                chatContainer.dataset.eventBound = 'true';
                chatContainer.addEventListener('dblclick', function(e) {
                    
                    if (e.target === chatContainer || 
                        e.target.classList.contains('message-recalled') ||
                        e.target.classList.contains('recalled-box')) {
                        showEmptyAreaActions(e);
                    }
                });
            }
        }


        
        let currentActionBar = null;

        function showMessageActions(event, msgIndex, isSelf) {
            event.stopPropagation();
            
            
            if (currentActionBar) {
                currentActionBar.remove();
                currentActionBar = null;
            }
            
            const bubble = event.currentTarget;
            const messageRow = bubble.closest('.message-row');
            const bubbleRect = bubble.getBoundingClientRect();
            const chatContainer = document.getElementById('chat-messages');
            const containerRect = chatContainer.getBoundingClientRect();
            
            
            const actionBar = document.createElement('div');
            actionBar.className = 'message-action-bar show';
            
            
            const deleteOrRecall = isSelf ? '撤回' : '删除';
            
            actionBar.innerHTML = `
                <div class="message-action-item" onclick="copyMessage(${msgIndex})">复制</div>
                <div class="message-action-item" onclick="editMessage(${msgIndex})">编辑</div>
                <div class="message-action-item" onclick="forwardMessage(${msgIndex})">转发</div>
                <div class="message-action-item" onclick="quoteMessage(${msgIndex})">引用</div>
                <div class="message-action-item" onclick="selectMultiple(${msgIndex})">多选</div>
                <div class="message-action-item" onclick="deleteOrRecallMessage(${msgIndex}, ${isSelf})">${deleteOrRecall}</div>
            `;
            
            chatContainer.appendChild(actionBar);
            currentActionBar = actionBar;
            
                        
            const actionBarRect = actionBar.getBoundingClientRect();
            let top = bubbleRect.top - containerRect.top - actionBarRect.height;
            let left;
            
            
            if (isSelf) {
                
                left = bubbleRect.right - containerRect.left - actionBarRect.width;
            } else {
                
                left = bubbleRect.left - containerRect.left;
            }
            
            
            if (left < 10) left = 10;
            if (left + actionBarRect.width > containerRect.width - 10) {
                left = containerRect.width - actionBarRect.width - 10;
            }
            
            
            if (top < 10) {
                top = bubbleRect.bottom - containerRect.top;
            }
            actionBar.style.top = top + 'px';
            actionBar.style.left = left + 'px';
            
            
            setTimeout(() => {
                document.addEventListener('click', closeActionBar);
                chatContainer.addEventListener('scroll', closeActionBar);
            }, 0);
        }

        
        function showEmptyAreaActions(event) {
            event.stopPropagation();
            
            
            if (currentActionBar) {
                currentActionBar.remove();
                currentActionBar = null;
            }
            
            const chatContainer = document.getElementById('chat-messages');
            const containerRect = chatContainer.getBoundingClientRect();
            
            
            const actionBar = document.createElement('div');
            actionBar.className = 'message-action-bar show';
            
            actionBar.innerHTML = `
                <div class="message-action-item" onclick="selectMultiple(-1)">多选</div>
                <div class="message-action-item" onclick="deleteAllMessages()">删除</div>
            `;
            
            chatContainer.appendChild(actionBar);
            currentActionBar = actionBar;
            
            
            const actionBarRect = actionBar.getBoundingClientRect();
            const left = (containerRect.width - actionBarRect.width) / 2;
            const top = event.clientY - containerRect.top - actionBarRect.height / 2;
            
            actionBar.style.top = Math.max(10, top) + 'px';
            actionBar.style.left = left + 'px';
            
            
            setTimeout(() => {
                document.addEventListener('click', closeActionBar);
                chatContainer.addEventListener('scroll', closeActionBar);
            }, 0);
        }

        function closeActionBar() {
            if (currentActionBar) {
                currentActionBar.remove();
                currentActionBar = null;
            }
            document.removeEventListener('click', closeActionBar);
            const chatContainer = document.getElementById('chat-messages');
            if (chatContainer) {
                chatContainer.removeEventListener('scroll', closeActionBar);
            }
        }


        /** [MSG-COPY] 复制消息内容，从 IndexedDB 读取指定消息 */
        async function copyMessage(msgIndex) {
            if (!currentChatContact) return;
            // [DB-READ] 从 IndexedDB 读取消息列表
            const history = await getChatHistory(currentChatContact.id);
            const msg = history[msgIndex];
            
            if (msg) {
                navigator.clipboard.writeText(msg.content).then(() => {
                    alert('已复制');
                }).catch(() => {
                    const textarea = document.createElement('textarea');
                    textarea.value = msg.content;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    alert('已复制');
                });
            }
            closeActionBar();
        }

        /** [MSG-EDIT] 编辑消息，从 IndexedDB 读取消息内容填入弹窗 */
        async function editMessage(msgIndex) {
            if (!currentChatContact) return;
            // [DB-READ] 从 IndexedDB 读取消息
            const history = await getChatHistory(currentChatContact.id);
            const msg = history[msgIndex];
            
            if (msg) {
                document.getElementById('edit-modal').style.display = 'flex';
                document.getElementById('modal-title').textContent = '编辑消息';
                document.getElementById('modal-avatar-area').style.display = 'none';
                document.getElementById('modal-text-area').style.display = 'block';
                document.getElementById('text-input').value = msg.content;
                window.tempEditMsgIndex = msgIndex;
            }
            closeActionBar();
        }

        
        function forwardMessage(msgIndex) {
            alert('转发功能开发中');
            closeActionBar();
        }

        /** [MSG-QUOTE] 引用消息，从 IndexedDB 读取并暂存引用数据 */
        async function quoteMessage(msgIndex) {
            if (!currentChatContact) return;
            // [DB-READ] 从 IndexedDB 读取消息
            const history = await getChatHistory(currentChatContact.id);
            const msg = history[msgIndex];
            
            if (msg) {
                window.tempQuoteData = {
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp
                };
                const input = document.getElementById('chat-input-box');
                input.placeholder = '引用回复中...';
                input.focus();
            }
            closeActionBar();
        }

        
        function selectMultiple(msgIndex) {
            alert('多选功能开发中');
            closeActionBar();
        }

        /** [MSG-DELETE-RECALL] 删除/撤回消息，操作 IndexedDB messages 表 */
        async function deleteOrRecallMessage(msgIndex, isSelf) {
            if (!currentChatContact) return;
            // [DB-READ] 从 IndexedDB 读取消息列表
            let history = await getChatHistory(currentChatContact.id);
            
            if (isSelf) {
                if (confirm('确定撤回这条消息吗?')) {
                    const originalMsg = history[msgIndex];
                    const recalledMsg = {
                        type: 'recalled',
                        role: originalMsg.role,
                        originalContent: originalMsg.content,
                        timestamp: Date.now()
                    };
                    history[msgIndex] = recalledMsg;
                    // [DB-WRITE] 覆盖保存修改后的消息列表到 IndexedDB
                    await saveChatHistory(currentChatContact.id, history);
                    await renderChatMessages();
                }
            } else {
                if (confirm('确定删除这条消息吗?')) {
                    history.splice(msgIndex, 1);
                    // [DB-WRITE] 覆盖保存修改后的消息列表到 IndexedDB
                    await saveChatHistory(currentChatContact.id, history);
                    await renderChatMessages();
                }
            }
            closeActionBar();
        }

        /** [MSG-VIEW-RECALLED] 查看已撤回消息内容 */
        async function viewRecalledMessage(msgIndex) {
            if (!currentChatContact) return;
            // [DB-READ] 从 IndexedDB 读取消息
            const history = await getChatHistory(currentChatContact.id);
            const msg = history[msgIndex];
            
            if (msg && msg.type === 'recalled') {
                document.getElementById('edit-modal').style.display = 'flex';
                document.getElementById('modal-title').textContent = '撤回的消息';
                document.getElementById('modal-avatar-area').style.display = 'none';
                document.getElementById('modal-text-area').style.display = 'block';
                const textInput = document.getElementById('text-input');
                textInput.value = msg.originalContent;
                textInput.disabled = true;
                window.tempViewRecalledMode = true;
            }
        }

        /** [MSG-DELETE-ALL] 删除当前联系人全部消息 */
        async function deleteAllMessages() {
            if (!currentChatContact) return;
            if (confirm('确定删除所有消息吗?')) {
                // [DB-WRITE] 从 IndexedDB 删除该联系人所有消息
                await deleteChatHistory(currentChatContact.id);
                await renderChatMessages();
            }
            closeActionBar();
        }
let waitingForReply = false; 

function handleSendButton() {
    
    sendUserMessage();
}

function handleDoubleSend(event) {
    
    event.preventDefault();
    receiveCharMessage();
}

/** [MSG-SEND-USER] 用户发送消息，写入 IndexedDB messages 表 */
async function sendUserMessage() {
    const input = document.getElementById('chat-input-box');
    const content = input.value.trim();
    if(!content || !currentChatContact) return;

    // [DB-READ] 读取当前消息历史
    let history = await getChatHistory(currentChatContact.id);
    
    let newMsg;
    if (window.tempQuoteData) {
        // [QUOTE-MSG] 引用回复消息
        newMsg = { 
            type: 'quote',
            role: 'user', 
            content: content, 
            timestamp: Date.now(),
            quoteData: window.tempQuoteData
        };
        window.tempQuoteData = null;
        document.getElementById('chat-input-box').placeholder = '';
    } else {
        newMsg = { role: 'user', content: content, timestamp: Date.now() };
    }
    
    // [DB-WRITE] 追加消息到 IndexedDB messages 表
    await addMessage(currentChatContact.id, newMsg);

    // [DB-WRITE] 更新最近聊天列表
    await updateRecentChats(currentChatContact.id, content, Date.now());

    input.value = '';
    await renderChatMessages();
    
    const chatContainer = document.getElementById('chat-messages');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/** [MSG-RECV-CHAR] AI角色回复：从 IndexedDB 读取历史，调用API，写入回复 */
async function receiveCharMessage() {
    if (!currentChatContact) return;
    
    waitingForReply = true;
    
    const contactId = currentChatContact.id;
    const contactChar = currentChatContact.char;
    const contactUser = currentChatContact.user;

    const sendBtn = document.getElementById('chat-send-btn');
    const chatContainer = document.getElementById('chat-messages');
    
    const loadingBubbleId = 'loading-bubble-' + Date.now();
    const avatar = contactChar.avatar || '';
    const avatarHtml = avatar 
        ? `<img src="${avatar}">` 
        : `<svg viewBox="0 0 24 24" style="fill:#fff; padding:8px;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
    
    const loadingHtml = `
    <div class="message-row other" id="${loadingBubbleId}">
        <div class="message-avatar">${avatarHtml}</div>
        <div class="message-bubble loading">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    </div>`;
    
    chatContainer.insertAdjacentHTML('beforeend', loadingHtml);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    sendBtn.disabled = true;

    try {
        // [DB-READ] 从 IndexedDB 读取API设置
        const apiUrl = await dbGet('chat_api_url');
        const apiKey = await dbGet('chat_api_key');
        const apiModel = await dbGet('chat_api_model');
        const historyCount = parseInt(await dbGet('chat_api_history') || '10');
        const temperature = parseFloat(await dbGet('chat_api_temperature') || '0.7');

        if (!apiUrl || !apiKey || !apiModel) {
            document.getElementById(loadingBubbleId).remove();
            alert('请先在设置中配置聊天API');
            waitingForReply = false;
            sendBtn.disabled = false;
            return;
        }

        // [DB-READ] 从 IndexedDB 读取聊天历史
        let history = await getChatHistory(contactId);
        const recentHistory = history.slice(-historyCount);
        
        // [DB-READ] 从 IndexedDB 读取世界书条目
        const worldbookEntries = await getWorldbookEntries();
        let worldbookContext = '';
        
        const applicableEntries = worldbookEntries.filter(entry => {
            if (entry.type === 'global' && entry.trigger === 'always') {
                return true;
            }
            if (entry.type === 'character') {
                const keywords = entry.keywords ? entry.keywords.split(',').map(k => k.trim()) : [];
                const charName = currentChatContact.char.username;
                if (entry.trigger === 'always' || keywords.some(k => charName.includes(k))) {
                    return true;
                }
            }
            
            if (entry.trigger === 'keyword' && entry.keywords) {
                const keywords = entry.keywords.split(',').map(k => k.trim());
                const recentMessages = recentHistory.slice(-3).map(m => m.content).join(' ');
                if (keywords.some(k => recentMessages.includes(k))) {
                    return true;
                }
            }
            return false;
        });
        
        applicableEntries.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        });
        
        if (applicableEntries.length > 0) {
            worldbookContext = '\n\n【世界观设定与背景知识】\n';
            applicableEntries.forEach(entry => {
                worldbookContext += `\n## ${entry.title}\n${entry.content}\n`;
            });
        }
        
        const systemPrompt = `# 角色扮演指令

你正在扮演 **${contactChar.username}**${contactChar.realname ? `（真名：${contactChar.realname}）` : ''}

## 角色基本信息
- 性别：${contactChar.gender}
- 微信号：${contactChar.id}

## 角色人设与性格
${contactChar.detail || '（无特殊设定）'}

## 对话对象信息
你正在与 **${contactUser.username}**${contactUser.realname ? `（真名：${contactUser.realname}）` : ''} 对话
- 性别：${contactUser.gender}
- 对方人设：${contactUser.detail || '（无特殊设定）'}

## 回复格式要求
你的回复必须严格遵循以下JSON格式，每个气泡都是一个独立的JSON对象，多个气泡用三条竖线（|||）分隔：

单条消息示例：
{"type":"text","content":"你好呀！"}

多条消息示例：
{"type":"text","content":"等等"}|||{"type":"text","content":"我想想"}|||{"type":"text","content":"应该是这样的"}

可用的type类型：
- text: 纯文本消息（最常用）
- image: 图片消息（content为图片URL或描述）
- sticker: 表情包（content为表情描述）

## 核心要求
1. **完全沉浸角色**：你就是${currentChatContact.char.username}，不是AI助手
2. **保持人设一致性**：严格遵循上述人设、性格、背景设定
3. **记忆连贯性**：记住之前的对话内容，保持上下文连贯
4. **自然对话**：像真人一样聊天，可以有情绪、口癖、语气词
5. **世界观融入**：自然融入世界观设定，不要生硬引用
6. **禁止出戏**：绝不说"作为AI"、"我是语言模型"等破坏沉浸感的话

现在，请以${contactChar.username}的身份，自然地回复对方的消息。`;

        const messages = [
            { role: 'system', content: systemPrompt }
        ];
        
        recentHistory.forEach(msg => {
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            });
        });

        let fullUrl = apiUrl.trim();
        if (!fullUrl.endsWith('/v1') && !fullUrl.endsWith('/v1/')) {
            fullUrl = fullUrl.replace(/\/$/, '') + '/v1';
        }
        
        console.log('发送API请求，系统提示词:', systemPrompt);
        
        const response = await fetch(`${fullUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: apiModel,
                messages: messages,
                temperature: temperature,
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API错误响应:', errorText);
            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();
        const aiReply = data.choices[0].message.content;
        console.log('AI回复:', aiReply);

        document.getElementById(loadingBubbleId).remove();

        const bubbles = aiReply.split('|||').map(b => b.trim()).filter(b => b);
        
        // [DB-WRITE] 将AI回复消息批量追加到 IndexedDB messages 表
        const generatedReplyMessages = [];
        if (bubbles.length === 0) {
            const msgTime = Date.now();
            await addMessage(contactId, { role: 'assistant', content: aiReply, timestamp: msgTime });
            generatedReplyMessages.push({ content: aiReply, timestamp: msgTime });
        } else {
            for (const bubbleStr of bubbles) {
                try {
                    const bubble = JSON.parse(bubbleStr);
                    if (bubble.type && bubble.content) {
                        const msgTime = Date.now();
                        await addMessage(contactId, { role: 'assistant', content: bubble.content, timestamp: msgTime });
                        generatedReplyMessages.push({ content: bubble.content, timestamp: msgTime });
                    } else {
                        const msgTime = Date.now();
                        await addMessage(contactId, { role: 'assistant', content: bubbleStr, timestamp: msgTime });
                        generatedReplyMessages.push({ content: bubbleStr, timestamp: msgTime });
                    }
                } catch (e) {
                    console.log('JSON解析失败，当作普通文本:', bubbleStr);
                    const msgTime = Date.now();
                    await addMessage(contactId, { role: 'assistant', content: bubbleStr, timestamp: msgTime });
                    generatedReplyMessages.push({ content: bubbleStr, timestamp: msgTime });
                }
            }
        }

        let previewText = '';
        if (bubbles.length > 0) {
            const firstBubble = bubbles[0];
            try {
                const parsed = JSON.parse(firstBubble);
                previewText = parsed.content || firstBubble;
            } catch {
                previewText = firstBubble;
            }
        } else {
            previewText = aiReply.substring(0, 50);
        }
        
        // [DB-WRITE] 更新最近聊天列表
        await updateRecentChats(contactId, previewText, Date.now());

        if (document.hidden || !currentChatContact || String(currentChatContact.id) !== String(contactId) || getActivePageId() !== 'page-chat') {
            incrementUnread(contactId);
        }
        generatedReplyMessages.forEach(function(item, idx) {
            notifyReplyMessage({ id: contactId, char: contactChar }, item.content, item.timestamp, idx);
        });

        if (currentChatContact && String(currentChatContact.id) === String(contactId)) {
            await renderChatMessages();
        }

        setTimeout(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 100);

    } catch (error) {
        const loadingEl = document.getElementById(loadingBubbleId);
        if (loadingEl) loadingEl.remove();
        
        console.error('完整错误:', error);
        console.error('错误堆栈:', error.stack);
        
        let errorMsg = '获取回复失败: ' + error.message;
        if (error.message.includes('Failed to fetch')) {
            errorMsg += '\n\n可能原因：\n1. API地址错误\n2. 网络连接问题\n3. CORS跨域限制';
        }
        alert(errorMsg);
    } finally {
        waitingForReply = false;
        sendBtn.disabled = false;
    }
}

        /** [RECENT-CHATS-UPDATE] 更新最近聊天列表，写入 IndexedDB */
        async function updateRecentChats(contactId, lastMsg, time) {
            // [DB-READ] 从 IndexedDB 读取最近聊天列表
            let recents = await dbGet('wechat_recent_chats', []);
            recents = recents.filter(item => item.id !== contactId);
            recents.unshift({ id: contactId, lastMsg: lastMsg, time: time });
            // [DB-WRITE] 写回 IndexedDB kv 表
            await dbSet('wechat_recent_chats', recents);
        }
/** [CHAT-LIST-RENDER] 渲染消息列表页，从 IndexedDB 读取最近聊天和联系人 */
async function renderChatList() {
    const container = document.getElementById('chat-list-container');
    // [DB-READ] 从 IndexedDB kv 表读取最近聊天列表和联系人
    const recents = await dbGet('wechat_recent_chats', []);
    const contacts = await getContacts();
    
    Object.keys(unreadMessages).forEach(contactId => {
        const exists = contacts.some(c => c.id == contactId);
        if (!exists) {
            delete unreadMessages[contactId];
        }
    });
    // [DB-WRITE] 同步清理后的未读数据
    await dbSet('wechat_unread', unreadMessages);
    
    const totalUnread = getTotalUnreadCount();
    document.querySelector('#page-chats .nav-title').textContent = `微信 (${totalUnread})`;

    if(recents.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">暂无消息</div>';
        return;
    }

    // [DB-READ] 从 IndexedDB kv 表读取置顶列表
    const pinnedChats = await dbGet('wechat_pinned_chats', []);
    
    const pinnedRecents = recents.filter(r => pinnedChats.includes(r.id));
    const normalRecents = recents.filter(r => !pinnedChats.includes(r.id));
    
    let html = '';
    
    pinnedRecents.forEach(recent => {
        html += renderChatItem(recent, contacts, true);
    });
    
    normalRecents.forEach(recent => {
        html += renderChatItem(recent, contacts, false);
    });
    
    container.innerHTML = html;
    attachSwipeListeners();
}

function renderChatItem(recent, contacts, isPinned) {
    const contact = contacts.find(c => c.id === recent.id);
    if(!contact) return '';
    
    const avatarSrc = contact.char.avatar || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999999'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    const timeStr = new Date(recent.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const contactIndex = contacts.findIndex(c => c.id === recent.id);
    const unreadCount = getUnreadCount(contact.id);
    const unreadBadge = unreadCount > 0 ? `<div style="position:absolute; top:0; right:0; background:#FE3D2F; color:#fff; border-radius:50%; min-width:18px; height:18px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; padding:0 5px;">${unreadCount}</div>` : '';
    const pinnedBg = isPinned ? 'background-color: #f7f7f7;' : '';

    return `
    <div class="chat-list-item-wrapper" data-contact-id="${contact.id}">
        <div class="chat-list-actions">
            <div class="chat-action-btn chat-action-pin" onclick="togglePinChat(${contact.id}, event)">${isPinned ? '取消置顶' : '置顶'}</div>
            <div class="chat-action-btn chat-action-delete" onclick="deleteChat(${contact.id}, event)">删除</div>
        </div>
        <div class="list-item chat-list-item" onclick="startChat(${contactIndex})" style="${pinnedBg}">
            <div class="list-icon-wrap" style="position:relative;">
                <img src="${avatarSrc}">
                ${unreadBadge}
            </div>
            <div class="list-text-wrap" style="flex-direction:column; align-items:flex-start; justify-content:center; height:40px;">
                <div style="display:flex; justify-content:space-between; width:100%; margin-bottom:0;">
                    <span style="font-weight:600; font-size:16px;">${contact.char.username}</span>
                    <span style="font-size:12px; color:#999; margin-right:10px;">${timeStr}</span>
                </div>
                <div style="font-size:14px; color:#999; width:90%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${recent.lastMsg}</div>
            </div>
        </div>
    </div>`;
}


function attachSwipeListeners() {
    const wrappers = document.querySelectorAll('.chat-list-item-wrapper');
    
    wrappers.forEach(wrapper => {
        const item = wrapper.querySelector('.chat-list-item');
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        
        item.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
            item.style.transition = 'none';
        });
        
        item.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            const diff = currentX - startX;
            
            
            if (diff < 0 && diff > -140) {
                item.style.transform = `translateX(${diff}px)`;
            }
        });
        
        item.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            item.style.transition = 'transform 0.3s ease';
            
            const diff = currentX - startX;
            
            
            if (diff < -60) {
                item.style.transform = 'translateX(-140px)';
            } else {
                item.style.transform = 'translateX(0)';
            }
        });
        
        
        item.addEventListener('click', (e) => {
            const allItems = document.querySelectorAll('.chat-list-item');
            allItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.style.transform = 'translateX(0)';
                }
            });
        });
    });
}

/** [CHAT-PIN] 切换聊天置顶状态，更新 IndexedDB */
async function togglePinChat(contactId, event) {
    event.stopPropagation();
    // [DB-READ] 从 IndexedDB 读取置顶列表
    let pinnedChats = await dbGet('wechat_pinned_chats', []);
    
    const index = pinnedChats.indexOf(contactId);
    if (index > -1) {
        pinnedChats.splice(index, 1);
    } else {
        pinnedChats.unshift(contactId);
    }
    
    // [DB-WRITE] 更新置顶列表到 IndexedDB
    await dbSet('wechat_pinned_chats', pinnedChats);
    renderChatList();
}

/** [CHAT-DELETE] 删除聊天会话及其消息，从 IndexedDB 清除 */
async function deleteChat(contactId, event) {
    event.stopPropagation();
    
    if (confirm('确定删除该聊天吗？')) {
        // [DB-WRITE] 从 IndexedDB messages 表删除该联系人全部消息
        await deleteChatHistory(contactId);
        
        // [DB-WRITE] 从最近聊天列表移除
        let recents = await dbGet('wechat_recent_chats', []);
        recents = recents.filter(r => r.id !== contactId);
        await dbSet('wechat_recent_chats', recents);
        
        // [DB-WRITE] 从置顶列表移除
        let pinnedChats = await dbGet('wechat_pinned_chats', []);
        pinnedChats = pinnedChats.filter(id => id !== contactId);
        await dbSet('wechat_pinned_chats', pinnedChats);
        
        markAsRead(contactId);
        renderChatList();
    }
}
        /** [CHAT-PLUS-MENU] 消息页右上角 + 下拉面板：发起聊天 / 发起群聊 / 管理群聊 */
        function toggleChatPlusMenu(event) {
            if (event) event.stopPropagation();
            const menu = document.getElementById('chat-plus-menu');
            if (!menu) return;
            menu.classList.toggle('show');
        }
        function closeChatPlusMenu() {
            const menu = document.getElementById('chat-plus-menu');
            if (menu) menu.classList.remove('show');
        }
        function openDirectChatFromPlus() {
            closeChatPlusMenu();
            openContactPicker('direct');
        }
        function openGroupChatFromPlus() {
            closeChatPlusMenu();
            openContactPicker('group');
        }
        function openGroupManageFromPlus() {
            closeChatPlusMenu();
            const modal = document.getElementById('modal-contact-picker');
            const title = document.getElementById('picker-title');
            const list = document.getElementById('picker-list');
            const actions = document.getElementById('picker-actions');
            if (!modal || !title || !list || !actions) return;
            title.textContent = '管理群聊';
            list.innerHTML = '<div style="text-align:center; padding:28px 18px; color:#999; line-height:1.7;">暂无已创建群聊<br>点击消息页 + → 发起群聊 后选择联系人。</div>';
            actions.innerHTML = '<button class="modal-btn cancel" style="width: 100%;" onclick="document.getElementById(\'modal-contact-picker\').style.display=\'none\'">知道了</button>';
            modal.style.display = 'flex';
        }
        document.addEventListener('click', function(event) {
            const menu = document.getElementById('chat-plus-menu');
            if (!menu || !menu.classList.contains('show')) return;
            if (!menu.contains(event.target) && !event.target.closest('.nav-right-btn')) closeChatPlusMenu();
        });

        /** [CONTACT-PICKER] 打开联系人选择弹窗，从 IndexedDB 读取联系人；群聊模式仅在点击“发起群聊”后出现 */
        async function openContactPicker(mode = 'direct') {
            const modal = document.getElementById('modal-contact-picker');
            const title = document.getElementById('picker-title');
            const list = document.getElementById('picker-list');
            const actions = document.getElementById('picker-actions');
            // [DB-READ] 从 IndexedDB 读取联系人列表
            let contacts = await getContacts();
            contacts.sort((a, b) => a.char.username.localeCompare(b.char.username, 'zh-Hans-CN', {sensitivity: 'accent'}));
            window.chatPickerMode = mode;
            window.chatPickerContacts = contacts;
            title.textContent = mode === 'group' ? '选择群聊联系人' : '选择联系人';
            
            let html = '';
            contacts.forEach((c, index) => {
                const avatarSrc = c.char.avatar || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999999'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
                if (mode === 'group') {
                    html += `
                    <label class="list-item group-picker-row">
                        <div class="list-icon-wrap" style="width:36px; height:36px; margin-right:10px;">
                            <img src="${avatarSrc}">
                        </div>
                        <div class="list-text-wrap" style="border:none;">${c.char.username}</div>
                        <input class="group-picker-check" type="checkbox" value="${index}">
                    </label>`;
                } else {
                    html += `
                    <div class="list-item" onclick="startChat(${index})">
                        <div class="list-icon-wrap" style="width:36px; height:36px; margin-right:10px;">
                            <img src="${avatarSrc}">
                        </div>
                        <div class="list-text-wrap" style="border:none;">${c.char.username}</div>
                    </div>`;
                }
            });
            
            if(contacts.length === 0) {
                html = '<div style="text-align:center; padding:20px; color:#999;">暂无联系人</div>';
            }

            list.innerHTML = html;
            actions.innerHTML = mode === 'group'
                ? '<div style="display:flex; gap:10px;"><button class="modal-btn cancel" onclick="document.getElementById(\'modal-contact-picker\').style.display=\'none\'">取消</button><button class="modal-btn confirm" onclick="confirmGroupChatPicker()">确定</button></div>'
                : '<button class="modal-btn cancel" style="width: 100%;" onclick="document.getElementById(\'modal-contact-picker\').style.display=\'none\'">取消</button>';
            modal.style.display = 'flex';
        }

        async function confirmGroupChatPicker() {
            const checked = Array.from(document.querySelectorAll('#picker-list .group-picker-check:checked')).map(i => Number(i.value));
            if (checked.length < 2) { alert('请至少选择 2 位联系人发起群聊'); return; }
            const contacts = window.chatPickerContacts || await getContacts();
            const names = checked.map(i => contacts[i]?.char?.username).filter(Boolean);
            document.getElementById('modal-contact-picker').style.display = 'none';
            alert('已选择：' + names.join('、') + '\n群聊联系人选择完成。');
        }

        let currentContactIndex = -1;

        /** [CONTACT-PROFILE] 打开联系人详情页，从 IndexedDB 读取联系人 */
        async function openContactProfile(index) {
            currentContactIndex = index;
            // [DB-READ] 从 IndexedDB 读取联系人
            let contacts = await getContacts();
            contacts.sort((a, b) => a.char.username.localeCompare(b.char.username, 'zh-Hans-CN', {sensitivity: 'accent'}));
            const contact = contacts[index];
            if(!contact) return;

            const char = contact.char;
            document.getElementById('profile-nickname').textContent = char.username;
            document.getElementById('profile-id').textContent = '微信号：' + char.id;
            
            const imgEl = document.getElementById('profile-avatar-img');
            const svgEl = document.getElementById('profile-avatar-svg');
            if (char.avatar) {
                imgEl.src = char.avatar;
                imgEl.style.display = 'block';
                svgEl.style.display = 'none';
            } else {
                imgEl.style.display = 'none';
                svgEl.style.display = 'block';
            }

            const genderIcon = document.getElementById('profile-gender-icon');
            genderIcon.innerHTML = '';
            genderIcon.classList.remove('male', 'female');
            if (char.gender === '男') {
                genderIcon.innerHTML = '<path d="M19.31 4.69h-4.14c-.36 0-.69.19-.88.5-.18.31-.18.69 0 1 .19.31.52.5.88.5h2.33l-3.8 3.8c-1.1-1-2.55-1.62-4.14-1.62-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6c0-1.59-.62-3.04-1.62-4.14l3.8-3.8v2.33c0 .36.19.69.5.88.31.18.69.18 1 0 .31-.19.5-.52.5-.88V4.69zM9.56 19.37c-2.48 0-4.5-2.02-4.5-4.5s2.02-4.5 4.5-4.5 4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5z"/>';
                genderIcon.classList.add('male');
            } else if (char.gender === '女') {
                genderIcon.innerHTML = '<path d="M12 4c-3.31 0-6 2.69-6 6 0 2.97 2.16 5.43 5 5.91V18H8.5c-.41 0-.75.34-.75.75s.34.75.75.75H11v2c0 .41.34.75.75.75s.75-.34.75-.75v-2h2.5c.41 0 .75-.34.75-.75s-.34-.75-.75-.75H13v-2.09c2.84-.48 5-2.94 5-5.91 0-3.31-2.69-6-6-6zm0 10.5c-2.48 0-4.5-2.02-4.5-4.5s2.02-4.5 4.5-4.5 4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5z"/>';
                genderIcon.classList.add('female');
            }

            document.getElementById('page-contact-profile').classList.add('active');
            document.querySelector('.dock').style.display = 'none';
        }

        function closeContactProfile() {
            document.getElementById('page-contact-profile').classList.remove('active');
            document.querySelector('.dock').style.display = 'flex';
        }

        
        let tempEditCharAvatar = '';
        let tempEditUserAvatar = '';

        /** [CONTACT-EDIT-OPEN] 打开联系人编辑页，从 IndexedDB 读取数据填充表单 */
        async function openContactEditPage() {
            if(currentContactIndex === -1) return;
            // [DB-READ] 从 IndexedDB 读取联系人
            let contacts = await getContacts();
            contacts.sort((a, b) => a.char.username.localeCompare(b.char.username, 'zh-Hans-CN', {sensitivity: 'accent'}));
            const contact = contacts[currentContactIndex];
            if(!contact) return;

            document.getElementById('edit-char-username').value = contact.char.username;
            document.getElementById('edit-char-realname').value = contact.char.realname;
            document.getElementById('edit-char-id').value = contact.char.id;
            document.getElementById('edit-char-detail').value = contact.char.detail || '';
            tempEditCharAvatar = contact.char.avatar || '';
            
            const charImg = document.getElementById('edit-char-avatar-preview');
            const charSvg = document.getElementById('edit-char-avatar-placeholder');
            if(tempEditCharAvatar) {
                charImg.src = tempEditCharAvatar; charImg.style.display = 'block'; charSvg.style.display = 'none';
            } else {
                charImg.style.display = 'none'; charSvg.style.display = 'block';
            }

            document.getElementById('edit-user-username').value = contact.user.username;
            document.getElementById('edit-user-realname').value = contact.user.realname;
            document.getElementById('edit-user-id').value = contact.user.id;
            document.getElementById('edit-user-detail').value = contact.user.detail || '';
            tempEditUserAvatar = contact.user.avatar || '';

            const userImg = document.getElementById('edit-user-avatar-preview');
            const userSvg = document.getElementById('edit-user-avatar-placeholder');
            if(tempEditUserAvatar) {
                userImg.src = tempEditUserAvatar; userImg.style.display = 'block'; userSvg.style.display = 'none';
            } else {
                userImg.style.display = 'none'; userSvg.style.display = 'block';
            }

            document.getElementById('page-contact-edit').classList.add('active');
        }

        function closeContactEditPage() {
            document.getElementById('page-contact-edit').classList.remove('active');
        }

        function handleEditContactAvatar(event, type) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    if (type === 'char') {
                        tempEditCharAvatar = e.target.result;
                        const img = document.getElementById('edit-char-avatar-preview');
                        const svg = document.getElementById('edit-char-avatar-placeholder');
                        img.src = tempEditCharAvatar; img.style.display = 'block'; svg.style.display = 'none';
                    } else {
                        tempEditUserAvatar = e.target.result;
                        const img = document.getElementById('edit-user-avatar-preview');
                        const svg = document.getElementById('edit-user-avatar-placeholder');
                        img.src = tempEditUserAvatar; img.style.display = 'block'; svg.style.display = 'none';
                    }
                }
                reader.readAsDataURL(file);
            }
        }

        /** [CONTACT-EDIT-SAVE] 保存联系人编辑，更新 IndexedDB contacts 表 */
        async function saveContactEdit() {
            if(currentContactIndex === -1) return;
            // [DB-READ] 从 IndexedDB 读取联系人列表
            let contacts = await getContacts();
            contacts.sort((a, b) => a.char.username.localeCompare(b.char.username, 'zh-Hans-CN', {sensitivity: 'accent'}));
            
            contacts[currentContactIndex].char.username = document.getElementById('edit-char-username').value;
            contacts[currentContactIndex].char.realname = document.getElementById('edit-char-realname').value;
            contacts[currentContactIndex].char.id = document.getElementById('edit-char-id').value;
            contacts[currentContactIndex].char.detail = document.getElementById('edit-char-detail').value;
            contacts[currentContactIndex].char.avatar = tempEditCharAvatar;

            contacts[currentContactIndex].user.username = document.getElementById('edit-user-username').value;
            contacts[currentContactIndex].user.realname = document.getElementById('edit-user-realname').value;
            contacts[currentContactIndex].user.id = document.getElementById('edit-user-id').value;
            contacts[currentContactIndex].user.detail = document.getElementById('edit-user-detail').value;
            contacts[currentContactIndex].user.avatar = tempEditUserAvatar;

            // [DB-WRITE] 将修改后的联系人写回 IndexedDB contacts 表
            await putContact(contacts[currentContactIndex]);
            
            await renderContacts();
            openContactProfile(currentContactIndex);
            closeContactEditPage();
            alert('修改已保存');
        }

        /** [CONTACTS-RENDER] 渲染通讯录联系人列表，从 IndexedDB 读取 */
        async function renderContacts() {
            const container = document.getElementById('contact-list-dynamic');
            // [DB-READ] 从 IndexedDB 读取联系人列表
            let contacts = await getContacts();
            contacts.sort((a, b) => a.char.username.localeCompare(b.char.username, 'zh-Hans-CN', {sensitivity: 'accent'}));
            let html = '';
            contacts.forEach((c, index) => {
                const avatarSrc = c.char.avatar || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999999'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
                html += `
                <div class="list-item" onclick="openContactProfile(${index})">
                    <div class="list-icon-wrap">
                        <img src="${avatarSrc}" style="${!c.char.avatar ? 'display:none' : ''}">
                        <svg viewBox="0 0 24 24" style="${c.char.avatar ? 'display:none' : ''}"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    </div>
                    <div class="list-text-wrap">${c.char.username}</div>
                </div>`;
            });
            container.innerHTML = html;
        }

        let tempAddCharAvatar = '';
        let tempAddUserAvatar = '';
        function handleAddContactAvatar(event, type) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    if (type === 'char') {
                        tempAddCharAvatar = e.target.result;
                        document.getElementById('add-char-avatar-preview').src = tempAddCharAvatar;
                        document.getElementById('add-char-avatar-preview').style.display = 'block';
                        document.getElementById('add-char-avatar-placeholder').style.display = 'none';
                    } else {
                        tempAddUserAvatar = e.target.result;
                        document.getElementById('add-user-avatar-preview').src = tempAddUserAvatar;
                        document.getElementById('add-user-avatar-preview').style.display = 'block';
                        document.getElementById('add-user-avatar-placeholder').style.display = 'none';
                    }
                }
                reader.readAsDataURL(file);
            }
        }
        /** [CONTACT-SAVE] 保存新联系人，写入 IndexedDB contacts 表 */
        async function saveContact() {
            const charUsername = document.getElementById('add-char-username').value.trim();
            if (!charUsername) return alert('请输入对方用户名');
            const newContact = {
                id: Date.now(),
                char: {
                    avatar: tempAddCharAvatar,
                    username: charUsername,
                    realname: document.getElementById('add-char-realname').value.trim(),
                    gender: document.querySelector('input[name="add-char-gender"]:checked').value,
                    id: document.getElementById('add-char-id').value.trim() || 'wxid_' + Math.random().toString(36).substr(2, 9),
                    detail: document.getElementById('add-char-detail').value.trim()
                },
                user: {
                    avatar: tempAddUserAvatar,
                    username: document.getElementById('add-user-username').value.trim(),
                    realname: document.getElementById('add-user-realname').value.trim(),
                    gender: document.querySelector('input[name="add-user-gender"]:checked').value,
                    id: document.getElementById('add-user-id').value.trim(),
                    detail: document.getElementById('add-user-detail').value.trim()
                }
            };
            // [DB-WRITE] 将新联系人写入 IndexedDB contacts 表
            await addContact(newContact);
            alert('添加成功');
            closeAddContactPage();
            await renderContacts();
        }

let currentEditMode = '';
let tempAvatarUrl = '';

/** [MODAL-OPEN] 打开通用编辑弹窗 */
function openModal(mode) {
    currentEditMode = mode;
    document.getElementById('edit-modal').style.display = 'flex';
    const titleEl = document.getElementById('modal-title');
    const avatarArea = document.getElementById('modal-avatar-area');
    const textArea = document.getElementById('modal-text-area');
    const textInput = document.getElementById('text-input');
    const avatarInput = document.getElementById('avatar-url-input');
    if (mode === 'avatar') {
        // [MODAL-EDIT-MSG] 复用 avatar 模式编辑消息（通过 tempEditMsgIndex 区分）
        titleEl.textContent = '更换头像';
        avatarArea.style.display = 'block';
        textArea.style.display = 'none';
        avatarInput.value = '';
        tempAvatarUrl = '';
        document.getElementById('avatar-file-input').value = '';
    } else if (mode === 'nickname') {
        titleEl.textContent = '修改昵称';
        avatarArea.style.display = 'none';
        textArea.style.display = 'block';
        // [DOM-READ] 从DOM元素读取当前昵称（已在loadUserData中从IndexedDB同步过来）
        textInput.value = document.getElementById('me-nickname-text').textContent;
    } else if (mode === 'wxid') {
        titleEl.textContent = '修改微信号';
        avatarArea.style.display = 'none';
        textArea.style.display = 'block';
        textInput.value = document.getElementById('me-wxid-text').textContent.replace('微信号:', '').trim();
    }
}

function closeModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            tempAvatarUrl = e.target.result;
            document.getElementById('avatar-url-input').value = '已选择本地图片';
        }
        reader.readAsDataURL(file);
    }
}

function openMomentsModal(mode) {
    currentEditMode = mode;
    document.getElementById('edit-modal').style.display = 'flex';
    const titleEl = document.getElementById('modal-title');
    const avatarArea = document.getElementById('modal-avatar-area');
    const textArea = document.getElementById('modal-text-area');
    const textInput = document.getElementById('text-input');
    const avatarInput = document.getElementById('avatar-url-input');
    if (mode === 'background') {
        titleEl.textContent = '更换背景图';
        avatarArea.style.display = 'block';
        textArea.style.display = 'none';
        avatarInput.value = '';
        tempAvatarUrl = '';
        document.getElementById('avatar-file-input').value = '';
    } else if (mode === 'moments-avatar') {
        titleEl.textContent = '更换头像';
        avatarArea.style.display = 'block';
        textArea.style.display = 'none';
        avatarInput.value = '';
        tempAvatarUrl = '';
        document.getElementById('avatar-file-input').value = '';
    } else if (mode === 'moments-nickname') {
        titleEl.textContent = '修改昵称';
        avatarArea.style.display = 'none';
        textArea.style.display = 'block';
        textInput.value = document.getElementById('moments-nickname').textContent;
    } else if (mode === 'moments-signature') {
        titleEl.textContent = '修改个性签名';
        avatarArea.style.display = 'none';
        textArea.style.display = 'block';
        textInput.value = document.getElementById('moments-signature').textContent;
    }
}
/** [MODAL-SAVE] 模态框确定：根据 currentEditMode 分发不同保存逻辑 */
async function saveModal() {
    // [VIEW-RECALLED] 查看撤回消息模式：关闭即可，无需保存
    if (window.tempViewRecalledMode) {
        document.getElementById('text-input').disabled = false;
        window.tempViewRecalledMode = false;
        closeModal();
        return;
    }
    
    if (currentEditMode === 'avatar') {
        if (window.tempEditMsgIndex !== undefined) {
            // [EDIT-MSG] 编辑消息内容，更新 IndexedDB 中对应消息
            const val = document.getElementById('text-input').value.trim();
            if (val && currentChatContact) {
                // [DB-READ] 读取消息历史
                let history = await getChatHistory(currentChatContact.id);
                if (history[window.tempEditMsgIndex]) {
                    history[window.tempEditMsgIndex].content = val;
                    // [DB-WRITE] 覆盖保存修改后的消息
                    await saveChatHistory(currentChatContact.id, history);
                    await renderChatMessages();
                }
            }
            window.tempEditMsgIndex = undefined;
        } else {
            // [ME-AVATAR-SAVE] 更改我的头像，保存到 IndexedDB
            const urlInput = document.getElementById('avatar-url-input').value;
            const finalUrl = tempAvatarUrl || (urlInput !== '已选择本地图片' ? urlInput : '');
            if (finalUrl) {
                const imgEl = document.getElementById('me-avatar-img');
                const svgEl = document.getElementById('me-avatar-svg');
                imgEl.src = finalUrl;
                imgEl.style.display = 'block';
                svgEl.style.display = 'none';
                // [DB-WRITE] 写入 IndexedDB kv 表
                await dbSet('wechat_avatar', finalUrl);
            }
        }
    } else if (currentEditMode === 'nickname') {
        // [EDIT-NICKNAME] 修改昵称，保存到 IndexedDB kv 表
        const val = document.getElementById('text-input').value.trim();
        if (val) {
            document.getElementById('me-nickname-text').textContent = val;
            // [DB-WRITE] 写入 IndexedDB
            await dbSet('wechat_nickname', val);
        }
    } else if (currentEditMode === 'wxid') {
        // [EDIT-WXID] 修改微信号，保存到 IndexedDB kv 表
        const val = document.getElementById('text-input').value.trim();
        if (val) {
            document.getElementById('me-wxid-text').textContent = '微信号:' + val;
            // [DB-WRITE] 写入 IndexedDB
            await dbSet('wechat_wxid', val);
        }
    } else if (currentEditMode === 'background') {
        const urlInput = document.getElementById('avatar-url-input').value;
        const finalUrl = tempAvatarUrl || (urlInput !== '已选择本地图片' ? urlInput : '');
        if (finalUrl) {
            document.getElementById('moments-bg').src = finalUrl;
            // [DB-WRITE] 写入 IndexedDB
            await dbSet('moments_background', finalUrl);
        }
    } else if (currentEditMode === 'moments-avatar') {
        const urlInput = document.getElementById('avatar-url-input').value;
        const finalUrl = tempAvatarUrl || (urlInput !== '已选择本地图片' ? urlInput : '');
        if (finalUrl) {
            const imgEl = document.getElementById('moments-avatar-img');
            const svgEl = document.getElementById('moments-avatar-svg');
            imgEl.src = finalUrl;
            imgEl.style.display = 'block';
            svgEl.style.display = 'none';
            // [DB-WRITE] 写入 IndexedDB
            await dbSet('moments_avatar', finalUrl);
        }
    } else if (currentEditMode === 'moments-nickname') {
        const val = document.getElementById('text-input').value.trim();
        if (val) {
            document.getElementById('moments-nickname').textContent = val;
            // [DB-WRITE] 写入 IndexedDB
            await dbSet('moments_nickname', val);
        }
    } else if (currentEditMode === 'moments-signature') {
        const val = document.getElementById('text-input').value.trim();
        if (val) {
            document.getElementById('moments-signature').textContent = val;
            // [DB-WRITE] 写入 IndexedDB
            await dbSet('moments_signature', val);
        }
    }
    closeModal();
}

// [PRESETS-VAR] API 预设内存缓存（从 IndexedDB 加载后暂存在内存）
let chatPresets = [];

/** [PRESETS-RENDER] 渲染 API 预设下拉列表 */
function renderPresets() {
    const sel = document.getElementById('api-preset-select');
    sel.innerHTML = '<option value="">-- 请选择预设 --</option>';
    chatPresets.forEach((p, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.innerText = p.name;
        sel.appendChild(opt);
    });
}

/** [PRESETS-USE] 应用选中的 API 预设到表单 */
function usePreset() {
    const idx = document.getElementById('api-preset-select').value;
    if(idx === '') return alert('请先选择一个预设');
    const p = chatPresets[idx];
    document.getElementById('api-url').value = p.url || '';
    document.getElementById('api-key').value = p.key || '';
    if(p.modelOptions) document.getElementById('api-model').innerHTML = p.modelOptions;
    document.getElementById('api-model').value = p.model || '';
    document.getElementById('api-history-count').value = p.history || 10;
    document.getElementById('api-temperature').value = p.temperature || 0.7;
    document.getElementById('temperature-val').innerText = p.temperature || 0.7;
    alert('已成功应用预设:' + p.name);
}

/** [PRESETS-ADD] 新增 API 预设，保存到 IndexedDB */
async function addPreset() {
    const name = prompt('请输入新预设名称:');
    if(!name) return;
    const p = {
        name: name,
        url: document.getElementById('api-url').value,
        key: document.getElementById('api-key').value,
        model: document.getElementById('api-model').value,
        modelOptions: document.getElementById('api-model').innerHTML,
        history: document.getElementById('api-history-count').value,
        temperature: document.getElementById('api-temperature').value
    };
    chatPresets.push(p);
    // [DB-WRITE] 保存 API 预设列表到 IndexedDB
    await saveApiPresets(chatPresets);
    renderPresets();
    document.getElementById('api-preset-select').value = chatPresets.length - 1;
    alert('新增预设成功!');
}

/** [PRESETS-EDIT] 更新当前选中预设，写回 IndexedDB */
async function editPreset() {
    const idx = document.getElementById('api-preset-select').value;
    if(idx === '') return alert('请先选择要编辑的预设');
    chatPresets[idx].url = document.getElementById('api-url').value;
    chatPresets[idx].key = document.getElementById('api-key').value;
    chatPresets[idx].model = document.getElementById('api-model').value;
    chatPresets[idx].modelOptions = document.getElementById('api-model').innerHTML;
    chatPresets[idx].history = document.getElementById('api-history-count').value;
    chatPresets[idx].temperature = document.getElementById('api-temperature').value;
    // [DB-WRITE] 更新 IndexedDB 中的预设
    await saveApiPresets(chatPresets);
    alert('该预设已更新为当前页面的内容!');
}

/** [PRESETS-DELETE] 删除选中预设，从 IndexedDB 移除 */
async function deletePreset() {
    const idx = document.getElementById('api-preset-select').value;
    if(idx === '') return alert('请先选择要删除的预设');
    if(confirm('确定删除该预设吗?')) {
        chatPresets.splice(idx, 1);
        // [DB-WRITE] 写回 IndexedDB
        await saveApiPresets(chatPresets);
        renderPresets();
    }
}

async function fetchModels() {
    let url = document.getElementById('api-url').value.trim();
    const key = document.getElementById('api-key').value.trim();
    if (!url || !key) {
        alert("请先填写API网址和密钥");
        return;
    }
    if (!url.endsWith('/v1') && !url.endsWith('/v1/')) {
        url = url.replace(/\/$/, '') + '/v1';
    }
    const pullBtn = document.getElementById('btn-fetch-models');
    pullBtn.innerText = "拉取中...";
    try {
        const response = await fetch(`${url}/models`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) throw new Error('请求失败,状态码:' + response.status);
        const data = await response.json();
        const modelSelect = document.getElementById('api-model');
        modelSelect.innerHTML = '';
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.innerText = m.id;
                modelSelect.appendChild(opt);
            });
            alert('拉取成功!请在下拉框中选择。');
        } else {
            alert('未解析到模型列表,请确认该接口兼容OpenAI格式。');
        }
    } catch (error) {
        alert('拉取失败:' + error.message);
    } finally {
        pullBtn.innerText = "拉取";
    }
}

/** [API-SETTINGS-SAVE] 保存聊天API设置到 IndexedDB */
async function saveChatApiSettings() {
    const url = document.getElementById('api-url').value;
    const key = document.getElementById('api-key').value;
    const model = document.getElementById('api-model').value;
    const modelOptions = document.getElementById('api-model').innerHTML;
    const historyCount = document.getElementById('api-history-count').value;
    const temperature = document.getElementById('api-temperature').value;
    // [DB-WRITE] 批量写入 API 设置到 IndexedDB kv 表
    await dbSet('chat_api_url', url);
    await dbSet('chat_api_key', key);
    await dbSet('chat_api_model', model);
    await dbSet('chat_api_model_options', modelOptions);
    await dbSet('chat_api_history', historyCount);
    await dbSet('chat_api_temperature', temperature);
    alert('聊天API设置已成功保存!');
}
        /** [LOAD-USER-DATA] 初始化加载：先迁移数据，再从 IndexedDB 读取所有用户数据 */
        async function loadUserData() {
            // [DB-MIGRATE] 首次运行时从 localStorage 迁移旧数据
            await migrateFromLocalStorage();

            // [DB-READ] 读取未读消息数
            const savedUnread = await dbGet('wechat_unread', {});
            if (savedUnread) {
                unreadMessages = savedUnread;
            }
            updateUnreadDisplay();
            
            // [DB-READ] 读取我的头像、昵称、微信号
            const savedAvatar = await dbGet('wechat_avatar');
            const savedNickname = await dbGet('wechat_nickname');
            const savedWxid = await dbGet('wechat_wxid');
            if (savedAvatar) {
                const imgEl = document.getElementById('me-avatar-img');
                const svgEl = document.getElementById('me-avatar-svg');
                imgEl.src = savedAvatar; imgEl.style.display = 'block'; svgEl.style.display = 'none';
            }
            if (savedNickname) document.getElementById('me-nickname-text').textContent = savedNickname;
            if (savedWxid) document.getElementById('me-wxid-text').textContent = '微信号:' + savedWxid;
            
            // [DB-READ] 读取聊天API设置
            const savedApiUrl = await dbGet('chat_api_url');
            const savedApiKey = await dbGet('chat_api_key');
            const savedApiModel = await dbGet('chat_api_model');
            const savedApiModelOptions = await dbGet('chat_api_model_options');
            const savedApiHistory = await dbGet('chat_api_history');
            const savedApiTemp = await dbGet('chat_api_temperature');
            if (savedApiUrl) document.getElementById('api-url').value = savedApiUrl;
            if (savedApiKey) document.getElementById('api-key').value = savedApiKey;
            if (savedApiModelOptions) document.getElementById('api-model').innerHTML = savedApiModelOptions;
            if (savedApiModel) document.getElementById('api-model').value = savedApiModel;
            if (savedApiHistory) document.getElementById('api-history-count').value = savedApiHistory;
            if (savedApiTemp) {
                document.getElementById('api-temperature').value = savedApiTemp;
                document.getElementById('temperature-val').innerText = savedApiTemp;
            }

            // [DB-READ] 读取 API 预设列表并渲染
            chatPresets = await getApiPresets();
            renderPresets();

            // [DB-READ] 读取朋友圈设置
            const savedBackground = await dbGet('moments_background');
            const savedMomentsAvatar = await dbGet('moments_avatar');
            const savedMomentsNickname = await dbGet('moments_nickname');
            const savedSignature = await dbGet('moments_signature');
            if (savedBackground) {
                document.getElementById('moments-bg').src = savedBackground;
            }
            if (savedMomentsAvatar) {
                const imgEl = document.getElementById('moments-avatar-img');
                const svgEl = document.getElementById('moments-avatar-svg');
                imgEl.src = savedMomentsAvatar;
                imgEl.style.display = 'block';
                svgEl.style.display = 'none';
            }
            if (savedMomentsNickname) {
                document.getElementById('moments-nickname').textContent = savedMomentsNickname;
            }
            if (savedSignature) {
                document.getElementById('moments-signature').textContent = savedSignature;
            }

            await initPaymentPage();

            // [DB-READ] 渲染联系人和消息列表
            await renderContacts();
            await renderChatList();
        }
        
        
        /** [WB-LIST-RENDER] 渲染世界书列表，从 IndexedDB worldbook 表读取 */
        async function renderWorldBookList() {
            const container = document.getElementById('wb-list-container');
            // [DB-READ] 从 IndexedDB 读取世界书条目
            const entries = await getWorldbookEntries();
            
            if (entries.length === 0) {
                container.innerHTML = `<div style="text-align:center; margin-top:50px; color:var(--text-gray); font-size:14px;">暂无世界书条目<br>点击右上角添加</div>`;
                return;
            }

            let html = '';
            entries.forEach(entry => {
                const typeLabel = entry.type === 'global' ? '全局' : '角色';
                const priorityMap = {'high': '高', 'medium': '中', 'low': '低'};
                const priorityLabel = priorityMap[entry.priority];
                const triggerLabel = entry.trigger === 'always' ? '始终生效' : '关键词';
                
                html += `
                <div class="wb-entry-item" onclick="openWorldBookEditor(${entry.id})">
                    <div class="wb-header">
                        <div class="wb-title">${entry.title || '无标题'}</div>
                    </div>
                    <div class="wb-meta-row">
                        <span class="wb-tag">${typeLabel}</span>
                        <span class="wb-tag">${priorityLabel}优先级</span>
                        <span class="wb-tag gray">${triggerLabel}</span>
                    </div>
                    <div class="wb-content-preview">${entry.content || '无内容'}</div>
                </div>
                `;
            });
            container.innerHTML = html;
        }

        /** [WB-EDITOR-OPEN] 打开世界书编辑器，id有值为编辑，null为新建 */
        async function openWorldBookEditor(id) {
            document.getElementById('page-worldbook-edit').classList.add('active');
            
            // 重置表单
            document.getElementById('wb-id').value = '';
            document.getElementById('wb-title-input').value = '';
            document.getElementById('wb-type-select').value = 'global';
            document.getElementById('wb-trigger-select').value = 'always';
            document.getElementById('wb-keywords-input').value = '';
            document.getElementById('wb-priority-select').value = 'medium';
            document.getElementById('wb-content-input').value = '';
            toggleWbKeywords();

            if (id) {
                document.getElementById('wb-edit-title').innerText = '编辑世界书';
                document.getElementById('wb-delete-btn').style.display = 'block';
                // [DB-READ] 从 IndexedDB 读取指定世界书条目
                const entry = await db.worldbook.get(id);
                if (entry) {
                    document.getElementById('wb-id').value = entry.id;
                    document.getElementById('wb-title-input').value = entry.title;
                    document.getElementById('wb-type-select').value = entry.type;
                    document.getElementById('wb-trigger-select').value = entry.trigger;
                    document.getElementById('wb-keywords-input').value = entry.keywords || '';
                    document.getElementById('wb-priority-select').value = entry.priority;
                    document.getElementById('wb-content-input').value = entry.content;
                    toggleWbKeywords();
                }
            } else {
                document.getElementById('wb-edit-title').innerText = '添加世界书';
                document.getElementById('wb-delete-btn').style.display = 'none';
            }
        }

        /** [WB-EDITOR-SAVE] 保存世界书条目到 IndexedDB */
        async function saveWorldBookEntry() {
            const id = document.getElementById('wb-id').value;
            const title = document.getElementById('wb-title-input').value.trim();
            const type = document.getElementById('wb-type-select').value;
            const trigger = document.getElementById('wb-trigger-select').value;
            const keywords = document.getElementById('wb-keywords-input').value.trim();
            const priority = document.getElementById('wb-priority-select').value;
            const content = document.getElementById('wb-content-input').value.trim();

            if (!title) return alert('请输入标题');
            if (trigger === 'keyword' && !keywords) return alert('请填写触发关键词');
            if (!content) return alert('请输入内容');

            if (id) {
                // [DB-WRITE] 更新已有条目
                await db.worldbook.put({
                    id: parseInt(id),
                    title, type, trigger, keywords, priority, content,
                    updatedAt: Date.now()
                });
            } else {
                // [DB-WRITE] 新增条目（id 由 IndexedDB 自动递增）
                await db.worldbook.add({
                    title, type, trigger, keywords, priority, content,
                    createdAt: Date.now()
                });
            }

            closeWorldBookEditor();
            await renderWorldBookList();
        }

        /** [WB-EDITOR-DELETE] 删除世界书条目，从 IndexedDB 移除 */
        async function deleteWorldBookEntry() {
            const id = document.getElementById('wb-id').value;
            if (!id) return;
            
            if (confirm('确定删除该条目吗？')) {
                // [DB-WRITE] 从 IndexedDB 删除指定条目
                await db.worldbook.delete(parseInt(id));
                closeWorldBookEditor();
                await renderWorldBookList();
            }
        }
        
        // ============================================================
        // [WB-UTILS] 世界书辅助函数
        // ============================================================

        /** [WB-EDITOR-CLOSE] 关闭世界书编辑页 */
        function closeWorldBookEditor() {
            document.getElementById('page-worldbook-edit').classList.remove('active');
        }

        /** [WB-KEYWORDS-TOGGLE] 根据触发方式显示/隐藏关键词输入框 */
        function toggleWbKeywords() {
            const trigger = document.getElementById('wb-trigger-select').value;
            const group = document.getElementById('wb-keywords-group');
            group.style.display = (trigger === 'keyword') ? 'block' : 'none';
        }

        // ============================================================
        // [CUSTOM-LIST] 自设列表渲染与管理（仿世界书列表风格）
        // ============================================================

        /** [CUSTOM-LIST-RENDER] 渲染自设列表，从 IndexedDB customPresets 表读取 */
        async function renderCustomList() {
            const container = document.getElementById('custom-list-container');
            // [DB-READ] 从 IndexedDB 读取自设列表
            const presets = await getCustomPresets();

            if (presets.length === 0) {
                container.innerHTML = `<div style="text-align:center; margin-top:60px; color:var(--text-gray); font-size:14px;">暂无自设<br><span style="font-size:12px;">点击右上角新建</span></div>`;
                return;
            }

            let html = '';
            presets.forEach(p => {
                const avatarHtml = p.avatar
                    ? `<img src="${p.avatar}">`
                    : `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
                html += `
                <div class="custom-list-item" onclick="openCustomSettings(${p.id})">
                    <div class="custom-list-avatar">${avatarHtml}</div>
                    <div class="custom-list-info">
                        <div class="custom-list-name">${p.nickname || '未命名自设'}</div>
                        <div class="custom-list-detail">${p.detail ? p.detail.substring(0, 40) + (p.detail.length > 40 ? '…' : '') : '无详细设定'}</div>
                    </div>
                    <svg class="list-arrow" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
                </div>`;
            });
            container.innerHTML = html;
        }

        // ============================================================
        // [CUSTOM-PRESET] 自设（用户人设）增删改查
        // ============================================================

        /** [CUSTOM-AVATAR-SELECT] 选择自设头像（本地图片读取为 Base64） */
        function handleCustomAvatarSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                const preview = document.getElementById('custom-avatar-preview');
                const placeholder = document.getElementById('custom-avatar-placeholder');
                preview.src = e.target.result;
                preview.style.display = 'block';
                placeholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }

        /** [CUSTOM-PRESET-SAVE] 保存自设：新建写入 IndexedDB，编辑则更新 */
        async function saveUserPreset() {
            const id = document.getElementById('custom-edit-id').value;
            const nickname = document.getElementById('custom-nickname').value.trim();
            const realname = document.getElementById('custom-realname').value.trim();
            const gender = document.querySelector('input[name="custom-gender"]:checked').value;
            const detail = document.getElementById('custom-detail').value.trim();
            const avatarPreview = document.getElementById('custom-avatar-preview');
            const avatar = avatarPreview.style.display !== 'none' ? avatarPreview.src : '';

            if (!nickname) return alert('请输入用户名');

            if (id) {
                // [DB-WRITE] 更新已有自设到 IndexedDB customPresets 表
                await db.customPresets.put({ id: parseInt(id), nickname, realname, gender, detail, avatar });
                alert('自设已更新！');
            } else {
                // [DB-WRITE] 新增自设到 IndexedDB customPresets 表
                await db.customPresets.add({ nickname, realname, gender, detail, avatar, createdAt: Date.now() });
                alert('自设已保存！');
            }

            closeCustomSettings();
            await renderCustomList();
            await renderUserPresets(); // 同步更新添加联系人页的预设下拉
        }

        /** [CUSTOM-PRESET-DELETE] 删除当前编辑的自设，从 IndexedDB 移除 */
        async function deleteCustomPreset() {
            const id = document.getElementById('custom-edit-id').value;
            if (!id) return;
            if (confirm('确定删除此自设吗？')) {
                // [DB-WRITE] 从 IndexedDB 删除
                await db.customPresets.delete(parseInt(id));
                closeCustomSettings();
                await renderCustomList();
            }
        }

        /** [USER-PRESETS-RENDER] 渲染"添加联系人"页的自设预设下拉与卡片列表 */
        async function renderUserPresets() {
            // [DB-READ] 从 IndexedDB 读取自设列表
            const presets = await getCustomPresets();
            const sel = document.getElementById('add-user-preset-select');
            if (sel) {
                sel.innerHTML = '<option value="">-- 选择自设预设 --</option>';
                presets.forEach((p, idx) => {
                    const opt = document.createElement('option');
                    opt.value = idx;
                    opt.textContent = p.nickname || '未命名';
                    sel.appendChild(opt);
                });
            }

            // 同时渲染自设编辑页内的预设卡片列表（旧式显示）
            const listEl = document.getElementById('user-preset-list');
            if (!listEl) return;
            if (presets.length === 0) {
                listEl.innerHTML = '<div style="color:var(--text-gray); font-size:13px; text-align:center; padding:10px;">暂无预设</div>';
                return;
            }
            let html = '';
            presets.forEach((p, idx) => {
                const avatarSrc = p.avatar || '';
                html += `
                <div class="preset-card">
                    ${avatarSrc ? `<img class="preset-avatar" src="${avatarSrc}">` : `<div class="preset-avatar" style="background:var(--active-bg); display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:var(--text-gray);"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`}
                    <div class="preset-info">
                        <div class="preset-name">${p.nickname || '未命名'}</div>
                        <div class="preset-detail">${p.detail || '无设定'}</div>
                    </div>
                    <button class="form-btn" onclick="openEditPresetModal(${idx})" style="font-size:12px; padding:6px 10px;">编辑</button>
                </div>`;
            });
            listEl.innerHTML = html;
        }

        /** [PRESET-FILL] 将选中的自设预设填入"添加联系人-我方设定"表单 */
        async function fillUserFromPreset() {
            const idx = document.getElementById('add-user-preset-select').value;
            if (idx === '') return alert('请先选择一个预设');
            // [DB-READ] 从 IndexedDB 读取自设列表
            const presets = await getCustomPresets();
            const p = presets[parseInt(idx)];
            if (!p) return;
            document.getElementById('add-user-username').value = p.nickname || '';
            document.getElementById('add-user-realname').value = p.realname || '';
            const g = p.gender || '男';
            document.querySelector(`input[name="add-user-gender"][value="${g}"]`).checked = true;
            document.getElementById('add-user-detail').value = p.detail || '';
            if (p.avatar) {
                tempAddUserAvatar = p.avatar;
                document.getElementById('add-user-avatar-preview').src = p.avatar;
                document.getElementById('add-user-avatar-preview').style.display = 'block';
                document.getElementById('add-user-avatar-placeholder').style.display = 'none';
            }
        }

        // ============================================================
        // [PRESET-MODAL] 旧式"编辑预设"弹窗（在自设编辑页内的卡片列表中使用）
        // ============================================================

        let tempEditPresetAvatar = '';
        let currentEditPresetIdx = -1;

        /** [PRESET-MODAL-OPEN] 打开预设编辑弹窗，填入现有数据 */
        async function openEditPresetModal(idx) {
            currentEditPresetIdx = idx;
            // [DB-READ] 从 IndexedDB 读取自设列表
            const presets = await getCustomPresets();
            const p = presets[idx];
            if (!p) return;
            document.getElementById('edit-preset-id').value = p.id || '';
            document.getElementById('edit-preset-nickname').value = p.nickname || '';
            document.getElementById('edit-preset-realname').value = p.realname || '';
            const g = p.gender || '男';
            document.querySelector(`input[name="edit-preset-gender"][value="${g}"]`).checked = true;
            document.getElementById('edit-preset-detail').value = p.detail || '';
            tempEditPresetAvatar = p.avatar || '';
            const img = document.getElementById('edit-preset-avatar-preview');
            const svg = document.getElementById('edit-preset-avatar-placeholder');
            if (tempEditPresetAvatar) {
                img.src = tempEditPresetAvatar; img.style.display = 'block'; svg.style.display = 'none';
            } else {
                img.style.display = 'none'; svg.style.display = 'block';
            }
            document.getElementById('custom-preset-modal').style.display = 'flex';
        }

        /** [PRESET-AVATAR-SELECT] 选择预设头像 */
        function handleEditPresetAvatarSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                tempEditPresetAvatar = e.target.result;
                const img = document.getElementById('edit-preset-avatar-preview');
                const svg = document.getElementById('edit-preset-avatar-placeholder');
                img.src = tempEditPresetAvatar; img.style.display = 'block'; svg.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }

        /** [PRESET-MODAL-CLOSE] 关闭预设编辑弹窗 */
        function closeCustomPresetModal() {
            document.getElementById('custom-preset-modal').style.display = 'none';
        }

        /** [PRESET-UPDATE] 更新预设，写回 IndexedDB */
        async function updateUserPreset() {
            const id = document.getElementById('edit-preset-id').value;
            if (!id) return;
            const nickname = document.getElementById('edit-preset-nickname').value.trim();
            const realname = document.getElementById('edit-preset-realname').value.trim();
            const gender = document.querySelector('input[name="edit-preset-gender"]:checked').value;
            const detail = document.getElementById('edit-preset-detail').value.trim();
            // [DB-WRITE] 更新指定预设到 IndexedDB
            await db.customPresets.put({ id: parseInt(id), nickname, realname, gender, detail, avatar: tempEditPresetAvatar });
            closeCustomPresetModal();
            await renderUserPresets();
        }

        /** [PRESET-DELETE-MODAL] 从预设弹窗删除预设 */
        async function deleteUserPreset() {
            const id = document.getElementById('edit-preset-id').value;
            if (!id) return;
            if (confirm('确定删除此预设吗？')) {
                // [DB-WRITE] 从 IndexedDB 删除
                await db.customPresets.delete(parseInt(id));
                closeCustomPresetModal();
                await renderUserPresets();
            }
        }

        // ============================================================
        // [ME-AVATAR] 我的页面头像保存（通过弹窗选择本地图片）
        // ============================================================

        /** [ME-AVATAR-SAVE] 选择我的头像后（在 saveModal 的 'avatar' 模式中处理）
         *  注意：openModal('avatar') 被"我"页面头像点击触发，
         *  saveModal 中 avatar 模式同时兼容：更改头像 & 编辑消息（通过 tempEditMsgIndex 区分）
         *  当 tempEditMsgIndex 为 undefined 时，走头像保存逻辑。
         *  这里覆写 openModal('avatar') 对"我"页面的特殊处理。
         */
        // 修正：openModal avatar 模式区分头像修改与消息编辑
        const _origOpenModal = openModal;
        // 重新定义头像模式专用处理（非消息编辑时使用图片选择保存到 IndexedDB）
        // saveModal 中已通过 tempEditMsgIndex 判断

        // ============================================================
        // [APP-INIT] 应用启动入口
        // ============================================================

// ============================================================
// [FORUM-FULL] 论坛完整逻辑：状态、预设、分组、发帖、API刷新、热搜、私信、我的
// ============================================================
let forumGroups = ['推荐','日常','娱乐','推文','R18'];
let currentForumGroup = '推荐';
let forumCurrentDock = 'home';
let forumComposeImages = [];
let forumModalCallback = null;
let forumMineTab = 'posts';

function forumEscape(s){return String(s ?? '').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function forumNowText(){const d=new Date();return `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function forumContactName(c){return c?.char?.username || c?.char?.name || c?.nickname || c?.name || c?.remark || '未命名';}
function forumContactDetail(c){return c?.char?.detail || c?.setting || c?.detail || c?.signature || '';}
function showMainDock(show){const d=document.querySelector('body > .dock, .dock');if(d)d.style.display=show?'flex':'none';}
function forumAvatarHtml(src,name){if(src)return `<img src="${forumEscape(src)}">`;return forumEscape(String(name||'我').slice(0,1));}
function openForumModal(title,bodyHtml,cb){document.getElementById('forum-modal-title').textContent=title;document.getElementById('forum-modal-body').innerHTML=bodyHtml;forumModalCallback=cb;document.getElementById('forum-modal').style.display='flex';setTimeout(()=>{const i=document.querySelector('#forum-modal input,#forum-modal textarea');if(i)i.focus();},30);}
function closeForumModal(){document.getElementById('forum-modal').style.display='none';forumModalCallback=null;}
function confirmForumModal(){if(typeof forumModalCallback==='function')forumModalCallback();}
function forumPrompt(title,label,value,cb){openForumModal(title,`<div class="forum-label">${forumEscape(label)}</div><input id="forum-modal-input" class="modal-input" value="${forumEscape(value||'')}">`,()=>{const v=document.getElementById('forum-modal-input').value.trim();closeForumModal();cb(v);});}
function forumConfirm(title,text,cb){openForumModal(title,`<div style="font-size:14px;line-height:1.65;text-align:center;color:var(--text-color);">${forumEscape(text)}</div>`,()=>{closeForumModal();cb();});}
async function getForumPosts(){return await dbGet('forum_posts',[]);}
async function setForumPosts(posts){await dbSet('forum_posts',posts);}

async function openForum(){
    document.getElementById('page-forum').classList.add('active');
    showMainDock(false);
    await loadForumState();
    await renderForumManageOptions();
    renderForumGroups();
    await renderForumPosts();
    await renderForumHot();
    await renderForumDM();
    await renderForumMine();
    switchForumDock(forumCurrentDock || 'home');
}
function closeForum(){document.getElementById('page-forum').classList.remove('active');document.getElementById('page-forum-compose').classList.remove('active');const fd=document.getElementById('page-forum-detail');if(fd)fd.classList.remove('active');showMainDock(true);}
function toggleForumManage(){document.getElementById('forum-management-panel').classList.toggle('show');}

async function loadForumState(){
    forumGroups = await dbGet('forum_groups',['推荐','日常','娱乐','推文','R18']);
    if(!Array.isArray(forumGroups)||!forumGroups.length) forumGroups=['推荐','日常','娱乐','推文','R18'];
    currentForumGroup = await dbGet('forum_current_group',forumGroups[0]);
    if(!forumGroups.includes(currentForumGroup)) currentForumGroup=forumGroups[0];
}
async function saveForumConfig(){
    const selectedChars=Array.from(document.querySelectorAll('.forum-char-check:checked')).map(x=>Number(x.value));
    const cfg={
        worldview:document.getElementById('forum-worldview').value,
        worldbookId:document.getElementById('forum-worldbook-select').value,
        userName:document.getElementById('forum-user-name').value,
        userSetting:document.getElementById('forum-user-setting').value,
        selectedChars,
        npc:document.getElementById('forum-npc').value,
        relationship:document.getElementById('forum-relationship').value
    };
    await dbSet('forum_config',cfg);
}
async function renderForumManageOptions(){
    const cfg=await dbGet('forum_config',{});
    const wb=await db.worldbook.toArray();
    document.getElementById('forum-worldbook-select').innerHTML='<option value="">不关联</option>'+wb.map(x=>`<option value="${x.id}">${forumEscape(x.title||'未命名世界书')}</option>`).join('');
    document.getElementById('forum-worldbook-select').value=cfg.worldbookId||'';
    const contacts=await getContacts();
    document.getElementById('forum-char-list').innerHTML=contacts.length?contacts.map(c=>`<label class="forum-char-option"><span>${forumEscape(forumContactName(c))}</span><input class="forum-char-check" type="checkbox" value="${c.id}" ${(cfg.selectedChars||[]).map(Number).includes(Number(c.id))?'checked':''} onchange="saveForumConfig()"></label>`).join(''):'<div class="forum-empty" style="grid-column:1/-1;padding:18px 0;">暂无联系人</div>';
    document.getElementById('forum-worldview').value=cfg.worldview||'';
    document.getElementById('forum-user-name').value=cfg.userName||'';
    document.getElementById('forum-user-setting').value=cfg.userSetting||'';
    document.getElementById('forum-npc').value=cfg.npc||'';
    document.getElementById('forum-relationship').value=cfg.relationship||'';
    const presets=await dbGet('forum_presets',[]);
    document.getElementById('forum-preset-select').innerHTML='<option value="">选择论坛预设</option>'+presets.map((p,i)=>`<option value="${i}">${forumEscape(p.name)}</option>`).join('');
}
async function saveForumPreset(){await saveForumConfig();forumPrompt('保存论坛预设','预设名','',async name=>{if(!name)return;const presets=await dbGet('forum_presets',[]);const cfg=await dbGet('forum_config',{});presets.push({name,config:cfg,groups:[...forumGroups]});await dbSet('forum_presets',presets);await renderForumManageOptions();document.getElementById('forum-preset-select').value=presets.length-1;});}
async function loadForumPreset(){const idx=document.getElementById('forum-preset-select').value;if(idx==='')return;const presets=await dbGet('forum_presets',[]);const p=presets[Number(idx)];if(!p)return;await dbSet('forum_config',p.config||{});if(Array.isArray(p.groups)&&p.groups.length){forumGroups=p.groups;await dbSet('forum_groups',forumGroups);}await renderForumManageOptions();renderForumGroups();await renderForumPosts();}
async function deleteForumPreset(){const idx=document.getElementById('forum-preset-select').value;if(idx==='')return alert('请先选择预设');forumConfirm('删除预设','确定删除当前论坛预设？',async()=>{const presets=await dbGet('forum_presets',[]);presets.splice(Number(idx),1);await dbSet('forum_presets',presets);await renderForumManageOptions();});}

function renderForumGroups(){
    const box=document.getElementById('forum-group-tabs');
    box.innerHTML=forumGroups.map(g=>`<button class="forum-chip ${g===currentForumGroup?'active':''}" onclick="selectForumGroup('${forumEscape(g)}')"><span>${forumEscape(g)}</span><span class="forum-chip-x" onclick="deleteForumGroup(event,'${forumEscape(g)}')">x</span></button>`).join('')+`<button class="forum-chip forum-chip-add" onclick="addForumGroup()">+</button>`;
}
async function selectForumGroup(g){currentForumGroup=g;await dbSet('forum_current_group',g);renderForumGroups();await renderForumPosts();}
function addForumGroup(){forumPrompt('添加分组','分组名','',async name=>{if(!name)return;if(forumGroups.includes(name))return alert('分组已存在');forumGroups.push(name);await dbSet('forum_groups',forumGroups);renderForumGroups();});}
function deleteForumGroup(e,g){e.stopPropagation();forumConfirm('删除分组',`确定删除「${g}」分组？该操作不会删除帖子，只会移除分组入口。`,async()=>{if(forumGroups.length<=1)return alert('至少保留一个分组');forumGroups=forumGroups.filter(x=>x!==g);if(currentForumGroup===g)currentForumGroup=forumGroups[0];await dbSet('forum_groups',forumGroups);await dbSet('forum_current_group',currentForumGroup);renderForumGroups();await renderForumPosts();});}
async function clearForumPosts(){forumConfirm('清空所有帖子','确定清空论坛全部帖子？此操作不可撤销。',async()=>{await setForumPosts([]);await renderForumPosts();await renderForumHot();await renderForumMine();});}

async function renderForumPosts(){
    const posts=await getForumPosts();
    const list=posts.filter(p=>!currentForumGroup||p.group===currentForumGroup);
    document.getElementById('forum-post-list').innerHTML=list.length?list.map(renderForumPost).join(''):'<div class="forum-empty">当前分组还没有帖子。<br>点击右下角 + 发布，或点击刷新调用 API 生成。</div>';
}
function forumIconSvg(type){
    const icons={
        heat:'<svg viewBox="0 0 24 24"><path d="M13 3c1.4 3.1-.4 4.6-1.8 6-1.2 1.2-2.2 2.4-2.2 4.5a3.7 3.7 0 0 0 7.4 0c0-1.4-.5-2.5-1.3-3.5 2.6 1.4 4.4 3.7 4.4 6.4A7.5 7.5 0 0 1 4.5 16.4c0-3.7 2.8-6.1 5-8.1C11.2 6.8 12.4 5.2 13 3z"/></svg>',
        repost:'<svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
        comment:'<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.5A8 8 0 1 1 21 12z"/></svg>',
        like:'<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.2 5.2 0 0 0-7.4 0L12 6l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4L12 20.8l8.8-8.8a5.2 5.2 0 0 0 0-7.4z"/></svg>'
    };
    return icons[type]||'';
}
function forumPostHeat(p){return Number(p.heat ?? ((p.likes||0)+(p.replies||0)*2+(p.reposts||0)*3));}
function renderForumPost(p){
    const images=(p.images||[]).slice(0,9).map(x=>`<div class="forum-post-image">${x.type==='image'?`<img src="${x.content}">`:forumEscape(x.content)}</div>`).join('');
    return `<article class="forum-post" onclick="openForumDetail(${Number(p.id)||0})"><div class="forum-avatar">${forumAvatarHtml(p.avatar,p.author)}</div><div class="forum-post-body"><div class="forum-post-head"><div class="forum-author">${forumEscape(p.author||'匿名')}</div><div class="forum-post-sub">${forumEscape(p.idText||'@forum')} · ${forumEscape(p.time||'刚刚')}</div></div><div class="forum-post-title">${forumEscape(p.title||'无标题')}</div><div class="forum-post-text">${forumEscape(p.body||'')}</div>${images?`<div class="forum-post-images">${images}</div>`:''}<div class="forum-post-actions"><button class="forum-action-btn" onclick="event.stopPropagation();bumpForumMetric(${Number(p.id)||0},'heat')">${forumIconSvg('heat')}<span>热度 ${forumPostHeat(p)}</span></button><button class="forum-action-btn" onclick="event.stopPropagation();bumpForumMetric(${Number(p.id)||0},'reposts')">${forumIconSvg('repost')}<span>转发 ${p.reposts||0}</span></button><button class="forum-action-btn" onclick="event.stopPropagation();openForumDetail(${Number(p.id)||0})">${forumIconSvg('comment')}<span>评论 ${p.replies||0}</span></button><button class="forum-action-btn" onclick="event.stopPropagation();bumpForumMetric(${Number(p.id)||0},'likes')">${forumIconSvg('like')}<span>喜欢 ${p.likes||0}</span></button></div></div></article>`;
}
async function bumpForumMetric(postId,key){
    const posts=await getForumPosts();
    const p=posts.find(x=>Number(x.id)===Number(postId));
    if(!p)return;
    if(key==='heat')p.heat=forumPostHeat(p)+1;else p[key]=Number(p[key]||0)+1;
    await setForumPosts(posts);
    await renderForumPosts();
    await renderForumHot();
    await renderForumMine();
    if(currentForumDetailPostId&&Number(currentForumDetailPostId)===Number(postId))await renderForumDetailPost(postId);
}

function switchForumDock(name){
    forumCurrentDock=name;
    document.querySelectorAll('.forum-view').forEach(v=>v.classList.remove('active'));
    document.getElementById('forum-view-'+name).classList.add('active');
    document.querySelectorAll('.forum-dock-item').forEach((b,i)=>b.classList.toggle('active',['home','hot','dm','mine'][i]===name));
    document.getElementById('forum-group-tabs').style.display=name==='home'?'flex':'none';
    document.getElementById('forum-management-panel').classList.remove('show');
    const titles={home:'首页',hot:'热搜',dm:'私信',mine:'我的'};
    document.getElementById('forum-nav-title').textContent=titles[name];
    const actions=document.getElementById('forum-nav-actions');
    if(name==='home') actions.innerHTML=`<button class="forum-icon-btn" onclick="refreshForumPosts()"><svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h8V3z"/></svg></button><button class="forum-icon-btn" onclick="toggleForumManage()"><svg viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98L14.5 2.42A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42L9.12 5.07c-.61.24-1.18.56-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.13.22.39.31.61.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65c.61-.25 1.18-.58 1.69-.98l2.49 1c.22.09.48 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/></svg></button>`;
    if(name==='hot') actions.innerHTML=`<button class="forum-icon-btn" onclick="refreshForumPosts()"><svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h8V3z"/></svg></button>`;
    if(name==='dm') actions.innerHTML=`<button class="forum-icon-btn" onclick="refreshForumDM()"><svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h8V3z"/></svg></button>`;
    if(name==='mine') actions.innerHTML=`<button class="forum-mini-btn" onclick="editForumMine()">编辑</button>`;
}

async function renderForumHot(){const q=(document.getElementById('forum-hot-search')?.value||'').trim();const posts=await getForumPosts();const sorted=[...posts].sort((a,b)=>forumPostHeat(b)-forumPostHeat(a)).filter(p=>!q||String(p.title+p.body+p.author).includes(q)).slice(0,30);document.getElementById('forum-hot-list').innerHTML=sorted.length?sorted.map((p,i)=>`<div class="forum-hot-item" onclick="openForumDetail(${Number(p.id)||0})"><div class="forum-rank">${i+1}</div><div class="forum-hot-title">${forumEscape(p.title||'无标题')}</div><div class="forum-hot-count">${forumPostHeat(p)} 热度</div></div>`).join(''):'<div class="forum-empty">暂无热搜，刷新或发帖后会自动生成。</div>';}
async function renderForumDM(){const contacts=await getContacts();let dms=await dbGet('forum_dms',[]);if(!dms.length&&contacts.length){dms=contacts.slice(0,8).map((c,i)=>({name:forumContactName(c),snippet:'论坛私信会在这里显示。',time:i?'昨天':'刚刚'}));await dbSet('forum_dms',dms);}document.getElementById('forum-dm-list').innerHTML=dms.length?dms.map(d=>`<div class="forum-dm-item"><div class="forum-avatar">${forumAvatarHtml(d.avatar,d.name)}</div><div class="forum-dm-content"><div class="forum-dm-name">${forumEscape(d.name)}</div><div class="forum-dm-snippet">${forumEscape(d.snippet)}</div></div><div class="forum-dm-time">${forumEscape(d.time)}</div></div>`).join(''):'<div class="forum-empty">暂无私信。</div>';}
async function refreshForumDM(){const contacts=await getContacts();const dms=contacts.slice(0,12).map((c,i)=>({name:forumContactName(c),avatar:c.avatar||c.char?.avatar||'',snippet:['刚刚看到了你的帖子。','这个设定很有意思。','要不要开一个新话题？','论坛那边有人在讨论你。'][i%4],time:forumNowText()}));await dbSet('forum_dms',dms);await renderForumDM();}
async function getForumMine(){const defName=await dbGet('wechat_nickname','微信用户');const defAvatar=await dbGet('wechat_avatar','');return Object.assign({name:defName,avatar:defAvatar,cover:'',join:'加入于 2026-05-09',fans:0,following:0,likes:0},await dbGet('forum_mine',{}));}
function setForumMineTab(t){forumMineTab=t;renderForumMine();}
async function renderForumMine(){const m=await getForumMine();const posts=await getForumPosts();const minePosts=posts.filter(p=>p.mine);const tabPosts=forumMineTab==='posts'?minePosts:forumMineTab==='reply'?posts.filter(p=>!p.mine).slice(0,10):posts.filter(p=>(p.reposts||0)>0).slice(0,10);document.getElementById('forum-mine-content').innerHTML=`<div class="forum-mine-cover" onclick="editForumMine()">${m.cover?`<img src="${forumEscape(m.cover)}">`:''}</div><div class="forum-mine-card" onclick="editForumMine()"><div class="forum-mine-top"><div class="forum-mine-avatar">${forumAvatarHtml(m.avatar,m.name)}</div><div><div class="forum-mine-name">${forumEscape(m.name)}</div><div class="forum-mine-join">${forumEscape(m.join)}</div></div></div><div class="forum-mine-stats"><span><b>${forumEscape(m.fans)}</b>粉丝</span><span><b>${forumEscape(m.following)}</b>关注</span><span><b>${forumEscape(m.likes)}</b>获赞</span></div></div><div class="forum-mine-tabs"><button class="${forumMineTab==='posts'?'active':''}" onclick="event.stopPropagation();setForumMineTab('posts')">帖子</button><button class="${forumMineTab==='reply'?'active':''}" onclick="event.stopPropagation();setForumMineTab('reply')">回复</button><button class="${forumMineTab==='repost'?'active':''}" onclick="event.stopPropagation();setForumMineTab('repost')">转发</button></div><div class="forum-post-list">${tabPosts.length?tabPosts.map(renderForumPost).join(''):'<div class="forum-empty">这里还没有内容。</div>'}</div>`;}
async function editForumMine(){const m=await getForumMine();openForumModal('编辑我的主页',`<div class="forum-modal-field"><div class="forum-label">头像（图片链接或 Base64）</div><input id="fm-avatar" class="modal-input" value="${forumEscape(m.avatar||'')}"></div><div class="forum-modal-field"><div class="forum-label">背景图（图片链接或 Base64）</div><input id="fm-cover" class="modal-input" value="${forumEscape(m.cover||'')}"></div><div class="forum-modal-field"><div class="forum-label">昵称</div><input id="fm-name" class="modal-input" value="${forumEscape(m.name)}"></div><div class="forum-modal-field"><div class="forum-label">日历线条 + 加入时间</div><input id="fm-join" class="modal-input" value="${forumEscape(m.join)}"></div><div class="forum-modal-field"><div class="forum-label">粉丝</div><input id="fm-fans" class="modal-input" value="${forumEscape(m.fans)}"></div><div class="forum-modal-field"><div class="forum-label">关注</div><input id="fm-following" class="modal-input" value="${forumEscape(m.following)}"></div><div class="forum-modal-field"><div class="forum-label">获赞数</div><input id="fm-likes" class="modal-input" value="${forumEscape(m.likes)}"></div>`,async()=>{const next={avatar:document.getElementById('fm-avatar').value,cover:document.getElementById('fm-cover').value,name:document.getElementById('fm-name').value||'微信用户',join:document.getElementById('fm-join').value||'加入于 2026-05-09',fans:document.getElementById('fm-fans').value||0,following:document.getElementById('fm-following').value||0,likes:document.getElementById('fm-likes').value||0};await dbSet('forum_mine',next);closeForumModal();await renderForumMine();});}

let currentForumDetailPostId = null;
function showForumLoading(show){const el=document.getElementById('forum-loading');if(el)el.classList.toggle('show',!!show);}
function forumCommentKey(postId){return 'forum_comments_'+postId;}
async function openForumDetail(postId){
    currentForumDetailPostId=Number(postId);
    document.getElementById('page-forum-detail').classList.add('active');
    showMainDock(false);
    await renderForumDetailPost(postId);
    document.getElementById('forum-comment-list').innerHTML='';
    await refreshForumComments(postId);
}
function closeForumDetail(){document.getElementById('page-forum-detail').classList.remove('active');currentForumDetailPostId=null;}
async function renderForumDetailPost(postId){
    const posts=await getForumPosts();
    const p=posts.find(x=>Number(x.id)===Number(postId));
    document.getElementById('forum-detail-post').innerHTML=p?renderForumPost(Object.assign({},p,{detail:true})):'<div class="forum-empty">帖子不存在。</div>';
}
function renderForumComments(comments){
    const box=document.getElementById('forum-comment-list');
    if(!Array.isArray(comments)||!comments.length){box.innerHTML='<div class="forum-empty">暂无评论。</div>';return;}
    box.innerHTML=comments.map(c=>`<div class="forum-comment-item"><div class="forum-avatar">${forumAvatarHtml(c.avatar,c.name)}</div><div class="forum-comment-body"><div class="forum-comment-head"><div class="forum-comment-name">${forumEscape(c.name||'路人')}</div><div class="forum-comment-date">${forumEscape(c.date||forumNowText())}</div></div><div class="forum-comment-text">${forumEscape(c.comment||'')}</div><div class="forum-comment-actions"><span>${forumIconSvg('comment')} 评论 ${Number(c.replyCount||0)}</span><span>${forumIconSvg('like')} 喜欢 ${Number(c.likeCount||0)}</span></div></div></div>`).join('');
}
async function refreshForumComments(postId){
    if(!postId)return;
    showForumLoading(true);
    try{
        const posts=await getForumPosts();
        const p=posts.find(x=>Number(x.id)===Number(postId));
        if(!p)throw new Error('帖子不存在');
        const cfg=await dbGet('forum_config',{});
        const promptText=`请根据帖子内容生成 8 到 12 条论坛详情页评论。只输出 JSON 数组。每项必须包含 name,date,comment,replyCount,likeCount。评论者是NPC路人，不要使用主帖作者。\n论坛世界观：${cfg.worldview||''}\n帖子作者：${p.author||''}\n帖子标题：${p.title||''}\n帖子正文：${p.body||''}`;
        const raw=await callForumApi(promptText);
        const match=raw.match(/\[[\s\S]*\]/);
        const arr=JSON.parse(match?match[0]:raw);
        if(!Array.isArray(arr))throw new Error('API 未返回数组');
        const comments=arr.slice(0,16).map((x,i)=>({
            name:x.name||x.author||('路人'+(i+1)),
            avatar:x.avatar||'',
            date:x.date||forumNowText(),
            comment:x.comment||x.body||'',
            replyCount:Number(x.replyCount||x.replies||Math.floor(Math.random()*5)),
            likeCount:Number(x.likeCount||x.likes||Math.floor(Math.random()*60))
        }));
        await dbSet(forumCommentKey(postId),comments);
        p.replies=comments.length;
        await setForumPosts(posts);
        renderForumComments(comments);
        await renderForumDetailPost(postId);
        await renderForumPosts();
        await renderForumHot();
        await renderForumMine();
    }catch(e){
        const old=await dbGet(forumCommentKey(postId),[]);
        renderForumComments(old);
        if(!old.length)document.getElementById('forum-comment-list').innerHTML='<div class="forum-empty">评论刷新失败，请检查聊天API配置后重试。<br>'+forumEscape(e.message)+'</div>';
    }finally{
        showForumLoading(false);
    }
}

async function openForumCompose(){forumComposeImages=[];const m=await getForumMine();document.getElementById('forum-compose-avatar').innerHTML=forumAvatarHtml(m.avatar,m.name);document.getElementById('forum-compose-id').textContent=`${m.name} · @me`;document.getElementById('forum-compose-time').textContent=forumNowText();document.getElementById('forum-compose-title').value='';document.getElementById('forum-compose-content').value='';renderForumComposeImages();document.getElementById('page-forum-compose').classList.add('active');showMainDock(false);}
function closeForumCompose(){document.getElementById('page-forum-compose').classList.remove('active');}
function renderForumComposeImages(){const box=document.getElementById('forum-compose-images');box.innerHTML=forumComposeImages.map((x,i)=>`<div class="forum-compose-thumb">${x.type==='desc'?`<div class="forum-image-note">${forumEscape(x.content)}</div>`:`<img src="${x.content}">`}<button class="forum-compose-remove" onclick="removeForumComposeImage(${i})">x</button></div>`).join('');}
function removeForumComposeImage(i){forumComposeImages.splice(i,1);renderForumComposeImages();}
function addForumImageDescription(){if(forumComposeImages.length>=9)return alert('一条帖子最多添加9张图片');forumPrompt('添加文字描述图片','图片描述','',desc=>{if(!desc)return;forumComposeImages.push({type:'desc',content:desc});renderForumComposeImages();});}
function handleForumImageFiles(e){const remain=9-forumComposeImages.length;const files=Array.from(e.target.files||[]).slice(0,remain);if(!files.length)return;if((e.target.files||[]).length>remain)alert('一条帖子最多添加9张图片，已自动截取前面的图片');let left=files.length;files.forEach(file=>{const r=new FileReader();r.onload=ev=>{forumComposeImages.push({type:'image',content:ev.target.result});left--;if(left===0)renderForumComposeImages();};r.readAsDataURL(file);});e.target.value='';}
async function publishForumPost(){const title=document.getElementById('forum-compose-title').value.trim();const body=document.getElementById('forum-compose-content').value.trim();if(!title&&!body)return alert('请输入帖子标题或正文');const m=await getForumMine();const posts=await getForumPosts();posts.unshift({id:Date.now(),author:m.name,idText:'@me',time:forumNowText(),group:currentForumGroup,title:title||'无标题',body,images:[...forumComposeImages],likes:0,replies:0,reposts:0,mine:true,avatar:m.avatar});await setForumPosts(posts);closeForumCompose();await renderForumPosts();await renderForumHot();await renderForumMine();}

async function callForumApi(promptText){let url=(await dbGet('chat_api_url','')).trim();const key=(await dbGet('chat_api_key','')).trim();const model=(await dbGet('chat_api_model','')).trim();const temperature=Number(await dbGet('chat_api_temperature',0.7));if(!url||!key||!model)throw new Error('请先在 设置 > 聊天API 中填写 API 网址、密钥和模型');if(!url.endsWith('/v1')&&!url.endsWith('/v1/'))url=url.replace(/\/$/,'')+'/v1';const res=await fetch(`${url}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,temperature,stream:false,messages:[{role:'system',content:'你是论坛内容生成器，只输出 JSON 数组。不要输出 Markdown。'},{role:'user',content:promptText}]})});if(!res.ok)throw new Error('API 请求失败：'+res.status);const data=await res.json();return data.choices?.[0]?.message?.content||'';}
async function refreshForumPosts(){
    showForumLoading(true);
    await saveForumConfig();
    const cfg=await dbGet('forum_config',{});
    const contacts=await getContacts();
    const selected=contacts.filter(c=>(cfg.selectedChars||[]).map(Number).includes(Number(c.id))).map(c=>forumContactName(c)+'：'+forumContactDetail(c)).join('\n');
    const wb=cfg.worldbookId?(await db.worldbook.get(Number(cfg.worldbookId))):null;
    const promptText=`请根据以下资料生成 6 条论坛帖子，分组只能从 ${forumGroups.join('、')} 中选择。\n世界观：${cfg.worldview||''}\n世界书：${wb?(wb.title+'\n'+(wb.content||'')):''}\nuser：${cfg.userName||''}\nuser设定：${cfg.userSetting||''}\n参与char：${selected}\n论坛NPC：${cfg.npc||''}\n关系网：${cfg.relationship||''}`;
    try{
        const raw=await callForumApi(promptText);
        const match=raw.match(/\[[\s\S]*\]/);
        const arr=JSON.parse(match?match[0]:raw);
        if(!Array.isArray(arr))throw new Error('API 未返回数组');
        const posts=await getForumPosts();
        const mapped=arr.slice(0,12).map((x,i)=>({id:Date.now()+i,author:x.author||'论坛NPC',idText:'@npc_'+(Date.now()+i),time:forumNowText(),group:forumGroups.includes(x.group)?x.group:currentForumGroup,title:x.title||'新帖',body:x.body||'',likes:Number(x.likes||Math.floor(Math.random()*100)),replies:Number(x.replies||Math.floor(Math.random()*20)),reposts:Number(x.reposts||Math.floor(Math.random()*8)),heat:Number(x.heat||0)}));
        await setForumPosts([...mapped,...posts]);
        await renderForumPosts();
        await renderForumHot();
        await renderForumMine();
    }catch(e){
        alert('刷新失败：'+e.message);
    }finally{
        showForumLoading(false);
    }
}


// ========== [UPDATE-LOG] 每个版本显示一次更新内容 ==========
const APP_VERSION = '0.0.01';
const APP_UPDATE_LOG = [
    '新增版本更新弹窗，首次进入当前版本会展示版本号与更新内容。',
    '同一版本点击知道了后不再重复弹出，后续只需修改版本号即可重新展示。',
    '设置页底部新增灰色小字版本号，便于核对当前包体版本。',
    '补强 PWA 配置，统一使用 sw.js 注册，优化 Edge 添加桌面识别。'
];
function initUpdateLog(){
    const versionText=document.getElementById('settings-version-text');
    if(versionText)versionText.textContent='版本 '+APP_VERSION;
    const modal=document.getElementById('update-modal');
    const badge=document.getElementById('update-version-badge');
    const content=document.getElementById('update-content');
    if(!modal||!badge||!content)return;
    badge.textContent='v'+APP_VERSION;
    content.textContent=APP_UPDATE_LOG.map((item,index)=>(index+1)+'. '+item).join('\n');
    const acknowledged=localStorage.getItem('update_ack_version');
    if(acknowledged!==APP_VERSION){
        modal.classList.add('show');
        modal.setAttribute('aria-hidden','false');
    }
}
function confirmUpdateLog(){
    localStorage.setItem('update_ack_version',APP_VERSION);
    const modal=document.getElementById('update-modal');
    if(modal){
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden','true');
    }
}


        loadUserData();
        initUpdateLog();


// ========== [PWA] 注册 Service Worker ==========
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function(event) {
    deferredInstallPrompt = event;
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function(reg) {
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            if (reg.installing) {
                reg.installing.addEventListener('statechange', function() {
                    if (reg.installing && reg.installing.state === 'installed') navigator.serviceWorker.ready.catch(function(){});
                });
            }
        }).catch(function (err) {
            console.warn('Service Worker 注册失败：', err);
        });
    });
    navigator.serviceWorker.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'OPEN_CHAT' && event.data.contactId) {
            openChatByContactId(event.data.contactId);
        }
    });
}
window.addEventListener('load', function() {
    const params = new URLSearchParams(location.search);
    const contactId = params.get('chat');
    if (contactId) {
        setTimeout(function(){ openChatByContactId(contactId); }, 300);
    }
});

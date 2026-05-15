// ==========================================
// TIỆN ÍCH GIAO DIỆN (UI UTILS)
// ==========================================
function toggleLoading(show) { 
    const lo = document.getElementById('loadingOverlay'); 
    if(lo) lo.classList.toggle('hidden', !show); 
}

function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast'), content = document.getElementById('toastContent');
    if(!toast || !content) return;
    content.className = `bg-white border-l-4 p-4 shadow-lg rounded-xl flex items-center ${type === 'success' ? 'border-emerald-500 text-emerald-700' : (type === 'error' ? 'border-red-500 text-red-700' : 'border-blue-500 text-blue-700')}`;
    content.innerHTML = `<div class="flex-shrink-0">${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</div><div class="ml-3 font-bold text-sm">${msg}</div>`;
    toast.style.transform = 'translateY(0)'; setTimeout(() => toast.style.transform = 'translateY(-150%)', 3000);
}

function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btnEl.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>';
    } else {
        input.type = 'password';
        btnEl.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>';
    }
}

function closeModals() { 
    if(isForcedPassChange) return; 
    ['authModal', 'changePassModal', 'profileModal', 'adminBookingModal', 'adminUserModal', 'resetModal', 'successModal', 'errorModal', 'guestListModal', 'scheduleInteractionModal'].forEach(id => {
        const el = document.getElementById(id);
        if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    });
    ['loginForm', 'forgotForm', 'changePassForm', 'profileForm', 'adminBookingForm', 'adminUserForm'].forEach(id => { const el = document.getElementById(id); if(el) el.reset(); });
    const btnClose = document.getElementById('closeChangePassBtn'); if(btnClose) btnClose.classList.remove('hidden');
    const desc = document.getElementById('forceChangePassDesc'); if(desc) desc.classList.add('hidden');
    const aStart = document.getElementById('aStartSelect'), aEnd = document.getElementById('aEndSelect'), aTimeCtr = document.getElementById('aTimeContainer');
    if(aStart) aStart.innerHTML = ''; if(aEnd) aEnd.innerHTML = ''; if(aTimeCtr) aTimeCtr.classList.add('hidden');
    editingMeetingRowIndex = null;
    const glInput = document.getElementById('glSearchInput'); if (glInput) glInput.value = ''; 
    const glSugg = document.getElementById('glSuggestions'); if (glSugg) glSugg.classList.add('hidden');
    modalSelectedGuests = []; adminSelectedGuests = []; 
    if (typeof renderAdminGuestTags === 'function') renderAdminGuestTags();
    const aGS = document.getElementById('aGuestSearchInput'); if (aGS) aGS.value = '';
    const aGSugg = document.getElementById('aGuestSuggestions'); if (aGSugg) aGSugg.classList.add('hidden');
}

// ==========================================
// TIỆN ÍCH DỮ LIỆU & FORMAT
// ==========================================
function getLocalDateString(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function cleanTime(timeStr) {
    if (!timeStr) return "00:00";
    const match = String(timeStr).match(/(\d{2}):(\d{2})/);
    if (match) { let hh = parseInt(match[1]), mm = parseInt(match[2]); mm = Math.floor(mm / 15) * 15; return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`; }
    return "00:00";
}

function formatMeetingDisplay(dateStr, startStr, endStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr), weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return `${weekdays[d.getDay()]} ${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} | ${cleanTime(startStr)} - ${cleanTime(endStr)}`;
}

function getSafeFormData(form) {
    const data = {};
    const fd = new FormData(form);
    fd.forEach((val, key) => { data[key] = val; });
    return data;
}

// ==========================================
// LOGIC GUEST SEARCH (DÙNG CHUNG)
// ==========================================
function initGuestSearch(inputId, suggestId, addCallback) {
    const input = document.getElementById(inputId), suggestions = document.getElementById(suggestId);
    if(!input || !suggestions) return;

    input.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (!val) { suggestions.classList.add('hidden'); return; }

        let selectedArr = inputId === 'aGuestSearchInput' ? adminSelectedGuests : (inputId === 'glSearchInput' ? modalSelectedGuests : currentSelectedGuests);

        const matches = allUsersBasicList.filter(u =>
            (u.name.toLowerCase().includes(val) || (u.dept && u.dept.toLowerCase().includes(val))) &&
            u.email !== currentUser.email && !selectedArr.includes(u.email)
        ).slice(0, 5); 

        if (matches.length > 0) {
            suggestions.innerHTML = matches.map(u => `
                <div onclick="${addCallback.name}('${u.email}', '${u.name.replace(/'/g, "\\'")}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors flex items-center justify-between">
                    <div><div class="text-sm font-bold text-slate-700">${u.name}</div><div class="text-[10px] font-semibold text-slate-400 mt-0.5">${u.dept || 'Nhân viên'}</div></div>
                    <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                </div>
            `).join('');
            suggestions.classList.remove('hidden');
        } else {
            suggestions.innerHTML = '<div class="p-3 text-sm text-slate-500 text-center italic">Không tìm thấy nhân sự.</div>';
            suggestions.classList.remove('hidden');
        }
    });

    document.addEventListener('click', (e) => { if(!input.contains(e.target) && !suggestions.contains(e.target)) suggestions.classList.add('hidden'); });
}

function addGuestByGroup(groupCode, context) {
    if (!allUsersBasicList || allUsersBasicList.length === 0) return;
    const targetUsers = allUsersBasicList.filter(u => u.group === groupCode && u.email !== currentUser.email);
    if (targetUsers.length === 0) { showToast(`Chưa có nhân sự nào được phân vào nhóm ${groupCode}`, "info"); return; }

    let addedCount = 0, targetArray = [], renderFunc = null;

    if (context === 'user') { targetArray = currentSelectedGuests; renderFunc = () => { if(typeof renderGuestTags === 'function') renderGuestTags('guestTagsContainer', 'fGuests'); }; } 
    else if (context === 'admin') { targetArray = adminSelectedGuests; renderFunc = () => { if(typeof renderAdminGuestTags === 'function') renderAdminGuestTags(); }; } 
    else if (context === 'modal') { targetArray = modalSelectedGuests; renderFunc = () => { if(typeof renderGuestTagsInModal === 'function') renderGuestTagsInModal(); }; }

    targetUsers.forEach(u => { if (!targetArray.includes(u.email)) { targetArray.push(u.email); addedCount++; } });

    if (addedCount > 0) { renderFunc(); showToast(`Đã tự động chọn ${addedCount} người thuộc nhóm ${groupCode}`, "success"); } 
    else { showToast(`Toàn bộ nhóm ${groupCode} đã có mặt trong danh sách`, "info"); }
}

function removeGuest(email, fromModal = false) {
    if (fromModal) { 
        modalSelectedGuests = modalSelectedGuests.filter(e => e !== email); 
        if(typeof renderGuestTagsInModal === 'function') renderGuestTagsInModal(); 
    } else { 
        currentSelectedGuests = currentSelectedGuests.filter(e => e !== email); 
        if(typeof renderGuestTags === 'function') renderGuestTags('guestTagsContainer', 'fGuests'); 
    }
}

function removeAdminGuest(email) { 
    adminSelectedGuests = adminSelectedGuests.filter(e => e !== email); 
    if(typeof renderAdminGuestTags === 'function') renderAdminGuestTags(); 
}

function addQuickNote(targetId, text) {
    const el = document.getElementById(targetId);
    if(!el) return;
    let currentVal = el.value.trim();
    if (currentVal === "") el.value = text;
    else if (!currentVal.includes(text)) el.value = currentVal + ", " + text;
}

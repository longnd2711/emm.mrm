// ============================================================================
// MANAGEMENT.JS - GIAO DIỆN CHO EDITOR VÀ ADMIN QUẢN TRỊ
// ============================================================================

// ----------------------------------------------------------------------------
// BỘ ĐỊNH TUYẾN TRANG (ROUTER) DÀNH CHO QUẢN TRỊ
// ----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('admin.html')) {
        await initAdminPage();
    } else if (path.includes('editor.html')) {
        await initEditorPage();
    }
});

// ============================================================================
// PHẦN A: LOGIC TRANG EDITOR (QUẢN LÝ LỊCH HỌP CHUNG)
// ============================================================================
async function initEditorPage() {
    const savedUser = localStorage.getItem('emm_user');
    if(savedUser) { 
        currentUser = JSON.parse(savedUser); 
        if (currentUser.role !== 'Admin' && currentUser.role !== 'Editor') {
            window.location.href = 'index.html'; return;
        }
    } else {
        window.location.href = 'index.html'; return;
    }

    populateEditorRooms();
    initGuestSearch('aGuestSearchInput', 'aGuestSuggestions', addGuestToAdminForm);
    
    switchEditorTab('bookings');
    await loadData(); 
    checkDeepLinkEditor();
}

async function switchEditorTab(tab) {
    const tbBookings = document.getElementById('adminTabBookings'), tbHistory = document.getElementById('adminTabHistory');
    if(tbBookings) tbBookings.classList.toggle('hidden', tab !== 'bookings');
    if(tbHistory) tbHistory.classList.toggle('hidden', tab !== 'history');

    const bBtn = document.getElementById('tabBtnBookings'), hBtn = document.getElementById('tabBtnHistory');
    const bBtnM = document.getElementById('tabBtnBookingsMob'), hBtnM = document.getElementById('tabBtnHistoryMob');
    
    const aClass = "px-4 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-white transition-colors", iClass = "px-4 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors";
    const aClassM = "flex-1 min-w-[80px] py-2 text-xs font-bold bg-slate-700 rounded-lg text-white transition-colors", iClassM = "flex-1 min-w-[80px] py-2 text-xs font-bold text-slate-400 hover:bg-slate-700 hover:text-white rounded-lg transition-colors";

    if(bBtn) bBtn.className = tab === 'bookings' ? aClass : iClass; if(hBtn) hBtn.className = tab === 'history' ? aClass : iClass;
    if(bBtnM) bBtnM.className = tab === 'bookings' ? aClassM : iClassM; if(hBtnM) hBtnM.className = tab === 'history' ? aClassM : iClassM;
    
    if(tab === 'history' && historyBookings.length === 0) loadHistoryData();
}

async function loadHistoryData() {
    const container = document.getElementById('adminHistoryList');
    if (container) container.innerHTML = '<div class="flex justify-center items-center py-8"><div class="loader ease-linear rounded-full border-4 border-t-4 border-slate-200 h-8 w-8"></div></div>';
    await apiCall('moveCompletedBookingsToDone');
    const res = await apiCall('getHistoryBookings');
    if(Array.isArray(res)) { historyBookings = res; renderAdminHistory(); filterAdminBookings(); }
}

function buildAdminCardHTML(b, isPast = false, isHistory = false) {
    const rawGuests = String(b['Khách mời'] || "").replace(/^'/, ''), guestEmails = rawGuests ? rawGuests.split(',').map(e => e.trim()).filter(e => e) : [];
    let guestNamesStr = '<span class="text-slate-400 italic font-normal">Không có</span>';
    
    if (guestEmails.length > 0) {
        const guestNames = guestEmails.map(email => { const user = allUsersBasicList.find(u => u.email.toLowerCase() === email.toLowerCase()); return user ? user.name : email.split('@')[0]; });
        guestNamesStr = guestNames.join(', ');
    }

    return `<div class="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 ${isHistory ? 'opacity-90' : ''}">
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1 pr-2">
                    <span class="${isHistory ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'} px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">${b['Phòng họp']}</span>
                    <h3 class="font-semibold text-sm sm:text-base mt-1.5 leading-snug" style="color: #073763;">${String(b['Tên cuộc họp']).replace(/^'/, '')}</h3>
                </div>
                <div class="flex gap-2 shrink-0 items-center">
                    ${(isPast || isHistory) ? `<span class="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded-lg font-semibold border border-slate-200 mr-1">Đã xong</span>` : ''}
                    ${!isHistory ? `
                    <button onclick="openAdminBookingModal(${b.rowIndex})" class="px-3 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-bold active:scale-95 transition-colors flex items-center gap-1" title="Chỉnh sửa cuộc họp">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Sửa
                    </button>
                    ` : ''}
                </div>
            </div>
            <div class="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2">
                <div class="flex items-center gap-2 font-normal text-slate-700"><svg class="w-3.5 h-3.5 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> ${formatMeetingDisplay(b['Ngày họp'], b['Bắt đầu'], b['Kết thúc'])}</div>
                <div class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg> <span class="font-medium leading-relaxed">Tạo bởi: ${String(b['Người đăng ký']).replace(/^'/, '')} <span class="text-slate-400">(${String(b['Mã NV']).replace(/^'/, '')})</span></span></div>
                <div class="flex items-start gap-2"><svg class="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg> <span class="font-medium leading-relaxed">Khách mời: ${guestNamesStr}</span></div>
                ${b['Yêu cầu khác'] ? `<div class="mt-1.5 p-2.5 bg-amber-50 rounded-lg text-amber-800 italic text-[11px] font-medium leading-relaxed flex items-start gap-1.5"><svg class="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg> Yêu cầu: ${String(b['Yêu cầu khác']).replace(/^'/, '')}</div>` : ''}
            </div>
        </div>`;
}

function renderAdminBookings() {
    const containerActive = document.getElementById('adminBookingsActive'); if(!containerActive) return;
    if (allBookings.length === 0) { containerActive.innerHTML = '<p class="text-slate-400 text-sm italic">Trống</p>'; return; }
    
    const now = new Date(), todayStr = getLocalDateString(now), currentTimeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    const active = allBookings.filter(b => b["Ngày họp"] > todayStr || (b["Ngày họp"] === todayStr && cleanTime(b["Kết thúc"]) >= currentTimeStr));
    containerActive.innerHTML = active.length > 0 ? active.map(b => buildAdminCardHTML(b, false)).join('') : '<p class="text-slate-400 text-sm italic">Trống</p>';
}

function renderAdminHistory() {
    const container = document.getElementById('adminHistoryList'); if(!container) return;
    if (historyBookings.length === 0) { container.innerHTML = '<div class="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-300"><p class="text-slate-500 text-sm">Không có dữ liệu lịch sử trong 2 tháng qua.</p></div>'; return; }
    container.innerHTML = historyBookings.map(b => buildAdminCardHTML(b, true, true)).join('');
}

function filterAdminBookings() {
    const keywordActive = (document.getElementById('searchActiveBookings')?.value || '').toLowerCase();
    const keywordHistory = (document.getElementById('searchHistoryBookings')?.value || '').toLowerCase();

    const activeContainer = document.getElementById('adminBookingsActive');
    if (activeContainer) {
        for (let card of activeContainer.children) {
            if (card.tagName !== 'DIV') continue; 
            card.style.display = card.innerText.toLowerCase().includes(keywordActive) ? '' : 'none';
        }
    }

    const historyContainer = document.getElementById('adminHistoryList');
    if (historyContainer) {
        for (let card of historyContainer.children) {
            if (card.tagName !== 'DIV' || card.classList.contains('text-center')) continue; 
            card.style.display = card.innerText.toLowerCase().includes(keywordHistory) ? '' : 'none';
        }
    }
}

function populateEditorRooms() {
    const aRoomSel = document.getElementById('aRoomSelect');
    if (!aRoomSel) return;
    let optionsHTML = '<option value="">-- Chọn --</option>';
    APP_ROOMS.forEach(room => { optionsHTML += `<option value="${room}">${room}</option>`; });
    aRoomSel.innerHTML = optionsHTML;
}

function openAdminBookingModal(idx = null) {
    const form = document.getElementById('adminBookingForm'); if(form) form.reset();
    adminSelectedGuests = []; renderAdminGuestTags(); 
    const gls = document.getElementById('aGuestSearchInput'); if (gls) gls.value = '';
    
    const modalTitle = document.getElementById('adminBookingModalTitle'), reasonCtr = document.getElementById('aReasonContainer'), reasonInput = document.getElementById('aReason');
    const startSel = document.getElementById('aStartSelect'), endSel = document.getElementById('aEndSelect'), aTimeCtr = document.getElementById('aTimeContainer'), aDeleteBtn = document.getElementById('aDeleteBtn');

    if(startSel) startSel.innerHTML = ''; if(endSel) endSel.innerHTML = ''; if(aTimeCtr) aTimeCtr.classList.add('hidden');

    if (idx) {
        const b = allBookings.find(item => item.rowIndex === idx) || historyBookings.find(item => item.rowIndex === idx);
        if (!b) return;
        if(modalTitle) modalTitle.innerText = "Sửa Lịch Họp";
        if(reasonCtr) reasonCtr.classList.remove('hidden');
        if(reasonInput) reasonInput.required = true;
        if(aDeleteBtn) aDeleteBtn.classList.remove('hidden');

        document.getElementById('aEditRowIndex').value = idx;
        document.getElementById('aEmpId').value = String(b['Mã NV']).replace(/^'/, '');
        const u = allUsersBasicList.find(user => String(user.msnv).replace(/^'/, '') === String(b['Mã NV']).replace(/^'/, ''));
        document.getElementById('aCreatorEmail').value = u ? u.email : "";

        document.getElementById('aUser').value = String(b['Người đăng ký']).replace(/^'/, '');
        document.getElementById('aTitle').value = String(b['Tên cuộc họp']).replace(/^'/, '');
        
        const aDateSel = document.getElementById('aDateSelect'); if(aDateSel) aDateSel.value = b['Ngày họp'];
        document.getElementById('aRoomSelect').value = b['Phòng họp'];
        
        updateAdminStartTimes(); document.getElementById('aStartSelect').value = cleanTime(b['Bắt đầu']);
        updateAdminEndTimes(); document.getElementById('aEndSelect').value = cleanTime(b['Kết thúc']);
        document.getElementById('aNote').value = String(b['Yêu cầu khác'] || "").replace(/^'/, '');
        
        const rawGuests = String(b['Khách mời'] || "").replace(/^'/, '');
        adminSelectedGuests = rawGuests ? rawGuests.split(',').map(e => e.trim()).filter(e => e) : [];
        renderAdminGuestTags();
    } else {
        if(modalTitle) modalTitle.innerText = "Thêm Lịch Họp (Quản lý)";
        if(reasonCtr) reasonCtr.classList.add('hidden');
        if(reasonInput) reasonInput.required = false;
        if(aDeleteBtn) aDeleteBtn.classList.add('hidden');

        document.getElementById('aEditRowIndex').value = "";
        if(currentUser) {
            document.getElementById('aEmpId').value = currentUser.msnv;
            document.getElementById('aCreatorEmail').value = currentUser.email;
            document.getElementById('aUser').value = `${currentUser.name} - ${currentUser.dept}`;
        }
        const aDateSel = document.getElementById('aDateSelect');
        if(aDateSel) aDateSel.value = getLocalDateString(new Date());
    }
    const admModal = document.getElementById('adminBookingModal');
    if(admModal) { admModal.classList.remove('hidden'); admModal.classList.add('flex'); }
}

function updateAdminStartTimes() {
    const aDateEl = document.getElementById('aDateSelect'), aRoomEl = document.getElementById('aRoomSelect'), aTimeContainer = document.getElementById('aTimeContainer'), aStartEl = document.getElementById('aStartSelect'), aEndEl = document.getElementById('aEndSelect');
    if(!aDateEl || !aRoomEl || !aTimeContainer || !aStartEl || !aEndEl) return;
    
    const date = aDateEl.value, room = aRoomEl.value;
    if (date) {
        const d = new Date(date);
        if (d.getDay() === 0) { showToast("Không được phép đặt lịch vào Chủ Nhật!", "error"); aDateEl.value = ""; aTimeContainer.classList.add('hidden'); return; }
    }
    if (!date || !room) { aTimeContainer.classList.add('hidden'); return; }
    aTimeContainer.classList.remove('hidden');
    
    const aEditId = document.getElementById('aEditRowIndex') ? document.getElementById('aEditRowIndex').value : '';
    const bookedRanges = allBookings.filter(b => b["Ngày họp"] === date && b["Phòng họp"] === room && b.rowIndex != aEditId);
    
    let options = '<option value="">Chọn giờ</option>';
    for (let h = 8; h <= 16; h++) {
        for (let m of [0, 15, 30, 45]) {
            let timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            let isBooked = bookedRanges.some(b => timeStr >= cleanTime(b["Bắt đầu"]) && timeStr < cleanTime(b["Kết thúc"]));
            if (!isBooked) options += `<option value="${timeStr}">${timeStr}</option>`;
        }
    }
    aStartEl.innerHTML = options; aEndEl.innerHTML = '<option value="">--</option>';
}

function updateAdminEndTimes() {
    const aStartEl = document.getElementById('aStartSelect'), aDateEl = document.getElementById('aDateSelect'), aRoomEl = document.getElementById('aRoomSelect'), aEndEl = document.getElementById('aEndSelect');
    if(!aStartEl || !aDateEl || !aRoomEl || !aEndEl) return;
    
    const startTime = aStartEl.value, date = aDateEl.value, room = aRoomEl.value;
    if (!startTime) { aEndEl.innerHTML = '<option value="">--</option>'; return; }
    
    const aEditId = document.getElementById('aEditRowIndex') ? document.getElementById('aEditRowIndex').value : '';
    const bookedRanges = allBookings.filter(b => b["Ngày họp"] === date && b["Phòng họp"] === room && b.rowIndex != aEditId).sort((a, b) => cleanTime(a["Bắt đầu"]).localeCompare(cleanTime(b["Bắt đầu"])));
    
    const nextBooking = bookedRanges.find(b => cleanTime(b["Bắt đầu"]) > startTime);
    const limitEnd = nextBooking ? cleanTime(nextBooking["Bắt đầu"]) : "17:00";
    
    let options = '<option value="">Chọn giờ</option>';
    let startMin = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
    
    for (let h = 8; h <= 17; h++) {
        for (let m of [0, 15, 30, 45]) {
            if (h === 17 && m > 0) continue; 
            let timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`, totalMin = h * 60 + m;
            if (totalMin > startMin && timeStr <= limitEnd) options += `<option value="${timeStr}">${timeStr}</option>`;
        }
    }
    aEndEl.innerHTML = options;
}

function addGuestToAdminForm(email, name) { 
    if (!adminSelectedGuests.includes(email)) adminSelectedGuests.push(email); 
    document.getElementById('aGuestSearchInput').value = ''; 
    document.getElementById('aGuestSuggestions').classList.add('hidden'); 
    renderAdminGuestTags(); 
}

function renderAdminGuestTags() {
    const container = document.getElementById('aGuestTagsContainer'), hiddenInput = document.getElementById('aGuests');
    if(!container || !hiddenInput) return;
    hiddenInput.value = adminSelectedGuests.join(',');
    container.innerHTML = adminSelectedGuests.map(email => {
        const user = allUsersBasicList.find(u => u.email === email), name = user ? user.name : email.split('@')[0];
        return `<div class="bg-indigo-50 text-indigo-700 px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-wide flex items-center gap-1.5 border border-indigo-100 shadow-sm animate-[slideUp_0.2s_ease-out]">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>${name}
                <button type="button" onclick="removeAdminGuest('${email}')" class="hover:bg-indigo-200 p-0.5 rounded-full text-indigo-500 hover:text-indigo-800 transition-colors ml-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>`;
    }).join('');
}

async function handleAdminBookingSubmit(e) {
    e.preventDefault();
    const formData = getSafeFormData(e.target);
    if (currentUser) formData.editorName = currentUser.name; 
    
    toggleLoading(true);
    const res = await apiCall('saveBooking', { formData: formData, rowIndex: formData.rowIndex });
    toggleLoading(false);

    if(res.success) {
        showSuccessModalWithDetailsEditor(formData, !!formData.rowIndex);
        closeModals(); 
        
        // CẬP NHẬT GIAO DIỆN LẠC QUAN
        if (typeof applyOptimisticUI === 'function') applyOptimisticUI(formData);
        refreshBookingsData(); // Sync ngầm
    } else {
        if (res && res.error && res.error.includes("vừa bị người khác đặt")) {
            const eModal = document.getElementById('errorModal'), eMsg = document.getElementById('errorModalMsg');
            if (eMsg) eMsg.innerText = res.error;
            if (eModal) { eModal.classList.remove('hidden'); eModal.classList.add('flex'); }
            closeModals(); 
            refreshBookingsData(); // Sync ngầm
        } else { showToast(res.error, "error"); }
    }
}

function showSuccessModalWithDetailsEditor(formData, isEdit) {
    const sModal = document.getElementById('successModal'), msgContainer = document.getElementById('successModalMsg');
    if(!sModal || !msgContainer) return;

    const title = document.querySelector('#successModal h3');
    if (title) title.innerText = isEdit ? "Đã cập nhật lịch họp!" : "Đã đăng ký sử dụng phòng!";

    let displayDate = formData.date;
    if (formData.date) {
        const parts = formData.date.split('-');
        if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    const notes = (formData.note && formData.note.trim() !== "") ? formData.note.trim() : "Không";

    let htmlContent = `
        <div class="text-left bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 space-y-2 text-[13px] text-slate-700 shadow-inner">
            <div><span class="font-bold text-slate-500">Tên cuộc họp:</span> <span class="font-semibold text-blue-700">${formData.title}</span></div>
            <div><span class="font-bold text-slate-500">Phòng:</span> <span class="font-semibold">${formData.room}</span></div>
            <div><span class="font-bold text-slate-500">Thời gian:</span> <span class="font-semibold">${displayDate} | ${formData.start} - ${formData.end}</span></div>
            <div><span class="font-bold text-slate-500">Yêu cầu chuẩn bị:</span> <span>${notes}</span></div>
        </div>`;

    msgContainer.innerHTML = htmlContent;
    sModal.classList.remove('hidden'); sModal.classList.add('flex');
}

function handleAdminDeleteFromForm() {
    const idx = document.getElementById('aEditRowIndex').value, reasonInput = document.getElementById('aReason').value;
    if (idx) {
        if (!reasonInput || reasonInput.trim() === "") { showToast("Bắt buộc phải nhập Lý do thay đổi (*) trước khi hủy!", "error"); document.getElementById('aReason').focus(); return; }
        confirmAdminDelete(idx, reasonInput); closeModals();
    }
}

function confirmAdminDelete(idx, directReason = null) {
    let reason = directReason;
    if (reason === null) {
        reason = prompt("Bạn đang hủy lịch dưới quyền Quản trị.\nVui lòng nhập LÝ DO hủy lịch để lưu vào Log lịch sử:");
        if (reason === null) return; 
        if (reason.trim() === "") { showToast("Bắt buộc phải nhập lý do hủy lịch!", "error"); return; }
    }

    // CẬP NHẬT LẠC QUAN: Ẩn ngay trên giao diện (Đã sửa lỗi gọi hàm không an toàn ở đây)
    allBookings = allBookings.filter(b => b.rowIndex != idx);
    if (typeof renderAdminBookings === 'function') renderAdminBookings(); 
    if (typeof renderSchedule === 'function') renderSchedule(); 
    if (typeof renderMyBookings === 'function') renderMyBookings();
    
    showToast("Đang xóa lịch họp...", "info");
    const editorEmail = currentUser ? currentUser.email : "", editorName = currentUser ? currentUser.name : ""; 
    
    // Xóa ngầm API
    apiCall('deleteBooking', { rowIndex: idx, reason: reason, editorEmail: editorEmail, editorName: editorName })
        .then(res => {
            if (res.success) { showToast("Đã xóa lịch họp thành công!", "success"); }
            refreshBookingsData(); // Sync ngầm
        });
}

function checkDeepLinkEditor() {
    if (URL_ACTION === 'edit' && URL_EVENT_ID) {
        const b = allBookings.find(item => {
            const itemId = item['EventID'] !== undefined ? item['EventID'] : item['Event ID'];
            return itemId && String(itemId).replace(/^'/, '') === URL_EVENT_ID;
        });
        if (b) { setTimeout(() => openAdminBookingModal(b.rowIndex), 300); } 
        else showToast("Cuộc họp không tồn tại hoặc đã bị hủy.", "error");
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ============================================================================
// PHẦN B: LOGIC TRANG ADMIN (QUẢN TRỊ USER VÀ HỆ THỐNG)
// ============================================================================
async function initAdminPage() {
    const savedUser = localStorage.getItem('emm_user');
    if(savedUser) { 
        currentUser = JSON.parse(savedUser); 
        if (currentUser.role !== 'Admin') { window.location.href = 'index.html'; return; }
    } else {
        window.location.href = 'index.html'; return;
    }
    
    switchSystemAdminTab('users');
    await loadUsersData(true);
}

function switchSystemAdminTab(tab) {
    const tbUsers = document.getElementById('adminTabUsers'), tbSystem = document.getElementById('adminTabSystem');
    if(tbUsers) tbUsers.classList.toggle('hidden', tab !== 'users');
    if(tbSystem) tbSystem.classList.toggle('hidden', tab !== 'system');

    const uBtn = document.getElementById('tabBtnUsers'), sBtn = document.getElementById('tabBtnSystem');
    const uBtnM = document.getElementById('tabBtnUsersMob'), sBtnM = document.getElementById('tabBtnSystemMob');
    
    const aClass = "px-4 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-white transition-colors", iClass = "px-4 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors";
    const aClassM = "flex-1 min-w-[80px] py-2 text-xs font-bold bg-slate-700 rounded-lg text-white transition-colors", iClassM = "flex-1 min-w-[80px] py-2 text-xs font-bold text-slate-400 hover:bg-slate-700 hover:text-white rounded-lg transition-colors";

    if(uBtn) uBtn.className = tab === 'users' ? aClass : iClass; if(sBtn) sBtn.className = tab === 'system' ? aClass : iClass;
    if(uBtnM) uBtnM.className = tab === 'users' ? aClassM : iClassM; if(sBtnM) sBtnM.className = tab === 'system' ? aClassM : iClassM;
}

async function loadUsersData(showLoader = false) {
    if (showLoader) toggleLoading(true);
    const res = await apiCall('getUsers');
    if(Array.isArray(res)) {
        allUsers = res; 
        renderAdminUsers(); 
        filterAdminUsers();
    }
    if (showLoader) toggleLoading(false);
}

function renderAdminUsers() {
    const container = document.getElementById('adminUsersList');
    if(!container) return;
    if (allUsers.length === 0) { container.innerHTML = '<p class="text-center text-slate-400 py-6 text-sm">Chưa có người dùng nào</p>'; return; }
    container.innerHTML = allUsers.map(u => {
        const roleColor = u['Role'] === 'Admin' ? 'bg-purple-100 text-purple-700' : (u['Role'] === 'Editor' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600');
        const groupName = u['Nhóm'] ? String(u['Nhóm']).replace(/^'/, '') : 'CBCNV';
        return `<div class="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="flex items-center gap-2 mb-1.5"><span class="font-bold text-slate-800 text-base">${String(u['Tên người dùng']).replace(/^'/, '')}</span><span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${roleColor}">${u['Role']}</span></div>
                    <div class="text-xs font-semibold text-slate-500">${String(u['Mã NV']).replace(/^'/, '')} &bull; Nhóm: ${groupName}</div>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button onclick="sendWelcomeEmailUser(${u.rowIndex})" title="Gửi thư chào mừng & Reset MK" class="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl active:scale-95 transition-transform"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></button>
                    <button onclick="openAdminUserModal(${u.rowIndex})" title="Sửa thông tin" class="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl active:scale-95 transition-transform"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>
                    <button onclick="confirmDeleteUser(${u.rowIndex})" title="Xóa" class="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl active:scale-95 transition-transform"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function filterAdminUsers() {
    const keyword = (document.getElementById('searchAdminUsers')?.value || '').toLowerCase();
    const container = document.getElementById('adminUsersList');
    if (container) {
        for (let card of container.children) {
            if (card.tagName !== 'DIV' || card.classList.contains('text-center')) continue; 
            card.style.display = card.innerText.toLowerCase().includes(keyword) ? '' : 'none';
        }
    }
}

function openAdminUserModal(idx = null) {
    const form = document.getElementById('adminUserForm'); if(form) form.reset();
    const modalTitle = document.getElementById('adminUserModalTitle');
    if (idx) {
        const u = allUsers.find(item => item.rowIndex === idx);
        if (!u) return;
        if(modalTitle) modalTitle.innerText = "Sửa Người Dùng";
        document.getElementById('uEditRowIndex').value = idx;
        document.getElementById('uMsnv').value = String(u['Mã NV']).replace(/^'/, '');
        document.getElementById('uName').value = String(u['Tên người dùng']).replace(/^'/, '');
        document.getElementById('uDept').value = u['Phòng ban'] ? String(u['Phòng ban']).replace(/^'/, '') : '';
        document.getElementById('uTitle').value = u['Vị trí công việc'] ? String(u['Vị trí công việc']).replace(/^'/, '') : '';
        document.getElementById('uEmail').value = u['Email'];
        document.getElementById('uPhone').value = String(u['Số điện thoại']).replace(/^'/, '');
        document.getElementById('uRole').value = u['Role'];
        document.getElementById('uIsChangedPass').value = u['Đã đổi MK'];
        document.getElementById('uGroup').value = u['Nhóm'] ? String(u['Nhóm']).replace(/^'/, '') : 'CBCNV';
    } else {
        if(modalTitle) modalTitle.innerText = "Thêm Người Dùng";
        document.getElementById('uEditRowIndex').value = "";
        document.getElementById('uGroup').value = "CBCNV";
    }
    const modal = document.getElementById('adminUserModal');
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

async function handleAdminUserSubmit(e) {
    e.preventDefault();
    const formData = getSafeFormData(e.target);
    toggleLoading(true);
    const res = await apiCall('saveUser', { formData: formData, rowIndex: formData.rowIndex });
    toggleLoading(false);
    if(res.success) { showToast("Lưu người dùng thành công!", "success"); closeModals(); loadUsersData(); } 
    else showToast(res.error, "error"); 
}

async function confirmDeleteUser(idx) {
    if (confirm("Xóa nhân viên này khỏi hệ thống?")) {
        toggleLoading(true);
        const res = await apiCall('deleteUser', { rowIndex: idx });
        toggleLoading(false);
        if(res.success) { showToast("Đã xóa!", "success"); loadUsersData(); }
    }
}

async function sendWelcomeEmailUser(idx) {
    if(confirm("Tự động tạo mật khẩu mới 6 chữ số và gửi email chào mừng cho nhân viên này?")) {
        toggleLoading(true);
        const baseUrl = window.location.href.split('/').slice(0, -1).join('/') + '/index.html';
        const res = await apiCall('sendWelcomeEmailAuth', { rowIndex: idx, appUrl: baseUrl });
        toggleLoading(false);
        if(res.success) { showToast("Đã cấp lại mật khẩu và gửi email thành công!", "success"); loadUsersData(); } 
        else showToast(res.error, "error");
    }
}

async function syncCalendarAdmin() {
    if (!confirm("Hệ thống sẽ đồng bộ dữ liệu giữa Sheet và Google Calendar. Quá trình này có thể mất vài giây. Tiếp tục?")) return;
    toggleLoading(true);
    const res = await apiCall('syncCalendar');
    toggleLoading(false);
    if (res && res.success) showToast(`Đồng bộ thành công! Tạo: ${res.added}, Xóa: ${res.deleted}, Cập nhật: ${res.updated || 0}`, "success");
    else showToast("Lỗi đồng bộ: " + (res.error || "Không phản hồi"), "error"); 
}
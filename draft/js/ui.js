// ============================================================================
// UI.JS - CHỨA LOGIC GIAO DIỆN CỦA 3 TRANG (INDEX, EDITOR, ADMIN)
// ============================================================================

// ----------------------------------------------------------------------------
// ROUTER & KHỞI TẠO TỰ ĐỘNG
// ----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    const path = window.location.pathname.toLowerCase();

    if (path.includes('admin.html')) {
        await initAdminPage();
    } else if (path.includes('editor.html')) {
        await initEditorPage();
    } else {
        // Mặc định là index.html (Trang User)
        initUserPage();
    }
});

// ----------------------------------------------------------------------------
// PHẦN 1: LOGIC TRANG USER (Gộp từ booking.js)
// ----------------------------------------------------------------------------
function initUserPage() {
    try {
        const supportLinks = document.getElementById('supportLinks');
        if (supportLinks) {
            supportLinks.innerHTML = `<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg><a href="tel:${IT_PHONE}" class="text-blue-500 font-semibold hover:underline">Hỗ trợ IT</a> &bull; <a href="tel:${RECEPTION_PHONE}" class="text-blue-500 font-semibold hover:underline">Lễ tân</a>`;
        }

        populateUserRooms();
        initDateOptions(); 
        initScheduleDateSelect(); 
        
        loadData(); 
        startBackgroundSync();
        
        initGuestSearch('guestSearchInput', 'guestSuggestions', addGuestToForm);
        initGuestSearch('glSearchInput', 'glSuggestions', addGuestToModal);
        
        if (RESET_TOKEN) {
            localStorage.removeItem('emm_user');
            currentUser = null;
            const rm = document.getElementById('resetModal');
            if(rm) { rm.classList.remove('hidden'); rm.classList.add('flex'); }
        }
        
        const savedUser = localStorage.getItem('emm_user');
        if(savedUser) { 
            currentUser = JSON.parse(savedUser); 
            applyAuthState(); 
        }

        window.addEventListener("hashchange", async () => {
            const newHash = window.location.hash;
            if (newHash && /^#r\d+$/.test(newHash) && currentUser) {
                toggleLoading(true);
                await refreshBookingsData(); 
                toggleLoading(false);
                handleQRScanAutoFill(newHash.substring(2));
            }
        });
    } catch (err) { console.error("Lỗi khi tải trang Index:", err); }
}

function populateUserRooms() {
    const roomSel = document.getElementById('roomSelect');
    if (!roomSel) return;
    let optionsHTML = '<option value="">-- Chọn --</option>';
    APP_ROOMS.forEach(room => { optionsHTML += `<option value="${room}">${room}</option>`; });
    roomSel.innerHTML = optionsHTML;
}

function initDateOptions() {
    const dateSelect = document.getElementById('dateSelect'); if(!dateSelect) return;
    for (let i = 0; i <= 31; i++) {
        let d = new Date(); d.setDate(d.getDate() + i);
        if (d.getDay() === 0) continue; 
        let dateStr = getLocalDateString(d);
        let label = i === 0 ? "Hôm nay" : d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
        dateSelect.innerHTML += `<option value="${dateStr}">${label}</option>`;
    }
}

function initScheduleDateSelect() {
    const dateSelect = document.getElementById('scheduleDateSelect'); 
    if(!dateSelect) return;
    dateSelect.innerHTML = '';
    for (let i = 0; i <= 31; i++) {
        let d = new Date(); d.setDate(d.getDate() + i);
        if (d.getDay() === 0) continue; 
        let dateStr = getLocalDateString(d);
        let label = i === 0 ? "Hôm nay" : d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
        dateSelect.innerHTML += `<option value="${dateStr}">${label}</option>`;
    }
}

function switchScheduleTab(tabIndex) {
    currentScheduleTab = tabIndex;
    const btn1 = document.getElementById('schedTab1'), btn2 = document.getElementById('schedTab2');
    if(!btn1 || !btn2) return;
    
    const activeClasses = "flex-1 py-2 text-sm font-bold bg-white text-indigo-600 shadow-sm rounded-lg transition-all";
    const inactiveClasses = "flex-1 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all";
    
    if (tabIndex === 1) {
        btn1.className = activeClasses; btn2.className = inactiveClasses;
        document.getElementById('schedCol1Title').innerText = APP_ROOMS[0];
        document.getElementById('schedCol2Title').innerText = APP_ROOMS[1];
    } else {
        btn2.className = activeClasses; btn1.className = inactiveClasses;
        document.getElementById('schedCol1Title').innerText = APP_ROOMS[2];
        document.getElementById('schedCol2Title').innerText = APP_ROOMS[3];
    }
    renderSchedule();
}

function renderSchedule() {
    if (!currentUser) return; 
    const scheduleDateSelect = document.getElementById('scheduleDateSelect');
    if(!scheduleDateSelect) return;
    const dateStr = scheduleDateSelect.value;
    if (!dateStr) return;

    const room1 = currentScheduleTab === 1 ? APP_ROOMS[0] : APP_ROOMS[2];
    const room2 = currentScheduleTab === 1 ? APP_ROOMS[1] : APP_ROOMS[3];

    const dayBookings = allBookings.filter(b => b["Ngày họp"] === dateStr);

    renderScheduleColumn('schedCol1Events', room1, dayBookings, dateStr);
    renderScheduleColumn('schedCol2Events', room2, dayBookings, dateStr);
}

function renderScheduleColumn(containerId, roomName, dayBookings, dateStr) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let html = '';
    const totalMinutes = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 60;
    
    const lunchStartMin = (12 - SCHEDULE_START_HOUR) * 60;
    const lunchTop = lunchStartMin * PIXELS_PER_MINUTE;
    const lunchHeight = 60 * PIXELS_PER_MINUTE;
    html += `<div class="absolute w-full bg-slate-200/60 pointer-events-none z-0 flex items-center justify-center text-slate-400 font-bold text-[10px] tracking-widest uppercase" style="top: ${lunchTop}px; height: ${lunchHeight}px;">Nghỉ trưa</div>`;

    for (let m = 0; m < totalMinutes; m += 30) {
        let currentHour = Math.floor(m / 60) + SCHEDULE_START_HOUR;
        let currentMin = m % 60;
        let timeStr = `${currentHour.toString().padStart(2,'0')}:${currentMin.toString().padStart(2,'0')}`;
        let borderBottom = (currentMin === 0) ? '' : 'border-b border-slate-100 border-dashed';

        html += `<div onclick="handleEmptySlotClick('${roomName}', '${dateStr}', '${timeStr}')" 
                      class="absolute w-full h-[30px] hover:bg-indigo-50/50 cursor-pointer ${borderBottom} z-0" 
                      style="top: ${m * PIXELS_PER_MINUTE}px;">
                 </div>`;
    }

    const roomBookings = dayBookings.filter(b => b["Phòng họp"] === roomName);

    roomBookings.forEach(b => {
        const startMins = timeToMinutes(cleanTime(b["Bắt đầu"]));
        const endMins = timeToMinutes(cleanTime(b["Kết thúc"]));
        const baselineMins = SCHEDULE_START_HOUR * 60;

        let topPos = (startMins - baselineMins) * PIXELS_PER_MINUTE;
        let height = (endMins - startMins) * PIXELS_PER_MINUTE;

        if (topPos < 0) { height += topPos; topPos = 0; }
        if (topPos + height > totalMinutes * PIXELS_PER_MINUTE) { height = (totalMinutes * PIXELS_PER_MINUTE) - topPos; }
        if (height <= 0) return;

        const isCreator = String(b["Mã NV"]).replace(/^'/, '') === String(currentUser.msnv).replace(/^'/, '');
        const rawGuests = String(b["Khách mời"] || "").toLowerCase().replace(/^'/, '');
        const isGuest = rawGuests.includes(currentUser.email.toLowerCase());

        let bgClass = "bg-slate-200 border-slate-300";
        let textClass = "text-sm font-normal text-slate-700 leading-tight break-words";

        if (isCreator) {
            bgClass = "bg-blue-500 border-blue-600 shadow-md";
            textClass = "text-sm font-normal text-white leading-tight break-words";
        } else if (isGuest) {
            bgClass = "bg-orange-500 border-orange-600 shadow-md";
            textClass = "text-sm font-normal text-white leading-tight break-words";
        }

        const title = String(b["Tên cuộc họp"]).replace(/^'/, '');

        html += `<div onclick="handleMeetingClick(${b.rowIndex})" 
                      class="schedule-block absolute left-1 right-1 rounded-md border ${bgClass} overflow-hidden cursor-pointer p-1.5 flex flex-col justify-start z-10"
                      style="top: ${topPos}px; height: ${height}px;"
                      title="${title}">
                      <div class="${textClass}">${title}</div>
                 </div>`;
    });

    container.innerHTML = html;
}

function handleEmptySlotClick(roomName, dateStr, timeStr) { showRoomStatusModal(roomName, dateStr, timeStr); }

function handleMeetingClick(rowIndex) {
    const b = allBookings.find(item => item.rowIndex === rowIndex);
    if (!b || !currentUser) { showToast("Cuộc họp này không còn tồn tại hoặc đã bị thay đổi.", "error"); return; }

    const isCreator = String(b["Mã NV"]).replace(/^'/, '') === String(currentUser.msnv).replace(/^'/, '');
    const isAdminOrEditor = currentUser.role === 'Admin' || currentUser.role === 'Editor';
    const rawGuests = String(b["Khách mời"] || "").toLowerCase().replace(/^'/, '');
    const isGuest = rawGuests.includes(currentUser.email.toLowerCase());

    const canEdit = isCreator || isAdminOrEditor;
    const title = String(b['Tên cuộc họp']).replace(/^'/, '');
    const creatorStr = String(b['Người đăng ký']).replace(/^'/, '');
    const room = b['Phòng họp'];
    const timeStr = `${cleanTime(b['Bắt đầu'])} - ${cleanTime(b['Kết thúc'])}`;
    
    let guestNamesStr = '<span class="text-slate-400 italic font-normal">Không có</span>';
    const guestEmails = rawGuests ? rawGuests.split(',').map(e => e.trim()).filter(e => e) : [];
    if (guestEmails.length > 0) {
        const guestNames = guestEmails.map(email => { const user = allUsersBasicList.find(u => u.email.toLowerCase() === email.toLowerCase()); return user ? user.name : email.split('@')[0]; });
        guestNamesStr = guestNames.join(', ');
    }

    const notes = b['Yêu cầu khác'] ? String(b['Yêu cầu khác']).replace(/^'/, '') : 'Không';
    const modalContent = document.getElementById('scheduleModalContent');
    
    let html = `
        <h3 class="font-bold text-lg text-slate-800 mb-4 pb-3 border-b border-slate-100 flex items-start gap-2">
            <span class="w-2 h-6 bg-indigo-500 rounded-full mt-0.5"></span> ${title}
        </h3>
        <div class="space-y-3 text-sm text-slate-600 mb-6">
            <div class="flex gap-2"><svg class="w-4 h-4 mt-0.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg> <span class="font-medium text-slate-800">${room}</span></div>
            <div class="flex gap-2"><svg class="w-4 h-4 mt-0.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> <span class="font-medium text-slate-800">${timeStr}</span></div>
            <div class="flex gap-2"><svg class="w-4 h-4 mt-0.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg> <span>Tạo bởi: <span class="font-medium">${creatorStr}</span></span></div>
    `;

    if (canEdit || isGuest) {
        html += `
            <div class="flex gap-2 items-start"><svg class="w-4 h-4 mt-0.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg> <span>Khách mời: ${guestNamesStr}</span></div>
            ${b['Yêu cầu khác'] ? `<div class="flex gap-2 items-start p-2 bg-amber-50 rounded text-amber-800 text-[13px]"><svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg> <span>Yêu cầu: <span class="font-medium">${notes}</span></span></div>` : ''}
        `;
    }

    html += `</div><div class="flex gap-3">`;
    
    if (canEdit) {
        let isLocked = false;
        if (!isAdminOrEditor) {
            const now = new Date(), todayStr = getLocalDateString(now), currentTimeInMins = now.getHours() * 60 + now.getMinutes();
            if (b["Ngày họp"] < todayStr) isLocked = true;
            else if (b["Ngày họp"] === todayStr) {
                const startParts = cleanTime(b["Bắt đầu"]).split(':'), startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
                if (currentTimeInMins + BLOCK_EDIT_MINUTES > startMins) isLocked = true; 
            }
        }
        if (!isLocked) {
            const editAction = isAdminOrEditor ? `window.location.href='editor.html?action=edit&eventId=${String(b['Event ID']||b['EventID']).replace(/^'/,'')}';` : `closeModals(); prepareEdit(${b.rowIndex})`;
            html += `<button onclick="${editAction}" class="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold shadow-md shadow-blue-200 transition-colors flex items-center justify-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Sửa Lịch</button>`;
        }
    }
    
    html += `<button onclick="closeModals()" class="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors">Đóng</button></div>`;

    modalContent.innerHTML = html;
    const modal = document.getElementById('scheduleInteractionModal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
}

function getFormattedDateLabel(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr), todayStr = getLocalDateString(new Date()), day = String(d.getDate()).padStart(2, '0'), month = String(d.getMonth() + 1).padStart(2, '0');
    if (dateStr === todayStr) return `Hôm nay, ${day}/${month}`;
    const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return `${weekdays[d.getDay()]}, ${day}/${month}`;
}

function getRoomStatus(roomName, targetDateStr, targetTimeStr) {
    const now = new Date(), todayStr = getLocalDateString(now);
    let refMins = 0, isPastView = false;

    if (targetTimeStr) {
        refMins = timeToMinutes(targetTimeStr);
        if (targetDateStr === todayStr && refMins < (now.getHours() * 60 + now.getMinutes())) isPastView = true;
        else if (targetDateStr < todayStr) isPastView = true;
    } else {
        if (targetDateStr === todayStr) refMins = now.getHours() * 60 + now.getMinutes(); 
        else if (targetDateStr < todayStr) { refMins = 18 * 60; isPastView = true; } 
        else refMins = 0; 
    }

    const dayBookings = allBookings.filter(b => b["Ngày họp"] === targetDateStr && b["Phòng họp"] === roomName);
    dayBookings.sort((a, b) => timeToMinutes(cleanTime(a["Bắt đầu"])) - timeToMinutes(cleanTime(b["Bắt đầu"])));

    let currentMeeting = null, nextMeeting = null;
    for (let b of dayBookings) {
        const startMins = timeToMinutes(cleanTime(b["Bắt đầu"])), endMins = timeToMinutes(cleanTime(b["Kết thúc"]));
        if (refMins >= startMins && refMins < endMins) currentMeeting = b;
        else if (startMins >= refMins && !nextMeeting) nextMeeting = b;
    }
    return { currentMeeting, nextMeeting, isPastView };
}

function showRoomStatusModal(roomName, targetDateStr, prefillTimeStr = null) {
    const { currentMeeting, nextMeeting, isPastView } = getRoomStatus(roomName, targetDateStr, prefillTimeStr);
    const dateLabel = getFormattedDateLabel(targetDateStr);

    let currentText = "Trống (Có thể đặt lịch)";
    if (isPastView && !currentMeeting) currentText = "Khung giờ này đã trôi qua";
    else if (currentMeeting) {
        const title = String(currentMeeting["Tên cuộc họp"]).replace(/^'/, '');
        currentText = `<span class="font-semibold text-blue-700">${cleanTime(currentMeeting["Bắt đầu"])}: ${title}</span> | kết thúc ${cleanTime(currentMeeting["Kết thúc"])}`;
    }

    let nextText = "Không có lịch trình tiếp theo";
    if (nextMeeting) {
        const title = String(nextMeeting["Tên cuộc họp"]).replace(/^'/, '');
        nextText = `Tiếp theo: <span class="font-semibold text-orange-600">${title}</span> | ${cleanTime(nextMeeting["Bắt đầu"])} - ${cleanTime(nextMeeting["Kết thúc"])}`;
    }

    const modalContent = document.getElementById('scheduleModalContent');
    modalContent.innerHTML = `
        <div class="mb-5">
            <div class="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
            </div>
            <h3 class="font-bold text-lg text-center text-slate-800 mb-1">${roomName}</h3>
            <p class="text-xs font-semibold text-center text-slate-400 mb-4 uppercase tracking-widest">${dateLabel}</p>
            
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3 text-sm">
                <div class="flex flex-col">
                    <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">${prefillTimeStr ? `Thời gian: ${prefillTimeStr}` : 'Hiện tại'}</span>
                    <span class="text-slate-700 leading-snug">${currentText}</span>
                </div>
                <div class="border-t border-slate-200"></div>
                <div class="flex flex-col">
                    <span class="text-slate-700 leading-snug">${nextText}</span>
                </div>
            </div>
        </div>
        <div class="flex gap-3">
            <button onclick="closeModals()" class="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors">Đóng</button>
            <button onclick="registerFromStatusModal('${roomName}', '${targetDateStr}', '${prefillTimeStr || ''}')" class="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-200 transition-colors">Đăng ký lịch</button>
        </div>
    `;
    const modal = document.getElementById('scheduleInteractionModal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
}

function registerFromStatusModal(roomName, targetDateStr, specificStartTimeStr) {
    closeModals();
    const formSection = document.getElementById('formSection');
    if (formSection) formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    resetEditState();

    const dateSelect = document.getElementById('dateSelect'), roomSelect = document.getElementById('roomSelect'), startSelect = document.getElementById('startSelect'), endSelect = document.getElementById('endSelect');

    let isDateValid = Array.from(dateSelect.options).some(opt => opt.value === targetDateStr);
    if (isDateValid) dateSelect.value = targetDateStr;
    else {
        dateSelect.value = getLocalDateString(new Date());
        showToast("Ngày bạn chọn không khả dụng, đã tự động chuyển về hôm nay.", "info");
    }

    roomSelect.value = roomName;
    updateStartTimes();

    let targetStart = "";
    if (specificStartTimeStr && startSelect.querySelector(`option[value="${specificStartTimeStr}"]`)) targetStart = specificStartTimeStr;
    else if (startSelect.options.length > 1) targetStart = startSelect.options[1].value;

    if (!targetStart) { showToast("Phòng này đã kín lịch trong ngày được chọn.", "error"); return; }

    startSelect.value = targetStart;
    updateEndTimes(); 
    if (endSelect.options.length > 1) endSelect.value = endSelect.options[1].value;

    setTimeout(() => { document.getElementById('fTitle').focus(); }, 300);
}

function handleQRScanAutoFill(roomIdentifier) {
    let targetRoomName = roomIdentifier;
    const roomSelect = document.getElementById('roomSelect');
    
    if (/^\d+$/.test(roomIdentifier)) {
        let roomIndex = parseInt(roomIdentifier, 10);
        if (roomIndex > 0 && roomIndex < roomSelect.options.length) targetRoomName = roomSelect.options[roomIndex].value;
        else if (roomIndex - 1 >= 0 && roomIndex - 1 < APP_ROOMS.length) targetRoomName = APP_ROOMS[roomIndex - 1]; 
    }

    if (!APP_ROOMS.includes(targetRoomName)) { showToast("Phòng họp từ mã QR hoặc tham số không hợp lệ!", "error"); return; }

    const now = new Date(), currentTotalMins = now.getHours() * 60 + now.getMinutes();
    let targetDate = new Date(now), targetTimeStr = null;

    if (targetDate.getDay() === 0) { targetDate.setDate(targetDate.getDate() + 1); targetTimeStr = "08:00"; } 
    else if (currentTotalMins >= 16 * 60 + 45) {
        targetDate.setDate(targetDate.getDate() + 1);
        if (targetDate.getDay() === 0) targetDate.setDate(targetDate.getDate() + 1);
        targetTimeStr = "08:00";
    } 
    else if (currentTotalMins < 8 * 60) targetTimeStr = "08:00";

    showRoomStatusModal(targetRoomName, getLocalDateString(targetDate), targetTimeStr);
}

async function checkDeepLink() {
    if (hasCheckedDeepLink || !currentUser) return;
    if (URL_ROOM_INDEX || (URL_ACTION === 'edit' && URL_EVENT_ID)) {
        hasCheckedDeepLink = true; 
        toggleLoading(true);
        await refreshBookingsData();
        toggleLoading(false);

        if (URL_ROOM_INDEX) handleQRScanAutoFill(URL_ROOM_INDEX); 
        else processDeepLinkAction(URL_ACTION, URL_EVENT_ID);
    } else hasCheckedDeepLink = true;
}

function processDeepLinkAction(action, eventId) {
    if (action === 'edit' && eventId) {
        const b = allBookings.find(item => {
            const itemId = item['EventID'] !== undefined ? item['EventID'] : item['Event ID'];
            return itemId && String(itemId).replace(/^'/, '') === eventId;
        });
        
        if (b) {
            if (currentUser.role === 'Admin' || currentUser.role === 'Editor') {
                showToast("Vui lòng mở Quản trị để sửa lịch này", "info");
            } else {
                prepareEdit(b.rowIndex);
            }
        } else showToast("Cuộc họp không tồn tại hoặc đã bị hủy.", "error");
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function updateStartTimes() {
    const dateEl = document.getElementById('dateSelect'), roomEl = document.getElementById('roomSelect'), timeContainer = document.getElementById('timeContainer'), startEl = document.getElementById('startSelect'), endEl = document.getElementById('endSelect');
    if(!dateEl || !roomEl || !timeContainer || !startEl || !endEl) return;
    
    const date = dateEl.value, room = roomEl.value;
    if (!date || !room) { timeContainer.classList.add('hidden'); return; }
    timeContainer.classList.remove('hidden');
    
    const editId = document.getElementById('editRowIndex') ? document.getElementById('editRowIndex').value : '';
    const bookedRanges = allBookings.filter(b => b["Ngày họp"] === date && b["Phòng họp"] === room && b.rowIndex != editId);
    
    let options = '<option value="">Chọn giờ</option>';
    const now = new Date(), isToday = date === getLocalDateString(now);
    let bufferMinutes = (currentUser && currentUser.role === 'User') ? BLOCK_EDIT_MINUTES : 0; 
    const currentTotalMin = now.getHours() * 60 + now.getMinutes() + bufferMinutes;
    
    for (let h = 8; h <= 16; h++) {
        for (let m of [0, 15, 30, 45]) {
            let timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`, totalMin = h * 60 + m;
            if (isToday && totalMin <= currentTotalMin && !editId) continue;
            let isBooked = bookedRanges.some(b => timeStr >= cleanTime(b["Bắt đầu"]) && timeStr < cleanTime(b["Kết thúc"]));
            if (!isBooked) options += `<option value="${timeStr}">${timeStr}</option>`;
        }
    }
    startEl.innerHTML = options; endEl.innerHTML = '<option value="">--</option>'; 
}

function updateEndTimes() {
    const startEl = document.getElementById('startSelect'), dateEl = document.getElementById('dateSelect'), roomEl = document.getElementById('roomSelect'), endEl = document.getElementById('endSelect');
    if(!startEl || !dateEl || !roomEl || !endEl) return;
    
    const startTime = startEl.value, date = dateEl.value, room = roomEl.value;
    if (!startTime) { endEl.innerHTML = '<option value="">--</option>'; return; }
    
    const editId = document.getElementById('editRowIndex') ? document.getElementById('editRowIndex').value : '';
    const bookedRanges = allBookings.filter(b => b["Ngày họp"] === date && b["Phòng họp"] === room && b.rowIndex != editId).sort((a, b) => cleanTime(a["Bắt đầu"]).localeCompare(cleanTime(b["Bắt đầu"])));
    
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
    endEl.innerHTML = options;
}

function addGuestToForm(email, name) { 
    if (!currentSelectedGuests.includes(email)) currentSelectedGuests.push(email); 
    document.getElementById('guestSearchInput').value = ''; 
    document.getElementById('guestSuggestions').classList.add('hidden'); 
    renderGuestTags('guestTagsContainer', 'fGuests'); 
}

function renderGuestTags(containerId, inputId) {
    const container = document.getElementById(containerId), hiddenInput = document.getElementById(inputId);
    if(!container || !hiddenInput) return;
    hiddenInput.value = currentSelectedGuests.join(',');
    container.innerHTML = currentSelectedGuests.map(email => {
        const user = allUsersBasicList.find(u => u.email === email), name = user ? user.name : email.split('@')[0];
        return `<div class="bg-indigo-50 text-indigo-700 px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-wide flex items-center gap-1.5 border border-indigo-100 shadow-sm animate-[slideUp_0.2s_ease-out]">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>${name}
                <button type="button" onclick="removeGuest('${email}')" class="hover:bg-indigo-200 p-0.5 rounded-full text-indigo-500 hover:text-indigo-800 transition-colors ml-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>`;
    }).join('');
}

async function handleBookingSubmit(e) {
    e.preventDefault();
    const formData = getSafeFormData(e.target);
    if (currentUser) formData.editorName = currentUser.name; 
    
    toggleLoading(true);
    const res = await apiCall('saveBooking', { formData: formData, rowIndex: formData.rowIndex });
    toggleLoading(false);
    if (res && res.success) {
        showSuccessModalWithDetails(formData, !!formData.rowIndex);
        resetEditState(); loadData();
    } else {
        if (res && res.error && res.error.includes("vừa bị người khác đặt")) {
            const eModal = document.getElementById('errorModal'), eMsg = document.getElementById('errorModalMsg');
            if (eMsg) eMsg.innerText = res.error;
            if (eModal) { eModal.classList.remove('hidden'); eModal.classList.add('flex'); }
            resetEditState(); loadData();       
        } else { showToast("Lỗi: " + (res ? res.error : "Không thể lưu"), "error"); }
    }
}

function checkUrgent(dateStr, startStr) {
    if (!dateStr || !startStr) return false;
    const parts = dateStr.split('-'), timeParts = startStr.split(':');
    const meetingTime = new Date(parts[0], parts[1] - 1, parts[2], timeParts[0], timeParts[1]);
    const diffMins = Math.floor((meetingTime - new Date()) / 60000);
    return diffMins >= 0 && diffMins < 30;
}

function showSuccessModalWithDetails(formData, isEdit) {
    const sModal = document.getElementById('successModal'), msgContainer = document.getElementById('successModalMsg');
    if(!sModal || !msgContainer) return;

    const title = document.querySelector('#successModal h3');
    if (title) title.innerText = isEdit ? "Đã cập nhật lịch họp!" : "Đã đăng ký sử dụng phòng!";

    let displayDate = formData.date;
    if (formData.date) {
        const parts = formData.date.split('-');
        if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    const isUrgent = checkUrgent(formData.date, formData.start);
    const notes = (formData.note && formData.note.trim() !== "") ? formData.note.trim() : "Không";

    let htmlContent = `
        <div class="text-left bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 space-y-2 text-[13px] text-slate-700 shadow-inner">
            <div><span class="font-bold text-slate-500">Tên cuộc họp:</span> <span class="font-semibold text-blue-700">${formData.title}</span></div>
            <div><span class="font-bold text-slate-500">Phòng:</span> <span class="font-semibold">${formData.room}</span></div>
            <div><span class="font-bold text-slate-500">Thời gian:</span> <span class="font-semibold">${displayDate} | ${formData.start} - ${formData.end}</span></div>
            <div><span class="font-bold text-slate-500">Yêu cầu chuẩn bị:</span> <span>${notes}</span></div>
        </div>`;

    if (isUrgent) htmlContent += `
        <div class="bg-orange-50 border border-orange-200 text-orange-700 p-3 rounded-lg text-[13px] font-bold shadow-sm flex items-start gap-2 text-left mb-2">
            <svg class="w-5 h-5 shrink-0 mt-0.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <span>Đặt phòng quá gấp có thể khiến IT & Lễ tân không chuẩn bị kịp thời.</span>
        </div>`;

    msgContainer.innerHTML = htmlContent;
    sModal.classList.remove('hidden'); sModal.classList.add('flex');
}

function prepareEdit(idx) {
    const b = allBookings.find(item => item.rowIndex === idx);
    if (!b) return;
    
    const v = document.getElementById('formSection'); if(v) v.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    document.getElementById('editRowIndex').value = idx;
    document.getElementById('fEmpId').value = String(b['Mã NV']).replace(/^'/, '');
    document.getElementById('fUser').value = String(b['Người đăng ký']).replace(/^'/, '');
    document.getElementById('fTitle').value = String(b['Tên cuộc họp']).replace(/^'/, '');
    
    const dateSel = document.getElementById('dateSelect');
    if (dateSel) {
        let dateStr = b['Ngày họp'];
        if (!Array.from(dateSel.options).some(opt => opt.value === dateStr)) dateSel.innerHTML += `<option value="${dateStr}">${dateStr}</option>`;
        dateSel.value = dateStr;
    }
    
    const fEmail = document.getElementById('fCreatorEmail'); if(fEmail && currentUser) fEmail.value = currentUser.email;

    document.getElementById('roomSelect').value = b['Phòng họp'];
    document.getElementById('fNote').value = String(b['Yêu cầu khác'] || "").replace(/^'/, '');
    
    const rawGuests = String(b['Khách mời'] || "").replace(/^'/, '');
    currentSelectedGuests = rawGuests ? rawGuests.split(',').map(e => e.trim()).filter(e => e) : [];
    renderGuestTags('guestTagsContainer', 'fGuests');
    
    updateStartTimes(); document.getElementById('startSelect').value = cleanTime(b['Bắt đầu']);
    updateEndTimes(); document.getElementById('endSelect').value = cleanTime(b['Kết thúc']);
    
    const btn = document.getElementById('submitBtn');
    if(btn) { btn.innerText = "Cập nhật Lịch họp"; btn.className = "w-full py-3.5 bg-orange-500 text-white font-bold rounded-xl shadow-lg shadow-orange-200 active:scale-[0.98] transition-all"; }
    const cBtn = document.getElementById('cancelEditBtn'); if(cBtn) cBtn.classList.remove('hidden');
    const delBtn = document.getElementById('deleteBtn'); if(delBtn) delBtn.classList.remove('hidden');
}

function resetEditState() {
    const form = document.getElementById('bookingForm'); if(form) form.reset();
    const edIdx = document.getElementById('editRowIndex'); if(edIdx) edIdx.value = "";
    if(currentUser) { 
        const fUser = document.getElementById('fUser'); if(fUser) fUser.value = `${currentUser.name} - ${currentUser.dept}`; 
        const fEmp = document.getElementById('fEmpId'); if(fEmp) fEmp.value = String(currentUser.msnv).replace(/^'/, ''); 
    }
    
    currentSelectedGuests = []; renderGuestTags('guestTagsContainer', 'fGuests'); 
    const gs = document.getElementById('guestSearchInput'); if(gs) gs.value = '';
    
    const btn = document.getElementById('submitBtn');
    if(btn) { btn.innerText = "Xác nhận Đặt phòng"; btn.className = "w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-[0.98] transition-all"; }
    const cBtn = document.getElementById('cancelEditBtn'); if(cBtn) cBtn.classList.add('hidden');
    const delBtn = document.getElementById('deleteBtn'); if(delBtn) delBtn.classList.add('hidden');
    const tc = document.getElementById('timeContainer'); if(tc) tc.classList.add('hidden');
}

async function confirmDelete(idx, directReason = null) {
    let reason = "";
    let isAdminOrEditor = (currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Editor'));
    
    if (isAdminOrEditor) {
        if (directReason !== null) { reason = directReason; } 
        else {
            reason = prompt("Bạn đang hủy lịch dưới quyền Quản trị.\nVui lòng nhập LÝ DO hủy lịch để lưu vào Log lịch sử:");
            if (reason === null) return; 
            if (reason.trim() === "") { showToast("Bắt buộc phải nhập lý do hủy lịch!", "error"); return; }
        }
    } else {
        if (!confirm("Xác nhận HỦY lịch họp này? Mọi thông tin sẽ bị xóa.")) return;
        reason = "Người dùng tự hủy lịch.";
    }

    toggleLoading(true);
    const editorEmail = currentUser ? currentUser.email : "", editorName = currentUser ? currentUser.name : ""; 
    const res = await apiCall('deleteBooking', { rowIndex: idx, reason: reason, editorEmail: editorEmail, editorName: editorName });
    toggleLoading(false);
    if (res.success) { showToast("Đã xóa lịch họp thành công!", "success"); loadData(); }
}

function handleDeleteFromForm() {
    const idx = document.getElementById('editRowIndex').value;
    if (idx) { confirmDelete(idx); resetEditState(); }
}

function toggleMyBookingsView() { isMyBookingsExpanded = !isMyBookingsExpanded; renderMyBookings(); }

function buildUserCardHTML(b, todayStr, currentTimeStr, currentTimeInMins) {
    if (!currentUser) return '';
    const cleanMsnv = String(b["Mã NV"]).replace(/^'/, ''), currentCleanMsnv = String(currentUser.msnv).replace(/^'/, '');
    const isMine = cleanMsnv === currentCleanMsnv, guestListStr = String(b["Khách mời"] || "").replace(/^'/, '');
    const isGuest = guestListStr.toLowerCase().includes(currentUser.email.toLowerCase()), isAdminOrEditor = currentUser.role === 'Admin' || currentUser.role === 'Editor';

    let showEditBtn = false, showViewBtn = false;
    if (isAdminOrEditor) showEditBtn = true; 
    else {
        if (isMine) {
            let isLocked = false;
            if (b["Ngày họp"] < todayStr) isLocked = true;
            else if (b["Ngày họp"] === todayStr) {
                const startParts = cleanTime(b["Bắt đầu"]).split(':'), startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
                if (currentTimeInMins + BLOCK_EDIT_MINUTES > startMins) isLocked = true; 
            }
            if (isLocked) showViewBtn = true; else showEditBtn = true;
        } else if (isGuest) showViewBtn = true; 
    }

    let cardBg = "bg-white", borderColor = "border-slate-100", leftBarColor = "#94a3b8"; 
    if (isMine) { cardBg = "bg-blue-50/20"; borderColor = "border-blue-100"; leftBarColor = "#3b82f6"; } 
    else if (isGuest) { cardBg = "bg-purple-50/20"; borderColor = "border-purple-100"; leftBarColor = "#a855f7"; } 
    else { leftBarColor = DISTINCT_COLORS[b.rowIndex % DISTINCT_COLORS.length]; }
    
    let actionBtns = "";
    if (showEditBtn) {
        const editAction = isAdminOrEditor ? `window.location.href='editor.html?action=edit&eventId=${String(b['Event ID']||b['EventID']).replace(/^'/,'')}';` : `prepareEdit(${b.rowIndex})`;
        actionBtns = `<div class="flex shrink-0 items-center justify-end ml-3 pl-3 border-l border-slate-200/70"><button onclick="${editAction}" title="Sửa/Hủy lịch" class="p-0.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button></div>`;
    } else if (showViewBtn) { 
        actionBtns = `<div class="flex shrink-0 items-center justify-end ml-3 pl-3 border-l border-slate-200/70"><button onclick="openGuestModal(${b.rowIndex})" title="Xem thông tin" class="p-0.5 text-orange-500 hover:text-orange-700 hover:bg-orange-100 rounded-lg transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg></button></div>`;
    }

    return `<div class="py-3.5 pr-3.5 pl-4 ${cardBg} shadow-sm rounded-2xl border ${borderColor} flex flex-col relative overflow-hidden hover:shadow-md transition-all">
        <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${leftBarColor}"></div>
        <div class="text-center w-full pb-2 mb-2 border-b border-slate-200/70"><h3 class="font-semibold text-sm sm:text-base break-words leading-tight" style="color: #073763;" title="${String(b['Tên cuộc họp']).replace(/^'/, '')}">${String(b['Tên cuộc họp']).replace(/^'/, '')}</h3></div>
        <div class="flex justify-between items-center w-full"><div class="flex flex-col gap-1 text-xs min-w-0 flex-1"><span class="font-semibold text-slate-700 truncate text-[13px]">${b['Phòng họp']}</span><span class="text-slate-600 font-normal truncate">${formatMeetingDisplay(b['Ngày họp'], b['Bắt đầu'], b['Kết thúc'])}</span></div>${actionBtns}</div>
    </div>`;
}

function renderMyBookings() {
    if (!currentUser) return;
    const container = document.getElementById('myBookingsList'), section = document.getElementById('myBookingsSection'), toggleBtn = document.getElementById('toggleMyBookingsBtn');
    if(!container || !section) return;

    const currentCleanMsnv = String(currentUser.msnv).replace(/^'/, ''), currentEmail = currentUser.email.toLowerCase();
    const myBookings = allBookings.filter(b => {
        const cleanMsnv = String(b["Mã NV"]).replace(/^'/, ''), guestListStr = String(b["Khách mời"] || "").toLowerCase().replace(/^'/, '');
        return cleanMsnv === currentCleanMsnv || guestListStr.includes(currentEmail);
    });

    const now = new Date(), todayStr = getLocalDateString(now), currentTimeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`, currentTimeInMins = now.getHours() * 60 + now.getMinutes();
    const oneMonthLater = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()), oneMonthLaterStr = getLocalDateString(oneMonthLater);

    const upcomingOrOngoing = myBookings.filter(b => {
        if (b["Ngày họp"] > todayStr && b["Ngày họp"] <= oneMonthLaterStr) return true;
        if (b["Ngày họp"] === todayStr) return cleanTime(b["Kết thúc"]) >= currentTimeStr;
        return false;
    });
    
    if (upcomingOrOngoing.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    let displayList = isMyBookingsExpanded ? upcomingOrOngoing : upcomingOrOngoing.slice(0, 3);

    if (toggleBtn) {
        if (upcomingOrOngoing.length > 3) {
            toggleBtn.classList.remove('hidden');
            toggleBtn.innerHTML = isMyBookingsExpanded ? `<span class="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wide"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg> Thu gọn</span>` : `<span class="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wide">Xem thêm (+${upcomingOrOngoing.length - 3}) <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>`;
        } else toggleBtn.classList.add('hidden');
    }
    container.innerHTML = displayList.map(b => buildUserCardHTML(b, todayStr, currentTimeStr, currentTimeInMins)).join('');
}

function openGuestModal(rowIndex) {
    const b = allBookings.find(item => item.rowIndex === rowIndex);
    if (!b || !currentUser) return;
    
    editingMeetingRowIndex = rowIndex;
    const isCreator = String(b["Mã NV"]).replace(/^'/, '') === currentUser.msnv, creatorFullInfo = String(b["Người đăng ký"]).replace(/^'/, '');
    
    let cName = creatorFullInfo, cDept = '';
    if(creatorFullInfo.includes(' - ')) { const parts = creatorFullInfo.split(' - '); cName = parts[0].trim(); cDept = parts.slice(1).join(' - ').trim(); }

    document.getElementById('glCreatorContainer').innerHTML = `<div class="flex items-center gap-3 p-2.5 bg-blue-50/60 rounded-xl border border-blue-100"><div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">${cName.charAt(0).toUpperCase()}</div><div><div class="text-sm font-bold text-slate-700">${cName}</div><div class="text-[10px] text-slate-500">${cDept || 'Người tổ chức'}</div></div></div>`;
    
    const rawGuests = String(b["Khách mời"] || "").replace(/^'/, '');
    modalSelectedGuests = rawGuests ? rawGuests.split(',').map(e => e.trim()).filter(e => e) : [];
    renderGuestTagsInModal();
    
    const editSection = document.getElementById('glEditSection');
    let canEditGuest = isCreator; const isAdminOrEditor = currentUser.role === 'Admin' || currentUser.role === 'Editor';

    if (canEditGuest && !isAdminOrEditor) {
        const now = new Date(), todayStr = getLocalDateString(now), currentTimeInMins = now.getHours() * 60 + now.getMinutes();
        if (b["Ngày họp"] < todayStr) canEditGuest = false;
        else if (b["Ngày họp"] === todayStr) {
            const startParts = cleanTime(b["Bắt đầu"]).split(':'), startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
            if (currentTimeInMins + BLOCK_EDIT_MINUTES > startMins) canEditGuest = false;
        }
    }
    
    if(canEditGuest || isAdminOrEditor) editSection.classList.remove('hidden'); else editSection.classList.add('hidden');
    const modal = document.getElementById('guestListModal'); if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

function renderGuestTagsInModal() {
    const container = document.getElementById('glListContainer'); if(!container) return;
    if(modalSelectedGuests.length === 0) { container.innerHTML = '<p class="text-center text-slate-400 py-4 text-sm italic">Không có khách mời nội bộ.</p>'; return; }

    let isCreator = false, isLockedFromEdit = false;
    if(editingMeetingRowIndex) {
        const b = allBookings.find(item => item.rowIndex === editingMeetingRowIndex);
        if (b && String(b["Mã NV"]).replace(/^'/, '') === currentUser.msnv) isCreator = true;
        if (b) {
            const now = new Date(), todayStr = getLocalDateString(now), currentTimeInMins = now.getHours() * 60 + now.getMinutes();
            if (b["Ngày họp"] < todayStr) isLockedFromEdit = true;
            else if (b["Ngày họp"] === todayStr) {
                const startParts = cleanTime(b["Bắt đầu"]).split(':'), startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
                if (currentTimeInMins + BLOCK_EDIT_MINUTES > startMins) isLockedFromEdit = true;
            }
        }
    }
    
    const isAdminOrEditor = currentUser.role === 'Admin' || currentUser.role === 'Editor';
    const canRemoveGuest = (isCreator && !isLockedFromEdit) || isAdminOrEditor;

    container.innerHTML = modalSelectedGuests.map(email => {
        const user = allUsersBasicList.find(u => u.email === email), name = user ? user.name : email.split('@')[0], dept = user && user.dept ? user.dept : 'Khách mời';
        return `<div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">${name.charAt(0).toUpperCase()}</div><div><div class="text-sm font-bold text-slate-700">${name}</div><div class="text-[10px] text-slate-500">${dept}</div></div></div>
                ${canRemoveGuest ? `<button type="button" onclick="removeGuest('${email}', true)" class="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
            </div>`;
    }).join('');
}

function addGuestToModal(email, name) { 
    if (!modalSelectedGuests.includes(email)) modalSelectedGuests.push(email); 
    document.getElementById('glSearchInput').value = ''; 
    document.getElementById('glSuggestions').classList.add('hidden'); 
    renderGuestTagsInModal(); 
}

async function saveGuestModalChanges() {
    if(!editingMeetingRowIndex) return;
    const newGuestsStr = modalSelectedGuests.join(',');
    toggleLoading(true);
    const res = await apiCall('updateMeetingGuests', { rowIndex: editingMeetingRowIndex, guestsStr: newGuestsStr });
    toggleLoading(false);
    if (res && res.success) { showToast("Cập nhật danh sách khách mời thành công!", "success"); closeModals(); loadData(); } 
    else showToast("Lỗi: " + (res ? res.error : "Không thể cập nhật"), "error");
}


// ----------------------------------------------------------------------------
// PHẦN 2: LOGIC TRANG EDITOR (Gộp từ editor.js)
// ----------------------------------------------------------------------------
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
        closeModals(); loadData();
    } else {
        if (res && res.error && res.error.includes("vừa bị người khác đặt")) {
            const eModal = document.getElementById('errorModal'), eMsg = document.getElementById('errorModalMsg');
            if (eMsg) eMsg.innerText = res.error;
            if (eModal) { eModal.classList.remove('hidden'); eModal.classList.add('flex'); }
            closeModals(); loadData();    
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

async function confirmAdminDelete(idx, directReason = null) {
    let reason = directReason;
    if (reason === null) {
        reason = prompt("Bạn đang hủy lịch dưới quyền Quản trị.\nVui lòng nhập LÝ DO hủy lịch để lưu vào Log lịch sử:");
        if (reason === null) return; 
        if (reason.trim() === "") { showToast("Bắt buộc phải nhập lý do hủy lịch!", "error"); return; }
    }

    toggleLoading(true);
    const editorEmail = currentUser ? currentUser.email : "", editorName = currentUser ? currentUser.name : ""; 
    const res = await apiCall('deleteBooking', { rowIndex: idx, reason: reason, editorEmail: editorEmail, editorName: editorName });
    toggleLoading(false);
    if (res.success) { showToast("Đã xóa lịch họp thành công!", "success"); loadData(); }
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

// ----------------------------------------------------------------------------
// PHẦN 3: LOGIC TRANG ADMIN QUẢN TRỊ USER (Gộp từ admin.js)
// ----------------------------------------------------------------------------
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
// ============================================================================
// USER.JS - GIAO DIỆN VÀ TƯƠNG TÁC CHO NGƯỜI DÙNG BÌNH THƯỜNG (INDEX.HTML)
// ============================================================================

let fpInstance = null; // Biến lưu instance của Flatpickr

// ----------------------------------------------------------------------------
// KHỞI TẠO TỰ ĐỘNG
// ----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    initUserPage();
});

// ----------------------------------------------------------------------------
// LOGIC TRANG USER
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
        initFlatpickr(); 
        
        loadData(); 
        startBackgroundSync();
        
        initGuestSearch('guestSearchInput', 'guestSuggestions', addGuestToForm);
        
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

// ==========================================
// CẤU HÌNH ĐẶT LỊCH NHIỀU NGÀY (FLATPICKR)
// ==========================================
function initFlatpickr() {
    const multiDateInput = document.getElementById("multiDateInput");
    if (!multiDateInput) return; // Nếu không có ở trang admin/editor

    const now = new Date();
    const maxDate = new Date();
    maxDate.setDate(now.getDate() + 31); // Tối đa 31 ngày tới

    fpInstance = flatpickr("#multiDateInput", {
        mode: "multiple",
        locale: "vn",
        dateFormat: "Y-m-d",
        minDate: "today",
        maxDate: maxDate,
        disable: [
            function(date) {
                return (date.getDay() === 0); // Vô hiệu hóa Chủ nhật
            }
        ],
        onChange: function(selectedDates, dateStr, instance) {
            // Ràng buộc tối đa 6 ngày
            if (selectedDates.length > 6) {
                showToast("Chỉ được chọn tối đa 6 ngày!", "error");
                selectedDates.pop(); 
                instance.setDate(selectedDates);
            }
            // Khóa các ngày còn lại nếu đã đủ 6
            if (selectedDates.length === 6) {
                instance.set('disable', [
                    function(date) {
                        const isSunday = date.getDay() === 0;
                        const isSelected = selectedDates.some(d => d.getTime() === date.getTime());
                        return isSunday || !isSelected; 
                    }
                ]);
            } else {
                instance.set('disable', [ function(date) { return date.getDay() === 0; } ]);
            }
            updateStartTimes();
        }
    });
}

function toggleMultiDate() {
    const isChecked = document.getElementById('multiDateCheck').checked;
    const singleSelect = document.getElementById('dateSelect');
    const multiInput = document.getElementById('multiDateInput');

    if (isChecked) {
        singleSelect.classList.add('hidden');
        singleSelect.required = false;
        singleSelect.name = ""; // Xóa name để không bị gửi đi
        
        multiInput.classList.remove('hidden');
        multiInput.required = true;
        multiInput.name = "dates"; // Dùng 'dates' cho nhiều ngày
        
        if(fpInstance) fpInstance.clear();
    } else {
        singleSelect.classList.remove('hidden');
        singleSelect.required = true;
        singleSelect.name = "date";
        
        multiInput.classList.add('hidden');
        multiInput.required = false;
        multiInput.name = "";
    }
    updateStartTimes(); 
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

// Logic xử lý Kết thúc sớm cuộc họp
async function handleEndEarly(rowIndex) {
    const b = allBookings.find(item => item.rowIndex === rowIndex);
    if (!b) return;

    const startParts = cleanTime(b["Bắt đầu"]).split(':');
    const startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    const endParts = cleanTime(b["Kết thúc"]).split(':');
    const endMins = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

    const now = new Date();
    let h = now.getHours();
    let m = now.getMinutes();
    let currentMins = h * 60 + m;

    if (currentMins >= endMins) {
        showToast("Cuộc họp đã kết thúc rồi.", "info");
        return;
    }

    // XỬ LÝ: Nếu bấm trước khi cuộc họp bắt đầu -> Hủy lịch
    if (currentMins < startMins) {
        if (!confirm("Cuộc họp này chưa diễn ra. Việc chọn 'Kết thúc sớm' lúc này sẽ được hệ thống xử lý như HỦY LỊCH (mọi người sẽ nhận được email thông báo hủy). Bạn có chắc chắn muốn hủy?")) return;
        
        closeModals();
        
        // Cập nhật UI lạc quan
        allBookings = allBookings.filter(item => item.rowIndex != rowIndex);
        if (typeof renderMyBookings === 'function') renderMyBookings();
        if (typeof renderSchedule === 'function') renderSchedule();
        if (typeof renderAdminBookings === 'function') renderAdminBookings();

        showToast("Đang tiến hành hủy lịch...", "info");

        const editorEmail = currentUser ? currentUser.email : "";
        const editorName = currentUser ? currentUser.name : ""; 
        
        apiCall('deleteBooking', { 
            rowIndex: rowIndex, 
            reason: "Người dùng bấm kết thúc sớm trước khi cuộc họp diễn ra", 
            editorEmail: editorEmail, 
            editorName: editorName 
        }).then(res => {
            if (res.success) { showToast("Đã hủy lịch họp thành công!", "success"); }
            refreshBookingsData(); 
        });
        
        return;
    }

    // Làm tròn lên mốc 15 phút tiếp theo
    m = Math.ceil(m / 15) * 15;
    if (m === 60) { h += 1; m = 0; }
    if (h >= 17 && m > 0) { h = 17; m = 0; }

    let nextTimeMins = h * 60 + m;
    let nextTimeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    // Nếu mốc tiếp theo lớn hơn hoặc bằng giờ kết thúc ban đầu
    if (nextTimeMins >= endMins) {
         showToast("Thời gian còn lại quá ít, không thể kết thúc sớm hơn được nữa.", "info");
         return;
    }

    if (!confirm(`Xác nhận KẾT THÚC SỚM cuộc họp này vào mốc ${nextTimeStr}?\nThời gian khả dụng còn lại của phòng sẽ được giải phóng cho người khác.`)) return;

    closeModals();
    toggleLoading(true);

    // Giao diện Lạc quan (Optimistic UI)
    b["Kết thúc"] = nextTimeStr;
    renderMyBookings();
    renderSchedule();

    const res = await apiCall('endEarlyBooking', {
        rowIndex: rowIndex,
        newEndTime: nextTimeStr,
        editorName: currentUser ? currentUser.name : ""
    });

    toggleLoading(false);
    if (res.success) {
        showToast("Đã kết thúc cuộc họp sớm thành công!", "success");
        refreshBookingsData(); // Chạy nền đảm bảo đồng bộ
    } else {
        showToast(res.error, "error");
        refreshBookingsData(); // Rollback nếu lỗi
    }
}

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

    html += `</div>`;

    if (canEdit) {
        let isLocked = false;
        let canEndEarly = false;

        const startParts = cleanTime(b["Bắt đầu"]).split(':'), startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endParts = cleanTime(b["Kết thúc"]).split(':'), endMins = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
        const now = new Date(), todayStr = getLocalDateString(now), currentTimeInMins = now.getHours() * 60 + now.getMinutes();

        if (!isAdminOrEditor) {
            if (b["Ngày họp"] < todayStr) isLocked = true;
            else if (b["Ngày họp"] === todayStr) {
                if (currentTimeInMins + BLOCK_EDIT_MINUTES > startMins) isLocked = true;
            }
        }

        if (b["Ngày họp"] === todayStr && currentTimeInMins + BLOCK_EDIT_MINUTES > startMins && currentTimeInMins < endMins) {
             canEndEarly = true;
        }

        html += `<div class="flex gap-3 mt-4 pt-4 border-t border-slate-100">`;
        if (canEndEarly) {
            html += `<button onclick="handleEndEarly(${b.rowIndex})" class="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-md shadow-red-200 transition-colors flex items-center justify-center gap-1.5"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path></svg> Kết thúc sớm</button>`;
        } else if (!isLocked) {
            const editAction = isAdminOrEditor ? `window.location.href='editor.html?action=edit&eventId=${String(b['Event ID']||b['EventID']).replace(/^'/,'')}';` : `closeModals(); prepareEdit(${b.rowIndex})`;
            html += `<button onclick="${editAction}" class="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold shadow-md shadow-blue-200 transition-colors flex items-center justify-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Sửa Lịch</button>`;
        }
        html += `</div>`;
    }

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
            <button onclick="registerFromStatusModal('${roomName}', '${targetDateStr}', '${prefillTimeStr || ''}')" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-200 transition-colors">Đăng ký lịch</button>
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
    const isMultiCheck = document.getElementById('multiDateCheck');
    const isMulti = isMultiCheck ? isMultiCheck.checked : false;
    
    const dateEl = document.getElementById('dateSelect'), roomEl = document.getElementById('roomSelect'), timeContainer = document.getElementById('timeContainer'), startEl = document.getElementById('startSelect'), endEl = document.getElementById('endSelect');
    const multiDates = document.getElementById('multiDateInput') ? document.getElementById('multiDateInput').value : '';
    
    if(!dateEl || !roomEl || !timeContainer || !startEl || !endEl) return;
    
    const date = dateEl.value, room = roomEl.value;
    
    if (!room || (!isMulti && !date) || (isMulti && !multiDates)) { 
        timeContainer.classList.add('hidden'); 
        return; 
    }
    timeContainer.classList.remove('hidden');
    
    let options = '<option value="">Chọn giờ</option>';
    
    if (!isMulti) {
        const editId = document.getElementById('editRowIndex') ? document.getElementById('editRowIndex').value : '';
        const bookedRanges = allBookings.filter(b => b["Ngày họp"] === date && b["Phòng họp"] === room && b.rowIndex != editId);
        
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
    } else {
        for (let h = 8; h <= 16; h++) {
            for (let m of [0, 15, 30, 45]) {
                let timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                options += `<option value="${timeStr}">${timeStr}</option>`;
            }
        }
    }
    
    startEl.innerHTML = options; endEl.innerHTML = '<option value="">--</option>'; 
}

function updateEndTimes() {
    const isMultiCheck = document.getElementById('multiDateCheck');
    const isMulti = isMultiCheck ? isMultiCheck.checked : false;

    const startEl = document.getElementById('startSelect'), dateEl = document.getElementById('dateSelect'), roomEl = document.getElementById('roomSelect'), endEl = document.getElementById('endSelect');
    if(!startEl || !dateEl || !roomEl || !endEl) return;
    
    const startTime = startEl.value, date = dateEl.value, room = roomEl.value;
    if (!startTime) { endEl.innerHTML = '<option value="">--</option>'; return; }
    
    let options = '<option value="">Chọn giờ</option>';
    let startMin = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
    let limitEnd = "17:00";

    if (!isMulti) {
        const editId = document.getElementById('editRowIndex') ? document.getElementById('editRowIndex').value : '';
        const bookedRanges = allBookings.filter(b => b["Ngày họp"] === date && b["Phòng họp"] === room && b.rowIndex != editId).sort((a, b) => cleanTime(a["Bắt đầu"]).localeCompare(cleanTime(b["Bắt đầu"])));
        const nextBooking = bookedRanges.find(b => cleanTime(b["Bắt đầu"]) > startTime);
        if (nextBooking) limitEnd = cleanTime(nextBooking["Bắt đầu"]);
    }
    
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
        resetEditState(); 
        
        if(typeof applyOptimisticUI === 'function') applyOptimisticUI(formData);
        
        refreshBookingsData(); 
    } else {
        if (res && res.error && (res.error.includes("vừa bị người khác đặt") || res.error.includes("đã có người đặt"))) {
            const eModal = document.getElementById('errorModal'), eMsg = document.getElementById('errorModalMsg');
            if (eMsg) eMsg.innerText = res.error;
            if (eModal) { eModal.classList.remove('hidden'); eModal.classList.add('flex'); }
            
            const isMultiCheck = document.getElementById('multiDateCheck');
            if (!(isMultiCheck && isMultiCheck.checked)) resetEditState();
            refreshBookingsData();
        } else { showToast("Lỗi: " + (res ? res.error : "Không thể lưu"), "error"); }
    }
}

function checkUrgent(dateStr, startStr) {
    if (!dateStr || !startStr) return false;
    const parts = dateStr.split('-'), timeParts = startStr.split(':');
    if(parts.length !== 3) return false;
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
    if (formData.dates) {
        const datesArr = formData.dates.split(',');
        displayDate = datesArr.map(d => {
            const p = d.trim().split('-');
            return p.length === 3 ? `${p[2]}/${p[1]}` : d;
        }).join(', ');
    } else if (formData.date) {
        const parts = formData.date.split('-');
        if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    const isUrgent = (!formData.dates && checkUrgent(formData.date, formData.start));
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
    
    const multiCheck = document.getElementById('multiDateCheck');
    const multiToggleWrapper = document.getElementById('multiDateToggleWrapper');
    if (multiCheck && multiToggleWrapper) {
        multiCheck.checked = false;
        multiToggleWrapper.classList.add('hidden'); 
        toggleMultiDate();
    }

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

    const multiCheck = document.getElementById('multiDateCheck');
    const multiToggleWrapper = document.getElementById('multiDateToggleWrapper');
    if (multiCheck && multiToggleWrapper) {
        multiCheck.checked = false;
        multiToggleWrapper.classList.remove('hidden');
        toggleMultiDate(); 
    }
}

function confirmDelete(idx, directReason = null) {
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

    closeModals(); 

    allBookings = allBookings.filter(b => b.rowIndex != idx);
    if (typeof renderMyBookings === 'function') renderMyBookings();
    if (typeof renderSchedule === 'function') renderSchedule();
    if (typeof renderAdminBookings === 'function') renderAdminBookings();

    showToast("Đang xóa lịch họp...", "info");

    const editorEmail = currentUser ? currentUser.email : "", editorName = currentUser ? currentUser.name : ""; 
    
    apiCall('deleteBooking', { rowIndex: idx, reason: reason, editorEmail: editorEmail, editorName: editorName })
        .then(res => {
            if (res.success) { showToast("Đã xóa lịch họp thành công!", "success"); }
            refreshBookingsData(); 
        });
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
    
    let currentMeetingStartMins = 0, currentMeetingEndMins = 0;
    if (b["Bắt đầu"] && b["Kết thúc"]) {
         const startParts = cleanTime(b["Bắt đầu"]).split(':');
         currentMeetingStartMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
         const endParts = cleanTime(b["Kết thúc"]).split(':');
         currentMeetingEndMins = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
    }

    if (isAdminOrEditor) {
        showEditBtn = true; 
    } else {
        if (isMine) {
            let isLocked = false;
            if (b["Ngày họp"] < todayStr) isLocked = true;
            else if (b["Ngày họp"] === todayStr) {
                if (currentTimeInMins + BLOCK_EDIT_MINUTES > currentMeetingStartMins) isLocked = true; 
            }
            
            if (isLocked) {
                showViewBtn = true;
            } else {
                showEditBtn = true;
            }
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
        actionBtns = `<div class="flex shrink-0 items-center justify-end ml-3 pl-3 border-l border-slate-200/70"><button onclick="handleMeetingClick(${b.rowIndex})" title="Xem thông tin" class="p-0.5 text-orange-500 hover:text-orange-700 hover:bg-orange-100 rounded-lg transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg></button></div>`;
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
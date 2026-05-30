// ============================================================================
// BOOKINGS.JS - QUẢN LÝ DANH SÁCH LỊCH CÁ NHÂN VÀ CÁC THAO TÁC HỦY/KẾT THÚC
// ============================================================================

/**
 * Biến trạng thái Tab hiện tại của phần "Lịch của tôi"
 * Mặc định là 'upcoming' (Sắp tới)
 */
let currentMyBookingsTab = 'upcoming';

/**
 * CHUYỂN ĐỔI TAB LỊCH CỦA TÔI (SẮP TỚI / LỊCH SỬ)
 * Nhiệm vụ: Thay đổi trạng thái hiển thị và nạp dữ liệu lịch sử nếu cần.
 */
async function switchMyBookingsTab(tab) {
    currentMyBookingsTab = tab;
    
    // Cập nhật UI cho các nút Tab
    const upBtn = document.getElementById('myUpcomingTab');
    const hiBtn = document.getElementById('myHistoryTab');
    
    const activeClass = "flex-1 py-2 text-xs font-bold bg-white text-blue-600 shadow-sm rounded-lg transition-all";
    const inactiveClass = "flex-1 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all";
    
    if (upBtn) upBtn.className = (tab === 'upcoming' ? activeClass : inactiveClass);
    if (hiBtn) hiBtn.className = (tab === 'history' ? activeClass : inactiveClass);

    // Nạp dữ liệu lịch sử từ Server nếu chọn tab Lịch sử và chưa có dữ liệu
    if (tab === 'history' && historyBookings.length === 0) {
        toggleLoading(true);
        const res = await apiCall('getHistoryBookings');
        if (Array.isArray(res)) {
            historyBookings = res;
        } else {
            showToast("Không thể tải dữ liệu lịch sử.", "error");
        }
        toggleLoading(false);
    }
    
    // Reset trạng thái thu gọn/mở rộng khi chuyển tab
    isMyBookingsExpanded = false;
    renderMyBookings();
}

/**
 * Tính năng "Kết thúc sớm": Giải phóng phòng trước thời hạn đăng ký.
 */
async function handleEndEarly(rowIndex) {
    const b = allBookings.find(item => item.rowIndex === rowIndex);
    if (!b) return;

    const startParts = cleanTime(b["start_time"]).split(':');
    const startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    const endParts = cleanTime(b["end_time"]).split(':');
    const endMins = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

    const now = new Date();
    let h = now.getHours();
    let m = now.getMinutes();
    let currentMins = h * 60 + m;

    if (currentMins >= endMins) {
        showToast("Cuộc họp đã kết thúc rồi.", "info");
        return;
    }

    if (currentMins < startMins) {
        if (!confirm("Cuộc họp này chưa diễn ra. Việc chọn 'Kết thúc sớm' lúc này sẽ được hệ thống xử lý như HỦY LỊCH (mọi người sẽ nhận được email thông báo hủy). Bạn có chắc chắn muốn hủy?")) return;
        
        closeModals();
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

    m = Math.floor(m / 15) * 15;
    let nextTimeMins = h * 60 + m;
    let nextTimeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    if (nextTimeMins >= endMins) {
         showToast("Thời gian còn lại quá ít, không thể kết thúc sớm hơn được nữa.", "info");
         return;
    }

    if (!confirm(`Xác nhận KẾT THÚC SỚM cuộc họp này vào mốc ${nextTimeStr}?\nThời gian khả dụng còn lại của phòng sẽ được giải phóng cho người khác.`)) return;

    closeModals();
    toggleLoading(true);
    b["end_time"] = nextTimeStr;
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
        refreshBookingsData(); 
    } else {
        showToast(res.error, "error");
        refreshBookingsData(); 
    }
}

/**
 * Hiển thị Modal xem nhanh chi tiết cuộc họp khi click vào khối màu trên lưới.
 * Cải tiến: Thêm nút "Tải thêm tài liệu" cho khách mời hoặc khi lịch bị khóa sửa.
 */
async function handleMeetingClick(rowIndex) {
    // Tìm trong cả danh sách hiện hành và lịch sử
    let b = allBookings.find(item => item.rowIndex === rowIndex);
    if (!b) b = historyBookings.find(item => item.rowIndex === rowIndex);
    
    if (!b || !currentUser) { showToast("Cuộc họp này không còn tồn tại hoặc đã bị thay đổi.", "error"); return; }

    const isCreator = String(b["employee_id"]).replace(/^'/, '') === String(currentUser.msnv).replace(/^'/, '');
    const isAdminOrEditor = currentUser.role === 'Admin' || currentUser.role === 'Editor';
    const rawGuests = String(b["guest_email"] || "").toLowerCase().replace(/^'/, '');
    const isGuest = rawGuests.includes(currentUser.email.toLowerCase());

    const canEdit = isCreator || isAdminOrEditor; // Chỉ người tạo hoặc Admin/Editor mới được phép sửa lịch
    const isAuthorized = isCreator || isGuest || isAdminOrEditor; // Người tạo, khách mời hoặc Admin/Editor mới được xem chi tiết và tải tài liệu

    const title = String(b["title"]).replace(/^'/, '');
    const creatorStr = String(b["user_name"]).replace(/^'/, '');
    const room = b["room_name"];
    const timeStr = `${cleanTime(b["start_time"])} - ${cleanTime(b["end_time"])}`;
    const customEventID = String(b["event_id"]).replace(/^'/, '');
    const meetLink = b["meet_link"] ? String(b["meet_link"]).replace(/^'/, '') : "";

    let guestNamesStr = '<span class="text-slate-400 italic font-normal">Không có</span>';
    const guestEmails = rawGuests ? rawGuests.split(',').map(e => e.trim()).filter(e => e) : [];
    if (guestEmails.length > 0) {
        const guestNames = guestEmails.map(email => { const user = allUsersBasicList.find(u => u.email.toLowerCase() === email.toLowerCase()); return user ? user.name : email.split('@')[0]; });
        guestNamesStr = guestNames.join(', ');
    }

    const rawNotes = b["notes"] ? String(b["notes"]).replace(/^'/, '') : 'Không'; // Cải tiến: Hiển thị yêu cầu đặc biệt nếu có, với định dạng rõ ràng hơn và hỗ trợ xuống dòng
    const notes = linkify(rawNotes);
    const modalContent = document.getElementById('scheduleModalContent');

    let html = `
        <h3 class="font-bold text-lg text-slate-800 mb-4 pb-3 border-b border-slate-100 flex items-start gap-2">
            <span class="w-2 h-6 bg-indigo-500 rounded-full mt-0.5"></span> ${title}
        </h3>
        <div class="space-y-3 text-sm text-slate-600 mb-6">
            <div class="flex gap-2"><svg class="w-4 h-4 mt-0.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg> <span class="font-medium text-slate-800">${room}</span></div>
            <div class="flex gap-2"><svg class="w-4 h-4 mt-0.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> <span class="font-medium text-slate-800">${timeStr}</span></div>
            <div class="flex gap-2"><svg class="w-4 h-4 mt-0.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg> <span>Tạo bởi: <span class="font-medium">${creatorStr}</span></span></div>
    `;

    if (canEdit || isGuest) {
        html += `
            <div class="flex gap-2 items-start"><svg class="w-4 h-4 mt-0.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg> <span>Khách mời: ${guestNamesStr}</span></div>
            ${b["notes"] ? `<div class="flex gap-2 items-start p-2 bg-amber-50 rounded text-amber-800 text-[13px]"><svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg> <span>Ghi chú/Yêu cầu: <span class="font-medium whitespace-pre-line">${notes}</span></span></div>` : ''}
        `;
    }

    if (meetLink && isAuthorized) {
        html += `
            <div class="mt-4 pt-4 border-t border-slate-100 space-y-2">
                <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Họp trực tuyến:</p>
                <div class="grid grid-cols-2 gap-2">
                    <a href="${meetLink}" target="_blank" class="flex items-center justify-center gap-2 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M15 8v8H5V8h10m1-2H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4V7c0-.55-.45-1-1-1z"/></svg>
                        <span class="text-xs font-bold">Tham gia Meet</span>
                    </a>
                    <button onclick="copyToClipboard('${meetLink}')" class="flex items-center justify-center gap-2 p-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors border border-slate-200">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                        <span class="text-xs font-bold">Copy Link</span>
                    </button>
                </div>
            </div>
        `;
    }

    html += `<div id="meetingExtraInfo" class="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <div class="flex items-center justify-center py-4"><div class="loader ease-linear rounded-full border-2 border-t-2 border-slate-200 h-5 w-5 mr-2"></div><span class="text-xs text-slate-400 font-medium">Đang tải tài liệu...</span></div>
             </div>`;

    html += `</div>`;

    const isHistory = historyBookings.some(item => item.rowIndex === rowIndex);

    if (!isHistory) {
        let isLocked = false;
        let canEndEarly = false;

        const startParts = cleanTime(b["start_time"]).split(':'), startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endParts = cleanTime(b["end_time"]).split(':'), endMins = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
        const now = new Date(), todayStr = getLocalDateString(now), currentTimeInMins = now.getHours() * 60 + now.getMinutes();

        if (!isAdminOrEditor) {
            if (b["meeting_date"] < todayStr) isLocked = true;
            else if (b["meeting_date"] === todayStr) {
                if (currentTimeInMins + BLOCK_EDIT_MINUTES > startMins) isLocked = true;
            }
        }

        if (isCreator && b["meeting_date"] === todayStr && currentTimeInMins + BLOCK_EDIT_MINUTES > startMins && currentTimeInMins < endMins) {
             canEndEarly = true;
        }

        html += `<div class="flex gap-3 mt-4 pt-4 border-t border-slate-100">`;
        
        // --- LOGIC NÚT HÀNH ĐỘNG CẢI TIẾN ---
        if (canEndEarly) {
            html += `<button onclick="handleEndEarly(${b.rowIndex})" class="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-md shadow-red-200 transition-colors flex items-center justify-center gap-1.5"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path></svg> Kết thúc sớm</button>`;
        } else if (canEdit && !isLocked) {
            // Người tạo/Admin khi chưa bị khóa: Nút Sửa
            html += `<button onclick="closeModals(); prepareEdit(${b.rowIndex}, false)" class="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold shadow-md shadow-blue-200 transition-colors flex items-center justify-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Sửa Lịch</button>`;
        } else if ((canEdit && isLocked) || isGuest) {
            // Người tạo khi đã bị khóa HOẶC Khách mời: Nút Tải thêm tài liệu
            html += `<button onclick="closeModals(); prepareEdit(${b.rowIndex}, true)" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-200 transition-colors flex items-center justify-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> Tải thêm tài liệu</button>`;
        }
        
        html += `</div>`;
    }

    modalContent.innerHTML = html;
    const modal = document.getElementById('scheduleInteractionModal');
    modal.classList.remove('hidden'); modal.classList.add('flex');

    if (customEventID && isAuthorized) {
        const attachments = await apiCall('getMeetingAttachments', { customEventID: customEventID });
        const extraInfoDiv = document.getElementById('meetingExtraInfo');
        if (extraInfoDiv) {
            if (attachments && attachments.length > 0) {
                let extraHtml = `<div class="space-y-2">
                    <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tài liệu cuộc họp:</p>
                    <div class="grid grid-cols-1 gap-2">`;
                attachments.forEach(file => {
                    extraHtml += `<a href="${file.url}" target="_blank" class="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 hover:bg-emerald-100 transition-colors">
                        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <span class="text-xs font-bold truncate">${file.name}</span>
                    </a>`;
                });
                extraHtml += `</div></div>`;
                extraInfoDiv.innerHTML = extraHtml;
            } else {
                extraInfoDiv.innerHTML = `<p class="text-center text-[11px] text-slate-400 italic">Không có tài liệu đính kèm.</p>`;
            }
        }
    } else {
        const extraInfoDiv = document.getElementById('meetingExtraInfo');
        if (extraInfoDiv) extraInfoDiv.innerHTML = "";
    }
}

/**
 * Hiển thị xác nhận và gọi API xóa lịch họp khỏi hệ thống.
 */
function confirmDelete(idx, directReason = null) {
    let reason = "";
    
    if (directReason !== null && directReason.trim() !== "") {
        reason = directReason;
    } else {
        reason = prompt("XÁC NHẬN HỦY LỊCH\nVui lòng nhập lý do hủy lịch để gửi thông báo cho khách mời:");
        
        if (reason === null) return; 
        if (reason.trim() === "") {
            showToast("Bắt buộc phải nhập lý do hủy lịch để tiếp tục!", "error");
            return;
        }
    }

    closeModals(); 

    allBookings = allBookings.filter(b => b.rowIndex != idx);
    if (typeof renderMyBookings === 'function') renderMyBookings();
    if (typeof renderSchedule === 'function') renderSchedule();
    if (typeof renderAdminBookings === 'function') renderAdminBookings();

    showToast("Đang tiến hành hủy lịch...", "info");

    const editorEmail = currentUser ? currentUser.email : "";
    const editorName = currentUser ? currentUser.name : ""; 
    
    apiCall('deleteBooking', { 
        rowIndex: idx, 
        reason: reason, 
        editorEmail: editorEmail, 
        editorName: editorName 
    }).then(res => {
        if (res.success) { 
            showToast("Đã hủy lịch họp thành công!", "success"); 
        } else {
            showToast(res.error, "error");
        }
        refreshBookingsData(); 
    });
}

/**
 * Xử lý sự kiện Hủy lịch từ nút bấm trong Form chỉnh sửa.
 */
function handleDeleteFromForm() {
    const idx = document.getElementById('editRowIndex').value;
    const reasonInput = document.getElementById('fReason').value;
    
    if (idx) { 
        if (!reasonInput || reasonInput.trim() === "") {
            showToast("Vui lòng nhập Lý do thay đổi/hủy lịch (*)", "error");
            document.getElementById('fReason').focus();
            return;
        }
        confirmDelete(idx, reasonInput); 
        resetEditState(); 
    }
}

/**
 * Chuyển đổi trạng thái xem nhiều/ít của phần "Lịch của tôi".
 */
function toggleMyBookingsView() { isMyBookingsExpanded = !isMyBookingsExpanded; renderMyBookings(); }

/**
 * Tạo mã HTML cho từng Card lịch họp trong danh sách của người dùng.
 * CẢI TIẾN: Bỏ icon sửa/xem, cho phép click vào tiêu đề để mở Modal chi tiết.
 */
function buildUserCardHTML(b, todayStr, currentTimeStr, currentTimeInMins) {
    if (!currentUser) return '';
    const cleanMsnv = String(b["employee_id"]).replace(/^'/, ''), currentCleanMsnv = String(currentUser.msnv).replace(/^'/, '');
    const isMine = cleanMsnv === currentCleanMsnv, guestListStr = String(b["guest_email"] || "").replace(/^'/, '');
    const isGuest = guestListStr.toLowerCase().includes(currentUser.email.toLowerCase());

    let cardBg = "bg-white", borderColor = "border-slate-100", leftBarColor = "#94a3b8"; 
    if (isMine) { cardBg = "bg-blue-50/20"; borderColor = "border-blue-100"; leftBarColor = "#3b82f6"; } 
    else if (isGuest) { cardBg = "bg-purple-50/20"; borderColor = "border-purple-100"; leftBarColor = "#a855f7"; } 
    else { leftBarColor = DISTINCT_COLORS[b.rowIndex % DISTINCT_COLORS.length]; }
    
    const title = String(b["title"]).replace(/^'/, '');

    // Thêm logic kiểm tra xem cuộc họp hôm nay đã kết thúc chưa
    const isFinished = (b["meeting_date"] === todayStr && cleanTime(b["end_time"]) < currentTimeStr);
    // Nếu đã kết thúc, thêm class làm mờ (opacity)
    let opacityClass = isFinished ? "opacity-60 grayscale-[0.5]" : "";

    return `<div class="${opacityClass} py-3.5 pr-3.5 pl-4 ${cardBg} shadow-sm rounded-2xl border ${borderColor} flex flex-col relative overflow-hidden hover:shadow-md transition-all">
        <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${leftBarColor}"></div>
        <div class="text-center w-full pb-2 mb-2 border-b border-slate-200/70">
            <h3 onclick="handleMeetingClick(${b.rowIndex})" 
                class="font-semibold text-sm sm:text-base break-words leading-tight cursor-pointer hover:text-blue-800 hover:underline transition-all" 
                style="color: #073763;" 
                title="Nhấn để xem chi tiết: ${title}">
                ${title}
            </h3>
        </div>
        <div class="flex justify-between items-center w-full">
            <div class="flex flex-col gap-1 text-xs min-w-0 flex-1">
                <span class="font-semibold text-slate-700 truncate text-[13px]">${b["room_name"]}</span>
                <span class="text-slate-600 font-normal truncate">${formatMeetingDisplay(b["meeting_date"], b["start_time"], b["end_time"])}</span>
            </div>
        </div>
    </div>`;
}

/**
 * Hiển thị danh sách các cuộc họp mà người dùng hiện tại tham gia (Người tạo hoặc Khách mời).
 */
function renderMyBookings() {
    if (!currentUser) return;
    const container = document.getElementById('myBookingsList'), section = document.getElementById('myBookingsSection'), toggleBtn = document.getElementById('toggleMyBookingsBtn');
    if(!container || !section) return;

    const currentCleanMsnv = String(currentUser.msnv).replace(/^'/, ''), currentEmail = currentUser.email.toLowerCase();
    
    let filteredList = [];
    const now = new Date(), todayStr = getLocalDateString(now), currentTimeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`, currentTimeInMins = now.getHours() * 60 + now.getMinutes();

    if (currentMyBookingsTab === 'upcoming') {
        const oneMonthLater = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()), oneMonthLaterStr = getLocalDateString(oneMonthLater);
        filteredList = allBookings.filter(b => {
            const cleanMsnv = String(b["employee_id"]).replace(/^'/, ''), guestListStr = String(b["guest_email"] || "").toLowerCase().replace(/^'/, '');
            const isParticipant = (cleanMsnv === currentCleanMsnv || guestListStr.includes(currentEmail));
            if (!isParticipant) return false;
            
            if (b["meeting_date"] > todayStr && b["meeting_date"] <= oneMonthLaterStr) return true;
            if (b["meeting_date"] === todayStr) return true;
            return false;
        });
    } else {
        filteredList = historyBookings.filter(b => {
            const cleanMsnv = String(b["employee_id"]).replace(/^'/, ''), guestListStr = String(b["guest_email"] || "").toLowerCase().replace(/^'/, '');
            return (cleanMsnv === currentCleanMsnv || guestListStr.includes(currentEmail));
        });
    }
    
    if (filteredList.length === 0 && currentMyBookingsTab === 'upcoming') { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    if (filteredList.length === 0 && currentMyBookingsTab === 'history') {
        container.innerHTML = '<p class="text-center text-slate-400 py-6 text-sm italic">Không có dữ liệu lịch sử trong 30 ngày qua.</p>';
        if (toggleBtn) toggleBtn.classList.add('hidden');
        return;
    }

    let displayList = isMyBookingsExpanded ? filteredList : filteredList.slice(0, 3);

    if (toggleBtn) {
        if (filteredList.length > 3) {
            toggleBtn.classList.remove('hidden');
            toggleBtn.innerHTML = isMyBookingsExpanded ? `<span class="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wide"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg> Thu gọn</span>` : `<span class="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wide">Xem thêm (+${filteredList.length - 3}) <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>`;
        } else toggleBtn.classList.add('hidden');
    }
    container.innerHTML = displayList.map(b => buildUserCardHTML(b, todayStr, currentTimeStr, currentTimeInMins)).join('');
}
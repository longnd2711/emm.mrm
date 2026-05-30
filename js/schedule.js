// ============================================================================
// SCHEDULE.JS - QUẢN LÝ LƯỚI LỊCH BIỂU VÀ TRẠNG THÁI PHÒNG HỌP
// ============================================================================

/**
 * Tạo danh sách ngày cho Select ở phần Lịch biểu tổng.
 */
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

/**
 * Chuyển đổi giữa các nhóm phòng họp trên lưới lịch (Tab 1-2 hoặc Tab 3-SHC).
 */
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

/**
 * Hàm điều phối chính để vẽ lưới lịch biểu cho 2 cột phòng họp hiện tại.
 */
function renderSchedule() {
    if (!currentUser) return; 
    const scheduleDateSelect = document.getElementById('scheduleDateSelect');
    if(!scheduleDateSelect) return;
    const dateStr = scheduleDateSelect.value;
    if (!dateStr) return;

    const room1 = currentScheduleTab === 1 ? APP_ROOMS[0] : APP_ROOMS[2];
    const room2 = currentScheduleTab === 1 ? APP_ROOMS[1] : APP_ROOMS[3];

    const dayBookings = allBookings.filter(b => b["meeting_date"] === dateStr);

    renderScheduleColumn('schedCol1Events', room1, dayBookings, dateStr);
    renderScheduleColumn('schedCol2Events', room2, dayBookings, dateStr);
}

/**
 * Vẽ chi tiết từng cột của phòng họp dựa trên pixel (1 phút = 1px).
 * Tạo các slot trống có thể click và các khối lịch đã được đặt.
 */
function renderScheduleColumn(containerId, roomName, dayBookings, dateStr) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let html = '';
    const totalMinutes = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 60;
    
    /**
     * Hiển thị khu vực nghỉ trưa (12h - 13h) dưới dạng mờ và chặn click.
     */
    const lunchStartMin = (12 - SCHEDULE_START_HOUR) * 60;
    const lunchTop = lunchStartMin * PIXELS_PER_MINUTE;
    const lunchHeight = 60 * PIXELS_PER_MINUTE;
    html += `<div class="absolute w-full bg-slate-200/60 pointer-events-none z-0 flex items-center justify-center text-slate-400 font-bold text-[10px] tracking-widest uppercase" style="top: ${lunchTop}px; height: ${lunchHeight}px;">Nghỉ trưa</div>`;

    /**
     * Tạo các lớp DIV trong suốt để người dùng click đăng ký vào khung giờ trống.
     */
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

    const roomBookings = dayBookings.filter(b => b["room_name"] === roomName);

    /**
     * Vẽ các khối lịch họp (Blocks) dựa trên thời gian bắt đầu và kết thúc.
     */
    roomBookings.forEach(b => {
        const startMins = timeToMinutes(cleanTime(b["start_time"]));
        const endMins = timeToMinutes(cleanTime(b["end_time"]));
        const baselineMins = SCHEDULE_START_HOUR * 60;

        let topPos = (startMins - baselineMins) * PIXELS_PER_MINUTE;
        let height = (endMins - startMins) * PIXELS_PER_MINUTE;

        if (topPos < 0) { height += topPos; topPos = 0; }
        if (topPos + height > totalMinutes * PIXELS_PER_MINUTE) { height = (totalMinutes * PIXELS_PER_MINUTE) - topPos; }
        if (height <= 0) return;

        /**
         * Phân biệt màu sắc: Blue (Của mình), Orange (Được mời), Slate (Khác).
         */
        const isCreator = String(b["employee_id"]).replace(/^'/, '') === String(currentUser.msnv).replace(/^'/, '');
        const rawGuests = String(b["guest_email"] || "").toLowerCase().replace(/^'/, '');
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

        const title = String(b["title"]).replace(/^'/, '');

        html += `<div onclick="handleMeetingClick(${b.rowIndex})" 
                      class="schedule-block absolute left-1 right-1 rounded-md border ${bgClass} overflow-hidden cursor-pointer p-1.5 flex flex-col justify-start z-10"
                      style="top: ${topPos}px; height: ${height}px;"
                      title="${title}">
                      <div class="${textClass}">${title}</div>
                 </div>`;
    });

    container.innerHTML = html;
}

/**
 * Xử lý khi người dùng click vào một slot trống trên lưới lịch.
 */
function handleEmptySlotClick(roomName, dateStr, timeStr) { showRoomStatusModal(roomName, dateStr, timeStr); }

/**
 * Lấy trạng thái chi tiết của phòng tại một thời điểm cụ thể.
 */
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

    const dayBookings = allBookings.filter(b => b["meeting_date"] === targetDateStr && b["room_name"] === roomName);
    dayBookings.sort((a, b) => timeToMinutes(cleanTime(a["start_time"])) - timeToMinutes(cleanTime(b["start_time"])));

    let currentMeeting = null, nextMeeting = null;
    for (let b of dayBookings) {
        const startMins = timeToMinutes(cleanTime(b["start_time"])), endMins = timeToMinutes(cleanTime(b["end_time"]));
        if (refMins >= startMins && refMins < endMins) currentMeeting = b;
        else if (startMins >= refMins && !nextMeeting) nextMeeting = b;
    }
    return { currentMeeting, nextMeeting, isPastView };
}

/**
 * Hiển thị Modal trạng thái phòng và gợi ý đăng ký.
 */
function showRoomStatusModal(roomName, targetDateStr, prefillTimeStr = null) {
    const { currentMeeting, nextMeeting, isPastView } = getRoomStatus(roomName, targetDateStr, prefillTimeStr);
    const dateLabel = getFormattedDateLabel(targetDateStr);

    let currentText = "Trống (Có thể đặt lịch)";
    if (isPastView && !currentMeeting) currentText = "Khung giờ này đã trôi qua";
    else if (currentMeeting) {
        const title = String(currentMeeting["title"]).replace(/^'/, '');
        currentText = `<span class="font-semibold text-blue-700">${cleanTime(currentMeeting["start_time"])}: ${title}</span> | kết thúc ${cleanTime(currentMeeting["end_time"])}`;
    }

    let nextText = "Không có lịch trình tiếp theo";
    if (nextMeeting) {
        const title = String(nextMeeting["title"]).replace(/^'/, '');
        nextText = `Tiếp theo: <span class="font-semibold text-orange-600">${title}</span> | ${cleanTime(nextMeeting["start_time"])} - ${cleanTime(nextMeeting["end_time"])}`;
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

/**
 * Chuyển hướng từ Modal trạng thái sang Form đăng ký với dữ liệu điền sẵn.
 */
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
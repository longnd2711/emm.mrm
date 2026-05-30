// ============================================================================
// MAIN.JS - KHỞI TẠO, ĐIỀU PHỐI HỆ THỐNG VÀ TIỆN ÍCH CHUNG
// ============================================================================

/**
 * Biến lưu trữ instance của Flatpickr để quản lý việc chọn nhiều ngày họp.
 */
let fpInstance = null; // Biến lưu instance của Flatpickr

// ----------------------------------------------------------------------------
// KHỞI TẠO TỰ ĐỘNG
// ----------------------------------------------------------------------------
/**
 * Lắng nghe sự kiện DOMContentLoaded để khởi tạo trang người dùng.
 */
document.addEventListener("DOMContentLoaded", () => {
    initUserPage();
});

// ----------------------------------------------------------------------------
// LOGIC KHỞI TẠO TRANG (INITIALIZATION)
// ----------------------------------------------------------------------------
/**
 * Hàm khởi tạo chính cho trang index.html.
 * Thiết lập các thành phần giao diện, nạp dữ liệu và kiểm tra liên kết sâu.
 */
function initUserPage() {
    try {
        const supportLinks = document.getElementById('supportLinks');
        if (supportLinks) {
            /**
             * Hiển thị thông tin hỗ trợ kỹ thuật và lễ tân tại Footer.
             */
            supportLinks.innerHTML = `<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg><a href="tel:${IT_PHONE}" class="text-blue-500 font-semibold hover:underline">Hỗ trợ IT</a> &bull; <a href="tel:${RECEPTION_PHONE}" class="text-blue-500 font-semibold hover:underline">Lễ tân</a>`;
        }

        /**
         * Nạp danh sách phòng, ngày tháng và cài đặt các plugin bên thứ 3.
         */
        populateUserRooms();
        initDateOptions(); 
        initScheduleDateSelect(); 
        initFlatpickr(); 
        
        /**
         * Tải dữ liệu từ Google App Script và thiết lập đồng bộ ngầm.
         */
        loadData(); 
        startBackgroundSync();
        
        /**
         * Khởi tạo bộ tìm kiếm khách mời cho Form người dùng.
         */
        initGuestSearch('guestSearchInput', 'guestSuggestions', addGuestToForm);
        
        /**
         * Xử lý trường hợp người dùng click từ mail khôi phục mật khẩu.
         */
        if (RESET_TOKEN) {
            localStorage.removeItem('emm_user');
            currentUser = null;
            const rm = document.getElementById('resetModal');
            if(rm) { rm.classList.remove('hidden'); rm.classList.add('flex'); }
        }
        
        /**
         * Tự động đăng nhập nếu có phiên làm việc lưu trong LocalStorage.
         */
        const savedUser = localStorage.getItem('emm_user');
        if(savedUser) { 
            currentUser = JSON.parse(savedUser); 
            applyAuthState(); 
        }

        /**
         * Lắng nghe thay đổi Hash URL để xử lý quét mã QR.
         */
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

/**
 * Nạp danh sách các phòng họp vào Form đăng ký.
 */
function populateUserRooms() {
    const roomSel = document.getElementById('roomSelect');
    if (!roomSel) return;
    let optionsHTML = '<option value="">-- Chọn --</option>';
    APP_ROOMS.forEach(room => { optionsHTML += `<option value="${room}">${room}</option>`; });
    roomSel.innerHTML = optionsHTML;
}

/**
 * Tạo danh sách 30 ngày khả dụng (không tính Chủ Nhật) cho Select đơn ngày.
 */
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

// ----------------------------------------------------------------------------
// TIỆN ÍCH HIỂN THỊ & THÔNG BÁO (UI UTILS)
// ----------------------------------------------------------------------------

/**
 * Định dạng nhãn ngày hiển thị (Thứ, Ngày/Tháng)
 */
function getFormattedDateLabel(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr), todayStr = getLocalDateString(new Date()), day = String(d.getDate()).padStart(2, '0'), month = String(d.getMonth() + 1).padStart(2, '0');
    if (dateStr === todayStr) return `Hôm nay, ${day}/${month}`;
    const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return `${weekdays[d.getDay()]}, ${day}/${month}`;
}

/**
 * Kiểm tra xem cuộc họp có phải là khẩn cấp (trong vòng 30 phút tới) không.
 */
function checkUrgent(dateStr, startStr) {
    if (!dateStr || !startStr) return false;
    const parts = dateStr.split('-'), timeParts = startStr.split(':');
    if(parts.length !== 3) return false;
    const meetingTime = new Date(parts[0], parts[1] - 1, parts[2], timeParts[0], timeParts[1]);
    const diffMins = Math.floor((meetingTime - new Date()) / 60000);
    return diffMins >= 0 && diffMins < 30;
}

/**
 * Hiển thị Modal thông báo thành công kèm chi tiết lịch vừa đặt.
 */
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
    const meetLink = formData.meetLink ? String(formData.meetLink).replace(/^'/, '') : "";

    let htmlContent = `
        <div class="text-left bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 space-y-2 text-[13px] text-slate-700 shadow-inner">
            <div><span class="font-bold text-slate-500">Tên cuộc họp:</span> <span class="font-semibold text-blue-700">${formData.title}</span></div>
            <div><span class="font-bold text-slate-500">Phòng:</span> <span class="font-semibold">${formData.room}</span></div>
            <div><span class="font-bold text-slate-500">Thời gian:</span> <span class="font-semibold">${displayDate} | ${formData.start} - ${formData.end}</span></div>
            <div><span class="font-bold text-slate-500">Ghi chú/Yêu cầu:</span> <span>${notes}</span></div>
        </div>`;

    // --- START OF CHANGE: Hiển thị nút Google Meet trong Success Modal ---
    if (meetLink) {
        htmlContent += `
            <div class="mt-4 mb-4 space-y-2">
                <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-left">Họp trực tuyến:</p>
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
    // --- END OF CHANGE ---

    if (isUrgent) htmlContent += `
        <div class="bg-orange-50 border border-orange-200 text-orange-700 p-3 rounded-lg text-[13px] font-bold shadow-sm flex items-start gap-2 text-left mb-2">
            <svg class="w-5 h-5 shrink-0 mt-0.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <span>Đặt phòng quá gấp có thể khiến IT & Lễ tân không chuẩn bị kịp thời.</span>
        </div>`;

    msgContainer.innerHTML = htmlContent;
    sModal.classList.remove('hidden'); sModal.classList.add('flex');
}

// ----------------------------------------------------------------------------
// XỬ LÝ DEEP LINKING & QR SCAN
// ----------------------------------------------------------------------------

/**
 * Tự động điền thông tin khi quét mã QR phòng họp.
 */
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

/**
 * Kiểm tra các tham số URL để thực hiện hành động trực tiếp (Sửa lịch từ Email).
 */
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

/**
 * Xử lý hành động cụ thể từ Deep Link.
 */
function processDeepLinkAction(action, eventID) {
    if (action === 'edit' && eventID) {
        const b = allBookings.find(item => {
            const itemId = item['eventID'] !== undefined ? item['eventID'] : item['Event ID'];
            return itemId && String(itemId).replace(/^'/, '') === eventID;
        });
        
        if (b) {
            prepareEdit(b.rowIndex);
        } else showToast("Cuộc họp không tồn tại hoặc đã bị hủy.", "error");
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}
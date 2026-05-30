// ============================================================================
// CORE.JS - TẬP TRUNG CẤU HÌNH, API CORE, TIỆN ÍCH DÙNG CHUNG VÀ XÁC THỰC
// (ĐÃ TỐI ƯU HÓA: GỘP API, BỎ TRIGGER THỪA)
// ============================================================================

// ----------------------------------------------------------------------------
// PHẦN 1: CẤU HÌNH API & HẰNG SỐ 
// ----------------------------------------------------------------------------
// URL của Google Apps Script Web App để gửi yêu cầu POST
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxT4BKEs5oxEXR1We3jy1eKD7fft08lQFiMHRo1JoK0o7BrfQL_a9dNpEOvKXIVJAYk/exec"; 
const IT_PHONE = "0988303852";
const RECEPTION_PHONE = "0948242496";
const BLOCK_EDIT_MINUTES = 10; // Thời gian khóa không cho sửa/hủy trước giờ họp
const APP_ROOMS = ["Phòng họp số 1", "Phòng họp số 2", "Phòng họp số 3", "Phòng Sinh hoạt chung"];

// Cấu hình hiển thị lưới lịch (Schedule Grid)
const SCHEDULE_START_HOUR = 8;
const SCHEDULE_END_HOUR = 17;
const PIXELS_PER_MINUTE = 1; // Tỉ lệ 1 phút = 1px để tính toán vị trí khối lịch

// Biến toàn cục (Global State) - Lưu trữ dữ liệu trong suốt phiên làm việc của trình duyệt
let currentScheduleTab = 1;
let hasCheckedDeepLink = false;
let allBookings = [];       // Chứa danh sách lịch họp lấy từ server
let historyBookings = [];    // Chứa danh sách lịch sử (đã kết thúc)
let allUsers = [];           // Chứa danh sách user đầy đủ (chỉ dành cho Admin)
let currentUser = null;      // Thông tin user đang đăng nhập hiện tại
let isForcedPassChange = false; // Cờ đánh dấu nếu user bắt buộc phải đổi mật khẩu
let isMyBookingsExpanded = false; // Trạng thái hiển thị danh sách lịch của tôi (thu gọn/mở rộng)
let isOnlyAddingFiles = false; // Cờ đánh dấu chế độ chỉ cho phép tải thêm tài liệu
let serverAppConfig = { maxFileCount: 5, maxTotalSizeMb: 15 }; // Giá trị mặc định dự phòng
const DISTINCT_COLORS = ['#2563eb', '#e11d48', '#d97706', '#059669', '#7c3aed']; // Bảng màu card

let allUsersBasicList = [];  // Danh sách nhân viên rút gọn để phục vụ search/gợi ý
let currentSelectedGuests = []; // Danh sách email khách mời đang chọn (User form)
let editingMeetingRowIndex = null; // Lưu index của dòng đang được chỉnh sửa
let fetchingBookingsPromise = null; // Promise dùng để chống việc gọi API trùng lặp

// Tham số URL - Xử lý Deep Linking (truy cập trực tiếp qua link email/QR)
const urlParams = new URLSearchParams(window.location.search);
let RESET_TOKEN = urlParams.get('token') || "";
let URL_ACTION = urlParams.get('action') || "";
let URL_EVENT_ID = urlParams.get('eventID') || "";
let URL_ROOM_INDEX = "";
const hash = window.location.hash;
if (hash && /^#r\d+$/.test(hash)) {
    URL_ROOM_INDEX = hash.substring(2); 
}

// ----------------------------------------------------------------------------
// PHẦN 2: GIAO TIẾP VỚI SERVER & TẢI DỮ LIỆU
// ----------------------------------------------------------------------------

/**
 * Giao tiếp API cốt lõi: Gửi yêu cầu đến Google Apps Script qua phương thức POST
 */
async function apiCall(action, payload = {}) {
    try {
        // Đảm bảo URL có tham số action để GAS Router hoạt động ổn định nhất
        const url = SCRIPT_URL + (SCRIPT_URL.includes('?') ? '&' : '?') + "action=" + action;
        
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(payload),
            // Chế độ follow giúp xử lý việc redirect tự động của Google Script
            redirect: 'follow', 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        
        if (!response.ok) throw new Error('Network response was not ok');
        
        return await response.json();
    } catch (error) {
        console.error("Lỗi gọi API (" + action + "):", error);
        return { success: false, error: "Lỗi kết nối máy chủ." };
    }
}

/**
 * Tải ngầm danh sách lịch mới nhất mà không khóa giao diện người dùng
 */
async function refreshBookingsData() {
    if (fetchingBookingsPromise) return fetchingBookingsPromise;
    fetchingBookingsPromise = (async () => {
        const res = await apiCall('getBookings');
        if(Array.isArray(res)) {
            allBookings = res;
            // Sắp xếp lại lịch theo ngày và giờ bắt đầu
            allBookings.sort((a, b) => {
                const timeA = a["meeting_date"] + cleanTime(a["start_time"]);
                const timeB = b["meeting_date"] + cleanTime(b["start_time"]);
                return timeA.localeCompare(timeB); 
            });
            // Tự động cập nhật lại UI nếu các hàm render tồn tại
            if (typeof renderMyBookings === 'function') renderMyBookings(); 
            if (typeof renderSchedule === 'function') renderSchedule(); 
            if (typeof renderAdminBookings === 'function') {
                renderAdminBookings(); 
                if (typeof filterAdminBookings === 'function') filterAdminBookings();
            }
        }
    })();
    await fetchingBookingsPromise;
    fetchingBookingsPromise = null;
}

/**
 * Hàm khởi tạo dùng chung (Đã tối ưu hóa API Batching - Lấy nhiều dữ liệu trong 1 lần gọi)
 */
async function loadData() {
    toggleLoading(true);
    const msnv = (currentUser && currentUser.msnv) ? currentUser.msnv : null;
    
    // GỌI 1 API DUY NHẤT lấy Bookings, Users và Kiểm tra quyền hạn
    const res = await apiCall('getInitialData', { msnv: msnv });

    if (res.success) {
        allBookings = res.bookings || [];
        if (res.serverConfig) {
            serverAppConfig = res.serverConfig;
        }
        allBookings.sort((a, b) => {
            const timeA = a["meeting_date"] + cleanTime(a["start_time"]);
            const timeB = b["meeting_date"] + cleanTime(b["start_time"]);
            return timeA.localeCompare(timeB);
        });
        allUsersBasicList = res.usersBasic || [];

        // Xử lý CheckRole đồng bộ: Nếu role trên server khác local thì cập nhật lại
        if (currentUser && res.role) {
            if (currentUser.role !== res.role) {
                currentUser.role = res.role;
                localStorage.setItem('emm_user', JSON.stringify(currentUser));
                applyAuthState();
                showToast("Quyền hạn của bạn đã được hệ thống cập nhật lại.", "info");
            }
        } else if (currentUser && res.roleError === "deleted") {
            // Trường hợp user bị xóa khỏi danh sách nhân viên
            logout(); showToast("Tài khoản của bạn không còn tồn tại trên hệ thống.", "error");
        }

        // Tự động render dựa trên trang đang đứng (MPA)
        if (typeof renderMyBookings === 'function') renderMyBookings();
        if (typeof renderSchedule === 'function') renderSchedule();
        if (typeof renderAdminBookings === 'function') {
            renderAdminBookings();
            if (typeof filterAdminBookings === 'function') filterAdminBookings();
        }
    } else {
        showToast("Lỗi tải dữ liệu: " + res.error, "error");
    }

    // Kiểm tra liên kết sâu sau khi dữ liệu đã sẵn sàng
    if(!hasCheckedDeepLink && currentUser && typeof checkDeepLink === 'function') checkDeepLink();
    toggleLoading(false);
}

/**
 * Thiết lập vòng lặp đồng bộ dữ liệu ngầm mỗi 5 phút (300.000 ms)
 */
function startBackgroundSync() {
    setInterval(async () => {
        await refreshBookingsData();
    }, 300000); 
}

// ----------------------------------------------------------------------------
// PHẦN 3: TIỆN ÍCH GIAO DIỆN & FORMAT DỮ LIỆU
// ----------------------------------------------------------------------------

/**
 * Hiển thị/Ẩn lớp phủ Loading toàn màn hình
 */
function toggleLoading(show) { 
    const lo = document.getElementById('loadingOverlay'); 
    if(lo) lo.classList.toggle('hidden', !show); 
}

/**
 * Hiển thị thông báo Toast góc màn hình (Bản sửa lỗi biến mất hoàn toàn)
 */
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    const content = document.getElementById('toastContent');
    if (!toast || !content) return;

    // 1. Thiết lập màu sắc và nội dung
    const typeClasses = {
        'success': 'border-emerald-500 text-emerald-700',
        'error': 'border-red-500 text-red-700',
        'info': 'border-blue-500 text-blue-700'
    };
    const icons = { 'success': '✅', 'error': '❌', 'info': 'ℹ️' };

    content.className = `bg-white border-l-4 p-4 shadow-xl rounded-xl flex items-center ${typeClasses[type] || typeClasses.info}`;
    content.innerHTML = `<div class="flex-shrink-0 text-lg">${icons[type] || icons.info}</div><div class="ml-3 font-bold text-sm">${msg}</div>`;

    // 2. Hiển thị Toast (Trượt xuống và hiện hình)
    toast.classList.remove('-translate-y-full', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    // 3. Tự động ẩn sau 3 giây
    // Xóa các timeout cũ nếu người dùng nhấn liên tiếp (tránh loạn nhịp)
    if (toast.timeoutId) clearTimeout(toast.timeoutId);

    toast.timeoutId = setTimeout(() => {
        // Ẩn Toast (Trượt ngược lên và biến mất hoàn toàn)
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('-translate-y-full', 'opacity-0');
    }, 3000);
}

/**
 * Ẩn/Hiện mật khẩu trong các trường Input
 */
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

/**
 * Đóng tất cả các Modal đang mở và Reset Form về trạng thái ban đầu
 */
function closeModals() { 
    if(isForcedPassChange) return; // Không cho phép đóng nếu user đang bị ép đổi pass
    ['authModal', 'changePassModal', 'profileModal', 'adminBookingModal', 'adminUserModal', 'resetModal', 'successModal', 'errorModal', 'scheduleInteractionModal'].forEach(id => {
        const el = document.getElementById(id);
        if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    });
    ['loginForm', 'forgotForm', 'changePassForm', 'profileForm', 'adminBookingForm', 'adminUserForm'].forEach(id => { const el = document.getElementById(id); if(el) el.reset(); });
    const btnClose = document.getElementById('closeChangePassBtn'); if(btnClose) btnClose.classList.remove('hidden');
    const desc = document.getElementById('forceChangePassDesc'); if(desc) desc.classList.add('hidden');
    const aStart = document.getElementById('aStartSelect'), aEnd = document.getElementById('aEndSelect'), aTimeCtr = document.getElementById('aTimeContainer');
    if(aStart) aStart.innerHTML = ''; if(aEnd) aEnd.innerHTML = ''; if(aTimeCtr) aTimeCtr.classList.add('hidden');
    editingMeetingRowIndex = null;
}

/**
 * Định dạng đối tượng Date thành chuỗi YYYY-MM-DD
 */
function getLocalDateString(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Chuyển đổi chuỗi HH:mm thành số phút để tính toán tọa độ lưới
 */
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/**
 * Làm sạch chuỗi thời gian và làm tròn về mốc 15 phút gần nhất (Logic đặc thù của hệ thống)
 */
function cleanTime(timeStr) {
    if (!timeStr) return "00:00";
    const match = String(timeStr).match(/(\d{2}):(\d{2})/);
    if (match) { 
        let hh = parseInt(match[1]), mm = parseInt(match[2]); 
        mm = Math.floor(mm / 15) * 15; // Làm tròn xuống mốc 15p
        return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`; 
    }
    return "00:00";
}

/**
 * Định dạng hiển thị lịch họp (Thứ Ngày/Tháng | Giờ bắt đầu - Giờ kết thúc)
 */
function formatMeetingDisplay(dateStr, startStr, endStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr), weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return `${weekdays[d.getDay()]} ${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} | ${cleanTime(startStr)} - ${cleanTime(endStr)}`;
}

/**
 * Lấy dữ liệu từ Form và chuyển đổi thành Object một cách an toàn
 */
function getSafeFormData(form) {
    const data = {};
    const fd = new FormData(form);
    fd.forEach((val, key) => { data[key] = val; });
    return data;
}

// ----------------------------------------------------------------------------
// PHẦN 4: LOGIC TÌM KIẾM & QUẢN LÝ KHÁCH MỜI
// ----------------------------------------------------------------------------

/**
 * Khởi tạo tính năng gợi ý (autocomplete) khi nhập tên khách mời
 */
function initGuestSearch(inputId, suggestId, addCallback) {
    const input = document.getElementById(inputId), suggestions = document.getElementById(suggestId);
    if(!input || !suggestions) return;

    input.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (!val) { suggestions.classList.add('hidden'); return; }

        let selectedArr = currentSelectedGuests;

        // Lọc danh sách nhân viên khớp với từ khóa, loại bỏ người đang đăng nhập và người đã chọn
        const matches = allUsersBasicList.filter(u =>
            (u.name.toLowerCase().includes(val) || (u.dept && u.dept.toLowerCase().includes(val))) &&
            u.email !== currentUser.email && !selectedArr.includes(u.email)
        ).slice(0, 5); 

        // Regex kiểm tra định dạng email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isEmail = emailRegex.test(val);

        let html = matches.map(u => `
            <div onclick="${addCallback.name}('${u.email}', '${u.name.replace(/'/g, "\\'")}')" class="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors flex items-center justify-between">
                <div><div class="text-sm font-bold text-slate-700">${u.name}</div><div class="text-[10px] font-semibold text-slate-400 mt-0.5">${u.dept || 'Nhân viên'}</div></div>
                <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            </div>
        `).join('');

        // Nếu là định dạng email và chưa có trong danh sách nội bộ, thêm nút "Thêm khách ngoài"
        if (isEmail && !allUsersBasicList.some(u => u.email.toLowerCase() === val)) {
            html += `
                <div onclick="${addCallback.name}('${val}', '${val}')" class="p-3 bg-blue-50 hover:bg-blue-100 cursor-pointer transition-colors flex items-center justify-between">
                    <div><div class="text-sm font-bold text-blue-700">Thêm khách ngoài:</div><div class="text-[10px] font-semibold text-blue-400 mt-0.5">${val}</div></div>
                    <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
                </div>
            `;
        }

        if (html) {
            suggestions.innerHTML = html;
            suggestions.classList.remove('hidden');
        } else {
            suggestions.innerHTML = '<div class="p-3 text-sm text-slate-500 text-center italic">Không tìm thấy nhân sự.</div>';
            suggestions.classList.remove('hidden');
        }
    });

    // Đóng danh sách gợi ý khi click ra ngoài
    document.addEventListener('click', (e) => { if(!input.contains(e.target) && !suggestions.contains(e.target)) suggestions.classList.add('hidden'); });
}

/**
 * Thêm hàng loạt khách mời dựa trên Nhóm (BĐH, CBQL...)
 */
function addGuestByGroup(groupCode, context) {
    if (!allUsersBasicList || allUsersBasicList.length === 0) return;
    const targetUsers = allUsersBasicList.filter(u => u.group === groupCode && u.email !== currentUser.email);
    if (targetUsers.length === 0) { showToast(`Chưa có nhân sự nào được phân vào nhóm ${groupCode}`, "info"); return; }

    let addedCount = 0, targetArray = [], renderFunc = null;

    if (context === 'user') { targetArray = currentSelectedGuests; renderFunc = () => { if(typeof renderGuestTags === 'function') renderGuestTags('guestTagsContainer', 'fGuests'); }; } 

    targetUsers.forEach(u => { if (!targetArray.includes(u.email)) { targetArray.push(u.email); addedCount++; } });

    if (addedCount > 0) { renderFunc(); showToast(`Đã tự động chọn ${addedCount} người thuộc nhóm ${groupCode}`, "success"); } 
    else { showToast(`Toàn bộ nhóm ${groupCode} đã có mặt trong danh sách`, "info"); }
}

/**
 * Xóa khách mời khỏi danh sách đã chọn (User form)
 */
function removeGuest(email) {
    currentSelectedGuests = currentSelectedGuests.filter(e => e !== email); 
    if(typeof renderGuestTags === 'function') renderGuestTags('guestTagsContainer', 'fGuests'); 
}

/**
 * Thêm nhanh nội dung vào Ghi chú/Yêu cầu chuẩn bị
 */
function addQuickNote(targetId, text) {
    const el = document.getElementById(targetId);
    if(!el) return;
    let currentVal = el.value.trim();
    if (currentVal === "") el.value = text;
    else if (!currentVal.includes(text)) el.value = currentVal + ", " + text;
}

// ----------------------------------------------------------------------------
// PHẦN 5: ĐIỀU HƯỚNG & XỬ LÝ AUTHENTICATION 
// ----------------------------------------------------------------------------

function openLoginModal() { 
    const modal = document.getElementById('authModal'); 
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); switchAuthMode('login'); } 
}

function openChangePassModal() { 
    const modal = document.getElementById('changePassModal'); 
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); } 
}

/**
 * Hiển thị Modal thông tin cá nhân và điền sẵn dữ liệu hiện tại
 */
function openProfileModal() {
    if (!currentUser) return;
    const modal = document.getElementById('profileModal');
    if (modal) {
        document.getElementById('pMsnv').value = currentUser.msnv || "";
        document.getElementById('pName').value = currentUser.name || "";
        document.getElementById('pDept').value = currentUser.dept || "";
        document.getElementById('pTitle').value = currentUser.title || "";
        document.getElementById('pEmail').value = currentUser.email || "";
        document.getElementById('pPhone').value = currentUser.phone || "";
        modal.classList.remove('hidden'); modal.classList.add('flex');
    }
}

/**
 * Chuyển đổi giữa giao diện Đăng nhập và Quên mật khẩu trong cùng một Modal
 */
function switchAuthMode(mode) {
    const loginSt = document.getElementById('loginState'), forgotSt = document.getElementById('forgotState');
    if(loginSt) loginSt.classList.toggle('hidden', mode !== 'login');
    if(forgotSt) forgotSt.classList.toggle('hidden', mode === 'login');
}

/**
 * Xử lý sự kiện Submit Form đăng nhập
 */
async function handleLoginSubmit(e) {
    e.preventDefault();
    const emailOrMsnv = document.getElementById('lEmail').value, pass = document.getElementById('lPass').value;
    toggleLoading(true);
    const res = await apiCall('login', { loginId: emailOrMsnv, password: pass });
    toggleLoading(false);
    
    if(res.success) {
        if (res.requirePasswordChange) {
            // Trường hợp user lần đầu đăng nhập bằng pass mặc định -> Ép đổi pass
            currentUser = res.user; isForcedPassChange = true;
            const authModal = document.getElementById('authModal'); if(authModal) authModal.classList.add('hidden');
            const chgModal = document.getElementById('changePassModal'); if(chgModal) { chgModal.classList.remove('hidden'); chgModal.classList.add('flex'); }
            const clsBtn = document.getElementById('closeChangePassBtn'); if(clsBtn) clsBtn.classList.add('hidden');
            const forceDesc = document.getElementById('forceChangePassDesc'); if(forceDesc) forceDesc.classList.remove('hidden');
            showToast("Vui lòng đổi mật khẩu mặc định!", "info");
        } else {
            currentUser = res.user; 
            localStorage.setItem('emm_user', JSON.stringify(currentUser)); 
            closeModals();
            
            // Điều hướng Trang (Multi-Page Architecture Routing)
            if (currentUser.role === 'Admin') window.location.href = 'admin.html';
            else {
                applyAuthState(); 
                if (typeof loadData === 'function') loadData();
                showToast("Đăng nhập thành công!", "success"); 
            }
        }
    } else { showToast(res.error, "error"); } 
}

function goToAdmin() {
    if (!currentUser) return;
    if (currentUser.role === 'Admin') window.location.href = 'admin.html';
}

/**
 * Xử lý cập nhật thông tin cá nhân
 */
async function handleProfileSubmit(e) {
    e.preventDefault();
    const formData = getSafeFormData(e.target);
    toggleLoading(true);
    const res = await apiCall('updateUserProfile', { formData: formData });
    toggleLoading(false);
    if (res.success) {
        showToast("Cập nhật thông tin thành công!", "success");
        currentUser.name = formData.name; currentUser.dept = formData.dept; currentUser.title = formData.title; currentUser.email = formData.email; currentUser.phone = formData.phone;
        localStorage.setItem('emm_user', JSON.stringify(currentUser));
        applyAuthState(); closeModals();
    } else { showToast(res.error, "error"); }
}

/**
 * Xử lý đổi mật khẩu
 */
async function handleChangePassSubmit(e) {
    e.preventDefault();
    const oldPass = document.getElementById('cOldPass').value, newPass = document.getElementById('cNewPass').value, confirmPass = document.getElementById('cConfirmPass').value;
    if (newPass !== confirmPass) { showToast("Mật khẩu xác nhận không khớp!", "error"); return; }
    if (oldPass === newPass) { showToast("Mật khẩu mới phải khác mật khẩu hiện tại!", "error"); return; }
    toggleLoading(true);
    const res = await apiCall('changePassword', { loginId: currentUser.loginId, oldPass: oldPass, newPass: newPass });
    toggleLoading(false);
    if(res.success) {
        showToast("Đổi mật khẩu thành công!", "success");
        if(isForcedPassChange) { 
            isForcedPassChange = false; 
            localStorage.setItem('emm_user', JSON.stringify(currentUser)); 
            applyAuthState(); 
            if(typeof checkDeepLink === 'function') checkDeepLink(); 
        }
        isForcedPassChange = false; closeModals();
        
        // Sau khi đổi xong quay về trang quản trị tương ứng
        if (currentUser.role === 'Admin') window.location.href = 'admin.html';
    } else { showToast(res.error, "error"); }
}

/**
 * Xử lý yêu cầu gửi link khôi phục mật khẩu qua Email
 */
async function handleForgotSubmit(e) {
    e.preventDefault();
    toggleLoading(true);
    const reqVal = document.getElementById('fEmailReq').value;
    const res = await apiCall('sendResetLink', { loginId: reqVal, appUrl: window.location.href.split('#')[0] });
    toggleLoading(false);
    if(res.success) { showToast("Đã gửi Link khôi phục vào Email của bạn.", "success"); closeModals(); } 
    else showToast(res.error, "error");
}

/**
 * Xử lý thiết lập mật khẩu mới từ link Email
 */
async function handleResetSubmit(e) {
    e.preventDefault();
    toggleLoading(true);
    const rPass = document.getElementById('rNewPass').value;
    const res = await apiCall('resetPasswordWithToken', { token: RESET_TOKEN, newPassword: rPass });
    toggleLoading(false);
    if(res.success) {
        showToast("Đổi mật khẩu thành công! Đăng nhập lại với mật khẩu vừa tạo.", "success"); 
        const rm = document.getElementById('resetModal'); if(rm) { rm.classList.add('hidden'); rm.classList.remove('flex'); }
        window.history.pushState({}, document.title, window.location.pathname); openLoginModal(); 
    } else showToast(res.error, "error");
}

/**
 * Hủy Token khôi phục mật khẩu nếu user không muốn đổi nữa
 */
async function cancelResetPassword() {
    toggleLoading(true);
    const res = await apiCall('cancelResetToken', { token: RESET_TOKEN });
    toggleLoading(false);
    if(res.success) {
        showToast("Đã hủy yêu cầu đổi mật khẩu.", "info");
        const rm = document.getElementById('resetModal'); if(rm) { rm.classList.add('hidden'); rm.classList.remove('flex'); }
        window.history.pushState({}, document.title, window.location.pathname); openLoginModal();
    } else { showToast(res.error, "error"); }
}

/**
 * Đăng xuất và dọn dẹp bộ nhớ đệm
 */
function logout() { 
    currentUser = null; 
    localStorage.removeItem('emm_user'); 
    const currentPath = window.location.pathname;
    // Nếu đang ở trang quản trị mà logout thì phải đẩy về trang chủ
    if (currentPath.includes('admin.html')) window.location.href = 'index.html';
    else { applyAuthState(); showToast("Đã đăng xuất"); }
}

/**
 * Đồng bộ trạng thái giao diện với thông tin người dùng đang đăng nhập
 */
function applyAuthState() {
    const isAuth = !!currentUser;
    const logBtn = document.getElementById('loginBtn'), usrBar = document.getElementById('userSessionBar'), logNot = document.getElementById('loginNotice'), frmSec = document.getElementById('formSection'), schedSec = document.getElementById('scheduleSection');
    
    if(logBtn) logBtn.classList.toggle('hidden', isAuth); 
    if(usrBar) usrBar.classList.toggle('hidden', !isAuth);
    if(logNot) logNot.classList.toggle('hidden', isAuth); 
    if(frmSec) frmSec.classList.toggle('hidden', !isAuth);
    
    if (isAuth) {
        const cUser = document.getElementById('currentUserEmail'), fUser = document.getElementById('fUser'), fEmpId = document.getElementById('fEmpId');
        if(cUser) cUser.innerText = currentUser.name; 
        if(fUser) fUser.value = `${currentUser.name} - ${currentUser.dept}`;
        if(fEmpId) fEmpId.value = String(currentUser.msnv).replace(/^'/, '');
        
        const fEmail = document.getElementById('fCreatorEmail'); if(fEmail) fEmail.value = currentUser.email;
        
        const aBtn = document.getElementById('adminBtn');
        if (currentUser.role === 'Admin') { 
            if(aBtn) aBtn.classList.remove('hidden'); 
        } else { 
            if(aBtn) aBtn.classList.add('hidden'); 
        }
        
        if (typeof checkDeepLink === 'function') checkDeepLink(); 
        if(typeof renderMyBookings === 'function') { renderMyBookings(); renderSchedule(); }
        
        if(schedSec) schedSec.classList.remove('hidden');
    } else {
        const aBtn = document.getElementById('adminBtn'); if(aBtn) aBtn.classList.add('hidden'); 
        const mbSec = document.getElementById('myBookingsSection');
        if(mbSec) mbSec.classList.add('hidden'); 
        if(schedSec) schedSec.classList.add('hidden');
        if (typeof resetEditState === 'function') resetEditState();
    }
}

// ----------------------------------------------------------------------------
// PHẦN 6: CẬP NHẬT GIAO DIỆN LẠC QUAN (OPTIMISTIC UI CORE LOGIC)
// ----------------------------------------------------------------------------

/**
 * Cập nhật giao diện ngay lập tức trước khi nhận phản hồi từ Server
 * Mục đích: Tạo trải nghiệm mượt mà, không có độ trễ cho người dùng.
 */
function applyOptimisticUI(formData) {
    if (formData.rowIndex) {
        // Chế độ Edit
        let b = allBookings.find(item => item.rowIndex == formData.rowIndex);
        if (b) {
            b["meeting_date"] = formData.date;
            b["start_time"] = formData.start;
            b["end_time"] = formData.end;
            b["room_name"] = formData.room;
            b["title"] = formData.title;
            b["guest_email"] = formData.guests || ""; // Sửa từ "Khách mời"
            b["notes"] = formData.note || "";        // Sửa từ "Yêu cầu khác"
        }
    } else {
        // Chế độ Thêm mới (Xử lý cho cả đơn ngày và đa ngày)
        let datesToProcess = formData.dates ? formData.dates.split(',').map(d => d.trim()) : [formData.date];
        
        datesToProcess.forEach((dateStr, index) => {
            let newB = {
               rowIndex: Date.now() + index, 
               "meeting_date": dateStr,      // Chuẩn hóa
               "start_time": formData.start, // Chuẩn hóa
               "end_time": formData.end,     // Chuẩn hóa
               "room_name": formData.room,   // Chuẩn hóa
               "title": formData.title,       // Chuẩn hóa
               "user_name": currentUser ? currentUser.name : "",
               "employee_id": currentUser ? currentUser.msnv : "", // Chuẩn hóa
               "guest_email": formData.guests || "",
               "notes": formData.note || ""
            };
            allBookings.push(newB);
        });
    }
    
    // Sắp xếp lại để giao diện không bị nhảy
    allBookings.sort((a, b) => (a["meeting_date"] + a["start_time"]).localeCompare(b["meeting_date"] + b["start_time"]));
    
    // Vẽ lại UI
    if (typeof renderMyBookings === 'function') renderMyBookings();
    if (typeof renderSchedule === 'function') renderSchedule();
}

// ----------------------------------------------------------------------------
// PHẦN 7: TIỆN ÍCH SAO CHÉP VÀO CLIPBOARD (MỚI)
// ----------------------------------------------------------------------------

/**
 * TIỆN ÍCH SAO CHÉP VÀO CLIPBOARD
 * Nhiệm vụ: Sao chép văn bản và hiển thị thông báo Toast.
 */
function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("Đã sao chép link họp vào bộ nhớ tạm!", "success");
        }).catch(err => {
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed"; // Tránh cuộn trang
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) showToast("Đã sao chép link họp!", "success");
        else showToast("Không thể sao chép.", "error");
    } catch (err) {
        showToast("Lỗi khi sao chép.", "error");
    }
    document.body.removeChild(textArea);
}

/**
 * CHUẨN HÓA VĂN BẢN (Ghi vào Database)
 */
function normalizeNotes(text) {
    if (!text) return "";
    let processed = text.trim();

    // BƯỚC 1: QUY CHUẨN CÁC TỪ ĐỒNG NGHĨA (SYNONYMS)
    processed = processed.replace(/\b(website|web|site)\s*[:\-]*\s*/gi, "Web: ");
    processed = processed.replace(/\b(sđt|đt|điện thoại|phone|tel)\s*[:\-]*\s*/gi, "SĐT: ");
    processed = processed.replace(/\b(email|mail)\s*[:\-]*\s*/gi, "Email: ");

    // BƯỚC 2: XỬ LÝ EMAIL (ƯU TIÊN SỐ 1)
    const emailPattern = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
    processed = processed.replace(emailPattern, (match, offset, fullString) => {
        const before = fullString.substring(0, offset);
        if (/Email:\s*$/i.test(before)) return match;
        return `Email: ${match}`;
    });

    // BƯỚC 3: XỬ LÝ SỐ ĐIỆN THOẠI
    const phonePattern = /\b(?:\+84|084|0)(?:[.\s]?\d){9,10}\b/g;
    processed = processed.replace(phonePattern, (match, offset, fullString) => {
        const before = fullString.substring(0, offset);
        const cleanPhone = match.replace(/[\.\s]/g, '');
        if (/SĐT:\s*$/i.test(before)) return cleanPhone;
        return `SĐT: ${cleanPhone}`;
    });

    // BƯỚC 4: XỬ LÝ WEBSITE (CẢI TIẾN QUAN TRỌNG)
    // Regex này chỉ tìm domain nếu:
    // - KHÔNG đứng sau dấu @ hoặc dấu . (để không cắt đôi email)
    // - KHÔNG đứng sau nhãn "Web:", "Email:", "https://"
    const webPattern = /(?<![a-zA-Z0-9@.])\b([a-zA-Z0-9-]+\.(?:com|vn|net|org|edu|gov|io|info|me|biz)(?:\.[a-z]{2,})?(?:\/[^\s]*)?)\b/gi;
    
    processed = processed.replace(webPattern, (match, domain, offset, fullString) => {
        const before = fullString.substring(0, offset);
        // Kiểm tra xem đã có nhãn chuẩn hoặc giao thức chưa
        if (/(Web:|Email:|https?:\/\/)\s*$/i.test(before)) return match;
        return `Web: ${match}`;
    });

    // BƯỚC 5: DỌN DẸP LẶP NHÃN
    processed = processed.replace(/(Email:\s*){2,}/gi, "Email: ");
    processed = processed.replace(/(SĐT:\s*){2,}/gi, "SĐT: ");
    processed = processed.replace(/(Web:\s*){2,}/gi, "Web: ");

    return processed;
}

/**
 * KÍCH HOẠT LINK (Hiển thị trên Modal)
 */
function linkify(text) {
    if (!text) return "";
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 1. Link Website: Tìm nhãn "Web: " và link hóa phần sau nó
    html = html.replace(/Web:\s*([a-zA-Z0-9-]+\.[a-zA-Z0-9.-/=?%&]+)/gi, (match, url) => {
        let fullUrl = url.startsWith('http') ? url : 'https://' + url;
        return `Web: <a href="${fullUrl}" target="_blank" class="text-blue-600 hover:underline font-medium">${url}</a>`;
    });

    // 2. Link Email: Tìm nhãn "Email: "
    html = html.replace(/Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi, 
        'Email: <a href="mailto:$1" class="text-blue-600 hover:underline font-medium">$1</a>');

    // 3. Link SĐT: Tìm nhãn "SĐT: "
    html = html.replace(/SĐT:\s*(\d{9,13})/gi, 
        'SĐT: <a href="tel:$1" class="text-blue-600 hover:underline font-bold">$1</a>');

    return html.replace(/\n/g, '<br>');
}
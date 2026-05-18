// ============================================================================
// CORE.JS - TẬP TRUNG CẤU HÌNH, API CORE, TIỆN ÍCH DÙNG CHUNG VÀ XÁC THỰC
// (ĐÃ TỐI ƯU HÓA: GỘP API, BỎ TRIGGER THỪA)
// ============================================================================

// ----------------------------------------------------------------------------
// PHẦN 1: CẤU HÌNH API & HẰNG SỐ 
// ----------------------------------------------------------------------------
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwcmZAsRGF8sBb4Rbi5o9tWdHqKSPSZEk3Ew8mFLkIzPuN34Fxsmm1BV-5QXWQ10_k/exec"; 
const IT_PHONE = "0988303852";
const RECEPTION_PHONE = "0948242496";
const BLOCK_EDIT_MINUTES = 10;
const APP_ROOMS = ["Phòng họp số 1", "Phòng họp số 2", "Phòng họp số 3", "Phòng Sinh hoạt chung"];

// Cấu hình hiển thị lưới lịch
const SCHEDULE_START_HOUR = 8;
const SCHEDULE_END_HOUR = 17;
const PIXELS_PER_MINUTE = 1; 

// Biến toàn cục (Global State)
let currentScheduleTab = 1;
let hasCheckedDeepLink = false;
let allBookings = []; 
let historyBookings = []; 
let allUsers = []; 
let currentUser = null; 
let isForcedPassChange = false; 
let isMyBookingsExpanded = false; 
const DISTINCT_COLORS = ['#2563eb', '#e11d48', '#d97706', '#059669', '#7c3aed']; 

let allUsersBasicList = [];
let currentSelectedGuests = []; 
let adminSelectedGuests = [];   
let editingMeetingRowIndex = null; 
let fetchingBookingsPromise = null;

// Tham số URL
const urlParams = new URLSearchParams(window.location.search);
let RESET_TOKEN = urlParams.get('token') || "";
let URL_ACTION = urlParams.get('action') || "";
let URL_EVENT_ID = urlParams.get('eventId') || "";
let URL_ROOM_INDEX = "";
const hash = window.location.hash;
if (hash && /^#r\d+$/.test(hash)) {
    URL_ROOM_INDEX = hash.substring(2); 
}

// ----------------------------------------------------------------------------
// PHẦN 2: GIAO TIẾP VỚI SERVER & TẢI DỮ LIỆU
// ----------------------------------------------------------------------------
async function apiCall(action, payload = {}) {
    try {
        const response = await fetch(SCRIPT_URL + "?action=" + action, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        return await response.json();
    } catch (error) {
        console.error("Lỗi gọi API:", error);
        return { success: false, error: "Lỗi kết nối máy chủ. Vui lòng kiểm tra lại mạng hoặc thử lại sau." };
    }
}

// Tải ngầm danh sách lịch mới nhất mà không khóa UI
async function refreshBookingsData() {
    if (fetchingBookingsPromise) return fetchingBookingsPromise;
    fetchingBookingsPromise = (async () => {
        const res = await apiCall('getBookings');
        if(Array.isArray(res)) {
            allBookings = res;
            allBookings.sort((a, b) => {
                const timeA = a["Ngày họp"] + cleanTime(a["Bắt đầu"]);
                const timeB = b["Ngày họp"] + cleanTime(b["Bắt đầu"]);
                return timeA.localeCompare(timeB); 
            });
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

// Hàm khởi tạo dùng chung (Đã tối ưu hóa API Batching)
async function loadData() {
    toggleLoading(true);
    const msnv = (currentUser && currentUser.msnv) ? currentUser.msnv : null;
    
    // GỌI 1 API DUY NHẤT thay vì 4 API rời rạc để tăng tốc độ tải
    const res = await apiCall('getInitialData', { msnv: msnv });

    if (res.success) {
        allBookings = res.bookings || [];
        allBookings.sort((a, b) => {
            const timeA = a["Ngày họp"] + cleanTime(a["Bắt đầu"]);
            const timeB = b["Ngày họp"] + cleanTime(b["Bắt đầu"]);
            return timeA.localeCompare(timeB);
        });
        allUsersBasicList = res.usersBasic || [];

        // Xử lý CheckRole
        if (currentUser && res.role) {
            if (currentUser.role !== res.role) {
                currentUser.role = res.role;
                localStorage.setItem('emm_user', JSON.stringify(currentUser));
                applyAuthState();
                showToast("Quyền hạn của bạn đã được hệ thống cập nhật lại.", "info");
            }
        } else if (currentUser && res.roleError === "deleted") {
            logout(); showToast("Tài khoản của bạn không còn tồn tại trên hệ thống.", "error");
        }

        // Tự động render dựa trên trang hiện tại
        if (typeof renderMyBookings === 'function') renderMyBookings();
        if (typeof renderSchedule === 'function') renderSchedule();
        if (typeof renderAdminBookings === 'function') {
            renderAdminBookings();
            if (typeof filterAdminBookings === 'function') filterAdminBookings();
        }
    } else {
        showToast("Lỗi tải dữ liệu: " + res.error, "error");
    }

    if(!hasCheckedDeepLink && currentUser && typeof checkDeepLink === 'function') checkDeepLink();
    toggleLoading(false);
}

function startBackgroundSync() {
    setInterval(async () => {
        // Chỉ kéo dữ liệu mới ngầm, KHÔNG gọi moveCompletedBookingsToDone nữa
        await refreshBookingsData();
    }, 300000); // 5 phút
}

// ----------------------------------------------------------------------------
// PHẦN 3: TIỆN ÍCH GIAO DIỆN & FORMAT DỮ LIỆU
// ----------------------------------------------------------------------------
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
    
    adminSelectedGuests = []; 
    if (typeof renderAdminGuestTags === 'function') renderAdminGuestTags();
    const aGS = document.getElementById('aGuestSearchInput'); if (aGS) aGS.value = '';
    const aGSugg = document.getElementById('aGuestSuggestions'); if (aGSugg) aGSugg.classList.add('hidden');
}

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

function initGuestSearch(inputId, suggestId, addCallback) {
    const input = document.getElementById(inputId), suggestions = document.getElementById(suggestId);
    if(!input || !suggestions) return;

    input.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (!val) { suggestions.classList.add('hidden'); return; }

        let selectedArr = inputId === 'aGuestSearchInput' ? adminSelectedGuests : currentSelectedGuests;

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

    targetUsers.forEach(u => { if (!targetArray.includes(u.email)) { targetArray.push(u.email); addedCount++; } });

    if (addedCount > 0) { renderFunc(); showToast(`Đã tự động chọn ${addedCount} người thuộc nhóm ${groupCode}`, "success"); } 
    else { showToast(`Toàn bộ nhóm ${groupCode} đã có mặt trong danh sách`, "info"); }
}

function removeGuest(email) {
    currentSelectedGuests = currentSelectedGuests.filter(e => e !== email); 
    if(typeof renderGuestTags === 'function') renderGuestTags('guestTagsContainer', 'fGuests'); 
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

// ----------------------------------------------------------------------------
// PHẦN 4: ĐIỀU HƯỚNG & XỬ LÝ AUTHENTICATION 
// ----------------------------------------------------------------------------
function openLoginModal() { 
    const modal = document.getElementById('authModal'); 
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); switchAuthMode('login'); } 
}

function openChangePassModal() { 
    const modal = document.getElementById('changePassModal'); 
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); } 
}

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

function switchAuthMode(mode) {
    const loginSt = document.getElementById('loginState'), forgotSt = document.getElementById('forgotState');
    if(loginSt) loginSt.classList.toggle('hidden', mode !== 'login');
    if(forgotSt) forgotSt.classList.toggle('hidden', mode === 'login');
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const emailOrMsnv = document.getElementById('lEmail').value, pass = document.getElementById('lPass').value;
    toggleLoading(true);
    const res = await apiCall('login', { loginId: emailOrMsnv, password: pass });
    toggleLoading(false);
    
    if(res.success) {
        if (res.requirePasswordChange) {
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
            
            // MPA Routing: Chuyển trang theo quyền
            if (currentUser.role === 'Admin') window.location.href = 'admin.html';
            else if (currentUser.role === 'Editor') window.location.href = 'editor.html';
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
    else if (currentUser.role === 'Editor') window.location.href = 'editor.html';
}

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
        
        if (currentUser.role === 'Admin') window.location.href = 'admin.html';
        else if (currentUser.role === 'Editor') window.location.href = 'editor.html';
    } else { showToast(res.error, "error"); }
}

async function handleForgotSubmit(e) {
    e.preventDefault();
    toggleLoading(true);
    const reqVal = document.getElementById('fEmailReq').value;
    const res = await apiCall('sendResetLink', { loginId: reqVal, appUrl: window.location.href.split('#')[0] });
    toggleLoading(false);
    if(res.success) { showToast("Đã gửi Link khôi phục vào Email của bạn.", "success"); closeModals(); } 
    else showToast(res.error, "error");
}

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

function logout() { 
    currentUser = null; 
    localStorage.removeItem('emm_user'); 
    const currentPath = window.location.pathname;
    if (currentPath.includes('editor.html') || currentPath.includes('admin.html')) window.location.href = 'index.html';
    else { applyAuthState(); showToast("Đã đăng xuất"); }
}

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
        if (currentUser.role === 'Admin' || currentUser.role === 'Editor') { 
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
// PHẦN 5: CẬP NHẬT GIAO DIỆN LẠC QUAN (OPTIMISTIC UI CORE LOGIC)
// ----------------------------------------------------------------------------
function applyOptimisticUI(formData) {
    if (formData.rowIndex) {
        // Edit mode
        let b = allBookings.find(item => item.rowIndex == formData.rowIndex);
        if (b) {
            b["Ngày họp"] = formData.date;
            b["Bắt đầu"] = formData.start;
            b["Kết thúc"] = formData.end;
            b["Phòng họp"] = formData.room;
            b["Tên cuộc họp"] = formData.title;
            if(formData.guests !== undefined) b["Khách mời"] = formData.guests;
            if(formData.note !== undefined) b["Yêu cầu khác"] = formData.note;
        }
    } else if (formData.date && !formData.dates) { 
        // Create Single Date
        let newB = {
           rowIndex: Date.now(), 
           "Ngày họp": formData.date,
           "Bắt đầu": formData.start,
           "Kết thúc": formData.end,
           "Phòng họp": formData.room,
           "Tên cuộc họp": formData.title,
           "Người đăng ký": currentUser ? currentUser.name : "",
           "Mã NV": currentUser ? currentUser.msnv : "",
           "Khách mời": formData.guests || "",
           "Yêu cầu khác": formData.note || ""
        };
        allBookings.push(newB);
    } else if (formData.dates) {
        // Create Multiple Dates
        let datesArr = formData.dates.split(',').map(d => d.trim()).filter(d => d);
        datesArr.forEach((dateStr, index) => {
            let newB = {
               rowIndex: Date.now() + index,
               "Ngày họp": dateStr,
               "Bắt đầu": formData.start,
               "Kết thúc": formData.end,
               "Phòng họp": formData.room,
               "Tên cuộc họp": formData.title,
               "Người đăng ký": currentUser ? currentUser.name : "",
               "Mã NV": currentUser ? currentUser.msnv : "",
               "Khách mời": formData.guests || "",
               "Yêu cầu khác": formData.note || ""
            };
            allBookings.push(newB);
        });
    }
    
    // Sort lại và render ngay lập tức (không chờ API)
    allBookings.sort((a, b) => (a["Ngày họp"] + cleanTime(a["Bắt đầu"])).localeCompare(b["Ngày họp"] + cleanTime(b["Bắt đầu"])));
    
    if (typeof renderMyBookings === 'function') renderMyBookings();
    if (typeof renderSchedule === 'function') renderSchedule();
    if (typeof renderAdminBookings === 'function') renderAdminBookings();
}
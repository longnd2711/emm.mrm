// ============================================================================
// ADMIN.JS - GIAO DIỆN CHO EDITOR VÀ ADMIN QUẢN TRỊ
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
// LOGIC TRANG ADMIN (QUẢN TRỊ USER VÀ HỆ THỐNG)
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
        const roleColor = u["role"] === 'Admin' ? 'bg-purple-100 text-purple-700' : (u["role"] === 'Editor' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600');
        const groupName = u["group"] ? String(u["group"]).replace(/^'/, '') : 'CBCNV';
        return `<div class="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="flex items-center gap-2 mb-1.5"><span class="font-bold text-slate-800 text-base">${String(u["user_name"]).replace(/^'/, '')}</span><span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${roleColor}">${u["role"]}</span></div>
                    <div class="text-xs font-semibold text-slate-500">${String(u["employee_id"]).replace(/^'/, '')} &bull; Nhóm: ${groupName}</div>
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
        document.getElementById('uMsnv').value = String(u["employee_id"]).replace(/^'/, '');
        document.getElementById('uName').value = String(u["user_name"]).replace(/^'/, '');
        document.getElementById('uDept').value = u["dept_abbr"] ? String(u["dept_abbr"]).replace(/^'/, '') : '';
        document.getElementById('uTitle').value = u["user_position"] ? String(u["user_position"]).replace(/^'/, '') : '';
        document.getElementById('uEmail').value = u["email"];
        document.getElementById('uPhone').value = String(u["phone_number"]).replace(/^'/, '');
        document.getElementById('uRole').value = u["role"];
        document.getElementById('uIsChangedPass').value = u["is_password_change"];
        document.getElementById('uGroup').value = u["group"] ? String(u["group"]).replace(/^'/, '') : 'CBCNV';
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

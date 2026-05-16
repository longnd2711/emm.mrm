// ==========================================
// ĐIỀU HƯỚNG & XỬ LÝ AUTHENTICATION
// ==========================================

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
            
            // XỬ LÝ ROUTING MPA SAU KHI ĐĂNG NHẬP
            if (currentUser.role === 'Admin') {
                window.location.href = 'admin.html';
            } else if (currentUser.role === 'Editor') {
                window.location.href = 'editor.html';
            } else {
                applyAuthState(); 
                if (typeof loadData === 'function') loadData();
                showToast("Đăng nhập thành công!", "success"); 
            }
        }
    } else { showToast(res.error, "error"); } 
}

function goToAdmin() {
    if (!currentUser) return;
    if (currentUser.role === 'Admin') {
        window.location.href = 'admin.html';
    } else if (currentUser.role === 'Editor') {
        window.location.href = 'editor.html';
    }
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
        
        // MPA Routing sau khi đổi pass nếu login lần đầu
        if (currentUser.role === 'Admin') {
            window.location.href = 'admin.html';
        } else if (currentUser.role === 'Editor') {
            window.location.href = 'editor.html';
        }
        
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
    
    // Nếu đang ở trang Editor/Admin thì đá về index
    const currentPath = window.location.pathname;
    if (currentPath.includes('editor.html') || currentPath.includes('admin.html')) {
        window.location.href = 'index.html';
    } else {
        applyAuthState(); 
        showToast("Đã đăng xuất"); 
    }
}

// Hàm quản lý trạng thái UI trên trang User (index.html)
function applyAuthState() {
    const isAuth = !!currentUser;
    const logBtn = document.getElementById('loginBtn'), usrBar = document.getElementById('userSessionBar'), logNot = document.getElementById('loginNotice'), frmSec = document.getElementById('formSection'), schedSec = document.getElementById('scheduleSection');
    
    if(logBtn) logBtn.classList.toggle('hidden', isAuth); 
    if(usrBar) usrBar.classList.toggle('hidden', !isAuth);
    if(logNot) logNot.classList.toggle('hidden', isAuth); 
    if(frmSec) frmSec.classList.toggle('hidden', !isAuth);
    
    if (isAuth) {
        loadBasicUsersData();
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
        if(allBookings.length > 0 && typeof renderMyBookings === 'function') { renderMyBookings(); renderSchedule(); }
        
        if(schedSec) schedSec.classList.remove('hidden');
        
    } else {
        const aBtn = document.getElementById('adminBtn'); if(aBtn) aBtn.classList.add('hidden'); 
        const mbSec = document.getElementById('myBookingsSection');
        if(mbSec) mbSec.classList.add('hidden'); 
        if(schedSec) schedSec.classList.add('hidden');
        if (typeof resetEditState === 'function') resetEditState();
    }
}

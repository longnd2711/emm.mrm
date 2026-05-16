// ==========================================
// HÀM GỌI API CORE
// ==========================================
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

// ==========================================
// CÁC HÀM TẢI DỮ LIỆU DÙNG CHUNG
// ==========================================
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
            
            // Trigger render methods if they exist on the current page
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

async function loadData() {
    toggleLoading(true);
    await apiCall('moveCompletedBookingsToDone');
    await refreshBookingsData(); 
    
    if(!hasCheckedDeepLink && currentUser && typeof checkDeepLink === 'function') {
        checkDeepLink();
    }
    
    if (currentUser && currentUser.msnv) {
        const resRole = await apiCall('checkUserRole', { msnv: currentUser.msnv });
        if (resRole.success) {
            if (currentUser.role !== resRole.role) {
                currentUser.role = resRole.role; 
                localStorage.setItem('emm_user', JSON.stringify(currentUser));
                applyAuthState(); 
                showToast("Quyền hạn của bạn đã được hệ thống cập nhật lại.", "info");
            }
        } else if (resRole.error === "deleted") {
            logout(); showToast("Tài khoản của bạn không còn tồn tại trên hệ thống.", "error");
        }
    }
    toggleLoading(false);
}

function startBackgroundSync() {
    setInterval(async () => {
        await apiCall('moveCompletedBookingsToDone');
        await refreshBookingsData();
    }, 300000); // 5 phút
}

async function loadBasicUsersData() {
    if (!currentUser) return;
    const res = await apiCall('getBasicUsers');
    if(Array.isArray(res)) allUsersBasicList = res;
}

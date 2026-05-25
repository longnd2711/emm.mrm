/**
 * TỆP: room.js
 * Chức năng: Điều khiển giao diện Smart Signage cho Role ROOM
 */

let currentActiveMeeting = null;

document.addEventListener("DOMContentLoaded", () => {
    initRoomPage();
    // Chạy đồng hồ mỗi giây
    setInterval(updateClock, 1000);
    // Tự động làm mới mỗi 600 giây
    setInterval(refreshData, 600000);
});

async function initRoomPage() {
    const userStr = localStorage.getItem('emm_user');
    if (!userStr) { window.location.href = 'index.html'; return; }
    
    currentUser = JSON.parse(userStr);
    if (currentUser.role !== 'ROOM') {
        alert("Tài khoản này không có quyền truy cập Room Dashboard");
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('displayRoomName').innerText = currentUser.name;
    await refreshData();
}

function updateClock() {
    const now = new Date();
    document.getElementById('digitalClock').innerText = now.toLocaleTimeString('vi-VN', { hour12: false });
}

async function refreshData() {
    showRoomLoading(true);
    // Gọi hàm loadData từ core.js (Đã gộp API getInitialData)
    await loadData(); 
    processRoomSchedule();
    showRoomLoading(false);
}

function processRoomSchedule() {
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const currentTimeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');

    // Lọc cuộc họp của đúng phòng này trong ngày hôm nay
    const myRoomMeetings = allBookings.filter(b => 
        b["Phòng họp"] === currentUser.name && 
        b["Ngày họp"] === todayStr
    );

    // Tìm cuộc họp đang diễn ra
    const active = myRoomMeetings.find(b => {
        const start = cleanTime(b["Bắt đầu"]);
        const end = cleanTime(b["Kết thúc"]);
        return currentTimeStr >= start && currentTimeStr < end;
    });

    currentActiveMeeting = active || null;
    renderRoomUI();
}

function renderRoomUI() {
    const statusBadge = document.getElementById('roomStatusBadge');
    const freeView = document.getElementById('noMeetingView');
    const activeView = document.getElementById('activeMeetingView');

    if (!currentActiveMeeting) {
        statusBadge.innerText = "PHÒNG TRỐNG";
        statusBadge.className = "px-12 py-6 rounded-2xl text-4xl font-bold shadow-2xl status-free animate-pulse";
        freeView.classList.remove('hidden');
        activeView.classList.add('hidden');
        document.getElementById('checklistContainer').innerHTML = "";
        document.getElementById('fileListContainer').innerHTML = "";
    } else {
        statusBadge.innerText = "ĐANG HỌP";
        statusBadge.className = "px-12 py-6 rounded-2xl text-4xl font-bold shadow-2xl status-occupied";
        freeView.classList.add('hidden');
        activeView.classList.remove('hidden');

        // Điền thông tin
        document.getElementById('meetingTitle').innerText = currentActiveMeeting["Tên cuộc họp"];
        document.getElementById('meetingTime').innerText = `${currentActiveMeeting["Bắt đầu"]} - ${currentActiveMeeting["Kết thúc"]}`;
        document.getElementById('meetingOwner').innerText = "Chủ trì: " + currentActiveMeeting["Người đăng ký"];

        // Render khách mời
        const guestsStr = currentActiveMeeting["Khách mời"] || "";
        const guestsArr = guestsStr.split(',').filter(g => g.trim());
        document.getElementById('meetingGuests').innerHTML = guestsArr.map(g => 
            `<span class="bg-white/10 px-4 py-2 rounded-xl border border-white/10 text-xl">${g.split('@')[0]}</span>`
        ).join('');

        // Render Checklist
        renderChecklist(currentActiveMeeting["Checklist"]);
        
        // Render File đính kèm
        loadFiles(currentActiveMeeting["Folder ID"]);
    }
}

// Xử lý Checklist theo yêu cầu: Xuống dòng tạo checkbox
function renderChecklist(dataStr) {
    const container = document.getElementById('checklistContainer');
    // Giả định dữ liệu lưu dạng text: "[] Việc 1\n[x] Việc 2"
    const lines = dataStr ? dataStr.split('\n') : [""];
    
    container.innerHTML = lines.map((line, idx) => {
        const isDone = line.startsWith('[x]');
        const text = line.replace(/^\[ \]|^\[x\]/, '').trim();
        return `
            <div class="flex items-center gap-4 bg-white/5 p-4 rounded-2xl">
                <input type="checkbox" ${isDone ? 'checked' : ''} onchange="updateChecklistData()" 
                       class="w-8 h-8 rounded-lg accent-emerald-500">
                <input type="text" value="${text}" onkeydown="handleChecklistKey(event, ${idx})"
                       class="flex-1 bg-transparent border-none outline-none text-2xl font-medium text-slate-200"
                       placeholder="Nhập nội dung và nhấn Enter...">
            </div>
        `;
    }).join('');
}

function handleChecklistKey(e, index) {
    if (e.key === "Enter") {
        e.preventDefault();
        const container = document.getElementById('checklistContainer');
        const lines = Array.from(container.querySelectorAll('div')).map(div => {
            const cb = div.querySelector('input[type="checkbox"]').checked;
            const txt = div.querySelector('input[type="text"]').value;
            return (cb ? "[x] " : "[ ] ") + txt;
        });
        lines.splice(index + 1, 0, "[ ] ");
        renderChecklist(lines.join('\n'));
        // Focus vào ô mới
        setTimeout(() => {
            container.querySelectorAll('input[type="text"]')[index + 1].focus();
        }, 10);
    }
}

async function loadFiles(folderId) {
    if (!folderId) return;
    const res = await apiCall('getMeetingFiles', { folderId: folderId });
    const container = document.getElementById('fileListContainer');
    if (Array.isArray(res) && res.length > 0) {
        container.innerHTML = res.map(f => `
            <a href="${f.link}" target="_blank" class="flex items-center gap-3 p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-all">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"></path></svg>
                ${f.name}
            </a>
        `).join('');
    } else {
        container.innerHTML = '<p class="text-slate-500 italic">Chưa có tài liệu đính kèm.</p>';
    }
}

async function saveWorkspace() {
    if (!currentActiveMeeting) return;
    showRoomLoading(true);

    const container = document.getElementById('checklistContainer');
    const checklistStr = Array.from(container.querySelectorAll('div')).map(div => {
        const cb = div.querySelector('input[type="checkbox"]').checked;
        const txt = div.querySelector('input[type="text"]').value;
        return (cb ? "[x] " : "[ ] ") + txt;
    }).join('\n');

    const res = await apiCall('updateMeetingResults', {
        rowIndex: currentActiveMeeting.rowIndex,
        checklist: checklistStr,
        editorRole: 'ROOM' // Quan trọng: Để Backend biết không gửi email
    });

    if (res.success) {
        showToast("Đã lưu nội dung cuộc họp!", "success");
        await refreshData();
    }
    showRoomLoading(false);
}

async function handleEndEarlyRoom() {
    if (!currentActiveMeeting) return;
    if (!confirm("Xác nhận KẾT THÚC cuộc họp ngay bây giờ?")) return;

    showRoomLoading(true);
    const now = new Date();
    const newEndTime = now.getHours().toString().padStart(2,'0') + ":" + Math.floor(now.getMinutes() / 15) * 15;

    const res = await apiCall('endEarlyBooking', {
        rowIndex: currentActiveMeeting.rowIndex,
        newEndTime: newEndTime,
        editorName: currentUser.name,
        editorRole: 'ROOM'
    });

    if (res.success) {
        showToast("Cuộc họp đã kết thúc.", "success");
        await refreshData();
    }
    showRoomLoading(false);
}

function showRoomLoading(show) {
    document.getElementById('roomLoading').classList.toggle('hidden', !show);
}
/**
 * TỆP: room.js
 * CHỨC NĂNG: Xử lý giao diện 75 inch, Role ROOM
 */

let currentRoomMeeting = null;

document.addEventListener("DOMContentLoaded", () => {
    initRoomDashboard();
    setInterval(updateClock, 1000);
    setInterval(syncRoomData, 600000); // 10 phút refresh
});

async function initRoomDashboard() {
    const userStr = localStorage.getItem('emm_user');
    if (!userStr) { window.location.href = 'index.html'; return; }
    
    currentUser = JSON.parse(userStr);
    if (currentUser.role !== 'ROOM') {
        alert("Chế độ Dashboard chỉ dành cho tài khoản phòng họp.");
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('displayRoomName').innerText = currentUser.name;
    await syncRoomData();
}

function updateClock() {
    const now = new Date();
    document.getElementById('digitalClock').innerText = now.toLocaleTimeString('vi-VN', { hour12: false });
}

function setRoomTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('emm_theme', theme);
}

async function syncRoomData() {
    toggleRoomLoader(true);
    await loadData(); // Hàm từ core.js
    
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const currentTime = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');

    // Lọc lịch của phòng này trong hôm nay
    const myMeetings = allBookings.filter(b => b["Phòng họp"] === currentUser.name && b["Ngày họp"] === todayStr);

    // Tìm cuộc họp hiện tại
    const active = myMeetings.find(b => {
        const s = cleanTime(b["Bắt đầu"]), e = cleanTime(b["Kết thúc"]);
        return currentTime >= s && currentTime < e;
    });

    currentRoomMeeting = active || null;

    if (currentRoomMeeting) {
        renderActiveView(currentRoomMeeting);
    } else {
        renderFreeView(myMeetings, currentTime);
    }
    toggleRoomLoader(false);
}

// GIAO DIỆN PHÒNG TRỐNG: Giống hình ảnh tham chiếu
function renderFreeView(meetings, currentTime) {
    document.getElementById('viewActive').classList.add('hidden');
    document.getElementById('viewFree').classList.remove('hidden');
    
    const statusIdx = document.getElementById('statusIndicator');
    statusIdx.innerText = "PHÒNG TRỐNG";
    statusIdx.className = "px-8 py-3 rounded-full text-2xl font-bold uppercase bg-emerald-500 text-white shadow-lg shadow-emerald-200 animate-pulse";

    const upcoming = meetings.filter(b => cleanTime(b["Bắt đầu"]) > currentTime)
                             .sort((a,b) => cleanTime(a["Bắt đầu"]).localeCompare(cleanTime(b["Bắt đầu"])));

    const listContainer = document.getElementById('upcomingList');
    if (upcoming.length === 0) {
        listContainer.innerHTML = `<div class="p-10 text-3xl text-center text-slate-400 font-medium italic">Không còn cuộc họp nào trong hôm nay</div>`;
    } else {
        listContainer.innerHTML = upcoming.map(b => `
            <div class="flex items-center p-10 border-b border-slate-100 last:border-0">
                <div class="text-4xl font-bold text-slate-400 w-48">${cleanTime(b["Bắt đầu"])}</div>
                <div class="text-4xl font-semibold text-slate-700">${b["Tên cuộc họp"]}</div>
            </div>
        `).join('');
    }
}

// GIAO DIỆN ĐANG HỌP: Meeting Workspace
function renderActiveView(meeting) {
    document.getElementById('viewFree').classList.add('hidden');
    document.getElementById('viewActive').classList.remove('hidden');

    const statusIdx = document.getElementById('statusIndicator');
    statusIdx.innerText = "ĐANG CÓ HỌP";
    statusIdx.className = "px-8 py-3 rounded-full text-2xl font-bold uppercase bg-red-600 text-white shadow-lg shadow-red-200";

    document.getElementById('activeTitle').innerText = meeting["Tên cuộc họp"];
    document.getElementById('activeTime').innerText = `${meeting["Bắt đầu"]} - ${meeting["Kết thúc"]}`;
    document.getElementById('activeOwner').innerText = "Chủ trì: " + meeting["Người đăng ký"];
    
    // Render khách mời
    const guests = meeting["Khách mời"] ? meeting["Khách mời"].split(',') : [];
    document.getElementById('activeGuests').innerHTML = guests.map(g => 
        `<span class="bg-blue-500/10 text-blue-500 px-4 py-2 rounded-xl border border-blue-500/20 text-2xl font-bold">${g.split('@')[0]}</span>`
    ).join('');

    // Render Checklist (Lưu dạng: "[] Nội dung\n[x] Nội dung")
    renderRoomChecklist(meeting["Checklist"]);

    // Render Notes
    document.getElementById('roomMeetingNotes').value = meeting["Ghi chú họp"] || "";

    // Load Files
    loadRoomFiles(meeting["Folder ID"]);
}

function renderRoomChecklist(dataStr) {
    const container = document.getElementById('roomChecklistContainer');
    const lines = dataStr ? dataStr.split('\n') : [""];
    
    container.innerHTML = lines.map((line, idx) => {
        const isDone = line.startsWith('[x]');
        const text = line.replace(/^\[ \]|^\[x\]/, '').trim();
        return `
            <div class="checklist-item flex items-center gap-5 bg-white/5 p-5 rounded-2xl transition-all">
                <input type="checkbox" ${isDone ? 'checked' : ''} class="w-10 h-10 rounded-xl accent-emerald-500">
                <input type="text" value="${text}" onkeydown="handleRoomChecklistKey(event, ${idx})"
                       class="flex-1 bg-transparent border-none outline-none text-3xl font-medium"
                       placeholder="Nhập nội dung thảo luận...">
            </div>
        `;
    }).join('');
}

function handleRoomChecklistKey(e, index) {
    if (e.key === "Enter") {
        e.preventDefault();
        const container = document.getElementById('roomChecklistContainer');
        const items = Array.from(container.querySelectorAll('.checklist-item'));
        const lines = items.map(item => {
            const cb = item.querySelector('input[type="checkbox"]').checked;
            const txt = item.querySelector('input[type="text"]').value;
            return (cb ? "[x] " : "[ ] ") + txt;
        });
        lines.splice(index + 1, 0, "[ ] ");
        renderRoomChecklist(lines.join('\n'));
        setTimeout(() => {
            container.querySelectorAll('input[type="text"]')[index + 1].focus();
        }, 50);
    }
}

async function addGuestFromRoom() {
    const input = document.getElementById('addGuestInput');
    const email = input.value.trim();
    if (!email || !email.includes('@')) { alert("Email không hợp lệ"); return; }

    const currentGuests = currentRoomMeeting["Khách mời"] || "";
    const newGuests = currentGuests ? currentGuests + "," + email : email;
    
    toggleRoomLoader(true);
    const res = await apiCall('updateMeetingResults', {
        rowIndex: currentRoomMeeting.rowIndex,
        guests: newGuests,
        editorRole: 'ROOM'
    });
    if(res.success) { input.value = ""; await syncRoomData(); }
    toggleRoomLoader(false);
}

async function saveRoomWorkspace() {
    if (!currentRoomMeeting) return;
    toggleRoomLoader(true);

    const checklistContainer = document.getElementById('roomChecklistContainer');
    const checklistStr = Array.from(checklistContainer.querySelectorAll('.checklist-item')).map(item => {
        const cb = item.querySelector('input[type="checkbox"]').checked;
        const txt = item.querySelector('input[type="text"]').value;
        return (cb ? "[x] " : "[ ] ") + txt;
    }).join('\n');

    const notes = document.getElementById('roomMeetingNotes').value;

    const res = await apiCall('updateMeetingResults', {
        rowIndex: currentRoomMeeting.rowIndex,
        checklist: checklistStr,
        notes: notes,
        editorRole: 'ROOM'
    });

    if (res.success) {
        showToast("Đã lưu dữ liệu họp", "success");
        await syncRoomData();
    }
    toggleRoomLoader(false);
}

async function loadRoomFiles(folderId) {
    const container = document.getElementById('roomFilesList');
    if (!folderId) { container.innerHTML = '<p class="opacity-40 italic text-xl">Không có thư mục tài liệu</p>'; return; }
    
    const res = await apiCall('getMeetingFiles', { folderId: folderId });
    if (Array.isArray(res) && res.length > 0) {
        container.innerHTML = res.map(f => `
            <a href="${f.link}" target="_blank" class="flex items-center gap-4 p-5 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-blue-500 hover:bg-blue-500/20 transition-all text-2xl font-bold">
                <span class="text-3xl">📄</span> ${f.name}
            </a>
        `).join('');
    } else {
        container.innerHTML = '<p class="opacity-40 italic text-xl">Chưa có tệp nào được tải lên</p>';
    }
}

async function handleEndEarlyRoom() {
    if (!currentRoomMeeting || !confirm("Kết thúc sớm cuộc họp và giải phóng phòng?")) return;
    
    toggleRoomLoader(true);
    const now = new Date();
    const newEndTime = now.getHours().toString().padStart(2,'0') + ":" + Math.floor(now.getMinutes() / 15) * 15;

    const res = await apiCall('endEarlyBooking', {
        rowIndex: currentRoomMeeting.rowIndex,
        newEndTime: newEndTime,
        editorName: currentUser.name,
        editorRole: 'ROOM'
    });

    if (res.success) { await syncRoomData(); }
    toggleRoomLoader(false);
}

function toggleRoomLoader(show) {
    document.getElementById('roomLoader').classList.toggle('hidden', !show);
}
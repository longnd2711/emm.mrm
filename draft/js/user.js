let fpInstance = null;

document.addEventListener("DOMContentLoaded", () => { initUserPage(); });

function initUserPage() {
    initDateOptions();
    initScheduleDateSelect();
    populateUserRooms();
    initFlatpickr();

    const savedUser = localStorage.getItem('emm_user');
    if(savedUser) {
        currentUser = JSON.parse(savedUser);
        applyAuthState();
        loadData();
    }
    initGuestSearch();
}

function populateUserRooms() {
    const rs = document.getElementById('roomSelect');
    if (!rs) return;
    rs.innerHTML = '<option value="">-- Chọn phòng --</option>';
    APP_ROOMS.forEach(r => rs.innerHTML += `<option value="${r}">${r}</option>`);
}

function initFlatpickr() {
    fpInstance = flatpickr("#multiDateInput", {
        mode: "multiple", dateFormat: "Y-m-d", minDate: "today",
        onChange: (selectedDates) => { updateStartTimes(); }
    });
}

function toggleMultiDate() {
    const isMulti = document.getElementById('multiDateCheck').checked;
    document.getElementById('dateSelect').classList.toggle('hidden', isMulti);
    document.getElementById('multiDateInput').classList.toggle('hidden', !isMulti);
    if(isMulti) { document.getElementById('dateSelect').required = false; }
    else { document.getElementById('dateSelect').required = true; }
}

/**
 * RENDER LỊCH CỦA TÔI
 */
function renderMyBookings() {
    if (!currentUser) return;
    const container = document.getElementById('myBookingsList');
    const myEvents = allBookings.filter(b => 
        String(b["Mã NV"]) == String(currentUser.msnv) || 
        String(b["Khách mời"]).toLowerCase().includes(currentUser.email.toLowerCase())
    );
    
    if (myEvents.length > 0) {
        document.getElementById('myBookingsSection').classList.remove('hidden');
        container.innerHTML = myEvents.slice(0, 5).map(b => `
            <div class="p-4 bg-white border rounded-2xl shadow-sm flex justify-between items-center border-l-4 ${String(b["Mã NV"]) == String(currentUser.msnv) ? 'border-blue-500' : 'border-purple-500'}">
                <div class="text-sm">
                    <p class="font-bold text-slate-800">${b["Tên cuộc họp"]}</p>
                    <p class="text-slate-500 text-xs">${b["Ngày họp"] || b["Bắt đầu"].split(' ')[0]} | ${cleanTime(b["Bắt đầu"])} - ${cleanTime(b["Kết thúc"])}</p>
                    <p class="text-indigo-600 font-bold text-[10px] uppercase mt-1">${b["Phòng họp"]}</p>
                </div>
                <button onclick="handleMeetingClick(${b.rowIndex})" class="p-2 bg-slate-50 rounded-full hover:bg-blue-50 text-blue-600">➔</button>
            </div>
        `).join('');
    }
}

/**
 * RENDER LƯỚI LỊCH BIỂU (QUAN TRỌNG)
 */
function renderSchedule() {
    const dateStr = document.getElementById('scheduleDateSelect').value;
    if (!dateStr) return;

    const r1 = currentScheduleTab === 1 ? APP_ROOMS[0] : APP_ROOMS[2];
    const r2 = currentScheduleTab === 1 ? APP_ROOMS[1] : APP_ROOMS[3];

    document.getElementById('schedCol1Title').innerText = r1;
    document.getElementById('schedCol2Title').innerText = r2;

    const dayData = allBookings.filter(b => (b["Ngày họp"] || b["Bắt đầu"].split(' ')[0]) === dateStr);
    
    drawColumn('schedCol1Events', r1, dayData);
    drawColumn('schedCol2Events', r2, dayData);
}

function drawColumn(id, room, data) {
    const container = document.getElementById(id);
    container.innerHTML = '';
    const roomEvents = data.filter(b => b["Phòng họp"] === room);
    
    roomEvents.forEach(b => {
        const start = b["Bắt đầu"].split(' ')[1];
        const end = b["Kết thúc"].split(' ')[1];
        const top = (timeToMin(start) - 480) * PIXELS_PER_MINUTE;
        const height = (timeToMin(end) - timeToMin(start)) * PIXELS_PER_MINUTE;
        
        const isMine = String(b["Mã NV"]) == String(currentUser.msnv);
        const isGuest = String(b["Khách mời"]).toLowerCase().includes(currentUser.email.toLowerCase());
        
        const div = document.createElement('div');
        div.className = `schedule-block ${isMine ? 'bg-blue-500' : (isGuest ? 'bg-orange-500' : 'bg-slate-400')}`;
        div.style.top = top + 'px';
        div.style.height = height + 'px';
        div.innerHTML = `<p class="font-bold truncate">${b["Tên cuộc họp"]}</p><p class="opacity-80">${start}-${end}</p>`;
        div.onclick = () => handleMeetingClick(b.rowIndex);
        container.appendChild(div);
    });
}

function timeToMin(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

/**
 * CHỌN NHANH & GHI CHÚ
 */
function addGuestByGroup(group) {
    const members = allUsersBasicList.filter(u => u.group === group).map(u => u.email);
    members.forEach(email => { if(!currentSelectedGuests.includes(email)) currentSelectedGuests.push(email); });
    renderGuestTags();
    showToast(`Đã thêm nhóm ${group}`, "success");
}

function addQuickNote(id, text) {
    const el = document.getElementById(id);
    el.value += (el.value ? "\n" : "") + "- [ ] " + text;
}
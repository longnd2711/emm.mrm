// ============================================================================
// FORM.JS - QUẢN LÝ FORM ĐĂNG KÝ, CHỌN NGÀY/GIỜ VÀ KHÁCH MỜI
// ============================================================================

/**
 * Biến lưu trữ danh sách file đang chờ tải lên
 */
let selectedFilesForUpload = [];

/**
 * Biến lưu trữ danh sách file cũ đã có trên Drive (Dùng khi Sửa/Tải thêm)
 */
let existingFilesList = [];

// ----------------------------------------------------------------------------
// CẤU HÌNH ĐẶT LỊCH NHIỀU NGÀY (FLATPICKR)
// ----------------------------------------------------------------------------
/**
 * Khởi tạo plugin Flatpickr cho phép chọn tối đa 6 ngày họp không liên tiếp.
 */
function initFlatpickr() {
    const multiDateInput = document.getElementById("multiDateInput");
    if (!multiDateInput) return; // Nếu không có ở trang admin/editor

    const now = new Date();
    const maxDate = new Date();
    maxDate.setDate(now.getDate() + 31); // Tối đa 31 ngày tới

    fpInstance = flatpickr("#multiDateInput", {
        mode: "multiple",
        locale: "vn",
        dateFormat: "Y-m-d",
        minDate: "today",
        maxDate: maxDate,
        disable: [
            function(date) {
                return (date.getDay() === 0); // Vô hiệu hóa Chủ nhật
            }
        ],
        onChange: function(selectedDates, dateStr, instance) {
            // Ràng buộc tối đa 6 ngày theo quy định nghiệp vụ
            if (selectedDates.length > 6) {
                showToast("Chỉ được chọn tối đa 6 ngày!", "error");
                selectedDates.pop(); 
                instance.setDate(selectedDates);
            }
            // Khóa các ngày còn lại nếu đã đủ 6 để tối ưu hiệu năng và giới hạn hệ thống
            if (selectedDates.length === 6) {
                instance.set('disable', [
                    function(date) {
                        const isSunday = date.getDay() === 0;
                        const isSelected = selectedDates.some(d => d.getTime() === date.getTime());
                        return isSunday || !isSelected; 
                    }
                ]);
            } else {
                instance.set('disable', [ function(date) { return date.getDay() === 0; } ]);
            }
            updateStartTimes();
        }
    });
}

/**
 * Chuyển đổi trạng thái Form giữa đặt 1 ngày và đặt chuỗi ngày.
 */
function toggleMultiDate() {
    const isChecked = document.getElementById('multiDateCheck').checked;
    const singleSelect = document.getElementById('dateSelect');
    const multiInput = document.getElementById('multiDateInput');

    if (isChecked) {
        singleSelect.classList.add('hidden');
        singleSelect.required = false;
        singleSelect.name = ""; // Xóa name để không bị gửi đi
        
        multiInput.classList.remove('hidden');
        multiInput.required = true;
        multiInput.name = "dates"; // Dùng 'dates' cho nhiều ngày
        
        if(fpInstance) fpInstance.clear();
    } else {
        singleSelect.classList.remove('hidden');
        singleSelect.required = true;
        singleSelect.name = "date";
        
        multiInput.classList.add('hidden');
        multiInput.required = false;
        multiInput.name = "";
    }
    updateStartTimes(); 
}

// ----------------------------------------------------------------------------
// LOGIC TÍNH TOÁN THỜI GIAN TRỐNG (TIME SLOTS)
// ----------------------------------------------------------------------------

/**
 * Cập nhật danh sách giờ bắt đầu khả dụng dựa trên ngày và phòng đã chọn.
 */
function updateStartTimes() {
    const isMultiCheck = document.getElementById('multiDateCheck');
    const isMulti = isMultiCheck ? isMultiCheck.checked : false;
    
    const dateEl = document.getElementById('dateSelect'), roomEl = document.getElementById('roomSelect'), timeContainer = document.getElementById('timeContainer'), startEl = document.getElementById('startSelect'), endEl = document.getElementById('endSelect');
    const multiDates = document.getElementById('multiDateInput') ? document.getElementById('multiDateInput').value : '';
    
    if(!dateEl || !roomEl || !timeContainer || !startEl || !endEl) return;
    
    const date = dateEl.value, room = roomEl.value;
    
    if (!room || (!isMulti && !date) || (isMulti && !multiDates)) { 
        timeContainer.classList.add('hidden'); 
        return; 
    }
    timeContainer.classList.remove('hidden');
    
    let options = '<option value="">Chọn giờ</option>';
    const isAdminOrEditor = (currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Editor'));
    
    if (!isMulti) {
        const editId = document.getElementById('editRowIndex') ? document.getElementById('editRowIndex').value : '';
        const bookedRanges = allBookings.filter(b => b["meeting_date"] === date && b["room_name"] === room && b.rowIndex != editId);
        
        const now = new Date(), isToday = date === getLocalDateString(now);
        
        // --- IMPROVEMENT: ALLOW PAST FOR ADMIN/EDITOR ---
        let bufferMinutes = isAdminOrEditor ? -99999 : BLOCK_EDIT_MINUTES; 
        const currentTotalMin = now.getHours() * 60 + now.getMinutes() + bufferMinutes;
        
        for (let h = 8; h <= 16; h++) {
            for (let m of [0, 15, 30, 45]) {
                let timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`, totalMin = h * 60 + m;
                if (!isAdminOrEditor && isToday && totalMin <= currentTotalMin && !editId) continue;
                let isBooked = bookedRanges.some(b => timeStr >= cleanTime(b["start_time"]) && timeStr < cleanTime(b["end_time"]));
                if (!isBooked) options += `<option value="${timeStr}">${timeStr}</option>`;
            }
        }
    } else {
        for (let h = 8; h <= 16; h++) {
            for (let m of [0, 15, 30, 45]) {
                let timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                options += `<option value="${timeStr}">${timeStr}</option>`;
            }
        }
    }
    
    startEl.innerHTML = options; endEl.innerHTML = '<option value="">--</option>'; 
}

/**
 * Cập nhật danh sách giờ kết thúc khả dụng dựa trên giờ bắt đầu đã chọn.
 */
function updateEndTimes() {
    const isMultiCheck = document.getElementById('multiDateCheck');
    const isMulti = isMultiCheck ? isMultiCheck.checked : false;

    const startEl = document.getElementById('startSelect'), dateEl = document.getElementById('dateSelect'), roomEl = document.getElementById('roomSelect'), endEl = document.getElementById('endSelect');
    if(!startEl || !dateEl || !roomEl || !endEl) return;
    
    const startTime = startEl.value, date = dateEl.value, room = roomEl.value;
    if (!startTime) { endEl.innerHTML = '<option value="">--</option>'; return; }
    
    let options = '<option value="">Chọn giờ</option>';
    let startMin = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
    let limitEnd = "17:00";

    if (!isMulti) {
        const editId = document.getElementById('editRowIndex') ? document.getElementById('editRowIndex').value : '';
        const bookedRanges = allBookings.filter(b => b["meeting_date"] === date && b["room_name"] === room && b.rowIndex != editId).sort((a, b) => cleanTime(a["start_time"]).localeCompare(cleanTime(b["start_time"])));
        const nextBooking = bookedRanges.find(b => cleanTime(b["start_time"]) > startTime);
        if (nextBooking) limitEnd = cleanTime(nextBooking["start_time"]);
    }
    
    for (let h = 8; h <= 17; h++) {
        for (let m of [0, 15, 30, 45]) {
            if (h === 17 && m > 0) continue; 
            let timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`, totalMin = h * 60 + m;
            if (totalMin > startMin && timeStr <= limitEnd) options += `<option value="${timeStr}">${timeStr}</option>`;
        }
    }
    endEl.innerHTML = options;
}

// ----------------------------------------------------------------------------
// QUẢN LÝ KHÁCH MỜI TRÊN FORM (GUESTS MANAGEMENT)
// ----------------------------------------------------------------------------

/**
 * Thêm khách mời vào danh sách của Form.
 */
function addGuestToForm(email, name) { 
    if (!currentSelectedGuests.includes(email)) currentSelectedGuests.push(email); 
    document.getElementById('guestSearchInput').value = ''; 
    document.getElementById('guestSuggestions').classList.add('hidden'); 
    renderGuestTags('guestTagsContainer', 'fGuests'); 
}

/**
 * Vẽ các thẻ (tags) khách mời đã chọn.
 */
function renderGuestTags(containerId, inputId) {
    const container = document.getElementById(containerId), hiddenInput = document.getElementById(inputId);
    if(!container || !hiddenInput) return;
    hiddenInput.value = currentSelectedGuests.join(',');
    container.innerHTML = currentSelectedGuests.map(email => {
        const user = allUsersBasicList.find(u => u.email === email), name = user ? user.name : email.split('@')[0];
        return `<div class="bg-indigo-50 text-indigo-700 px-2.5 py-1.5 rounded-lg text-[11px] font-bold tracking-wide flex items-center gap-1.5 border border-indigo-100 shadow-sm animate-[slideUp_0.2s_ease-out]">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>${name}
                <button type="button" onclick="removeGuest('${email}')" class="hover:bg-indigo-200 p-0.5 rounded-full text-indigo-500 hover:text-indigo-800 transition-colors ml-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>`;
    }).join('');
}

// ----------------------------------------------------------------------------
// QUẢN LÝ FILE ĐÍNH KÈM (FILE ATTACHMENTS)
// ----------------------------------------------------------------------------

/**
 * Xử lý khi người dùng chọn file từ máy tính
 */
async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Kiểm tra giới hạn số lượng file (Tổng cả cũ và mới)
    if (existingFilesList.length + selectedFilesForUpload.length + files.length > 5) {
        showToast("Chỉ được đính kèm tối đa 5 tài liệu cho mỗi cuộc họp!", "error");
        return;
    }

    // 1. Kiểm tra giới hạn số lượng file (Sử dụng serverAppConfig)
    const totalFiles = existingFilesList.length + selectedFilesForUpload.length + files.length;
    if (totalFiles > serverAppConfig.maxFileCount) {
        showToast(`Chỉ được đính kèm tối đa ${serverAppConfig.maxFileCount} tài liệu cho mỗi cuộc họp!`, "error");
        e.target.value = '';
        return;
    }

    // 2. Kiểm tra dung lượng (Sử dụng serverAppConfig)
    const maxSizeBytes = serverAppConfig.maxTotalSizeMb * 1024 * 1024;
    let currentTotalSize = selectedFilesForUpload.reduce((sum, f) => sum + f.size, 0);
    let newFilesSize = files.reduce((sum, f) => sum + f.size, 0);
    
    if ((currentTotalSize + newFilesSize) > maxSizeBytes) {
        showToast(`Tổng dung lượng tài liệu mới không được vượt quá ${serverAppConfig.maxTotalSizeMb}MB!`, "error");
        e.target.value = '';
        return;
    }

    toggleLoading(true);
    for (let file of files) {
        try {
            const base64 = await convertFileToBase64(file);
            selectedFilesForUpload.push({
                name: file.name,
                type: file.type,
                size: file.size,
                base64: base64
            });
        } catch (err) {
            console.error("Lỗi đọc file:", err);
            showToast(`Không thể đọc file ${file.name}`, "error");
        }
    }
    toggleLoading(false);
    renderSelectedFiles();
    e.target.value = ''; // Reset input để có thể chọn lại cùng 1 file nếu đã xóa
}

/**
 * Chuyển đổi File sang chuỗi Base64
 */
function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * Hiển thị danh sách file (Cả cũ trên Drive và mới đang chờ) lên giao diện
 */
function renderSelectedFiles() {
    const container = document.getElementById('fileListContainer');
    if (!container) return;
    
    let html = '';

    // 1. Hiển thị file cũ (đã có trên Drive)
    if (existingFilesList.length > 0) {
        html += `<p class="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Tài liệu đã tải lên:</p>`;
        existingFilesList.forEach((file, index) => {
            // Chỉ người tạo hoặc Admin mới có quyền xóa file cũ. 
            // Khách mời trong chế độ isOnlyAddingFiles sẽ không thấy nút xóa.
            const canDeleteOld = !isOnlyAddingFiles; 
            
            html += `
                <div class="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl mb-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <a href="${file.url}" target="_blank" class="text-xs font-bold text-emerald-700 truncate hover:underline">${file.name}</a>
                    </div>
                    ${canDeleteOld ? `
                    <button type="button" onclick="handleDeleteExistingFile('${file.name}', ${index})" class="p-1 text-emerald-400 hover:text-red-500 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>` : ''}
                </div>
            `;
        });
    }

    // 2. Hiển thị file mới (đang chờ tải lên)
    if (selectedFilesForUpload.length > 0) {
        html += `<p class="text-[10px] font-bold text-blue-400 uppercase mt-3 mb-2 tracking-wider">Tài liệu mới chờ lưu:</p>`;
        selectedFilesForUpload.forEach((file, index) => {
            html += `
                <div class="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-100 rounded-xl mb-2 animate-[slideUp_0.2s_ease-out]">
                    <div class="flex items-center gap-2 min-w-0">
                        <svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        <span class="text-xs font-medium text-blue-700 truncate">${file.name}</span>
                    </div>
                    <button type="button" onclick="removeFileFromList(${index})" class="p-1 text-blue-400 hover:text-red-500 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            `;
        });
    }

    if (html === '') {
        container.innerHTML = '<p class="text-center text-[11px] text-slate-400 italic py-2">Chưa có tài liệu đính kèm.</p>';
    } else {
        container.innerHTML = html;
    }
}

/**
 * Xử lý xóa file đã tồn tại trên Drive
 */
async function handleDeleteExistingFile(fileName, index) {
    const idx = document.getElementById('editRowIndex').value;
    const b = allBookings.find(item => item.rowIndex == idx);
    if (!b || !confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn file "${fileName}"?`)) return;

    const customEventID = String(b["event_id"]).replace(/^'/, '');
    toggleLoading(true);
    const res = await apiCall('deleteMeetingFile', { customEventID, fileName });
    toggleLoading(false);

    if (res.success) {
        existingFilesList.splice(index, 1);
        renderSelectedFiles();
        showToast("Đã xóa file thành công.", "success");
    } else {
        showToast(res.error, "error");
    }
}

/**
 * Xóa file khỏi danh sách chờ
 */
function removeFileFromList(index) {
    selectedFilesForUpload.splice(index, 1);
    renderSelectedFiles();
}

// ----------------------------------------------------------------------------
// XỬ LÝ SUBMIT VÀ TRẠNG THÁI FORM (SUBMISSION & STATE)
// ----------------------------------------------------------------------------

/**
 * Xử lý sự kiện gửi Form đăng ký/cập nhật lịch họp.
 */
async function handleBookingSubmit(e) {
    e.preventDefault();
    const formData = getSafeFormData(e.target);
    if (formData.note) {
        formData.note = normalizeNotes(formData.note);
    }
    if (currentUser) {
        formData.editorName = currentUser.name;
        formData.deptAbbr = currentUser.dept; // 'dept' này lấy từ auth.gs khi login
    } 
    
    // --- START OF CHANGE: Mặc định luôn tạo link Google Meet ---
    formData.useMeet = true;
    formData.files = selectedFilesForUpload;
    formData.isOnlyAddingFiles = isOnlyAddingFiles; // Gửi cờ chế độ tải thêm tài liệu
    // --- END OF CHANGE ---

    if (isOnlyAddingFiles && selectedFilesForUpload.length === 0) {
        showToast("Vui lòng chọn ít nhất một tài liệu mới để tải lên!", "error");
        return;
    }

    toggleLoading(true); 
    const res = await apiCall('saveBooking', { formData: formData, rowIndex: formData.rowIndex });
    toggleLoading(false);

    if (res && res.success) {
        // --- START OF CHANGE: Gán link Meet từ server trả về để hiển thị trong Modal ---
        if (res.meetLink) formData.meetLink = res.meetLink;
        // --- END OF CHANGE ---

        showSuccessModalWithDetails(formData, !!formData.rowIndex);
        resetEditState(); 
        
        if(typeof applyOptimisticUI === 'function') applyOptimisticUI(formData);
        
        refreshBookingsData(); 
    } else {
        if (res && res.error && (res.error.includes("vừa bị người khác đặt") || res.error.includes("đã có người đặt"))) {
            const eModal = document.getElementById('errorModal'), eMsg = document.getElementById('errorModalMsg');
            if (eMsg) eMsg.innerText = res.error;
            if (eModal) { eModal.classList.remove('hidden'); eModal.classList.add('flex'); }
            
            const isMultiCheck = document.getElementById('multiDateCheck');
            if (!(isMultiCheck && isMultiCheck.checked)) resetEditState();
            refreshBookingsData();
        } else { showToast("Lỗi: " + (res ? res.error : "Không thể lưu"), "error"); }
    }
}

/**
 * Đưa thông tin từ một cuộc họp hiện có vào Form để chỉnh sửa.
 * Cải tiến: Hỗ trợ chế độ onlyFiles, xử lý bất đồng bộ để tránh lag UI
 */
async function prepareEdit(idx, onlyFiles = false) {
    const b = allBookings.find(item => item.rowIndex === idx);
    if (!b) return;
    
    isOnlyAddingFiles = onlyFiles;
    const v = document.getElementById('formSection'); if(v) v.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Reset trạng thái form trước khi nạp dữ liệu mới
    resetEditState();
    isOnlyAddingFiles = onlyFiles; // Gán lại sau khi reset

    document.getElementById('editRowIndex').value = idx;
    document.getElementById('fEmpId').value = String(b["employee_id"]).replace(/^'/, '');
    document.getElementById('fUser').value = String(b["user_name"]).replace(/^'/, '');
    document.getElementById('fTitle').value = String(b["title"]).replace(/^'/, '');
    
    const dateSel = document.getElementById('dateSelect');
    if (dateSel) {
        let dateStr = b["meeting_date"];
        if (!Array.from(dateSel.options).some(opt => opt.value === dateStr)) dateSel.innerHTML += `<option value="${dateStr}">${dateStr}</option>`;
        dateSel.value = dateStr;
    }
    
    const fEmail = document.getElementById('fCreatorEmail'); if(fEmail && currentUser) fEmail.value = currentUser.email;

    document.getElementById('roomSelect').value = b["room_name"];
    document.getElementById('fNote').value = String(b["notes"] || "").replace(/^'/, '');
    
    const rawGuests = String(b["guest_email"] || "").replace(/^'/, '');
    currentSelectedGuests = rawGuests ? rawGuests.split(',').map(e => e.trim()).filter(e => e) : [];
    renderGuestTags('guestTagsContainer', 'fGuests');
    
    // --- CẢI TIẾN: HIỂN THỊ THỜI GIAN VÀ MEET LINK NGAY LẬP TỨC (KHÔNG ĐỢI FILE) ---
    updateStartTimes(); 
    document.getElementById('startSelect').value = cleanTime(b["start_time"]);
    updateEndTimes(); 
    document.getElementById('endSelect').value = cleanTime(b["end_time"]);

    const meetLink = String(b["meet_link"]).replace(/^'/, '');
    const meetCtr = document.getElementById('fMeetContainer');
    const meetJoin = document.getElementById('fMeetJoinBtn');
    const meetCopy = document.getElementById('fMeetCopyBtn');
    if (meetLink && meetCtr && meetJoin && meetCopy) {
        meetCtr.classList.remove('hidden');
        meetJoin.href = meetLink;
        meetCopy.onclick = () => copyToClipboard(meetLink);
    } else if (meetCtr) {
        meetCtr.classList.add('hidden');
    }

    // --- THIẾT LẬP TRẠNG THÁI UI (KHÓA/MỞ TRƯỜNG NHẬP) ---
    const inputs = document.querySelectorAll('#bookingForm input:not([type="hidden"]), #bookingForm select, #bookingForm textarea');
    inputs.forEach(input => {
        if (input.id !== 'fileInput') {
            if (isOnlyAddingFiles) {
                if (input.tagName === 'SELECT') {
                    input.style.pointerEvents = 'none';
                } else {
                    input.readOnly = true;
                }
                input.classList.add('bg-slate-50', 'cursor-not-allowed', 'opacity-70');
            } else {
                input.readOnly = false;
                input.style.pointerEvents = 'auto';
                input.classList.remove('bg-slate-50', 'cursor-not-allowed', 'opacity-70');
            }
        }
    });

    const multiToggleWrapper = document.getElementById('multiDateToggleWrapper');
    if (multiToggleWrapper) multiToggleWrapper.classList.toggle('hidden', isOnlyAddingFiles);

    const reasonCtr = document.getElementById('fReasonContainer');
    const reasonInput = document.getElementById('fReason');
    if (reasonCtr) reasonCtr.classList.toggle('hidden', isOnlyAddingFiles);
    if (reasonInput) {
        reasonInput.required = !isOnlyAddingFiles;
        reasonInput.value = ""; 
    }

    // --- CẢI TIẾN: CẤU TRÚC NÚT BẤM (2 NÚT TRÊN 1 DÒNG) ---
    const btnContainer = document.getElementById('formActionContainer');
    const btn = document.getElementById('submitBtn');
    const delBtn = document.getElementById('deleteBtn');

    if (isOnlyAddingFiles) {
        if(btnContainer) btnContainer.className = "pt-2 grid grid-cols-1 gap-3";
        if(btn) { 
            btn.innerText = "Tải lên tài liệu mới"; 
            btn.className = "w-full py-3.5 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 active:scale-[0.98] transition-all"; 
        }
        if(delBtn) delBtn.classList.add('hidden');
    } else {
        if(btnContainer) btnContainer.className = "pt-2 grid grid-cols-2 gap-3";
        if(btn) { 
            btn.innerText = "Cập nhật"; 
            btn.className = "w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-[0.98] transition-all"; 
        }
        if(delBtn) {
            delBtn.innerText = "Hủy lịch";
            delBtn.className = "w-full py-3.5 bg-orange-500 text-white font-bold rounded-xl shadow-lg shadow-orange-200 active:scale-[0.98] transition-all";
            delBtn.classList.remove('hidden');
        }
    }

    const cBtn = document.getElementById('cancelEditBtn'); if(cBtn) cBtn.classList.remove('hidden');

    // --- CẢI TIẾN: TẢI TÀI LIỆU BẤT ĐỒNG BỘ (CHẠY NGẦM SAU KHI UI ĐÃ HIỆN) ---
    const customEventID = String(b["event_id"]).replace(/^'/, '');
    if (customEventID) {
        apiCall('getMeetingAttachments', { customEventID: customEventID }).then(files => {
            existingFilesList = files || [];
            renderSelectedFiles();
        });
    }
}

/**
 * Xóa trắng Form và đưa về trạng thái Đăng ký mới.
 * Đảm bảo ẩn nút Hủy lịch và đưa bố cục nút bấm về 1 cột.
 */
function resetEditState() {
    isOnlyAddingFiles = false;
    const form = document.getElementById('bookingForm'); if(form) form.reset();
    const edIdx = document.getElementById('editRowIndex'); if(edIdx) edIdx.value = "";
    
    // Mở khóa tất cả input
    const inputs = document.querySelectorAll('#bookingForm input, #bookingForm select, #bookingForm textarea');
    inputs.forEach(input => {
        input.readOnly = false;
        input.style.pointerEvents = 'auto';
        input.classList.remove('bg-slate-50', 'cursor-not-allowed', 'opacity-70');
    });

    if(currentUser) { 
        const fUser = document.getElementById('fUser'); if(fUser) fUser.value = `${currentUser.name} - ${currentUser.dept}`; 
        const fEmp = document.getElementById('fEmpId'); if(fEmp) fEmp.value = String(currentUser.msnv).replace(/^'/, ''); 
    }
    
    currentSelectedGuests = []; renderGuestTags('guestTagsContainer', 'fGuests'); 
    const gs = document.getElementById('guestSearchInput'); if(gs) gs.value = '';
    
    // Reset Files
    existingFilesList = [];
    selectedFilesForUpload = [];
    renderSelectedFiles();

    // Ẩn link Meet
    const meetCtr = document.getElementById('fMeetContainer');
    if (meetCtr) meetCtr.classList.add('hidden');

    // --- RESET BỐ CỤC NÚT BẤM VỀ 1 CỘT ---
    const btnContainer = document.getElementById('formActionContainer');
    if(btnContainer) btnContainer.className = "pt-2 grid grid-cols-1 gap-3";

    const btn = document.getElementById('submitBtn');
    if(btn) { 
        btn.innerText = "Xác nhận Đặt phòng"; 
        btn.className = "w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-[0.98] transition-all"; 
    }
    
    // --- SỬA LỖI: ẨN NÚT HỦY LỊCH KHI RESET ---
    const delBtn = document.getElementById('deleteBtn'); 
    if(delBtn) delBtn.classList.add('hidden'); 

    const cBtn = document.getElementById('cancelEditBtn'); if(cBtn) cBtn.classList.add('hidden');
    const tc = document.getElementById('timeContainer'); if(tc) tc.classList.add('hidden');

    const reasonCtr = document.getElementById('fReasonContainer');
    if (reasonCtr) reasonCtr.classList.add('hidden');
    const reasonInput = document.getElementById('fReason');
    if (reasonInput) {
        reasonInput.required = false;
        reasonInput.value = "";
    }

    const multiCheck = document.getElementById('multiDateCheck');
    const multiToggleWrapper = document.getElementById('multiDateToggleWrapper');
    if (multiCheck && multiToggleWrapper) {
        multiCheck.checked = false;
        multiToggleWrapper.classList.remove('hidden');
        toggleMultiDate(); 
    }
}
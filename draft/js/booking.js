// ==========================================
// KHỞI TẠO CHO GIAO DIỆN USER
// ==========================================
let isRecurringMode = false;
let recurringFp = null; // Instance của Flatpickr

document.addEventListener("DOMContentLoaded", () => {
    // ... Khởi tạo cơ bản giữ nguyên
    populateRooms();
    initDateOptions(); 
    loadData(); 
});

// ==========================================
// LOGIC CHỌN GIỜ & NÚT LẶP LẠI (RECURRING)
// ==========================================

function updateStartTimes() {
    // Logic của bạn giữ nguyên, tính toán options cho startSelect...
    const timeContainer = document.getElementById('timeContainer');
    if (document.getElementById('dateSelect').value && document.getElementById('roomSelect').value) {
        timeContainer.classList.remove('hidden');
        // ... Render options startSelect
    }
    checkShowRecurringBtn();
}

function updateEndTimes() {
    // Logic của bạn giữ nguyên, tính toán options cho endSelect...
    checkShowRecurringBtn();
}

// BỔ SUNG: Hàm kiểm tra để hiển thị nút Lặp lại nhiều ngày
function checkShowRecurringBtn() {
    const room = document.getElementById('roomSelect').value;
    const start = document.getElementById('startSelect').value;
    const end = document.getElementById('endSelect').value;
    const btn = document.getElementById('btnRecurring');
    const isEditMode = document.getElementById('editRowIndex').value;

    // Chỉ hiển thị nút khi đã chọn đủ Phòng, Giờ bắt đầu, Giờ kết thúc và KHÔNG PHẢI chế độ Sửa (Edit)
    if (room && start && end && !isEditMode) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
        if (isRecurringMode) resetToSingleDateMode();
    }
}

// BỔ SUNG: Kích hoạt chế độ Flatpickr
async function activateRecurringMode() {
    const room = document.getElementById('roomSelect').value;
    const start = document.getElementById('startSelect').value;
    const end = document.getElementById('endSelect').value;

    if (!room || !start || !end) return;

    toggleLoading(true);
    // Gọi Backend để lấy các ngày bị trùng (Clashed Dates)
    const res = await apiCall('getClashedDates', { room: room, start: start, end: end });
    toggleLoading(false);

    let clashedDates = [];
    if (res.success && res.data) {
        clashedDates = res.data; // Array string ['YYYY-MM-DD', ...]
    }

    const dateSelect = document.getElementById('dateSelect');
    const dateInputMulti = document.getElementById('dateInputMulti');

    // Ẩn select đơn ngày, hiện input Flatpickr
    dateSelect.classList.add('hidden');
    dateSelect.removeAttribute('required');

    dateInputMulti.classList.remove('hidden');
    dateInputMulti.setAttribute('required', 'true');

    isRecurringMode = true;

    if (recurringFp) recurringFp.destroy();

    // Giữ lại ngày đang chọn ở mode đơn để làm default
    let defaultDate = dateSelect.value ? [dateSelect.value] : [];

    recurringFp = flatpickr(dateInputMulti, {
        mode: "multiple",
        dateFormat: "Y-m-d",
        minDate: "today",
        maxDate: new Date().fp_incr(31), // Cho phép chọn trong 31 ngày tới
        disable: clashedDates, // Disable các ngày do Backend trả về
        defaultDate: defaultDate,
        locale: "vn",
        onChange: function(selectedDates, dateStr, instance) {
            // Ràng buộc tối đa 6 ngày
            if (selectedDates.length > 6) {
                showToast("Chỉ được chọn tối đa 6 ngày!", "error");
                selectedDates.pop(); 
                instance.setDate(selectedDates);
            }
        }
    });

    document.getElementById('btnRecurring').classList.add('hidden');
}

// BỔ SUNG: Reset lại về 1 ngày
function resetToSingleDateMode() {
    isRecurringMode = false;
    const dateSelect = document.getElementById('dateSelect');
    const dateInputMulti = document.getElementById('dateInputMulti');
    
    dateInputMulti.classList.add('hidden');
    dateInputMulti.removeAttribute('required');
    if (recurringFp) recurringFp.clear();

    dateSelect.classList.remove('hidden');
    dateSelect.setAttribute('required', 'true');
    checkShowRecurringBtn();
}

// ==========================================
// XỬ LÝ SUBMIT (GỬI MẢNG DATES)
// ==========================================

async function handleBookingSubmit(e) {
    e.preventDefault();
    const formData = getSafeFormData(e.target);
    
    // Cập nhật cấu trúc Payload thành mảng `dates`
    if (isRecurringMode && recurringFp) {
        const dates = recurringFp.selectedDates.map(d => getLocalDateString(d));
        if (dates.length === 0) {
            showToast("Vui lòng chọn ít nhất 1 ngày", "error");
            return;
        }
        formData.dates = dates;
    } else {
        formData.dates = [formData.date]; // Gói ngày đơn lẻ thành mảng để backend dùng chung 1 logic
    }

    if (currentUser) formData.editorName = currentUser.name; 
    
    toggleLoading(true);
    const res = await apiCall('saveBooking', { formData: formData, rowIndex: formData.rowIndex });
    toggleLoading(false);
    
    if (res && res.success) {
        // Tùy chỉnh hiển thị thông báo thành công cho Lặp lại
        showToast(formData.dates.length > 1 ? `Đã đặt thành công ${formData.dates.length} ngày!` : "Đã đặt phòng!", "success");
        resetEditState(); loadData();
    } else {
        showToast("Lỗi: " + (res ? res.error : "Không thể lưu"), "error");
    }
}

function resetEditState() {
    const form = document.getElementById('bookingForm'); if(form) form.reset();
    document.getElementById('editRowIndex').value = "";
    
    resetToSingleDateMode(); // Gọi reset mode khi Hủy hoặc Submit xong
    
    const tc = document.getElementById('timeContainer'); if(tc) tc.classList.add('hidden');
    const btn = document.getElementById('submitBtn'); if(btn) btn.innerText = "Xác nhận Đặt phòng";
    const cBtn = document.getElementById('cancelEditBtn'); if(cBtn) cBtn.classList.add('hidden');
}
// =======================================================
// CONTROLLER CHÍNH
// =======================================================
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = e.parameter.action;

    if (action === "getClashedDates") return createJsonResponse(getClashedDates(payload));
    if (action === "saveBooking") return createJsonResponse(saveBooking(payload));
    
    // Các logic khác...
    return createJsonResponse({success: false, error: "Action không hợp lệ"});
  } catch (error) {
    return createJsonResponse({success: false, error: error.message});
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Hàm hỗ trợ đổi Time (HH:mm) sang Phút để so sánh
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  var parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// =======================================================
// PRE-VALIDATION: LẤY DANH SÁCH NGÀY BỊ TRÙNG LỊCH
// =======================================================
function getClashedDates(payload) {
  var room = payload.room;
  var startMins = timeToMinutes(payload.start);
  var endMins = timeToMinutes(payload.end);
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bookings"); // Đổi tên sheet nếu cần
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  var roomIdx = headers.indexOf("Phòng họp");
  var dateIdx = headers.indexOf("Ngày họp");
  var startIdx = headers.indexOf("Bắt đầu");
  var endIdx = headers.indexOf("Kết thúc");
  
  var clashedDates = [];
  var tz = Session.getScriptTimeZone();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][roomIdx] !== room) continue; // Chỉ xét cùng phòng
    
    var bStartMins = timeToMinutes(data[i][startIdx]);
    var bEndMins = timeToMinutes(data[i][endIdx]);
    
    // Thuật toán kiểm tra Overlap: (Start_Mới < End_Cũ) VÀ (End_Mới > Start_Cũ)
    if (startMins < bEndMins && endMins > bStartMins) {
      // Ép kiểu chuẩn YYYY-MM-DD
      var bDateStr = Utilities.formatDate(new Date(data[i][dateIdx]), tz, "yyyy-MM-dd");
      if (clashedDates.indexOf(bDateStr) === -1) {
        clashedDates.push(bDateStr);
      }
    }
  }
  
  return { success: true, data: clashedDates };
}

// =======================================================
// ATOMIC TRANSACTION: LƯU LỊCH (ĐƠN HOẶC MULTIPLE)
// =======================================================
function saveBooking(payload) {
  var formData = payload.formData;
  var dates = formData.dates || []; // Array ["2023-11-01", "2023-11-02"]
  
  if (dates.length === 0) return { success: false, error: "Dữ liệu ngày trống." };
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bookings");
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  var roomIdx = headers.indexOf("Phòng họp");
  var dateIdx = headers.indexOf("Ngày họp");
  var startIdx = headers.indexOf("Bắt đầu");
  var endIdx = headers.indexOf("Kết thúc");
  
  var startMins = timeToMinutes(formData.start);
  var endMins = timeToMinutes(formData.end);
  var tz = Session.getScriptTimeZone();
  
  // ----------------------------------------------------
  // BƯỚC 1: CROSS-VALIDATION (Tất cả hoặc không gì cả)
  // ----------------------------------------------------
  var conflictDates = [];
  var conflictDatesStr = []; // Thêm biến để lưu ngày format DD/MM/YYYY
  
  // Duyệt qua toàn bộ data cũ để tìm xem có ngày nào trong mảng 'dates' mới bị trùng không
  for (var i = 1; i < data.length; i++) {
    // Bỏ qua chính nó nếu đang trong chế độ Edit (có rowIndex)
    if (payload.rowIndex && i === parseInt(payload.rowIndex) - 1) continue;
    
    // Bỏ qua các dòng trống trong Google Sheet để tránh lỗi TypeError
    if (!data[i][roomIdx] || !data[i][dateIdx]) continue;
    
    if (data[i][roomIdx] !== formData.room) continue;
    
    var existingDateStr = Utilities.formatDate(new Date(data[i][dateIdx]), tz, "yyyy-MM-dd");
    
    // Nếu ngày tồn tại trong Sheet nằm trong mảng ngày User muốn đặt
    if (dates.indexOf(existingDateStr) !== -1) {
      var bStartMins = timeToMinutes(data[i][startIdx]);
      var bEndMins = timeToMinutes(data[i][endIdx]);
      
      // Kiểm tra Overlap
      if (startMins < bEndMins && endMins > bStartMins) {
        if (conflictDates.indexOf(existingDateStr) === -1) {
            conflictDates.push(existingDateStr);
            // Format thành DD/MM/YYYY cho thông báo lỗi thân thiện hơn
            var parts = existingDateStr.split('-');
            conflictDatesStr.push(parts[2] + '/' + parts[1] + '/' + parts[0]);
        }
      }
    }
  }
  
  // Báo lỗi ngay lập tức, ngắt chuỗi hành động (Abort Transaction)
  if (conflictDates.length > 0) {
    return {
      success: false, 
      error: "Xung đột lịch! Khung giờ này tại các ngày sau đã có người đặt: " + conflictDatesStr.join(", ") + ". Vui lòng kiểm tra lại lịch biểu."
    };
  }
  
  // ----------------------------------------------------
  // BƯỚC 2 & 3: CALENDAR CREATION & BATCH INSERT SHEET
  // ----------------------------------------------------
  var rowsToInsert = [];
  var isEdit = !!payload.rowIndex;
  var calId = "NHAP_ID_LICH_CUA_BAN@group.calendar.google.com"; // Thay thế bằng ID lịch thực tế
  
  for (var d = 0; d < dates.length; d++) {
    var currentDateStr = dates[d];
    var newRow = new Array(headers.length).fill("");
    var eventId = "";
    
    // Tạo sự kiện Google Calendar
    try {
      var cal = CalendarApp.getCalendarById(calId);
      if (cal) {
        var eventStart = new Date(currentDateStr + "T" + formData.start + ":00");
        var eventEnd = new Date(currentDateStr + "T" + formData.end + ":00");
        
        var eventTitle = formData.title + " | " + formData.room;
        // Chỉ Update nếu có EventId cũ ở chế độ edit (thường Multiple Mode ta khóa Edit, nhưng cứ code dư)
        var event = cal.createEvent(eventTitle, eventStart, eventEnd, {
          description: "Tạo bởi: " + formData.user + "\nYêu cầu: " + (formData.note || "")
        });
        eventId = event.getId();
      }
    } catch(e) {
      // Ignored - Không làm vỡ Flow Sheet
      console.log("Lỗi tạo Cal: " + e.message); 
    }
    
    // Map dữ liệu vào mảng 2 chiều theo đúng index Header
    // Lưu ý: Cấu trúc Header này phải khớp với trang tính của bạn
    if (headers.indexOf("Event ID") > -1) newRow[headers.indexOf("Event ID")] = eventId;
    if (headers.indexOf("Ngày họp") > -1) newRow[headers.indexOf("Ngày họp")] = currentDateStr;
    if (headers.indexOf("Bắt đầu") > -1) newRow[headers.indexOf("Bắt đầu")] = formData.start;
    if (headers.indexOf("Kết thúc") > -1) newRow[headers.indexOf("Kết thúc")] = formData.end;
    if (headers.indexOf("Phòng họp") > -1) newRow[headers.indexOf("Phòng họp")] = formData.room;
    if (headers.indexOf("Tên cuộc họp") > -1) newRow[headers.indexOf("Tên cuộc họp")] = formData.title;
    if (headers.indexOf("Người đăng ký") > -1) newRow[headers.indexOf("Người đăng ký")] = formData.user || "";
    if (headers.indexOf("Mã NV") > -1) newRow[headers.indexOf("Mã NV")] = formData.empId || "";
    if (headers.indexOf("Khách mời") > -1) newRow[headers.indexOf("Khách mời")] = formData.guests || "";
    if (headers.indexOf("Yêu cầu khác") > -1) newRow[headers.indexOf("Yêu cầu khác")] = formData.note || "";
    
    rowsToInsert.push(newRow);
  }
  
  // Thực thi thao tác trên Sheet
  if (isEdit && dates.length === 1) {
    // Chế độ Edit thông thường (Chỉ áp dụng cho đơn ngày)
    var rowToEdit = parseInt(payload.rowIndex);
    sheet.getRange(rowToEdit, 1, 1, headers.length).setValues(rowsToInsert);
  } else {
    // Chế độ Batch Insert mới (1 hoặc Nhiều ngày)
    if (rowsToInsert.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToInsert.length, headers.length).setValues(rowsToInsert);
    }
  }

  return { success: true };
}
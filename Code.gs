/**
 * TỆP: Backend_Merged.gs (GOOGLE APPS SCRIPT)
 * MỤC ĐÍCH: Tổng hợp toàn bộ code của Auth.gs và Code.gs vào 1 file duy nhất.
 * CẬP NHẬT: Đã căn chỉnh lại toàn bộ index các cột (Role, Password, Token, ChangedPass) 
 * do việc bổ sung thêm cột "Nhóm" vào Sheet Users.
 */

// ==============================================================================
// KHAI BÁO CÁC HẰNG SỐ (CONSTANTS) & CẤU HÌNH HỆ THỐNG
// ==============================================================================
const SHEET_BOOKINGS = "Bookings";
const SHEET_USERS = "Users";
const SHEET_CONTENT = "Content";
const SHEET_DONE = "Done";
const SHEET_EDITED = "Edited"; 

// CẤU HÌNH HỆ THỐNG
const IT_PHONE = "0988303852";
const RECEPTION_PHONE = "0948242496";
const BLOCK_EDIT_MINUTES = 10;
const RECEPTIONIST_EMAIL = ""; // Điền email lễ tân nếu muốn nhận thông báo
const APP_ROOMS = [
  "Phòng họp số 1", 
  "Phòng họp số 2", 
  "Phòng Pantry", 
  "Phòng Sinh hoạt chung"
];

// ==============================================================================
// INIT & SETUP
// ==============================================================================

function setupDailyCleanupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'moveCompletedBookingsToDone') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('moveCompletedBookingsToDone')
    .timeBased()
    .atHour(23)
    .everyDays(1)
    .create();
  console.log("Đã cài đặt Trigger dọn dẹp lịch họp hàng ngày lúc 23h đêm.");
}

/**
 * Xử lý các HTTP GET request (Dùng để test xem API có hoạt động không)
 */
function doGet(e) {
  return ContentService.createTextOutput("EMM Booking API is running smoothly...")
                       .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Xử lý các HTTP POST request từ Github Pages gửi tới
 * Hoạt động như một REST API Router
 */
function doPost(e) {
  // Bật CORS header bằng cách trả về JSON
  const headers = { "Access-Control-Allow-Origin": "*" };
  
  try {
    const action = e.parameter.action;
    
    // Đọc payload gửi từ frontend (dạng JSON string gửi qua text/plain để tránh CORS preflight)
    let data = {};
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
    
    let result = {};

    // ĐỊNH TUYẾN CÁC ACTION TỪ FRONTEND TỚI CÁC HÀM LOGIC
    switch (action) {
      // --- Auth & User ---
      case 'login': result = login(data.loginId, data.password); break;
      case 'checkUserRole': result = checkUserRole(data.msnv); break;
      case 'sendResetLink': result = sendResetLink(data.loginId, data.appUrl); break;
      case 'resetPasswordWithToken': result = resetPasswordWithToken(data.token, data.newPassword); break;
      case 'cancelResetToken': result = cancelResetToken(data.token); break;
      case 'changePassword': result = changePassword(data.loginId, data.oldPass, data.newPass); break;
      case 'updateUserProfile': result = updateUserProfile(data.formData); break;
      case 'getUsers': result = getUsers(); break;
      case 'getBasicUsers': result = getBasicUsers(); break;
      case 'saveUser': result = saveUser(data.formData, data.rowIndex); break;
      case 'deleteUser': result = deleteUser(data.rowIndex); break;
      case 'sendWelcomeEmailAuth': result = sendWelcomeEmailAuth(data.rowIndex, data.appUrl); break;
      
      // --- Bookings ---
      case 'getBookings': result = getBookings(); break;
      case 'getHistoryBookings': result = getHistoryBookings(); break;
      case 'saveBooking': result = saveBooking(data.formData, data.rowIndex); break;
      case 'updateMeetingGuests': result = updateMeetingGuests(data.rowIndex, data.guestsStr); break;
      case 'deleteBooking': result = deleteBooking(data.rowIndex, data.reason, data.editorEmail, data.editorName); break;
      case 'moveCompletedBookingsToDone': moveCompletedBookingsToDone(); result = {success: true}; break;
      case 'syncCalendar': result = syncCalendar(); break;
      
      default:
        result = { success: false, error: "Hành động không hợp lệ: " + action };
    }

    // Trả về kết quả dạng JSON
    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch (err) {
    // Xử lý lỗi hệ thống
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

function getColMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => { if(h) map[h.toString().trim()] = i; });
  return { headers, map };
}

function normalizePhone(phone) {
  if (!phone) return "";
  let clean = String(phone).replace(/\D/g, ''); 
  if (clean.startsWith('084') && clean.length > 10) clean = '0' + clean.substring(3);
  else if (clean.startsWith('84') && clean.length > 10) clean = '0' + clean.substring(2);
  return clean;
}

// ==============================================================================
// USER & AUTHENTICATION LOGIC (Từ Auth.gs & Code.gs)
// ==============================================================================

function login(loginId, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  if(!sheet) return { success: false, error: "Lỗi hệ thống: Thiếu dữ liệu Users" };
  
  const data = sheet.getDataRange().getValues();
  const inputId = String(loginId).toLowerCase().trim();
  const inputPhone = normalizePhone(inputId); 
  
  for (let i = 1; i < data.length; i++) {
    const msnv = String(data[i][0]).replace(/^'/, '').toLowerCase().trim();
    const phone = normalizePhone(data[i][4]);
    const email = String(data[i][5]).toLowerCase().trim();
    
    const userRole = data[i][7]; // Index 7 (Cột H)
    const savedPassword = String(data[i][8]).replace(/^'/, ''); // Index 8 (Cột I)
    
    if ((inputId === msnv || inputId === email || (inputPhone !== "" && inputPhone === phone)) && savedPassword === password) {
      const isChangedPass = (String(data[i][10]).toUpperCase() === "TRUE"); // Index 10 (Cột K)
      return { 
        success: true, 
        user: { 
          loginId: email || msnv, 
          msnv: String(data[i][0]).replace(/^'/, ''), 
          name: String(data[i][1]).replace(/^'/, ''), 
          dept: String(data[i][2]).replace(/^'/, ''),
          title: String(data[i][3]).replace(/^'/, ''), 
          phone: String(data[i][4]).replace(/^'/, ''), 
          email: email,
          role: userRole 
        },
        requirePasswordChange: !isChangedPass
      };
    }
  }
  return { success: false, error: "Tài khoản hoặc mật khẩu không chính xác!" };
}

function sendResetLink(loginId, appUrl) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    const data = sheet.getDataRange().getValues();
    const inputId = String(loginId).toLowerCase().trim();
    const inputPhone = normalizePhone(inputId);
    
    let rowIndex = -1;
    let targetEmail = ""; 
    
    for (let i = 1; i < data.length; i++) {
      const msnv = String(data[i][0]).replace(/^'/, '').toLowerCase().trim();
      const phone = normalizePhone(data[i][4]);
      const email = String(data[i][5]).toLowerCase().trim();
      
      if (inputId === msnv || inputId === email || (inputPhone !== "" && inputPhone === phone)) {
        rowIndex = i + 1;
        targetEmail = email; 
        break; 
      }
    }
    
    if (rowIndex === -1) return { success: false, error: "Tài khoản không tồn tại trong hệ thống." };
    if (!targetEmail) return { success: false, error: "Tài khoản này chưa được cấu hình Email." };
    
    const token = Utilities.getUuid();
    sheet.getRange(rowIndex, 10).setValue("'" + token); // Cột 10 (Cột J)
    
    let htmlBody;
    try {
      let template = HtmlService.createTemplateFromFile('RESET_PASSWORD');
      template.resetLink = appUrl + "?token=" + token;
      htmlBody = template.evaluate().getContent();
    } catch (err) {
      console.error("Lỗi nạp file HTML RESET_PASSWORD: " + err);
      return { success: false, error: "Lỗi hệ thống: Không thể tải mẫu giao diện Email. Vui lòng báo cho IT." };
    }
    
    GmailApp.sendEmail(targetEmail, "Yêu cầu Khôi phục Mật khẩu Hệ thống", "", {
      htmlBody: htmlBody,
      name: "EMM Booking System"
    });
    return { success: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function resetPasswordWithToken(token, newPassword) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][9]).replace(/^'/, '') === token && token !== "") {  // Index 9
        sheet.getRange(i + 1, 9).setValue("'" + newPassword); // Cột 9
        sheet.getRange(i + 1, 10).setValue(""); // Cột 10
        sheet.getRange(i + 1, 11).setValue("TRUE"); // Cột 11
        return { success: true };
      }
    }
    return { success: false, error: "Đường dẫn không hợp lệ hoặc đã hết hạn." };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function cancelResetToken(token) {
  try {
    if (!token) return { success: true }; 
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][9]).replace(/^'/, '') === token) { // Index 9
        sheet.getRange(i + 1, 10).setValue(""); // Cột 10
        return { success: true };
      }
    }
    return { success: true }; 
  } catch (e) { return { success: false, error: e.toString() }; }
}

function changePassword(loginId, oldPass, newPass) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    const data = sheet.getDataRange().getValues();
    const inputId = String(loginId).toLowerCase().trim();
    const inputPhone = normalizePhone(inputId);
    
    for (let i = 1; i < data.length; i++) {
      const msnv = String(data[i][0]).replace(/^'/, '').toLowerCase().trim();
      const phone = normalizePhone(data[i][4]);
      const email = String(data[i][5]).toLowerCase().trim();
      
      if (inputId === msnv || inputId === email || (inputPhone !== "" && inputPhone === phone)) {
        if (String(data[i][8]).replace(/^'/, '') === oldPass) { // Index 8
          sheet.getRange(i + 1, 9).setValue("'" + newPass); // Cột 9
          sheet.getRange(i + 1, 11).setValue("TRUE"); // Cột 11
          return { success: true };
        } else return { success: false, error: "Mật khẩu cũ không chính xác." };
      }
    }
    return { success: false, error: "Tài khoản không tồn tại." };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function updateUserProfile(formData) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    const data = sheet.getDataRange().getValues();
    const msnvToFind = String(formData.msnv).toLowerCase().trim();
    const normalizedPhone = normalizePhone(formData.phone);
    let targetRow = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).replace(/^'/, '').toLowerCase().trim() === msnvToFind) {
        targetRow = i + 1; break;
      }
    }
    if (targetRow === -1) return { success: false, error: "Không tìm thấy tài khoản để cập nhật!" };
    
    for (let i = 1; i < data.length; i++) {
        if ((i + 1) === targetRow) continue; 
        const existEmail = String(data[i][5]).toLowerCase().trim();
        const existPhone = normalizePhone(data[i][4]);
        if (formData.email.toLowerCase().trim() === existEmail) return { success: false, error: "Email đã tồn tại!" };
        if (normalizedPhone !== "" && normalizedPhone === existPhone) return { success: false, error: "Số điện thoại đã tồn tại!" };
    }
    
    sheet.getRange(targetRow, 2).setValue("'" + formData.name);
    sheet.getRange(targetRow, 3).setValue("'" + (formData.dept || ""));
    sheet.getRange(targetRow, 4).setValue("'" + (formData.title || ""));
    sheet.getRange(targetRow, 5).setValue("'" + normalizedPhone);
    sheet.getRange(targetRow, 6).setValue("'" + formData.email);
    return { success: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function checkUserRole(msnv) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    if (!sheet) return { success: false, error: "System error" };
    const data = sheet.getDataRange().getValues();
    const searchMsnv = String(msnv).toLowerCase().trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).replace(/^'/, '').toLowerCase().trim() === searchMsnv) {
        return { success: true, role: data[i][7] }; // Index 7 (Role)
      }
    }
    return { success: false, error: "deleted" }; 
  } catch (e) { return { success: false, error: e.toString() }; }
}

function getBasicUsers() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; 
    return data.slice(1).map(row => ({
      name: String(row[1]).replace(/^'/, ''),
      dept: String(row[2]).replace(/^'/, ''),
      email: String(row[5]).replace(/^'/, '').toLowerCase(),
      group: String(row[6]).replace(/^'/, '').trim()
    }));
  } catch (e) { return []; }
}

function getUsers() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; 
    const headers = data[0];
    
    return data.slice(1).map((row, index) => {
      let obj = { rowIndex: index + 2 }; 
      headers.forEach((header, i) => { 
        let val = row[i];
        if (typeof val === 'string') val = val.replace(/^'/, ''); 
        obj[header] = val; 
      });
      return obj;
    });
  } catch (e) { return []; }
}

function saveUser(formData, rowIndex = null) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    const data = sheet.getDataRange().getValues();
    
    const newMsnv = formData.msnv.toLowerCase().trim();
    const newEmail = formData.email.toLowerCase().trim();
    if (!formData.phone || formData.phone.trim() === "") return { success: false, error: "Vui lòng nhập số điện thoại!" };
    const normalizedPhone = normalizePhone(formData.phone);
    
    for (let i = 1; i < data.length; i++) {
      if (rowIndex && (i + 1) === parseInt(rowIndex)) continue; 
      if (newMsnv === String(data[i][0]).replace(/^'/, '').toLowerCase().trim()) return { success: false, error: "Mã số nhân viên đã tồn tại!" };
      if (newEmail === String(data[i][5]).toLowerCase().trim()) return { success: false, error: "Email đã tồn tại!" };
      if (normalizedPhone !== "" && normalizedPhone === normalizePhone(data[i][4])) return { success: false, error: "Số điện thoại đã tồn tại!" };
    }
    
    let isNewUser = !rowIndex;
    let newPass = isNewUser ? String(Math.floor(Math.random() * 1000000)).padStart(6, '0') : "";
    let passToSave = "";
    
    if (isNewUser) {
        passToSave = newPass;
    } else {
        passToSave = formData.password; 
        if (!passToSave || passToSave.trim() === "") {
            let oldPass = sheet.getRange(rowIndex, 9).getValue(); // Cột 9 Pass
            passToSave = String(oldPass).replace(/^'/, ''); 
        }
    }
    
    const rowValues = [
      "'" + String(formData.msnv).trim(), 
      "'" + String(formData.name).trim(), 
      "'" + String(formData.dept || "").trim(), 
      "'" + String(formData.title || "").trim(), 
      "'" + normalizedPhone, 
      "'" + String(formData.email).trim(), 
      "'" + String(formData.group || "CBCNV").trim(), 
      "'" + String(formData.role).trim(), 
      "'" + passToSave, 
      "", 
      isNewUser ? "FALSE" : formData.isChangedPass
    ]; // 11 giá trị
    
    if (rowIndex) {
      sheet.getRange(rowIndex, 1, 1, 11).setValues([rowValues]); 
    } else {
      sheet.appendRow(rowValues); 
      try {
          const targetEmail = formData.email.trim();
          const appUrl = ScriptApp.getService().getUrl();
          if (targetEmail) {
              const loginInfo = `${formData.msnv} hoặc ${targetEmail}`;
              
              let htmlBody;
              try {
                let template = HtmlService.createTemplateFromFile('WELCOME_EMAIL');
                template.loginInfo = loginInfo;
                template.newPass = newPass;
                template.appUrl = appUrl;
                htmlBody = template.evaluate().getContent();
              } catch (err) {
                console.error("Lỗi nạp file HTML WELCOME_EMAIL: " + err);
                return { success: false, error: "Tạo tài khoản thành công nhưng không thể gửi email do thiếu mẫu giao diện. Vui lòng báo IT." };
              }

              GmailApp.sendEmail(targetEmail, "Chào mừng gia nhập hệ thống EMM Booking", "", {
                htmlBody: htmlBody,
                name: "EMM Booking"
              });
          }
      } catch(e) { console.error("Lỗi gửi mail: " + e); }
    }
    return { success: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function deleteUser(rowIndex) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS).deleteRow(rowIndex);
    return { success: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function sendWelcomeEmailAuth(rowIndex, appUrl) {
  try {
    const sheetUser = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    const msnv = String(sheetUser.getRange(rowIndex, 1).getValue()).replace(/^'/, '');
    const email = sheetUser.getRange(rowIndex, 6).getValue(); // Cột 6 Email
    if (!email) return { success: false, error: "Nhân viên chưa có Email." };
    
    const newPass = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    sheetUser.getRange(rowIndex, 9).setValue("'" + newPass); // Cột 9 Pass
    sheetUser.getRange(rowIndex, 11).setValue("FALSE"); // Cột 11 changed
    
    const loginInfo = `${msnv} hoặc ${email}`;
    
    let htmlBody;
    try {
      let template = HtmlService.createTemplateFromFile('WELCOME_EMAIL');
      template.loginInfo = loginInfo;
      template.newPass = newPass;
      template.appUrl = appUrl;
      htmlBody = template.evaluate().getContent();
    } catch (err) {
      console.error("Lỗi nạp file HTML WELCOME_EMAIL: " + err);
      return { success: false, error: "Lỗi hệ thống: Không thể tải mẫu giao diện Email. Vui lòng báo cho IT." };
    }
    
    GmailApp.sendEmail(email, "Cấp lại mật khẩu hệ thống", "", {
      htmlBody: htmlBody,
      name: "EMM Booking"
    });
    return { success: true };
  } catch(e) { return { success: false, error: e.toString() }; }
}


// ==============================================================================
// BOOKING LOGIC
// ==============================================================================

function generateCustomEventId(targetDate) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BOOKINGS);
  if (!(targetDate instanceof Date)) targetDate = new Date();
  
  const yy = String(targetDate.getFullYear()).slice(-2);
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const prefix = `${yy}${mm}${dd}.`; 
  
  if (!sheet) return prefix + "01";
  const data = sheet.getDataRange().getValues();
  const { map } = getColMap(sheet);
  const eventIdCol = map["Event ID"] !== undefined ? map["Event ID"] : map["EventID"];
  if (eventIdCol === undefined) return prefix + "01";
  
  let maxCount = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][eventIdCol]).replace(/^'/, ''); 
    if (id.startsWith(prefix)) {
      const numPart = parseInt(id.split('.')[1], 10);
      if (!isNaN(numPart) && numPart > maxCount) maxCount = numPart;
    }
  }
  const nextCount = maxCount + 1;
  return prefix + (nextCount > 99 ? String(nextCount) : String(nextCount).padStart(2, '0'));
}

function moveCompletedBookingsToDone() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
    const sheetDone = ss.getSheetByName(SHEET_DONE);
    if (!sheetBookings || !sheetDone) return;
    
    const data = sheetBookings.getDataRange().getValues();
    if (data.length <= 1) return;
    
    const { map, headers } = getColMap(sheetBookings);
    const endIdx = map["Kết thúc"];
    if (endIdx === undefined) return;
    
    const now = new Date();
    let rowsToMove = [];
    
    for (let i = data.length - 1; i > 0; i--) {
      const row = data[i];
      let endTimeVal = row[endIdx]; 
      if (endTimeVal instanceof Date && !isNaN(endTimeVal.getTime())) {
        if (endTimeVal < now) {
          rowsToMove.push(row);
          sheetBookings.deleteRow(i + 1);
        }
      }
    }
    
    if (rowsToMove.length > 0) {
      rowsToMove.reverse();
      if (sheetDone.getLastRow() === 0) sheetDone.appendRow(headers);
      sheetDone.getRange(sheetDone.getLastRow() + 1, 1, rowsToMove.length, headers.length).setValues(rowsToMove);
    }
  } catch(e) { console.error("Lỗi dọn dẹp lịch: ", e); }
}

function backupToEdited(rowIndex, reason = "", editorName = "", action = "sửa") {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetBookings = ss.getSheetByName(SHEET_BOOKINGS);
    const sheetEdited = ss.getSheetByName(SHEET_EDITED);
    const sheetTz = "GMT+07:00"; 
    if (!sheetBookings || !sheetEdited) return;
    
    const lastCol = sheetBookings.getLastColumn();
    const rowData = sheetBookings.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
    const editedHeaders = sheetEdited.getRange(1, 1, 1, sheetEdited.getLastColumn()).getValues()[0];
    
    const timeStr = Utilities.formatDate(new Date(), sheetTz, "dd/MM HH:mm");
    const safeName = editorName || "Người dùng";
    const safeReason = reason || "Không có lý do";
    const logMsg = `${timeStr} ${safeName} đã ${action}, lý do: ${safeReason}`;
    
    let newRowData = new Array(editedHeaders.length).fill("");
    for(let i=0; i<rowData.length; i++) {
        let val = rowData[i];
        if (val instanceof Date) newRowData[i] = val; 
        else if (val !== null && val !== undefined && val !== "") newRowData[i] = "'" + String(val).replace(/^'/, '');
        else newRowData[i] = "";
    }
    const reasonIdx = editedHeaders.indexOf("Lý do");
    if (reasonIdx !== -1) newRowData[reasonIdx] = "'" + logMsg;
    sheetEdited.appendRow(newRowData);
  } catch(e) { console.error("Lỗi backup data: " + e); }
}

function sendBookingNotificationEmail(actionType, bookingInfo, recipientEmails, reason = "", appUrl = "") {
  // TẠM THỜI TẮT GỬI EMAIL: Xóa dòng 'return;' dưới đây để hệ thống tiếp tục gửi thư thông báo
  return; 

  try {
    const validEmails = [...new Set(recipientEmails.filter(e => e && String(e).includes("@")))];
    if (validEmails.length === 0) return;

    let htmlBody;
    try {
      let template = HtmlService.createTemplateFromFile('NOTIFICATION_EMAIL');
      template.actionType = actionType;
      template.bookingInfo = bookingInfo;
      template.reason = reason;
      template.appUrl = appUrl;
      htmlBody = template.evaluate().getContent();
    } catch (err) {
      console.error("Lỗi nạp file HTML NOTIFICATION_EMAIL: " + err);
      throw new Error("Không thể tải mẫu giao diện Email (NOTIFICATION_EMAIL.html). Vui lòng báo IT.");
    }

    let subject = `[${actionType}] Thông báo lịch họp: ${bookingInfo.title}`;

    GmailApp.sendEmail(validEmails[0], subject, "", {
      bcc: validEmails.slice(1).join(","),
      htmlBody: htmlBody,
      name: "EMM Booking System"
    });
  } catch (e) {
    console.error("Lỗi gửi email thông báo lịch họp: " + e);
    throw e;
  }
}

function getBookings() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_BOOKINGS);
    const sheetTz = "GMT+07:00"; 
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    
    const headers = data[0];
    const startIdx = headers.indexOf("Bắt đầu");
    
    return data.slice(1).map((row, index) => {
      let obj = { rowIndex: index + 2 }; 
      headers.forEach((header, i) => {
        let val = row[i];
        if (val instanceof Date) {
          if (header === "Bắt đầu" || header === "Kết thúc") val = Utilities.formatDate(val, sheetTz, "HH:mm");
          else val = Utilities.formatDate(val, sheetTz, "yyyy-MM-dd HH:mm:ss"); 
        } else if (typeof val === 'string') val = val.replace(/^'/, ''); 
        obj[header] = val;
      });
      if (startIdx !== -1 && row[startIdx] instanceof Date) obj["Ngày họp"] = Utilities.formatDate(row[startIdx], sheetTz, "yyyy-MM-dd");
      return obj;
    });
  } catch (e) { return { error: e.toString() }; }
}

function getHistoryBookings() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_DONE);
    if (!sheet) return [];
    const sheetTz = "GMT+07:00";
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    const headers = data[0];
    const startIdx = headers.indexOf("Bắt đầu");
    if (startIdx === -1) return [];
    
    const now = new Date();
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
    twoMonthsAgo.setHours(0, 0, 0, 0); 
    
    const historyList = [];
    
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      let startVal = row[startIdx];
      if (!(startVal instanceof Date) || isNaN(startVal.getTime())) continue; 
      
      if (startVal >= twoMonthsAgo) {
         let obj = { rowIndex: i + 1 }; 
         headers.forEach((header, colIndex) => {
            let val = row[colIndex];
            if (val instanceof Date) {
              if (header === "Bắt đầu" || header === "Kết thúc") val = Utilities.formatDate(val, sheetTz, "HH:mm");
              else val = Utilities.formatDate(val, sheetTz, "yyyy-MM-dd HH:mm:ss"); 
            } else if (typeof val === 'string') val = val.replace(/^'/, ''); 
            obj[header] = val;
         });
         obj["Ngày họp"] = Utilities.formatDate(startVal, sheetTz, "yyyy-MM-dd");
         historyList.push(obj);
      }
    }
    historyList.sort((a, b) => ( (a["Ngày họp"] || "") + " " + (a["Bắt đầu"] || "") ).localeCompare( (b["Ngày họp"] || "") + " " + (b["Bắt đầu"] || "") )).reverse();
    return historyList;
  } catch (e) { return { error: e.toString() }; }
}

function saveBooking(formData, rowIndex = null) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); 
  } catch (e) {
    return { success: false, error: "Hệ thống đang bận do có nhiều người theo dõi và thao tác cùng lúc. Vui lòng thử lại sau vài giây!" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_BOOKINGS);
    const sheetTz = "GMT+07:00";
    
    let { headers, map } = getColMap(sheet);
    const timestamp = Utilities.formatDate(new Date(), sheetTz, "yyyy-MM-dd HH:mm:ss");
    
    const dateParts = formData.date.split("-");
    const tempDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const offset = Utilities.formatDate(tempDate, sheetTz, "Z"); 
    const offsetStr = offset.slice(0, 3) + ":" + offset.slice(3); 
    const startDateTime = new Date(`${formData.date}T${formData.start}:00${offsetStr}`);
    const endDateTime = new Date(`${formData.date}T${formData.end}:00${offsetStr}`);
    
    const data = sheet.getDataRange().getValues();
    const startColIdx = map["Bắt đầu"];
    const endColIdx = map["Kết thúc"];
    const roomColIdx = map["Phòng họp"];
    
    if (startColIdx !== undefined && endColIdx !== undefined && roomColIdx !== undefined && data.length > 1) {
      for (let i = 1; i < data.length; i++) {
        if (rowIndex && (i + 1) === parseInt(rowIndex)) continue; 

        const existRoom = String(data[i][roomColIdx]).replace(/^'/, '');
        if (existRoom === formData.room) {
          const existStart = data[i][startColIdx];
          const existEnd = data[i][endColIdx];

          if (existStart instanceof Date && existEnd instanceof Date) {
            if (startDateTime < existEnd && endDateTime > existStart) {
              const timeS = Utilities.formatDate(existStart, sheetTz, "HH:mm");
              const timeE = Utilities.formatDate(existEnd, sheetTz, "HH:mm");
              return { success: false, error: `Rất tiếc! Phòng ${formData.room} vừa bị người khác đặt vào lúc ${timeS} - ${timeE}. Vui lòng đặt lịch khác!` };
            }
          }
        }
      }
    }

    const receptionistEmail = RECEPTIONIST_EMAIL || "";
    let customEventId = "";
    let calEventId = "";
    let cal = CalendarApp.getDefaultCalendar(); 
    
    const guestList = formData.guests ? String(formData.guests).split(',').map(e => e.trim()).filter(e => e) : [];
    let guestNames = [];
    
    if (guestList.length > 0) {
        try {
            const sheetUsers = ss.getSheetByName(SHEET_USERS);
            if (sheetUsers) {
                const usersData = sheetUsers.getDataRange().getValues();
                for (let i = 1; i < usersData.length; i++) {
                    const email = String(usersData[i][5]).toLowerCase().trim();
                    if (guestList.map(e => e.toLowerCase()).includes(email)) {
                        guestNames.push(String(usersData[i][1]).replace(/^'/, '')); 
                    }
                }
            }
        } catch(e) { console.error("Lỗi lấy danh sách tên khách mời: " + e); }
    }
    const guestNamesStr = guestNames.length > 0 ? guestNames.join(', ') : 'Không';
    
    const eventIdCol = map["Event ID"] !== undefined ? map["Event ID"] : map["EventID"];
    const calEventIdCol = map["CalEventID"] !== undefined ? map["CalEventID"] : map["Cal Event ID"];

    let oldRowData = null;

    try {
        const eventTitle = `[Họp] ${formData.title} - ${formData.user}`;
        const eventDesc = `Phòng: ${formData.room}\nNgười tạo lịch: ${formData.user}\nKhách mời tham dự: ${guestNamesStr}\nYêu cầu khác: ${formData.note || 'Không'}`;
        const eventLoc = formData.room; 

        if (rowIndex) { 
            backupToEdited(rowIndex, formData.reason || "", formData.editorName || formData.user, "sửa"); 
            oldRowData = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
            if(eventIdCol !== undefined) customEventId = String(sheet.getRange(rowIndex, eventIdCol + 1).getValue()).replace(/^'/, '');
            if(calEventIdCol !== undefined) calEventId = String(sheet.getRange(rowIndex, calEventIdCol + 1).getValue()).replace(/^'/, '');
            
            if (calEventId) {
                try {
                    const event = cal.getEventById(calEventId);
                    if (event) {
                        event.setTitle(eventTitle);
                        event.setTime(startDateTime, endDateTime);
                        event.setDescription(eventDesc);
                        event.setLocation(eventLoc);
                    }
                } catch(e) { console.warn("Không tìm thấy event cũ để cập nhật: " + e); }
            } else {
                const newEvent = cal.createEvent(eventTitle, startDateTime, endDateTime, {description: eventDesc, location: eventLoc});
                calEventId = newEvent.getId();
            }
        } else { 
            customEventId = generateCustomEventId(startDateTime); 
            const newEvent = cal.createEvent(eventTitle, startDateTime, endDateTime, {description: eventDesc, location: eventLoc});
            calEventId = newEvent.getId(); 
        }
    } catch (calErr) { console.error("Lỗi tạo/sửa Google Calendar: " + calErr); }

    let newRow = new Array(headers.length).fill("");
    
    if (map["Thời gian đăng ký"] !== undefined) newRow[map["Thời gian đăng ký"]] = timestamp;
    if (map["Mã NV"] !== undefined) newRow[map["Mã NV"]] = "'" + String(formData.empId).trim();
    if (map["Người đăng ký"] !== undefined) newRow[map["Người đăng ký"]] = "'" + String(formData.user).trim();
    if (map["Tên cuộc họp"] !== undefined) newRow[map["Tên cuộc họp"]] = "'" + String(formData.title).trim();
    if (map["Phòng họp"] !== undefined) newRow[map["Phòng họp"]] = "'" + String(formData.room).trim();
    if (map["Khách mời"] !== undefined) newRow[map["Khách mời"]] = "'" + String(formData.guests || "").trim();
    if (map["Bắt đầu"] !== undefined) newRow[map["Bắt đầu"]] = startDateTime;
    if (map["Kết thúc"] !== undefined) newRow[map["Kết thúc"]] = endDateTime;
    if (map["Yêu cầu khác"] !== undefined) newRow[map["Yêu cầu khác"]] = "'" + String(formData.note || "").trim();
    if (eventIdCol !== undefined) newRow[eventIdCol] = "'" + customEventId; 
    if (calEventIdCol !== undefined) newRow[calEventIdCol] = "'" + calEventId; 
    
    if (rowIndex) sheet.getRange(rowIndex, 1, 1, headers.length).setValues([newRow]); 
    else sheet.appendRow(newRow); 
    
    try {
        const appUrlEdit = ScriptApp.getService().getUrl() + "?action=edit&eventId=" + customEventId;
        const bookingInfo = { eventId: customEventId, user: formData.user, title: formData.title, room: formData.room, date: formData.date, start: formData.start, end: formData.end, note: formData.note };

        if (!rowIndex) {
            if (guestList.length > 0) {
                sendBookingNotificationEmail("MỜI HỌP", bookingInfo, guestList, "", appUrlEdit);
            }
            sendBookingNotificationEmail("ĐẶT PHÒNG THÀNH CÔNG", bookingInfo, [formData.creatorEmail, receptionistEmail], "", appUrlEdit);
        } else {
            const oldGuestsStr = oldRowData ? String(oldRowData[map["Khách mời"]] || "").replace(/^'/, '') : "";
            const oldGuestList = oldGuestsStr ? oldGuestsStr.split(',').map(e => e.trim().toLowerCase()).filter(e => e) : [];
            
            const addedGuests = guestList.filter(g => !oldGuestList.includes(g.toLowerCase()));
            const existingGuests = guestList.filter(g => oldGuestList.includes(g.toLowerCase()));

            if (addedGuests.length > 0) {
                sendBookingNotificationEmail("MỜI HỌP", bookingInfo, addedGuests, formData.reason, appUrlEdit);
            }

            let updateRecipients = [...existingGuests];
            if (formData.reason) { 
                updateRecipients.push(formData.creatorEmail);
            }
            updateRecipients.push(receptionistEmail);
            
            if (updateRecipients.length > 0) {
                sendBookingNotificationEmail("CẬP NHẬT", bookingInfo, updateRecipients, formData.reason, appUrlEdit);
            }
        }
    } catch (emailErr) {
        return { success: false, error: "Lưu lịch thành công nhưng lỗi gửi email: " + emailErr.message };
    }
    
    return { success: true };
  } catch (e) { 
    return { success: false, error: e.toString() }; 
  } finally {
    lock.releaseLock();
  }
}

function updateMeetingGuests(rowIndex, guestsStr) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { success: false, error: "Hệ thống bận, vui lòng thử lại sau." }; }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_BOOKINGS);
    const sheetTz = "GMT+07:00";
    const { headers, map } = getColMap(sheet);
    const guestColIdx = map["Khách mời"];
    if (guestColIdx === undefined) return { success: false, error: "Chưa tạo cột 'Khách mời'!" };
    
    const rowData = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const oldGuestsStr = String(rowData[guestColIdx]).replace(/^'/, '');
    const oldGuestList = oldGuestsStr ? oldGuestsStr.split(',').map(e => e.trim().toLowerCase()).filter(e => e) : [];
    const newGuestList = guestsStr ? guestsStr.split(',').map(e => e.trim().toLowerCase()).filter(e => e) : [];
    const addedGuests = newGuestList.filter(g => !oldGuestList.includes(g));

    backupToEdited(rowIndex, "Cập nhật danh sách khách mời", "Người tổ chức", "sửa");
    
    sheet.getRange(rowIndex, guestColIdx + 1).setValue("'" + guestsStr);
    
    const calEventIdCol = map["CalEventID"] !== undefined ? map["CalEventID"] : map["Cal Event ID"];
    const calEventId = calEventIdCol !== undefined ? String(rowData[calEventIdCol]).replace(/^'/, '') : "";
    
    if (calEventId) {
        try {
            let cal = CalendarApp.getDefaultCalendar();
            let event = cal.getEventById(calEventId);
            if (event) {
                const newGuestList = guestsStr ? guestsStr.split(',').map(e => e.trim()).filter(e => e) : [];
                let guestNames = [];
                if (newGuestList.length > 0) {
                    const usersData = ss.getSheetByName(SHEET_USERS).getDataRange().getValues();
                    for (let i = 1; i < usersData.length; i++) {
                        const email = String(usersData[i][5]).toLowerCase().trim();
                        if (newGuestList.map(e => e.toLowerCase()).includes(email)) {
                            guestNames.push(String(usersData[i][1]).replace(/^'/, ''));
                        }
                    }
                }
                const guestNamesStr = guestNames.length > 0 ? guestNames.join(', ') : 'Không';
                const user = String(rowData[map["Người đăng ký"]]).replace(/^'/, '');
                const room = String(rowData[map["Phòng họp"]]).replace(/^'/, '');
                const note = String(rowData[map["Yêu cầu khác"]] || "").replace(/^'/, '');
                
                const eventDesc = `Phòng: ${room}\nNgười tạo lịch: ${user}\nKhách mời tham dự: ${guestNamesStr}\nYêu cầu khác: ${note || 'Không'}`;
                event.setDescription(eventDesc);
            }
        } catch(e) { console.warn("Không thể cập nhật danh sách khách lên Google Calendar: " + e); }
    }
    
    if (addedGuests.length > 0) {
        const startVal = rowData[map["Bắt đầu"]];
        const endVal = rowData[map["Kết thúc"]];
        const eventIdCol = map["Event ID"] !== undefined ? map["Event ID"] : map["EventID"];
        const customEventId = eventIdCol !== undefined ? String(rowData[eventIdCol]).replace(/^'/, '') : "";
        
        const bookingInfo = {
            eventId: customEventId,
            user: String(rowData[map["Người đăng ký"]] || "N/A").replace(/^'/, ''),
            title: String(rowData[map["Tên cuộc họp"]] || "N/A").replace(/^'/, ''),
            room: String(rowData[map["Phòng họp"]] || "N/A").replace(/^'/, ''),
            date: startVal instanceof Date ? Utilities.formatDate(startVal, sheetTz, "yyyy-MM-dd") : "N/A",
            start: startVal instanceof Date ? Utilities.formatDate(startVal, sheetTz, "HH:mm") : "N/A",
            end: endVal instanceof Date ? Utilities.formatDate(endVal, sheetTz, "HH:mm") : "N/A",
            note: String(rowData[map["Yêu cầu khác"]] || "").replace(/^'/, '')
        };
        
        try {
            sendBookingNotificationEmail("MỜI HỌP", bookingInfo, addedGuests, "", ScriptApp.getService().getUrl() + "?action=edit&eventId=" + customEventId);
        } catch (emailErr) {
            return { success: false, error: "Cập nhật thành công nhưng lỗi gửi email: " + emailErr.message };
        }
    }
    
    return { success: true };
  } catch(e) { 
    return { success: false, error: e.toString() }; 
  } finally {
    lock.releaseLock();
  }
}

function deleteBooking(rowIndex, reason = "", editorEmail = "", editorName = "") {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { success: false, error: "Hệ thống bận, vui lòng thử lại sau." }; }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_BOOKINGS);
    const sheetTz = "GMT+07:00";
    const { map } = getColMap(sheet);
    
    const rowData = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    const guestColIdx = map["Khách mời"];
    const guestsStr = guestColIdx !== undefined ? String(rowData[guestColIdx]).replace(/^'/, '') : "";
    const guestList = guestsStr ? guestsStr.split(',').map(e => e.trim()).filter(e => e) : [];
    
    const calEventIdCol = map["CalEventID"] !== undefined ? map["CalEventID"] : map["Cal Event ID"];
    const calEventId = calEventIdCol !== undefined ? String(rowData[calEventIdCol]).replace(/^'/, '') : "";
    
    backupToEdited(rowIndex, reason, editorName || editorEmail || "Người dùng", "xóa"); 
    
    if (calEventId) { 
      try { 
        let cal = CalendarApp.getDefaultCalendar();
        let event = cal.getEventById(calEventId);
        if (event) event.deleteEvent();
      } catch(e) {} 
    }
    sheet.deleteRow(rowIndex);
    
    let creatorEmail = "";
    if (map["Mã NV"] !== undefined) {
        const usersData = ss.getSheetByName(SHEET_USERS).getDataRange().getValues();
        const msnv = String(rowData[map["Mã NV"]]).replace(/^'/, '').toLowerCase();
        for(let i = 1; i < usersData.length; i++) if (String(usersData[i][0]).replace(/^'/, '').toLowerCase() === msnv) { creatorEmail = usersData[i][5]; break; }
    }
    const startVal = rowData[map["Bắt đầu"]], endVal = rowData[map["Kết thúc"]];
    const bookingInfo = {
      eventId: map["Event ID"] !== undefined ? String(rowData[map["Event ID"]]).replace(/^'/, '') : "N/A",
      user: String(rowData[map["Người đăng ký"]] || "N/A").replace(/^'/, ''),
      title: String(rowData[map["Tên cuộc họp"]] || "N/A").replace(/^'/, ''),
      room: String(rowData[map["Phòng họp"]] || "N/A").replace(/^'/, ''),
      date: startVal instanceof Date ? Utilities.formatDate(startVal, sheetTz, "yyyy-MM-dd") : "N/A",
      start: startVal instanceof Date ? Utilities.formatDate(startVal, sheetTz, "HH:mm") : "N/A",
      end: endVal instanceof Date ? Utilities.formatDate(endVal, sheetTz, "HH:mm") : "N/A",
      note: String(rowData[map["Yêu cầu khác"]] || "").replace(/^'/, '')
    };
    
    try {
        sendBookingNotificationEmail("HỦY LỊCH", bookingInfo, [RECEPTIONIST_EMAIL, creatorEmail, editorEmail, ...guestList], reason, ScriptApp.getService().getUrl());
    } catch (emailErr) {
        return { success: false, error: "Hủy lịch thành công nhưng lỗi gửi email: " + emailErr.message };
    }
    
    return { success: true };
  } catch (e) { 
    return { success: false, error: e.toString() }; 
  } finally {
    lock.releaseLock();
  }
}

function syncCalendar() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_BOOKINGS);
    let { map } = getColMap(sheet);
    const calEventIdCol = map["CalEventID"] !== undefined ? map["CalEventID"] : map["Cal Event ID"];
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, added: 0, deleted: 0, updated: 0 };
    
    const usersData = ss.getSheetByName(SHEET_USERS).getDataRange().getValues();
    const emailToNameMap = {};
    for (let j = 1; j < usersData.length; j++) {
        let email = String(usersData[j][5]).toLowerCase().trim();
        let name = String(usersData[j][1]).replace(/^'/, '');
        if(email) emailToNameMap[email] = name;
    }

    let cal = CalendarApp.getDefaultCalendar();
    let validCalEventIds = new Set();
    let counts = { added: 0, deleted: 0, updated: 0 };
    
    let minDate = new Date();
    let maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 6);
    for (let i = 1; i < data.length; i++) {
        let sTime = data[i][map["Bắt đầu"]];
        if (sTime instanceof Date) {
            if (sTime < minDate) minDate = sTime;
            if (sTime > maxDate) maxDate = sTime;
        }
    }
    let scanStart = new Date(minDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    let scanEnd = new Date(maxDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    let allActiveEvents = cal.getEvents(scanStart, scanEnd);
    let activeCalEventIds = new Set();
    allActiveEvents.forEach(ev => activeCalEventIds.add(ev.getId()));

    for (let i = 1; i < data.length; i++) {
        let row = data[i], sTime = row[map["Bắt đầu"]], eTime = row[map["Kết thúc"]];
        if (!(sTime instanceof Date) || !(eTime instanceof Date)) continue;
        
        let calId = row[calEventIdCol] ? String(row[calEventIdCol]).replace(/^'/, '') : "";
        let title = `[Họp] ${String(row[map["Tên cuộc họp"]]).replace(/^'/, '')} - ${String(row[map["Người đăng ký"]]).replace(/^'/, '')}`;
        
        let rawGuests = row[map["Khách mời"]] ? String(row[map["Khách mời"]]).replace(/^'/, '') : "";
        let gList = rawGuests ? rawGuests.split(',').map(e => e.trim().toLowerCase()).filter(e => e) : [];
        let gNames = gList.map(email => emailToNameMap[email] || email).join(', ');
        let guestStr = gNames ? gNames : 'Không';
        
        let desc = `Phòng: ${row[map["Phòng họp"]]}\nNgười tạo lịch: ${String(row[map["Người đăng ký"]]).replace(/^'/, '')}\nKhách mời tham dự: ${guestStr}\nYêu cầu: ${String(row[map["Yêu cầu khác"]] || '').replace(/^'/, '')}`;
        
        try {
            if (calId && activeCalEventIds.has(calId)) {
                let ev = cal.getEventById(calId);
                if (ev) {
                    ev.setTitle(title); ev.setTime(sTime, eTime); ev.setDescription(desc); ev.setLocation(row[map["Phòng họp"]]);
                    validCalEventIds.add(calId); counts.updated++; 
                    Utilities.sleep(300); 
                }
            } else {
                let newEv = cal.createEvent(title, sTime, eTime, {description: desc, location: row[map["Phòng họp"]]});
                let newId = newEv.getId();
                sheet.getRange(i+1, calEventIdCol + 1).setValue("'" + newId);
                validCalEventIds.add(newId); counts.added++;
                Utilities.sleep(500); 
            }
        } catch(e) {
            console.warn(`Lỗi tạo/sửa lịch dòng ${i+1}: ` + e);
            Utilities.sleep(5000);
            try {
                let newEv = cal.createEvent(title, sTime, eTime, {description: desc, location: row[map["Phòng họp"]]});
                let newId = newEv.getId();
                sheet.getRange(i+1, calEventIdCol + 1).setValue("'" + newId);
                validCalEventIds.add(newId); counts.added++;
                Utilities.sleep(500);
            } catch(retryErr) {
                console.error(`Bỏ qua dòng ${i+1} do lỗi liên tục: ` + retryErr);
            }
        }
    }
    
    allActiveEvents.forEach(ev => { 
        if (ev.getTitle().startsWith("[Họp]") && !validCalEventIds.has(ev.getId())) { 
            try { 
                ev.deleteEvent(); 
                counts.deleted++; 
                Utilities.sleep(500); 
            } catch(e) {
                console.error("Lỗi khi xóa sự kiện mồ côi: " + e);
            } 
        } 
    });
    
    return { success: true, ...counts };
  } catch(e) { return { success: false, error: e.toString() }; }
}

// ==============================================================================
// THÔNG BÁO CHO TOÀN BỘ NGƯỜI DÙNG
// ==============================================================================

function AnnouncementApp(subject, messageText) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
    const data = sheet.getDataRange().getValues();
    
    let bccEmails = [];
    for (let i = 1; i < data.length; i++) {
      let email = String(data[i][5]).toLowerCase().trim(); 
      if (email && email.includes("@")) {
        bccEmails.push(email);
      }
    }
    
    if (bccEmails.length === 0) return { success: false, error: "Không tìm thấy email nào trong hệ thống." };

    let htmlBody;
    try {
      let template = HtmlService.createTemplateFromFile('ANNOUNCEMENT');
      template.subject = subject;
      template.messageText = messageText;
      htmlBody = template.evaluate().getContent();
    } catch (err) {
      console.error("Lỗi nạp file HTML ANNOUNCEMENT: " + err);
      return { success: false, error: "Lỗi hệ thống: Không thể tải mẫu giao diện Email. Vui lòng báo cho IT." };
    }

    const senderEmail = Session.getActiveUser().getEmail() || bccEmails[0]; 
    
    GmailApp.sendEmail(senderEmail, subject, "", {
      bcc: bccEmails.join(","),
      htmlBody: htmlBody,
      name: "Thông báo Hệ thống EMM"
    });

    return { success: true, count: bccEmails.length };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

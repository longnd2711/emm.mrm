// ==========================================
// CẤU HÌNH API & HẰNG SỐ
// ==========================================
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxS4iJ7Y1GmilhveLSTLK0y-uPTGkAEEQMhCD1JttNhUx7uatJ1IzFDqFwTJbuA3os/exec"; 
const IT_PHONE = "0988303852";
const RECEPTION_PHONE = "0948242496";
const BLOCK_EDIT_MINUTES = 10;
const APP_ROOMS = ["Phòng họp số 1", "Phòng họp số 2", "Phòng Pantry", "Phòng Sinh hoạt chung"];

// Cấu hình hiển thị lưới lịch
const SCHEDULE_START_HOUR = 8;
const SCHEDULE_END_HOUR = 17;
const PIXELS_PER_MINUTE = 1; 

// ==========================================
// BIẾN TOÀN CỤC (GLOBAL STATE)
// ==========================================
let currentScheduleTab = 1;
let hasCheckedDeepLink = false;
let allBookings = []; 
let historyBookings = []; 
let allUsers = []; 
let currentUser = null; 
let isForcedPassChange = false; 
let isMyBookingsExpanded = false; 
const DISTINCT_COLORS = ['#2563eb', '#e11d48', '#d97706', '#059669', '#7c3aed']; 

let allUsersBasicList = [];
let currentSelectedGuests = []; 
let adminSelectedGuests = [];   
let modalSelectedGuests = [];   
let editingMeetingRowIndex = null; 
let fetchingBookingsPromise = null;

// ==========================================
// THAM SỐ URL (URL PARAMETERS)
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
let RESET_TOKEN = urlParams.get('token') || "";
let URL_ACTION = urlParams.get('action') || "";
let URL_EVENT_ID = urlParams.get('eventId') || "";

let URL_ROOM_INDEX = "";
const hash = window.location.hash;
if (hash && /^#r\d+$/.test(hash)) {
    URL_ROOM_INDEX = hash.substring(2); 
}

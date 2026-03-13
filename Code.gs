// ═══════════════════════════════════════════════════════════════════
// ExitPass — Google Apps Script Backend (Code.gs)
// Deploy as: Execute as Me · Access: Anyone
// ═══════════════════════════════════════════════════════════════════
//
// SETUP STEPS:
//   1. From your Google Sheet, click Extensions → Apps Script
//   2. In script editor, paste this entire file as Code.gs
//   3. Run setupDatabase() once from the editor to create sheets
//   4. ⚠️  Run authorizeMailApp() ONCE from the editor to grant mail permission
//   5. Deploy → New Deployment → Web App (or redeploy as new version)
//      · Execute as: Me
//      · Who has access: Anyone  (or Anyone within organization)
//   5. Copy the deployment URL into js/config.js → API_URL
//
// SPREADSHEET SHEETS REQUIRED:
//   Sheet 1: USERS        (columns: user_id, name, department, role, email)
//   Sheet 2: EXIT_PASSES  (columns listed in PASS_COLUMNS below)
//
// ═══════════════════════════════════════════════════════════════════

// ── CONFIG ────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = ["*"];  // Restrict to your GitHub Pages URL if desired
const USER_SHEETS = ["FACTORY_USERS", "OFFICE_USERS"];

// Column definitions (1-indexed for getRange)
const USER_COLS = {
  user_id:    1,
  name:       2,
  department: 3,
  role:       4,
  email:      5,
  password:   6,
  phone:      7,
};

const PASS_COLS = {
  pass_id:            1,
  user_id:            2,
  reason:             3,
  request_time:       4,
  exit_from:          5,
  exit_to:            6,
  approval_status:    7,
  approved_by:        8,
  approval_time:      9,
  movement_status:    10,
  exit_time:          11,
  return_time:        12,
  guard_name:         13,
  return_required:    14,
  email_notification: 15,   // "SENT" | "PARTIAL" | "FAILED" | "NONE"
  overdue_notified:   16,   // "YES"
};

// EMAIL_LOG sheet columns
const EMAIL_LOG_COLS = {
  log_id:        1,
  pass_id:       2,
  recipient:     3,
  status:        4,   // "SENT" | "FAILED"
  sent_at:       5,
  error_message: 6,
};

// ── ENTRY POINT ───────────────────────────────────────────────────
function doPost(e) {
  const headers = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const body    = JSON.parse(e.postData.contents);
    const action  = body.action;
    let result;

    switch (action) {
      case "loginUser":           result = loginUser(body);           break;
      case "registerUser":        result = registerUser(body);        break;
      case "getAllUsers":         result = getAllUsers(body);         break;
      case "addUser":             result = addUser(body);             break;
      case "editUser":            result = editUser(body);            break;
      case "deleteUser":          result = deleteUser(body);          break;
      case "createExitPass":      result = createExitPass(body);      break;
      case "getMyPasses":         result = getMyPasses(body);         break;
      case "getPendingPasses":    result = getPendingPasses(body);    break;
      case "getAllPasses":        result = getAllPasses(body);         break;
      case "approvePass":         result = approvePass(body);         break;
      case "verifyPass":          result = verifyPass(body);          break;
      case "getApprovedPasses":   result = getApprovedPasses(body);   break;
      case "getExpectedReturns":  result = getExpectedReturns(body);  break;
      case "updateMovementStatus":result = updateMovementStatus(body);break;
      case "revertMovementStatus":result = revertMovementStatus(body);break;
      case "getGuardLog":         result = getGuardLog(body);         break;
      case "getStats":            result = getStats(body);            break;
      case "getEmailLog":         result = getEmailLog(body);         break;
      case "getPendingSMS":       result = getPendingSMS(body);       break;
      case "updateSMSStatus":     result = updateSMSStatus(body);     break;
      case "getUserProfile":      result = getUserProfile(body);      break;
      default:
        result = { success: false, error: "Unknown action: " + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle OPTIONS preflight (CORS)
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, message: "ExitPass API running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HELPERS ───────────────────────────────────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name);
}

function getAllRows(sheet, limit) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];  // Only header or empty
  
  if (limit && lastRow > limit) {
    // Get only last N rows
    const startRow = lastRow - limit + 1;
    const data = sheet.getRange(startRow, 1, limit, sheet.getLastColumn()).getValues();
    return data;
  }
  
  const data = sheet.getDataRange().getValues();
  return data.slice(1);  // Skip header row
}

function generatePassId() {
  const sheet = getSheet("EXIT_PASSES");
  const lastRow = sheet.getLastRow();
  
  // If no data (only header), start at 100001
  if (lastRow <= 1) return "100001";
  
  // Optimized: Only fetch the last cell instead of entire sheet
  const lastId = String(sheet.getRange(lastRow, PASS_COLS.pass_id).getValue()).trim();
  const nextId = parseInt(lastId);
  
  // If the last ID wasn't a number (e.g., old "EP-..." format), 
  // we start a fresh 6-digit sequence or default to 100001
  if (isNaN(nextId)) {
    return "100001";
  }
  
  return (nextId + 1).toString();
}

function formatDateTime(date) {
  if (!date || date === "") return "";
  const d = new Date(date);
  if (isNaN(d)) return String(date);
  return d.toISOString();
}

/**
 * Concise format for SMS: DD/MM HH:MM
 */
function formatSmsTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return String(dateStr);
  const day = ("0" + d.getDate()).slice(-2);
  const month = ("0" + (d.getMonth() + 1)).slice(-2);
  const hours = ("0" + d.getHours()).slice(-2);
  const mins = ("0" + d.getMinutes()).slice(-2);
  return `${day}/${month} ${hours}:${mins}`;
}

function isToday(date) {
  if (!date) return false;
  const d = new Date(date);
  const today = new Date();
  return d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
}

function now() {
  return new Date().toISOString();
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

/** 
 * Normalizes User ID (Employee Number). 
 * Strips leading zeros if numeric, otherwise trims and uppercases.
 * This ensures "002" and "2" are treated as the same user.
 */
function normalizeUserId(uid) {
  if (uid === null || uid === undefined || uid === "") return "";
  let s = String(uid).trim();
  // If purely numeric, remove leading zeros (e.g. "002" -> "2")
  if (/^\d+$/.test(s)) {
    return parseInt(s, 10).toString();
  }
  return s.toUpperCase();
}

// ── 1. LOGIN USER ─────────────────────────────────────────────────
function loginUser(body) {
  const userId = normalizeUserId(body.user_id);
  const password = (body.password || "").toString().trim();
  if (!userId) return { success: false, error: "Employee Number is required." };

  let row = null;
  let foundSheet = null;

  for (const sheetName of USER_SHEETS) {
    const sheet = getSheet(sheetName);
    if (!sheet) continue;
    const rows = getAllRows(sheet);
    row = rows.find(r => normalizeUserId(r[USER_COLS.user_id - 1]) === userId);
    if (row) {
      foundSheet = sheetName;
      break;
    }
  }

  if (!row) return { success: false, error: "User not found. Contact your administrator." };

  const role = (row[USER_COLS.role - 1] || "employee").toString().trim().toLowerCase();
  const department = (row[USER_COLS.department - 1] || "").toString().trim().toLowerCase();

  const isHrOrAdmin = 
    role === "admin" || role === "approver" || role === "hr" || 
    department === "hr" || department === "admin";

  if (isHrOrAdmin) {
    const storedPassword = (row[USER_COLS.password - 1] || "").toString().trim();
    if (!password) {
      return { success: false, require_password: true, error: "Password required for Admin/HR." };
    }
    if (storedPassword === "") {
      return { success: false, error: "Password not set in database for this Admin/HR user. Admin must set it in USERS sheet." };
    }
    if (password !== storedPassword) {
      return { success: false, error: "Incorrect password." };
    }
  }

  return {
    success:    true,
    user_id:    row[USER_COLS.user_id    - 1],
    name:       row[USER_COLS.name       - 1],
    email:      row[USER_COLS.email      - 1],
    department: row[USER_COLS.department - 1],
    role:       role,
    phone:      row[USER_COLS.phone - 1] || "",
  };
}

// ── 1.1 REGISTER USER ─────────────────────────────────────────────
function registerUser(body) {
  const userId = normalizeUserId(body.user_id);
  const userName = (body.name || "").toString().trim();
  if (!userId) return { success: false, error: "Employee Number is required." };
  if (!userName) return { success: false, error: "Name is required." };

  sheet.appendRow(newRow);

  return {
    success:    true,
    user_id:    userId,
    name:       userName,
    email:      "",
    department: "General",
    role:       "employee",
    sheet:      "FACTORY_USERS"
  };
}

// ── 1.2 GET ALL USERS ─────────────────────────────────────────────
function getAllUsers(body) {
  let allUsers = [];

  for (const sheetName of USER_SHEETS) {
    const sheet = getSheet(sheetName);
    if (!sheet) continue;
    const rows = getAllRows(sheet);
    const users = rows.map(r => ({
      user_id:    r[USER_COLS.user_id - 1],
      name:       r[USER_COLS.name - 1],
      department: r[USER_COLS.department - 1],
      role:       r[USER_COLS.role - 1],
      email:      r[USER_COLS.email - 1],
      password:   r[USER_COLS.password - 1] ? "******" : "",
      sheet_name: sheetName
    }));
    allUsers = allUsers.concat(users);
  }

  return { success: true, users: allUsers };
}

// ── 1.3 ADD / EDIT USER ───────────────────────────────────────────
function addUser(body) {
  const { user_id, name, department, role, email, password, phone, sheet_name } = body;
  if (!user_id || !name) return { success: false, error: "Employee Number and Name are required." };

  const targetSheetName = sheet_name || "FACTORY_USERS";
  const sheet = getSheet(targetSheetName);
  if (!sheet) return { success: false, error: "Invalid sheet name: " + targetSheetName };
  
  const rows = sheet.getDataRange().getValues();

  const searchId = normalizeUserId(user_id);
  // Check across ALL sheets for duplicate ID
  for (const sName of USER_SHEETS) {
    const s = getSheet(sName);
    if (!s) continue;
    const sRows = s.getDataRange().getValues();
    for (let i = 1; i < sRows.length; i++) {
       if (normalizeUserId(sRows[i][USER_COLS.user_id - 1]) === searchId) {
         return { success: false, error: "User ID already exists in " + sName };
       }
    }
  }

  const newRow = new Array(Object.keys(USER_COLS).length).fill("");
  newRow[USER_COLS.user_id - 1] = searchId;
  newRow[USER_COLS.name - 1] = name;
  newRow[USER_COLS.department - 1] = department || "General";
  newRow[USER_COLS.role - 1] = role || "employee";
  newRow[USER_COLS.email - 1] = email || "";
  newRow[USER_COLS.password - 1] = password || "";
  if (USER_COLS.phone) newRow[USER_COLS.phone - 1] = phone || "";

  sheet.appendRow(newRow);
  
  // Clear the cache since user data changed
  const cache = CacheService.getScriptCache();
  cache.remove("user_map");

  return { success: true };
}

// ── 1.4 EDIT USER ─────────────────────────────────────────────────
function editUser(body) {
  const { user_id, name, department, role, email, password, phone } = body;
  if (!user_id || !name) return { success: false, error: "Employee Number and Name are required." };

  const searchId = normalizeUserId(user_id);
  
  for (const sheetName of USER_SHEETS) {
    const sheet = getSheet(sheetName);
    if (!sheet) continue;
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      const rId = normalizeUserId(rows[i][USER_COLS.user_id - 1]);
      if (rId === searchId) {
        const rowValues = [...rows[i]];
        while(rowValues.length < Object.keys(USER_COLS).length) {
            rowValues.push("");
        }
        
        rowValues[USER_COLS.user_id    - 1] = searchId;
        rowValues[USER_COLS.name       - 1] = name;
        rowValues[USER_COLS.department - 1] = department || "General";
        rowValues[USER_COLS.role - 1] = role || "employee";
        rowValues[USER_COLS.email - 1] = email || "";
        if (password !== undefined && password !== "") {
           rowValues[USER_COLS.password - 1] = password;
        }
        if (USER_COLS.phone) rowValues[USER_COLS.phone - 1] = phone || "";
        
        sheet.getRange(i + 1, 1, 1, rowValues.length).setValues([rowValues]);
        
        const cache = CacheService.getScriptCache();
        cache.remove("user_map");
        return { success: true };
      }
    }
  }

  return { success: false, error: "User not found." };
}

// ── 1.5 DELETE USER ───────────────────────────────────────────────
function deleteUser(body) {
  const { user_id } = body;
  if (!user_id) return { success: false, error: "Employee Number is required." };

  const searchId = normalizeUserId(user_id);
  for (const sheetName of USER_SHEETS) {
    const sheet = getSheet(sheetName);
    if (!sheet) continue;
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      const rId = normalizeUserId(rows[i][USER_COLS.user_id - 1]);
      if (rId === searchId) {
        sheet.deleteRow(i + 1);
        const cache = CacheService.getScriptCache();
        cache.remove("user_map");
        return { success: true };
      }
    }
  }

  return { success: false, error: "User not found." };
}

// ── 2. CREATE EXIT PASS ───────────────────────────────────────────
function createExitPass(body) {
  const { user_id, reason, exit_from, exit_to, return_required } = body;
  if (!user_id || !reason || !exit_from || (return_required !== "No" && !exit_to)) {
    return { success: false, error: "Missing required fields." };
  }

  const exitFromDate = parseDate(exit_from);
  const exitToDate   = return_required !== "No" ? parseDate(exit_to) : null;

  if (!exitFromDate || (return_required !== "No" && !exitToDate)) {
    return { success: false, error: "Invalid date format." };
  }
  if (exitToDate && exitToDate <= exitFromDate) {
    return { success: false, error: "Return time must be after exit time." };
  }

  const sheet   = getSheet("EXIT_PASSES");
  const pass_id = generatePassId();
  const requestTime = now();

  const row = new Array(Object.keys(PASS_COLS).length).fill("");
  row[PASS_COLS.pass_id         - 1] = pass_id;
  row[PASS_COLS.user_id         - 1] = normalizeUserId(user_id);
  row[PASS_COLS.reason          - 1] = reason;
  row[PASS_COLS.request_time    - 1] = requestTime;
  row[PASS_COLS.exit_from       - 1] = exit_from;
  row[PASS_COLS.exit_to         - 1] = exit_to || "";
  row[PASS_COLS.approval_status - 1] = "PENDING";
  row[PASS_COLS.movement_status - 1] = "NOT_EXITED";
  row[PASS_COLS.return_required - 1] = return_required || "Yes";

  sheet.appendRow(row);

  // ── Update User's Phone Number if provided ───────────────────
  if (body.phone) {
    try {
      const searchId  = normalizeUserId(user_id);
      for (const sheetName of USER_SHEETS) {
        const userSheet = getSheet(sheetName);
        if (!userSheet) continue;
        const userRows = userSheet.getDataRange().getValues();
        let found = false;
        for (let i = 1; i < userRows.length; i++) {
          if (normalizeUserId(userRows[i][USER_COLS.user_id - 1]) === searchId) {
            userSheet.getRange(i + 1, USER_COLS.phone).setValue(body.phone);
            found = true;
            break;
          }
        }
        if (found) {
          CacheService.getScriptCache().remove("user_map");
          break;
        }
      }
    } catch (err) {
      Logger.log("Failed to update user phone: " + err.message);
    }
  }

  // ── Send SMS to Approvers and HR ─────────────────────────────
  try {
    const approverPhones = [];
    const userMap = buildUserMap(); // Updated helper
    const employeeData = userMap[normalizeUserId(user_id)] || {};
    const employeeName = employeeData.name || user_id;

    for (const sheetName of USER_SHEETS) {
      const userRows = getAllRows(getSheet(sheetName));
      userRows.forEach(r => {
        let isHrOrAdmin = false;
        let rPhone = "";

      for (let i = 0; i < r.length; i++) {
        const val = (r[i] || "").toString().trim().toLowerCase();
        if (["hr", "admin", "approver", "hr manager", "human resources", "administrator", "system admin"].includes(val)) {
           isHrOrAdmin = true;
        }
        if (/^\+?\d{9,15}$/.test(val)) {
           rPhone = val;
        }
      }

      if (!isHrOrAdmin) {
        const fallbackRole = (r[USER_COLS.role - 1] || "").toString().trim().toLowerCase();
        const fallbackDept = (r[USER_COLS.department - 1] || "").toString().trim().toLowerCase();
        if (fallbackRole.includes("admin") || fallbackRole.includes("hr") || fallbackRole.includes("approver") ||
            fallbackDept.includes("admin") || fallbackDept.includes("hr")) {
            isHrOrAdmin = true;
        }
      }
      if (!rPhone) {
        rPhone = r[USER_COLS.phone - 1] ? r[USER_COLS.phone - 1].toString().trim() : "";
      }

      if (isHrOrAdmin && rPhone) {
        if (!approverPhones.includes(rPhone)) {
          approverPhones.push(rPhone);
        }
      }
    });
  }

    if (approverPhones.length === 0) {
      queueSMS("SYSTEM_LOG", `Failed to notify HR for Pass #${pass_id}: No users found in 'USERS' sheet with both an HR/Admin role AND a valid phone number. Check columns.`);
    } else {
      const approveLink = `https://pipisara.github.io/BasilurExitPass/approve.html?id=${pass_id}`;
      const smsMessage = `Exit Pass\nName: ${employeeName} (${user_id})\n${formatSmsTime(exit_from)}\nPass #${pass_id}.\n\n${approveLink}`;
      approverPhones.forEach(phone => queueSMS(phone, smsMessage));
    }
  } catch (smsErr) {
    Logger.log("SMS queueing failed: " + smsErr.message);
  }

  // ── Send email notification to Approvers and HR ───────────────
  try {
    const userMap = buildUserMap();
    const employeeData = userMap[normalizeUserId(user_id)] || {};
    sendExitPassNotification({
      pass_id,
      user_id:         normalizeUserId(user_id),
      employee_name:   employeeData.name       || user_id,
      department:      employeeData.department || "—",
      reason,
      exit_from,
      exit_to:         exit_to || "",
      return_required: return_required || "Yes",
      request_time:    requestTime,
    });
  } catch (mailErr) {
    // Email failure must never block the pass creation response
    Logger.log("Email notification failed: " + mailErr.message);
  }

  return { success: true, pass_id };
}

// ── 3. GET MY PASSES ──────────────────────────────────────────────
function getMyPasses(body) {
  const { user_id } = body;
  if (!user_id && user_id !== 0) return { success: false, error: "user_id required." };

  const passSheet = getSheet("EXIT_PASSES");
  const passRows  = getAllRows(passSheet);
  const userMap   = buildUserMap();
  
  const targetId = normalizeUserId(user_id);

  const myRows = passRows
    .filter(r => normalizeUserId(r[PASS_COLS.user_id - 1]) === targetId)
    .reverse()  // Most recent first
    .map(r => formatPassRow(r, userMap));

  return { success: true, passes: myRows };
}

// ── 4. GET PENDING PASSES ─────────────────────────────────────────
function getPendingPasses(body) {
  const passSheet = getSheet("EXIT_PASSES");
  const passRows  = getAllRows(passSheet);
  const userMap   = buildUserMap();

  const pending = passRows
    .filter(r => r[PASS_COLS.approval_status - 1] === "PENDING")
    .map(r => formatPassRow(r, userMap))
    .sort((a, b) => new Date(a.request_time) - new Date(b.request_time));

  return { success: true, passes: pending };
}

// ── 5. GET ALL PASSES ─────────────────────────────────────────────
function getAllPasses(body) {
  const limit     = body.limit || 100;
  const passSheet = getSheet("EXIT_PASSES");
  const userSheet = getSheet("USERS");
  const passRows  = getAllRows(passSheet, limit); // Optimized fetching
  const userMap   = buildUserMap();

  const passes = passRows
    .reverse()
    .map(r => formatPassRow(r, userMap));

  return { success: true, passes };
}

// ── 6. APPROVE PASS ───────────────────────────────────────────────
function approvePass(body) {
  const { pass_id, status, approver_name } = body;
  if (!pass_id || !status) return { success: false, error: "pass_id and status required." };
  if (!["APPROVED", "REJECTED"].includes(status)) {
    return { success: false, error: "Invalid status. Use APPROVED or REJECTED." };
  }

  const sheet = getSheet("EXIT_PASSES");
  const rows  = sheet.getDataRange().getValues();

  const searchId = String(pass_id).trim();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][PASS_COLS.pass_id - 1]).trim() === searchId) {
      if (rows[i][PASS_COLS.approval_status - 1] !== "PENDING") {
        return { success: false, error: "This pass has already been processed." };
      }
      
      // Optimized: Batch update instead of multiple setValue calls
      const updateTime = now();
      const updateValues = [[status, approver_name || "System", updateTime]];
      sheet.getRange(i + 1, PASS_COLS.approval_status, 1, 3).setValues(updateValues);
      
      // Notify employee via SMS
      try {
        const userKey = normalizeUserId(rows[i][PASS_COLS.user_id - 1]);
        const userMap = buildUserMap();
        const employee = userMap[userKey];
        if (employee && employee.phone && status === "APPROVED") {
           const qrLink = `https://pipisara.github.io/BasilurExitPass/my_pass.html?id=${pass_id}`;
           const msg = `Exit Pass APPROVED\nPass #${pass_id}\nApprover: ${approver_name || 'System'}\n\nLink: ${qrLink}`;
           queueSMS(employee.phone, msg);
        }
      } catch (err) {
        Logger.log("SMS for approval failed: " + err.message);
      }
      
      return { success: true, pass_id, status };
    }
  }

  return { success: false, error: "Pass not found." };
}

// ── 7. VERIFY PASS ────────────────────────────────────────────────
function verifyPass(body) {
  const { pass_id } = body;
  if (!pass_id) return { success: false, error: "pass_id required." };

  const passSheet = getSheet("EXIT_PASSES");
  const userMap   = buildUserMap();
  const rows      = passSheet.getDataRange().getValues();

  const searchId = String(pass_id).trim();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[PASS_COLS.pass_id - 1]).trim() === searchId) {

      // ── Expiry Check ──────────────────────────────────────────
      const exitFrom = parseDate(row[PASS_COLS.exit_from - 1]);
      const exitTo   = parseDate(row[PASS_COLS.exit_to - 1]);
      const movement = row[PASS_COLS.movement_status - 1];
      const approval = row[PASS_COLS.approval_status - 1];
      const now      = new Date();

      let isExpired = false;
      if (approval === "APPROVED" && movement === "NOT_EXITED") {
        if (exitTo && now > exitTo) {
          isExpired = true;
        } else if (!exitTo && exitFrom) {
          // Default expiry: 6 hours after exit_from if no exit_to provided
          const defaultExpiry = new Date(exitFrom.getTime() + (6 * 60 * 60 * 1000));
          if (now > defaultExpiry) isExpired = true;
        }
        
        // Also expire if the pass is from a previous day and never used
        if (exitFrom && !isToday(exitFrom) && now > exitFrom) {
           isExpired = true;
        }
      }

      if (isExpired) {
        passSheet.getRange(i + 1, PASS_COLS.movement_status).setValue("EXPIRED");
        row[PASS_COLS.movement_status - 1] = "EXPIRED";
      }

      const pass = formatPassRow(row, userMap);
      return { success: true, pass };
    }
  }

  return { success: false, error: "Pass not found in the system." };
}

// ── 8. UPDATE MOVEMENT STATUS ─────────────────────────────────────
function updateMovementStatus(body) {
  const { pass_id, movement, guard_name } = body;
  if (!pass_id || !movement) return { success: false, error: "pass_id and movement required." };
  if (!["EXITED", "RETURNED"].includes(movement)) {
    return { success: false, error: "Invalid movement. Use EXITED or RETURNED." };
  }

  const sheet = getSheet("EXIT_PASSES");
  const rows  = sheet.getDataRange().getValues();

  const searchId = String(pass_id).trim();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[PASS_COLS.pass_id - 1]).trim() === searchId) {
      const currentMovement = row[PASS_COLS.movement_status - 1];
      const approval        = row[PASS_COLS.approval_status - 1];

      // Must be approved
      if (approval !== "APPROVED") {
        return { success: false, error: "This pass has not been approved." };
      }

      // Validate transitions
      const validTransitions = {
        EXITED:   ["NOT_EXITED"],
        RETURNED: ["EXITED"],
      };

      if (!validTransitions[movement].includes(currentMovement)) {
        return {
          success: false,
          error: `Cannot transition from ${currentMovement} to ${movement}.`,
        };
      }

      // Optimized: Batch update
      const updateTime = now();
      const returnRequired = row[PASS_COLS.return_required - 1];
      let finalMovement = movement;
      
      // If movement is EXITED and no return is required, mark as RETURNED (Completed)
      // to prevent reuse and simplify logic.
      if (movement === "EXITED" && returnRequired === "No") {
        finalMovement = "RETURNED";
      }

      const rowValues = [...rows[i]];
      rowValues[PASS_COLS.movement_status - 1] = finalMovement;
      rowValues[PASS_COLS.guard_name - 1] = guard_name || "";
      if (movement === "EXITED") rowValues[PASS_COLS.exit_time - 1] = updateTime;
      if (movement === "RETURNED" || finalMovement === "RETURNED") rowValues[PASS_COLS.return_time - 1] = updateTime;
      
      const batchValues = [[
        rowValues[PASS_COLS.movement_status - 1],
        rowValues[PASS_COLS.exit_time - 1],
        rowValues[PASS_COLS.return_time - 1],
        rowValues[PASS_COLS.guard_name - 1]
      ]];
      sheet.getRange(i + 1, PASS_COLS.movement_status, 1, 4).setValues(batchValues);

      return { success: true, pass_id, movement: finalMovement };
    }
  }

  return { success: false, error: "Pass not found." };
}

// ── 9. GET GUARD LOG ──────────────────────────────────────────────
function getGuardLog(body) {
  const limit     = body.limit || 30;
  const passSheet = getSheet("EXIT_PASSES");
  const userMap   = buildUserMap();
  const rows      = getAllRows(passSheet);

  const moved = rows
    .filter(r => ["EXITED", "RETURNED"].includes(r[PASS_COLS.movement_status - 1]))
    .map(r => formatPassRow(r, userMap))
    .sort((a, b) => {
      const ta = Math.max(new Date(a.exit_time || 0), new Date(a.return_time || 0));
      const tb = Math.max(new Date(b.exit_time || 0), new Date(b.return_time || 0));
      return tb - ta;
    })
    .slice(0, limit);

  return { success: true, entries: moved };
}

// ── 9.1 GET APPROVED PASSES (upcoming exits) ──────────────────────
function getApprovedPasses(body) {
  const passSheet = getSheet("EXIT_PASSES");
  const passRows  = getAllRows(passSheet);
  const userMap   = buildUserMap();

  const approved = passRows
    .filter(r => r[PASS_COLS.approval_status - 1] === "APPROVED" && r[PASS_COLS.movement_status - 1] === "NOT_EXITED")
    .map(r => formatPassRow(r, userMap))
    .sort((a, b) => new Date(a.exit_from) - new Date(b.exit_from));

  return { success: true, passes: approved };
}

// ── 9.2 GET EXPECTED RETURNS ──────────────────────────────────────
function getExpectedReturns(body) {
  const passSheet = getSheet("EXIT_PASSES");
  const passRows  = getAllRows(passSheet);
  const userMap   = buildUserMap();

  const expected = passRows
    .filter(r => 
       r[PASS_COLS.approval_status - 1] === "APPROVED" && 
       r[PASS_COLS.movement_status - 1] === "EXITED" &&
       r[PASS_COLS.return_required - 1] !== "No"
    )
    .map(r => formatPassRow(r, userMap))
    .sort((a, b) => new Date(a.exit_time || 0) - new Date(b.exit_time || 0));

  return { success: true, passes: expected };
}

// ── 9.3 REVERT MOVEMENT STATUS ────────────────────────────────────
function revertMovementStatus(body) {
  const { pass_id, new_status, guard_name } = body;
  if (!pass_id || !new_status) return { success: false, error: "pass_id and new_status required." };
  if (!["NOT_EXITED", "EXITED"].includes(new_status)) {
    return { success: false, error: "Invalid revert status. Use NOT_EXITED or EXITED." };
  }

  const sheet = getSheet("EXIT_PASSES");
  const rows  = sheet.getDataRange().getValues();

  const searchId = String(pass_id).trim();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[PASS_COLS.pass_id - 1]).trim() === searchId) {
      const currentMovement = row[PASS_COLS.movement_status - 1];
      
      const rowValues = [...rows[i]];
      // Force change the status
      rowValues[PASS_COLS.movement_status - 1] = new_status;
      rowValues[PASS_COLS.guard_name - 1] = guard_name || "";
      
      // If returning to NOT_EXITED, clear both times
      if (new_status === "NOT_EXITED") {
        rowValues[PASS_COLS.exit_time - 1] = "";
        rowValues[PASS_COLS.return_time - 1] = "";
      } 
      // If returning to EXITED, clear only return time
      else if (new_status === "EXITED") {
        rowValues[PASS_COLS.return_time - 1] = "";
      }
      
      const batchValues = [[
        rowValues[PASS_COLS.movement_status - 1],
        rowValues[PASS_COLS.exit_time - 1],
        rowValues[PASS_COLS.return_time - 1],
        rowValues[PASS_COLS.guard_name - 1]
      ]];
      sheet.getRange(i + 1, PASS_COLS.movement_status, 1, 4).setValues(batchValues);

      return { success: true, pass_id, movement: new_status };
    }
  }

  return { success: false, error: "Pass not found." };
}

// ── 10. GET STATS ─────────────────────────────────────────────────
function getStats(body) {
  const passSheet = getSheet("EXIT_PASSES");
  const rows      = getAllRows(passSheet);
  const today     = new Date();
  today.setHours(0, 0, 0, 0);

  let pending      = 0;
  let approvedToday = 0;
  let rejectedToday = 0;
  let currentlyOut  = 0;

  rows.forEach(r => {
    const ap  = r[PASS_COLS.approval_status - 1];
    const mv  = r[PASS_COLS.movement_status - 1];
    const apt = parseDate(r[PASS_COLS.approval_time - 1]);

    if (ap === "PENDING")   pending++;
    if (mv === "EXITED")    currentlyOut++;

    if (apt && apt >= today) {
      if (ap === "APPROVED") approvedToday++;
      if (ap === "REJECTED") rejectedToday++;
    }
  });

  return { success: true, pending, approvedToday, rejectedToday, currentlyOut };
}

// ── EMAIL LOG ─────────────────────────────────────────────────────
/**
 * Returns recent entries from the EMAIL_LOG sheet.
 */
function getEmailLog(body) {
  const limit = body.limit || 100;
  const logSheet = getSheet("EMAIL_LOG");
  if (!logSheet) return { success: false, error: "EMAIL_LOG sheet not found. Run setupDatabase()." };

  const rows = getAllRows(logSheet, limit);
  const logs = rows.reverse().map(r => ({
    log_id:        r[EMAIL_LOG_COLS.log_id        - 1],
    pass_id:       r[EMAIL_LOG_COLS.pass_id       - 1],
    recipient:     r[EMAIL_LOG_COLS.recipient     - 1],
    status:        r[EMAIL_LOG_COLS.status        - 1],
    sent_at:       formatDateTime(r[EMAIL_LOG_COLS.sent_at - 1]),
    error_message: r[EMAIL_LOG_COLS.error_message - 1],
  }));
  return { success: true, logs };
}

/**
 * Writes one row to the EMAIL_LOG sheet.
 */
function logEmailResult(passId, recipient, status, errorMsg) {
  try {
    const logSheet = getSheet("EMAIL_LOG");
    if (!logSheet) return;
    const lastRow = logSheet.getLastRow();
    const logId   = lastRow <= 1 ? 1 : lastRow; // simple auto-increment
    logSheet.appendRow([
      logId,
      passId,
      recipient,
      status,
      new Date().toISOString(),
      errorMsg || "",
    ]);
  } catch (e) {
    Logger.log("logEmailResult failed: " + e.message);
  }
}

// ── EMAIL NOTIFICATION ────────────────────────────────────────────
/**
 * Sends an HTML email notification to all users with role 'approver' or 'hr'
 * whenever a new exit pass request is submitted.
 * Results are recorded in the EMAIL_LOG sheet and email_notification column
 * on EXIT_PASSES is updated to SENT / PARTIAL / FAILED / NONE.
 *
 * @param {Object} pass  - Pass details object
 */
function sendExitPassNotification(pass) {
  const passSheet = getSheet("EXIT_PASSES");
  const userSheet = getSheet("USERS");
  const userRows  = getAllRows(userSheet);

  // ── Collect recipients ────────────────────────────────────────
  const recipients = [];
  userRows.forEach(r => {
    const role  = (r[USER_COLS.role  - 1] || "").toString().trim().toLowerCase();
    const dept  = (r[USER_COLS.department - 1] || "").toString().trim().toLowerCase();
    const email = (r[USER_COLS.email - 1] || "").toString().trim();

    const isHrOrAdmin = 
      role === "admin" || role === "approver" || role === "hr" || 
      dept === "hr" || dept === "admin";
      
    if (isHrOrAdmin && email) {
      if (!recipients.includes(email)) {
        recipients.push(email);
      }
    }
  });

  if (recipients.length === 0) {
    Logger.log("No approver/HR emails found. Skipping notification.");
    // Mark the pass column as NONE
    updatePassEmailStatus(passSheet, pass.pass_id, "NONE");
    return;
  }

  // ── Format helper ─────────────────────────────────────────────
  function fmtDT(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString("en-US", {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  }

  const approveUrl = `https://pipisara.github.io/BasilurExitPass/approve.html?id=${pass.pass_id}`;
  const systemUrl  = "https://pipisara.github.io/BasilurExitPass/approve.html";

  // ── HTML Email Template (light theme, mobile-responsive) ─────────
  const htmlBody = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>New Exit Pass Request - Basilur</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif !important;
      background-color: #f0f0f5 !important;
      color: #1a1a2e !important;
      -webkit-font-smoothing: antialiased;
      padding: 24px 12px; margin: 0;
    }
    .email-wrapper {
      max-width: 600px; margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px; overflow: hidden;
      border: 1px solid #dde0ef;
      box-shadow: 0 8px 32px rgba(0,0,0,0.10);
    }
    .header {
      background: linear-gradient(135deg, #1a0e30 0%, #0e1222 100%) !important;
      padding: 28px 32px 24px; text-align: center;
    }
    .header-logo-wrap { display: block; text-align: center; margin-bottom: 14px; }
    .logo-img { max-height: 44px; width: auto; max-width: 160px; display: inline-block; vertical-align: middle; }
    .logo-sep { display: inline-block; width: 1px; height: 30px; background: rgba(245,166,35,0.4); vertical-align: middle; margin: 0 12px; }
    .logo-text-wrap { display: inline-block; vertical-align: middle; text-align: left; line-height: 1.3; }
    .logo-name { font-size: 15px; font-weight: 800; letter-spacing: 0.16em; color: #ffffff !important; text-transform: uppercase; display: block; }
    .logo-sub  { font-size: 10px; font-weight: 700; letter-spacing: 0.24em; color: #f5a623 !important; text-transform: uppercase; display: block; margin-top: 2px; }
    .new-badge {
      display: inline-block;
      background: rgba(245,166,35,0.16); color: #f5a623 !important;
      border: 1px solid rgba(245,166,35,0.45); border-radius: 20px;
      padding: 4px 16px; font-size: 11px; font-weight: 700;
      letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px;
    }
    .header h1 { font-size: 20px; font-weight: 700; color: #ffffff !important; margin-bottom: 5px; }
    .header p  { font-size: 13px; color: #9999bb !important; }
    .body { padding: 28px 32px 24px; background-color: #ffffff !important; }
    .alert-strip {
      background-color: #fffbf0 !important;
      border-left: 3px solid #f5a623; border-radius: 0 8px 8px 0;
      padding: 12px 16px; margin-bottom: 22px;
      font-size: 13px; color: #7a5a00 !important; line-height: 1.6;
    }
    .alert-strip strong { color: #5a3f00 !important; }
    .section-label { font-size: 10px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #888aaa !important; margin-bottom: 10px; }
    .details-table {
      width: 100%; border-collapse: collapse;
      border: 1px solid #e0e2ef; border-radius: 10px; overflow: hidden;
      margin-bottom: 22px; font-size: 13px;
    }
    .details-table tr { border-bottom: 1px solid #eceef8; }
    .details-table tr:last-child { border-bottom: none; }
    .details-table td.col-label {
      width: 185px; padding: 11px 16px;
      background-color: #f7f8fc !important; color: #6668a0 !important;
      font-size: 12px; font-weight: 600; letter-spacing: 0.03em;
      border-right: 1px solid #eceef8; vertical-align: middle; white-space: nowrap;
    }
    .details-table td.col-value {
      padding: 11px 16px; color: #1a1a2e !important;
      font-weight: 500; vertical-align: middle; background-color: #ffffff !important;
    }
    .col-value.highlight { color: #b8720a !important; font-weight: 700; font-size: 15px; font-family: 'Courier New', monospace; }
    .col-value.mono { font-family: 'Courier New', monospace; color: #3a3a6a !important; }
    .pill { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .pill-pending { background-color: #fff7e6 !important; color: #b8720a !important; border: 1px solid #f5c678; }
    .pill-yes     { background-color: #eafaf4 !important; color: #1a7a52 !important; border: 1px solid #74d4ab; }
    .pill-no      { background-color: #f5f5f8 !important; color: #777799 !important; border: 1px solid #ccccdd; }
    .divider { border: none; border-top: 1px solid #eceef8; margin: 4px 0 22px; }
    .actions { text-align: center; margin-bottom: 6px; }
    .actions p { font-size: 12px; color: #8888aa !important; margin-bottom: 14px; }
    .btn-row { display: inline-block; width: 100%; text-align: center; }
    .btn { display: inline-block; padding: 13px 26px; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; letter-spacing: 0.03em; margin: 4px 6px; }
    .btn-approve { background-color: #f5a623 !important; color: #1a0a00 !important; }
    .btn-visit   { background-color: #f5f5fa !important; color: #3a3a6a !important; border: 1px solid #ccccdd; }
    .footer { background-color: #f7f8fc !important; border-top: 1px solid #e0e2ef; padding: 18px 32px; text-align: center; }
    .footer p { font-size: 11px; color: #9999bb !important; line-height: 1.8; }
    .footer a { color: #7070bb !important; text-decoration: none; }
    @media only screen and (max-width: 480px) {
      body { padding: 12px 6px !important; }
      .email-wrapper { border-radius: 12px !important; }
      .header { padding: 22px 18px 18px !important; }
      .logo-sep { display: none !important; }
      .logo-text-wrap { display: block !important; text-align: center !important; margin-top: 8px; }
      .logo-img { max-height: 36px !important; max-width: 130px !important; }
      .header h1 { font-size: 17px !important; }
      .body { padding: 20px 16px 18px !important; }
      .details-table td.col-label { width: 120px !important; padding: 10px 10px !important; font-size: 11px !important; white-space: normal !important; }
      .details-table td.col-value { padding: 10px 10px !important; font-size: 12px !important; }
      .col-value.highlight { font-size: 13px !important; }
      .btn { display: block !important; margin: 6px auto !important; max-width: 260px !important; width: 100%; }
      .footer { padding: 14px 16px !important; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <div class="header-logo-wrap">
        <img src="https://www.basilurtea.com/cdn/shop/files/Basilur.png?v=1614329016"
             alt="Basilur" class="logo-img" />
        <span class="logo-sep"></span>
        <span class="logo-text-wrap" style="color: #ffffff;">
          <span class="logo-name" style="color: #ffffff !important;">Basilur</span>
          <span class="logo-sub" style="color: #f5a623 !important;">Exit Pass</span>
        </span>
      </div>
      <div class="new-badge">🔔 New Request</div>
      <h1 style="color: #ffffff !important;">Exit Pass Request Submitted</h1>
      <p style="color: #9999bb !important;">An employee has submitted a new exit pass that requires your review.</p>
    </div>
    <div class="body">
      <div class="alert-strip">
        ⏳ This request is currently <strong>PENDING</strong> and awaiting your approval.
        Please review the details below and take action at your earliest convenience.
      </div>
      <div class="section-label">Request Details</div>
      <table class="details-table" cellpadding="0" cellspacing="0">
        <tr><td class="col-label">Pass ID</td>          <td class="col-value highlight">${pass.pass_id}</td></tr>
        <tr><td class="col-label">Employee Name</td>    <td class="col-value">${pass.employee_name}</td></tr>
        <tr><td class="col-label">Employee ID</td>      <td class="col-value mono">${pass.user_id}</td></tr>
        <tr><td class="col-label">Department</td>       <td class="col-value">${pass.department}</td></tr>
        <tr><td class="col-label">Reason for Exit</td>  <td class="col-value">${pass.reason}</td></tr>
        <tr><td class="col-label">Exit Time</td>        <td class="col-value">${fmtDT(pass.exit_from)}</td></tr>
        <tr><td class="col-label">Expected Return</td>  <td class="col-value">${pass.return_required === "No" ? "<span class='pill pill-no'>No Return</span>" : fmtDT(pass.exit_to)}</td></tr>
        <tr><td class="col-label">Return Required</td>  <td class="col-value">${pass.return_required === "No" ? "<span class='pill pill-no'>No</span>" : "<span class='pill pill-yes'>Yes</span>"}</td></tr>
        <tr><td class="col-label">Approval Status</td>  <td class="col-value"><span class="pill pill-pending">Pending</span></td></tr>
        <tr><td class="col-label">Submitted At</td>     <td class="col-value mono" style="font-size:12px;">${fmtDT(pass.request_time)}</td></tr>
      </table>
      <hr class="divider">
      <div class="actions">
        <p>Take action directly from this email, or visit the dashboard to review in full.</p>
        <div class="btn-row">
          <a href="${approveUrl}" class="btn btn-approve">✓ Review &amp; Approve</a>
          <a href="${systemUrl}" class="btn btn-visit">🖥 Visit Dashboard</a>
        </div>
      </div>
    </div>
    <div class="footer">
      <p>
        Automated notification from the
        <strong>Basilur Exit Pass Management System</strong>.<br>
        You are receiving this as an Approver or HR personnel.<br>
        <a href="${systemUrl}">Open Dashboard</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

  const subject = `[Exit Pass] New Request – ${pass.employee_name} | Pass #${pass.pass_id}`;
  const plainBody = [
    "New Exit Pass Request Submitted",
    "================================",
    `Pass ID       : ${pass.pass_id}`,
    `Employee      : ${pass.employee_name} (ID: ${pass.user_id})`,
    `Department    : ${pass.department}`,
    `Reason        : ${pass.reason}`,
    `Exit Time     : ${fmtDT(pass.exit_from)}`,
    `Return Time   : ${pass.return_required === "No" ? "No Return" : fmtDT(pass.exit_to)}`,
    `Return Req.   : ${pass.return_required}`,
    `Submitted At  : ${fmtDT(pass.request_time)}`,
    "",
    "Review & Approve: " + approveUrl,
    "Visit Dashboard: " + systemUrl,
  ].join("\n");

  // ── Send to each recipient & log results ─────────────────────
  let sentCount   = 0;
  let failedCount = 0;

  recipients.forEach(email => {
    try {
      // MailApp works even when GmailApp quota is exhausted and
      // is the recommended method for server-side GAS scripts.
      MailApp.sendEmail({
        to:       email,
        subject:  subject,
        body:     plainBody,
        htmlBody: htmlBody,
        name:     "Basilur Exit Pass System",
      });
      Logger.log("✅ Notification sent to: " + email);
      logEmailResult(pass.pass_id, email, "SENT", "");
      sentCount++;
    } catch (err) {
      Logger.log("❌ Failed to send to " + email + ": " + err.message);
      logEmailResult(pass.pass_id, email, "FAILED", err.message);
      failedCount++;
    }
    // Small pause to avoid hitting Gmail rate limits
    Utilities.sleep(300);
  });

  // ── Update email_notification column on EXIT_PASSES ──────────
  let overallStatus = "NONE";
  if (sentCount > 0 && failedCount === 0) overallStatus = "SENT";
  else if (sentCount > 0 && failedCount > 0) overallStatus = "PARTIAL";
  else if (sentCount === 0 && failedCount > 0) overallStatus = "FAILED";

  updatePassEmailStatus(passSheet, pass.pass_id, overallStatus);
  Logger.log(`Email summary for pass ${pass.pass_id}: ${overallStatus} (sent=${sentCount}, failed=${failedCount})`);
}

/**
 * Updates the email_notification column on EXIT_PASSES for the given pass_id.
 */
function updatePassEmailStatus(passSheet, passId, status) {
  try {
    const rows = passSheet.getDataRange().getValues();
    const searchId = String(passId).trim();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][PASS_COLS.pass_id - 1]).trim() === searchId) {
        passSheet.getRange(i + 1, PASS_COLS.email_notification).setValue(status);
        return;
      }
    }
  } catch (e) {
    Logger.log("updatePassEmailStatus failed: " + e.message);
  }
}

// ── AUTO-EXPIRE TRIGGER ───────────────────────────────────────────
// Set this up as a time-driven trigger in Apps Script:
//   Triggers → Add Trigger → autoExpirePasses → Time-driven → Every 10 minutes
function autoExpirePasses() {
  const sheet = getSheet("EXIT_PASSES");
  const rows  = sheet.getDataRange().getValues();
  const nowTime = new Date();
  let expired = 0;
  let overdue = 0;
  
  const userMap = buildUserMap(getSheet("USERS"));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const approval = row[PASS_COLS.approval_status - 1];
    const movement = row[PASS_COLS.movement_status - 1];
    const exitTo   = parseDate(row[PASS_COLS.exit_to - 1]);

    if (approval === "APPROVED" && movement === "NOT_EXITED" && exitTo && nowTime > exitTo) {
      sheet.getRange(i + 1, PASS_COLS.movement_status).setValue("EXPIRED");
      expired++;
    }
    
    // Overdue returns notification
    if (approval === "APPROVED" && movement === "EXITED" && exitTo && nowTime > exitTo) {
      const isNotified = row[PASS_COLS.overdue_notified - 1];
      if (isNotified !== "YES") {
        sheet.getRange(i + 1, PASS_COLS.overdue_notified).setValue("YES");
        
        try {
          const userKey = normalizeUserId(row[PASS_COLS.user_id - 1]);
          const employee = userMap[userKey];
          if (employee && employee.phone) {
            const passId = row[PASS_COLS.pass_id - 1];
            queueSMS(employee.phone, `Basilur Exit Pass Alert: You are overdue for return! Please return immediately. (Pass #${passId})`);
            overdue++;
          }
        } catch(e) {
          Logger.log("Failed to send overdue SMS: " + e.message);
        }
      }
    }
  }

  // ── SMS Queue Cleanup (Expire older than 1 hour) ──────────
  let smsExpired = 0;
  try {
    const smsSheet = getSheet("SMS_QUEUE") || getSheet("sms que") || getSheet("SMS QUEUE") || getSheet("sms_queue");
    if (smsSheet) {
      const smsRows = smsSheet.getDataRange().getValues();
      const oneHourMillis = 60 * 60 * 1000;
      
      for (let j = 1; j < smsRows.length; j++) {
        if (smsRows[j][3] === "PENDING") {
          const createdAt = parseDate(smsRows[j][4]);
          if (createdAt && (nowTime - createdAt) > oneHourMillis) {
            smsSheet.getRange(j + 1, 4).setValue("EXPIRED");
            smsExpired++;
          }
        }
      }
    }
  } catch (e) {
    Logger.log("SMS Queue Cleanup failed: " + e.message);
  }

  Logger.log(`Auto-expire run: ${expired} passes expired. ${overdue} overdue SMS sent. ${smsExpired} SMS expired.`);
}

function buildUserMap() {
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get("user_map");
  if (cachedData) return JSON.parse(cachedData);

  const map = {};
  for (const sheetName of USER_SHEETS) {
    const sheet = getSheet(sheetName);
    if (!sheet) continue;
    const rows = getAllRows(sheet);
    rows.forEach(r => {
      const uid = r[USER_COLS.user_id - 1];
      if (uid !== "" && uid != null) {
        const key = normalizeUserId(uid);
        const phoneVal = r[USER_COLS.phone - 1] ? r[USER_COLS.phone - 1].toString().trim() : "";
        map[key] = {
          name:       r[USER_COLS.name       - 1],
          department: r[USER_COLS.department - 1],
          role:       r[USER_COLS.role       - 1],
          email:      r[USER_COLS.email      - 1],
          phone:      phoneVal,
          sheet_name: sheetName
        };
      }
    });
  }

  cache.put("user_map", JSON.stringify(map), 900);
  return map;
}

// ── UTILITY: Format a pass row to object ─────────────────────────
function formatPassRow(row, userMap) {
  const userId = row[PASS_COLS.user_id - 1];
  const userKey = normalizeUserId(userId);
  const user   = userMap && userKey ? userMap[userKey] : null;

  return {
    pass_id:         String(row[PASS_COLS.pass_id - 1]).trim(),
    user_id:         userId,
    employee_name:   user ? user.name       : "",
    department:      user ? user.department : "",
    reason:          row[PASS_COLS.reason          - 1],
    request_time:    formatDateTime(row[PASS_COLS.request_time    - 1]),
    exit_from:       formatDateTime(row[PASS_COLS.exit_from       - 1]),
    exit_to:         formatDateTime(row[PASS_COLS.exit_to         - 1]),
    approval_status: row[PASS_COLS.approval_status - 1],
    approved_by:     row[PASS_COLS.approved_by     - 1],
    approval_time:   formatDateTime(row[PASS_COLS.approval_time   - 1]),
    movement_status: row[PASS_COLS.movement_status - 1],
    exit_time:       formatDateTime(row[PASS_COLS.exit_time       - 1]),
    return_time:     formatDateTime(row[PASS_COLS.return_time     - 1]),
    guard_name:      row[PASS_COLS.guard_name      - 1],
    return_required: row[PASS_COLS.return_required - 1],
  };
}

// ── SMS NOTIFICATION SYSTEM ───────────────────────────────────────
/**
 * Inserts a new SMS into the SMS_QUEUE sheet.
 */
function queueSMS(phoneNumber, message) {
  if (!phoneNumber) return;
  try {
    let sheet = getSheet("SMS_QUEUE");
    if (!sheet) {
      // Fallback names in case user created it manually with slightly different names
      sheet = getSheet("sms que") || getSheet("SMS QUEUE") || getSheet("sms_queue");
    }
    
    // If it still doesn't exist, automatically create it
    if (!sheet) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      sheet = ss.insertSheet("SMS_QUEUE");
      const smsHeaders = ["id", "phone_number", "message", "status", "created_at", "sent_at"];
      sheet.getRange(1, 1, 1, smsHeaders.length).setValues([smsHeaders]);
      sheet.getRange(1, 1, 1, smsHeaders.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 250); // id
      sheet.setColumnWidth(2, 120); // phone
      sheet.setColumnWidth(3, 400); // msg
    }
    
    const id = Utilities.getUuid();
    const createdAt = now();
    
    // id, phone_number, message, status, created_at, sent_at
    sheet.appendRow([id, phoneNumber, message, "PENDING", createdAt, ""]);
  } catch(e) {
    Logger.log("queueSMS failed: " + e.message);
  }
}

/**
 * Returns all PENDING messages from the queue.
 */
function getPendingSMS(body) {
  try {
    let sheet = getSheet("SMS_QUEUE") || getSheet("sms que") || getSheet("SMS QUEUE") || getSheet("sms_queue");
    if (!sheet) return { success: false, error: "SMS_QUEUE not found. Run setupDatabase()." };
    
    const rows = sheet.getDataRange().getValues();
    const messages = [];
    const nowTime = new Date();
    const oneHourMillis = 60 * 60 * 1000;
    
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][3] === "PENDING") {
        const createdAt = parseDate(rows[i][4]);
        
        // If message is older than 1 hour, mark as EXPIRED and skip
        if (createdAt && (nowTime - createdAt) > oneHourMillis) {
          sheet.getRange(i + 1, 4).setValue("EXPIRED");
          continue;
        }

        messages.push({
          id: String(rows[i][0]).trim(),
          phone_number: String(rows[i][1]).trim(),
          message: String(rows[i][2]).trim()
        });
      }
    }
    
    return { success: true, messages };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/**
 * Updates status of a queued SMS message.
 */
function updateSMSStatus(body) {
  const { id, status } = body;
  if (!id || !status) return { success: false, error: "id and status required" };
  
  try {
    let sheet = getSheet("SMS_QUEUE") || getSheet("sms que") || getSheet("SMS QUEUE") || getSheet("sms_queue");
    if (!sheet) return { success: false, error: "SMS_QUEUE not found" };
    
    const rows = sheet.getDataRange().getValues();
    const targetId = String(id).trim();
    
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === targetId) {
        const updateVals = [[status, status === "SENT" ? now() : rows[i][5]]];
        sheet.getRange(i + 1, 4, 1, 2).setValues(updateVals);
        return { success: true, id, status };
      }
    }
    
    return { success: false, error: "SMS not found in queue" };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ── ONE-TIME MAIL AUTHORIZATION ───────────────────────────────────
// ⚠️  Run this function ONCE manually from the Apps Script editor
//     (select it from the function dropdown → click Run).
//     This triggers the Google OAuth consent screen so the deployed
//     web app gets permission to send email via MailApp.
//     After approving, redeploy as a NEW VERSION.
function authorizeMailApp() {
  try {
    // Sending a real email to yourself is the simplest trigger for the scope
    const me = Session.getActiveUser().getEmail();
    MailApp.sendEmail({
      to:      me,
      subject: "[Basilur Exit Pass] ✅ Mail Authorization Successful",
      body:    [
        "This is a test email confirming that the Basilur Exit Pass System",
        "has been successfully authorized to send email notifications.",
        "",
        "You can now redeploy the web app as a new version.",
        "Sent at: " + new Date().toLocaleString(),
      ].join("\n"),
      htmlBody: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:32px auto;
                    background:#18181f;color:#e2e2e2;border-radius:12px;
                    border:1px solid #2a2a3a;padding:32px;text-align:center;">
          <div style="font-size:40px;margin-bottom:12px;">✅</div>
          <h2 style="color:#f5a623;margin-bottom:8px;">Authorization Successful!</h2>
          <p style="color:#aaa;font-size:14px;line-height:1.6;">
            The <strong style="color:#fff;">Basilur Exit Pass System</strong> now has
            permission to send email notifications via MailApp.<br><br>
            <strong style="color:#f5a623;">Next step:</strong> Redeploy your web app
            as a <em>new version</em> in Apps Script to activate email notifications.
          </p>
          <p style="margin-top:20px;font-size:12px;color:#555;">
            Sent at: ${new Date().toLocaleString()}
          </p>
        </div>`,
      name: "Basilur Exit Pass System",
    });
    Logger.log("✅ authorizeMailApp: Authorization successful. Email sent to: " + me);
    SpreadsheetApp.getUi().alert(
      "✅ Authorization Successful!\n\n" +
      "A test email was sent to: " + me + "\n\n" +
      "Now redeploy your web app as a NEW VERSION to activate email notifications."
    );
  } catch (err) {
    Logger.log("❌ authorizeMailApp failed: " + err.message);
    SpreadsheetApp.getUi().alert("❌ Failed: " + err.message);
  }
}

// ── SETUP SCRIPT ──────────────────────────────────────────────────
// Run this function once from the Apps Script editor to create the sheets and columns
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup USER sheets
  for (const sheetName of USER_SHEETS) {
    let usersSheet = ss.getSheetByName(sheetName);
    if (!usersSheet) {
      usersSheet = ss.insertSheet(sheetName);
    }
    const userHeaders = ["user_id", "name", "department", "role", "email", "password", "phone"];
    usersSheet.getRange(1, 1, 1, userHeaders.length).setValues([userHeaders]);
    usersSheet.getRange(1, 1, 1, userHeaders.length).setFontWeight("bold");
    usersSheet.setFrozenRows(1);

    // Add dummy data for FACTORY if empty
    if (sheetName === "FACTORY_USERS" && usersSheet.getLastRow() <= 1) {
      usersSheet.appendRow(["001", "John Smith", "Engineering", "employee", "john@company.com", ""]);
      usersSheet.appendRow(["003", "Mike Guard", "Security", "guard", "mike@company.com", ""]);
    }
    // Add dummy data for OFFICE if empty
    if (sheetName === "OFFICE_USERS" && usersSheet.getLastRow() <= 1) {
      usersSheet.appendRow(["002", "Sarah Lee", "HR", "approver", "sarah@company.com", "pass123"]);
      usersSheet.appendRow(["004", "Admin System", "IT", "admin", "admin@company.com", "admin123"]);
    }
  }

  // 2. Setup EXIT_PASSES sheet
  let passesSheet = ss.getSheetByName("EXIT_PASSES");
  if (!passesSheet) {
    passesSheet = ss.insertSheet("EXIT_PASSES");
  }
  const passHeaders = [
    "pass_id", "user_id", "reason", "request_time", "exit_from",
    "exit_to", "approval_status", "approved_by", "approval_time",
    "movement_status", "exit_time", "return_time", "guard_name",
    "return_required", "email_notification", "overdue_notified"
  ];
  passesSheet.getRange(1, 1, 1, passHeaders.length).setValues([passHeaders]);
  passesSheet.getRange(1, 1, 1, passHeaders.length).setFontWeight("bold");
  passesSheet.setFrozenRows(1);

  // 3. Setup EMAIL_LOG sheet
  let emailLogSheet = ss.getSheetByName("EMAIL_LOG");
  if (!emailLogSheet) {
    emailLogSheet = ss.insertSheet("EMAIL_LOG");
  }
  const emailLogHeaders = [
    "log_id", "pass_id", "recipient", "status", "sent_at", "error_message"
  ];
  emailLogSheet.getRange(1, 1, 1, emailLogHeaders.length).setValues([emailLogHeaders]);
  emailLogSheet.getRange(1, 1, 1, emailLogHeaders.length).setFontWeight("bold");
  // Colour-code header row for easy reading
  emailLogSheet.getRange(1, 1, 1, emailLogHeaders.length).setBackground("#1a1a2e").setFontColor("#f5a623");
  emailLogSheet.setFrozenRows(1);
  // Auto-resize columns for readability
  emailLogSheet.setColumnWidth(3, 220);  // recipient
  emailLogSheet.setColumnWidth(5, 180);  // sent_at
  emailLogSheet.setColumnWidth(6, 300);  // error_message

  // 4. Setup SMS_QUEUE sheet
  let smsQueueSheet = ss.getSheetByName("SMS_QUEUE");
  if (!smsQueueSheet) {
    smsQueueSheet = ss.insertSheet("SMS_QUEUE");
  }
  const smsHeaders = ["id", "phone_number", "message", "status", "created_at", "sent_at"];
  smsQueueSheet.getRange(1, 1, 1, smsHeaders.length).setValues([smsHeaders]);
  smsQueueSheet.getRange(1, 1, 1, smsHeaders.length).setFontWeight("bold");
  smsQueueSheet.setFrozenRows(1);
  smsQueueSheet.setColumnWidth(1, 250); // id
  smsQueueSheet.setColumnWidth(2, 120); // phone
  smsQueueSheet.setColumnWidth(3, 400); // msg

  // 5. Optional: Remove default "Sheet1" if it exists
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  Logger.log("✅ Database setup complete! USERS, EXIT_PASSES, and EMAIL_LOG sheets are ready.");
}

// ── TEST SMS COMMAND ──────────────────────────────────────────────
// Run this function from the Apps Script editor to queue a test SMS.
function testSMS() {
  Logger.log("Queueing test SMS...");
  queueSMS("0776337250", "Test message from Basilur Exit Pass System. If you receive this, the gateway is working!");
  Logger.log("Test SMS queued successfully! Check the SMS_QUEUE sheet and run your Python script.");
}

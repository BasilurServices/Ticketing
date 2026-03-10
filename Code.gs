// ============================================================
//  IT TICKETING PLATFORM — Google Apps Script Backend
//  File: Code.gs
//  Deploy as: Web App (Execute as Me, Access: Anyone)
// ============================================================

// ─── CONFIGURATION ──────────────────────────────────────────
const CONFIG = {
  DRIVE_FOLDER_NAME: 'IT Ticket Screenshots', // Name of folder to save screenshots
  NOTIFY_EMAIL: 'systems7.basilurtea@gmail.com',    // IT team email for notifications
  ADMIN_EMAIL: 'systems7.basilurtea@gmail.com',       // Admin email
  COMPANY_NAME: 'Basilur Tea Export',
  SHEET_NAME: 'Tickets',
  USERS_SHEET_NAME: 'Users',  // Sheet that stores user emails, names, roles
  MAIL_LOGS_SHEET_NAME: 'Mail Logs'
};

// Column index map (1-based)
const COL = {
  TICKET_ID: 1,
  DATE_CREATED: 2,
  NAME: 3,
  EMAIL: 4,
  DEPARTMENT: 5,
  CATEGORY: 6,
  PRIORITY: 7,
  DESCRIPTION: 8,
  SCREENSHOT_LINK: 9,
  STATUS: 10,
  ASSIGNED_TECHNICIAN: 11,
  COMMENTS: 12,
  RESOLUTION: 13,
  LAST_UPDATED: 14
};

const HEADERS = [
  'Ticket ID', 'Date Created', 'Employee Name', 'Email Address',
  'Department', 'Issue Category', 'Priority Level', 'Description',
  'Screenshot Link', 'Ticket Status', 'Assigned Technician',
  'Comments', 'Resolution', 'Last Updated'
];

// Users sheet column map (1-based)
const USER_COL = {
  EMAIL: 1,
  NAME: 2,
  ROLE: 3,       // 'admin' or 'normal'
  DEPARTMENT: 4,
  PASSWORD: 5
};

const USER_HEADERS = ['Email', 'Name', 'Role', 'Department', 'Password'];

// ─── INITIALIZATION (MANUAL SETUP) ──────────────────────────

/**
 * Creates a custom menu in the Google Sheet for manual setup.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚀 Basilur Setup')
    .addItem('Initialize Sheet & Folder', 'manualSetup')
    .addSeparator()
    .addItem('Setup Auto-Close Trigger', 'manualSetupAutoClose')
    .addItem('Run Auto-Close Checks Now', 'autoCloseResolvedTickets')
    .addToUi();
}

/**
 * UI wrapper for manual trigger setup.
 */
function manualSetupAutoClose() {
  const result = setupAutoCloseTrigger();
  const ui = SpreadsheetApp.getUi();
  if (ui) ui.alert("Trigger Setup", result, ui.ButtonSet.OK);
}

/**
 * Manually creates the sheet structure and Google Drive folder.
 * Run this from the Apps Script editor or the Spreadsheet menu.
 */
function manualSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let result = "Setup Report:\n\n";

  // 1. Setup Tickets Sheet
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setBackground('#0B1D3A')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
    result += "✅ Created Sheet: \"" + CONFIG.SHEET_NAME + "\"\n";
  } else {
    result += "ℹ️  Sheet already exists: \"" + CONFIG.SHEET_NAME + "\" (Skipped)\n";
  }

  // 2. Setup Users Sheet
  let usersSheet = ss.getSheetByName(CONFIG.USERS_SHEET_NAME);
  if (!usersSheet) {
    usersSheet = ss.insertSheet(CONFIG.USERS_SHEET_NAME);
    usersSheet.appendRow(USER_HEADERS);
    usersSheet.getRange(1, 1, 1, USER_HEADERS.length)
      .setBackground('#162B50')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    usersSheet.setFrozenRows(1);
    usersSheet.autoResizeColumns(1, USER_HEADERS.length);
    result += "✅ Created Sheet: \"" + CONFIG.USERS_SHEET_NAME + "\"\n";
  } else {
    // Ensure Password column exists
    const usersHeaders = usersSheet.getRange(1, 1, 1, Math.max(usersSheet.getLastColumn(), 1)).getValues()[0];
    if (usersHeaders.indexOf('Password') === -1) {
      usersSheet.getRange(1, USER_COL.PASSWORD).setValue('Password')
        .setBackground('#162B50')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
      result += "✅ Added missing \"Password\" column to \"" + CONFIG.USERS_SHEET_NAME + "\"\n";
    }
    result += "ℹ️  Sheet already exists: \"" + CONFIG.USERS_SHEET_NAME + "\"\n";
  }

  // 3. Setup Mail Logs Sheet
  let mailLogsSheet = ss.getSheetByName(CONFIG.MAIL_LOGS_SHEET_NAME);
  if (!mailLogsSheet) {
    mailLogsSheet = ss.insertSheet(CONFIG.MAIL_LOGS_SHEET_NAME);
    const ML_HEADERS = ['Date Time', 'Recipient(s)', 'Subject', 'Status Update', 'Message Sent Successfully?'];
    mailLogsSheet.appendRow(ML_HEADERS);
    mailLogsSheet.getRange(1, 1, 1, ML_HEADERS.length)
      .setBackground('#162B50')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    mailLogsSheet.setFrozenRows(1);
    mailLogsSheet.autoResizeColumns(1, ML_HEADERS.length);
    result += "✅ Created Sheet: \"" + CONFIG.MAIL_LOGS_SHEET_NAME + "\"\n";
  } else {
    result += "ℹ️  Sheet already exists: \"" + CONFIG.MAIL_LOGS_SHEET_NAME + "\" (Skipped)\n";
  }

  // 4. Setup Drive Folder
  const folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    const folder = folders.next();
    result += "ℹ️  Drive Folder already exists: \"" + CONFIG.DRIVE_FOLDER_NAME + "\" (ID: " + folder.getId() + ")\n";
  } else {
    const folder = DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    result += "✅ Created Drive Folder: \"" + CONFIG.DRIVE_FOLDER_NAME + "\"\n";
  }

  const ui = SpreadsheetApp.getUi();
  if (ui) {
    ui.alert("Manual Setup Complete", result, ui.ButtonSet.OK);
  } else {
    console.log(result);
  }
}

// ─── ENTRY POINT ────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action;

  try {
    let result;
    if (action === 'getTicket') {
      result = getTicket(e.parameter.ticketId);
    } else if (action === 'getAllTickets') {
      result = getAllTickets();
    } else if (action === 'lookupUser') {
      result = lookupUser(e.parameter.email);
    } else if (action === 'getTicketsByEmail') {
      result = getTicketsByEmail(e.parameter.email);
    } else if (action === 'getAllUsers') {
      result = getAllUsers();
    } else {
      result = { success: false, message: 'Unknown action' };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, message: err.message });
  }
}

function doPost(e) {
  try {
    let data;
    let action;

    // Handle both FormData and JSON body
    if (e.postData && e.postData.type === 'application/json') {
      data = JSON.parse(e.postData.contents);
      action = data.action;
    } else {
      data = e.parameter;
      action = data.action;
    }

    let result;
    if (action === 'createTicket') {
      result = createTicket(data, e.parameter);
    } else if (action === 'updateTicket') {
      result = updateTicket(data);
    } else if (action === 'registerUser') {
      result = registerUser(data);
    } else if (action === 'updateUserName') {
      result = updateUserName(data);
    } else if (action === 'updateUserDetails') {
      result = updateUserDetails(data);
    } else if (action === 'verifyLogin') {
      result = verifyLogin(data);
    } else {
      result = { success: false, message: 'Unknown action' };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, message: err.message });
  }
}

// ─── HELPERS ────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet "' + CONFIG.SHEET_NAME + '" not found. Please run the "🚀 Basilur Setup > Initialize Sheet & Folder" command from the Spreadsheet menu.');
  }
  return sheet;
}

function getUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.USERS_SHEET_NAME);
  if (!sheet) {
    // Auto-create the Users sheet on first use — no manual setup required
    sheet = ss.insertSheet(CONFIG.USERS_SHEET_NAME);
    sheet.appendRow(USER_HEADERS);
    sheet.getRange(1, 1, 1, USER_HEADERS.length)
      .setBackground('#162B50')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, USER_HEADERS.length);
  } else {
    // Ensure Password header is present even if auto-created previously
    const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    if (headers.indexOf('Password') === -1) {
      sheet.getRange(1, USER_COL.PASSWORD).setValue('Password')
        .setBackground('#162B50')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
    }
  }
  return sheet;
}

function getMailLogsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.MAIL_LOGS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.MAIL_LOGS_SHEET_NAME);
    const ML_HEADERS = ['Date Time', 'Recipient(s)', 'Subject', 'Status Update', 'Message Sent Successfully?'];
    sheet.appendRow(ML_HEADERS);
    sheet.getRange(1, 1, 1, ML_HEADERS.length)
      .setBackground('#162B50')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, ML_HEADERS.length);
  }
  return sheet;
}

function logEmail(recipients, subject, updateContext, isSuccess) {
  try {
    const sheet = getMailLogsSheet();
    sheet.appendRow([
      formatDate(new Date()),
      recipients,
      subject,
      updateContext,
      isSuccess ? 'Yes' : 'FAILED'
    ]);
  } catch (e) {
    console.error("Failed to log email", e);
  }
}

function generateTicketId() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  let lastId = 99999;
  
  for (let i = 1; i < data.length; i++) {
    const pId = data[i][COL.TICKET_ID - 1];
    if (pId && typeof pId === 'string' && pId.startsWith('TKT-')) {
      const num = parseInt(pId.replace('TKT-', ''), 10);
      if (!isNaN(num) && num > lastId) {
        lastId = num;
      }
    }
  }
  
  return 'TKT-' + (lastId + 1);
}

function formatDate(date) {
  return Utilities.formatDate(date, 'GMT+5:30', 'yyyy-MM-dd  HH:mm');
}

// ─── CREATE TICKET ───────────────────────────────────────────

function createTicket(data, params) {
  const sheet = getSheet();

  const ticketId = generateTicketId();
  const now = formatDate(new Date());

  // Handle file upload
  let screenshotLink = '';
  const fileData = params ? params.fileData : data.fileData;
  const fileName = params ? params.fileName : data.fileName;
  const fileType = params ? params.fileType : data.fileType;

  if (fileData && fileName) {
    screenshotLink = uploadFileToDrive(fileData, fileName, fileType);
  }

  // Append row to sheet
  sheet.appendRow([
    ticketId,
    now,
    data.name,
    data.email,
    data.department,
    data.category,
    data.priority,
    data.description,
    screenshotLink,
    'Open',
    data.assignedTechnician || '',  // Assigned Technician
    '',  // Comments
    '',  // Resolution
    now  // Last Updated
  ]);

  // Send notification emails
  try {
    sendConfirmationEmail(data.email, data.name, ticketId, data);
    sendITNotificationEmail(ticketId, data);
  } catch (emailErr) {
    // Don't fail ticket creation if email fails
    console.error('Email error:', emailErr);
  }

  return { success: true, ticketId: ticketId, message: 'Ticket created successfully' };
}

// ─── GET SINGLE TICKET ───────────────────────────────────────

function getTicket(ticketId) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][COL.TICKET_ID - 1] === ticketId) {
      return { success: true, ticket: rowToTicket(data[i]) };
    }
  }

  return { success: false, message: 'Ticket not found' };
}

// ─── GET ALL TICKETS ─────────────────────────────────────────

function getAllTickets() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const tickets = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      tickets.push(rowToTicket(data[i]));
    }
  }

  // Sort newest first
  tickets.sort((a, b) => new Date(b.dateCreated + ' GMT+5:30') - new Date(a.dateCreated + ' GMT+5:30'));
  return { success: true, tickets: tickets };
}

// ─── UPDATE TICKET ───────────────────────────────────────────

function updateTicket(data) {
  const sheet = getSheet();
  const allData = sheet.getDataRange().getValues();

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][COL.TICKET_ID - 1] === data.ticketId) {
      const row = i + 1;
      const now = formatDate(new Date());

      if (data.assignedTechnician !== undefined) {
        sheet.getRange(row, COL.ASSIGNED_TECHNICIAN).setValue(data.assignedTechnician);
      }
      if (data.status !== undefined) {
        sheet.getRange(row, COL.STATUS).setValue(data.status);
      }
      if (data.priority !== undefined) {
        sheet.getRange(row, COL.PRIORITY).setValue(data.priority);
      }
      if (data.comments !== undefined) {
        sheet.getRange(row, COL.COMMENTS).setValue(data.comments);
      }
      if (data.resolution !== undefined) {
        sheet.getRange(row, COL.RESOLUTION).setValue(data.resolution);
      }
      sheet.getRange(row, COL.LAST_UPDATED).setValue(now);

      // Emails
      try {
        const email = allData[i][COL.EMAIL - 1];
        const name = allData[i][COL.NAME - 1];
        const oldStatus = allData[i][COL.STATUS - 1];
        const oldTech = allData[i][COL.ASSIGNED_TECHNICIAN - 1];

        // 1. Send status update email if status changed
        if (data.status && data.status !== oldStatus) {
          sendStatusUpdateEmail(email, name, data.ticketId, data.status, data.comments);
        }

        // 2. Send assignment email if technician changed and is NOT empty
        const newTech = data.assignedTechnician;
        if (newTech !== undefined && newTech !== oldTech && String(newTech).trim() !== '') {
          const techEmails = getEmailsByNames(String(newTech));
          if (techEmails) {
            const ticketData = rowToTicket(allData[i]); // Original data for description etc.
            sendTechnicianAssignmentEmail(techEmails, data.ticketId, ticketData);
          }
        }
      } catch (e) {
        console.error("Error sending update emails:", e);
      }

      return { success: true, message: 'Ticket updated' };
    }
  }

  return { success: false, message: 'Ticket not found' };
}

// ─── FILE UPLOAD ─────────────────────────────────────────────

function uploadFileToDrive(base64Data, fileName, fileType) {
  const folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  
  if (!folders.hasNext()) {
    throw new Error('Drive folder "' + CONFIG.DRIVE_FOLDER_NAME + '" not found. Please run the "🚀 Basilur Setup > Initialize Sheet & Folder" command from the Spreadsheet menu.');
  }

  const folder = folders.next();
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    fileType,
    fileName
  );
  
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// ─── EMAIL NOTIFICATIONS ─────────────────────────────────────

function sendConfirmationEmail(toEmail, name, ticketId, data) {
  const subject = `[${ticketId}] IT Support Request Received`;
  const body = `
Dear ${name},

Your IT support request has been received and is being processed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TICKET ID: ${ticketId}
  STATUS:    Open
  PRIORITY:  ${data.priority}
  CATEGORY:  ${data.category}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Description:
${data.description}

You can track your ticket status at any time using the ticket ID above.

Our IT team will review your request and respond as soon as possible.

Best regards,
${CONFIG.COMPANY_NAME}
  `;

  try {
    GmailApp.sendEmail(toEmail, subject, body);
    logEmail(toEmail, subject, "Confirmation Support Request", true);
  } catch (e) {
    console.error("Failed to send confirmation email", e);
    logEmail(toEmail, subject, "Confirmation Support Request", false);
  }
}

/**
 * Send an email to technicians when they are assigned to a ticket.
 */
function sendTechnicianAssignmentEmail(toEmails, ticketId, ticketData) {
  if (!toEmails) return;
  const subject = `[ASSIGNED] You have been assigned to Ticket: ${ticketId}`;
  
  const plainBody = `
Hello,

You have been assigned to the following IT support ticket:

Ticket ID:   ${ticketId}
Priority:    ${ticketData.priority}
Category:    ${ticketData.category}
Submitted by: ${ticketData.name}

Description:
${ticketData.description}

Please log in to the IT Admin Dashboard to begin working on this ticket.
  `;

  const htmlBody = `
<div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-top: 4px solid #2563eb; border-radius: 4px; overflow: hidden;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="margin: 0; color: #2563eb;">Ticket Assigned to You</h2>
    <p style="margin: 5px 0 0 0; color: #666;">You have been assigned to handle a new support request.</p>
  </div>
  <div style="padding: 20px;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;"><strong>Ticket ID:</strong></td>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #2563eb;">${ticketId}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;"><strong>Priority:</strong></td>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;">${ticketData.priority}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;"><strong>Category:</strong></td>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;">${ticketData.category}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;"><strong>Submitted By:</strong></td>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;">${ticketData.name}</td>
      </tr>
    </table>
    
    <div style="background-color: #f4f6f9; padding: 15px; border-left: 4px solid #162B50; border-radius: 4px;">
      <p style="margin: 0 0 5px 0; font-weight: bold; font-size: 13px; color: #555;">Problem Description:</p>
      <p style="margin: 0; white-space: pre-wrap;">${ticketData.description}</p>
    </div>
  </div>
  <div style="background-color: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #888;">
    Please log in to the Admin Panel to update the status and resolution.<br><br>
    &copy; ${new Date().getFullYear()} ${CONFIG.COMPANY_NAME}. All rights reserved.
  </div>
</div>
  `;

  try {
    GmailApp.sendEmail(toEmails, subject, plainBody, { htmlBody: htmlBody });
    logEmail(toEmails, subject, "Technician Assignment", true);
  } catch (e) {
    console.error("Failed to send assignment email", e);
    logEmail(toEmails, subject, "Technician Assignment", false);
  }
}

/**
 * Look up emails for a comma-separated list of technician names.
 */
function getEmailsByNames(namesString) {
  if (!namesString) return "";
  const names = namesString.split(',').map(s => s.trim().toLowerCase());
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  const emails = [];

  for (let i = 1; i < data.length; i++) {
    const userName = String(data[i][USER_COL.NAME - 1]).toLowerCase().trim();
    const userEmail = String(data[i][USER_COL.EMAIL - 1]).trim();
    if (names.includes(userName)) {
      if (userEmail && !emails.includes(userEmail)) {
        emails.push(userEmail);
      }
    }
  }
  return emails.join(',');
}

function getITDepartmentEmails() {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  const emails = [];
  
  for (let i = 1; i < data.length; i++) {
    const dept = String(data[i][USER_COL.DEPARTMENT - 1]).toLowerCase().trim();
    const role = String(data[i][USER_COL.ROLE - 1]).toLowerCase().trim();
    const email = String(data[i][USER_COL.EMAIL - 1]).trim();
    
    // Send to anyone explicitly in 'it' department or role 'admin'
    if (dept === 'it' || role === 'admin') {
      if (email && !emails.includes(email)) {
        emails.push(email);
      }
    }
  }
  
  if (emails.length === 0) {
    emails.push(CONFIG.NOTIFY_EMAIL);
  }
  
  return emails.join(',');
}

function sendITNotificationEmail(ticketId, data) {
  const subject = `New Ticket [${data.priority} Priority]: ${ticketId}`;
  
  const plainBody = `
A new IT support ticket has been submitted.

Ticket ID:   ${ticketId}
Priority:    ${data.priority}
Category:    ${data.category}
Department:  ${data.department}

Submitted by: ${data.name} <${data.email}>

Description:
${data.description}

Please log in to the Admin Panel to assign and respond to this ticket.
  `;

  let priorityColor = '#0B1D3A'; // Normal
  if (data.priority === 'High' || data.priority === 'Urgent') priorityColor = '#d9534f';
  if (data.priority === 'Medium') priorityColor = '#f39c12';

  const htmlBody = `
<div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-top: 4px solid ${priorityColor}; border-radius: 4px; overflow: hidden;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="margin: 0; color: ${priorityColor};">New Support Ticket</h2>
    <p style="margin: 5px 0 0 0; color: #666;">A new ticket has been submitted requiring IT attention.</p>
  </div>
  <div style="padding: 20px;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;"><strong>Ticket ID:</strong></td>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee; font-weight: bold; color: ${priorityColor};">${ticketId}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;"><strong>Priority:</strong></td>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;">${data.priority}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;"><strong>Category:</strong></td>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;">${data.category}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;"><strong>Department:</strong></td>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;">${data.department}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;"><strong>Submitted By:</strong></td>
        <td style="padding: 5px 0; border-bottom: 1px solid #eee;">${data.name} (<a href="mailto:${data.email}" style="color: #0B1D3A;">${data.email}</a>)</td>
      </tr>
    </table>
    
    <div style="background-color: #f4f6f9; padding: 15px; border-left: 4px solid #162B50; border-radius: 4px;">
      <p style="margin: 0 0 5px 0; font-weight: bold; font-size: 13px; color: #555;">Description:</p>
      <p style="margin: 0; white-space: pre-wrap;">${data.description}</p>
    </div>
  </div>
  <div style="background-color: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #888;">
    Please log in to the Admin Panel to assign and respond to this ticket.<br><br>
    &copy; ${new Date().getFullYear()} ${CONFIG.COMPANY_NAME}. All rights reserved.
  </div>
</div>
  `;

  let emails = "Unknown";
  try {
    emails = getITDepartmentEmails();
    GmailApp.sendEmail(emails, subject, plainBody, { htmlBody: htmlBody });
    logEmail(emails, subject, "IT Notification", true);
  } catch (e) {
    console.error("Failed to send IT notification", e);
    logEmail(emails, subject, "IT Notification", false);
  }
}

function sendStatusUpdateEmail(toEmail, name, ticketId, newStatus, comments) {
  const subject = `[${ticketId}] Ticket Status Updated: ${newStatus}`;

  let statusColor = '#0B1D3A';
  if (newStatus === 'In Progress') statusColor = '#f39c12';
  else if (newStatus === 'Resolved') statusColor = '#27ae60';
  else if (newStatus === 'Closed') statusColor = '#7f8c8d';

  const plainBody = `
Dear ${name},

Your IT support ticket has been updated.

Status: ${newStatus}
Ticket ID: ${ticketId}

${comments ? `Update from IT Team:\n${comments}\n` : ''}
You can track your ticket at any time using your ticket ID.

Best regards,
${CONFIG.COMPANY_NAME}
  `;

  const htmlBody = `
<div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-top: 4px solid ${statusColor}; border-radius: 4px; overflow: hidden;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="margin: 0; color: ${statusColor};">Ticket Status Updated</h2>
    <p style="margin: 5px 0 0 0; color: #666;">There is an update on your IT support request.</p>
  </div>
  <div style="padding: 20px;">
    <p>Dear <strong>${name}</strong>,</p>
    <p>The status of your ticket <strong>${ticketId}</strong> has been updated to:</p>
    <h3 style="color: ${statusColor}; border-left: 4px solid ${statusColor}; padding-left: 10px;">${newStatus}</h3>
    ${comments ? `
    <div style="background-color: #f4f6f9; padding: 15px; margin-top: 15px; border-radius: 4px;">
      <p style="margin: 0 0 5px 0; font-weight: bold;">Update from IT Team:</p>
      <p style="margin: 0; white-space: pre-wrap;">${comments}</p>
    </div>` : ''}
    <div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
      <p style="font-size: 14px; color: #555;">You can track your ticket progress at any time securely through the IT Ticketing Portal.</p>
    </div>
  </div>
  <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 12px; color: #888;">
    &copy; ${new Date().getFullYear()} ${CONFIG.COMPANY_NAME}. All rights reserved.
  </div>
</div>
  `;

  try {
    GmailApp.sendEmail(toEmail, subject, plainBody, { htmlBody: htmlBody });
    logEmail(toEmail, subject, "Status Update", true);
  } catch (e) {
    console.error("Failed to send status update email", e);
    logEmail(toEmail, subject, "Status Update", false);
  }
}

// ─── ROW MAPPER ──────────────────────────────────────────────

function rowToTicket(row) {
  var dc = row[COL.DATE_CREATED - 1];
  if (dc instanceof Date) dc = formatDate(dc);
  var lu = row[COL.LAST_UPDATED - 1];
  if (lu instanceof Date) lu = formatDate(lu);

  return {
    ticketId: row[COL.TICKET_ID - 1],
    dateCreated: dc,
    name: row[COL.NAME - 1],
    email: row[COL.EMAIL - 1],
    department: row[COL.DEPARTMENT - 1],
    category: row[COL.CATEGORY - 1],
    priority: row[COL.PRIORITY - 1],
    description: row[COL.DESCRIPTION - 1],
    screenshotLink: row[COL.SCREENSHOT_LINK - 1],
    status: row[COL.STATUS - 1] || 'Open',
    assignedTechnician: row[COL.ASSIGNED_TECHNICIAN - 1],
    comments: row[COL.COMMENTS - 1],
    resolution: row[COL.RESOLUTION - 1],
    lastUpdated: lu
  };
}

// ─── USER MANAGEMENT ─────────────────────────────────────────

/**
 * Look up a user by email address.
 * Returns { success:true, user: {email,name,role,department} } if found,
 * or { success:true, user:null } if not found.
 */
function lookupUser(email) {
  if (!email) return { success: false, message: 'Email required' };

  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  const emailLower = email.toLowerCase().trim();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][USER_COL.EMAIL - 1]).toLowerCase().trim() === emailLower) {
      const role = String(data[i][USER_COL.ROLE - 1] || 'normal').toLowerCase();
      const hasPasswordSet = String(data[i][USER_COL.PASSWORD - 1] || '').trim() !== '';
      
      return {
        success: true,
        user: {
          email:      String(data[i][USER_COL.EMAIL - 1]),
          name:       String(data[i][USER_COL.NAME - 1]),
          role:       role,
          department: String(data[i][USER_COL.DEPARTMENT - 1] || ''),
          requiresPassword: (role === 'admin' || role === 'technician') // Enforce password for privileged roles
        }
      };
    }
  }

  // Not found — return null user so the frontend shows the name step
  return { success: true, user: null };
}

/**
 * Verify a user's password for login.
 */
function verifyLogin(data) {
  if (!data.email || !data.password) return { success: false, message: 'Email and password required' };

  const sheet = getUsersSheet();
  const rows = sheet.getDataRange().getValues();
  const emailLower = data.email.toLowerCase().trim();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][USER_COL.EMAIL - 1]).toLowerCase().trim() === emailLower) {
      const storedPassword = String(rows[i][USER_COL.PASSWORD - 1] || '').trim();
      const role = String(rows[i][USER_COL.ROLE - 1] || 'normal').toLowerCase();
      
      // If admin/technician and no password set, reject or allow first-time set?
      // For now, if role is admin and password is empty in sheet, we should probably allow 
      // the first login to set it or assume 'admin123' as default if we want to be nice.
      // But let's just do direct comparison.
      
      if (storedPassword === '') {
        // Special case: If it's an admin and they haven't set a password, check against default 'admin123'
        // This allows them to log in the first time.
        if (role === 'admin' && data.password === 'admin123') {
           return {
            success: true,
            user: {
              email:      String(rows[i][USER_COL.EMAIL - 1]),
              name:       String(rows[i][USER_COL.NAME - 1]),
              role:       role,
              department: String(rows[i][USER_COL.DEPARTMENT - 1] || '')
            }
          };
        }
        return { success: false, message: 'No password set for this account. Contact IT.' };
      }

      if (storedPassword === data.password) {
        return {
          success: true,
          user: {
            email:      String(rows[i][USER_COL.EMAIL - 1]),
            name:       String(rows[i][USER_COL.NAME - 1]),
            role:       role,
            department: String(rows[i][USER_COL.DEPARTMENT - 1] || '')
          }
        };
      } else {
        return { success: false, message: 'Invalid password' };
      }
    }
  }

  return { success: false, message: 'User not found' };
}

/**
 * Register a new user with email + name (role defaults to 'normal').
 */
function registerUser(data) {
  if (!data.email || !data.name) return { success: false, message: 'Email and name required' };

  const sheet = getUsersSheet();
  const emailLower = data.email.toLowerCase().trim();

  // Prevent duplicates
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][USER_COL.EMAIL - 1]).toLowerCase().trim() === emailLower) {
      return { success: false, message: 'User already exists' };
    }
  }

  sheet.appendRow([
    data.email.toLowerCase().trim(),
    data.name.trim(),
    'normal',
    ''
  ]);

  return { success: true, message: 'User registered' };
}

/**
 * Update the name of an existing user in the Users sheet.
 */
function updateUserName(data) {
  if (!data.email || !data.name) return { success: false, message: 'Email and name required' };

  const sheet = getUsersSheet();
  const rows = sheet.getDataRange().getValues();
  const emailLower = data.email.toLowerCase().trim();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][USER_COL.EMAIL - 1]).toLowerCase().trim() === emailLower) {
      sheet.getRange(i + 1, USER_COL.NAME).setValue(data.name.trim());
      return { success: true, message: 'Name updated' };
    }
  }

  return { success: false, message: 'User not found' };
}

/**
 * Get all tickets submitted by a given email address.
 */
function getTicketsByEmail(email) {
  if (!email) return { success: false, message: 'Email required' };

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const emailLower = email.toLowerCase().trim();
  const tickets = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && String(data[i][COL.EMAIL - 1]).toLowerCase().trim() === emailLower) {
      tickets.push(rowToTicket(data[i]));
    }
  }

  // Sort newest first
  tickets.sort((a, b) => new Date(b.dateCreated + ' GMT+5:30') - new Date(a.dateCreated + ' GMT+5:30'));
  return { success: true, tickets: tickets };
}

/**
 * Get all users for admin panel.
 */
function getAllUsers() {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  const users = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][USER_COL.EMAIL - 1]).trim() !== '') {
      users.push({
        email: String(data[i][USER_COL.EMAIL - 1]),
        name: String(data[i][USER_COL.NAME - 1]),
        role: String(data[i][USER_COL.ROLE - 1] || 'normal'),
        department: String(data[i][USER_COL.DEPARTMENT - 1] || '')
      });
    }
  }

  return { success: true, users: users };
}

/**
 * Update user details from admin panel.
 */
function updateUserDetails(data) {
  if (!data.email) return { success: false, message: 'Email required' };

  const sheet = getUsersSheet();
  const rows = sheet.getDataRange().getValues();
  const emailLower = data.email.toLowerCase().trim();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][USER_COL.EMAIL - 1]).toLowerCase().trim() === emailLower) {
      if (data.name !== undefined) sheet.getRange(i + 1, USER_COL.NAME).setValue(data.name.trim());
      if (data.role !== undefined) sheet.getRange(i + 1, USER_COL.ROLE).setValue(data.role.trim());
      if (data.department !== undefined) sheet.getRange(i + 1, USER_COL.DEPARTMENT).setValue(data.department.trim());
      if (data.password !== undefined && data.password.trim() !== '') {
        sheet.getRange(i + 1, USER_COL.PASSWORD).setValue(data.password.trim());
      }
      return { success: true, message: 'User updated' };
    }
  }

  return { success: false, message: 'User not found' };
}

/**
 * AUTOMATIC TASK: Close Resolved Tickets
 * 
 * Scans the 'Tickets' sheet for any ticket with 'Resolved' status.
 * If the 'Last Updated' date is more than 7 days ago, it moves it to 'Closed'.
 * This function should be scheduled via a daily Time-driven trigger.
 */
function autoCloseResolvedTickets() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
  let closedCount = 0;

  for (let i = 1; i < data.length; i++) {
    const status = data[i][COL.STATUS - 1];
    if (status === 'Resolved') {
      const lastUpdatedVal = data[i][COL.LAST_UPDATED - 1];
      const lastUpdated = new Date(lastUpdatedVal + ' GMT+5:30');
      
      if (!isNaN(lastUpdated.getTime())) {
        const diff = now.getTime() - lastUpdated.getTime();
        
        if (diff >= sevenDaysInMs) {
          const row = i + 1;
          const ticketId = data[i][COL.TICKET_ID - 1];
          const email = data[i][COL.EMAIL - 1];
          const name = data[i][COL.NAME - 1];
          const formattedNow = formatDate(now);
          const currentComments = data[i][COL.COMMENTS - 1] || '';

          // 1. Update the Sheet
          sheet.getRange(row, COL.STATUS).setValue('Closed');
          sheet.getRange(row, COL.LAST_UPDATED).setValue(formattedNow);
          
          const autoCloseNote = `\n[System: Auto-Closed after 7 days in Resolved status]`;
          sheet.getRange(row, COL.COMMENTS).setValue(currentComments + autoCloseNote);
          
          // 2. Notify the User (Matches existing system update behavior)
          try {
            sendStatusUpdateEmail(
              email, 
              name, 
              ticketId, 
              'Closed', 
              'Your ticket has been automatically closed as it remained in Resolved status for more than 7 days.'
            );
          } catch (e) {
            console.error(`Failed to send auto-close email for ${ticketId}:`, e);
          }
          
          closedCount++;
        }
      }
    }
  }
  
  if (closedCount > 0) {
    console.log(`Auto-close completed: ${closedCount} tickets moved to Closed.`);
  }
  
  return closedCount;
}

/**
 * Creates/Ensures the time-driven trigger for auto-closing resolved tickets exists.
 */
function setupAutoCloseTrigger() {
  const functionName = 'autoCloseResolvedTickets';
  const triggers = ScriptApp.getProjectTriggers();
  let exists = false;
  
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      exists = true;
      break;
    }
  }
  
  if (!exists) {
    // Scheduled to run every day between 1 AM and 2 AM
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .everyDays(1)
      .atHour(1)
      .create();
    return "✅ Success: Auto-close trigger created (Daily @ 1 AM).";
  } else {
    return "ℹ️ Info: Auto-close trigger already exists.";
  }
}

# IT Ticketing Platform — Setup Guide

## Overview
This guide walks you through deploying the IT Ticketing Platform step by step. The whole setup takes about **20–30 minutes**.

---

## Prerequisites
- A Google account (for Sheets, Drive, Apps Script)
- A GitHub account (for hosting)
- The 4 files from this project:
  - `index.html` — Employee ticket submission form
  - `track.html` — Ticket tracking page
  - `admin.html` — IT Admin dashboard
  - `Code.gs` — Google Apps Script backend

---

## Step 1: Set Up Backend (No IDs required!)

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it something like **IT Ticketing System**.
3. From the top menu, click **Extensions → Apps Script**.
4. Name the Apps Script project (e.g., **IT Ticketing Backend**).
5. Delete the default `myFunction()` code and paste the entire contents of `Code.gs` into the editor.
6. Update the `CONFIG` section at the top of the script:
   ```javascript
   const CONFIG = {
     DRIVE_FOLDER_NAME: 'IT Ticket Screenshots', // Auto-created to save screenshots
     NOTIFY_EMAIL: 'it-team@basilurtea.com',
     ADMIN_EMAIL: 'admin@basilurtea.com',
     COMPANY_NAME: 'Basilur Tea Export',
     SHEET_NAME: 'Tickets'
   };
   ```
7. Click **Save** (Ctrl+S or the floppy disk icon).

> 💡 **Why is this so easy now?** Because you opened the script directly from the Sheet, it is perfectly "bound". You don't need to configure a Sheet ID! Also, the script will automatically create the Google Drive folder for you.

---

## Step 2: Deploy as Web App

1. In the Apps Script editor, click **Deploy → New deployment**
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**
3. Fill in the settings:
   - **Description**: IT Ticketing API v1
   - **Execute as**: Me (your Google account)
   - **Who has access**: Anyone
4. Click **Deploy**
5. You'll be asked to authorize the app — click **Authorize access** and follow the prompts
6. After deployment, you'll get a **Web app URL** that looks like:
   ```
   https://script.google.com/macros/s/XXXXXXXXXX/exec
   ```
7. Copy this URL — you'll need it in Step 3

> ⚠️ Each time you make changes to Code.gs, you need to deploy a **new version** (Deploy → Manage deployments → Edit → New version).

---

## Step 3: Configure the Frontend Files

Open each HTML file and replace `YOUR_APPS_SCRIPT_URL_HERE` with your Web App URL from Step 2.

**In `index.html`** (line ~180):
```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
```

**In `track.html`** (line ~200):
```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
```

**In `admin.html`** (line ~300):
```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
```

You can also update the **Admin Password** in `admin.html`:
```javascript
const ADMIN_PASSWORD = 'your-secure-password';  // Change from 'admin123'
```

---

## Step 4: Deploy to GitHub Pages

1. Create a new **GitHub repository** (e.g., `it-helpdesk`)
2. Upload the 3 HTML files (`index.html`, `track.html`, `admin.html`) to the repository root
3. Go to **Settings → Pages**
4. Under **Source**, select **Deploy from a branch**
5. Select the **main** branch and **/ (root)** folder
6. Click **Save**
7. GitHub will provide a URL like:
   ```
   https://your-username.github.io/it-helpdesk/
   ```

Your portal is now live!

---

## Step 5: Test the System

### Test ticket submission:
1. Open `index.html` (your GitHub Pages URL)
2. Fill in the form with test data
3. Submit the ticket
4. Check the Google Sheet — a new row should appear
5. Check your IT notification email

### Test ticket tracking:
1. Open `track.html`
2. Enter the Ticket ID shown after submission
3. You should see all ticket details

### Test the admin panel:
1. Open `admin.html`
2. Enter the admin password
3. You should see all tickets in the table
4. Click **View →** on a ticket to open and update it

---

## File Structure

```
your-repo/
├── index.html        ← Employee ticket submission form
├── track.html        ← Ticket tracking page
└── admin.html        ← IT Admin dashboard

Google Apps Script:
└── Code.gs           ← Backend API (deployed separately)

Google Sheets:
└── IT Ticketing System  ← Database (auto-configured)

Google Drive:
└── IT Ticket Screenshots/  ← File storage folder
```

---

## Google Sheet Columns (Auto-Created)

| Column | Field |
|--------|-------|
| A | Ticket ID |
| B | Date Created |
| C | Employee Name |
| D | Email Address |
| E | Department |
| F | Issue Category |
| G | Priority Level |
| H | Description |
| I | Screenshot Link |
| J | Ticket Status |
| K | Assigned Technician |
| L | Comments |
| M | Resolution |
| N | Last Updated |

---

## Customization

### Add new departments:
Edit the `<select name="department">` dropdown in `index.html`.

### Add new issue categories:
Edit both the `<select name="category">` in `index.html` and the `filterCategory` select in `admin.html`.

### Change the company name in emails:
Update `COMPANY_NAME` in the `CONFIG` block of `Code.gs`.

### Add more technicians:
The technician assignment in `admin.html` is a free-text field. You can convert it to a dropdown by replacing:
```html
<input type="text" id="mTech" placeholder="Enter technician name" />
```
with:
```html
<select id="mTech">
  <option value="">Unassigned</option>
  <option>Mark Williams</option>
  <option>Lisa Park</option>
  <option>John Reeves</option>
</select>
```

---

## Troubleshooting

**Tickets not saving to the Sheet:**
- Make sure the Apps Script is deployed with **Who has access: Anyone**
- Re-deploy after any code changes

**Emails not sending:**
- Check the Apps Script editor for errors under **Executions**
- Make sure Gmail access is authorized
- The `NOTIFY_EMAIL` must be accessible from your Google account

**"CORS" errors in browser console:**
- Apps Script Web Apps handle CORS automatically. If you see CORS errors, check that the deployment type is "Web app" (not API executable)

**File uploads not working:**
- Make sure the Apps Script has Drive access permissions (re-authorize if needed)

**Admin panel not loading tickets:**
- Double-check the `APPS_SCRIPT_URL` in `admin.html`
- Try opening the URL directly in your browser — you should get a JSON response

---

## Security Notes

- The Google Sheet is private by default — only the script can write to it
- The Drive folder should be kept private (screenshots are shared via link only)
- Change the `ADMIN_PASSWORD` from `admin123` before going live
- For production use, consider adding proper authentication (OAuth or company SSO)
- The Apps Script executes as your Google account — keep your account secure

---

## Support

If you encounter issues during setup, check:
- [Google Apps Script documentation](https://developers.google.com/apps-script)
- [GitHub Pages documentation](https://docs.github.com/en/pages)
- The browser console (F12) for JavaScript errors


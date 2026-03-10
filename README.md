# IT Ticketing Platform - Basilur Tea Export

Welcome to the IT Ticketing Platform management solution for Basilur Tea Export! 

This system utilizes a high-performance static frontend hosted via GitHub Pages and a dynamic Google Apps Script (GAS) backend, using Google Sheets as its primary database and Google Drive for secure attachment storage.

---

## 🚀 Key Features

*   **Modular Dashboard**: A unified admin interface featuring specialized tabs for Ticket Management, User Administration, and Analytics.
*   **Intelligent Analytics**: Real-time workload distribution charts and statistical summaries to track team performance.
*   **Universal User Management**: Complete control over system access, allowing admins to manage roles (Admin, Technician, Normal) and departments.
*   **Seamless Email Workflow**: Automated, professionally styled email notifications for every stage of the ticket lifecycle.
*   **Asset Management**: Integrated Google Drive storage for screenshots and technical documentation submitted with tickets.
*   **PDF Reporting**: One-click export functionality for generating professional IT support reports.
*   **Persistent Login**: Cookie-based "Remember Me" functionality that keeps users signed in for 30 days.

---

## ⚙️ System Workflow & Email Notifications

The system ensures all stakeholders stay informed via automated, non-spammy email communications:

*   **🎫 Ticket Confirmation**
    *   **To:** The requester.
    *   **When:** Immediately after submission.
    *   **What:** Contains the unique Tracking ID (e.g., `TKT-100001`) and a summary of the request.
    
*   **⚙️ IT Alert**
    *   **To:** IT Staff and Admins.
    *   **When:** On every new ticket submission.
    *   **What:** Detailed breakdown with color-coded priority levels (Urgent/High = Red, Medium = Orange).

*   **✅ Status & technician Updates**
    *   **To:** The requester.
    *   **When:** When status is changed or a technician is assigned.
    *   **What:** Information on who is handling the issue and its current state.

---

## 🤖 Automated Ticket Lifecycle (New)

To maintain a clean and efficient workspace, the system now includes **Automatic Ticket Closure**:

*   **Logic:** Any ticket staying in the `Resolved` status for more than **7 days** is automatically transitioned to `Closed`.
*   **Audit Trail:** The system appends a note to the ticket comments: `[System: Auto-Closed after 7 days in Resolved status]`.
*   **Execution:** A daily background trigger runs at 1 AM to perform these maintenance checks.

---

## 📊 Logging & Caching

*   **Mail Logs**: A dedicated tab in Google Sheets tracks every outbound email, recording the timestamp, recipient, and delivery status.
*   **Performance Caching (Browser Local Storage)**: 
    *   **Admin Panel**: The Admin Panel uses `localStorage` for high-performance caching:
        *   `tickets_cache_data`: Stores all tickets for the dashboard.
        *   `users_cache_data`: Stores user lists and roles.
    *   **Employee Portal**: Personalized caching via `my_tickets_cache_[email]` ensures employees see their personal ticket list instantly.
    *   **Cache Management**:
        *   **TTL (Time-To-Live)**: All data is cached for **15 minutes** before auto-refreshing.
        *   **Smart Invalidation**: The cache is automatically cleared upon ticket submission, status updates, or internal task creation to ensure data consistency.
        *   **Security**: All ticketing cache is wiped immediately upon logout for security.

---

## 🛠️ Getting Started & Maintenance

### **Initial Setup**
1.  Open the Google Sheet and provide the necessary script permissions.
2.  Navigate to the custom menu: **🚀 Basilur Setup** ⮕ **Initialize Sheet & Folder**.
3.  Set up the automation by clicking **🚀 Basilur Setup** ⮕ **Setup Auto-Close Trigger**.

### **Deploying Updates**
To push logical changes from `Code.gs`:
1.  Open the file in the **Google Apps Script** editor.
2.  Select **Deploy > New Deployment**.
3.  Ensure the `APPS_SCRIPT_URL` in `js/config.js` matches the new deployment URL.

---

&copy; 2026 **Basilur Tea Export** | IT Department Infrastructure

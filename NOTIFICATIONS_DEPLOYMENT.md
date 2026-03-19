# Internly Push Notifications - Deployment Guide

## Overview
Role-based department/company-scoped push notifications system implemented:
- **Super Admin**: Send notifications to all users or specific departments
- **Admin**: Send notifications only to interns in their assigned department/company
- **Mobile**: Receive notifications with department filtering
- **Backend**: Supabase Edge Function sends via Expo Push API

---

## Step 1: Deploy Database Schema

### 1.1 Run Migration in Supabase SQL Editor

Go to: Supabase Console → SQL Editor → New Query

Copy and paste contents of: `supabase-notifications-migration.sql`

Then execute (should complete in ~5 seconds).

**Tables Created:**
- `device_tokens` - stores mobile device push tokens
- `notifications` - sent notifications with targeting scope
- `notification_logs` - delivery tracking per recipient
- RLS policies - role-based security

**What this does:**
- ✅ Admin/super-admin can send notifications to targeted groups
- ✅ Device tokens unique per device (not re-registered on re-login if same device)
- ✅ Audit trail for all notifications sent

---

## Step 2: Configure Expo (Mobile Setup)

### 2.1 Ensure Expo Account & Project ID

```bash
cd Internly
eas login
```

Verify your Expo project ID appears in `app.json` under:
```json
"extra": {
  "eas": {
    "projectId": "your-project-id-here"
  }
}
```

If missing, run:
```bash
eas project:create
```

### 2.2 Install Dependencies & Build

```bash
npm install
```

To test on physical device:
```bash
npx eas build --platform android --profile development
```

Or for simulator/emulator, you can test with:
```bash
npm start
# Press 'a' for Android or 'i' for iOS
# Scanner will accept Expo Go app downloads, run in dev mode
```

---

## Step 3: Deploy Supabase Edge Function

### 3.1 Setup CLI (if not already done)

```bash
npm install -g supabase
supabase login
```

### 3.2 Deploy Function

```bash
supabase functions deploy send-notification --project-id your-supabase-project-id
```

Verify deployment:
```bash
supabase functions list --project-id your-supabase-project-id
```

Should show: `send-notification` with status `active`.

### 3.3 Test Function

In Supabase Console → Functions → send-notification → Logs

Then go to web admin and send a test notification. Check the logs for output.

---

## Step 4: Web Admin Setup (Already Complete)

✅ NotificationsPage added
✅ Sidebar link added
✅ Role-based targeting logic implemented
✅ Edge Function integration in place

No additional setup needed—just restart the web dev server:
```bash
cd "Internly web"
npm start
```

---

## Step 5: Test End-to-End

### 5.1 Create Test Users

**Mobile (register):**
- Email: `intern1@test.com` / password: `password123`
- Company: TechCorp (or any company in DB)
- Wait for device token registration

**Web (via CompaniesPage → Create Admin):**
- Create admin: `admin@techcorp.com` / password: `password123`
- Assign to: TechCorp company
- Wait for web to load

### 5.2 Send Test Notification from Web

1. Login: `admin@techcorp.com`
2. Go to: Notifications page
3. Scope: "My Company" (TechCorp)
4. Title: "Test Alert"
5. Message: "This is a test notification"
6. Target: "Interns Only"
7. Click Send

### 5.3 Verify on Mobile

- Notification should appear in status bar within 2-3 seconds
- Tap notification: opens app with notification data
- Check notification_logs table in Supabase to verify delivery status

---

## Troubleshooting

### **Mobile not receiving notifications?**

1. Check Firestore `device_tokens`:
   - Verify token exists and `is_active = true`
   - If not, user may not have logged in yet

2. Check Firestore `notification_logs`:
   - Look for your test notification
   - If status = "failed", check `error_message` field

3. Validate Expo project ID:
   - Must match in `app.json` and `Constants.expoConfig?.extra?.eas?.projectId`
   - If mismatch, tokens won't work

4. Check Edge Function logs:
   - Supabase Console → Functions → send-notification → Logs
   - Look for network errors or payload issues

### **Admin can't send notifications?**

1. Verify admin role in `users` table:
   - Should be `role = 'admin'` not `'user'`

2. Check RLS policy:
   - Admin can insert notifications if `sender_id = auth.uid()` and role = 'admin'

3. Verify company assignment:
   - If targeting "My Company", ensure admin has `company` field set

### **Super Admin not seeing all companies?**

1. Confirm role:
   - Must be `role = 'super_admin'` in `users` table

2. Check `companies` table:
   - All companies must exist for dropdown to populate

---

## Security Checklist

✅ **Backend Validation:**
   - Edge Function validates `sender_id` and `target_company`
   - Admin can only send to own company (enforced server-side)
   - Super admin can send to any/all

✅ **RLS Policies:**
   - Users can only see own device tokens
   - Admins can only read tokens for their company (debugging)
   - Notification logs viewable by recipient or sender

✅ **No Secrets Exposed:**
   - Expo Push tokens stored securely in Supabase
   - Service Role key never sent to client

---

## Feature Summary

| Feature | Super Admin | Admin | Intern | Status |
|---------|-------------|-------|--------|--------|
| Send to All Users | ✅ | ✗ | ✗ | Ready |
| Send to Own Dept | ✅ | ✅ | ✗ | Ready |
| Send to Specific Dept | ✅ | ✗ | ✗ | Ready |
| Receive Notifications | ✅ | ✅ | ✅ | Ready |
| View Sent History | ✅ | ✅ | ✗ | Ready |
| Track Delivery Status | ✅ | ✅ | ✗ | Ready |

---

## Next Steps (Optional Enhancements)

- [ ] Add Notifications history screen to mobile app
- [ ] Add notification preferences/unsubscribe option
- [ ] Schedule notifications for later delivery
- [ ] Add rich media (images) to notifications
- [ ] Create notification templates
- [ ] Add SMS fallback for critical alerts

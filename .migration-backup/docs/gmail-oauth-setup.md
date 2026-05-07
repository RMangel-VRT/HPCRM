# Gmail OAuth Setup Guide

This document explains the Google Cloud Console steps required before Gmail OAuth connectivity can be used in High Plains CRM.

---

## Prerequisites

- Access to a Google account that owns or has Editor access to a Google Cloud project.
- The deployed URL of High Plains CRM (needed for the redirect URI).

---

## Step 1: Create or Select a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. In the top navigation bar, click the project dropdown.
3. Select an existing project, or click **New Project** and give it a name (e.g., "High Plains CRM").

---

## Step 2: Enable the Gmail API

1. In the left sidebar, navigate to **APIs & Services → Library**.
2. Search for **Gmail API**.
3. Click **Gmail API**, then click **Enable**.

---

## Step 3: Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Select **External** as the user type (unless all users are in a Google Workspace organization). Click **Create**.
3. Fill in the required fields:
   - **App name**: High Plains CRM
   - **User support email**: your admin email
   - **Developer contact email**: your admin email
4. Click **Save and Continue**.
5. On the **Scopes** step, click **Add or Remove Scopes** and add these three scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/userinfo.email`
6. Click **Update**, then **Save and Continue**.
7. On the **Test users** step, add the Gmail addresses of any staff members who will connect their accounts during testing.
8. Click **Save and Continue**, then **Back to Dashboard**.

> **Note:** While the app is in "Testing" mode, only explicitly added test users can connect. To allow any Google account, you must go through Google's app verification process (typically required for production).

---

## Step 4: Create an OAuth 2.0 Client ID

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials → OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Give it a name (e.g., "High Plains CRM Web Client").
5. Under **Authorized redirect URIs**, click **Add URI** and enter:

   ```
   https://<your-deployed-domain>/api/mailbox-accounts/oauth/callback
   ```

   Replace `<your-deployed-domain>` with the actual domain of your deployed app (e.g., `myapp.replit.app`).

6. Click **Create**.
7. A dialog will show your **Client ID** and **Client Secret**. Copy both values.

---

## Step 5: Add Secrets to Replit

Add the following three environment variables as Replit Secrets:

| Secret Name                  | Value                                                                              |
|------------------------------|------------------------------------------------------------------------------------|
| `GOOGLE_OAUTH_CLIENT_ID`     | The Client ID from the previous step                                               |
| `GOOGLE_OAUTH_CLIENT_SECRET` | The Client Secret from the previous step                                           |
| `GOOGLE_OAUTH_REDIRECT_URI`  | `https://<your-deployed-domain>/api/mailbox-accounts/oauth/callback`               |

---

## Step 6: Test the Connection

1. Navigate to **Settings → Mailbox Accounts** in High Plains CRM.
2. Find a mailbox account row and click **Connect Gmail**.
3. You will be redirected to Google's OAuth consent screen.
4. Sign in with the Gmail account you want to use, grant the requested permissions.
5. You will be redirected back to the Mailbox Accounts settings page with a success message.

---

## Known Limitations

- **OAuth tokens are stored unencrypted** in the `oauth_token_json` column of the `mailbox_accounts` database table. Encryption at rest is a planned future enhancement (Slice 4). Ensure your database has appropriate access controls.
- Only one Gmail account per mailbox account row is supported (no multi-account OAuth).
- Domain-wide delegation is not configured — each staff member connects their own account.
- Inbound email sync (receive emails automatically) is not yet implemented — that is Slice 3.

---

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| "Google OAuth is not configured" error | Missing Replit Secrets | Add the three secrets as described in Step 5 |
| "Invalid OAuth state" error page | Browser session expired or CSRF | Click the link to return to settings and try again |
| "Email mismatch" error page | Signed in with a different Google account | Sign in with the Gmail address registered on that mailbox row |
| Red "Connection error" badge | Refresh token revoked or expired | Click "Reconnect" to go through OAuth again |
| Gmail send fails with quota error | Daily Gmail send quota reached | Wait 24 hours or use a different mailbox |

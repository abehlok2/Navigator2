# Phase 1 Critical Path Test Script

This script verifies the end-to-end flow required for Phase 1. Run the steps in order using two browser windows (one facilitator, one explorer).

## Prerequisites

- Signaling server reachable at the URL configured in `VITE_SIGNALING_SERVER_URL`.
- API server reachable at the URL configured in `VITE_API_BASE_URL`.
- Two user accounts (or the ability to self-register via the login form).
- Browsers cleared of previous Navigator storage/session data.

## Test Steps

### 1. Facilitator Login
1. Navigate to the login page.
2. Sign in with a facilitator account. If the account does not exist, enter the credentials and allow the auto-registration fallback to create it.
3. Confirm you land on the Home page and the header shows the facilitator role badge.

### 2. Explorer Login
1. Open a second browser window or profile.
2. Sign in with an explorer account (auto-registration works here as well).
3. Confirm you land on the Home page with the explorer role badge.

### 3. Facilitator Creates a Room
1. In the facilitator window, enter a memorable password in the **Password** field.
2. Click **Create Room**.
3. Verify a room ID is displayed and the join form is populated with the room ID and password.
4. Share the room ID and password with the explorer tester.

### 4. Facilitator Joins the Room
1. Still in the facilitator window, submit the Join Existing Room form (room ID and password should already be filled in).
2. Confirm you are navigated to the Session page.
3. Confirm the connection status badge shows **Connected** and the participant list contains your facilitator account.

### 5. Explorer Joins the Room
1. In the explorer window, enter the shared room ID and password.
2. Submit the join form.
3. Confirm navigation to the Session page.
4. Verify the connection status badge reads **Connected**.
5. Confirm the participant list now shows both the facilitator and explorer with correct roles and online indicators.

### 6. Connection Status Recovery
1. Briefly disable and re-enable network access for one client (e.g., toggle Wi-Fi off/on).
2. Observe that the affected Session page shows **Connecting…** and automatically returns to **Connected** after the network is restored.

### 7. Leave Room Flow
1. On the explorer window, click **Leave Room**.
2. Confirm you are redirected back to the Home page and the participant list on the facilitator window removes the explorer entry.
3. Repeat **Leave Room** from the facilitator window and verify redirection to Home.

### 8. Authentication Cleanup
1. Click **Logout** on both windows.
2. Confirm each window returns to the login screen and protected routes are no longer accessible without re-authentication.

## Expected Results

- All navigations succeed without console errors.
- Participant list updates immediately when users join/leave.
- Connection status badge reflects Connected/Connecting/Disconnected transitions accurately.
- No TypeScript build errors (`npm run build` completes successfully).

Document any deviations, browser console errors, or networking failures for follow-up investigation.

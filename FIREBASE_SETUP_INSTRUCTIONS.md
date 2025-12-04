# Firebase Setup Instructions - Quick Guide

## Error: "This operation is restricted to administrators only"

This error means **Anonymous Authentication is not enabled** in your Firebase project.

## Quick Fix (5 minutes)

### Step 1: Open Firebase Console
1. Go to https://console.firebase.google.com/
2. Select your project: **walkietalkie-78199**

### Step 2: Enable Anonymous Authentication
1. Click on **Authentication** in the left sidebar
2. Click on the **Sign-in method** tab
3. Find **Anonymous** in the list of providers
4. Click on **Anonymous**
5. Toggle **Enable** to ON
6. Click **Save**

### Step 3: Enable Realtime Database
1. Click on **Realtime Database** in the left sidebar
2. If you see "Get started", click it
3. Choose a location (e.g., `us-central1`)
4. Choose **Start in test mode** (for now)
5. Click **Enable**

### Step 4: Enable Storage
1. Click on **Storage** in the left sidebar
2. If you see "Get started", click it
3. Click **Next** through the setup
4. Choose **Start in test mode** (for now)
5. Click **Done**

### Step 5: Set Security Rules

#### Realtime Database Rules:
1. Go to **Realtime Database** → **Rules** tab
2. Replace the rules with:
```json
{
  "rules": {
    "channels": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "users": {
      ".read": "auth != null",
      "$uid": {
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```
3. Click **Publish**

#### Storage Rules:
1. Go to **Storage** → **Rules** tab
2. Replace the rules with:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /channels/{channelId}/audio/{audioId} {
      allow read, write: if request.auth != null;
    }
  }
}
```
3. Click **Publish**

## After Setup

1. **Refresh your browser** at http://localhost:3000
2. Try logging in again
3. It should work now!

## Troubleshooting

- **Still getting the error?**
  - Make sure you clicked "Save" after enabling Anonymous auth
  - Wait 30 seconds and try again (Firebase can take a moment to propagate)
  - Clear browser cache and refresh

- **Database connection errors?**
  - Make sure Realtime Database is enabled (not Firestore)
  - Check that you're using the correct database URL in `firebase-config.js`

- **Storage errors?**
  - Make sure Storage is enabled
  - Check Storage rules allow authenticated users

## Need Help?

Check the browser console (F12) for detailed error messages.


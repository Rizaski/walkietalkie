# Audio Troubleshooting Guide

## Quick Checks

### 1. Check Browser Console
Open browser console (F12) and look for:
- "PTT started - recording audio" when you press the button
- "Audio chunk available: X bytes" when recording
- "Uploading audio chunk to Firebase" messages
- "Received audio chunk from: [username]" when receiving
- "Playing audio from: [username]" when playback starts

### 2. Test Audio Locally
In browser console, type:
```javascript
app.testAudio()
```
This will record 2 seconds of audio and play it back. If this doesn't work, the issue is with microphone/speaker access.

### 3. Check Microphone Permissions
- Make sure browser has microphone permission
- Check browser address bar for microphone icon
- Try refreshing and allowing permissions again

### 4. Check Firebase Rules
Make sure Realtime Database rules allow write access:
```json
{
  "rules": {
    "channels": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

## Common Issues

### No Sound When Pressing PTT

**Symptoms:**
- Button shows "pressed" state
- Speaking indicator activates
- But no audio is heard

**Possible Causes:**
1. **Microphone not working**
   - Check: `app.testAudio()` in console
   - Fix: Grant microphone permissions

2. **MediaRecorder not supported**
   - Check: Console for "MediaRecorder error"
   - Fix: Use Chrome/Edge (best support)

3. **Audio not uploading to Firebase**
   - Check: Console for "Error uploading audio chunk"
   - Fix: Check Firebase rules and connection

4. **Audio not being received**
   - Check: Console for "Received audio chunk" messages
   - Fix: Verify both users are in same channel

5. **Audio playback failing**
   - Check: Console for "Playback error"
   - Fix: Check browser audio settings, unmute tab

### Audio Chunks Not Appearing in Firebase

**Check:**
1. Open Firebase Console → Realtime Database
2. Navigate to `channels/{channelName}/audio`
3. Should see new entries when PTT is pressed

**If not appearing:**
- Check Firebase rules allow write
- Check network tab for failed requests
- Verify user is authenticated

### Audio Playing But No Sound

**Possible Causes:**
1. **Browser tab muted**
   - Check: Tab icon for mute indicator
   - Fix: Unmute tab

2. **System volume muted**
   - Check: System volume controls
   - Fix: Unmute system

3. **Wrong audio output device**
   - Check: System audio settings
   - Fix: Select correct output device

4. **Audio element volume is 0**
   - Check: Console logs
   - Fix: Code sets volume to 1.0, but check browser settings

## Debug Steps

1. **Open Browser Console (F12)**
2. **Join a channel**
3. **Press PTT button**
4. **Check console for:**
   - "PTT started - recording audio"
   - "Audio chunk available: X bytes"
   - "Uploading audio chunk to Firebase"
   - "Audio chunk uploaded successfully"

5. **In another tab/window:**
   - Join same channel
   - Check console for:
   - "Received audio chunk from: [username]"
   - "Enqueueing audio for playback"
   - "Playing audio from: [username]"

6. **If any step fails, check the error message**

## Browser Compatibility

**Best Support:**
- Chrome/Edge (Chromium) - Full support
- Firefox - Good support
- Safari - Limited support (may need different codec)

**Not Supported:**
- Internet Explorer
- Very old browsers

## Firebase Database Size Limits

- Each node: 256KB max
- Audio chunks are automatically cleaned up (keeps last 10)
- If database is full, new chunks won't be saved

## Still Not Working?

1. Check all console errors
2. Verify Firebase is connected (check connection status)
3. Test with `app.testAudio()` to verify local audio works
4. Try different browser
5. Check network tab for failed Firebase requests
6. Verify both users are authenticated and in same channel


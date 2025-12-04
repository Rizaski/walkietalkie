# Walkie-Talkie Mobile Application

A modern, fully responsive walkie-talkie web application built with HTML, CSS, and JavaScript. Features real-time audio communication, channel management, and a beautiful mobile-first UI.

## Features

### Core Features
- **Real-time Audio Communication** - Push-to-talk (PTT) functionality with low latency
- **Channel System** - Create and join multiple channels/rooms
- **User Roster** - See who's online and currently speaking
- **Role-based Access** - User and Admin roles with different permissions
- **Mobile Optimized** - Fully responsive design optimized for mobile devices
- **Modern UI** - Beautiful interface with Poppins font and SVG icons

### Technical Features
- **WebSocket Communication** - Real-time bidirectional communication via Socket.io
- **MediaRecorder API** - Browser-based audio recording and playback
- **Client-side Routing** - Single-page application with smooth page transitions
- **Offline Detection** - Network status indicators
- **Latency Monitoring** - Real-time latency measurement
- **Activity Logging** - Track all channel activity

## Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```

3. **Open in Browser**
   - Navigate to `http://localhost:3000`
   - Open multiple tabs or devices to test communication

## Usage

### Getting Started

1. **Login**
   - Enter your username
   - Select your role (User or Admin)
   - Click "Connect"

2. **Join a Channel**
   - Browse available channels
   - Click on a channel to join
   - Or create a new channel using the FAB button

3. **Push-to-Talk**
   - Hold the large PTT button to speak
   - Or press and hold the Spacebar
   - Release to stop speaking
   - Visual feedback shows when you're speaking

### Features Guide

- **Channels Page**: View all available channels and user counts
- **Channel View**: See online users, activity log, and use PTT
- **Settings**: Configure audio devices and access admin controls
- **Network Status**: Monitor connection quality
- **Latency Display**: See real-time latency measurements

## Project Structure

```
.
├── server.js          # Node.js server with Socket.io
├── package.json       # Dependencies and scripts
├── public/
│   ├── index.html    # Main HTML file with all pages
│   ├── styles.css    # Complete CSS with Poppins font
│   └── app.js        # Main application logic
└── README.md         # This file
```

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari (iOS 11+)
- Mobile browsers with WebRTC support

## Requirements

- Node.js 14+ 
- Modern browser with MediaRecorder API support
- Microphone access (required for PTT)

## Security Notes

⚠️ **For Production Use:**
- Add authentication (JWT/OAuth)
- Use HTTPS/WSS (TLS encryption)
- Implement rate limiting
- Add input validation
- Consider WebRTC SFU for better scalability

## Future Enhancements

- WebRTC integration for lower latency
- Native mobile apps (React Native)
- End-to-end encryption
- Recording and playback
- Location sharing
- Hardware PTT button support
- Offline mesh networking

## License

MIT License - Feel free to use and modify as needed.

## Support

For issues or questions, please check the code comments or create an issue in the repository.


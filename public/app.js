// ============================================
// Walkie-Talkie App - Firebase Implementation
// ============================================

class WalkieTalkieApp {
    constructor() {
        this.userId = null;
        this.userRef = null;
        this.channelRef = null;
        this.mediaStream = null;
        this.recorder = null;
        this.currentPage = 'login-page';
        this.currentChannel = null;
        this.username = null;
        this.role = 'user';
        this.isJoined = false;
        this.isSpeaking = false;
        this.playQueues = {};
        this.players = {};
        this.roster = [];
        this.channels = [];
        this.spacePressed = false;
        this.latency = null;
        this.databaseListeners = [];
        this.processedAudioChunks = new Set();

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupRouting();
        this.setupFirebaseAuth();
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Navigation
        document.getElementById('back-btn').addEventListener('click', () => this.navigate('channels-page'));
        document.getElementById('settings-btn').addEventListener('click', () => this.navigate('settings-page'));
        document.getElementById('settings-back-btn').addEventListener('click', () => this.navigate('channels-page'));
        document.getElementById('channel-menu-btn').addEventListener('click', () => this.navigate('settings-page'));
        document.getElementById('nav-users').addEventListener('click', () => this.showToast('Users feature coming soon', 'info'));

        // Channel creation - inline input
        const createChannelBtnInline = document.getElementById('create-channel-btn-inline');
        if (createChannelBtnInline) {
            createChannelBtnInline.addEventListener('click', () => this.createChannelFromInput());
        }

        // Enter key on channel input
        const newChannelInput = document.getElementById('new-channel-input');
        if (newChannelInput) {
            newChannelInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.createChannelFromInput();
                }
            });
        }

        // Channel search
        document.getElementById('channel-search').addEventListener('input', (e) => this.filterChannels(e.target.value));

        // PTT Button
        const pttBtn = document.getElementById('ptt-btn');
        if (pttBtn) {
            pttBtn.addEventListener('mousedown', () => this.startPTT());
            pttBtn.addEventListener('mouseup', () => this.stopPTT());
            pttBtn.addEventListener('mouseleave', () => {
                if (this.isSpeaking) this.stopPTT();
            });
            // Touch events
            pttBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.startPTT();
            });
            pttBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.stopPTT();
            });
        }

        // Keyboard PTT (Spacebar)
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.spacePressed && this.isJoined) {
                e.preventDefault();
                this.spacePressed = true;
                this.startPTT();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.spacePressed = false;
                if (this.isSpeaking) this.stopPTT();
            }
        });

        // Settings
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
        document.getElementById('emergency-btn').addEventListener('click', () => this.handleEmergency());

        // Network status
        window.addEventListener('online', () => this.updateNetworkStatus(true));
        window.addEventListener('offline', () => this.updateNetworkStatus(false));
    }

    setupRouting() {
        // Show login page by default
        this.showPage('login-page');
    }

    setupFirebaseAuth() {
        // Monitor auth state
        auth.onAuthStateChanged((user) => {
            if (user) {
                this.userId = user.uid;
                this.updateConnectionStatus('connected');
                this.showToast('Connected to Firebase', 'success');
            } else {
                this.userId = null;
                this.updateConnectionStatus('disconnected');
            }
        });
    }

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
            this.currentPage = pageId;
        }
    }

    navigate(pageId) {
        // Handle leaving channel when navigating away
        if (this.currentPage === 'channel-page' && pageId !== 'channel-page' && this.isJoined) {
            this.leaveChannel();
        }

        this.showPage(pageId);

        // Refresh channels list when showing channels page
        if (pageId === 'channels-page') {
            this.loadChannels();
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const usernameInput = document.getElementById('username-input');
        const roleSelect = document.getElementById('role-select');

        if (!usernameInput || !roleSelect) return;

        const username = usernameInput.value.trim();
        const role = roleSelect.value;

        if (!username) {
            this.showToast('Please enter a username', 'error');
            return;
        }

        this.username = username;
        this.role = role;

        // Request microphone access
        try {
            await this.ensureMicrophone();
            this.showToast('Microphone access granted', 'success');
        } catch (error) {
            this.showToast('Microphone access required', 'error');
            return;
        }

        // Sign in anonymously with Firebase
        try {
            const userCredential = await auth.signInAnonymously();
            this.userId = userCredential.user.uid;

            // Store user info in database
            await database.ref(`users/${this.userId}`).set({
                username: username,
                role: role,
                online: true,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });

            // Navigate to channels page
            this.navigate('channels-page');
            this.loadChannels();

            // Show admin section if admin
            if (role === 'admin') {
                document.getElementById('admin-section').style.display = 'block';
            }
        } catch (error) {
            console.error('Firebase auth error:', error);

            // Check if it's the anonymous auth restriction error
            if (error.code === 'auth/admin-restricted-operation' || error.message.includes('restricted to administrators')) {
                this.showToast('Anonymous authentication is not enabled. Please enable it in Firebase Console.', 'error');
                this.showDetailedError('To enable anonymous authentication:\n\n1. Go to Firebase Console\n2. Select your project\n3. Go to Authentication → Sign-in method\n4. Enable "Anonymous" provider\n5. Click Save\n\nThen refresh this page and try again.');
            } else {
                this.showToast('Failed to connect: ' + error.message, 'error');
            }
        }
    }

    async ensureMicrophone() {
        if (this.mediaStream) {
            // Check if stream is still active
            const tracks = this.mediaStream.getAudioTracks();
            if (tracks.length > 0 && tracks[0].readyState === 'live') {
                return this.mediaStream;
            }
        }

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Log audio track info
            const audioTrack = this.mediaStream.getAudioTracks()[0];
            console.log('Microphone access granted:', {
                label: audioTrack.label,
                enabled: audioTrack.enabled,
                muted: audioTrack.muted,
                readyState: audioTrack.readyState
            });

            // Monitor track state
            audioTrack.onended = () => {
                console.warn('Microphone track ended');
                this.mediaStream = null;
            };

            return this.mediaStream;
        } catch (error) {
            console.error('Microphone access error:', error);
            this.showToast('Microphone error: ' + error.message, 'error');
            throw error;
        }
    }

    async loadChannels() {
        try {
            const channelsRef = database.ref('channels');
            channelsRef.on('value', (snapshot) => {
                const channelsData = snapshot.val() || {};
                this.channels = Object.keys(channelsData).map(channelName => ({
                    name: channelName,
                    userCount: Object.keys(channelsData[channelName].users || {}).length
                }));
                this.updateChannelsDisplay();
            });
        } catch (error) {
            console.error('Error loading channels:', error);
        }
    }

    async joinChannel(channelName) {
        if (!this.userId) {
            this.showToast('Please login first', 'error');
            return;
        }

        try {
            await this.ensureMicrophone();
        } catch (error) {
            this.showToast('Microphone access required', 'error');
            return;
        }

        this.currentChannel = channelName;
        const channelRef = database.ref(`channels/${channelName}`);

        // Add user to channel
        await channelRef.child('users').child(this.userId).set({
            username: this.username,
            role: this.role,
            joinedAt: firebase.database.ServerValue.TIMESTAMP,
            isSpeaking: false
        });

        // Ensure channel exists
        await channelRef.child('createdAt').set(firebase.database.ServerValue.TIMESTAMP);

        this.isJoined = true;
        this.channelRef = channelRef;
        this.navigate('channel-page');

        // Update channel name in header
        const channelNameEl = document.getElementById('channel-name');
        if (channelNameEl) {
            channelNameEl.textContent = channelName;
        }

        const channelStatusEl = document.getElementById('channel-status');
        if (channelStatusEl) {
            channelStatusEl.textContent = 'Connected';
        }

        // Enable PTT button
        const pttBtn = document.getElementById('ptt-btn');
        if (pttBtn) {
            pttBtn.disabled = false;
        }

        // Listen to channel users
        this.setupChannelListeners(channelRef);

        this.addActivity(`Joined channel: ${channelName}`);

        // Test audio on join (optional - can be removed)
        console.log('Channel joined. Audio test available via browser console: app.testAudio()');
    }

    // Test function to verify audio recording and playback
    async testAudio() {
        console.log('Testing audio...');
        try {
            if (!this.mediaStream) {
                await this.ensureMicrophone();
            }

            const testRecorder = new MediaRecorder(this.mediaStream);
            const chunks = [];

            testRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };

            testRecorder.onstop = async () => {
                const blob = new Blob(chunks, {
                    type: 'audio/webm'
                });
                const audio = new Audio(URL.createObjectURL(blob));
                audio.volume = 1.0;
                console.log('Playing test audio...');
                await audio.play();
                audio.onended = () => {
                    console.log('Test audio playback completed');
                    URL.revokeObjectURL(audio.src);
                };
            };

            console.log('Recording test audio for 2 seconds...');
            testRecorder.start();
            setTimeout(() => {
                testRecorder.stop();
                console.log('Test recording stopped');
            }, 2000);
        } catch (error) {
            console.error('Audio test failed:', error);
            this.showToast('Audio test failed: ' + error.message, 'error');
        }
    }

    setupChannelListeners(channelRef) {
        // Listen to users in channel
        const usersRef = channelRef.child('users');
        usersRef.on('value', (snapshot) => {
            const usersData = snapshot.val() || {};
            this.roster = Object.keys(usersData).map(userId => ({
                id: userId,
                ...usersData[userId]
            }));
            this.updateRosterDisplay();
        });

        // Listen to audio chunks - only new ones
        const audioRef = channelRef.child('audio');

        // Track processed chunks to avoid duplicates
        if (!this.processedAudioChunks) {
            this.processedAudioChunks = new Set();
        }

        // Get current timestamp to only process new chunks
        const joinTime = Date.now();

        // Listen to new audio chunks
        audioRef.on('child_added', (snapshot) => {
            const audioData = snapshot.val();
            const audioId = snapshot.key;

            console.log('Audio chunk received:', audioId, audioData);

            if (!audioData) {
                console.warn('Empty audio data');
                return;
            }

            // Skip if it's from this user
            if (audioData.userId === this.userId) {
                console.log('Skipping own audio chunk');
                return;
            }

            // Skip if we've already processed this chunk
            if (this.processedAudioChunks.has(audioId)) {
                console.log('Already processed chunk:', audioId);
                return;
            }

            // Only process chunks created after we joined (or recent ones)
            // Firebase timestamps are in milliseconds
            const chunkTime = audioData.timestamp || 0;
            // Be more lenient - accept chunks from last 30 seconds
            if (chunkTime > 0 && chunkTime < joinTime - 30000) {
                console.log('Skipping old audio chunk:', audioId, 'Time:', chunkTime, 'Join:', joinTime, 'Diff:', joinTime - chunkTime);
                return;
            }

            // If timestamp is 0 or missing, still process it (might be a new chunk)
            if (chunkTime === 0) {
                console.log('Audio chunk has no timestamp, processing anyway');
            }

            // Mark as processed
            this.processedAudioChunks.add(audioId);

            // Clean up old IDs to prevent memory leak
            if (this.processedAudioChunks.size > 100) {
                const firstId = this.processedAudioChunks.values().next().value;
                this.processedAudioChunks.delete(firstId);
            }

            console.log('Processing new audio chunk from:', audioData.username, 'ID:', audioId, 'Has data:', !!audioData.data);
            this.handleAudioChunk(audioData);
        });

        // Listen to speaking states
        usersRef.on('child_changed', (snapshot) => {
            const userData = snapshot.val();
            const userId = snapshot.key;
            if (userId !== this.userId) {
                this.updateUserSpeakingState(userId, userData.isSpeaking || false);
            }
        });

        // Store listeners for cleanup
        this.databaseListeners.push(usersRef, audioRef);
    }

    leaveChannel() {
        if (this.currentChannel && this.userId) {
            // Remove user from channel
            const channelRef = database.ref(`channels/${this.currentChannel}`);
            channelRef.child('users').child(this.userId).remove();

            // Remove all listeners
            this.databaseListeners.forEach(listener => listener.off());
            this.databaseListeners = [];

            this.isJoined = false;
            this.currentChannel = null;
            this.channelRef = null;

            const pttBtn = document.getElementById('ptt-btn');
            if (pttBtn) {
                pttBtn.disabled = true;
            }

            // Stop any ongoing recording
            if (this.isSpeaking) {
                this.stopPTT();
            }

            // Clear play queues
            this.playQueues = {};
            this.players = {};
            this.processedAudioChunks = new Set();

            this.addActivity('Left channel');
        }
    }

    async cleanupOldAudioChunks() {
        if (!this.currentChannel) return;

        try {
            const audioRef = database.ref(`channels/${this.currentChannel}/audio`);
            const snapshot = await audioRef.once('value');
            const audioData = snapshot.val();

            if (!audioData) return;

            const chunks = Object.keys(audioData);
            // Keep only last 10 chunks per channel to prevent database bloat
            // Firebase Realtime Database has a 256KB limit per node
            if (chunks.length > 10) {
                const sortedChunks = chunks.sort((a, b) => {
                    const timeA = audioData[a].timestamp || 0;
                    const timeB = audioData[b].timestamp || 0;
                    return timeA - timeB;
                });

                // Remove oldest chunks
                const toRemove = sortedChunks.slice(0, chunks.length - 10);
                const updates = {};
                toRemove.forEach(chunkId => {
                    updates[`channels/${this.currentChannel}/audio/${chunkId}`] = null;
                });
                if (Object.keys(updates).length > 0) {
                    await database.ref().update(updates);
                }
            }
        } catch (error) {
            console.error('Error cleaning up audio chunks:', error);
        }
    }

    async startPTT() {
        if (!this.isJoined || this.isSpeaking) return;

        try {
            if (!this.mediaStream) {
                await this.ensureMicrophone();
            }

            // Check for supported MIME types
            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/webm';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'audio/ogg;codecs=opus';
                    if (!MediaRecorder.isTypeSupported(mimeType)) {
                        mimeType = 'audio/mp4'; // Try MP4 as fallback
                        if (!MediaRecorder.isTypeSupported(mimeType)) {
                            mimeType = ''; // Use browser default
                        }
                    }
                }
            }

            const options = mimeType ? {
                mimeType: mimeType,
                audioBitsPerSecond: 32000
            } : {
                audioBitsPerSecond: 32000
            };

            console.log('Starting MediaRecorder with:', options);

            // Store the mimeType for later use in playback
            this.recordingMimeType = mimeType || 'audio/webm';

            this.recorder = new MediaRecorder(this.mediaStream, options);

            // Add error handler
            this.recorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                this.showToast('Recording error: ' + event.error.message, 'error');
            };

            this.recorder.ondataavailable = async (e) => {
                if (e.data && e.data.size > 0 && this.isJoined && this.currentChannel) {
                    console.log('Audio chunk available:', e.data.size, 'bytes');
                    try {
                        // Convert to base64 for direct database storage (faster than Storage)
                        const reader = new FileReader();
                        reader.onload = async () => {
                            try {
                                let base64Data = reader.result;

                                // Remove data URL prefix if present
                                if (base64Data.includes(',')) {
                                    base64Data = base64Data.split(',')[1];
                                }

                                if (!base64Data) {
                                    console.error('No base64 data extracted');
                                    return;
                                }

                                const audioId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                                console.log('Uploading audio chunk to Firebase:', audioId, 'Size:', base64Data.length);

                                // Store directly in Realtime Database for low latency
                                // Also store the MIME type for proper playback
                                await database.ref(`channels/${this.currentChannel}/audio/${audioId}`).set({
                                    userId: this.userId,
                                    username: this.username,
                                    data: base64Data, // Store base64 directly
                                    mimeType: this.recordingMimeType || 'audio/webm', // Store MIME type
                                    timestamp: firebase.database.ServerValue.TIMESTAMP
                                });

                                console.log('Audio chunk uploaded successfully');

                                // Clean up old audio chunks (keep last 10 per user to prevent database bloat)
                                this.cleanupOldAudioChunks();
                            } catch (error) {
                                console.error('Error uploading audio chunk:', error);
                                this.showToast('Upload error: ' + error.message, 'error');
                            }
                        };
                        reader.onerror = (error) => {
                            console.error('FileReader error:', error);
                            this.showToast('File read error', 'error');
                        };
                        reader.readAsDataURL(e.data);
                    } catch (error) {
                        console.error('Audio processing error:', error);
                        this.showToast('Processing error: ' + error.message, 'error');
                    }
                } else {
                    console.warn('No audio data or not joined:', {
                        hasData: !!e.data,
                        dataSize: e.data ? e.data.size : 0,
                        isJoined: this.isJoined,
                        currentChannel: this.currentChannel
                    });
                }
            };

            this.recorder.onstart = async () => {
                this.isSpeaking = true;
                this.updateSpeakingIndicator(true);

                // Update speaking state in database
                if (this.channelRef) {
                    await this.channelRef.child('users').child(this.userId).update({
                        isSpeaking: true
                    });
                }

                // Vibrate if supported
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            };

            this.recorder.onstop = async () => {
                this.isSpeaking = false;
                this.updateSpeakingIndicator(false);

                // Update speaking state in database
                if (this.channelRef) {
                    await this.channelRef.child('users').child(this.userId).update({
                        isSpeaking: false
                    });
                }
            };

            // Start recording with small timeslice for low latency (100ms chunks)
            this.recorder.start(100);

            console.log('PTT started - recording audio');

            // Visual feedback
            const pttBtn = document.getElementById('ptt-btn');
            if (pttBtn) {
                pttBtn.classList.add('pressed');
            }

        } catch (error) {
            console.error('PTT start error:', error);
            this.showToast('Failed to start recording', 'error');
        }
    }

    stopPTT() {
        if (this.recorder && this.recorder.state !== 'inactive') {
            this.recorder.stop();
            this.recorder = null;
            console.log('PTT stopped - recording ended');
        }

        const pttBtn = document.getElementById('ptt-btn');
        if (pttBtn) {
            pttBtn.classList.remove('pressed');
        }
    }

    async handleAudioChunk(audioData) {
        try {
            const fromId = audioData.userId;
            const username = audioData.username || fromId;

            console.log('=== HANDLING AUDIO CHUNK ===');
            console.log('From:', username);
            console.log('Has data:', !!audioData.data);
            console.log('Data length:', audioData.data ? audioData.data.length : 0);
            console.log('Has URL:', !!audioData.url);
            console.log('MIME type:', audioData.mimeType);

            // Store MIME type for use in enqueueAndPlay
            if (audioData.mimeType) {
                this.lastAudioChunkMimeType = audioData.mimeType;
            }

            // If data is base64 (direct from database)
            if (audioData.data) {
                try {
                    console.log('Decoding base64 audio data...');
                    // Convert base64 to ArrayBuffer
                    let base64Data = audioData.data;

                    // Validate base64
                    if (!base64Data || base64Data.length === 0) {
                        console.error('Empty base64 data');
                        return;
                    }

                    // Remove data URL prefix if present
                    if (base64Data.includes(',')) {
                        base64Data = base64Data.split(',')[1];
                    }

                    // Decode base64
                    const binaryString = atob(base64Data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const arrayBuffer = bytes.buffer;

                    console.log('Decoded to ArrayBuffer:', arrayBuffer.byteLength, 'bytes');

                    // Validate the audio data by checking for WebM header
                    const view = new Uint8Array(arrayBuffer);
                    const isWebM = view[0] === 0x1A && view[1] === 0x45 && view[2] === 0xDF && view[3] === 0xA3;
                    console.log('Audio format check - Is WebM:', isWebM, 'First bytes:', Array.from(view.slice(0, 4)).map(b => '0x' + b.toString(16)).join(' '));

                    this.enqueueAndPlay(fromId, arrayBuffer, username);
                    this.addActivity(`Receiving audio from ${username}`);
                } catch (error) {
                    console.error('Error decoding base64 audio:', error);
                    console.error('Error details:', error.message, error.stack);
                }
            }
            // Fallback: if URL exists (from Storage)
            else if (audioData.url) {
                try {
                    console.log('Fetching audio from URL:', audioData.url);
                    const response = await fetch(audioData.url);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    console.log('Fetched audio:', arrayBuffer.byteLength, 'bytes');
                    this.enqueueAndPlay(fromId, arrayBuffer, username);
                    this.addActivity(`Receiving audio from ${username}`);
                } catch (error) {
                    console.error('Error fetching audio from URL:', error);
                }
            } else {
                console.warn('Audio chunk missing data or URL:', audioData);
                console.warn('Full audioData object:', JSON.stringify(audioData));
            }
        } catch (error) {
            console.error('Audio chunk processing error:', error);
            console.error('Error stack:', error.stack);
        }
    }

    enqueueAndPlay(fromId, arrayBuffer, username) {
        console.log('Enqueueing audio for playback:', username, 'Size:', arrayBuffer.byteLength);

        // Verify the blob can be created and is valid
        if (arrayBuffer.byteLength === 0) {
            console.warn('Empty arrayBuffer, skipping');
            return;
        }

        // Try to get MIME type from audioData if available, otherwise detect from data
        let mimeType = null;

        // First, try to use stored MIME type from the audio chunk
        if (this.lastAudioChunkMimeType) {
            mimeType = this.lastAudioChunkMimeType;
            console.log('Using stored MIME type:', mimeType);
        }

        // If not available, detect from the actual data
        if (!mimeType) {
            const view = new Uint8Array(arrayBuffer);

            // Check for WebM header (0x1A 0x45 0xDF 0xA3)
            if (view[0] === 0x1A && view[1] === 0x45 && view[2] === 0xDF && view[3] === 0xA3) {
                // Use simple webm without codec - browser will auto-detect
                mimeType = 'audio/webm';
                console.log('Detected WebM format from header');
            }
            // Check for OGG header (0x4F 0x67 0x67 0x53)
            else if (view[0] === 0x4F && view[1] === 0x67 && view[2] === 0x67 && view[3] === 0x53) {
                mimeType = 'audio/ogg';
                console.log('Detected OGG format from header');
            }
            // Check for MP4 header
            else if (view[4] === 0x66 && view[5] === 0x74 && view[6] === 0x79 && view[7] === 0x70) {
                mimeType = 'audio/mp4';
                console.log('Detected MP4 format from header');
            } else {
                // Use the recording MIME type if available, or default
                mimeType = this.recordingMimeType || 'audio/webm';
                console.log('Using default/recording MIME type:', mimeType);
            }
        }

        const blob = new Blob([arrayBuffer], {
            type: mimeType
        });

        console.log('Created blob:', blob.type, blob.size, 'bytes');

        if (!this.playQueues[fromId]) {
            this.playQueues[fromId] = [];
        }

        this.playQueues[fromId].push({
            blob,
            username
        });

        if (!this.players[fromId]) {
            this.players[fromId] = new Audio();
            this.players[fromId].autoplay = false;
            this.players[fromId].controls = false;
            this.players[fromId].style.display = 'none';
            this.players[fromId].volume = 1.0; // Ensure volume is set
            document.body.appendChild(this.players[fromId]);

            // Add error handler
            this.players[fromId].onerror = (e) => {
                console.error('Audio playback error:', e);
                this.showToast('Playback error', 'error');
            };
        }

        if (!this.players[fromId].busy) {
            this.drainQueue(fromId);
        }
    }

    async drainQueue(fromId) {
        const player = this.players[fromId];
        if (!player || !this.playQueues[fromId]) {
            console.warn('No player or queue for:', fromId);
            return;
        }

        if (this.playQueues[fromId].length === 0) {
            player.busy = false;
            return;
        }

        if (player.busy) {
            console.log('Player busy, waiting...');
            setTimeout(() => this.drainQueue(fromId), 50);
            return;
        }

        player.busy = true;
        const item = this.playQueues[fromId].shift();

        console.log('Draining queue for:', fromId, 'Queue length:', this.playQueues[fromId].length);

        // Create a new Audio element for each chunk
        const audioElement = new Audio();
        audioElement.volume = 1.0;
        let objectURL = null;

        try {
            objectURL = URL.createObjectURL(item.blob);
            console.log('Playing audio from:', item.username, 'Type:', item.blob.type, 'Size:', item.blob.size);

            // Wait for audio to be ready (with shorter timeout for faster playback)
            await new Promise((resolve, reject) => {
                let resolved = false;
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        console.warn('Audio load timeout, trying to play anyway...');
                        resolved = true;
                        audioElement.removeEventListener('canplay', onCanPlay);
                        audioElement.removeEventListener('loadeddata', onLoadedData);
                        audioElement.removeEventListener('error', onError);
                        resolve(); // Don't reject, try to play anyway
                    }
                }, 500); // Very short timeout - just try to play

                const onCanPlay = () => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        resolved = true;
                        audioElement.removeEventListener('canplay', onCanPlay);
                        audioElement.removeEventListener('loadeddata', onLoadedData);
                        audioElement.removeEventListener('error', onError);
                        console.log('Audio can play');
                        resolve();
                    }
                };

                const onLoadedData = () => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        resolved = true;
                        audioElement.removeEventListener('canplay', onCanPlay);
                        audioElement.removeEventListener('loadeddata', onLoadedData);
                        audioElement.removeEventListener('error', onError);
                        console.log('Audio data loaded');
                        resolve();
                    }
                };

                const onError = (e) => {
                    if (!resolved) {
                        clearTimeout(timeout);
                        resolved = true;
                        audioElement.removeEventListener('canplay', onCanPlay);
                        audioElement.removeEventListener('loadeddata', onLoadedData);
                        audioElement.removeEventListener('error', onError);
                        const error = audioElement.error;
                        console.error('Audio load error:', error ? error.message : 'Unknown');
                        console.error('Error code:', error ? error.code : 'unknown');
                        // Don't reject immediately - try fallback
                        resolve(); // Resolve to continue to fallback
                    }
                };

                audioElement.src = objectURL;
                audioElement.addEventListener('canplay', onCanPlay);
                audioElement.addEventListener('loadeddata', onLoadedData);
                audioElement.addEventListener('error', onError);

                // Load immediately
                audioElement.load();
            });

            // Audio is ready, set up ended handler and play
            audioElement.onended = () => {
                console.log('Audio playback ended');
                URL.revokeObjectURL(objectURL);
                player.busy = false;
                setTimeout(() => this.drainQueue(fromId), 0);
            };

            audioElement.onerror = (e) => {
                const error = audioElement.error;
                console.error('Playback error:', error ? error.message : 'Unknown');
                URL.revokeObjectURL(objectURL);
                player.busy = false;
                setTimeout(() => this.drainQueue(fromId), 50);
            };

            // Play the audio
            try {
                const playPromise = audioElement.play();
                if (playPromise !== undefined) {
                    await playPromise;
                    console.log('Audio playback started successfully');
                }
            } catch (playError) {
                console.error('Play promise error:', playError);
                // Check if it's a codec error and try fallback
                if (playError.name === 'NotSupportedError' || playError.message.includes('codec')) {
                    throw new Error('Codec not supported');
                }
                throw playError;
            }

        } catch (error) {
            console.error('Playback error:', error.message);

            // Try fallback MIME types if it's a codec/format issue
            if (error.message.includes('codec') || error.message.includes('source') || error.message.includes('DEMUXER') || error.message.includes('FFmpeg')) {
                console.log('Trying fallback MIME types...');
                const fallbackTypes = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];

                for (const fallbackType of fallbackTypes) {
                    if (item.blob.type === fallbackType) continue; // Skip if already tried

                    try {
                        console.log('Trying fallback type:', fallbackType);
                        const fallbackBlob = new Blob([item.blob], {
                            type: fallbackType
                        });
                        const fallbackURL = URL.createObjectURL(fallbackBlob);
                        const fallbackAudio = new Audio();
                        fallbackAudio.volume = 1.0;
                        fallbackAudio.src = fallbackURL;

                        fallbackAudio.onended = () => {
                            console.log('Fallback playback ended');
                            URL.revokeObjectURL(fallbackURL);
                            player.busy = false;
                            setTimeout(() => this.drainQueue(fromId), 0);
                        };

                        fallbackAudio.onerror = (e) => {
                            console.error('Fallback error:', fallbackType, fallbackAudio.error);
                            URL.revokeObjectURL(fallbackURL);
                            // Try next fallback type
                        };

                        // Wait briefly for canplay
                        await new Promise((resolve) => {
                            const timeout = setTimeout(resolve, 200);
                            fallbackAudio.oncanplay = () => {
                                clearTimeout(timeout);
                                resolve();
                            };
                            fallbackAudio.onerror = () => {
                                clearTimeout(timeout);
                                resolve();
                            };
                        });

                        if (!fallbackAudio.error) {
                            await fallbackAudio.play();
                            console.log('Fallback playback started with:', fallbackType);
                            if (objectURL) URL.revokeObjectURL(objectURL);
                            return; // Success with fallback
                        }
                    } catch (fallbackError) {
                        console.error('Fallback failed for', fallbackType, ':', fallbackError);
                        continue; // Try next fallback
                    }
                }

                console.error('All fallback types failed');
            }

            if (objectURL) {
                URL.revokeObjectURL(objectURL);
            }
            player.busy = false;
            setTimeout(() => this.drainQueue(fromId), 50);
        }
    }

    updateSpeakingIndicator(isSpeaking) {
        const indicator = document.getElementById('speaking-indicator');
        if (indicator) {
            if (isSpeaking) {
                indicator.classList.add('active');
                indicator.querySelector('span').textContent = 'You are speaking';
            } else {
                indicator.classList.remove('active');
                indicator.querySelector('span').textContent = 'Not speaking';
            }
        }
    }

    updateRosterDisplay() {
        const rosterList = document.getElementById('roster-list');
        const userCount = document.getElementById('user-count');

        if (!rosterList) return;

        rosterList.innerHTML = '';

        if (this.roster.length === 0) {
            rosterList.innerHTML = '<div class="roster-item"><span>No users online</span></div>';
            if (userCount) userCount.textContent = '0';
            return;
        }

        if (userCount) {
            userCount.textContent = this.roster.length.toString();
        }

        this.roster.forEach(user => {
            const item = document.createElement('div');
            item.className = 'roster-item';
            if (user.isSpeaking) {
                item.classList.add('speaking');
            }

            const avatar = document.createElement('div');
            avatar.className = 'user-avatar';
            avatar.textContent = (user.username || user.id).charAt(0).toUpperCase();

            const info = document.createElement('div');
            info.className = 'user-info';
            const name = document.createElement('div');
            name.className = 'name';
            name.textContent = user.username || user.id;
            if (user.id === this.userId) {
                name.textContent += ' (you)';
            }
            const role = document.createElement('div');
            role.className = 'role';
            role.textContent = user.role || 'user';
            info.appendChild(name);
            info.appendChild(role);

            const status = document.createElement('div');
            status.className = 'user-status';
            if (user.isSpeaking) {
                status.classList.add('speaking');
            }

            item.appendChild(avatar);
            item.appendChild(info);
            item.appendChild(status);
            rosterList.appendChild(item);
        });
    }

    updateUserSpeakingState(userId, isSpeaking) {
        // Update roster data
        const user = this.roster.find(u => u.id === userId);
        if (user) {
            user.isSpeaking = isSpeaking;
        }
        this.updateRosterDisplay();
    }

    updateChannelsDisplay() {
        const channelsList = document.getElementById('channels-list');
        if (!channelsList) return;

        channelsList.innerHTML = '';

        if (this.channels.length === 0) {
            channelsList.innerHTML = '<div class="channel-item"><p>No channels available. Create one!</p></div>';
            return;
        }

        this.channels.forEach(channel => {
            const item = document.createElement('div');
            item.className = 'channel-item';
            if (channel.name === this.currentChannel) {
                item.classList.add('active');
            }

            item.addEventListener('click', () => {
                if (channel.name !== this.currentChannel) {
                    this.joinChannel(channel.name);
                }
            });

            const info = document.createElement('div');
            info.className = 'channel-info';
            const name = document.createElement('h3');
            name.textContent = channel.name;
            name.title = channel.name; // Tooltip for full name
            const desc = document.createElement('p');
            desc.textContent = `${channel.userCount || 0} users online`;
            info.appendChild(name);
            info.appendChild(desc);

            const badge = document.createElement('span');
            badge.className = 'channel-badge';
            badge.textContent = channel.userCount || 0;

            item.appendChild(info);
            item.appendChild(badge);
            channelsList.appendChild(item);
        });
    }

    filterChannels(query) {
        const items = document.querySelectorAll('.channel-item');
        const lowerQuery = query.toLowerCase();

        items.forEach(item => {
            const name = item.querySelector('h3').textContent.toLowerCase() || '';
            if (name.includes(lowerQuery)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    async createChannelFromInput() {
        const input = document.getElementById('new-channel-input');
        if (!input) return;

        const channelName = input.value.trim();
        if (!channelName) {
            this.showToast('Please enter a channel name', 'error');
            input.focus();
            return;
        }

        // Clean channel name (alphanumeric, hyphens, underscores only)
        const cleanName = channelName.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 30);
        if (!cleanName) {
            this.showToast('Invalid channel name. Use letters, numbers, hyphens, or underscores', 'error');
            input.focus();
            return;
        }

        try {
            // Create channel in Firebase
            const channelRef = database.ref(`channels/${cleanName}`);
            await channelRef.child('createdAt').set(firebase.database.ServerValue.TIMESTAMP);

            // Clear input
            input.value = '';

            this.showToast(`Channel "${cleanName}" created`, 'success');
            this.joinChannel(cleanName);
        } catch (error) {
            console.error('Error creating channel:', error);
            this.showToast('Failed to create channel: ' + error.message, 'error');
        }
    }

    async showCreateChannelDialog() {
        // Focus on input instead of prompt
        const input = document.getElementById('new-channel-input');
        if (input) {
            input.focus();
        } else {
            // Fallback to prompt if input doesn't exist
            const channelName = prompt('Enter channel name:');
            if (channelName && channelName.trim()) {
                const cleanName = channelName.trim().replace(/[^a-zA-Z0-9-_]/g, '');
                if (cleanName) {
                    const channelRef = database.ref(`channels/${cleanName}`);
                    await channelRef.child('createdAt').set(firebase.database.ServerValue.TIMESTAMP);
                    this.showToast(`Channel "${cleanName}" created`, 'success');
                    this.joinChannel(cleanName);
                }
            }
        }
    }

    addActivity(message) {
        const activityList = document.getElementById('activity-list');
        if (!activityList) return;

        const item = document.createElement('div');
        item.className = 'activity-item';
        const time = new Date().toLocaleTimeString();
        item.textContent = `${time} — ${message}`;

        activityList.insertBefore(item, activityList.firstChild);

        // Keep only last 20 items
        while (activityList.children.length > 20) {
            activityList.removeChild(activityList.lastChild);
        }
    }

    updateLatencyDisplay() {
        const latencyEl = document.getElementById('latency-value');
        if (latencyEl && this.latency !== null) {
            latencyEl.textContent = `${this.latency} ms`;
        }
    }

    updateConnectionStatus(status) {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.className = `status-indicator ${status}`;
            const text = statusEl.querySelector('span:last-child');
            if (text) {
                text.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
            }
        }
    }

    updateNetworkStatus(isOnline) {
        const networkEl = document.getElementById('network-status');
        if (networkEl) {
            if (isOnline) {
                networkEl.classList.remove('offline');
                networkEl.querySelector('span').textContent = 'Connected';
            } else {
                networkEl.classList.add('offline');
                networkEl.querySelector('span').textContent = 'Offline';
            }
        }
    }

    async handleEmergency() {
        if (this.role !== 'admin') {
            this.showToast('Admin access required', 'error');
            return;
        }

        const message = prompt('Enter emergency message:');
        if (message && this.currentChannel) {
            await database.ref(`channels/${this.currentChannel}/emergency`).set({
                message: message,
                from: this.userId,
                username: this.username,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            this.showToast('Emergency broadcast sent', 'success');
        }
    }

    handleEmergencyAlert(data) {
        this.showToast(`EMERGENCY: ${data.message}`, 'error');
        // Vibrate pattern for emergency
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 200]);
        }
    }

    async handleLogout() {
        if (this.currentChannel) {
            this.leaveChannel();
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Remove all database listeners
        this.databaseListeners.forEach(listener => listener.off());
        this.databaseListeners = [];

        // Update user status
        if (this.userId) {
            await database.ref(`users/${this.userId}`).update({
                online: false,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        }

        // Sign out from Firebase
        await auth.signOut();

        this.userId = null;
        this.username = null;
        this.role = 'user';
        this.isJoined = false;
        this.currentChannel = null;
        this.roster = [];
        this.channels = [];

        // Reset UI
        document.getElementById('username-input').value = '';
        document.getElementById('admin-section').style.display = 'none';

        this.navigate('login-page');
        this.showToast('Logged out', 'success');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'toastIn 0.3s ease reverse';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    showDetailedError(message) {
        // Create a modal-like error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg-card, #141b29);
            border: 2px solid var(--danger, #ef4444);
            border-radius: 12px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            z-index: 10000;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            color: var(--text-primary, #f1f5f9);
        `;

        errorDiv.innerHTML = `
            <h3 style="margin-top: 0; color: var(--danger, #ef4444);">Setup Required</h3>
            <pre style="white-space: pre-wrap; font-family: 'Poppins', sans-serif; line-height: 1.6; margin: 16px 0;">${message}</pre>
            <button id="close-error-btn" style="
                background: var(--accent, #10b981);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-family: 'Poppins', sans-serif;
                font-weight: 500;
                margin-top: 16px;
            ">Close</button>
        `;

        document.body.appendChild(errorDiv);

        document.getElementById('close-error-btn').addEventListener('click', () => {
            document.body.removeChild(errorDiv);
        });

        // Also close on background click
        errorDiv.addEventListener('click', (e) => {
            if (e.target === errorDiv) {
                document.body.removeChild(errorDiv);
            }
        });
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new WalkieTalkieApp();
    });
} else {
    window.app = new WalkieTalkieApp();
}
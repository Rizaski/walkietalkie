// server.js — Walkie-Talkie Server with enhanced features
const express = require('express');
const http = require('http');
const path = require('path');
const {
    Server
} = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const PORT = process.env.PORT || 3000;

// Serve static client
app.use(express.static(path.join(__dirname, 'public')));

// Store user data and channels
const channels = new Map(); // channel -> Set of socket IDs
const users = new Map(); // socket.id -> { username, channel, role, isSpeaking }

io.on('connection', socket => {
    console.log('User connected:', socket.id);

    // Join a channel room
    socket.on('join', ({
        channel,
        username,
        role = 'user'
    } = {}) => {
        if (!channel || !username) {
            socket.emit('error', {
                message: 'Channel and username required'
            });
            return;
        }

        // Leave previous channel if any
        if (socket.data.channel) {
            socket.leave(socket.data.channel);
            const prevChannel = channels.get(socket.data.channel);
            if (prevChannel) {
                prevChannel.delete(socket.id);
            }
        }

        // Join new channel
        socket.join(channel);
        socket.data.username = username;
        socket.data.channel = channel;
        socket.data.role = role;
        socket.data.isSpeaking = false;

        if (!channels.has(channel)) {
            channels.set(channel, new Set());
        }
        channels.get(channel).add(socket.id);

        users.set(socket.id, {
            username,
            channel,
            role,
            isSpeaking: false
        });

        console.log(`${socket.id} (${username}) joined ${channel}`);

        // Notify others
        socket.to(channel).emit('user-joined', {
            id: socket.id,
            username,
            role
        });

        // Send current roster
        updateRoster(channel);

        // Broadcast updated channel list to all clients
        broadcastChannelList();
    });

    // Leave channel
    socket.on('leave', ({
        channel
    } = {}) => {
        const ch = channel || socket.data.channel;
        if (ch) {
            socket.leave(ch);
            const channelSet = channels.get(ch);
            if (channelSet) {
                channelSet.delete(socket.id);
            }
            users.delete(socket.id);
            socket.to(ch).emit('user-left', {
                id: socket.id
            });
            updateRoster(ch);

            // Remove channel if empty
            if (channelSet && channelSet.size === 0) {
                channels.delete(ch);
            }

            // Broadcast updated channel list
            broadcastChannelList();
            console.log(`${socket.id} left ${ch}`);
        }
    });

    // Relay audio chunk
    socket.on('audio-chunk', (payload) => {
        const channel = payload.channel || socket.data.channel;
        if (!channel) return;

        const user = users.get(socket.id);
        if (user) {
            user.isSpeaking = true;
        }

        // Broadcast to everyone in channel except sender
        socket.to(channel).emit('audio-chunk', {
            from: socket.id,
            username: socket.data.username,
            role: socket.data.role,
            blob: payload.blob,
            timestamp: Date.now()
        });
    });

    // Speaking state update
    socket.on('speaking-state', ({
        isSpeaking
    }) => {
        const user = users.get(socket.id);
        if (user) {
            user.isSpeaking = isSpeaking;
            const channel = user.channel;
            if (channel) {
                socket.to(channel).emit('user-speaking', {
                    id: socket.id,
                    username: user.username,
                    isSpeaking
                });
            }
        }
    });

    // Priority/emergency override
    socket.on('emergency-broadcast', ({
        message,
        channel
    }) => {
        const user = users.get(socket.id);
        if (user && user.role === 'admin') {
            const targetChannel = channel || user.channel;
            if (targetChannel) {
                io.to(targetChannel).emit('emergency', {
                    from: socket.id,
                    username: user.username,
                    message,
                    timestamp: Date.now()
                });
            }
        }
    });

    // Get channel list
    socket.on('get-channels', () => {
        const channelList = Array.from(channels.keys()).map(ch => ({
            name: ch,
            userCount: channels.get(ch).size
        }));
        socket.emit('channels-list', channelList);
    });

    // Ping for latency
    socket.on('ping', (timestamp) => {
        socket.emit('pong', timestamp);
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const user = users.get(socket.id);
        if (user && user.channel) {
            const channel = user.channel;
            socket.leave(channel);
            const channelSet = channels.get(channel);
            if (channelSet) {
                channelSet.delete(socket.id);
            }
            socket.to(channel).emit('user-left', {
                id: socket.id
            });
            updateRoster(channel);

            // Remove channel if empty
            const channelSet = channels.get(channel);
            if (channelSet && channelSet.size === 0) {
                channels.delete(channel);
            }

            // Broadcast updated channel list
            broadcastChannelList();
        }
        users.delete(socket.id);
    });

    function broadcastChannelList() {
        const channelList = Array.from(channels.keys()).map(ch => ({
            name: ch,
            userCount: channels.get(ch).size
        }));
        io.emit('channels-list', channelList);
    }

    function updateRoster(channel) {
        const channelSet = channels.get(channel);
        if (!channelSet) return;

        const roster = Array.from(channelSet)
            .map(id => {
                const user = users.get(id);
                return user ? {
                    id,
                    username: user.username,
                    role: user.role,
                    isSpeaking: user.isSpeaking
                } : null;
            })
            .filter(Boolean);

        io.to(channel).emit('roster', roster);
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Walkie-Talkie Server running on http://localhost:${PORT}`);
});
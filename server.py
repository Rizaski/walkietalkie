#!/usr/bin/env python3
"""
Walkie-Talkie Server - Python/Flask-SocketIO Implementation
Compatible with Socket.io client
"""

from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import time

app = Flask(__name__, static_folder='public')
app.config['SECRET_KEY'] = 'walkie-talkie-secret-key-change-in-production'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Store user data and channels
channels = {}  # channel_name -> set of socket_ids
users = {}     # socket_id -> {username, channel, role, is_speaking}

PORT = int(os.environ.get('PORT', 3000))

@app.route('/')
def index():
    """Serve the main HTML file"""
    return send_from_directory('public', 'index.html')

@app.route('/styles.css')
def serve_css():
    """Serve CSS file"""
    return send_from_directory('public', 'styles.css')

@app.route('/app.js')
def serve_js():
    """Serve JavaScript file"""
    return send_from_directory('public', 'app.js')

@app.route('/<path:path>')
def serve_static(path):
    """Serve other static files"""
    # Don't interfere with socket.io paths
    if 'socket.io' in path:
        return None
    try:
        return send_from_directory('public', path)
    except Exception as e:
        print(f"Error serving {path}: {e}")
        return None

@socketio.on('connect')
def handle_connect(auth):
    """Handle client connection"""
    print(f'User connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print(f'User disconnected: {request.sid}')
    user = users.get(request.sid)
    if user and user.get('channel'):
        channel = user['channel']
        leave_room(channel)
        
        if channel in channels:
            channels[channel].discard(request.sid)
            if len(channels[channel]) == 0:
                del channels[channel]
        
        emit('user-left', {'id': request.sid}, room=channel, include_self=False)
        update_roster(channel)
        broadcast_channel_list()
    
    if request.sid in users:
        del users[request.sid]

@socketio.on('join')
def handle_join(data):
    """Handle client joining a channel"""
    channel = data.get('channel')
    username = data.get('username')
    role = data.get('role', 'user')
    
    if not channel or not username:
        emit('error', {'message': 'Channel and username required'})
        return
    
    # Leave previous channel if any
    old_user = users.get(request.sid)
    if old_user and old_user.get('channel'):
        old_channel = old_user['channel']
        leave_room(old_channel)
        if old_channel in channels:
            channels[old_channel].discard(request.sid)
    
    # Join new channel
    join_room(channel)
    users[request.sid] = {
        'username': username,
        'channel': channel,
        'role': role,
        'is_speaking': False
    }
    
    if channel not in channels:
        channels[channel] = set()
    channels[channel].add(request.sid)
    
    print(f'{request.sid} ({username}) joined {channel}')
    
    # Notify others
    emit('user-joined', {
        'id': request.sid,
        'username': username,
        'role': role
    }, room=channel, include_self=False)
    
    # Send current roster
    update_roster(channel)
    broadcast_channel_list()

@socketio.on('leave')
def handle_leave(data):
    """Handle client leaving a channel"""
    channel = data.get('channel')
    user = users.get(request.sid)
    
    ch = channel or (user.get('channel') if user else None)
    if ch:
        leave_room(ch)
        if ch in channels:
            channel_set = channels[ch]
            channel_set.discard(request.sid)
            
            if len(channel_set) == 0:
                del channels[ch]
        
        if request.sid in users:
            del users[request.sid]
        
        emit('user-left', {'id': request.sid}, room=ch, include_self=False)
        update_roster(ch)
        broadcast_channel_list()
        print(f'{request.sid} left {ch}')

@socketio.on('audio-chunk')
def handle_audio_chunk(data):
    """Relay audio chunk to other users in the channel"""
    channel = data.get('channel')
    user = users.get(request.sid)
    
    if not user:
        return
    
    ch = channel or user.get('channel')
    if not ch:
        return
    
    user['is_speaking'] = True
    
    # Broadcast to everyone in channel except sender
    emit('audio-chunk', {
        'from': request.sid,
        'username': user.get('username'),
        'role': user.get('role'),
        'blob': data.get('blob'),
        'timestamp': int(time.time() * 1000)
    }, room=ch, include_self=False)

@socketio.on('speaking-state')
def handle_speaking_state(data):
    """Update speaking state"""
    user = users.get(request.sid)
    if user:
        user['is_speaking'] = data.get('is_speaking', False)
        channel = user.get('channel')
        if channel:
            emit('user-speaking', {
                'id': request.sid,
                'username': user.get('username'),
                'is_speaking': user['is_speaking']
            }, room=channel, include_self=False)

@socketio.on('emergency-broadcast')
def handle_emergency_broadcast(data):
    """Handle emergency broadcast (admin only)"""
    user = users.get(request.sid)
    if user and user.get('role') == 'admin':
        channel = data.get('channel') or user.get('channel')
        if channel:
            emit('emergency', {
                'from': request.sid,
                'username': user.get('username'),
                'message': data.get('message'),
                'timestamp': int(time.time() * 1000)
            }, room=channel)

@socketio.on('get-channels')
def handle_get_channels():
    """Send list of all channels"""
    channel_list = [
        {'name': name, 'userCount': len(sids)}
        for name, sids in channels.items()
    ]
    emit('channels-list', channel_list)

@socketio.on('ping')
def handle_ping(data):
    """Handle ping for latency measurement"""
    emit('pong', data)

def update_roster(channel):
    """Update and broadcast roster for a channel"""
    if channel not in channels:
        return
    
    roster = []
    for sid in channels[channel]:
        user = users.get(sid)
        if user:
            roster.append({
                'id': sid,
                'username': user.get('username'),
                'role': user.get('role'),
                'is_speaking': user.get('is_speaking', False)
            })
    
    emit('roster', roster, room=channel)

def broadcast_channel_list():
    """Broadcast updated channel list to all clients"""
    channel_list = [
        {'name': name, 'userCount': len(sids)}
        for name, sids in channels.items()
    ]
    socketio.emit('channels-list', channel_list)

if __name__ == '__main__':
    print(f'Walkie-Talkie Server (Python) running on http://localhost:{PORT}')
    print('Press Ctrl+C to stop the server')
    try:
        socketio.run(app, host='127.0.0.1', port=PORT, debug=False, allow_unsafe_werkzeug=True, log_output=True)
    except KeyboardInterrupt:
        print('\nServer stopped')


const express = require('express');
const http = require('http');
const path = require('path');
const Filter = require('bad-words');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Track users
const users = {}; // socket.id -> { name, room }
const nameToSocket = {}; // username -> socket.id

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

io.on('connection', (socket) => {
    console.log(`🔌 Connected: ${socket.id}`);

    socket.on('joinRoom', ({ name, roomName }) => {
        if (nameToSocket[name]) {
            socket.emit('name-taken', name);
            return;
        }

        users[socket.id] = { name, room: roomName };
        nameToSocket[name] = socket.id;
        socket.join(roomName);

        socket.emit('chatMessage', {
            username: '🤖 Bot',
            text: `Welcome ${name} to room ${roomName}`,
            system: true
        });

        socket.to(roomName).emit('chatMessage', {
            username: '🤖 Bot',
            text: `${name} has joined the room.`,
            system: true
        });

        updateRoomUserList(roomName);
    });

    socket.on('chatMessage', (msg, callback) => {
        const user = users[socket.id];
        if (!user) return;

        const filter = new Filter();
        const cleanMsg = filter.clean(msg);

        const payload = {
            username: user.name,
            text: cleanMsg
        };

        // Send to others
        socket.to(user.room).emit('chatMessage', payload);
        // Send back to sender (so their message appears too)
        socket.emit('chatMessage', payload);

        callback?.('✓ Delivered');
    });

    socket.on('typing', () => {
        const user = users[socket.id];
        if (user) {
            socket.to(user.room).emit('typing', `${user.name} is typing...`);
        }
    });

    socket.on('stop typing', () => {
        const user = users[socket.id];
        if (user) {
            socket.to(user.room).emit('stop typing');
        }
    });

    socket.on('image', ({ username, data }) => {
        const user = users[socket.id];
        if (user) {
            io.to(user.room).emit('image', { username, data });
        }
    });

    socket.on('private message', ({ to, message }) => {
        const toSocketId = nameToSocket[to];
        const fromUser = users[socket.id];

        if (toSocketId && fromUser) {
            io.to(toSocketId).emit('private message', {
                from: fromUser.name,
                message
            });

            socket.emit('private message', {
                from: `👤 To ${to}`,
                message
            });
        } else {
            socket.emit('private message', {
                from: '🤖 Bot',
                message: `User "${to}" not found.`
            });
        }
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            const { name, room } = user;

            socket.to(room).emit('chatMessage', {
                username: '🤖 Bot',
                text: `${name} has left the room.`,
                system: true
            });

            delete nameToSocket[name];
            delete users[socket.id];
            updateRoomUserList(room);
        }

        console.log(`❌ Disconnected: ${socket.id}`);
    });
});

// Utility to emit user list in room
function updateRoomUserList(room) {
    const usersInRoom = Object.values(users)
        .filter(user => user.room === room)
        .map(user => ({ name: user.name }));
    io.to(room).emit('room users', usersInRoom);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

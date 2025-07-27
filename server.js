const express = require('express');
const http = require('http');
const Filter = require('bad-words');
const path = require('path');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

const users = {};          // socket.id -> { name, room }
const nameToSocket = {};   // username -> socket.id

app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('joinRoom', ({ name, roomName }) => {
        if (nameToSocket[name]) {
            socket.emit('name-taken', name);
            return;
        }

        users[socket.id] = { name, room: roomName };
        nameToSocket[name] = socket.id;
        socket.join(roomName);

        // Welcome message to the new user
        socket.emit('chat message', { text: `Welcome ${name} to room ${roomName}`, system: true });

        // Notify others in the room
        socket.to(roomName).emit('chat message', {
            text: `${name} has joined the room.`,
            system: true
        });

        // Send updated user list to everyone in the room
        const usersInRoom = Object.values(users).filter(u => u.room === roomName);
        io.to(roomName).emit('room users', usersInRoom);
    });

    socket.on('chat message', (msg) => {
        const user = users[socket.id];
        if (!user) return;

        const filter = new Filter();
        const cleanText = filter.clean(msg.text);

        io.to(user.room).emit('chat message', {
            text: `${user.name}: ${cleanText}`
        });
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

    socket.on('image', (img) => {
        const user = users[socket.id];
        if (!user) return;

        io.to(user.room).emit('image', {
            username: user.name,
            data: img.data
        });
    });

    socket.on('private message', ({ to, message }) => {
        const fromUser = users[socket.id];
        const toSocket = nameToSocket[to];
        if (fromUser && toSocket) {
            io.to(toSocket).emit('private message', {
                from: fromUser.name,
                message
            });
        }
    });

    // WebRTC signaling handlers
    socket.on('call-user', ({ toUsername, offer, fromUsername }) => {
        const toSocket = nameToSocket[toUsername];
        if (toSocket) {
            io.to(toSocket).emit('call-made', { offer, fromUsername });
        }
    });

    socket.on('make-answer', ({ toUsername, answer, fromUsername }) => {
        const toSocket = nameToSocket[toUsername];
        if (toSocket) {
            io.to(toSocket).emit('answer-made', { answer, fromUsername });
        }
    });

    socket.on('ice-candidate', ({ toUsername, candidate, fromUsername }) => {
        const toSocket = nameToSocket[toUsername];
        if (toSocket) {
            io.to(toSocket).emit('ice-candidate', { candidate, fromUsername });
        }
    });

    
          // ==== NEW: forward hang‑up ====
            socket.on('hangup', ({ toUsername }) => {
                    const toSocket = nameToSocket[toUsername];
                   if (toSocket) {
                           io.to(toSocket).emit('hangup');
                        }
                });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            const room = user.room;

            // Notify others user left
            socket.to(room).emit('chat message', {
                text: `${user.name} has left the chat.`,
                system: true
            });

            // Update user list for room
            delete nameToSocket[user.name];
            delete users[socket.id];

            const usersInRoom = Object.values(users).filter(u => u.room === room);
            io.to(room).emit('room users', usersInRoom);
        }
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

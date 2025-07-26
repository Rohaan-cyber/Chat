const express = require('express');
const http = require('http');
const Filter = require('bad-words'); // ✅ Import bad-words
const path = require('path');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

const users = {}; // socket.id -> { name, room }
const nameToSocket = {}; // name -> socket.id

app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
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

        socket.emit('chat message', { text: `Welcome ${name} to room ${roomName}`, system: true });

        socket.to(roomName).emit('chat message', {
            text: `${name} has joined the room.`,
            system: true
        });

        socket.to(roomName).emit('user-joined', name); // ✅ Inform others about new user
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

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            const room = user.room;
            socket.to(room).emit('chat message', {
                text: `${user.name} has left the chat.`,
                system: true
            });
            socket.to(room).emit('user-left', user.name); // Optional for frontend to remove call buttons
            delete nameToSocket[user.name];
            delete users[socket.id];
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

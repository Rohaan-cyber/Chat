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
const {
    userJoin,
    getCurrentUser,
    userLeave,
    getRoomUsers
} = require('./utils/users');


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
    socket.on('chatMessage', (msg) => {
        const user = users[socket.id];

        if (user) {
            io.to(user.room).emit('chatMessage', {
                username: user.name,
                text: msg
            });
        }
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

    // image
    socket.on('image', ({ username, data }) => {
        const user = users[socket.id];
        if (user) {
            io.to(user.room).emit('image', { username, data });
        }
    });


    // private message
    socket.on('private message', ({ to, message }) => {
        const target = [...io.sockets.sockets.values()].find(s => s.username === to);
        if (target) {
            target.emit('private message', {
                from: socket.username,
                message
            });
        } else {
            socket.emit('private message', {
                from: '🤖 Bot',
                message: `User "${to}" not found.`
            });
        }
    });


    // WebRTC signaling handlers       

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
    socket.on('chatMessage', (msg) => {
        const user = getCurrentUser(socket.id); // ✅ THIS LINE IS CRUCIAL

        if (user) {
            io.to(user.room).emit('chatMessage', {
                username: user.username,
                text: msg
            });
        }
    });
});



const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const roomUsers = {};      // { roomName: [ { id, username } ] }
const userSockets = {};    // { username: socket.id }

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Profanity filter words list
const badWords = ['badword1', 'badword2', 'foo', 'bar', 'dog'];

function filterProfanity(msg) {
    let filteredMsg = msg;
    badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        filteredMsg = filteredMsg.replace(regex, '***');
    });
    return filteredMsg;
}

const jokes = [
    "Why did the scarecrow win an award? Because he was outstanding in his field!",
    "I told my wife she was drawing her eyebrows too high. She looked surprised.",
    "Why don’t scientists trust atoms? Because they make up everything!"
];

io.on('connection', (socket) => {
    let username = '';
    let room = '';

    socket.on('joinRoom', ({ name, roomName }) => {
        username = name;
        room = roomName;
        socket.join(room);

        userSockets[username] = socket.id;

        if (!roomUsers[room]) roomUsers[room] = [];
        roomUsers[room].push({ id: socket.id, username });

        socket.to(room).emit('chat message', {
            text: `${username} joined the room.`,
            system: true
        });

        io.to(room).emit('room users', roomUsers[room]);
    });

    socket.on('chat message', (msgObj) => {
        const text = msgObj.text;
        const cleanText = filterProfanity(text);

        // Handle /pm command
        if (cleanText.startsWith('/pm')) {
            const parts = cleanText.split(' ');
            const toUser = parts[1];
            const privateMsg = parts.slice(2).join(' ');

            const toSocketId = userSockets[toUser];
            if (toSocketId && io.sockets.sockets.get(toSocketId)) {
                io.to(toSocketId).emit('private message', {
                    from: username,
                    message: privateMsg
                });
                socket.emit('private message', {
                    from: `You → ${toUser}`,
                    message: privateMsg
                });
            } else {
                socket.emit('chat message', {
                    text: `Chatbot: User '${toUser}' not found.`,
                    system: true
                });
            }
            return;
        }

        // Other commands
        if (cleanText.startsWith('/')) {
            const command = cleanText.split(' ')[0].toLowerCase();
            if (command === '/help') {
                socket.emit('chat message', {
                    text: 'Chatbot: Commands → /help, /joke, /pm [user] [message]',
                    system: true
                });
            } else if (command === '/joke') {
                const joke = jokes[Math.floor(Math.random() * jokes.length)];
                socket.emit('chat message', {
                    text: `Chatbot: ${joke}`,
                    system: true
                });
            } else {
                socket.emit('chat message', {
                    text: 'Chatbot: Unknown command. Type /help for commands.',
                    system: true
                });
            }
            return;
        }

        // Normal message broadcast
        io.to(room).emit('chat message', {
            id: msgObj.id,
            text: `${username}: ${cleanText}`
        });
    });

    socket.on('image', (imgObj) => {
        io.to(room).emit('image', {
            id: imgObj.id,
            data: imgObj.data,
            username
        });
    });

    // Delivery/read status
    socket.on('message delivered', (msgId) => {
        socket.broadcast.to(room).emit('message delivered', {
            id: msgId,
            by: socket.id
        });
    });

    socket.on('message read', (msgId) => {
        socket.broadcast.to(room).emit('message read', {
            id: msgId,
            by: socket.id
        });
    });

    // Typing indicators
    socket.on('typing', () => {
        socket.to(room).emit('typing', `${username} is typing...`);
    });

    socket.on('stop typing', () => {
        socket.to(room).emit('stop typing');
    });

    // Support client-side UI PMs (not via /pm command)
    socket.on('private message', ({ toUsername, message }) => {
        const toSocketId = userSockets[toUsername];
        if (toSocketId && io.sockets.sockets.get(toSocketId)) {
            io.to(toSocketId).emit('private message', {
                from: username,
                message
            });
            socket.emit('private message', {
                from: `You → ${toUsername}`,
                message
            });
        } else {
            socket.emit('chat message', {
                text: `Chatbot: User "${toUsername}" is not available.`,
                system: true
            });
        }
    });

    // --- WebRTC signaling for 1:1 video call ---

    socket.on('call-user', ({ toUsername, offer, fromUsername }) => {
        const toSocketId = userSockets[toUsername];
        if (toSocketId) {
            io.to(toSocketId).emit('call-made', { offer, fromUsername });
        }
    });

    socket.on('make-answer', ({ toUsername, answer, fromUsername }) => {
        const toSocketId = userSockets[toUsername];
        if (toSocketId) {
            io.to(toSocketId).emit('answer-made', { answer, fromUsername });
        }
    });

    socket.on('ice-candidate', ({ toUsername, candidate, fromUsername }) => {
        const toSocketId = userSockets[toUsername];
        if (toSocketId) {
            io.to(toSocketId).emit('ice-candidate', { candidate, fromUsername });
        }
    });

    // --- End WebRTC signaling ---

    socket.on('disconnect', () => {
        if (username && room && roomUsers[room]) {
            roomUsers[room] = roomUsers[room].filter(user => user.id !== socket.id);
            delete userSockets[username];

            socket.to(room).emit('chat message', {
                text: `${username} left.`,
                system: true
            });

            io.to(room).emit('room users', roomUsers[room]);

            if (roomUsers[room].length === 0) {
                delete roomUsers[room];
            }
        }
    });
});

server.listen(3000, () => {
    console.log('✅ Server running → http://localhost:3000');
});

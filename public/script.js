window.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const $ = (id) => document.getElementById(id);

    const form = $('form');
    const messageInput = $('messageInput');
    const messages = $('messages');
    const imageBtn = $('imageBtn');
    const imageInput = $('imageInput');
    const userList = $('userList');

    let myName;
    let typing = false;
    let timeout;

    $('joinBtn').onclick = () => {
        myName = $('username').value.trim();
        const roomName = $('room').value.trim();

        if (!myName || !roomName) return alert('Enter both username and room');

        socket.emit('joinRoom', { name: myName, roomName });
        $('loginPage').style.display = 'none';
        $('chatPage').style.display = 'block';
    };

    // TYPING INDICATOR
    messageInput.addEventListener('input', () => {
        if (!typing) {
            typing = true;
            socket.emit('typing', myName);
        }
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            typing = false;
            socket.emit('stop typing', myName);
        }, 1000);
    });

    socket.on('typing', (username) => {
        if (username !== myName) {
            $('typingStatus').innerText = `${username} is typing...`;
        }
    });

    socket.on('stop typing', (username) => {
        if (username !== myName) {
            $('typingStatus').innerText = '';
        }
    });

    // IMAGE SENDING
    imageBtn.onclick = () => imageInput.click();

    imageInput.onchange = () => {
        const file = imageInput.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = () => {
            socket.emit('image', {
                username: myName,
                data: reader.result
            });
            appendMessage(myName, `<img src="${reader.result}" style="max-width: 200px; border-radius: 6px;">`, true, '✓ Delivered');
        };
        reader.readAsDataURL(file);
    };

    // TEXT MESSAGE SENDING
    form.onsubmit = (e) => {
        e.preventDefault();
        const msg = messageInput.value.trim();
        if (!msg) return;

        if (msg.startsWith('/')) {
            handleCommand(msg);
            messageInput.value = '';
        } else {
            socket.emit('chatMessage', msg, (status) => {
                appendMessage(myName, msg, true, status || '✓ Delivered');
                messageInput.value = '';
            });
        }
    };

    // RECEIVING MESSAGES
    socket.on('chatMessage', ({ username, text, status }) => {
        if (username !== myName) {
            appendMessage(username, text, false, status || '');
        }
    });

    socket.on('image', ({ username, data }) => {
        if (username !== myName) {
            appendMessage(username, `<img src="${data}" style="max-width: 200px; border-radius: 6px;">`, false);
        }
    });

    socket.on('private message', ({ from, message }) => {
        appendPrivateMessage(`👤 From ${from}`, message);
    });

    // USER LIST UPDATE
    socket.on('room users', (users) => {
        userList.innerHTML = '';
        users.forEach((u) => {
            if (u.name !== myName) {
                const div = document.createElement('div');
                div.className = 'user-entry';
                div.textContent = u.name;

                // Optional: Add 'Call' button placeholder
                // const btn = document.createElement('button');
                // btn.textContent = 'Call';
                // btn.onclick = () => startCall(u.name);
                // div.appendChild(btn);

                userList.appendChild(div);
            }
        });
    });

    // APPEND FUNCTIONS
    function appendMessage(username, text, isMine, status = '') {
        const li = document.createElement('li');
        li.className = 'chat-bubble';
        li.style.textAlign = isMine ? 'right' : 'left';

        li.innerHTML = `<strong>${username}:</strong><br>${text}` +
            (isMine && status ? `<div class="status">${status}</div>` : '');

        messages.appendChild(li);
        messages.scrollTop = messages.scrollHeight;
    }

    function appendBotMessage(text) {
        const li = document.createElement('li');
        li.innerHTML = `<strong>🤖 Bot:</strong> ${text}`;
        li.style.background = '#f1f1f1';
        messages.appendChild(li);
        messages.scrollTop = messages.scrollHeight;
    }

    function appendPrivateMessage(header, text) {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${header}:</strong><br>${text}`;
        li.style.background = '#e6f7ff';
        li.style.fontStyle = 'italic';
        li.style.textAlign = 'right';
        messages.appendChild(li);
        messages.scrollTop = messages.scrollHeight;
    }

    // COMMAND HANDLER
    function handleCommand(msg) {
        const [command, ...args] = msg.slice(1).split(' ');

        switch (command.toLowerCase()) {
            case 'help':
                appendBotMessage('Commands: /help, /joke, /time, /pm [user] [message]');
                break;
            case 'joke':
                const jokes = [
                    "Why did the bicycle fall over? It was two-tired.",
                    "I only know 25 letters of the alphabet. I don’t know y.",
                    "Why don't scientists trust atoms? Because they make up everything!"
                ];
                appendBotMessage(jokes[Math.floor(Math.random() * jokes.length)]);
                break;
            case 'time':
                appendBotMessage(`⏰ Current time: ${new Date().toLocaleTimeString()}`);
                break;
            case 'pm':
                const to = args[0];
                const message = args.slice(1).join(' ');
                if (!to || !message) {
                    appendBotMessage('Usage: /pm [username] [message]');
                    return;
                }
                socket.emit('private message', { to, message });
                appendPrivateMessage(`👤 To ${to}`, message);
                break;
            default:
                appendBotMessage(`Unknown command: /${command}`);
        }
    }
});

window.addEventListener('DOMContentLoaded', () => {
const socket = io();
const $ = (id) => document.getElementById(id);

    const config = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    // ==== UI Elements ====

    // messages
    const form = document.getElementById('form');
    const messageInput = document.getElementById('messageInput');
    const messages = document.getElementById('messages');
    const imageBtn = document.getElementById('imageBtn');
    const imageInput = document.getElementById('imageInput');

    // Click on 📷 opens file picker

    // Click on 📷 opens file picker
    imageBtn.onclick = () => {
        imageInput.click();
    };

    // When image is selected
    imageInput.onchange = () => {
        const file = imageInput.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = () => {
            socket.emit('image', {
                username: myName,  // <-- this is defined globally from your login
                data: reader.result
            });


        };
        reader.readAsDataURL(file);
    };;


    // Prevent form reload and send message to server
    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const message = messageInput.value.trim();
        if (!message) return;

        if (message.startsWith('/')) {
            handleCommand(message);
        } else {
            socket.emit('chatMessage', message);
        }

        messageInput.value = '';
    });

    // Listen for incoming chat messages from server
    socket.on('chatMessage', ({ username, text }) => {
        const item = document.createElement('li');
        item.innerHTML = `<strong>${username}:</strong> ${text}`;
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    });

  // image sharing
    socket.on('image', ({ username, data }) => {
        const div = document.createElement('div');
        div.classList.add('message');

        div.innerHTML = `
    <strong>${username}:</strong><br>
    <img src="${data}" alt="Shared image" style="max-width: 200px; border-radius: 6px; margin-top: 5px;">
`;

        document.getElementById('messages').appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    });




    // ==== Socket Events ====

    let myName;

    function appendBotMessage(text) {
        const item = document.createElement('li');
        item.innerHTML = `<strong>🤖 Bot:</strong> ${text}`;
        item.style.background = '#f1f1f1';
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }

    function appendPrivateMessage(header, text) {
        const item = document.createElement('li');
        item.innerHTML = `<strong>${header}:</strong> ${text}`;
        item.style.background = '#e6f7ff';
        item.style.fontStyle = 'italic';
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }


    function handleCommand(msg) {
        const [command, ...args] = msg.slice(1).split(' ');

        switch (command.toLowerCase()) {
            case 'help':
                appendBotMessage('Commands: /help, /joke,/time, /pm [user] [message]');
                break;

            case 'joke':
                const jokes = [
                    "Why did the bicycle fall over? It was two - tired.",
                    "I only know 25 letters of the alphabet. I don’t know y.",
                    "Why do scientists don't trust atoms? Because they make up everything"
                ];
                appendBotMessage(jokes[Math.floor(Math.random() * jokes.length)]);
                break;

            case 'pm':
                const to = args[0];
                const privateMsg = args.slice(1).join(' ');
                if (!to || !privateMsg) {
                    appendBotMessage('Usage: /pm [username] [message]');
                    return;
                }

                socket.emit('private message', { to, message: privateMsg });
                appendPrivateMessage(`👤 To ${to}`, privateMsg);
                break;

            case 'time':
                const now = new Date();
                const timeString = now.toLocaleTimeString();
                appendBotMessage(`⏰ Current time: ${timeString}`);
                break;

            default:
                appendBotMessage(`Unknown command: /${command}`);
        }
    }


    $('joinBtn').onclick = async () => {
        myName = $('username').value;
        const roomName = $('room').value;

        if (!myName || !roomName) return alert('Enter both username and room');

        socket.emit('joinRoom', { name: myName, roomName });
        $('loginPage').style.display = 'none';
        $('chatPage').style.display = 'block';
    };

    // ==== Chat User UI ====

    socket.on('room users', (users) => {
        users.forEach((u) => {
            if (u.name !== myName) {
                const div = document.createElement('div');
                div.className = 'user-entry';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = u.name + ' ';
     

                div.appendChild(nameSpan);
            }
        });
    });

    // ==== Hang up / Mute / Toggle Camera ====



})

const socket = io();
let myUsername = '';
let room = '';
let peerConnection;
let localStream;
let remoteStream;

const constraints = {
    video: true,
    audio: true
};

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

document.getElementById('joinBtn').onclick = () => {
    myUsername = document.getElementById('username').value;
    room = document.getElementById('room').value;
    if (!myUsername || !room) return alert('Username and room required');
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('chatPage').style.display = 'block';
    socket.emit('joinRoom', { name: myUsername, roomName: room });
};

document.getElementById('sendBtn').onclick = sendMessage;

document.getElementById('messageInput').addEventListener('keypress', (e) => {
    socket.emit('typing');
    if (e.key === 'Enter') {
        sendMessage();
        socket.emit('stop typing');
    }
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value;
    if (!text) return;
    const id = Date.now();
    socket.emit('chat message', { text, id });
    input.value = '';
}

socket.on('chat message', msg => {
    addMessage(msg.text, msg.system);
    if (msg.id) socket.emit('message delivered', msg.id);
});

socket.on('private message', msg => {
    addMessage(`(PM) ${msg.from}: ${msg.message}`, true);
});

socket.on('room users', users => {
    const list = document.getElementById('userList');
    list.innerHTML = '';
    users.forEach(u => {
        const li = document.createElement('li');
        li.textContent = u.username;
        list.appendChild(li);
    });
});

socket.on('typing', msg => {
    document.getElementById('typingStatus').innerText = msg;
});

socket.on('stop typing', () => {
    document.getElementById('typingStatus').innerText = '';
});

socket.on('message delivered', ({ id, by }) => {
    console.log(`Message ${id} delivered to ${by}`);
});

socket.on('message read', ({ id, by }) => {
    console.log(`Message ${id} read by ${by}`);
});

function addMessage(msg, system = false) {
    const list = document.getElementById('messages');
    const li = document.createElement('li');
    li.textContent = msg;
    li.style.fontStyle = system ? 'italic' : 'normal';
    list.appendChild(li);
}

document.getElementById('imageInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const id = Date.now();
        socket.emit('image', { data: reader.result, id });
    };
    reader.readAsDataURL(file);
};

socket.on('image', ({ data, username }) => {
    const img = document.createElement('img');
    img.src = data;
    img.style.maxWidth = '200px';
    const li = document.createElement('li');
    li.textContent = `${username}: `;
    li.appendChild(img);
    document.getElementById('messages').appendChild(li);
});

// --------- WebRTC 1:1 CALL -----------

document.getElementById('callBtn').onclick = async () => {
    const callee = prompt('Enter username to call:');
    if (!callee) return;

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById('localVideo').srcObject = localStream;

    peerConnection = new RTCPeerConnection(iceServers);
    peerConnection.onicecandidate = e => {
        if (e.candidate) {
            socket.emit('ice-candidate', {
                toUsername: callee,
                fromUsername: myUsername,
                candidate: e.candidate
            });
        }
    };
    peerConnection.ontrack = e => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            document.getElementById('remoteVideo').srcObject = remoteStream;
        }
        remoteStream.addTrack(e.track);
    };

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('call-user', {
        toUsername: callee,
        fromUsername: myUsername,
        offer
    });

    document.getElementById('callArea').style.display = 'block';
};

document.getElementById('acceptCallBtn').onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById('localVideo').srcObject = localStream;

    peerConnection = new RTCPeerConnection(iceServers);
    peerConnection.onicecandidate = e => {
        if (e.candidate) {
            socket.emit('ice-candidate', {
                toUsername: window.callerName,
                fromUsername: myUsername,
                candidate: e.candidate
            });
        }
    };
    peerConnection.ontrack = e => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            document.getElementById('remoteVideo').srcObject = remoteStream;
        }
        remoteStream.addTrack(e.track);
    };

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    await peerConnection.setRemoteDescription(window.offerFromCaller);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('make-answer', {
        toUsername: window.callerName,
        fromUsername: myUsername,
        answer
    });

    document.getElementById('callArea').style.display = 'block';
};

socket.on('call-made', async ({ offer, fromUsername }) => {
    window.offerFromCaller = new RTCSessionDescription(offer);
    window.callerName = fromUsername;

    const accept = confirm(`Incoming call from ${fromUsername}. Accept?`);
    if (accept) {
        document.getElementById('acceptCallBtn').style.display = 'block';
    }
});

socket.on('answer-made', async ({ answer }) => {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('ice-candidate', async ({ candidate }) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (e) {
        console.error('Error adding received ice candidate', e);
    }
});

document.getElementById('endCallBtn').onclick = () => {
    if (peerConnection) peerConnection.close();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('callArea').style.display = 'none';
};

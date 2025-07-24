const socket = io();

const loginPage = document.getElementById('loginPage');
const chatPage = document.getElementById('chatPage');
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typingIndicator');
const roomHeader = document.getElementById('roomHeader');
const imageInput = document.getElementById('imageInput');
const imageBtn = document.getElementById('imageBtn');
const userList = document.getElementById('userList');


let typingTimeout;
let typing = false;
let username = '';
let room = '';
let messageCounter = 0; // for unique msg IDs

document.getElementById('joinBtn').onclick = () => {
    username = document.getElementById('username').value.trim();
    room = document.getElementById('room').value.trim();
    if (username && room) {
        socket.emit('joinRoom', { name: username, roomName: room });
        loginPage.classList.add('hidden');
        chatPage.classList.remove('hidden');
        roomHeader.textContent = `Room: ${room}`;
    }
};

socket.on('room users', (users) => {
    userList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user.username;

        // Add private message click
        li.style.cursor = 'pointer';
        li.title = 'Click to send private message';
        li.onclick = () => {
            const privateMsg = prompt(`Private message to ${user.username}:`);
            if (privateMsg) {
                socket.emit('private message', {
                    toUsername: user.username,
                    fromUsername: username,
                    message: privateMsg
                });
            }
        };

        userList.appendChild(li);
    });
});

socket.on('private message', ({ from, message }) => {
    const item = document.createElement('li');
    item.innerHTML = `<strong>(Private from ${from}):</strong> ${message}`;
    item.style.backgroundColor = '#ffeeba';
    item.style.padding = '5px';
    item.style.borderRadius = '4px';
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});




function createMessageElement(msg, id, system = false) {
    const item = document.createElement('li');
    item.textContent = msg;
    if (system) {
        item.style.fontStyle = 'italic';
        item.style.color = '#888';
    }
    if (id) {
        item.dataset.id = id;
        // add delivery status span
        const statusSpan = document.createElement('span');
        statusSpan.className = 'status';
        statusSpan.textContent = ' (Sent)';
        item.appendChild(statusSpan);
    }
    return item;
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        const msgId = `msg_${Date.now()}_${messageCounter++}`;
        const text = input.value;
        const msgObj = { id: msgId, text };
        socket.emit('chat message', msgObj);
        addMessage(msgObj, true);
        input.value = '';
        socket.emit('stop typing');
        typing = false;
    }
});

input.addEventListener('input', () => {
    if (!typing) {
        socket.emit('typing');
        typing = true;
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop typing');
        typing = false;
    }, 1000);
});

function addMessage(msgObj, isOwn = false) {
    // msgObj: { id, text, system }
    const item = createMessageElement(msgObj.text, msgObj.id, msgObj.system);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;

    // Emit delivered for others' messages only
    if (!isOwn) {
        socket.emit('message delivered', msgObj.id);
    }
}

socket.on('chat message', (msgObj) => {
    // If system, or from others, add message
    if (!msgObj.system || msgObj.system) {
        // Don't add own sent message again
        if (msgObj.id && document.querySelector(`li[data-id="${msgObj.id}"]`)) return;
        addMessage(msgObj);
    }
});

socket.on('typing', (msg) => {
    typingIndicator.textContent = msg;
});

socket.on('stop typing', () => {
    typingIndicator.textContent = '';
});

// Image upload handlers

imageBtn.onclick = () => imageInput.click();

imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        const msgId = `img_${Date.now()}_${messageCounter++}`;
        socket.emit('image', { id: msgId, data: reader.result });
        addImage({ id: msgId, data: reader.result }, true);
    };
    reader.readAsDataURL(file);
    imageInput.value = '';
});

function addImage(imgObj, isOwn = false) {
    const item = document.createElement('li');
    item.dataset.id = imgObj.id;

    const caption = document.createElement('div');
    caption.textContent = isOwn ? 'You sent an image:' : 'Image:';
    caption.style.fontSize = '0.8em';
    caption.style.color = '#666';

    const img = document.createElement('img');
    img.src = imgObj.data;
    img.style.maxWidth = '200px';
    img.style.maxHeight = '200px';
    img.style.display = 'block';
    img.style.marginTop = '5px';

    // Add delivery status span
    const statusSpan = document.createElement('span');
    statusSpan.className = 'status';
    statusSpan.textContent = ' (Sent)';

    item.appendChild(caption);
    item.appendChild(img);
    item.appendChild(statusSpan);

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;

    if (!isOwn) {
        socket.emit('message delivered', imgObj.id);
    }
}

socket.on('image', (imgObj) => {
    if (document.querySelector(`li[data-id="${imgObj.id}"]`)) return; // avoid duplicate
    addImage(imgObj);
});

// Handle delivery/read status updates

socket.on('message delivered', ({ id }) => {
    updateMessageStatus(id, 'Delivered');
});

socket.on('message read', ({ id }) => {
    updateMessageStatus(id, 'Read');
});

// For simplicity, mark messages as read when added to DOM (could be improved)
function updateMessageStatus(msgId, status) {
    const item = document.querySelector(`li[data-id="${msgId}"]`);
    if (item) {
        const statusSpan = item.querySelector('.status');
        if (statusSpan) {
            statusSpan.textContent = ` (${status})`;
        }
    }
}

// Optional: Send read receipt when messages come into view (improvement)

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const videoCallContainer = document.getElementById('videoCallContainer');
const hangupBtn = document.getElementById('hangupBtn');

let localStream;
let peerConnection;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Update user list UI with call buttons
socket.on('room users', (users) => {
    userList.innerHTML = '';
    users.forEach(user => {
        if (user.username === username) return; // don't list yourself
        const li = document.createElement('li');
        li.textContent = user.username + ' ';

        const callBtn = document.createElement('button');
        callBtn.textContent = 'Call';
        callBtn.onclick = () => startCall(user.username);

        li.appendChild(callBtn);
        userList.appendChild(li);
    });
});

// Start local media stream
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        alert('Could not access camera/microphone: ' + err.message);
    }
}

// Start call with a user
async function startCall(toUsername) {
    if (!localStream) await startLocalStream();

    peerConnection = new RTCPeerConnection(config);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                toUsername,
                candidate: event.candidate,
                fromUsername: username
            });
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('call-user', { toUsername, offer, fromUsername: username });

    videoCallContainer.style.display = 'block';
}

// Handle incoming call offer
socket.on('call-made', async ({ offer, fromUsername }) => {
    if (!localStream) await startLocalStream();

    peerConnection = new RTCPeerConnection(config);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                toUsername: fromUsername,
                candidate: event.candidate,
                fromUsername: username
            });
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('make-answer', { toUsername: fromUsername, answer, fromUsername: username });

    videoCallContainer.style.display = 'block';
});

function showCallDuration() {
    callStartTime = Date.now();
    callDurationDiv.style.display = 'block';
    callTimerSpan.textContent = '00:00';

    callTimerInterval = setInterval(() => {
        const elapsed = Date.now() - callStartTime;
        const minutes = Math.floor(elapsed / 60000).toString().padStart(2, '0');
        const seconds = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
        callTimerSpan.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

function stopCallDuration() {
    clearInterval(callTimerInterval);
    callDurationDiv.style.display = 'none';
    callTimerSpan.textContent = '00:00';
}


// Handle answer from callee
socket.on('answer-made', async ({ answer }) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// Handle ICE candidates
socket.on('ice-candidate', async ({ candidate }) => {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
        console.error('Error adding received ice candidate', e);
    }
});

// Hang up call
hangupBtn.onclick = () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    videoCallContainer.style.display = 'none';
    remoteVideo.srcObject = null;
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        localVideo.srcObject = null;
    }

    stopCallDuration();

    incomingCaller = null;
    callAccepted = false;
    currentCallUser = null;
    incomingCallPrompt.style.display = 'none';
};



const muteAudioBtn = document.getElementById('muteAudioBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');

muteAudioBtn.onclick = () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    muteAudioBtn.textContent = audioTrack.enabled ? 'Mute Audio' : 'Unmute Audio';
};

toggleVideoBtn.onclick = () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    toggleVideoBtn.textContent = videoTrack.enabled ? 'Turn Camera Off' : 'Turn Camera On';
};

const incomingCallPrompt = document.getElementById('incomingCallPrompt');
const callerNameSpan = document.getElementById('callerName');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const declineCallBtn = document.getElementById('declineCallBtn');
const callDurationDiv = document.getElementById('callDuration');
const callTimerSpan = document.getElementById('callTimer');

let callTimerInterval;
let callStartTime;
let incomingCaller = null;
let callAccepted = false;
let currentCallUser = null;

socket.on('call-made', async ({ offer, fromUsername }) => {
    incomingCaller = fromUsername;
    callerNameSpan.textContent = fromUsername;
    incomingCallPrompt.style.display = 'block';

    // Wait for accept or decline before proceeding
});


acceptCallBtn.onclick = async () => {
    callAccepted = true;
    incomingCallPrompt.style.display = 'none';
    currentCallUser = incomingCaller;

    if (!localStream) await startLocalStream();

    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                toUsername: currentCallUser,
                candidate: event.candidate,
                fromUsername: username
            });
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('make-answer', { toUsername: currentCallUser, answer, fromUsername: username });

    showCallDuration();
    videoCallContainer.style.display = 'block';

    incomingCaller = null;
};

declineCallBtn.onclick = () => {
    incomingCallPrompt.style.display = 'none';
    socket.emit('chat message', { text: `Call from ${incomingCaller} declined.`, system: true });
    incomingCaller = null;
};

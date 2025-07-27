// public/script.js
window.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    let myName = '';
    let myRoom = '';
    let partnerName = '';
    let pc = null;
    let localStream = null;
    let remoteStream = null;
    let iceBuffer = [];

    const $ = id => document.getElementById(id);

    $('joinBtn').onclick = () => {
        myName = $('username').value.trim();
        myRoom = $('room').value.trim();
        if (!myName || !myRoom) return alert('Enter username & room name');

        $('loginPage').style.display = 'none';
        $('chatPage').style.display = 'flex';
        $('roomHeader').textContent = `Room: ${myRoom}`;

        socket.emit('joinRoom', { name: myName, roomName: myRoom });
    };

    $('form').addEventListener('submit', e => {
        e.preventDefault();
        const txt = $('messageInput').value.trim();
        if (!txt) return;
        socket.emit('chat message', { text: txt });
        $('messageInput').value = '';
    });

    $('messageInput').addEventListener('input', e => {
        socket.emit(e.target.value ? 'typing' : 'stop typing');
    });

    socket.on('chat message', msg => addMsg(msg.text, msg.system));
    socket.on('typing', t => $('typingStatus').innerText = t);
    socket.on('stop typing', () => $('typingStatus').innerText = '');

    const addMsg = (txt, system = false) => {
        const li = document.createElement('li');
        li.textContent = txt;
        li.style.fontStyle = system ? 'italic' : 'normal';
        $('messages').appendChild(li);
    };

    socket.on('room users', users => {
        const ul = $('userList');
        ul.innerHTML = '';
        users.forEach(({ name }) => {
            if (name === myName) return;
            const li = document.createElement('li');
            li.textContent = name + ' ';
            const btn = document.createElement('button');
            btn.textContent = 'Call';
            btn.onclick = () => startCall(name);
            li.appendChild(btn);
            ul.appendChild(li);
        });
    });

    $('imageBtn').onclick = () => $('imageInput').click();
    $('imageInput').onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => socket.emit('image', { data: r.result });
        r.readAsDataURL(file);
    };

    socket.on('image', ({ username, data }) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${username}:</strong><br><img src="${data}" style="max-width:200px;">`;
        $('messages').appendChild(li);
    });

    const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    const mediaConstraints = { video: true, audio: true };

    async function getLocalStream() {
        if (localStream) return localStream;
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        $('localVideo').srcObject = localStream;
        return localStream;
    }

    async function createPeerConnection() {
        pc = new RTCPeerConnection(rtcConfig);
        pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socket.emit('ice-candidate', {
                    toUsername: partnerName,
                    fromUsername: myName,
                    candidate
                });
            }
        };
        pc.ontrack = ({ streams }) => {
            $('remoteVideo').srcObject = streams[0];
        };

        const stream = await getLocalStream();
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }

    let callTimerInt = null;
    function startTimer() {
        const start = Date.now();
        $('callDuration').style.display = 'block';
        callTimerInt = setInterval(() => {
            const s = Math.floor((Date.now() - start) / 1000);
            $('callTimer').innerText = `${(s / 60 | 0).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
        }, 1000);
    }

    function cleanupCallUI() {
        $('callArea').style.display = 'none';
        $('incomingCallPrompt').style.display = 'none';
        $('acceptCallBtn').style.display = 'none';
        $('callTimer').innerText = '00:00';
        clearInterval(callTimerInt);
        $('callDuration').style.display = 'none';
        partnerName = null;
    }

    async function startCall(name) {
        partnerName = name;
        await createPeerConnection();

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('call-user', {
            toUsername: partnerName,
            fromUsername: myName,
            offer
        });

        $('callArea').style.display = 'block';
        startTimer();
    }

    socket.on('call-made', async ({ offer, fromUsername }) => {
        partnerName = fromUsername;
        window.pendingOffer = offer;
        $('callerName').innerText = fromUsername;
        $('incomingCallPrompt').style.display = 'block';
    });

    $('acceptCallBtn').onclick = async () => {
        $('incomingCallPrompt').style.display = 'none';
        await createPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(window.pendingOffer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('make-answer', {
            toUsername: partnerName,
            fromUsername: myName,
            answer
        });
        $('callArea').style.display = 'block';
        startTimer();
        iceBuffer.forEach(c => pc.addIceCandidate(c));
        iceBuffer = [];
    };

    $('declineCallBtn').onclick = () => {
        socket.emit('chat message', {
            text: `${myName} declined a call from ${partnerName}`,
            system: true
        });
        cleanupCallUI();
    };

    socket.on('answer-made', async ({ answer, fromUsername }) => {
        if (fromUsername !== partnerName || !pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        iceBuffer.forEach(c => pc.addIceCandidate(c));
        iceBuffer = [];
    });

    socket.on('ice-candidate', async ({ candidate, fromUsername }) => {
        if (fromUsername !== partnerName) return;
        if (pc && pc.remoteDescription) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error('Error adding ICE candidate', err);
            }
        } else {
            iceBuffer.push(new RTCIceCandidate(candidate));
        }
    });

    function endCall(sendSignal = true) {
        if (sendSignal && partnerName) {
            socket.emit('hangup', { toUsername: partnerName });
        }
        if (pc) pc.close();
        if (localStream) localStream.getTracks().forEach(t => t.stop());

        pc = localStream = remoteStream = null;
        cleanupCallUI();
    }

    $('hangupBtn').onclick = () => endCall(true);
    socket.on('hangup', () => endCall(false));

    $('muteAudioBtn').onclick = () => {
        if (!localStream) return;
        const t = localStream.getAudioTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        $('muteAudioBtn').textContent = t.enabled ? 'Mute Audio' : 'Unmute Audio';
    };

    $('toggleVideoBtn').onclick = () => {
        if (!localStream) return;
        const t = localStream.getVideoTracks()[0];
        if (!t) return;
        t.enabled = !t.enabled;
        $('toggleVideoBtn').textContent = t.enabled ? 'Turn Camera Off' : 'Turn Camera On';
    };
});

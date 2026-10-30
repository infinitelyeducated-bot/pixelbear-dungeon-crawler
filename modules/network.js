import { SIGNALING_SERVER_URL } from './config.js';

export class NetworkManager extends EventTarget {
    constructor(iceServers = null) {
        super();
        this.mode = null; // 'host' | 'client'
        this.peerId = null;
        this.hostId = null;
        this.connections = new Map(); // peerId -> { pc, channel, assignedMemberId }
        this.socket = null;
        this.pendingCandidates = [];
        this.isHost = false;
        this.localMemberId = null; // The party member this peer controls
        this.iceServers = iceServers;
        this.reconnectTimer = null;
        this.signalingUrl = null;
    }

    async startHost(signalingUrl = SIGNALING_SERVER_URL) {
        this.mode = 'host';
        this.isHost = true;
        this.signalingUrl = signalingUrl;
        this.peerId = generatePeerId();
        await this.connectSignaling(signalingUrl, this.peerId);
        this.dispatchEvent(new CustomEvent('status', { detail: `Hosting as ${this.peerId}. Waiting for peers...` }));
        return this.peerId;
    }

    async joinHost(hostId, signalingUrl = SIGNALING_SERVER_URL) {
        this.mode = 'client';
        this.isHost = false;
        this.hostId = hostId;
        this.signalingUrl = signalingUrl;
        this.peerId = generatePeerId();
        await this.connectSignaling(signalingUrl, this.peerId);
        this.sendSignal({ type: 'join', target: hostId, sender: this.peerId });
        this.dispatchEvent(new CustomEvent('status', { detail: `Connecting to ${hostId}...` }));
    }

    connectSignaling(url, peerId) {
        return new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(`${url}?peer=${peerId}`);
                this.socket.onopen = () => resolve();
                this.socket.onerror = () => reject(new Error('Signaling server connection failed.'));
                this.socket.onmessage = event => this.handleSignalingMessage(JSON.parse(event.data));
                this.socket.onclose = () => this.dispatchEvent(new CustomEvent('status', { detail: 'Signaling server disconnected.' }));
            } catch (error) {
                reject(error);
            }
        });
    }

    handleSignalingMessage(message) {
        if (message.type === 'join' && this.isHost) {
            this.acceptPeer(message.sender);
            return;
        }
        if (message.type === 'offer') {
            this.handleOffer(message.sender, message.sdp);
            return;
        }
        if (message.type === 'answer') {
            this.handleAnswer(message.sender, message.sdp);
            return;
        }
        if (message.type === 'candidate') {
            this.handleCandidate(message.sender, message.candidate);
        }
    }

    async acceptPeer(peerId) {
        const pc = this.createPeerConnection(peerId);
        const channel = pc.createDataChannel('game', { ordered: true });
        this.wrapChannel(peerId, channel);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.sendSignal({ type: 'offer', target: peerId, sender: this.peerId, sdp: offer });
    }

    async handleOffer(peerId, sdp) {
        const pc = this.createPeerConnection(peerId);
        pc.ondatachannel = event => this.wrapChannel(peerId, event.channel);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal({ type: 'answer', target: peerId, sender: this.peerId, sdp: answer });
    }

    async handleAnswer(peerId, sdp) {
        const pc = this.connections.get(peerId)?.pc;
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }

    async handleCandidate(peerId, candidate) {
        const pc = this.connections.get(peerId)?.pc;
        if (!pc) return;
        if (!pc.remoteDescription) {
            this.pendingCandidates.push({ peerId, candidate });
            return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }

    createPeerConnection(peerId) {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        pc.onicecandidate = event => {
            if (event.candidate) {
                this.sendSignal({ type: 'candidate', target: peerId, sender: this.peerId, candidate: event.candidate });
            }
        };
        this.connections.set(peerId, { pc, channel: null });
        return pc;
    }

    wrapChannel(peerId, channel) {
        const connection = this.connections.get(peerId);
        if (connection) connection.channel = channel;
        channel.onopen = () => {
            this.dispatchEvent(new CustomEvent('peerConnected', { detail: { peerId, channel } }));
            this.dispatchEvent(new CustomEvent('status', { detail: `Peer ${peerId} connected.` }));
        };
        channel.onclose = () => {
            this.dispatchEvent(new CustomEvent('peerDisconnected', { detail: { peerId } }));
            this.connections.delete(peerId);
        };
        channel.onmessage = event => {
            this.dispatchEvent(new CustomEvent('message', { detail: { peerId, data: JSON.parse(event.data) } }));
        };
    }

    assignMember(peerId, memberId) {
        const connection = this.connections.get(peerId);
        if (connection) connection.assignedMemberId = memberId;
    }

    getAssignedMemberId(peerId) {
        return this.connections.get(peerId)?.assignedMemberId ?? null;
    }

    setLocalMemberId(memberId) {
        this.localMemberId = memberId;
    }

    sendSignal(payload) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(payload));
        }
    }

    broadcast(data) {
        const payload = JSON.stringify(data);
        for (const { channel } of this.connections.values()) {
            if (channel && channel.readyState === 'open') channel.send(payload);
        }
    }

    sendTo(peerId, data) {
        const channel = this.connections.get(peerId)?.channel;
        if (channel && channel.readyState === 'open') channel.send(JSON.stringify(data));
    }

    close() {
        for (const { pc } of this.connections.values()) pc.close();
        this.connections.clear();
        if (this.socket) this.socket.close();
        this.mode = null;
    }
}

function generatePeerId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

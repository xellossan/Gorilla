// WebRTC Multiplayer and Voice Chat using PeerJS
class NetworkManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.mediaCall = null;
    this.localStream = null;
    this.isHost = false;
    this.myPeerId = null;
    this.remotePeerId = null;
    this.isMuted = false;

    this.onMatchStart = null;
    this.onTurnSync = null;
    this.onTimerTick = null;
    this.onBananaThrow = null;
    this.onObstacleDestroy = null;
    this.onPlayerTransform = null;
    this.onScoreUpdate = null;
    this.onRestart = null;
    this.onTurnChangeRequest = null;
  }

  async setupLocalMicrophone() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      console.log("Local audio microphone acquired");
      return true;
    } catch (err) {
      console.warn("Could not obtain microphone permissions:", err);
      return false;
    }
  }

  toggleMicrophone() {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.isMuted = !this.isMuted;
        audioTracks[0].enabled = !this.isMuted;
        return !this.isMuted;
      }
    }
    return false;
  }

  formatRoomId(rawName) {
    const clean = (rawName || 'Xellossan').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    return 'VRGORILLAS-' + (clean || 'Xellossan').toUpperCase();
  }

  initHost(rawRoomName, settings, onReady, onError) {
    this.isHost = true;
    const roomId = this.formatRoomId(rawRoomName);
    this.peer = new Peer(roomId);

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      onReady(rawRoomName || 'Xellossan');
    });

    this.peer.on('connection', (connection) => {
      this.conn = connection;
      this.setupDataConnection();

      this.conn.on('open', () => {
        this.send({
          type: 'INIT_MATCH',
          settings: settings,
          hostPlayerId: 1
        });
        if (this.onMatchStart) this.onMatchStart(1, settings);
      });
    });

    this.peer.on('call', (call) => {
      if (this.localStream) {
        call.answer(this.localStream);
      } else {
        call.answer();
      }
      this.mediaCall = call;
      call.on('stream', (remoteStream) => {
        const audioEl = document.getElementById('remote-audio');
        if (audioEl) audioEl.srcObject = remoteStream;
      });
    });

    this.peer.on('error', (err) => {
      console.error("PeerJS error:", err);
      if (onError) onError(err);
    });
  }

  initJoin(rawRoomName, onSuccess, onError) {
    this.isHost = false;
    const hostRoomId = this.formatRoomId(rawRoomName);
    this.peer = new Peer();

    this.peer.on('open', async (id) => {
      this.myPeerId = id;
      this.remotePeerId = hostRoomId;

      this.conn = this.peer.connect(hostRoomId);
      this.setupDataConnection();

      this.conn.on('open', async () => {
        if (onSuccess) onSuccess();

        if (this.localStream) {
          const call = this.peer.call(hostRoomId, this.localStream);
          this.mediaCall = call;
          call.on('stream', (remoteStream) => {
            const audioEl = document.getElementById('remote-audio');
            if (audioEl) audioEl.srcObject = remoteStream;
          });
        }
      });
    });

    this.peer.on('error', (err) => {
      console.error("Peer join error:", err);
      if (onError) onError(err);
    });
  }

  setupDataConnection() {
    this.conn.on('data', (data) => {
      this.handleIncomingData(data);
    });

    this.conn.on('close', () => {
      console.warn("Peer connection closed");
    });
  }

  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  }

  handleIncomingData(data) {
    switch (data.type) {
      case 'INIT_MATCH':
        if (this.onMatchStart) this.onMatchStart(2, data.settings);
        break;
      case 'PLAYER_TRANSFORM':
        if (this.onPlayerTransform) this.onPlayerTransform(data);
        break;
      case 'BANANA_THROW':
        if (this.onBananaThrow) this.onBananaThrow(data);
        break;
      case 'OBSTACLE_DESTROY':
        if (this.onObstacleDestroy) this.onObstacleDestroy(data.obstacleId);
        break;
      case 'TURN_SYNC':
        if (this.onTurnSync) this.onTurnSync(data);
        break;
      case 'TIMER_TICK':
        if (this.onTimerTick) this.onTimerTick(data.timeRemaining);
        break;
      case 'REQUEST_TURN_PASS':
        if (this.onTurnChangeRequest) this.onTurnChangeRequest();
        break;
      case 'SCORE_UPDATE':
        if (this.onScoreUpdate) this.onScoreUpdate(data.scores);
        break;
      case 'RESTART_GAME':
        if (this.onRestart) this.onRestart();
        break;
    }
  }
}

window.networkManager = new NetworkManager();

// Neighborhood 1v1 Blaster Arena (VR & Desktop Crossplay)
let peer = null;
let dataConn = null;
let mediaConn = null;
let localStream = null;

let isHost = false;
let myPlayerName = 'Shooter1';
let oppPlayerName = 'Opponent';
let roomPrefix = 'neighborhood_blaster_';
let isOpponentConnected = false;

// Score Tracking
let myScore = 0;
let oppScore = 0;

// Web Audio API Synthesizer (Zero asset dependencies, instant low-latency audio)
let audioCtx = null;
function initAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playLaserSound() {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    const now = audioCtx.currentTime;
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  } catch (e) {
    console.warn(e);
  }
}

function playExplosionSound() {
  if (!audioCtx) return;
  try {
    const bufferSize = audioCtx.sampleRate * 0.35;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    const now = audioCtx.currentTime;
    filter.frequency.setValueAtTime(650, now);
    filter.frequency.linearRampToValueAtTime(80, now + 0.35);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.35);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    whiteNoise.start(now);
    whiteNoise.stop(now + 0.35);
  } catch (e) {
    console.warn(e);
  }
}

function playHitSound() {
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    // High-pitched bell/chime confirmation
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1046.5, now); // C6
    osc1.frequency.setValueAtTime(1318.5, now + 0.08); // E6
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.linearRampToValueAtTime(0.01, now + 0.28);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.28);
  } catch (e) {
    console.warn(e);
  }
}

// -------------------------------------------------------------
// Unified Movement Component (Preserves desktop & Quest polarities)
// -------------------------------------------------------------
AFRAME.registerComponent('unified-movement', {
  init: function () {
    this.rig = this.el;
    this.head = document.getElementById('player-head');
    this.speed = 8.5;
    this.turnSpeed = 105;

    this.leftStick = { x: 0, y: 0 };
    this.rightStick = { x: 0, y: 0 };

    this.keys = {};
    const handleKey = (code, key, state) => {
      if (code) this.keys[code.toLowerCase()] = state;
      if (key) this.keys[key.toLowerCase()] = state;
    };

    window.addEventListener('keydown', (e) => handleKey(e.code, e.key, true));
    window.addEventListener('keyup', (e) => handleKey(e.code, e.key, false));

    const leftHand = document.getElementById('left-hand');
    if (leftHand) {
      leftHand.addEventListener('axismove', (evt) => {
        const axis = evt.detail.axis;
        if (axis && axis.length >= 2) {
          this.leftStick.x = (Math.abs(axis[0]) > 0.08) ? axis[0] : 0;
          this.leftStick.y = (Math.abs(axis[1]) > 0.08) ? axis[1] : 0;
        }
      });
      leftHand.addEventListener('thumbstickmoved', (evt) => {
        if (evt.detail.x !== undefined && evt.detail.y !== undefined) {
          this.leftStick.x = (Math.abs(evt.detail.x) > 0.08) ? evt.detail.x : 0;
          this.leftStick.y = (Math.abs(evt.detail.y) > 0.08) ? evt.detail.y : 0;
        }
      });
    }

    const rightHand = document.getElementById('right-hand');
    if (rightHand) {
      rightHand.addEventListener('axismove', (evt) => {
        const axis = evt.detail.axis;
        if (axis && axis.length >= 2) {
          this.rightStick.x = (Math.abs(axis[0]) > 0.08) ? axis[0] : 0;
          this.rightStick.y = (Math.abs(axis[1]) > 0.08) ? axis[1] : 0;
        }
      });
      rightHand.addEventListener('thumbstickmoved', (evt) => {
        if (evt.detail.x !== undefined) {
          this.rightStick.x = (Math.abs(evt.detail.x) > 0.08) ? evt.detail.x : 0;
        }
      });
    }
  },

  tick: function (time, deltaTime) {
    const dt = Math.min((deltaTime || 16) / 1000, 0.1);
    if (!this.head) return;

    let moveX = 0;
    let moveZ = 0;

    // Preserved directional mappings
    if (this.keys['keyw'] || this.keys['w'] || this.keys['arrowup']) moveZ -= 1;
    if (this.keys['keys'] || this.keys['s'] || this.keys['arrowdown']) moveZ += 1;
    if (this.keys['keya'] || this.keys['a'] || this.keys['arrowleft']) moveX -= 1;
    if (this.keys['keyd'] || this.keys['d'] || this.keys['arrowright']) moveX += 1;

    const scene = this.el.sceneEl;
    let lStickX = this.leftStick.x;
    let lStickY = this.leftStick.y;
    let rStickX = this.rightStick.x;

    if (scene.is('vr-mode') && lStickX === 0 && lStickY === 0 && rStickX === 0) {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (!gp || !gp.axes) continue;
        const idLower = (gp.id || '').toLowerCase();
        const isLeft = gp.hand === 'left' || idLower.includes('left');
        const isRight = gp.hand === 'right' || idLower.includes('right');

        if (isLeft && gp.axes.length >= 2) {
          const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0];
          const ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1];
          if (Math.abs(ax) > 0.08) lStickX = ax;
          if (Math.abs(ay) > 0.08) lStickY = ay;
        }

        if (isRight && gp.axes.length >= 2) {
          const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0];
          if (Math.abs(ax) > 0.08) rStickX = ax;
        }
      }
    }

    if (lStickX !== 0 || lStickY !== 0) {
      moveX += lStickX;
      moveZ += lStickY;
    }

    // Smooth Right-Stick View Rotation
    if (Math.abs(rStickX) > 0.08) {
      const rotYDelta = -rStickX * this.turnSpeed * dt;
      this.rig.object3D.rotation.y += (rotYDelta * Math.PI) / 180;
    }

    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.hypot(moveX, moveZ);
      if (len > 1.0) {
        moveX /= len;
        moveZ /= len;
      }

      const headObj = this.head.object3D;
      const lookDir = new THREE.Vector3();
      headObj.getWorldDirection(lookDir);

      const forward = new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const moveVec = new THREE.Vector3()
        .addScaledVector(forward, moveZ * this.speed * dt)
        .addScaledVector(right, moveX * this.speed * dt);

      const rigObj = this.rig.object3D;
      rigObj.position.x = Math.max(-33, Math.min(33, rigObj.position.x + moveVec.x));
      rigObj.position.z = Math.max(-33, Math.min(33, rigObj.position.z + moveVec.z));
    }
  }
});

// Microphone mute toggle
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        const micElem = document.getElementById('mic-status');
        if (micElem) {
          micElem.innerText = track.enabled ? '🎙️ Mic Active' : '🔇 Mic Muted';
        }
      }
    }
  }
});

// -------------------------------------------------------------
// WebRTC Direct P2P Room Connection (PeerJS) & Voice Chat
// -------------------------------------------------------------
async function setupAudio() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const micElem = document.getElementById('mic-status');
    if (micElem) micElem.innerText = '🎙️ Mic Active';
  } catch (err) {
    console.warn('Microphone unavailable or blocked:', err);
    const micElem = document.getElementById('mic-status');
    if (micElem) micElem.innerText = '🎙️ Mic Off (No Device)';
  }
}

function initP2PRoom(cleanRoomName) {
  const hostPeerId = `${roomPrefix}${cleanRoomName}_host`;
  const guestPeerId = `${roomPrefix}${cleanRoomName}_guest_${Math.floor(Math.random() * 10000)}`;

  peer = new Peer(hostPeerId);

  peer.on('open', () => {
    isHost = true;
    document.getElementById('status-display').innerText = `Created Room! Waiting for Opponent...`;

    const rig = document.getElementById('player-rig');
    rig.object3D.position.set(0, 0, 22);
    document.getElementById('player-head').setAttribute('rotation', { x: 0, y: 180, z: 0 });

    peer.on('connection', (conn) => {
      dataConn = conn;
      setupDataHandlers();
    });

    peer.on('call', (call) => {
      mediaConn = call;
      call.answer(localStream || undefined);
      call.on('stream', handleRemoteStream);
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      peer.destroy();
      connectAsGuest(hostPeerId, guestPeerId);
    } else {
      console.error('PeerJS error:', err);
    }
  });
}

function connectAsGuest(hostPeerId, guestPeerId) {
  isHost = false;
  peer = new Peer(guestPeerId);

  peer.on('open', () => {
    document.getElementById('status-display').innerText = `Connecting to Opponent...`;

    const rig = document.getElementById('player-rig');
    rig.object3D.position.set(0, 0, -22);
    document.getElementById('player-head').setAttribute('rotation', { x: 0, y: 0, z: 0 });

    dataConn = peer.connect(hostPeerId, { reliable: true });
    setupDataHandlers();

    if (localStream) {
      mediaConn = peer.call(hostPeerId, localStream);
      mediaConn.on('stream', handleRemoteStream);
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream || undefined);
    call.on('stream', handleRemoteStream);
  });
}

function handleRemoteStream(remoteStream) {
  let audioEl = document.getElementById('remote-audio');
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.id = 'remote-audio';
    audioEl.autoplay = true;
    document.body.appendChild(audioEl);
  }
  audioEl.srcObject = remoteStream;
}

// -------------------------------------------------------------
// Score Updating (HUD & In-World 3D Billboard)
// -------------------------------------------------------------
function updateScoreboard() {
  const myEl = document.getElementById('my-score');
  const oppEl = document.getElementById('opp-score');
  if (myEl) myEl.innerText = myScore;
  if (oppEl) oppEl.innerText = oppScore;

  // In-world VR scoreboard text
  const vrP1 = document.getElementById('vr-score-p1');
  const vrP2 = document.getElementById('vr-score-p2');
  const vrStatus = document.getElementById('vr-score-status');

  if (vrP1) vrP1.setAttribute('value', `${myPlayerName}: ${myScore}`);
  if (vrP2) vrP2.setAttribute('value', `${oppPlayerName}: ${oppScore}`);

  if (vrStatus) {
    if (myScore > oppScore) {
      vrStatus.setAttribute('value', `${myPlayerName} IS LEADING! 🔥`);
      vrStatus.setAttribute('color', '#00cec9');
    } else if (oppScore > myScore) {
      vrStatus.setAttribute('value', `${oppPlayerName} IS LEADING! ⚠️`);
      vrStatus.setAttribute('color', '#ff7675');
    } else {
      vrStatus.setAttribute('value', 'TIED MATCH - SHOOT TO SCORE!');
      vrStatus.setAttribute('color', '#f1c40f');
    }
  }

  // Floating opponent name/score tag
  const oppScoreTag = document.getElementById('remote-scoretag');
  if (oppScoreTag) {
    oppScoreTag.setAttribute('value', `Hits Taken: ${myScore}`);
  }
}

function triggerHitEffect() {
  playHitSound();
  const banner = document.getElementById('hit-notification');
  if (banner) {
    banner.classList.remove('hidden');
    banner.classList.add('pop-in');
    setTimeout(() => {
      banner.classList.remove('pop-in');
      banner.classList.add('hidden');
    }, 1200);
  }
}

function onGotHitByOpponent() {
  playExplosionSound();
  oppScore++;
  updateScoreboard();

  // Screen / VR camera flash red
  const flash = document.getElementById('damage-flash');
  if (flash) {
    flash.classList.remove('hidden');
    flash.style.opacity = '0.7';
    setTimeout(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.classList.add('hidden'), 300);
    }, 150);
  }
}

// -------------------------------------------------------------
// Network Transform Sync & Data Channels
// -------------------------------------------------------------
let targetPos = new THREE.Vector3(0, 0, -20);
let targetRotY = 0;
let walkCycle = 0;

function setupDataHandlers() {
  dataConn.on('open', () => {
    isOpponentConnected = true;
    const opp = document.getElementById('remote-player');
    opp.setAttribute('visible', true);
    document.getElementById('status-display').innerText = 'Connected! In Neighborhood together.';

    dataConn.send({
      type: 'handshake',
      name: myPlayerName,
      score: myScore
    });
  });

  dataConn.on('data', (data) => {
    if (data.type === 'handshake') {
      oppPlayerName = data.name || 'Opponent';
      document.getElementById('remote-nametag').setAttribute('value', oppPlayerName);
      document.getElementById('opp-display-name').innerText = oppPlayerName;
      document.getElementById('status-display').innerText = `Dueling with: ${oppPlayerName}`;
      const opp = document.getElementById('remote-player');
      opp.setAttribute('visible', true);
      updateScoreboard();
    } else if (data.type === 'transform') {
      targetPos.set(data.pos.x, data.pos.y, data.pos.z);
      if (data.rot) {
        targetRotY = data.rot.y;
      }
    } else if (data.type === 'remote_shoot') {
      // Spawn white projectile from remote player's gun position & trajectory
      const blasterComp = document.querySelector('a-scene').components['blaster-manager'];
      if (blasterComp) {
        blasterComp.spawnRemoteProjectile(data.origin, data.dir);
      }
    } else if (data.type === 'i_got_hit') {
      // The other player acknowledges that my ball hit them!
      myScore++;
      updateScoreboard();
      triggerHitEffect();
    } else if (data.type === 'you_got_hit') {
      // The opponent registered that they shot me
      onGotHitByOpponent();
    }
  });

  dataConn.on('close', () => {
    isOpponentConnected = false;
    document.getElementById('remote-player').setAttribute('visible', false);
    document.getElementById('opp-display-name').innerText = 'Disconnected';
    document.getElementById('status-display').innerText = 'Opponent disconnected.';
  });
}

// -------------------------------------------------------------
// BLASTER MANAGER: White Balls, Gun Firing, Collisions & Explosions
// -------------------------------------------------------------
AFRAME.registerComponent('blaster-manager', {
  init: function () {
    this.projectiles = []; // Active balls { el, vel, life, isLocal }
    this.effectsContainer = document.getElementById('effects-container');
    this.projContainer = document.getElementById('projectiles-container');
    this.rightHand = document.getElementById('right-hand');
    this.playerHead = document.getElementById('player-head');
    this.remotePlayer = document.getElementById('remote-player');
    this.desktopGun = document.getElementById('desktop-gun');

    this.ballSpeed = 38; // Meters per second
    this.lastShootTime = 0;
    this.shootCooldown = 280; // Milliseconds between shots

    // Desktop shooting listeners
    window.addEventListener('mousedown', (e) => {
      // Don't fire if clicking lobby inputs
      if (document.getElementById('lobby-ui') && !document.getElementById('lobby-ui').classList.contains('hidden')) return;
      if (e.button === 0) {
        this.tryFire();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (document.getElementById('lobby-ui') && !document.getElementById('lobby-ui').classList.contains('hidden')) return;
      if (e.code === 'Space' || e.key === ' ' || e.code === 'KeyF') {
        this.tryFire();
      }
    });

    // VR Oculus Touch Right Hand Trigger Listeners
    if (this.rightHand) {
      this.rightHand.addEventListener('triggerdown', () => this.tryFire());
      this.rightHand.addEventListener('gripdown', () => this.tryFire());
      this.rightHand.addEventListener('selectstart', () => this.tryFire());
    }

    // Cache obstacle bounds
    this.obstacleBoxes = [];
    this.setupObstacleColliders();
  },

  setupObstacleColliders: function () {
    // Collect bounding boxes of all obstacles in the scene
    setTimeout(() => {
      const obstacles = document.querySelectorAll('.obstacle, .solid-obstacle');
      this.obstacleBoxes = [];
      obstacles.forEach(el => {
        if (el.object3D) {
          const box = new THREE.Box3().setFromObject(el.object3D);
          this.obstacleBoxes.push(box);
        }
      });
    }, 1200);
  },

  tryFire: function () {
    const now = performance.now();
    if (now - this.lastShootTime < this.shootCooldown) return;
    this.lastShootTime = now;

    initAudioContext();
    playLaserSound();

    const scene = this.el;
    const isVR = scene.is('vr-mode');

    let origin = new THREE.Vector3();
    let direction = new THREE.Vector3();

    if (isVR && this.rightHand && this.rightHand.object3D) {
      // Gun fires from right VR hand controller forward along controller orientation
      const rightObj = this.rightHand.object3D;
      const muzzle = document.getElementById('vr-gun-muzzle');
      if (muzzle && muzzle.object3D) {
        muzzle.object3D.getWorldPosition(origin);
      } else {
        rightObj.getWorldPosition(origin);
      }
      
      // Controller points in local -Z direction
      const rotMatrix = new THREE.Matrix4();
      rotMatrix.extractRotation(rightObj.matrixWorld);
      direction.set(0, 0, -1).applyMatrix4(rotMatrix).normalize();
    } else {
      // Desktop: Fire from player head / camera view direction
      const headObj = this.playerHead.object3D;
      headObj.getWorldPosition(origin);
      headObj.getWorldDirection(direction);
      // Offset slightly forward & down to align with desktop gun barrel
      origin.addScaledVector(direction, 0.4);
      origin.y -= 0.12;
    }

    // Spawn local white ball projectile
    this.createProjectile(origin, direction, true);

    // Network Sync: notify opponent about the fired ball
    if (dataConn && dataConn.open) {
      dataConn.send({
        type: 'remote_shoot',
        origin: { x: origin.x, y: origin.y, z: origin.z },
        dir: { x: direction.x, y: direction.y, z: direction.z }
      });
    }

    // Recoil animation on desktop gun
    if (this.desktopGun && this.desktopGun.object3D) {
      this.desktopGun.object3D.position.z = -0.48;
      setTimeout(() => {
        if (this.desktopGun && this.desktopGun.object3D) {
          this.desktopGun.object3D.position.z = -0.6;
        }
      }, 70);
    }
  },

  spawnRemoteProjectile: function (originData, dirData) {
    const origin = new THREE.Vector3(originData.x, originData.y, originData.z);
    const direction = new THREE.Vector3(dirData.x, dirData.y, dirData.z).normalize();
    playLaserSound();
    this.createProjectile(origin, direction, false);
  },

  createProjectile: function (origin, direction, isLocal) {
    const ball = document.createElement('a-sphere');
    ball.setAttribute('radius', '0.18');
    ball.setAttribute('color', '#ffffff');
    ball.setAttribute('material', 'emissive: #ffffff; emissiveIntensity: 2.2; roughness: 0.1');

    // Add a trailing glow inner core
    const core = document.createElement('a-sphere');
    core.setAttribute('radius', '0.1');
    core.setAttribute('color', '#93c5fd');
    core.setAttribute('material', 'emissive: #93c5fd; emissiveIntensity: 3.0');
    ball.appendChild(core);

    ball.setAttribute('position', `${origin.x} ${origin.y} ${origin.z}`);
    this.projContainer.appendChild(ball);

    const vel = direction.clone().multiplyScalar(this.ballSpeed);

    this.projectiles.push({
      el: ball,
      pos: origin.clone(),
      vel: vel,
      life: 2.8, // Seconds before expiring
      isLocal: isLocal
    });
  },

  tick: function (time, deltaTime) {
    const dt = Math.min((deltaTime || 16) / 1000, 0.1);

    // Fetch opponent's live position for hit detection
    let oppHeadPos = null;
    if (isOpponentConnected && this.remotePlayer && this.remotePlayer.getAttribute('visible')) {
      oppHeadPos = new THREE.Vector3();
      this.remotePlayer.object3D.getWorldPosition(oppHeadPos);
      oppHeadPos.y += 1.0; // Center around chest/head height
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;

      // Update position
      const moveStep = p.vel.clone().multiplyScalar(dt);
      p.pos.add(moveStep);
      p.el.setAttribute('position', `${p.pos.x} ${p.pos.y} ${p.pos.z}`);

      let exploded = false;
      let hitOpponent = false;

      // Check hit against remote opponent (radius ~0.85m)
      if (p.isLocal && oppHeadPos && p.pos.distanceTo(oppHeadPos) < 1.0) {
        exploded = true;
        hitOpponent = true;
      }

      // Check ground collision
      if (!exploded && p.pos.y <= 0.1) {
        exploded = true;
      }

      // Check boundary walls
      if (!exploded && (Math.abs(p.pos.x) >= 34.5 || Math.abs(p.pos.z) >= 34.5 || p.pos.y >= 25)) {
        exploded = true;
      }

      // Check obstacle collisions (houses, cars, porch columns)
      if (!exploded) {
        for (let j = 0; j < this.obstacleBoxes.length; j++) {
          if (this.obstacleBoxes[j].containsPoint(p.pos)) {
            exploded = true;
            break;
          }
        }
      }

      // Time-out removal
      if (p.life <= 0) {
        exploded = true;
      }

      if (exploded) {
        this.triggerExplosion(p.pos, hitOpponent);

        if (hitOpponent && p.isLocal) {
          // Direct hit registered!
          myScore++;
          updateScoreboard();
          triggerHitEffect();

          // Inform opponent over network
          if (dataConn && dataConn.open) {
            dataConn.send({
              type: 'you_got_hit',
              shooter: myPlayerName
            });
          }
        }

        // Clean up projectile entity
        if (p.el.parentNode) {
          p.el.parentNode.removeChild(p.el);
        }
        this.projectiles.splice(i, 1);
      }
    }
  },

  triggerExplosion: function (pos, isPlayerHit) {
    playExplosionSound();

    const explosionGroup = document.createElement('a-entity');
    explosionGroup.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);

    // Expanding flash sphere
    const flashSphere = document.createElement('a-sphere');
    const blastColor = isPlayerHit ? '#f43f5e' : '#ffffff';
    flashSphere.setAttribute('radius', '0.35');
    flashSphere.setAttribute('color', blastColor);
    flashSphere.setAttribute('material', `emissive: ${blastColor}; emissiveIntensity: 3.0; transparent: true; opacity: 0.95`);
    explosionGroup.appendChild(flashSphere);

    // Shockwave ring
    const ring = document.createElement('a-ring');
    ring.setAttribute('radius-inner', '0.2');
    ring.setAttribute('radius-outer', '0.45');
    ring.setAttribute('color', blastColor);
    ring.setAttribute('material', `emissive: ${blastColor}; emissiveIntensity: 2.0; side: double`);
    ring.setAttribute('rotation', '90 0 0');
    explosionGroup.appendChild(ring);

    // Exploding white particle chunks
    const particleCount = isPlayerHit ? 16 : 10;
    const particles = [];
    for (let k = 0; k < particleCount; k++) {
      const p = document.createElement('a-box');
      p.setAttribute('width', '0.12');
      p.setAttribute('height', '0.12');
      p.setAttribute('depth', '0.12');
      p.setAttribute('color', isPlayerHit ? (k % 2 === 0 ? '#ff7675' : '#ffffff') : '#ffffff');
      p.setAttribute('material', 'emissive: #ffffff; emissiveIntensity: 1.8');

      // Random burst velocity in sphere
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 2
      ).normalize();
      const spd = 4 + Math.random() * 6;

      explosionGroup.appendChild(p);
      particles.push({ el: p, vel: dir.multiplyScalar(spd), curPos: new THREE.Vector3(0, 0, 0) });
    }

    this.effectsContainer.appendChild(explosionGroup);

    // Animate explosion burst for 400ms
    const startTime = performance.now();
    const animInterval = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = elapsed / 0.42;

      if (progress >= 1.0) {
        clearInterval(animInterval);
        if (explosionGroup.parentNode) {
          explosionGroup.parentNode.removeChild(explosionGroup);
        }
        return;
      }

      // Expand flash sphere
      const scale = 1.0 + progress * 4.5;
      flashSphere.setAttribute('scale', `${scale} ${scale} ${scale}`);
      flashSphere.setAttribute('material', `opacity: ${Math.max(0, 1.0 - progress * 1.2)}`);

      // Expand ring
      const ringScale = 1.0 + progress * 6.0;
      ring.setAttribute('scale', `${ringScale} ${ringScale} ${ringScale}`);
      ring.setAttribute('material', `opacity: ${Math.max(0, 1.0 - progress)}`);

      // Update particle positions
      particles.forEach(pt => {
        pt.curPos.addScaledVector(pt.vel, 0.02);
        pt.vel.y -= 9.8 * 0.02; // gravity drop
        pt.el.setAttribute('position', `${pt.curPos.x} ${pt.curPos.y} ${pt.curPos.z}`);
      });
    }, 20);
  }
});

// -------------------------------------------------------------
// Network Manager: Sends local player transforms and smoothly renders opponent
// -------------------------------------------------------------
AFRAME.registerComponent('network-manager', {
  init: function () {
    this.rig = document.getElementById('player-rig');
    this.head = document.getElementById('player-head');
    this.remotePlayer = document.getElementById('remote-player');
    this.remoteLegL = document.getElementById('remote-leg-left');
    this.remoteLegR = document.getElementById('remote-leg-right');
    this.lastSentTime = 0;
  },

  tick: function (time, deltaTime) {
    const dt = (deltaTime || 16) / 1000;

    // Send local transform 25 times per second
    if (time - this.lastSentTime > 40) {
      this.lastSentTime = time;
      if (dataConn && dataConn.open && this.rig && this.head) {
        const rigPos = this.rig.object3D.position;
        const headRot = this.head.getAttribute('rotation') || { x: 0, y: 0, z: 0 };
        const rigRot = this.rig.object3D.rotation;
        const totalYaw = (headRot.y + (rigRot.y * 180 / Math.PI)) % 360;

        dataConn.send({
          type: 'transform',
          pos: { x: rigPos.x, y: rigPos.y, z: rigPos.z },
          rot: { x: headRot.x, y: totalYaw, z: 0 }
        });
      }
    }

    // Interpolate remote opponent position on screen
    if (isOpponentConnected && this.remotePlayer) {
      const curPos = this.remotePlayer.object3D.position;
      const moveDist = curPos.distanceTo(targetPos);
      curPos.lerp(targetPos, Math.min(1.0, dt * 15));

      const curRot = this.remotePlayer.object3D.rotation;
      const targetRad = (targetRotY * Math.PI) / 180;
      curRot.y = THREE.MathUtils.lerp(curRot.y, targetRad, Math.min(1.0, dt * 15));

      // Animate walking legs if moving
      if (moveDist > 0.02) {
        walkCycle += dt * 12;
        const swing = Math.sin(walkCycle) * 0.25;
        if (this.remoteLegL) this.remoteLegL.setAttribute('position', `-0.15 0.3 ${swing}`);
        if (this.remoteLegR) this.remoteLegR.setAttribute('position', `0.15 0.3 ${-swing}`);
      } else {
        if (this.remoteLegL) this.remoteLegL.setAttribute('position', '-0.15 0.3 0');
        if (this.remoteLegR) this.remoteLegR.setAttribute('position', '0.15 0.3 0');
      }
    }
  }
});

// -------------------------------------------------------------
// Procedural Neighborhood Environment Props (Houses, Porches, Cars)
// -------------------------------------------------------------
function buildNeighborhood() {
  const container = document.getElementById('neighborhood-environment');
  if (!container || container.children.length > 0) return;

  const sidewalkMat = 'color: #bdc3c7; roughness: 0.8';
  const sn = document.createElement('a-box');
  sn.setAttribute('position', '0 0.1 -14');
  sn.setAttribute('width', '68');
  sn.setAttribute('height', '0.2');
  sn.setAttribute('depth', '4');
  sn.setAttribute('material', sidewalkMat);
  sn.setAttribute('class', 'obstacle');
  container.appendChild(sn);

  const ss = document.createElement('a-box');
  ss.setAttribute('position', '0 0.1 14');
  ss.setAttribute('width', '68');
  ss.setAttribute('height', '0.2');
  ss.setAttribute('depth', '4');
  ss.setAttribute('material', sidewalkMat);
  ss.setAttribute('class', 'obstacle');
  container.appendChild(ss);

  const houseColors = ['#c0392b', '#2980b9', '#27ae60', '#d35400', '#8e44ad', '#16a085'];
  const houseX = [-24, -8, 8, 24];

  function makeHouse(x, z, rotY) {
    const houseGroup = document.createElement('a-entity');
    houseGroup.setAttribute('position', `${x} 0 ${z}`);
    houseGroup.setAttribute('rotation', `0 ${rotY} 0`);
    houseGroup.setAttribute('class', 'obstacle');

    const col = houseColors[Math.floor(Math.random() * houseColors.length)];

    const body = document.createElement('a-box');
    body.setAttribute('position', '0 2.5 0');
    body.setAttribute('width', '10');
    body.setAttribute('height', '5');
    body.setAttribute('depth', '9');
    body.setAttribute('color', col);
    body.setAttribute('class', 'obstacle');
    houseGroup.appendChild(body);

    const roof = document.createElement('a-cone');
    roof.setAttribute('position', '0 5.8 0');
    roof.setAttribute('radius-bottom', '7.2');
    roof.setAttribute('radius-top', '0.1');
    roof.setAttribute('height', '2.2');
    roof.setAttribute('segments-radial', '4');
    roof.setAttribute('rotation', '0 45 0');
    roof.setAttribute('color', '#34495e');
    roof.setAttribute('class', 'obstacle');
    houseGroup.appendChild(roof);

    const porch = document.createElement('a-box');
    porch.setAttribute('position', '0 0.25 5.5');
    porch.setAttribute('width', '5');
    porch.setAttribute('height', '0.5');
    porch.setAttribute('depth', '2.5');
    porch.setAttribute('color', '#ecf0f1');
    porch.setAttribute('class', 'obstacle');
    houseGroup.appendChild(porch);

    const pillar1 = document.createElement('a-cylinder');
    pillar1.setAttribute('position', '-2 1.5 6.5');
    pillar1.setAttribute('radius', '0.15');
    pillar1.setAttribute('height', '2.5');
    pillar1.setAttribute('color', '#ffffff');
    pillar1.setAttribute('class', 'obstacle');
    houseGroup.appendChild(pillar1);

    const pillar2 = document.createElement('a-cylinder');
    pillar2.setAttribute('position', '2 1.5 6.5');
    pillar2.setAttribute('radius', '0.15');
    pillar2.setAttribute('height', '2.5');
    pillar2.setAttribute('color', '#ffffff');
    pillar2.setAttribute('class', 'obstacle');
    houseGroup.appendChild(pillar2);

    container.appendChild(houseGroup);
  }

  houseX.forEach(x => makeHouse(x, -24, 0));
  houseX.forEach(x => makeHouse(x, 24, 180));

  function makeCar(x, z, rotY, carColor) {
    const car = document.createElement('a-entity');
    car.setAttribute('position', `${x} 0 ${z}`);
    car.setAttribute('rotation', `0 ${rotY} 0`);
    car.setAttribute('class', 'obstacle');

    const base = document.createElement('a-box');
    base.setAttribute('position', '0 0.5 0');
    base.setAttribute('width', '2.2');
    base.setAttribute('height', '0.8');
    base.setAttribute('depth', '4.5');
    base.setAttribute('color', carColor);
    base.setAttribute('class', 'obstacle');
    car.appendChild(base);

    const cabin = document.createElement('a-box');
    cabin.setAttribute('position', '0 1.15 -0.2');
    cabin.setAttribute('width', '1.9');
    cabin.setAttribute('height', '0.7');
    cabin.setAttribute('depth', '2.4');
    cabin.setAttribute('color', '#34495e');
    cabin.setAttribute('class', 'obstacle');
    car.appendChild(cabin);

    const wheels = [[-1.1, 0.35, 1.4], [1.1, 0.35, 1.4], [-1.1, 0.35, -1.4], [1.1, 0.35, -1.4]];
    wheels.forEach(([wx, wy, wz]) => {
      const wheel = document.createElement('a-cylinder');
      wheel.setAttribute('position', `${wx} ${wy} ${wz}`);
      wheel.setAttribute('rotation', '0 0 90');
      wheel.setAttribute('radius', '0.35');
      wheel.setAttribute('height', '0.25');
      wheel.setAttribute('color', '#1a1a1a');
      wheel.setAttribute('class', 'obstacle');
      car.appendChild(wheel);
    });

    container.appendChild(car);
  }

  makeCar(-16, -7, 10, '#e74c3c');
  makeCar(5, -6.5, -5, '#3498db');
  makeCar(-4, 6.5, 185, '#f39c12');
  makeCar(18, 7, 175, '#2ecc71');
}

// UI Enter Match Listener
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-enter');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    initAudioContext();

    const roomInput = document.getElementById('room-name').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'neighborhood';
    myPlayerName = document.getElementById('player-name').value.trim() || 'Shooter1';

    document.getElementById('self-display-name').innerText = myPlayerName;
    document.getElementById('room-display').innerText = `🏡 ARENA: ${roomInput}`;
    document.getElementById('lobby-ui').classList.add('hidden');
    document.getElementById('game-hud').classList.remove('hidden');

    buildNeighborhood();
    await setupAudio();
    initP2PRoom(roomInput);
    updateScoreboard();

    // Re-bind obstacle colliders once neighborhood elements are loaded
    const blasterComp = document.querySelector('a-scene').components['blaster-manager'];
    if (blasterComp) {
      blasterComp.setupObstacleColliders();
    }
  });
});

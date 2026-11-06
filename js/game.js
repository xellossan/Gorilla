// VR Quest & Desktop Crossplay 3D Gorilla Game Engine (v6 - Fully Synchronized Authority Timer)
const COURT_WIDTH = 26;
const COURT_LENGTH = 50;
const COURT_BOUNDARY_X = COURT_WIDTH / 2;
const COURT_BOUNDARY_Z = COURT_LENGTH / 2;
const AVATAR_EYE_HEIGHT = 2.4;

class VRGorillasGame {
  constructor() {
    this.myPlayerId = 1;
    this.activeTurnPlayer = 1;
    this.isSoloMode = false;
    this.scores = { 1: 0, 2: 0 };
    this.isGameOver = false;
    this.winnerId = null;

    this.settings = {
      turnDuration: 30,
      bananasPerTurn: 5,
      scoreToWin: 3
    };

    this.turnTimeRemaining = 30;
    this.bananasLeftInTurn = 5;
    this.wind = new THREE.Vector3(0, 0, 0);
    this.gravity = -9.81;

    // Destructibles
    this.destructibles = [];
    this.activeBananas = [];
    this.explosionParticles = [];

    // WebXR & VR tracking
    this.xrSession = null;
    this.controllers = [];
    this.isInVR = false;
    this.bananaInHand = null;
    this.holdingController = null;
    this.holdingControllerIndex = null;
    this.controllerHistory = [[], []];

    // Raycaster for Side-Wall GUI
    this.raycaster = new THREE.Raycaster();
    this.vrClickables = [];

    // Desktop controls
    this.keys = {};
    this.mousePitch = 0;
    this.mouseYaw = 0;
    this.isPointerLocked = false;
    this.isChargingThrow = false;
    this.throwChargeTime = 0;

    // Single Authoritative Timer Reference
    this.masterTimerInterval = null;

    this.initThreeJS();
    this.setupUI();
    this.setupNetworkCallbacks();
  }

  initThreeJS() {
    const container = document.getElementById('game-container');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a101f);
    this.scene.fog = new THREE.FogExp2(0x0a101f, 0.012);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, AVATAR_EYE_HEIGHT, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.playerRig = new THREE.Group();
    this.playerRig.position.set(0, 0, 16);
    this.playerRig.add(this.camera);
    this.scene.add(this.playerRig);

    const ambient = new THREE.AmbientLight(0xddeeff, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff1cf, 1.2);
    sun.position.set(25, 45, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    this.scene.add(sun);

    this.buildNonDestructibleFloor();
    this.spawnDestructibleEnvironment();
    this.buildOpponentGorilla();
    this.buildSideWallScoreboards();
    this.setupWebXRControllers();
    this.setupDesktopInputs();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.renderLoop());
  }

  buildNonDestructibleFloor() {
    const courtGeo = new THREE.PlaneGeometry(COURT_WIDTH, COURT_LENGTH);
    const courtMat = new THREE.MeshStandardMaterial({
      color: 0x182030,
      roughness: 0.85,
      metalness: 0.1
    });
    this.courtMesh = new THREE.Mesh(courtGeo, courtMat);
    this.courtMesh.rotation.x = -Math.PI / 2;
    this.courtMesh.receiveShadow = true;
    this.scene.add(this.courtMesh);

    const gridHelper = new THREE.GridHelper(COURT_LENGTH, 25, 0x38bdf8, 0x1f293d);
    gridHelper.position.y = 0.02;
    this.scene.add(gridHelper);

    const barrierGeo = new THREE.BoxGeometry(COURT_WIDTH, 4, 0.2);
    const barrierMat = new THREE.MeshBasicMaterial({
      color: 0xff0055,
      transparent: true,
      opacity: 0.35,
      wireframe: true
    });
    this.centerBarrier = new THREE.Mesh(barrierGeo, barrierMat);
    this.centerBarrier.position.set(0, 2, 0);
    this.scene.add(this.centerBarrier);
  }

  spawnDestructibleEnvironment() {
    this.destructibles.forEach(d => this.scene.remove(d.mesh));
    this.destructibles = [];

    let pieceId = 0;
    const addVoxel = (x, y, z, sx, sy, sz, color) => {
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      this.destructibles.push({
        id: pieceId++,
        mesh: mesh,
        box: new THREE.Box3().setFromObject(mesh),
        color: color
      });
    };

    const pillarLocations = [
      { x: -6, z: 8 }, { x: 6, z: 8 },
      { x: 0, z: 12 }, { x: -7, z: 16 }, { x: 7, z: 16 }, { x: -3, z: 20 }, { x: 3, z: 20 },
      { x: -6, z: -8 }, { x: 6, z: -8 },
      { x: 0, z: -12 }, { x: -7, z: -16 }, { x: 7, z: -16 }, { x: -3, z: -20 }, { x: 3, z: -20 },
      { x: -8, z: 2 }, { x: 8, z: 2 }, { x: -8, z: -2 }, { x: 8, z: -2 }
    ];

    pillarLocations.forEach(p => {
      const bHeight = 1.4;
      const bSize = 1.5;
      const tiers = 4;
      for (let t = 0; t < tiers; t++) {
        const y = t * bHeight + bHeight / 2;
        const color = (t % 2 === 0) ? 0x475569 : 0x334155;
        addVoxel(p.x, y, p.z, bSize, bHeight, bSize, color);
      }
    });

    for (let z = -22; z <= 22; z += 4) {
      if (Math.abs(z) < 4.5) continue;
      addVoxel(-COURT_BOUNDARY_X - 0.6, 1.5, z, 1.2, 3.0, 3.5, 0x1e293b);
      addVoxel(COURT_BOUNDARY_X + 0.6, 1.5, z, 1.2, 3.0, 3.5, 0x1e293b);
    }

    for (let i = -4; i <= 4; i++) {
      const bx = i * 8.0;
      const towerTiers = 5;
      const tierH = 4.0;
      for (let t = 0; t < towerTiers; t++) {
        const by = t * tierH + tierH / 2;
        const col = (i % 2 === 0) ? 0x162238 : 0x1c2b45;
        addVoxel(bx, by, 36, 7.0, tierH, 6.0, col);
      }
      for (let t = 0; t < towerTiers; t++) {
        const by = t * tierH + tierH / 2;
        const col = (i % 2 === 0) ? 0x1c2b45 : 0x162238;
        addVoxel(bx, by, -36, 7.0, tierH, 6.0, col);
      }
    }
  }

  buildOpponentGorilla() {
    this.remoteGorilla = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(1.4, 1.8, 1.0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.3;
    this.remoteGorilla.add(body);

    const headGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x4e342e });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.4;
    this.remoteGorilla.add(head);

    // Front visor on front face (-Z)
    const faceGeo = new THREE.BoxGeometry(0.7, 0.4, 0.2);
    const faceMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, 2.4, -0.46);
    this.remoteGorilla.add(face);

    const handGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const handMat = new THREE.MeshStandardMaterial({ color: 0x271915 });
    this.remoteLeftHand = new THREE.Mesh(handGeo, handMat);
    this.remoteLeftHand.position.set(-0.85, 1.2, -0.2);
    this.remoteRightHand = new THREE.Mesh(handGeo, handMat);
    this.remoteRightHand.position.set(0.85, 1.2, -0.2);
    this.remoteGorilla.add(this.remoteLeftHand);
    this.remoteGorilla.add(this.remoteRightHand);

    this.remoteGorilla.position.set(0, 0, -16);
    this.scene.add(this.remoteGorilla);
  }

  buildSideWallScoreboards() {
    this.sideBoardGroups = [];

    this.sideCanvas = document.createElement('canvas');
    this.sideCanvas.width = 1024;
    this.sideCanvas.height = 512;
    this.sideCanvasCtx = this.sideCanvas.getContext('2d');
    this.sideTexture = new THREE.CanvasTexture(this.sideCanvas);

    const frameGeo = new THREE.BoxGeometry(0.5, 5.2, 9.6);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });

    // Left Wall Board
    const leftBoardGroup = new THREE.Group();
    leftBoardGroup.position.set(-COURT_BOUNDARY_X - 0.4, 4.4, 0);
    const leftFrame = new THREE.Mesh(frameGeo, frameMat);
    leftBoardGroup.add(leftFrame);

    const screenGeo = new THREE.PlaneGeometry(9.0, 4.6);
    const screenMat = new THREE.MeshBasicMaterial({ map: this.sideTexture, side: THREE.DoubleSide });
    const leftScreen = new THREE.Mesh(screenGeo, screenMat);
    leftScreen.position.set(0.27, 0, 0);
    leftScreen.rotation.y = Math.PI / 2;
    leftBoardGroup.add(leftScreen);

    const restartBtnGeo = new THREE.BoxGeometry(0.35, 0.9, 3.6);
    const restartBtnMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0x012b44
    });
    const leftRestartBtn = new THREE.Mesh(restartBtnGeo, restartBtnMat);
    leftRestartBtn.position.set(0.38, -1.75, 0);
    leftRestartBtn.name = "VR_RESTART_BTN";
    leftBoardGroup.add(leftRestartBtn);
    this.vrClickables.push(leftRestartBtn);

    const btnCanvas = document.createElement('canvas');
    btnCanvas.width = 512;
    btnCanvas.height = 128;
    const bCtx = btnCanvas.getContext('2d');
    bCtx.fillStyle = '#0284c7';
    bCtx.fillRect(0, 0, 512, 128);
    bCtx.fillStyle = '#ffffff';
    bCtx.font = 'bold 50px sans-serif';
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    bCtx.fillText('🔄 RESTART MATCH', 256, 64);
    const btnTex = new THREE.CanvasTexture(btnCanvas);
    const btnLabelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 0.8),
      new THREE.MeshBasicMaterial({ map: btnTex, side: THREE.DoubleSide })
    );
    btnLabelMesh.position.set(0.19, 0, 0);
    btnLabelMesh.rotation.y = Math.PI / 2;
    leftRestartBtn.add(btnLabelMesh);

    this.scene.add(leftBoardGroup);
    this.sideBoardGroups.push(leftBoardGroup);

    // Right Wall Board
    const rightBoardGroup = new THREE.Group();
    rightBoardGroup.position.set(COURT_BOUNDARY_X + 0.4, 4.4, 0);
    const rightFrame = new THREE.Mesh(frameGeo, frameMat);
    rightBoardGroup.add(rightFrame);

    const rightScreen = new THREE.Mesh(screenGeo, screenMat);
    rightScreen.position.set(-0.27, 0, 0);
    rightScreen.rotation.y = -Math.PI / 2;
    rightBoardGroup.add(rightScreen);

    const rightRestartBtn = new THREE.Mesh(restartBtnGeo, restartBtnMat);
    rightRestartBtn.position.set(-0.38, -1.75, 0);
    rightRestartBtn.name = "VR_RESTART_BTN";
    rightBoardGroup.add(rightRestartBtn);
    this.vrClickables.push(rightRestartBtn);

    const rightBtnLabelMesh = btnLabelMesh.clone();
    rightBtnLabelMesh.position.set(-0.19, 0, 0);
    rightBtnLabelMesh.rotation.y = -Math.PI / 2;
    rightRestartBtn.add(rightBtnLabelMesh);

    this.scene.add(rightBoardGroup);
    this.sideBoardGroups.push(rightBoardGroup);

    this.renderSideWallCanvas();
  }

  renderSideWallCanvas() {
    if (!this.sideCanvasCtx) return;
    const ctx = this.sideCanvasCtx;
    ctx.clearRect(0, 0, 1024, 512);

    ctx.fillStyle = '#070d19';
    ctx.fillRect(0, 0, 1024, 512);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 1004, 492);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.fillRect(20, 20, 984, 90);

    if (this.isGameOver) {
      const isWinner = (this.winnerId === this.myPlayerId);
      ctx.fillStyle = isWinner ? '#22c55e' : '#ef4444';
      ctx.fillRect(20, 20, 984, 110);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 68px sans-serif';
      ctx.fillText(isWinner ? '🏆 YOU WIN! 🏆' : '💀 YOU LOSE! 💀', 512, 98);
    } else {
      ctx.textAlign = 'center';
      const isMyTurn = (this.activeTurnPlayer === this.myPlayerId);
      ctx.fillStyle = isMyTurn ? '#4ade80' : '#facc15';
      ctx.font = 'bold 50px sans-serif';
      ctx.fillText(isMyTurn ? '👉 YOUR TURN TO PLAY' : `PLAYER ${this.activeTurnPlayer}'S TURN`, 512, 80);
    }

    ctx.textAlign = 'left';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('PLAYER 1', 60, 175);
    ctx.font = 'bold 88px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${this.scores[1]}`, 110, 265);

    ctx.textAlign = 'right';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = '#f87171';
    ctx.fillText('PLAYER 2', 964, 175);
    ctx.font = 'bold 88px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${this.scores[2]}`, 914, 265);

    ctx.textAlign = 'center';
    if (!this.isGameOver) {
      ctx.font = 'bold 86px sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`${this.turnTimeRemaining}s`, 512, 220);

      ctx.font = 'bold 34px sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`🍌 ${this.bananasLeftInTurn} Bananas Left | Goal: ${this.settings.scoreToWin} Hits`, 512, 275);
    } else {
      ctx.font = 'bold 48px sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`FINAL:  ${this.scores[1]}  -  ${this.scores[2]}`, 512, 230);

      ctx.font = 'bold 32px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Aim laser at the blue button below to Restart', 512, 280);
    }

    const speed = this.wind.length().toFixed(1);
    const dirTxt = (this.wind.x > 0.5) ? 'EAST ➔' : (this.wind.x < -0.5) ? '⬅ WEST' : 'CALM';
    ctx.fillStyle = '#334155';
    ctx.fillRect(40, 315, 944, 70);

    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`WIND STATUS: ${speed} m/s  (${dirTxt})`, 512, 362);

    ctx.font = 'italic 26px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Aim Quest Controller laser at wall button to Restart Match', 512, 450);

    this.sideTexture.needsUpdate = true;
  }

  setupWebXRControllers() {
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.addEventListener('selectstart', (e) => this.onVRTriggerDown(e.target, i));
      controller.addEventListener('selectend', (e) => this.onVRTriggerUp(e.target, i));
      this.playerRig.add(controller);
      this.controllers.push(controller);

      const handMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshStandardMaterial({ color: (i === 0) ? 0x38bdf8 : 0xfacc15 })
      );
      controller.add(handMesh);

      const rayGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -28)
      ]);
      const rayMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.65
      });
      const rayLine = new THREE.Line(rayGeo, rayMat);
      rayLine.name = "pointerRay";
      controller.add(rayLine);
    }

    const enterVRBtn = document.getElementById('btn-vr-enter');
    if ('xr' in navigator) {
      navigator.xr.isSessionSupported('immersive-vr').then(supported => {
        if (supported) {
          enterVRBtn.addEventListener('click', () => this.startVRSession());
        } else {
          enterVRBtn.innerText = "VR Not Detected";
          enterVRBtn.style.opacity = "0.5";
        }
      });
    }
  }

  async startVRSession() {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });
      this.renderer.xr.setSession(session);
      this.xrSession = session;
      this.isInVR = true;
      document.getElementById('btn-vr-enter').innerText = "In VR Mode";
    } catch (err) {
      console.error("Failed to start WebXR session:", err);
    }
  }

  onVRTriggerDown(controller, index) {
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    const rayDir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix).normalize();
    const rayOrigin = new THREE.Vector3();
    controller.getWorldPosition(rayOrigin);

    this.raycaster.set(rayOrigin, rayDir);
    const hits = this.raycaster.intersectObjects(this.vrClickables, true);
    if (hits.length > 0) {
      window.soundFX.playBananaReady();
      this.triggerMatchRestart();
      return;
    }

    if (this.isGameOver) return;
    if (this.activeTurnPlayer !== this.myPlayerId) return;
    if (this.bananasLeftInTurn <= 0) return;
    if (this.bananaInHand) return;

    this.bananaInHand = this.createBananaMesh();
    controller.add(this.bananaInHand);
    this.holdingController = controller;
    this.holdingControllerIndex = index;
    this.controllerHistory[index] = [];
    window.soundFX.playBananaReady();
  }

  onVRTriggerUp(controller, index) {
    if (this.bananaInHand && this.holdingController === controller) {
      const worldPos = new THREE.Vector3();
      controller.getWorldPosition(worldPos);

      const ctrlRot = new THREE.Quaternion();
      controller.getWorldQuaternion(ctrlRot);
      const pointDir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctrlRot).normalize();

      const history = this.controllerHistory[index];
      let swingVel = new THREE.Vector3(0, 0, 0);

      if (history.length >= 2) {
        const newest = history[history.length - 1];
        let oldest = history[0];
        for (let i = history.length - 2; i >= 0; i--) {
          if (newest.time - history[i].time >= 0.07) {
            oldest = history[i];
            break;
          }
        }
        const dt = Math.max(newest.time - oldest.time, 0.015);
        swingVel.subVectors(newest.pos, oldest.pos).divideScalar(dt);
      }

      const rawSpeed = swingVel.length();
      let launchDir = new THREE.Vector3();
      if (rawSpeed > 1.2) {
        const normSwing = swingVel.clone().normalize();
        launchDir.addScaledVector(normSwing, 0.75);
        launchDir.addScaledVector(pointDir, 0.25);
        launchDir.normalize();
      } else {
        launchDir.copy(pointDir).add(new THREE.Vector3(0, 0.25, 0)).normalize();
      }

      let finalSpeed = 8.0 + rawSpeed * 4.2;
      finalSpeed = Math.min(Math.max(finalSpeed, 6.0), 36.0);

      const throwVel = launchDir.multiplyScalar(finalSpeed);

      controller.remove(this.bananaInHand);
      this.spawnBananaProjectile(worldPos, throwVel, true);

      this.bananaInHand = null;
      this.holdingController = null;
      this.holdingControllerIndex = null;
    }
  }

  setupDesktopInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (!this.isInVR && !this.isPointerLocked) {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = (document.pointerLockElement === canvas);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked || this.isInVR) return;
      const sensitivity = 0.0024;
      this.mouseYaw -= e.movementX * sensitivity;
      this.mousePitch -= e.movementY * sensitivity;
      this.mousePitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.mousePitch));

      this.playerRig.rotation.y = this.mouseYaw;
      this.camera.rotation.x = this.mousePitch;
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.isPointerLocked && !this.isInVR) {
        if (!this.isGameOver && this.activeTurnPlayer === this.myPlayerId && this.bananasLeftInTurn > 0) {
          this.isChargingThrow = true;
          this.throwChargeTime = 0;
          document.getElementById('throw-power-container').classList.remove('hidden');
          window.soundFX.playBananaReady();
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.isChargingThrow) {
        this.isChargingThrow = false;
        document.getElementById('throw-power-container').classList.add('hidden');
        document.getElementById('throw-power-bar').style.width = '0%';

        const chargeRatio = Math.min(this.throwChargeTime / 1.5, 1.0);
        const speed = 10 + chargeRatio * 22;

        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);

        const spawnPos = new THREE.Vector3();
        this.camera.getWorldPosition(spawnPos);
        spawnPos.add(dir.clone().multiplyScalar(0.7));

        const velocity = dir.multiplyScalar(speed);
        this.spawnBananaProjectile(spawnPos, velocity, true);
      }
    });
  }

  createBananaMesh() {
    const bananaGroup = new THREE.Group();
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.25, 0, 0),
      new THREE.Vector3(0, 0.15, 0),
      new THREE.Vector3(0.25, 0, 0)
    );
    const tubeGeo = new THREE.TubeGeometry(curve, 10, 0.06, 8, false);
    const bananaMat = new THREE.MeshStandardMaterial({
      color: 0xffe135,
      roughness: 0.3,
      emissive: 0x443300
    });
    const mesh = new THREE.Mesh(tubeGeo, bananaMat);
    mesh.castShadow = true;
    bananaGroup.add(mesh);
    return bananaGroup;
  }

  spawnBananaProjectile(position, velocity, isLocalThrow = false) {
    const mesh = this.createBananaMesh();
    mesh.position.copy(position);
    this.scene.add(mesh);

    const projectile = {
      mesh: mesh,
      velocity: velocity.clone(),
      ownerId: isLocalThrow ? this.myPlayerId : (3 - this.myPlayerId),
      alive: true
    };
    this.activeBananas.push(projectile);

    window.soundFX.playBananaThrow();

    if (isLocalThrow) {
      this.bananasLeftInTurn = Math.max(0, this.bananasLeftInTurn - 1);
      this.updateHUD();

      window.networkManager.send({
        type: 'BANANA_THROW',
        pos: { x: position.x, y: position.y, z: position.z },
        vel: { x: velocity.x, y: velocity.y, z: velocity.z },
        remainingBananas: this.bananasLeftInTurn
      });

      // OUT OF BANANAS: Pass turn immediately
      if (this.bananasLeftInTurn <= 0) {
        this.requestTurnPass();
      }
    }
  }

  setupUI() {
    const micBtn = document.getElementById('btn-mic-toggle');
    micBtn.addEventListener('click', async () => {
      if (!window.networkManager.localStream) {
        await window.networkManager.setupLocalMicrophone();
      }
      const isLive = window.networkManager.toggleMicrophone();
      micBtn.className = isLive ? 'hud-btn mic-on' : 'hud-btn mic-muted';
      micBtn.innerText = isLive ? '🎙️ Mic: ON' : '🔇 Mic: OFF';
    });

    document.getElementById('btn-create-room').addEventListener('click', async () => {
      this.readSettingsFromUI();
      const hostRoomInput = document.getElementById('host-custom-room-id').value.trim() || 'Xellossan';
      await window.networkManager.setupLocalMicrophone();
      window.soundFX.init();

      window.networkManager.initHost(hostRoomInput, this.settings, (roomName) => {
        document.getElementById('host-room-id').innerText = roomName;
        document.getElementById('host-info').classList.remove('hidden');
        document.getElementById('btn-create-room').style.display = 'none';
        document.getElementById('host-custom-room-id').disabled = true;
      }, (err) => {
        alert("Could not create room with that name (it may be in use). Please try another.");
      });
    });

    document.getElementById('btn-join-room').addEventListener('click', async () => {
      const roomInput = document.getElementById('join-room-id').value.trim() || 'Xellossan';
      await window.networkManager.setupLocalMicrophone();
      window.soundFX.init();

      window.networkManager.initJoin(roomInput, () => {
        console.log("Joined host successfully");
      }, (err) => {
        alert("Failed to join room '" + roomInput + "': " + err);
      });
    });

    document.getElementById('btn-solo-practice').addEventListener('click', () => {
      this.readSettingsFromUI();
      this.isSoloMode = true;
      window.soundFX.init();
      this.startMatch(1, this.settings);
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
      this.triggerMatchRestart();
    });
    document.getElementById('btn-restart-desktop').addEventListener('click', () => {
      this.triggerMatchRestart();
    });
  }

  triggerMatchRestart() {
    window.networkManager.send({ type: 'RESTART_GAME' });
    this.resetMatch();
  }

  readSettingsFromUI() {
    this.settings.turnDuration = parseInt(document.getElementById('turn-time').value) || 30;
    this.settings.bananasPerTurn = parseInt(document.getElementById('banana-count').value) || 5;
    this.settings.scoreToWin = parseInt(document.getElementById('win-score').value) || 3;
  }

  setupNetworkCallbacks() {
    window.networkManager.onMatchStart = (assignedPlayerId, settings) => {
      this.startMatch(assignedPlayerId, settings);
    };

    // Client receives authoritative turn switch from host
    window.networkManager.onTurnSync = (data) => {
      this.activeTurnPlayer = data.activePlayer;
      this.turnTimeRemaining = data.timeRemaining;
      this.bananasLeftInTurn = this.settings.bananasPerTurn;
      this.wind.set(data.wind.x, data.wind.y, data.wind.z);
      this.updateHUD();
      window.soundFX.playTurnChange();
    };

    // Client receives 100% synchronized timer tick from host
    window.networkManager.onTimerTick = (timeRemaining) => {
      this.turnTimeRemaining = timeRemaining;
      this.updateHUD();
    };

    // Host receives turn pass request when client runs out of bananas
    window.networkManager.onTurnChangeRequest = () => {
      if (this.isHostRole()) {
        this.passTurn();
      }
    };

    window.networkManager.onBananaThrow = (data) => {
      const pos = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z);
      const vel = new THREE.Vector3(data.vel.x, data.vel.y, data.vel.z);
      this.spawnBananaProjectile(pos, vel, false);
      if (data.remainingBananas !== undefined) {
        this.bananasLeftInTurn = data.remainingBananas;
        this.updateHUD();
      }
    };

    window.networkManager.onObstacleDestroy = (obstacleId) => {
      this.destroyPiece(obstacleId, false);
    };

    window.networkManager.onPlayerTransform = (data) => {
      this.remoteGorilla.position.set(data.pos.x, data.pos.y, data.pos.z);
      this.remoteGorilla.rotation.y = data.rotY;
    };

    window.networkManager.onScoreUpdate = (scores) => {
      this.scores = scores;
      this.updateHUD();
      this.checkEndGame();
    };

    window.networkManager.onRestart = () => {
      this.resetMatch();
    };
  }

  isHostRole() {
    return this.myPlayerId === 1 || this.isSoloMode;
  }

  startMatch(myPlayerId, settings) {
    this.myPlayerId = myPlayerId;
    this.settings = settings;
    this.scores = { 1: 0, 2: 0 };
    this.isGameOver = false;
    this.winnerId = null;

    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('game-hud').classList.remove('hidden');

    this.camera.position.set(0, AVATAR_EYE_HEIGHT, 0);

    this.resetGorillaPositions();
    this.spawnDestructibleEnvironment();
    this.activeTurnPlayer = 1;
    this.startTurn();
  }

  resetGorillaPositions() {
    if (this.myPlayerId === 1) {
      this.playerRig.position.set(0, 0, 16);
      this.playerRig.rotation.y = 0;
      this.remoteGorilla.position.set(0, 0, -16);
      this.remoteGorilla.rotation.y = Math.PI;
    } else {
      this.playerRig.position.set(0, 0, -16);
      this.playerRig.rotation.y = Math.PI;
      this.remoteGorilla.position.set(0, 0, 16);
      this.remoteGorilla.rotation.y = 0;
    }

    window.networkManager.send({
      type: 'PLAYER_TRANSFORM',
      pos: { x: this.playerRig.position.x, y: this.playerRig.position.y, z: this.playerRig.position.z },
      rotY: this.playerRig.rotation.y
    });
  }

  generateRandomWind() {
    const wx = (Math.random() - 0.5) * 12.0;
    const wz = (Math.random() - 0.5) * 4.0;
    this.wind.set(wx, 0, wz);
  }

  // Authoritative turn initiation: resets countdown to setting and allocates full banana quota
  startTurn() {
    // Clear any previous interval to prevent multi-countdown collision
    if (this.masterTimerInterval) {
      clearInterval(this.masterTimerInterval);
      this.masterTimerInterval = null;
    }

    this.turnTimeRemaining = this.settings.turnDuration;
    this.bananasLeftInTurn = this.settings.bananasPerTurn;

    // Only the Host (or Solo Player) runs the timer interval to guarantee 100% sync
    if (this.isHostRole()) {
      this.generateRandomWind();
      window.networkManager.send({
        type: 'TURN_SYNC',
        activePlayer: this.activeTurnPlayer,
        timeRemaining: this.turnTimeRemaining,
        wind: { x: this.wind.x, y: this.wind.y, z: this.wind.z }
      });

      this.masterTimerInterval = setInterval(() => {
        if (this.isGameOver) {
          clearInterval(this.masterTimerInterval);
          this.masterTimerInterval = null;
          return;
        }

        this.turnTimeRemaining--;
        this.updateHUD();

        // Broadcast authoritative tick to client
        window.networkManager.send({
          type: 'TIMER_TICK',
          timeRemaining: this.turnTimeRemaining
        });

        if (this.turnTimeRemaining <= 0) {
          this.passTurn();
        }
      }, 1000);
    }

    window.soundFX.playTurnChange();
    this.updateHUD();
  }

  // Request turn pass (handles both host and guest)
  requestTurnPass() {
    if (this.isGameOver) return;

    if (this.isHostRole()) {
      this.passTurn();
    } else {
      // Send immediate request to host to switch turn
      window.networkManager.send({
        type: 'REQUEST_TURN_PASS'
      });
    }
  }

  // Switches player, resets time back to full duration, and restarts countdown
  passTurn() {
    if (this.isGameOver) return;

    if (this.masterTimerInterval) {
      clearInterval(this.masterTimerInterval);
      this.masterTimerInterval = null;
    }

    this.activeTurnPlayer = (this.activeTurnPlayer === 1) ? 2 : 1;
    this.startTurn();
  }

  updateHUD() {
    document.getElementById('hud-p1-score').innerText = this.scores[1];
    document.getElementById('hud-p2-score').innerText = this.scores[2];
    document.getElementById('hud-timer').innerText = this.turnTimeRemaining + 's';
    document.getElementById('hud-banana-ammo').innerText = '🍌 ' + this.bananasLeftInTurn + ' left';

    const isMyTurn = (this.activeTurnPlayer === this.myPlayerId);
    const indicator = document.getElementById('hud-turn-indicator');
    if (isMyTurn) {
      indicator.innerText = "YOUR TURN TO THROW!";
      indicator.style.color = "#4ade80";
    } else {
      indicator.innerText = "OPPONENT'S TURN...";
      indicator.style.color = "#f87171";
    }

    const speed = this.wind.length().toFixed(1);
    const angleRad = Math.atan2(this.wind.z, this.wind.x);
    const angleDeg = (angleRad * 180) / Math.PI;
    document.getElementById('wind-speed').innerText = `${speed} m/s`;
    document.getElementById('wind-arrow').style.transform = `rotate(${angleDeg}deg)`;

    this.renderSideWallCanvas();
  }

  destroyPiece(pieceId, broadcast = true) {
    const idx = this.destructibles.findIndex(d => d.id === pieceId);
    if (idx !== -1) {
      const piece = this.destructibles[idx];
      this.createExplosionVFX(piece.mesh.position, piece.color || 0x94a3b8);
      this.scene.remove(piece.mesh);
      this.destructibles.splice(idx, 1);

      if (broadcast) {
        window.networkManager.send({
          type: 'OBSTACLE_DESTROY',
          obstacleId: pieceId
        });
      }
    }
  }

  createExplosionVFX(position, color = 0xffaa00) {
    window.soundFX.playExplosion();
    const count = 16;
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 5, 5),
        new THREE.MeshBasicMaterial({ color: color })
      );
      p.position.copy(position);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        Math.random() * 8 + 1,
        (Math.random() - 0.5) * 9
      );
      this.scene.add(p);
      this.explosionParticles.push({ mesh: p, vel: vel, life: 1.0 });
    }
  }

  checkEndGame() {
    if (this.scores[1] >= this.settings.scoreToWin || this.scores[2] >= this.settings.scoreToWin) {
      if (this.masterTimerInterval) {
        clearInterval(this.masterTimerInterval);
        this.masterTimerInterval = null;
      }
      this.isGameOver = true;
      this.winnerId = (this.scores[1] >= this.settings.scoreToWin) ? 1 : 2;
      const isWinner = (this.winnerId === this.myPlayerId);

      document.getElementById('winner-title').innerText = isWinner ? "🏆 YOU WIN! 🏆" : "💀 YOU LOSE! 💀";
      document.getElementById('winner-details').innerText = `Final Score: ${this.scores[1]} - ${this.scores[2]}`;
      document.getElementById('game-over-screen').classList.remove('hidden');

      this.renderSideWallCanvas();
      window.soundFX.playVictory();
    }
  }

  resetMatch() {
    if (this.masterTimerInterval) {
      clearInterval(this.masterTimerInterval);
      this.masterTimerInterval = null;
    }
    this.scores = { 1: 0, 2: 0 };
    this.isGameOver = false;
    this.winnerId = null;
    document.getElementById('game-over-screen').classList.add('hidden');
    
    this.resetGorillaPositions();
    this.spawnDestructibleEnvironment();
    this.activeTurnPlayer = 1;
    this.startTurn();
  }

  handlePlayerLocomotion(delta) {
    if (this.isGameOver) return;
    const canMove = (this.activeTurnPlayer === this.myPlayerId);
    if (!canMove) return;

    let moveX = 0;
    let moveZ = 0;
    let rotY = 0;

    if (this.isInVR && this.xrSession) {
      for (const source of this.xrSession.inputSources) {
        if (!source.gamepad) continue;
        const axes = source.gamepad.axes;
        if (source.handedness === 'left') {
          moveX += (Math.abs(axes[2]) > 0.12) ? axes[2] : 0;
          moveZ += (Math.abs(axes[3]) > 0.12) ? axes[3] : 0;
        } else if (source.handedness === 'right') {
          rotY -= (Math.abs(axes[2]) > 0.12) ? axes[2] : 0;
        }
      }
      this.playerRig.rotation.y += rotY * 2.4 * delta;
    } else if (this.isPointerLocked) {
      if (this.keys['KeyW']) moveZ -= 1;
      if (this.keys['KeyS']) moveZ += 1;
      if (this.keys['KeyA']) moveX -= 1;
      if (this.keys['KeyD']) moveX += 1;
    }

    if (moveX !== 0 || moveZ !== 0) {
      const moveVec = new THREE.Vector3(moveX, 0, moveZ).normalize();
      moveVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.playerRig.rotation.y);
      const speed = 7.5;
      this.playerRig.position.addScaledVector(moveVec, speed * delta);
    }

    this.playerRig.position.x = Math.max(-COURT_BOUNDARY_X + 1.2, Math.min(COURT_BOUNDARY_X - 1.2, this.playerRig.position.x));
    if (this.myPlayerId === 1) {
      this.playerRig.position.z = Math.max(0.8, Math.min(COURT_BOUNDARY_Z - 1.5, this.playerRig.position.z));
    } else {
      this.playerRig.position.z = Math.max(-COURT_BOUNDARY_Z + 1.5, Math.min(-0.8, this.playerRig.position.z));
    }

    window.networkManager.send({
      type: 'PLAYER_TRANSFORM',
      pos: { x: this.playerRig.position.x, y: this.playerRig.position.y, z: this.playerRig.position.z },
      rotY: this.playerRig.rotation.y
    });
  }

  updateBananaPhysics(delta) {
    for (let i = this.activeBananas.length - 1; i >= 0; i--) {
      const b = this.activeBananas[i];
      if (!b.alive) continue;

      b.velocity.y += this.gravity * delta;
      b.velocity.x += this.wind.x * delta;
      b.velocity.z += this.wind.z * delta;

      b.mesh.position.addScaledVector(b.velocity, delta);

      b.mesh.rotation.x += 12 * delta;
      b.mesh.rotation.z += 8 * delta;

      const pos = b.mesh.position;

      // 1. Floor
      if (pos.y <= 0.1) {
        this.createExplosionVFX(pos, 0xffde59);
        this.scene.remove(b.mesh);
        this.activeBananas.splice(i, 1);
        continue;
      }

      // 2. Destructible blocks
      let hitEnv = false;
      for (const piece of this.destructibles) {
        if (piece.box.containsPoint(pos)) {
          this.destroyPiece(piece.id, true);
          this.scene.remove(b.mesh);
          this.activeBananas.splice(i, 1);
          hitEnv = true;
          break;
        }
      }
      if (hitEnv) continue;

      // 3. Gorilla collision
      const targetPos = (b.ownerId === this.myPlayerId) ? this.remoteGorilla.position : this.playerRig.position;
      const dist = new THREE.Vector2(pos.x - targetPos.x, pos.z - targetPos.z).length();

      if (dist < 1.4 && pos.y < 3.2 && pos.y > 0.2) {
        this.createExplosionVFX(pos, 0xff0044);
        this.scene.remove(b.mesh);
        this.activeBananas.splice(i, 1);

        if (b.ownerId === this.myPlayerId) {
          this.scores[this.myPlayerId]++;
          this.updateHUD();
          window.networkManager.send({
            type: 'SCORE_UPDATE',
            scores: this.scores
          });
          this.checkEndGame();
        }
      }
    }
  }

  updateExplosionVFX(delta) {
    for (let i = this.explosionParticles.length - 1; i >= 0; i--) {
      const p = this.explosionParticles[i];
      p.life -= delta * 1.5;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.explosionParticles.splice(i, 1);
      } else {
        p.vel.y += -9.8 * delta;
        p.mesh.position.addScaledVector(p.vel, delta);
        p.mesh.scale.setScalar(p.life);
      }
    }
  }

  renderLoop() {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const nowTime = performance.now() / 1000;

    if (this.isInVR) {
      for (let i = 0; i < this.controllers.length; i++) {
        const ctrl = this.controllers[i];
        const curPos = new THREE.Vector3();
        ctrl.getWorldPosition(curPos);

        const hist = this.controllerHistory[i];
        hist.push({ time: nowTime, pos: curPos });

        while (hist.length > 0 && (nowTime - hist[0].time > 0.18)) {
          hist.shift();
        }
      }
    }

    if (this.isChargingThrow) {
      this.throwChargeTime += delta;
      const pct = Math.min((this.throwChargeTime / 1.5) * 100, 100);
      document.getElementById('throw-power-bar').style.width = pct + '%';
    }

    this.handlePlayerLocomotion(delta);
    this.updateBananaPhysics(delta);
    this.updateExplosionVFX(delta);

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new VRGorillasGame();
});

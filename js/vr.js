// WebXR and Oculus Quest Controller Integration
class VRHandler {
  constructor(game, renderer, scene, camera) {
    this.game = game;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.vrBtn = document.getElementById('vr-btn');
    this.controllers = [];
    this.isInVR = false;

    this.checkVRSupport();
    this.buildVRHUD();
  }

  checkVRSupport() {
    if ('xr' in navigator) {
      navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
        if (supported) {
          this.vrBtn.classList.remove('hidden');
          this.vrBtn.addEventListener('click', () => this.toggleVR());
        }
      });
    }
  }

  async toggleVR() {
    if (!this.isInVR) {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });
      this.renderer.xr.setSession(session);
      this.vrBtn.textContent = 'EXIT VR';
      this.isInVR = true;

      this.setupControllers();

      session.addEventListener('end', () => {
        this.isInVR = false;
        this.vrBtn.textContent = 'ENTER VR 🥽';
      });
    } else {
      this.renderer.xr.getSession().end();
    }
  }

  setupControllers() {
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      this.scene.add(controller);

      // Visual ray for aiming
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -5)
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: i === 0 ? 0x38bdf8 : 0xfacc15,
        transparent: true,
        opacity: 0.7
      });
      const line = new THREE.Line(lineGeo, lineMat);
      controller.add(line);

      // Grip controller model placeholder
      const gripGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.12);
      gripGeo.rotateX(Math.PI / 2);
      const gripMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
      controller.add(new THREE.Mesh(gripGeo, gripMat));

      // Trigger / Select to Throw Banana in VR
      controller.addEventListener('selectstart', () => {
        if (this.game.isMyTurn && !this.game.banana.active) {
          this.game.triggerThrow();
        }
      });

      // Squeeze trigger to toggle voice
      controller.addEventListener('squeezestart', () => {
        const isMuted = window.VoiceEngine.toggleMute();
        this.updateVRStatus(isMuted ? 'Mic Muted' : 'Mic Active');
      });

      this.controllers.push(controller);
    }
  }

  // Floating 3D HUD in VR space
  buildVRHUD() {
    this.vrHudGroup = new THREE.Group();

    // Canvas texture for crisp UI inside VR
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = 512;
    this.hudCanvas.height = 256;
    this.hudCtx = this.hudCanvas.getContext('2d');

    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    const hudPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.8),
      new THREE.MeshBasicMaterial({ map: this.hudTexture, transparent: true, side: THREE.DoubleSide })
    );

    this.vrHudGroup.add(hudPlane);
    this.vrHudGroup.position.set(0, 2.5, -2.5);
    this.scene.add(this.vrHudGroup);

    this.drawVRHUD('Waiting...', 30, 0);
  }

  drawVRHUD(turnText, timer, wind) {
    if (!this.hudCtx) return;
    const ctx = this.hudCtx;
    ctx.clearRect(0, 0, 512, 256);

    // Background pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 236, 24);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Turn info
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(turnText, 256, 60);

    // Timer
    ctx.fillStyle = timer <= 5 ? '#ef4444' : '#ffffff';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(timer + 's', 256, 140);

    // Wind and VR instruction
    ctx.fillStyle = '#38bdf8';
    ctx.font = '24px sans-serif';
    ctx.fillText(`Wind: ${wind > 0 ? '➔ +' : '⬅ '}${wind} m/s | Trigger: Throw`, 256, 195);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px sans-serif';
    ctx.fillText('Thumbstick: Move | Grip: Mute Mic', 256, 225);

    this.hudTexture.needsUpdate = true;
  }

  updateVRStatus(msg) {
    this.drawVRHUD(msg, this.game.turnTimer, this.game.windSpeed);
  }

  // Read Quest thumbstick axes for movement in VR
  update(dt) {
    if (!this.isInVR) return;

    // Follow player head / anchor floating HUD in comfortable sight
    const session = this.renderer.xr.getSession();
    if (session && session.inputSources) {
      for (const source of session.inputSources) {
        if (source.gamepad && source.gamepad.axes) {
          const axes = source.gamepad.axes;
          // Left thumbstick axes (horizontal, vertical)
          const moveX = axes[2] || axes[0] || 0;
          const moveZ = axes[3] || axes[1] || 0;

          if (Math.abs(moveX) > 0.15 || Math.abs(moveZ) > 0.15) {
            if (this.game.isMyTurn) {
              const speed = 2.0 * dt;
              this.game.moveCurrentPlayer(moveX * speed, moveZ * speed);
            }
          }
        }
      }
    }

    // Keep VR HUD gently in front of active gorilla
    const myGorilla = this.game.myPlayerIndex === 1 ? this.game.gorilla1 : this.game.gorilla2;
    if (myGorilla) {
      const offset = this.game.myPlayerIndex === 1 ? 2.5 : -2.5;
      this.vrHudGroup.position.set(myGorilla.group.position.x + offset, myGorilla.group.position.y + 2.6, myGorilla.group.position.z);
      this.vrHudGroup.lookAt(myGorilla.group.position.x + offset * 2, myGorilla.group.position.y + 2.6, myGorilla.group.position.z);
    }
  }
}

window.VRHandler = VRHandler;

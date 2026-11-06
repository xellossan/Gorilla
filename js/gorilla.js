// 3D Stylized Gorilla Character with Animation, Facing Direction & Turn Boundary
class Gorilla {
  constructor(scene, playerIndex, startX, startZ = 0) {
    this.scene = scene;
    this.playerIndex = playerIndex; // 1 or 2
    this.startX = startX;
    this.startZ = startZ;
    this.maxTurnMoveRadius = 2.2; // ~7 feet movement limit per turn
    this.moveRemaining = this.maxTurnMoveRadius;
    this.turnStartPos = new THREE.Vector3(startX, 0, startZ);

    this.isAlive = true;
    this.velocityY = 0;
    this.isFalling = false;

    this.group = new THREE.Group();
    this.buildMesh();

    // Facing direction: P1 faces +X, P2 faces -X
    if (this.playerIndex === 1) {
      this.group.rotation.y = Math.PI / 2;
    } else {
      this.group.rotation.y = -Math.PI / 2;
    }

    this.scene.add(this.group);
    this.buildMoveRing();
  }

  buildMesh() {
    const furColor = this.playerIndex === 1 ? 0x27272a : 0x1f2937;
    const skinColor = 0xa1a1aa;
    const bandanaColor = this.playerIndex === 1 ? 0xef4444 : 0x3b82f6;

    const furMat = new THREE.MeshLambertMaterial({ color: furColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const bandanaMat = new THREE.MeshLambertMaterial({ color: bandanaColor });

    // Torso / Chest
    const chestGeo = new THREE.BoxGeometry(1.6, 1.8, 1.2);
    const chest = new THREE.Mesh(chestGeo, furMat);
    chest.position.y = 1.4;
    chest.castShadow = true;
    this.group.add(chest);

    // Chest plate / skin
    const plateGeo = new THREE.BoxGeometry(1.2, 1.3, 0.2);
    const plate = new THREE.Mesh(plateGeo, skinMat);
    plate.position.set(0, 1.4, 0.55);
    this.group.add(plate);

    // Head
    const headGeo = new THREE.BoxGeometry(1.1, 1.1, 1.0);
    const head = new THREE.Mesh(headGeo, furMat);
    head.position.set(0, 2.7, 0.1);
    this.group.add(head);

    // Face / Muzzle
    const muzzleGeo = new THREE.BoxGeometry(0.8, 0.6, 0.5);
    const muzzle = new THREE.Mesh(muzzleGeo, skinMat);
    muzzle.position.set(0, 2.5, 0.6);
    this.group.add(muzzle);

    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    [-0.25, 0.25].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat);
      eye.position.set(ex, 2.8, 0.6);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), pupilMat);
      pupil.position.set(ex, 2.8, 0.61);
      this.group.add(eye);
      this.group.add(pupil);
    });

    // Bandana
    const bandanaGeo = new THREE.BoxGeometry(1.15, 0.25, 1.05);
    const bandana = new THREE.Mesh(bandanaGeo, bandanaMat);
    bandana.position.set(0, 3.0, 0.1);
    this.group.add(bandana);

    // Shoulders & Arms (Right arm used for throwing)
    const armGeo = new THREE.BoxGeometry(0.5, 1.6, 0.6);
    this.leftArm = new THREE.Mesh(armGeo, furMat);
    this.leftArm.position.set(-1.1, 1.3, 0.1);
    this.group.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, furMat);
    this.rightArm.position.set(1.1, 1.3, 0.1);
    this.group.add(this.rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.6, 1.0, 0.7);
    const leftLeg = new THREE.Mesh(legGeo, furMat);
    leftLeg.position.set(-0.5, 0.5, 0);
    this.group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, furMat);
    rightLeg.position.set(0.5, 0.5, 0);
    this.group.add(rightLeg);
  }

  buildMoveRing() {
    // Glowing neon boundary ring showing the allowed ~few feet movement circle
    const ringGeo = new THREE.RingGeometry(this.maxTurnMoveRadius - 0.05, this.maxTurnMoveRadius + 0.05, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.playerIndex === 1 ? 0xef4444 : 0x3b82f6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    this.moveRing = new THREE.Mesh(ringGeo, ringMat);
    this.moveRing.position.set(this.startX, 0.05, this.startZ);
    this.scene.add(this.moveRing);
    this.moveRing.visible = false;
  }

  // Start turn: resets origin for this turn's movement allowance
  startTurn(currentY) {
    this.turnStartPos.copy(this.group.position);
    this.moveRing.position.set(this.turnStartPos.x, currentY + 0.05, this.turnStartPos.z);
    this.moveRing.visible = true;
    this.moveRemaining = this.maxTurnMoveRadius;
  }

  endTurn() {
    this.moveRing.visible = false;
  }

  // Move gorilla clamped within the few feet radius
  tryMove(deltaX, deltaZ, city) {
    if (!this.isAlive) return;
    const targetX = this.group.position.x + deltaX;
    const targetZ = this.group.position.z + deltaZ;

    // Check distance from turn origin
    const dist = Math.hypot(targetX - this.turnStartPos.x, targetZ - this.turnStartPos.z);
    if (dist <= this.maxTurnMoveRadius) {
      this.group.position.x = targetX;
      this.group.position.z = targetZ;
      this.moveRemaining = this.maxTurnMoveRadius - dist;
      if (Math.random() < 0.15) window.SoundEngine.playStep();
    }
  }

  // Animate throw gesture
  animateThrow(callback) {
    let t = 0;
    const interval = setInterval(() => {
      t += 0.1;
      this.rightArm.rotation.x = -Math.sin(t * Math.PI) * 1.6;
      if (t >= 1) {
        clearInterval(interval);
        this.rightArm.rotation.x = 0;
        if (callback) callback();
      }
    }, 25);
  }

  // Update fall physics if building beneath collapses
  updatePhysics(city, dt) {
    if (!this.isAlive) return;

    const surface = city.getHighestSurfaceAt(this.group.position.x);
    const targetY = surface.y;

    if (this.group.position.y > targetY + 0.05) {
      this.isFalling = true;
      this.velocityY -= 20 * dt;
      this.group.position.y += this.velocityY * dt;

      if (this.group.position.y <= targetY) {
        this.group.position.y = targetY;
        this.velocityY = 0;
        this.isFalling = false;
      }
    } else {
      this.group.position.y = targetY;
      this.velocityY = 0;
      this.isFalling = false;
    }

    // Update move ring Y position
    if (this.moveRing.visible) {
      this.moveRing.position.y = this.group.position.y + 0.05;
    }

    // Check if fallen below world
    if (this.group.position.y < -20) {
      this.die();
    }
  }

  die() {
    this.isAlive = false;
    this.group.rotation.x = Math.PI / 2;
    this.moveRing.visible = false;
  }

  reset(x, y, z) {
    this.isAlive = true;
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, this.playerIndex === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
    this.turnStartPos.set(x, y, z);
    this.moveRing.visible = false;
  }
}

window.Gorilla = Gorilla;

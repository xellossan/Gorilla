// 3D Banana Ballistics, Wind, and Explosion Mechanics
class Banana {
  constructor(scene) {
    this.scene = scene;
    this.mesh = this.createBananaMesh();
    this.scene.add(this.mesh);
    this.mesh.visible = false;

    this.active = false;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.gravity = -14.0;
    this.wind = 0;
    this.trailParticles = [];
  }

  createBananaMesh() {
    const group = new THREE.Group();
    // Curved banana body using segmented cylinder
    const geom = new THREE.CylinderGeometry(0.18, 0.22, 1.2, 8);
    geom.rotateZ(Math.PI / 6);
    const mat = new THREE.MeshLambertMaterial({
      color: 0xfacc15,
      emissive: 0x713f12,
      emissiveIntensity: 0.2
    });
    const body = new THREE.Mesh(geom, mat);
    group.add(body);

    // Tips
    const tipMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    const tipTop = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.25, 6), tipMat);
    tipTop.position.set(-0.3, 0.6, 0);
    tipTop.rotation.z = Math.PI / 4;
    group.add(tipTop);

    return group;
  }

  launch(startPos, angleDeg, powerPercent, facingSign, windSpeed) {
    this.position.copy(startPos);
    this.position.y += 2.4; // Launch from hand/chest level
    this.position.x += facingSign * 0.8;

    this.mesh.position.copy(this.position);
    this.mesh.visible = true;

    // Ballistics math
    const rad = (angleDeg * Math.PI) / 180;
    // Map 10-100% power to 12 - 34 m/s velocity
    const speed = 10 + (powerPercent / 100) * 26;

    this.velocity.set(
      facingSign * Math.cos(rad) * speed,
      Math.sin(rad) * speed,
      0
    );

    this.wind = windSpeed;
    this.active = true;

    window.SoundEngine.playThrow();
  }

  update(dt, city, p1, p2, onHitCallback) {
    if (!this.active) return;

    // Apply wind force and gravity
    this.velocity.x += this.wind * 1.5 * dt;
    this.velocity.y += this.gravity * dt;

    this.position.addScaledVector(this.velocity, dt);
    this.mesh.position.copy(this.position);

    // Spin banana in flight
    this.mesh.rotation.z += 12 * dt;
    this.mesh.rotation.y += 8 * dt;

    // Smoke trail
    this.spawnTrail();

    // Check collision with Gorillas
    const checkGorillaHit = (g) => {
      if (!g.isAlive) return false;
      const gPos = g.group.position;
      const dx = this.position.x - gPos.x;
      const dy = this.position.y - (gPos.y + 1.4); // Gorilla center
      const dz = this.position.z - gPos.z;
      return Math.sqrt(dx*dx + dy*dy + dz*dz) < 1.6;
    };

    if (checkGorillaHit(p1)) {
      this.explode(city, onHitCallback, { hitGorilla: 1 });
      return;
    }
    if (checkGorillaHit(p2)) {
      this.explode(city, onHitCallback, { hitGorilla: 2 });
      return;
    }

    // Check collision with destructible skyscrapers
    for (let b of city.blocks) {
      if (!b.userData.active) continue;
      const dx = Math.abs(b.position.x - this.position.x);
      const dy = Math.abs(b.position.y - this.position.y);
      const dz = Math.abs(b.position.z - this.position.z);

      if (dx < city.blockWidth * 0.7 && dy < city.blockHeight * 0.7 && dz < city.blockDepth * 0.7) {
        this.explode(city, onHitCallback, { hitBuilding: true });
        return;
      }
    }

    // Fallen into the abyss / out of bounds
    if (this.position.y < -25 || Math.abs(this.position.x) > 65) {
      this.deactivate();
      if (onHitCallback) onHitCallback({ miss: true, position: this.position.clone() });
    }

    // Update trail particles
    this.updateTrail(dt);
  }

  explode(city, callback, hitInfo) {
    const blastPos = this.position.clone();
    window.SoundEngine.playExplosion();
    city.explodeAt(blastPos, 3.8); // Carve crater into skyscraper!

    this.deactivate();
    if (callback) {
      callback({
        ...hitInfo,
        position: blastPos
      });
    }
  }

  spawnTrail() {
    const geo = new THREE.SphereGeometry(0.18, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.6
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(this.position);
    p.userData = { life: 0.4 };
    this.scene.add(p);
    this.trailParticles.push(p);
  }

  updateTrail(dt) {
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.userData.life -= dt;
      p.scale.multiplyScalar(0.92);
      if (p.userData.life <= 0) {
        this.scene.remove(p);
        this.trailParticles.splice(i, 1);
      }
    }
  }

  deactivate() {
    this.active = false;
    this.mesh.visible = false;
  }
}

window.Banana = Banana;

// Procedural Destructible City Environment
class City {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];
    this.blocks = [];
    this.debrisParticles = [];
    this.blockWidth = 1.6;
    this.blockHeight = 1.6;
    this.blockDepth = 4.0;
    
    this.initSky();
    this.initGround();
  }

  initSky() {
    // Cyberpunk retro twilight gradient sky
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `;
    const uniforms = {
      topColor: { value: new THREE.Color(0x070b19) },
      bottomColor: { value: new THREE.Color(0x311042) },
      offset: { value: 33 },
      exponent: { value: 0.6 }
    };
    const skyGeo = new THREE.SphereGeometry(300, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.BackSide
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);

    // Distant neon moon / retro sun
    const sunGeo = new THREE.CircleGeometry(16, 32);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xff007f,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(0, 45, -120);
    this.scene.add(sun);
  }

  initGround() {
    // Bottom grid / street fog
    const gridHelper = new THREE.GridHelper(200, 40, 0x00ffff, 0x221144);
    gridHelper.position.y = -25;
    this.scene.add(gridHelper);
  }

  // Generate skyscrapers deterministically or from seed
  buildCity(layoutSeed = 12345) {
    // Clear any existing blocks
    this.clear();

    // Building definitions: [xCenter, widthBlocks, heightBlocks, colorHex]
    const configs = [
      { x: -38, w: 5, h: 10, col: 0x1e293b, win: 0x38bdf8 },
      { x: -26, w: 6, h: 14, col: 0x0f172a, win: 0xfacc15, isP1: true }, // Player 1 Tower
      { x: -14, w: 5, h: 18, col: 0x1e1b4b, win: 0xa855f7 },
      { x: 0,   w: 6, h: 12, col: 0x111827, win: 0x38bdf8 },
      { x: 14,  w: 5, h: 19, col: 0x1e1b4b, win: 0xec4899 },
      { x: 26,  w: 6, h: 14, col: 0x0f172a, win: 0xfacc15, isP2: true }, // Player 2 Tower
      { x: 38,  w: 5, h: 11, col: 0x1e293b, win: 0x38bdf8 },
    ];

    const boxGeo = new THREE.BoxGeometry(this.blockWidth, this.blockHeight, this.blockDepth);
    const edgeGeo = new THREE.EdgesGeometry(boxGeo);

    configs.forEach((cfg) => {
      const halfW = (cfg.w * this.blockWidth) / 2;
      const startX = cfg.x - halfW + this.blockWidth / 2;
      const startY = -20;

      const baseMat = new THREE.MeshLambertMaterial({
        color: cfg.col
      });
      const winMat = new THREE.MeshLambertMaterial({
        color: cfg.win,
        emissive: cfg.win,
        emissiveIntensity: 0.35
      });
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 });

      for (let ix = 0; ix < cfg.w; ix++) {
        for (let iy = 0; iy < cfg.h; iy++) {
          const isWindow = (ix + iy) % 2 === 0 && iy > 2 && iy < cfg.h - 1;
          const mat = isWindow ? winMat : baseMat;

          const block = new THREE.Mesh(boxGeo, mat);
          const posX = startX + ix * this.blockWidth;
          const posY = startY + iy * this.blockHeight;
          const posZ = 0;

          block.position.set(posX, posY, posZ);
          block.castShadow = true;
          block.receiveShadow = true;

          // Wireframe edge for sharp retro DOS voxel feel
          const wire = new THREE.LineSegments(edgeGeo, edgeMat);
          block.add(wire);

          block.userData = {
            active: true,
            buildingX: cfg.x,
            gridX: ix,
            gridY: iy,
            isP1: !!cfg.isP1,
            isP2: !!cfg.isP2
          };

          this.scene.add(block);
          this.blocks.push(block);
        }
      }
    });
  }

  // Find topmost active block position for a given X coordinate
  getHighestSurfaceAt(x) {
    let highestY = -25;
    let foundBlock = null;

    for (let b of this.blocks) {
      if (!b.userData.active) continue;
      const dx = Math.abs(b.position.x - x);
      if (dx < this.blockWidth) {
        const topY = b.position.y + this.blockHeight / 2;
        if (topY > highestY) {
          highestY = topY;
          foundBlock = b;
        }
      }
    }
    return { y: highestY, block: foundBlock };
  }

  // Destructible blast carving
  explodeAt(point, radius = 3.6) {
    const destroyed = [];
    const rSq = radius * radius;

    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (!b.userData.active) continue;

      const distSq = b.position.distanceToSquared(point);
      if (distSq <= rSq) {
        b.userData.active = false;
        this.scene.remove(b);
        destroyed.push(b);

        // Spawn explosive debris chunks
        this.spawnDebris(b.position, point);
      }
    }
    return destroyed.length;
  }

  spawnDebris(blockPos, blastCenter) {
    const debrisGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const debrisMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });

    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(debrisGeo, debrisMat);
      p.position.copy(blockPos);

      // Radial push away from blast
      const dir = new THREE.Vector3().subVectors(blockPos, blastCenter).normalize();
      dir.x += (Math.random() - 0.5) * 0.5;
      dir.y += Math.random() * 0.8 + 0.3;
      dir.z += (Math.random() - 0.5) * 0.5;
      dir.normalize().multiplyScalar(Math.random() * 8 + 4);

      p.userData = {
        velocity: dir,
        rotSpeed: new THREE.Vector3(Math.random()*6, Math.random()*6, Math.random()*6),
        life: 1.2
      };

      this.scene.add(p);
      this.debrisParticles.push(p);
    }
  }

  update(dt) {
    // Update debris physics
    for (let i = this.debrisParticles.length - 1; i >= 0; i--) {
      const p = this.debrisParticles[i];
      p.userData.velocity.y -= 18 * dt; // gravity
      p.position.addScaledVector(p.userData.velocity, dt);
      p.rotation.x += p.userData.rotSpeed.x * dt;
      p.rotation.y += p.userData.rotSpeed.y * dt;

      p.userData.life -= dt;
      if (p.userData.life <= 0 || p.position.y < -30) {
        this.scene.remove(p);
        this.debrisParticles.splice(i, 1);
      }
    }
  }

  clear() {
    this.blocks.forEach(b => this.scene.remove(b));
    this.blocks = [];
    this.debrisParticles.forEach(p => this.scene.remove(p));
    this.debrisParticles = [];
  }
}

window.City = City;

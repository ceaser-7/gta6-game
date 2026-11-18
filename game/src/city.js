// Porto Verde city: 14x14 blocks, 4 districts, parks, plaza, towers, props.
// Muted mature palette, canvas facade textures, emissive-only lamps (no
// per-lamp PointLights — hundreds of them make the renderer unusable).
const PV_City = (() => {
  const PITCH = 64, HALF = 448, ROAD = 12;
  const BASES = ['#8a7f72', '#7d7468', '#6e6a63', '#94806a', '#5f6a72', '#7a6a5e', '#857262', '#6b5f55'];
  const GLASS = ['#3d4c5c', '#44586a', '#37424e'];
  const texCache = {};
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function facadeTex(base, glass, shop) {
    const key = base + glass + shop;
    if (texCache[key]) return texCache[key];
    const t = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      // subtle grime + panel lines
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 2);
      // windows
      const cols = 4, rows = 8, ww = 18, wh = 16;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x = 8 + c * 30, y = 10 + r * 28;
        const lit = hash2(x * 7 + r, c * 13 + r) < 0.42;
        g.fillStyle = lit ? '#ffd98a' : glass;
        g.fillRect(x, y, ww, wh);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, ww, 3);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + wh - 2, ww, 2);
      }
      if (shop) {
        g.fillStyle = '#2e2a26'; g.fillRect(0, h - 34, w, 34);
        g.fillStyle = '#e8a33d'; g.fillRect(0, h - 38, w, 4);
        g.fillStyle = '#cfe3ff';
        for (let x = 6; x < w - 10; x += 22) g.fillRect(x, h - 30, 14, 22);
      }
    });
    texCache[key] = t; return t;
  }
  function signTex(text, fg, bg) {
    return canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.font = 'bold 34px Verdana'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
  }
  function groundTex() {
    return canvasTex(1024, 1024, (g, w, h) => {
      const S = w / 896; // px per unit
      g.fillStyle = '#3f444b'; g.fillRect(0, 0, w, h); // asphalt base
      // sidewalks + block fill
      for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) {
        const bx = (-416 + i * 64) * S + w / 2, bz = (-416 + j * 64) * S + h / 2;
        const park = PV_City.isPark(i, j);
        g.fillStyle = park ? '#4a6b3f' : '#565b62';
        g.fillRect(bx - 26 * S, bz - 26 * S, 52 * S, 52 * S);
        g.fillStyle = '#6a6f76';
        g.fillRect(bx - 26 * S, bz - 26 * S, 52 * S, 4 * S);
      }
      // beach strip east
      g.fillStyle = '#c9b285'; g.fillRect((400) * S + w / 2, 0, 48 * S, h);
      // plaza centre
      g.fillStyle = '#7d7468'; g.fillRect(-32 * S + w / 2, -32 * S + h / 2, 64 * S, 64 * S);
      // road centre dashes
      g.fillStyle = '#c9c27a';
      for (let k = 0; k <= 14; k++) {
        const p = (-448 + k * 64) * S + w / 2;
        for (let d = -440; d < 440; d += 32) g.fillRect(p - 1, (d) * S + h / 2, 2, 14 * S);
        for (let d = -440; d < 440; d += 32) g.fillRect((d) * S + w / 2, p - 1, 14 * S, 2);
      }
      // speckles / patches
      for (let n = 0; n < 900; n++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)';
        g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
    });
  }
  function box(w, h, d, mat, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); if (ry) m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    G.scene.add(m); return m;
  }
  function addCollider(x, z, hx, hz) { G.colliders.push({ x, z, hx, hz }); }

  const PARK = new Set(['6,6', '7,6', '6,7', '7,7', '2,3', '3,3']);
  function isPark(i, j) { return PARK.has(i + ',' + j); }
  function district(i, j) {
    if (i >= 7 && j < 7) return 'downtown';
    if (i < 7 && j >= 7) return 'oldtown';
    if (i >= 7 && j >= 7) return 'marina';
    return 'uptown';
  }

  let lampMats = [];
  function build() {
    const scene = G.scene;
    scene.background = new THREE.Color(0x2a2f3a);
    scene.fog = new THREE.Fog(0x2a2f3a, 120, 700);
    G.sun = new THREE.DirectionalLight(0xffb36b, 1.6);
    G.sun.position.set(200, 180, -120);
    G.sun.castShadow = true;
    G.sun.shadow.mapSize.set(2048, 2048);
    G.sun.shadow.camera.left = -500; G.sun.shadow.camera.right = 500;
    G.sun.shadow.camera.top = 500; G.sun.shadow.camera.bottom = -500;
    G.sun.shadow.camera.far = 1200;
    if (!G.low) scene.add(G.sun);
    G.hemi = new THREE.HemisphereLight(0x8fa3c7, 0x3a3230, 0.7);
    scene.add(G.hemi);
    // ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(896, 896), new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    // water strip far east (animated in main loop via material offset is skipped; simple plane)
    const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 896), new THREE.MeshStandardMaterial({ color: 0x2a5a7a, roughness: 0.25, metalness: 0.4 }));
    water.rotation.x = -Math.PI / 2; water.position.set(478, 0.2, 0);
    scene.add(water);

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 });
    const glassMats = GLASS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.6 }));
    const facadeMats = BASES.map(b => new THREE.MeshStandardMaterial({ map: facadeTex(b, '#232c38', true), roughness: 0.85 }));
    const facadeMatsPlain = BASES.map(b => new THREE.MeshStandardMaterial({ map: facadeTex(b, '#232c38', false), roughness: 0.85 }));
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.6, metalness: 0.5 });
    const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc95e, emissiveIntensity: 0.4 });
    lampMats = [lampHeadMat];
    G.lampMat = lampHeadMat;

    let nB = 0;
    // buildings per block
    for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) {
      if (isPark(i, j)) continue;
      const cx = -416 + i * 64, cz = -416 + j * 64;
      if (cx > 390) continue; // beach strip
      const d = district(i, j);
      const hBase = d === 'downtown' ? 55 : d === 'oldtown' ? 16 : d === 'marina' ? 30 : 38;
      const count = d === 'downtown' ? 2 : 3;
      for (let b = 0; b < count; b++) {
        const bx = cx + (b === 0 ? -13 : b === 1 ? 13 : 0);
        const bz = cz + (b === 2 ? -13 : b === 0 ? 12 : -12);
        const w = rand(16, 22), dep = rand(16, 22);
        const h = hBase * rand(0.55, 1.35);
        const glass = d === 'downtown' && hash2(i * 7 + b, j * 3) < 0.6;
        const mat = glass ? pick(glassMats) : (b === 0 ? pick(facadeMats) : pick(facadeMatsPlain));
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), [mat, mat, roofMat, roofMat, mat, mat]);
        m.position.set(bx, h / 2, bz);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m); nB++;
        addCollider(bx, bz, w / 2 + 0.5, dep / 2 + 0.5);
        // rooftop props / balconies / antennas
        if (hash2(i + b * 3, j) < 0.5) {
          const ac = box(3, 1.2, 2, roofMat, bx + w / 4, h + 0.6, bz, 0);
          ac.castShadow = false;
        }
        if (h > 40 && hash2(i, j + b) < 0.6) {
          const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 9, 6), lampPoleMat);
          ant.position.set(bx, h + 4.5, bz); scene.add(ant);
        }
        if (hash2(b, i * 5 + j) < 0.4) box(w + 1.5, 0.4, 3, roofMat, bx, h * 0.55, bz + dep / 2 + 0.4, 0); // balcony slab
      }
    }
    // 3 landmark towers
    const towers = [[-160, -160, 110], [160, -224, 95], [224, 160, 88]];
    for (const [tx, tz, th] of towers) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(34, th, 34), [pick(glassMats), pick(glassMats), roofMat, roofMat, pick(glassMats), pick(glassMats)]);
      m.position.set(tx, th / 2, tz); m.castShadow = true; scene.add(m); nB++;
      addCollider(tx, tz, 17.5, 17.5);
      // setback crown
      box(20, 10, 20, pick(glassMats), tx, th + 5, tz, 0);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 16, 6), lampPoleMat);
      ant.position.set(tx, th + 18, tz); scene.add(ant);
    }
    // plaza fountain (centre)
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, 1.2, 20), new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.8 }));
    basin.position.set(0, 0.6, 0); basin.castShadow = true; scene.add(basin);
    const fwater = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x3a7ab5, roughness: 0.15, metalness: 0.3 }));
    fwater.position.set(0, 1.1, 0); scene.add(fwater);
    addCollider(0, 0, 10, 10);
    // parks: trees + benches
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6b34, roughness: 1 });
    for (const [pi, pj] of [[6, 6], [7, 6], [6, 7], [7, 7], [2, 3], [3, 3]]) {
      const cx = -416 + pi * 64, cz = -416 + pj * 64;
      for (let t = 0; t < 7; t++) {
        const tx = cx + rand(-22, 22), tz = cz + rand(-22, 22);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 6), trunkMat);
        trunk.position.set(tx, 2, tz); trunk.castShadow = true; scene.add(trunk);
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(rand(2.5, 4), 8, 6), leafMat);
        leaf.position.set(tx, 5.5, tz); leaf.castShadow = true; scene.add(leaf);
        addCollider(tx, tz, 1, 1);
      }
      box(4, 1, 1.2, new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }), cx - 8, 0.5, cz + 10, 0);
    }
    // beach palms
    for (let p = 0; p < 14; p++) {
      const pz = -400 + p * 58;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 7, 6), trunkMat);
      trunk.position.set(424, 3.5, pz); trunk.rotation.z = 0.15; scene.add(trunk);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), leafMat);
      leaf.position.set(425.5, 7.2, pz); scene.add(leaf);
    }
    // market stalls (Old Town, around -264,258)
    const stallMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a3, roughness: 0.9 });
    const awnMat = new THREE.MeshStandardMaterial({ color: 0xc65a3a, roughness: 0.8 });
    for (let s = 0; s < 6; s++) {
      const sx = -288 + s * 10, sz = 258 + (s % 2) * 8;
      box(6, 2.4, 4, stallMat, sx, 1.2, sz, 0);
      box(6.6, 0.3, 4.6, awnMat, sx, 2.8, sz, 0);
      addCollider(sx, sz, 3.2, 2.2);
    }
    // neon signs + billboards
    const neons = [
      ['VERDE', 0xff5a8a, -32, 40, 224], ['TACOS', 0xffd23e, -64, 40, 120],
      ['HOTEL', 0x5ad2ff, 96, 40, -224], ['BAR', 0xff8a3d, 160, 40, -96],
      ['GARAGE', 0x9fe6a0, 192, 40, -128], ['CINEMA', 0xc98aff, -224, 40, -160],
    ];
    for (const [txt, col, sx, sy, sz] of neons) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(16, 4, 0.6),
        new THREE.MeshStandardMaterial({ map: signTex(txt, '#ffffff', '#' + col.toString(16).padStart(6, '0')), emissive: col, emissiveIntensity: 0.9 }));
      m.position.set(sx, sy, sz); scene.add(m);
    }
    const boards = [
      ['PORTO VERDE', 'Sun, sea and second chances.', -96, -288],
      ['EL FARO TACOS', 'Open late. Cash only.', 288, 96],
      ['SUNRAY GARAGE', 'We fix anything with wheels.', -288, 288],
    ];
    for (const [t1, t2, bx, bz] of boards) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 14, 8), lampPoleMat);
      pole.position.set(bx, 7, bz); scene.add(pole);
      const tex = canvasTex(512, 128, (g, w, h) => {
        g.fillStyle = '#1c2430'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffe27a'; g.font = 'bold 44px Verdana'; g.textAlign = 'center';
        g.fillText(t1, w / 2, 56); g.fillStyle = '#cfe3ff'; g.font = '24px Verdana'; g.fillText(t2, w / 2, 96);
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(24, 6, 0.5), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveIntensity: 0.25 }));
      b.position.set(bx, 16, bz); scene.add(b);
      addCollider(bx, bz, 1, 1);
    }
    // lamps along roads (emissive heads only — no PointLights)
    const lampGeo = new THREE.CylinderGeometry(0.18, 0.25, 7, 6);
    const headGeo = new THREE.SphereGeometry(0.55, 8, 6);
    for (let k = 0; k <= 14; k++) {
      for (let d = -416; d <= 416; d += 128) {
        const lx = -448 + k * 64 + 8, lz = d;
        const pole = new THREE.Mesh(lampGeo, lampPoleMat);
        pole.position.set(lx, 3.5, lz); scene.add(pole);
        const head = new THREE.Mesh(headGeo, lampHeadMat);
        head.position.set(lx, 7.2, lz); scene.add(head);
        const pole2 = new THREE.Mesh(lampGeo, lampPoleMat);
        pole2.position.set(d, 3.5, lx); scene.add(pole2);
        const head2 = new THREE.Mesh(headGeo, lampHeadMat);
        head2.position.set(d, 7.2, lx); scene.add(head2);
      }
    }
    // hydrants, bins, bus stops
    const hydMat = new THREE.MeshStandardMaterial({ color: 0xc23a2e, roughness: 0.6 });
    const binMat = new THREE.MeshStandardMaterial({ color: 0x2e4a2e, roughness: 0.8 });
    for (let n = 0; n < 26; n++) {
      const hx = rand(-420, 420), hz = rand(-420, 420);
      if (!onRoad(hx, hz)) continue;
      const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.1, 8), hydMat);
      hyd.position.set(hx, 0.55, hz); scene.add(hyd);
      const bin = box(1.2, 1.4, 1.2, binMat, hx + 2, 0.7, hz, 0);
      bin.castShadow = false;
    }
    for (const [sx, sz, ry] of [[-64, -320, 0], [320, 64, 1.57], [64, 320, 0], [-320, -64, 1.57]]) {
      box(8, 0.3, 3, awnMat, sx, 3.2, sz, ry);
      box(0.3, 3.2, 0.3, lampPoleMat, sx - 3.5, 1.6, sz - 1.2, 0);
      box(0.3, 3.2, 0.3, lampPoleMat, sx + 3.5, 1.6, sz - 1.2, 0);
      box(6, 0.8, 1, new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 }), sx, 0.4, sz - 1, ry);
    }
    G.stats.buildings = nB;
    // player headlight (one spotlight, only on at night)
    G.headlight = new THREE.SpotLight(0xffe9a8, 0, 60, 0.5, 0.5, 1.2);
    scene.add(G.headlight); scene.add(G.headlight.target);
  }
  // Day/night keyframes over the 240s cycle, opening at golden-hour sunset.
  // stops: [t, sunEl, sunAz, sunCol, sunI, hemiI, fogCol, skyCol, lampI]
  const STOPS = [
    [0, 0.16, 0.9, 0xff9a4d, 1.7, 0.55, 0xe8965a, 0xd97b3f, 0.25],
    [40, 0.05, 1.1, 0xff7a3d, 1.1, 0.4, 0x8a5a6a, 0x6a4a5e, 0.7],
    [80, -0.08, 1.4, 0x3a4a6a, 0.25, 0.28, 0x141c2e, 0x0d1424, 1.4],
    [140, -0.1, 1.8, 0x2a3a5a, 0.2, 0.25, 0x101828, 0x0a1220, 1.5],
    [180, 0.02, 2.2, 0xffb36b, 0.7, 0.4, 0x5a5a6a, 0x4a4a5e, 0.9],
    [220, 0.12, 2.6, 0xffc36b, 1.3, 0.5, 0xc98a5a, 0xb56a3f, 0.4],
    [240, 0.16, 0.9, 0xff9a4d, 1.7, 0.55, 0xe8965a, 0xd97b3f, 0.25],
  ];
  function updateDayNight() {
    const t = G.dayT % 240;
    let a = STOPS[0], b = STOPS[STOPS.length - 1];
    for (let i = 0; i < STOPS.length - 1; i++) {
      if (t >= STOPS[i][0] && t <= STOPS[i + 1][0]) { a = STOPS[i]; b = STOPS[i + 1]; break; }
    }
    const f = (b[0] - a[0]) <= 0 ? 0 : (t - a[0]) / (b[0] - a[0]);
    const el = lerp(a[1], b[1], f), az = lerp(a[2], b[2], f);
    const sunI = lerp(a[4], b[4], f), hemiI = lerp(a[5], b[5], f), lampI = lerp(a[8], b[8], f);
    const fog = new THREE.Color(a[6]).lerp(new THREE.Color(b[6]), f);
    const sky = new THREE.Color(a[7]).lerp(new THREE.Color(b[7]), f);
    const sunCol = new THREE.Color(a[3]).lerp(new THREE.Color(b[3]), f);
    if (G.sun) {
      G.sun.position.set(Math.cos(az) * 300, Math.max(20, Math.sin(el) * 300 + 40), Math.sin(az) * 300);
      G.sun.color.copy(sunCol); G.sun.intensity = sunI;
    }
    if (G.hemi) G.hemi.intensity = hemiI;
    G.scene.fog.color.copy(fog); G.scene.background.copy(sky);
    if (G.lampMat) G.lampMat.emissiveIntensity = lampI;
    const night = sunI < 0.5;
    if (G.headlight) {
      G.headlight.intensity = night && G.player && !G.player.onFoot ? 90 : 0;
      if (G.player && G.player.car) {
        G.headlight.position.copy(G.player.car.mesh.position).add(new THREE.Vector3(0, 1.6, 0));
        const fwd = new THREE.Vector3(Math.sin(G.player.car.heading), 0, Math.cos(G.player.car.heading));
        G.headlight.target.position.copy(G.headlight.position).add(fwd.multiplyScalar(20));
      }
    }
    return night;
  }
  function isDay() { return (G.dayT % 240) < 120; }
  return { build, updateDayNight, isDay, isPark, district, PITCH, HALF };
})();

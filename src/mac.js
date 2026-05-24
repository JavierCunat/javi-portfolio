import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * mountMac(container, options) — drops a Macintosh scene into `container`.
 *
 * options:
 *   mode:           'full' | 'mini'  (default 'full')
 *   onScreenClick:  () => void       — called when the CRT is clicked (mini mode)
 *   projects:       [{name, desc}]   — replaces default project list in the folder
 *
 * returns { destroy }
 */
export function mountMac(container, options = {}) {
  const mode = options.mode || 'full';
  const isFull = mode === 'full';

  const PROJECTS = options.projects || [
    { name: 'proxi.health',     desc: 'referral SaaS · $3k MRR' },
    { name: 'cryptokids.org',   desc: 'closing the digital divide' },
    { name: 'amazon · 2025',    desc: 'bedrock LLM investigator tool' },
    { name: 'amazon · 2024',    desc: 'graph DB ingestion · 99% cov' },
    { name: 'codepath · ta',    desc: 'android / kotlin teaching' },
    { name: '@javiercunat',     desc: 'tiktok · instagram · github' },
  ];

  // ---------- SCENE SETUP ----------
  const w0 = container.clientWidth || window.innerWidth;
  const h0 = container.clientHeight || window.innerHeight;

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(35, w0 / h0, 0.1, 100);
  const INITIAL_Z = isFull ? 6 : 5;
  camera.position.set(0, 1.2, INITIAL_Z);
  camera.lookAt(0, 0.7, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w0, h0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // ---------- LIGHTS ----------
  scene.add(new THREE.AmbientLight(0xfff4e0, 0.55));

  const key = new THREE.DirectionalLight(0xffe8c4, 1.1);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc4d4ff, 0.35);
  fill.position.set(-4, 2, 2);
  scene.add(fill);

  const rim = new THREE.PointLight(0xff9966, 0.4, 10);
  rim.position.set(-2, 1.5, -2);
  scene.add(rim);

  // ---------- GROUND ----------
  if (isFull) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0xc4b89a, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ---------- MAC GROUP ----------
  const macGroup = new THREE.Group();
  scene.add(macGroup);

  // ---------- CRT canvas texture ----------
  const SCREEN_W = 512;
  const SCREEN_H = 384;
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = SCREEN_W;
  screenCanvas.height = SCREEN_H;
  const sctx = screenCanvas.getContext('2d');

  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.minFilter = THREE.LinearFilter;
  screenTex.magFilter = THREE.NearestFilter;
  screenTex.center.set(0.5, 0.5);
  screenTex.rotation = -Math.PI / 2;
  screenTex.flipY = false;
  screenTex.wrapS = THREE.RepeatWrapping;
  screenTex.repeat.x = -1;

  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });

  let screenMesh = null;

  // ---------- LOAD GLB ----------
  const loader = new GLTFLoader();
  loader.load('/macintosh.glb', (gltf) => {
    const model = gltf.scene;

    // Center + scale
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const targetHeight = 2.0;
    const scale = targetHeight / size.y;
    model.scale.setScalar(scale);
    model.position.set(
      -center.x * scale,
      -box.min.y * scale - 0.5,
      -center.z * scale
    );

    const meshes = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      meshes.push(o);
    });

    // Find the screen mesh
    let found = meshes.find(m => /screen|crt|display|glass|monitor|tube/i.test(m.name));
    if (!found) {
      const modelBox = new THREE.Box3().setFromObject(model);
      const frontZ = modelBox.max.z;
      const candidates = meshes.map(m => {
        const b = new THREE.Box3().setFromObject(m);
        const s = b.getSize(new THREE.Vector3());
        const flatness = s.z / Math.max(s.x, s.y);
        const frontness = 1 - Math.min(1, (frontZ - b.max.z) / 0.1);
        return { m, score: frontness - flatness, area: s.x * s.y };
      }).filter(c => c.area > 0.01).sort((a, b) => b.score - a.score);
      found = candidates[0]?.m || null;
    }

    macGroup.add(model);

    if (found) {
      found.material = screenMat;
      screenMesh = found;
    }
  });

  // ---------- CRT DRAWING ----------
  let screenState = isFull ? 'boot' : 'desktop';
  let folderAnimT = 0;
  let bootT = 0;

  function drawCheckerPattern(ctx, x, y, w, h) {
    for (let i = 0; i < w; i += 2) {
      for (let j = 0; j < h; j += 2) {
        ctx.fillStyle = ((i + j) % 4 === 0) ? '#000' : '#fff';
        ctx.fillRect(x + i, y + j, 2, 2);
      }
    }
  }

  function drawIcon(ctx, cx, cy, letter) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 22, cy - 18, 44, 36);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 22, cy - 18, 44, 36);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(letter, cx, cy + 6);
    ctx.textAlign = 'left';
  }

  function drawFolderIcon(ctx, cx, cy) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(cx - 22, cy - 18, 22, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(cx - 22, cy - 12, 44, 30); ctx.fill(); ctx.stroke();
  }

  function drawTrash(ctx, cx, cy) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(cx - 18, cy - 18, 36, 36); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(cx - 22, cy - 22, 44, 6); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 8 + i * 8, cy - 14);
      ctx.lineTo(cx - 8 + i * 8, cy + 14);
      ctx.stroke();
    }
  }

  function drawDesktop(ctx) {
    drawCheckerPattern(ctx, 0, 0, SCREEN_W, SCREEN_H);

    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SCREEN_W, 32);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 30, SCREEN_W, 2);
    ctx.fillRect(14, 8, 16, 18);

    ctx.font = 'bold 18px "Chicago", "Geneva", monospace';
    ctx.fillStyle = '#000';
    ctx.fillText('File   Edit   View   Special', 50, 22);

    ctx.font = '16px "Chicago", monospace';
    ctx.fillText('11:47 PM', SCREEN_W - 100, 22);

    drawIcon(ctx, SCREEN_W - 70, 60, 'HD');
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    const hdLabel = 'Macintosh HD';
    const w1 = ctx.measureText(hdLabel).width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(SCREEN_W - 70 - w1/2 - 4, 105, w1 + 8, 18);
    ctx.fillStyle = '#000';
    ctx.fillText(hdLabel, SCREEN_W - 70, 119);

    drawFolderIcon(ctx, SCREEN_W - 70, 160);
    const fLabel = 'Projects';
    const w2 = ctx.measureText(fLabel).width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(SCREEN_W - 70 - w2/2 - 4, 205, w2 + 8, 18);
    ctx.fillStyle = '#000';
    ctx.fillText(fLabel, SCREEN_W - 70, 219);

    drawTrash(ctx, SCREEN_W - 70, SCREEN_H - 70);
    const tLabel = 'Trash';
    const w3 = ctx.measureText(tLabel).width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(SCREEN_W - 70 - w3/2 - 4, SCREEN_H - 25, w3 + 8, 18);
    ctx.fillStyle = '#000';
    ctx.fillText(tLabel, SCREEN_W - 70, SCREEN_H - 11);

    ctx.textAlign = 'left';
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function drawFolder(ctx, animT) {
    drawCheckerPattern(ctx, 0, 0, SCREEN_W, SCREEN_H);

    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SCREEN_W, 32);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 30, SCREEN_W, 2);
    ctx.font = 'bold 18px monospace';
    ctx.fillRect(14, 8, 16, 18);
    ctx.fillText('File   Edit   View   Special', 50, 22);
    ctx.font = '16px monospace';
    ctx.fillText('11:47 PM', SCREEN_W - 100, 22);

    const startX = SCREEN_W - 90, startY = 140;
    const startW = 40, startH = 40;
    const endX = 30, endY = 50;
    const endW = SCREEN_W - 60, endH = SCREEN_H - 80;

    const t = easeOutCubic(animT);
    const x = startX + (endX - startX) * t;
    const y = startY + (endY - startY) * t;
    const w = startW + (endW - startW) * t;
    const h = startH + (endH - startH) * t;

    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    if (animT > 0.6) {
      const titleH = 18;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, w, titleH);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      for (let i = 4; i < titleH - 2; i += 2) {
        ctx.beginPath();
        ctx.moveTo(x + 2, y + i);
        ctx.lineTo(x + w - 2, y + i);
        ctx.stroke();
      }
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + titleH);
      ctx.lineTo(x + w, y + titleH);
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 6, y + 4, 11, 11);
      ctx.strokeRect(x + 6, y + 4, 11, 11);

      const title = 'Projects';
      ctx.font = 'bold 14px monospace';
      const tw = ctx.measureText(title).width;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + w/2 - tw/2 - 6, y + 2, tw + 12, 14);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText(title, x + w/2, y + 14);
      ctx.textAlign = 'left';

      ctx.font = '12px monospace';
      ctx.fillText(`${PROJECTS.length} items    javi’s portfolio`, x + 10, y + 36);

      ctx.beginPath();
      ctx.moveTo(x, y + 42);
      ctx.lineTo(x + w, y + 42);
      ctx.stroke();
    }

    if (animT >= 1) {
      ctx.font = '13px monospace';
      ctx.fillStyle = '#000';
      PROJECTS.forEach((p, i) => {
        const rowY = y + 60 + i * 38;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.rect(x + 16, rowY - 12, 18, 22); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 29, rowY - 12);
        ctx.lineTo(x + 34, rowY - 7);
        ctx.lineTo(x + 29, rowY - 7);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(p.name, x + 46, rowY - 2);
        ctx.font = '11px monospace';
        ctx.fillStyle = '#444';
        ctx.fillText(p.desc, x + 46, rowY + 12);
      });
    }
  }

  function drawBoot(ctx, t) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (t > 0.3) {
      const alpha = Math.min(1, (t - 0.3) / 0.4);
      ctx.globalAlpha = alpha;
      const cx = SCREEN_W / 2, cy = SCREEN_H / 2;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 30, cy - 36, 60, 72);
      ctx.strokeRect(cx - 22, cy - 28, 44, 36);
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(cx - 10, cy - 14, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 10, cy - 14, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy - 4, 8, 0, Math.PI); ctx.stroke();
      ctx.fillRect(cx - 8, cy + 22, 16, 2);
      ctx.globalAlpha = 1;
    }
  }

  function drawScreen() {
    if (screenState === 'boot')      drawBoot(sctx, bootT);
    else if (screenState === 'desktop')  drawDesktop(sctx);
    else if (screenState === 'opening')  drawFolder(sctx, folderAnimT);
    else if (screenState === 'folder')   drawFolder(sctx, 1);

    // Scanlines
    sctx.globalAlpha = 0.08;
    sctx.fillStyle = '#000';
    for (let y = 0; y < SCREEN_H; y += 3) sctx.fillRect(0, y, SCREEN_W, 1);
    sctx.globalAlpha = 1;

    // Vignette
    const grad = sctx.createRadialGradient(
      SCREEN_W/2, SCREEN_H/2, SCREEN_W * 0.3,
      SCREEN_W/2, SCREEN_H/2, SCREEN_W * 0.7
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    screenTex.needsUpdate = true;
  }

  // ---------- INTERACTION ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pointerToNDC(e, rect) {
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function hitsMac(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom) return false;
    pointerToNDC(e, rect);
    raycaster.setFromCamera(pointer, camera);
    if (screenMesh) {
      const direct = raycaster.intersectObject(screenMesh, true);
      if (direct.length > 0) return true;
    }
    return raycaster.intersectObject(macGroup, true).length > 0;
  }

  function onClick(e) {
    if (!hitsMac(e)) return;
    if (!isFull && options.onScreenClick) {
      options.onScreenClick();
      return;
    }
    if (screenState === 'desktop') {
      screenState = 'opening';
      folderAnimT = 0;
      document.getElementById('hint')?.classList.add('hidden');
    } else if (screenState === 'folder') {
      screenState = 'desktop';
      document.getElementById('hint')?.classList.remove('hidden');
    }
  }

  function onMove(e) {
    document.body.style.cursor = hitsMac(e) ? 'pointer' : 'default';
  }

  // For mini-mode we listen on the renderer's canvas (which is positioned in
  // the corner via CSS). For full mode we listen on window so users can click
  // through the chrome.
  const evtTarget = isFull ? window : renderer.domElement;
  evtTarget.addEventListener('click', onClick);
  evtTarget.addEventListener('mousemove', onMove);

  // Parallax + zoom (full mode only — mini mode stays still + scrolls page)
  let mx = 0, my = 0;
  let zoomDist = INITIAL_Z;
  const ZOOM_MIN = 2.5;
  const ZOOM_MAX = 14;

  let onWheel = null;
  if (isFull) {
    window.addEventListener('mousemove', (e) => {
      mx = (e.clientX / window.innerWidth) - 0.5;
      my = (e.clientY / window.innerHeight) - 0.5;
    });
    onWheel = (e) => {
      e.preventDefault();
      zoomDist = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomDist + e.deltaY * 0.0025));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
  }

  // ---------- RESIZE ----------
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  });
  ro.observe(container);

  // ---------- LOOP ----------
  const clock = new THREE.Clock();
  let raf = 0;
  let miniSpin = 0;

  function animate() {
    raf = requestAnimationFrame(animate);
    const dt = clock.getDelta();

    if (screenState === 'boot') {
      bootT += dt * 0.5;
      if (bootT >= 1.2) screenState = 'desktop';
    }
    if (screenState === 'opening') {
      folderAnimT += dt * 2.2;
      if (folderAnimT >= 1) { folderAnimT = 1; screenState = 'folder'; }
    }
    drawScreen();

    if (isFull) {
      const targetX = mx * 0.4;
      const targetY = 1.2 + my * 0.15;
      camera.position.x += (targetX - camera.position.x) * 0.04;
      camera.position.y += (targetY - camera.position.y) * 0.04;
      camera.position.z += (zoomDist - camera.position.z) * 0.08;
      camera.lookAt(0, 0.7, 0);
    } else {
      // Gentle auto-rotate in mini mode
      miniSpin += dt * 0.15;
      camera.position.x = Math.sin(miniSpin) * 1.2;
      camera.position.z = INITIAL_Z + Math.cos(miniSpin) * 0.4;
      camera.lookAt(0, 0.7, 0);
    }

    renderer.render(scene, camera);
  }
  animate();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      evtTarget.removeEventListener('click', onClick);
      evtTarget.removeEventListener('mousemove', onMove);
      if (onWheel) window.removeEventListener('wheel', onWheel);
      renderer.dispose();
      pmrem.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}

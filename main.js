import * as THREE from 'three';
import { CENTER_QUOTES, MEMORIES } from './memories.js';
import { cardVertexShader, cardFragmentShader } from './shaders.js';

// ============================================================================
// 1. SCENE, CAMERA & RENDERER SETUP
// ============================================================================
const container = document.getElementById('canvas-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1015);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  120
);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// ============================================================================
// 2. ROMANTIC PRELOADER — WAIT FOR ALL 30 PHOTOS BEFORE SHOWING UI
// ============================================================================
const loaderBar = document.getElementById('loader-bar');
const loaderCount = document.getElementById('loader-count');
const loaderPercent = document.getElementById('loader-percent');

const totalPhotosToLoad = MEMORIES.length; // 30 photos
let loadedPhotosCount = 0;
let isAppReady = false;

function handlePhotoLoaded() {
  loadedPhotosCount++;
  const pct = Math.min(
    100,
    Math.round((loadedPhotosCount / totalPhotosToLoad) * 100)
  );

  if (loaderBar) loaderBar.style.width = `${pct}%`;
  if (loaderCount) {
    loaderCount.textContent = `${loadedPhotosCount} / ${totalPhotosToLoad} Memories`;
  }
  if (loaderPercent) {
    loaderPercent.textContent = `${pct}%`;
  }

  if (loadedPhotosCount >= totalPhotosToLoad && !isAppReady) {
    isAppReady = true;
    // Brief pause at 100% so she sees the full heart progress bar complete
    setTimeout(() => {
      document.body.classList.remove('is-loading');
    }, 380);
  }
}

function createPlaceholderTexture(index, title) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');

  const hues = [340, 215, 25, 275, 190, 320];
  const h = hues[index % hues.length];
  const grad = ctx.createLinearGradient(0, 0, 512, 640);
  grad.addColorStop(0, `hsl(${h}, 28%, 26%)`);
  grad.addColorStop(1, `hsl(${(h + 35) % 360}, 32%, 14%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 640);

  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.font = '600 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 320);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

const allCards = [];

const memoryAssets = MEMORIES.map((mem, idx) => {
  const placeholder = createPlaceholderTexture(idx, mem.title);
  const asset = {
    memory: mem,
    index: idx,
    texture: placeholder,
    aspect: 0.8,
  };

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const tex = new THREE.Texture(img);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    asset.texture = tex;
    asset.aspect = (img.naturalWidth || 800) / (img.naturalHeight || 1000);

    allCards.forEach((card) => {
      if (card.memoryIndex === idx) {
        card.material.uniforms.uTex.value = tex;
        card.material.uniforms.uTexAspect.value = asset.aspect;
      }
    });

    handlePhotoLoaded();
  };
  img.onerror = () => {
    // Even if a network hiccup happens, don't block the loading screen forever
    handlePhotoLoaded();
  };
  img.src = mem.image;

  return asset;
});

// ============================================================================
// 3. BUILD ANIMO 3D CARD TUNNEL — 100% FILLED WITH PHOTOS (ZERO EMPTY GAPS)
// ============================================================================
// 15 slices × 4 walls (Floor, Ceiling, Left, Right) = 60 photo cards in the tunnel!
// Every single wall slot displays one of the 30 photos (cycling 2x cleanly),
// so there are NEVER any empty grey slate spacers in the tunnel.
const NUM_SLICES = 15;
let sliceDepth = 4.5;
let totalTunnelLen = NUM_SLICES * sliceDepth;
let visibleTunnelEnd = -36.0;

let isMobileViewport = window.innerWidth <= 768;
let tunnelHeight = 9.0;
let tunnelWidth = tunnelHeight * (window.innerWidth / window.innerHeight);

const tunnelGroup = new THREE.Group();
scene.add(tunnelGroup);

// Dark Center End-Cap Box at the end of the visible corridor
const endCapGeo = new THREE.PlaneGeometry(1, 1);
const endCapMat = new THREE.MeshBasicMaterial({ color: 0x11131a });
const endCapMesh = new THREE.Mesh(endCapGeo, endCapMat);
endCapMesh.position.set(0, 0, visibleTunnelEnd);
tunnelGroup.add(endCapMesh);

const sharedPlaneGeo = new THREE.PlaneGeometry(1, 1, 1, 1);

let cardSequence = 0;

for (let s = 0; s < NUM_SLICES; s++) {
  // 4 walls per slice: 0 = Floor, 1 = Ceiling, 2 = Left Wall, 3 = Right Wall
  for (let w = 0; w < 4; w++) {
    const isFloorOrCeil = w === 0 || w === 1;
    // Every single slot in the tunnel is a photo!
    const memIndex = cardSequence % MEMORIES.length;
    const photoOrderIndex = cardSequence; // 0 .. 59 (0..29 are the unique 30 for Ring/Gallery)
    cardSequence++;

    const initialTex = memoryAssets[memIndex].texture;
    const initialAspect = memoryAssets[memIndex].aspect;
    const slateHex = isFloorOrCeil ? 0x5c606b : 0x696e79;
    const uvOrient = w === 1 ? 1 : w === 0 ? 2 : 0;

    const mat = new THREE.ShaderMaterial({
      vertexShader: cardVertexShader,
      fragmentShader: cardFragmentShader,
      uniforms: {
        uTex: { value: initialTex },
        uCardSize: { value: new THREE.Vector2(4, 4) },
        uTexAspect: { value: initialAspect },
        uIsPhoto: { value: 1.0 },
        uSlateColor: { value: new THREE.Color(slateHex) },
        uFrameColor: { value: new THREE.Color(0x0b0c10) },
        uBorderSize: { value: 0.2 },
        uCornerRadius: { value: 0.36 },
        uHover: { value: 0.0 },
        uOpacity: { value: 1.0 },
        uUvOrientation: { value: uvOrient },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(sharedPlaneGeo, mat);

    const cardObj = {
      mesh,
      material: mat,
      sliceIndex: s,
      wallIndex: w,
      isPhoto: true,
      memoryIndex: memIndex,
      photoOrderIndex,
      hoverTarget: 0.0,
      currentSize: new THREE.Vector2(4, 4),
      targetSize: new THREE.Vector2(4, 4),
      targetPos: new THREE.Vector3(),
      targetQuat: new THREE.Quaternion(),
      targetOpacity: 1.0,
    };

    mesh.userData.cardObj = cardObj;
    tunnelGroup.add(mesh);
    allCards.push(cardObj);
  }
}

// ============================================================================
// 4. LAYOUT TARGET COMPUTATION (TUNNEL / 3D RING / FLOATING GALLERY)
// ============================================================================
let currentMode = 'tunnel'; // 'tunnel' | 'ring' | 'gallery'
let travelDistance = 0.0;
let scrollVelocity = 0.0;
let isAutoPlaying = true;
const AUTO_SPEED = 2.25;

const dummyObj = new THREE.Object3D();

function updateTunnelDimensions() {
  const aspect = window.innerWidth / window.innerHeight;
  isMobileViewport = window.innerWidth <= 768 || aspect < 0.85;

  if (isMobileViewport) {
    // Mobile Portrait: tuned so left/right/top/bottom photo walls look large & clear
    // and the center dark box is ~55% of screen width for the love quote
    camera.fov = 58;
    tunnelHeight = 9.2;
    tunnelWidth = Math.max(5.6, tunnelHeight * aspect * 1.12);
    sliceDepth = 3.8;
    totalTunnelLen = NUM_SLICES * sliceDepth;
    visibleTunnelEnd = -23.5;
  } else {
    // Desktop / Landscape
    camera.fov = 50;
    tunnelHeight = 9.0;
    tunnelWidth = tunnelHeight * aspect;
    sliceDepth = 4.65;
    totalTunnelLen = NUM_SLICES * sliceDepth;
    visibleTunnelEnd = -38.5;
  }

  camera.updateProjectionMatrix();
  endCapMesh.position.set(0, 0, visibleTunnelEnd);
  endCapMesh.scale.set(tunnelWidth * 1.04, tunnelHeight * 1.04, 1);
}

function computeCardTargets(elapsed) {
  if (currentMode === 'tunnel') {
    endCapMesh.visible = true;
    const borderSize = isMobileViewport ? 0.16 : 0.21;
    const cornerRad = isMobileViewport ? 0.28 : 0.36;

    for (let i = 0; i < allCards.length; i++) {
      const card = allCards[i];
      const s = card.sliceIndex;
      const w = card.wallIndex;

      // Infinite modulo wrapping along the 15-slice Z corridor
      const rawZ = -s * sliceDepth + travelDistance;
      const wrappedZ =
        ((((rawZ - sliceDepth * 0.5) % totalTunnelLen) + totalTunnelLen) %
          totalTunnelLen) -
        totalTunnelLen +
        sliceDepth * 0.5;

      let cardW, cardH;
      dummyObj.position.set(0, 0, 0);
      dummyObj.rotation.set(0, 0, 0);

      if (w === 0) {
        // Bottom (Floor) Wall
        cardW = tunnelWidth;
        cardH = sliceDepth;
        dummyObj.position.set(0, -tunnelHeight * 0.5, wrappedZ);
        dummyObj.rotation.set(-Math.PI * 0.5, 0, 0);
      } else if (w === 1) {
        // Top (Ceiling) Wall
        cardW = tunnelWidth;
        cardH = sliceDepth;
        dummyObj.position.set(0, tunnelHeight * 0.5, wrappedZ);
        dummyObj.rotation.set(Math.PI * 0.5, 0, 0);
      } else if (w === 2) {
        // Left Wall
        cardW = sliceDepth;
        cardH = tunnelHeight;
        dummyObj.position.set(-tunnelWidth * 0.5, 0, wrappedZ);
        dummyObj.rotation.set(0, Math.PI * 0.5, 0);
      } else {
        // Right Wall
        cardW = sliceDepth;
        cardH = tunnelHeight;
        dummyObj.position.set(tunnelWidth * 0.5, 0, wrappedZ);
        dummyObj.rotation.set(0, -Math.PI * 0.5, 0);
      }

      dummyObj.updateMatrix();
      card.targetPos.copy(dummyObj.position);
      card.targetQuat.copy(dummyObj.quaternion);
      card.targetSize.set(cardW, cardH);

      // Show slices in front of the dark center box
      if (wrappedZ < visibleTunnelEnd + 0.35) {
        card.targetOpacity = 0.0;
      } else {
        card.targetOpacity = 1.0;
      }

      card.material.uniforms.uBorderSize.value = borderSize;
      card.material.uniforms.uCornerRadius.value = cornerRad;
    }
  } else if (currentMode === 'ring') {
    endCapMesh.visible = false;
    // Display the 30 unique photos (photoOrderIndex 0..29) in a 2-tier 3D Orbital Ring
    const perRing = 15;
    const radius = isMobileViewport ? 11.2 : 14.5;
    const centerZ = isMobileViewport ? -16.5 : -18.5;
    const tierY = isMobileViewport ? 2.35 : 2.55;
    const cardW = isMobileViewport ? 2.55 : 3.2;
    const cardH = isMobileViewport ? 3.35 : 4.1;

    for (let i = 0; i < allCards.length; i++) {
      const card = allCards[i];
      if (card.photoOrderIndex >= MEMORIES.length) {
        card.targetOpacity = 0.0;
        card.targetPos.set(0, 0, -65);
        continue;
      }

      const idx = card.photoOrderIndex;
      const tier = idx < perRing ? 0 : 1;
      const ringIdx = idx % perRing;
      const tierOffsetAngle = tier * (Math.PI / perRing);

      const angle =
        (ringIdx / perRing) * Math.PI * 2 +
        tierOffsetAngle +
        travelDistance * 0.065 * (tier === 0 ? 1 : -0.85);

      const x = Math.sin(angle) * radius;
      const z = centerZ + Math.cos(angle) * radius;
      const baseY = tier === 0 ? tierY : -tierY;
      const y = baseY + Math.sin(angle * 2.0 + elapsed * 0.7) * 0.3;

      dummyObj.position.set(x, y, z);
      dummyObj.rotation.set(0, angle, 0);
      dummyObj.updateMatrix();

      card.targetPos.copy(dummyObj.position);
      card.targetQuat.copy(dummyObj.quaternion);
      card.targetSize.set(cardW, cardH);
      card.targetOpacity = 1.0;
      card.material.uniforms.uBorderSize.value = 0.13;
      card.material.uniforms.uCornerRadius.value = 0.26;
    }
  } else if (currentMode === 'gallery') {
    endCapMesh.visible = false;
    // Responsive 3D Floating Perspective Gallery for all 30 unique photos:
    // 2 columns on mobile portrait so cards are large & touch-friendly, 5 columns on desktop
    const cols = isMobileViewport ? 2 : 5;
    const rows = Math.ceil(MEMORIES.length / cols);
    const spacingX = isMobileViewport ? 3.15 : 3.85;
    const spacingY = isMobileViewport ? 4.05 : 4.45;
    const cardW = isMobileViewport ? 2.75 : 3.25;
    const cardH = isMobileViewport ? 3.55 : 4.05;
    const baseZ = isMobileViewport ? -11.8 : -14.5;
    const totalGridHeight = rows * spacingY;

    for (let i = 0; i < allCards.length; i++) {
      const card = allCards[i];
      if (card.photoOrderIndex >= MEMORIES.length) {
        card.targetOpacity = 0.0;
        card.targetPos.set(0, 0, -65);
        continue;
      }

      const idx = card.photoOrderIndex;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const midCol = (cols - 1) * 0.5;

      const x = (col - midCol) * spacingX;
      // Infinite vertical scrolling wrap across all rows
      const rawY = -row * spacingY + travelDistance * 0.55;
      const wrappedY =
        ((((rawY + totalGridHeight * 0.5) % totalGridHeight) +
          totalGridHeight) %
          totalGridHeight) -
        totalGridHeight * 0.5;

      const z =
        baseZ - Math.abs(col - midCol) * 0.75 + card.hoverTarget * 0.85;

      dummyObj.position.set(
        x,
        wrappedY + Math.sin(elapsed * 0.9 + idx) * 0.08,
        z
      );
      dummyObj.rotation.set(
        0,
        (midCol - col) * 0.09,
        Math.sin(elapsed * 0.5 + idx) * 0.016
      );
      dummyObj.updateMatrix();

      card.targetPos.copy(dummyObj.position);
      card.targetQuat.copy(dummyObj.quaternion);
      card.targetSize.set(cardW, cardH);
      card.targetOpacity = 1.0;
      card.material.uniforms.uBorderSize.value = 0.13;
      card.material.uniforms.uCornerRadius.value = 0.26;
    }
  }
}

// Initialize card positions immediately on startup
updateTunnelDimensions();
computeCardTargets(0);
allCards.forEach((card) => {
  card.mesh.position.copy(card.targetPos);
  card.mesh.quaternion.copy(card.targetQuat);
  card.currentSize.copy(card.targetSize);
  card.mesh.scale.set(card.currentSize.x, card.currentSize.y, 1);
  card.material.uniforms.uCardSize.value.copy(card.currentSize);
  card.material.uniforms.uOpacity.value = card.targetOpacity;
});

// ============================================================================
// 5. CENTER PORTAL QUOTES CYCLING
// ============================================================================
const portalBox = document.getElementById('portal-content');
const portalTag = document.getElementById('portal-tag');
const portalTitle = document.getElementById('portal-title');
const portalSubtitle = document.getElementById('portal-subtitle');

let activeQuoteIndex = 0;

function updateCenterQuote(index) {
  const wrapped =
    ((index % CENTER_QUOTES.length) + CENTER_QUOTES.length) %
    CENTER_QUOTES.length;
  if (wrapped === activeQuoteIndex) return;
  activeQuoteIndex = wrapped;

  portalBox.classList.add('fade-out');
  setTimeout(() => {
    const q = CENTER_QUOTES[activeQuoteIndex];
    portalTag.textContent = q.tag;
    portalTitle.innerHTML = q.title.replace('\n', '<br />');
    portalSubtitle.textContent = q.subtitle;
    portalBox.classList.remove('fade-out');
  }, 320);
}

// ============================================================================
// 6. INTERACTIONS: RAYCAST HOVER, TAP-VS-SWIPE MODAL, SCROLL & MODE SWITCHER
// ============================================================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(-99, -99);
const targetCamOffset = new THREE.Vector2(0, 0);
let hoveredCard = null;

const tooltipEl = document.getElementById('card-tooltip');
const tooltipTitleEl = document.getElementById('tooltip-title');

window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

  targetCamOffset.x = pointerNDC.x * 0.32;
  targetCamOffset.y = pointerNDC.y * 0.2;

  if (tooltipEl) {
    tooltipEl.style.transform = `translate3d(${e.clientX + 16}px, ${e.clientY + 16}px, 0)`;
  }
});

window.addEventListener(
  'wheel',
  (e) => {
    if (
      document.body.classList.contains('is-loading') ||
      !modalBackdrop.classList.contains('hidden')
    ) {
      return;
    }
    e.preventDefault();
    scrollVelocity += e.deltaY * 0.012;
    scrollVelocity = Math.max(-18, Math.min(18, scrollVelocity));
  },
  { passive: false }
);

let touchStartX = 0;
let touchStartY = 0;

window.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  },
  { passive: true }
);

window.addEventListener(
  'touchmove',
  (e) => {
    if (
      document.body.classList.contains('is-loading') ||
      !modalBackdrop.classList.contains('hidden')
    ) {
      return;
    }
    if (e.touches.length === 1) {
      const dx = touchStartX - e.touches[0].clientX;
      const dy = touchStartY - e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;

      // Support both vertical and horizontal finger drag on mobile
      const primaryDelta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      scrollVelocity += primaryDelta * 0.045;
      scrollVelocity = Math.max(-16, Math.min(16, scrollVelocity));
    }
  },
  { passive: true }
);

// Modal Lightbox Elements & Logic
const modalBackdrop = document.getElementById('memory-modal');
const modalCard = document.getElementById('modal-card');
const modalImg = document.getElementById('modal-img');
const modalDate = document.getElementById('modal-date');
const modalTitle = document.getElementById('modal-title');
const modalNote = document.getElementById('modal-note');
const modalCounter = document.getElementById('modal-counter');
const modalCloseBtn = document.getElementById('modal-close');
const modalPrevBtn = document.getElementById('modal-prev');
const modalNextBtn = document.getElementById('modal-next');

let activeModalMemoryIndex = 0;

function openMemoryModal(memIdx) {
  activeModalMemoryIndex =
    ((memIdx % MEMORIES.length) + MEMORIES.length) % MEMORIES.length;
  const mem = MEMORIES[activeModalMemoryIndex];

  modalImg.src = mem.image;
  modalDate.textContent = mem.date;
  modalTitle.textContent = mem.title;
  modalNote.textContent = mem.note;
  modalCounter.textContent = `${String(activeModalMemoryIndex + 1).padStart(
    2,
    '0'
  )} / ${String(MEMORIES.length).padStart(2, '0')}`;

  modalBackdrop.classList.remove('hidden');
  if (tooltipEl) tooltipEl.classList.add('hidden');
}

function closeMemoryModal() {
  modalBackdrop.classList.add('hidden');
}

modalCloseBtn.addEventListener('click', closeMemoryModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeMemoryModal();
});
modalPrevBtn.addEventListener('click', () =>
  openMemoryModal(activeModalMemoryIndex - 1)
);
modalNextBtn.addEventListener('click', () =>
  openMemoryModal(activeModalMemoryIndex + 1)
);

// Swipe Left / Right inside open modal on Mobile
let modalTouchStartX = 0;
let modalTouchStartY = 0;
modalCard.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length === 1) {
      modalTouchStartX = e.touches[0].clientX;
      modalTouchStartY = e.touches[0].clientY;
    }
  },
  { passive: true }
);

modalCard.addEventListener(
  'touchend',
  (e) => {
    if (e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - modalTouchStartX;
      const dy = e.changedTouches[0].clientY - modalTouchStartY;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        if (dx < 0) {
          openMemoryModal(activeModalMemoryIndex + 1);
        } else {
          openMemoryModal(activeModalMemoryIndex - 1);
        }
      }
    }
  },
  { passive: true }
);

window.addEventListener('keydown', (e) => {
  if (modalBackdrop.classList.contains('hidden')) return;
  if (e.key === 'Escape') closeMemoryModal();
  if (e.key === 'ArrowLeft') openMemoryModal(activeModalMemoryIndex - 1);
  if (e.key === 'ArrowRight') openMemoryModal(activeModalMemoryIndex + 1);
});

// Clean Tap vs. Swipe Detection for Opening Photo Cards
let pointerDownX = 0;
let pointerDownY = 0;
let pointerDownTime = 0;

window.addEventListener('pointerdown', (e) => {
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
  pointerDownTime = performance.now();
});

window.addEventListener('pointerup', (e) => {
  if (
    document.body.classList.contains('is-loading') ||
    !modalBackdrop.classList.contains('hidden')
  ) {
    return;
  }
  if (e.target.closest('#mode-dock') || e.target.closest('#top-bar')) return;

  const moveDist = Math.hypot(
    e.clientX - pointerDownX,
    e.clientY - pointerDownY
  );
  const pressDuration = performance.now() - pointerDownTime;

  // Only trigger modal if it was a genuine tap (not a scroll/swipe drag)
  if (moveDist > 12 || pressDuration > 550) return;

  const tapNDC = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );

  raycaster.setFromCamera(tapNDC, camera);
  const visiblePhotoMeshes = allCards
    .filter((c) => c.targetOpacity > 0.5)
    .map((c) => c.mesh);
  const hits = raycaster.intersectObjects(visiblePhotoMeshes, false);

  if (hits.length > 0) {
    const hitCard = hits[0].object.userData.cardObj;
    if (hitCard && hitCard.isPhoto) {
      openMemoryModal(hitCard.memoryIndex);
    }
  }
});

// Auto-play Toggle Button
const togglePlayBtn = document.getElementById('toggle-play-btn');
const playIcon = document.getElementById('play-icon');
const playLabel = document.getElementById('play-label');

togglePlayBtn.addEventListener('click', () => {
  isAutoPlaying = !isAutoPlaying;
  playIcon.textContent = isAutoPlaying ? '❚❚' : '▶';
  playLabel.textContent = isAutoPlaying ? 'Auto Glide' : 'Paused';
});

// Bottom Dock Layout Mode Switcher
const dockBtns = document.querySelectorAll('.dock-btn');
dockBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    dockBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    document.body.dataset.mode = currentMode;
  });
});

// Responsive Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateTunnelDimensions();
});

// ============================================================================
// 7. MAIN ANIMATION LOOP
// ============================================================================
const clock = new THREE.Clock();
let prevTime = 0;

function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();
  const dt = Math.min(0.05, elapsed - prevTime);
  prevTime = elapsed;

  const isModalOpen = !modalBackdrop.classList.contains('hidden');
  const isLoading = document.body.classList.contains('is-loading');

  if (!isModalOpen && !isLoading) {
    const autoDelta = isAutoPlaying ? AUTO_SPEED * dt : 0;
    travelDistance += autoDelta + scrollVelocity * dt * 4.0;
  }
  scrollVelocity *= 0.9;

  // Cycle center quote every ~14 units of tunnel travel
  const quoteStep = Math.floor(Math.abs(travelDistance) / 14.0);
  updateCenterQuote(quoteStep);

  computeCardTargets(elapsed);

  // Desktop hover raycast
  if (!isModalOpen && !isLoading && !isMobileViewport) {
    raycaster.setFromCamera(pointerNDC, camera);
    const visiblePhotoMeshes = allCards
      .filter((c) => c.targetOpacity > 0.5)
      .map((c) => c.mesh);
    const hits = raycaster.intersectObjects(visiblePhotoMeshes, false);

    hoveredCard = null;
    if (hits.length > 0) {
      const candidate = hits[0].object.userData.cardObj;
      if (candidate && candidate.isPhoto) {
        hoveredCard = candidate;
      }
    }

    if (hoveredCard) {
      document.body.style.cursor = 'pointer';
      const mem = MEMORIES[hoveredCard.memoryIndex];
      tooltipTitleEl.textContent = `${mem.title} (#${hoveredCard.memoryIndex + 1})`;
      tooltipEl.classList.remove('hidden');
    } else {
      document.body.style.cursor = 'default';
      tooltipEl.classList.add('hidden');
    }
  }

  const morphRate = currentMode === 'tunnel' ? 0.16 : 0.085;

  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i];

    const jumpedInTunnel =
      currentMode === 'tunnel' &&
      Math.abs(card.targetPos.z - card.mesh.position.z) > totalTunnelLen * 0.45;
    const jumpedInGallery =
      currentMode === 'gallery' &&
      Math.abs(card.targetPos.y - card.mesh.position.y) > 14.0;

    if (jumpedInTunnel || jumpedInGallery) {
      card.mesh.position.copy(card.targetPos);
      card.material.uniforms.uOpacity.value = card.targetOpacity;
    } else {
      card.mesh.position.lerp(card.targetPos, morphRate);
      card.material.uniforms.uOpacity.value +=
        (card.targetOpacity - card.material.uniforms.uOpacity.value) * 0.16;
    }

    card.mesh.quaternion.slerp(card.targetQuat, morphRate);
    card.currentSize.lerp(card.targetSize, morphRate);
    card.mesh.scale.set(card.currentSize.x, card.currentSize.y, 1);
    card.material.uniforms.uCardSize.value.copy(card.currentSize);

    const isHovered = hoveredCard === card ? 1.0 : 0.0;
    card.hoverTarget += (isHovered - card.hoverTarget) * 0.14;
    card.material.uniforms.uHover.value = card.hoverTarget;
  }

  camera.position.x += (targetCamOffset.x - camera.position.x) * 0.06;
  camera.position.y += (targetCamOffset.y - camera.position.y) * 0.06;
  camera.lookAt(
    camera.position.x * 0.35,
    camera.position.y * 0.35,
    visibleTunnelEnd
  );

  renderer.render(scene, camera);
}

animate();

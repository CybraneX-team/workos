// @ts-nocheck
/**
 * IconParticles — Samples dark pixels from industry PNG icons → renders as colored particle cloud.
 * Each cloud billboards toward camera and floats above its galaxy.
 * Supports both startup-twin ids (technology, finance) and WorkOS ids (ind-saas, ind-fintech).
 */

import * as THREE from 'three';
import gsap from 'gsap';

import techImg        from '../assets/icons/tech.png';
import financeImg     from '../assets/icons/finance.png';
import mfgImg         from '../assets/icons/manufacturing.png';
import healthImg      from '../assets/icons/healthcare.png';
import eduImg         from '../assets/icons/education.png';
import mediaImg       from '../assets/icons/media.png';
import commerceImg    from '../assets/icons/commerce.png';
import energyImg      from '../assets/icons/energy.png';
import govImg         from '../assets/icons/government.png';
import mobilityImg    from '../assets/icons/mobility.png';
import realEstateImg  from '../assets/icons/real-estate.png';
import agriImg        from '../assets/icons/agriculture.png';

const IMAGE_MAP = {
  // ── New Work OS Universe IDs (12 galaxies) ──────────────────────
  'ind-technology':    techImg,
  'ind-finance':       financeImg,
  'ind-manufacturing': mfgImg,
  'ind-healthcare':    healthImg,
  'ind-education':     eduImg,
  'ind-media':         mediaImg,
  'ind-commerce':      commerceImg,
  'ind-energy':        energyImg,
  'ind-government':    govImg,
  'ind-mobility':      mobilityImg,
  'ind-realestate':    realEstateImg,
  'ind-agriculture':   agriImg,
  // ── startup-twin slug IDs (kept for legacy) ─────────────────────
  'technology':                  techImg,
  'finance':                     financeImg,
  'manufacturing':               mfgImg,
  'healthcare':                  healthImg,
  'education':                   eduImg,
  'media--entertainment':        mediaImg,
  'commerce':                    commerceImg,
  'energy--sustainability':      energyImg,
  'government--public-systems':  govImg,
  'mobility--transportation':    mobilityImg,
  'real-estate--infrastructure': realEstateImg,
  'agriculture--food':           agriImg,
  // ── Old WorkOS IDs (legacy fallbacks) ────────────────────────
  'ind-saas':      techImg,
  'ind-fintech':   financeImg,
  'ind-healthtech':healthImg,
  'ind-edtech':    eduImg,
  'ind-ecommerce': commerceImg,
  'ind-aiml':      techImg,
  'ind-cleantech': energyImg,
  'ind-logistics': mobilityImg,
  'ind-gaming':    mediaImg,
  'ind-mobility':  mobilityImg,
  'ind-media':     mediaImg,
  'ind-agritech':  agriImg,
  'ind-cyber':     techImg,
  'ind-space':     techImg,
  'ind-proptech':  realEstateImg,
};

const SAMPLE_SIZE = 80;
const ICON_WORLD_SIZE = 280;
const ICON_Y_OFFSET   = 500;

function sampleImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = SAMPLE_SIZE;
      canvas.height = SAMPLE_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const pixels = [];
      for (let y = 0; y < SAMPLE_SIZE; y++) {
        for (let x = 0; x < SAMPLE_SIZE; x++) {
          const i = (y * SAMPLE_SIZE + x) * 4;
          const a = data[i+3];
          if (a > 50) {
            pixels.push({ nx: x / SAMPLE_SIZE, ny: y / SAMPLE_SIZE });
          }
        }
      }
      resolve(pixels);
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}

const _wp = new THREE.Vector3();

export class IconParticles {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.icons = new Map();
  }

  async createAll(industries) {
    await Promise.all(industries.map(ind => this._createIcon(ind)));
  }

  async _createIcon(industry) {
    const imgSrc = IMAGE_MAP[industry.id];
    if (!imgSrc) return;

    const pixels = await sampleImage(imgSrc);
    if (!pixels.length) return;

    const positions = new Float32Array(pixels.length * 3);
    pixels.forEach(({ nx, ny }, i) => {
      positions[i*3]   = (nx - 0.5) * ICON_WORLD_SIZE;
      positions[i*3+1] = (0.5 - ny) * ICON_WORLD_SIZE;
      positions[i*3+2] = 0;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const color = new THREE.Color(industry.color);
    const mat = new THREE.PointsMaterial({
      color,
      size: 2.0,
      sizeAttenuation: false,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.userData = { industryId: industry.id };
    const group = new THREE.Group();
    group.add(points);
    group.position.y = ICON_Y_OFFSET;
    group.userData = { industryId: industry.id, clickable: true };

    this.icons.set(industry.id, { group, mat, points });
  }

  attachToSystems(systemsMap) {
    this.icons.forEach(({ group }, id) => {
      const sys = systemsMap.get(id);
      if (sys) sys.group.add(group);
    });
  }

  update() {
    const q = this.camera.quaternion;
    this.icons.forEach(({ group }) => { group.quaternion.copy(q); });
  }

  updateForDistance(camPos, systemsMap, activeIndustryId) {
    this.icons.forEach(({ group, mat }, id) => {
      if (id === activeIndustryId) { group.visible = false; return; }
      group.visible = true;

      const sys = systemsMap.get(id);
      if (!sys) return;
      sys.group.getWorldPosition(_wp);
      const dist = camPos.distanceTo(_wp);

      const s = Math.min(6.0, Math.max(0.15, dist / 5000));
      group.scale.setScalar(s);
      mat.opacity = Math.max(0.5, Math.min(1.0, 6000 / dist));
    });
  }

  hideForIndustry(industryId) {
    const icon = this.icons.get(industryId);
    if (icon) icon.group.visible = false;
  }

  showAll() {
    this.icons.forEach(({ group }) => { group.visible = true; });
  }

  /** Workspace hide progress (0 = visible, 1 = hidden) — synced to camera compose zoom. */
  setWorkspaceFocusProgress(keepIndustryId, t) {
    this.icons.forEach(({ group, mat }, id) => {
      const hide = keepIndustryId == null || id !== keepIndustryId;
      if (!hide) return;

      gsap.killTweensOf(mat);
      const opacity = THREE.MathUtils.lerp(1, 0, t);
      mat.opacity = opacity;
      group.visible = opacity > 0.01;
    });
  }

  setWorkspaceFocus(keepIndustryId, focused, duration = 0.88) {
    const ease = 'power2.inOut';
    this.icons.forEach(({ group, mat }, id) => {
      const hide = focused && (keepIndustryId == null || id !== keepIndustryId);
      gsap.killTweensOf(mat);

      if (hide) {
        gsap.to(mat, {
          opacity: 0,
          duration,
          ease,
          onComplete: () => {
            group.visible = false;
          },
        });
        return;
      }

      if (!focused) {
        group.visible = true;
        gsap.to(mat, { opacity: 1, duration, ease });
      }
    });
  }

  dispose() {
    this.icons.forEach(({ group, mat, points }) => {
      if (points.geometry) points.geometry.dispose();
      if (mat) mat.dispose();
      if (group.parent) group.parent.remove(group);
    });
    this.icons.clear();
  }
}

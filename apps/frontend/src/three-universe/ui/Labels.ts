// @ts-nocheck
/**
 * Labels — 3D-Anchored CSS Labels (container-mounted)
 * Uses CSS2DRenderer to place floating labels near entities.
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const _wp = new THREE.Vector3();

export class Labels {
  constructor(scene, camera, container) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.labelRenderer = null;
    this.labels = new Map();
    this.onLabelClick = null;
    this._resizeObserver = null;
    this._subdomainWorkspaceComposeT = 0;

    this._initRenderer();
  }

  _initRenderer() {
    this.labelRenderer = new CSS2DRenderer();
    const { clientWidth: w, clientHeight: h } = this.container;
    this.labelRenderer.setSize(w, h);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.labelRenderer.domElement.style.zIndex = '5';
    this.container.appendChild(this.labelRenderer.domElement);

    this._resizeObserver = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = this.container;
      if (w && h) this.labelRenderer.setSize(w, h);
    });
    this._resizeObserver.observe(this.container);
  }

  createIndustryLabels(industries, getPosition) {
    industries.forEach((industry, idx) => {
      const position = getPosition(idx, industries.length);
      this._createLabel(
        `industry-${industry.id}`,
        industry.name + ' Galaxy',
        position,
        'industry',
        industry.color,
        () => { if (this.onLabelClick) this.onLabelClick('industry', industry, idx, industries.length); }
      );
    });
  }

  createSubdomainLabels(industry, getSubdomainMeshes) {
    const meshes = getSubdomainMeshes();
    meshes.forEach((mesh) => {
      const subdomain = mesh.userData.subdomain;
      const id = `subdomain-${subdomain.id}`;
      if (this.labels.has(id)) return;

      const el = document.createElement('div');
      el.className = 'label-3d subdomain';
      el.textContent = subdomain.name;
      el.style.color = industry.color;
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        if (this.onLabelClick) this.onLabelClick('subdomain', subdomain, industry);
      });

      const labelObj = new CSS2DObject(el);
      labelObj.position.set(0, mesh.userData.planetSize + 4, 0);
      mesh.add(labelObj);

      this.labels.set(id, { object: labelObj, element: el, parent: mesh });
    });
  }

  createCompanyLabels(subdomain, getCompanyMeshes) {
    const meshes = getCompanyMeshes();
    meshes.forEach((mesh) => {
      const company = mesh.userData.company;
      const id = `company-${company.id}`;
      if (this.labels.has(id)) return;

      const el = document.createElement('div');
      el.className = 'label-3d company';
      el.textContent = company.name;
      el.style.color = mesh.userData.industry?.color || '#fff';
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        if (this.onLabelClick) this.onLabelClick('company', company, mesh.userData.subdomain, mesh.userData.industry);
      });

      const labelObj = new CSS2DObject(el);
      labelObj.position.set(0, mesh.userData.planetSize + 2, 0);
      mesh.add(labelObj);

      this.labels.set(id, { object: labelObj, element: el, parent: mesh });
    });
  }

  /** Add a label for a single company mesh (used for dynamically spawned planets) */
  addSingleCompanyLabel(companyId, companyName, mesh, industryColor) {
    const id = `company-${companyId}`;
    if (this.labels.has(id)) return;

    const el = document.createElement('div');
    el.className = 'label-3d company';
    el.textContent = companyName || 'New Company';
    el.style.color = industryColor || '#fff';
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    el.style.opacity = '1';

    const labelObj = new CSS2DObject(el);
    labelObj.position.set(0, (mesh.userData?.planetSize ?? 12) + 2, 0);
    mesh.add(labelObj);

    this.labels.set(id, { object: labelObj, element: el, parent: mesh });
  }

  /** Live-update a company label's text (for real-time name binding) */
  updateCompanyLabelText(companyId, newName) {
    const entry = this.labels.get(`company-${companyId}`);
    if (entry?.element) {
      entry.element.textContent = newName || 'New Company';
    }
  }

  /** Live-update a company label's text color (for tag changes) */
  updateCompanyLabelColor(companyId, color) {
    const entry = this.labels.get(`company-${companyId}`);
    if (entry?.element) {
      entry.element.style.color = color;
    }
  }

  createDepartmentLabels(company, getMoonMeshes) {
    const meshes = getMoonMeshes();
    meshes.forEach((mesh) => {
      const dept = mesh.userData.department;
      const id = `dept-${dept.id}`;
      if (this.labels.has(id)) return;

      const el = document.createElement('div');
      el.className = 'label-3d department';
      el.textContent = dept.name;
      el.style.pointerEvents = 'auto';

      const labelObj = new CSS2DObject(el);
      labelObj.position.set(0, mesh.userData.moonSize + 1.5, 0);
      mesh.add(labelObj);

      this.labels.set(id, { object: labelObj, element: el, parent: mesh });
    });
  }

  _createLabel(id, text, position, className, color, onClick) {
    if (this.labels.has(id)) return;

    const el = document.createElement('div');
    el.className = 'canvas-label';

    if (id.startsWith('industry-')) {
      el.style.textAlign = 'center';
      el.style.whiteSpace = 'nowrap';
      el.innerHTML = `
        <div style="font-size: 0.65rem; font-weight: 600; letter-spacing: 0.5px;">${text.toUpperCase()}</div>
        <div style="font-size: 0.45rem; letter-spacing: 0.3px; opacity: 0.5; margin-top: 2px;">EXPLORE →</div>
      `;
      if (color) {
        el.style.color = color;
        el.style.textShadow = `0 0 8px ${color}`;
      }
    } else {
      el.innerHTML = `
        <div class="canvas-label-title">${text}</div>
        <div class="canvas-label-type">${className.toUpperCase()}</div>
      `;
      if (color) el.style.color = color;
    }

    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';

    if (onClick) el.addEventListener('click', onClick);

    const labelObj = new CSS2DObject(el);
    labelObj.position.copy(position);

    if (id.startsWith('industry-')) {
      labelObj.position.y -= 300;
      labelObj.visible = false;
    } else {
      labelObj.position.y += 5;
    }

    this.scene.add(labelObj);
    this.labels.set(id, { object: labelObj, element: el });
  }

  setVisibility(prefix, visible) {
    let idx = 0;
    this.labels.forEach((label, id) => {
      if (!id.startsWith(prefix)) return;
      const el = label.element;
      if (visible) {
        el.style.display = '';
        el.style.transition = '';
        el.style.opacity = '0';
        label._isTransitioning = true; // flag to prevent render loop from overriding fade-in
        const delay = idx * 60;
        setTimeout(() => { 
          el.style.opacity = '1'; 
          label._isTransitioning = false;
        }, delay + 16);
        idx++;
      } else {
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.display = 'none';
        label._isTransitioning = false;
      }
    });
  }

  updateIndustryLabelPosition(id, pos) {
    const entry = this.labels.get(id);
    if (entry?.object) entry.object.position.set(pos.x, pos.y - 300, pos.z);
  }

  hideSpecific(id) {
    const label = this.labels.get(id);
    if (label) {
      label.element.style.display = 'none';
      label.element.style.opacity = '0';
    }
  }

  showSpecific(id) {
    const label = this.labels.get(id);
    if (label) {
      label.element.style.display = '';
      gsap.to(label.element, { opacity: 1, duration: 0.5, ease: 'power2.out' });
    }
  }

  removeSpecific(id) {
    const label = this.labels.get(id);
    if (label) {
      if (label.parent) label.parent.remove(label.object);
      else this.scene.remove(label.object);
      this.labels.delete(id);
    }
  }

  removeByPrefix(prefix) {
    const toRemove = [];
    this.labels.forEach((label, id) => {
      if (id.startsWith(prefix)) {
        if (label.parent) label.parent.remove(label.object);
        else this.scene.remove(label.object);
        toRemove.push(id);
      }
    });
    toRemove.forEach((id) => this.labels.delete(id));
  }

  setActiveIndustry(industryId) {
    this._activeIndustryId = industryId || null;
  }

  /** Industry workspace hide progress (0 = visible, 1 = hidden) — synced to camera compose zoom. */
  /** Subdomain workspace — fade company labels during compose zoom. */
  setSubdomainWorkspaceLabelsProgress(t) {
    this._subdomainWorkspaceComposeT = t;
    this.labels.forEach((label, id) => {
      if (!id.startsWith('company-')) return;

      gsap.killTweensOf(label.element);
      const opacity = 1 - t;
      label.element.style.opacity = String(opacity);
      label.element.style.display = t >= 0.99 ? 'none' : '';
    });
  }

  setIndustryWorkspaceFocusProgress(activeIndustryId, t) {
    if (!activeIndustryId) return;
    this.labels.forEach((label, id) => {
      if (!id.startsWith('industry-')) return;
      const indId = id.replace('industry-', '');
      if (indId === activeIndustryId) return;

      gsap.killTweensOf(label.element);
      const opacity = 1 - t;
      label.element.style.opacity = String(opacity);
      label.element.style.display = t >= 0.99 ? 'none' : '';
    });
  }

  setWorkspaceFocus(keepIndustryId, focused, duration = 0.72) {
    this.labels.forEach((label, id) => {
      if (!id.startsWith('industry-')) return;
      const indId = id.replace('industry-', '');
      const hide = focused && (keepIndustryId == null || indId !== keepIndustryId);
      gsap.killTweensOf(label.element);

      if (hide) {
        gsap.to(label.element, {
          opacity: 0,
          duration,
          ease: 'power2.inOut',
          onComplete: () => {
            label.element.style.display = 'none';
          },
        });
        return;
      }

      if (!focused) {
        label.element.style.display = '';
        gsap.to(label.element, { opacity: 1, duration, ease: 'power2.inOut' });
      }
    });
  }

  setInteractionEnabled(enabled) {
    // Full-screen CSS2D layer must stay none — only individual labels capture clicks.
    if (this.labelRenderer?.domElement) {
      this.labelRenderer.domElement.style.pointerEvents = 'none';
    }
    const pe = enabled ? 'auto' : 'none';
    this.labels.forEach((label) => {
      if (label.element) label.element.style.pointerEvents = pe;
    });
  }

  render() {
    const camPos = this.camera.position;
    this.labels.forEach((label, id) => {
      if (id.startsWith('industry-')) {
        const indId = id.replace('industry-', '');
        if (this._activeIndustryId && indId === this._activeIndustryId) {
          label.object.visible = false;
          return;
        }
        label.object.getWorldPosition(_wp);
        const dist = camPos.distanceTo(_wp);
        const inRange = dist < 6000;
        label.object.visible = inRange;
        if (inRange) {
          const scale = Math.max(0.3, Math.min(1.0, 3500 / dist));
          const opacity = Math.max(0, Math.min(1, (6000 - dist) / 1800));
          label.element.style.opacity = opacity.toFixed(3);
          label.element.style.transform = `scale(${scale.toFixed(3)})`;
          label.element.style.transformOrigin = 'center top';
        }
      } else if (id.startsWith('company-') && label.element.style.display !== 'none') {
        if (this._subdomainWorkspaceComposeT > 0.001) return;
        label.object.getWorldPosition(_wp);
        const dist = camPos.distanceTo(_wp);
        
        // As the camera zooms out, scale down the company labels
        // Full size at distance <= 450. Scales down linearly inversely. Minimum scale 0.25.
        const scale = Math.max(0.25, Math.min(1.0, 450 / dist));
        
        // Also subtly fade out the label if it gets extremely far away
        const opacity = Math.max(0.0, Math.min(1.0, (2500 - dist) / 1000));
        
        label.element.style.transform = `scale(${scale.toFixed(3)})`;
        label.element.style.transformOrigin = 'center bottom';
        
        // Only apply distance fading if the label isn't currently running its spawn animation
        if (!label._isTransitioning) {
          label.element.style.opacity = opacity.toFixed(3);
        }
      }
    });
    this.labelRenderer.render(this.scene, this.camera);
  }

  dispose() {
    this.labels.forEach((label) => {
      if (label.parent) label.parent.remove(label.object);
      else this.scene.remove(label.object);
    });
    this.labels.clear();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.labelRenderer?.domElement?.parentNode) {
      this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
    }
  }
}

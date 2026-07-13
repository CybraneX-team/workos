// @ts-nocheck
/**
 * In-scene hierarchical internal nodes around a company planet.
 * Level 1 = departments; deeper levels = internalNodes tree from polytope store.
 * Camera target stays on the company sphere (handled by UniverseController).
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { getExternalNodeColor } from '../../lib/bdtPolytopeData';

const DOMAIN_COLORS: Record<string, number> = {
  direction: 0xfde047,
  build: 0x8b5cf6,
  delivery: 0x06b6d4,
  market: 0xf97316,
  control: 0x10b981,
  people: 0x0ea5e9,
  inactive: 0x334155,
};

function flattenChildren(node) {
  return node.internalNodes ?? node.children ?? [];
}

export class CompanyInteriorView {
  constructor() {
    this.active = false;
    this.companyId = null;
    this.companyMesh = null;
    this.anchor = null;
    this.planetSize = 12;
    this.industryColor = new THREE.Color(0x8b5cf6);
    this.departments = [];
    this.depth = 0;
    this.path = [];
    this.group = new THREE.Group();
    this.group.name = 'companyInterior';
    this._meshes = [];
    this._transitioning = false;
    this.onLevelChange = null;
  }

  enter(companyMesh, departments, industryColorHex) {
    this.exit();
    if (!companyMesh?.parent) return;

    this.active = true;
    this.companyId = companyMesh.userData.company?.id;
    this.companyMesh = companyMesh;
    this.anchor = companyMesh.parent;
    this.planetSize = companyMesh.userData.planetSize ?? 12;
    this.industryColor = new THREE.Color(industryColorHex ?? '#8b5cf6');
    this.departments = departments ?? [];
    this.depth = 0;
    this.path = [];

    this.anchor.add(this.group);
    this.group.position.set(0, 0, 0);
    this._buildRing(this._nodesAtCurrentLevel(), true);
  }

  exit() {
    this.active = false;
    this.companyId = null;
    this.companyMesh = null;
    this.anchor = null;
    this.depth = 0;
    this.path = [];
    this._clearMeshes();
    if (this.group.parent) this.group.parent.remove(this.group);
    this._transitioning = false;
  }

  getNodeMeshes() {
    return this._meshes.filter(m => m.visible);
  }

  getFocusWorldPosition(target = new THREE.Vector3()) {
    if (!this.companyMesh) return target.set(0, 0, 0);
    this.companyMesh.getWorldPosition(target);
    return target;
  }

  getCameraDistance() {
    const r = this._ringRadius();
    return Math.max(14, r * 2.2);
  }

  drillInto(nodeId) {
    if (this._transitioning) return false;
    const nodes = this._nodesAtCurrentLevel();
    const node = nodes.find(n => n.id === nodeId);
    const kids = flattenChildren(node);
    if (!node || kids.length === 0) return false;

    this.path.push(nodeId);
    this.depth += 1;
    this._transitionTo(kids, 'forward');
    return true;
  }

  drillBack() {
    if (this._transitioning) return false;
    if (this.depth === 0) return false;
    this.path.pop();
    this.depth -= 1;
    this._transitionTo(this._nodesAtCurrentLevel(), 'back');
    return true;
  }

  update(elapsed) {
    if (!this.active) return;
    const t = elapsed * 0.5;
    this._meshes.forEach((m, i) => {
      if (!m.userData?.bob) return;
      m.position.y = m.userData.baseY + Math.sin(t + i * 0.7) * 0.15;
    });
  }

  _nodesAtCurrentLevel() {
    if (this.depth === 0) {
      return (this.departments ?? []).map(d => ({
        id: d.id,
        label: d.label,
        domain: d.domain,
        color: d.color,
        internalNodes: d.internalNodes,
        children: d.internalNodes,
      }));
    }
    let list = this.departments;
    for (const id of this.path) {
      const found = list.find(n => n.id === id);
      if (!found) return [];
      list = flattenChildren(found);
    }
    return list.map(n => ({
      id: n.id,
      label: n.label,
      domain: n.type ?? 'build',
      internalNodes: n.children,
      children: n.children,
    }));
  }

  _ringRadius() {
    const base = this.planetSize * (5.2 - this.depth * 0.55);
    return Math.max(this.planetSize * 2.8, base);
  }

  _nodeSize() {
    return Math.max(1.1, this.planetSize * (0.32 - this.depth * 0.045));
  }

  _nodeColor(node) {
    if (node.color) return new THREE.Color(node.color);
    const hex = getExternalNodeColor(node);
    if (hex) return new THREE.Color(hex);
    if (node.domain && DOMAIN_COLORS[node.domain]) {
      return new THREE.Color(DOMAIN_COLORS[node.domain]);
    }
    return this.industryColor.clone().multiplyScalar(0.85);
  }

  _clearMeshes() {
    this._meshes.forEach(m => {
      gsap.killTweensOf(m.scale);
      gsap.killTweensOf(m.position);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
      this.group.remove(m);
    });
    this._meshes = [];

    if (this._lines) {
      this._lines.forEach(l => {
        if (l.material) gsap.killTweensOf(l.material);
        if (l.geometry) l.geometry.dispose();
        if (l.material) l.material.dispose();
        this.group.remove(l);
      });
      this._lines = [];
    }
  }

  _buildRing(nodes, animateIn) {
    this._clearMeshes();
    const n = Math.max(nodes.length, 1);
    const ringR = this._ringRadius();
    const size = this._nodeSize();
    const company = this.companyMesh?.userData?.company;
    const subdomain = this.companyMesh?.userData?.subdomain;
    const industry = this.companyMesh?.userData?.industry;

    nodes.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      
      // Calculate a pseudo-random Y offset based on node ID to be deterministic
      let pseudoRand = 0;
      if (node.id) {
        for(let j=0; j<node.id.length; j++) pseudoRand += node.id.charCodeAt(j) * (j + 1);
      } else {
        pseudoRand = i * 1337;
      }
      
      // Increased randomness and magnitude for y-axis placement
      const rand1 = Math.sin(pseudoRand * 87.123);
      const rand2 = Math.cos(pseudoRand * 34.987);
      const yOffset = (rand1 + rand2) * this.planetSize * 3.5;
      
      const x = Math.cos(angle) * ringR;
      const y = yOffset;
      const z = Math.sin(angle) * ringR;
      const kids = flattenChildren(node);
      const color = this._nodeColor(node);

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 20, 20),
        new THREE.MeshStandardMaterial({
          color: color.clone().multiplyScalar(0.65),
          emissive: color,
          emissiveIntensity: 0.22,
          roughness: 0.7,
          metalness: 0.25,
          transparent: true,
          opacity: 0,
        }),
      );

      mesh.position.set(x, y, z);
      mesh.scale.setScalar(animateIn ? 0.001 : 1);
      mesh.userData = {
        type: 'company_interior',
        nodeId: node.id,
        nodeLabel: node.label,
        canDrill: kids.length > 0,
        depth: this.depth,
        moonSize: size,
        department: { id: node.id, name: node.label },
        company,
        subdomain,
        industry,
        bob: true,
        baseY: y,
      };

      this.group.add(mesh);
      this._meshes.push(mesh);

      // Draw white line connecting to center
      if (!this._lines) this._lines = [];
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(x, y, z)
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: animateIn ? 0 : 0.3 });
      const line = new THREE.Line(lineGeo, lineMat);
      this.group.add(line);
      this._lines.push(line);

      if (animateIn) {
        gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: 0.55, delay: i * 0.04, ease: 'back.out(1.6)' });
        gsap.to(mesh.material, { opacity: 1, duration: 0.4, delay: i * 0.04 });
        gsap.to(lineMat, { opacity: 0.3, duration: 0.4, delay: i * 0.04 });
      } else {
        mesh.material.opacity = 1;
      }
    });

    if (this.onLevelChange) {
      this.onLevelChange(this.depth, this.path, this._meshes);
    }
  }

  _transitionTo(nodes, direction) {
    this._transitioning = true;
    const outDur = 0.28;
    const promises = this._meshes.map((m, i) => {
      return new Promise(resolve => {
        gsap.to(m.scale, {
          x: 0.001, y: 0.001, z: 0.001,
          duration: outDur,
          delay: i * 0.02,
          ease: 'power2.in',
          onComplete: resolve,
        });
        if (m.material) {
          gsap.to(m.material, { opacity: 0, duration: outDur * 0.9, delay: i * 0.02 });
        }
      });
    });

    if (this._lines) {
      this._lines.forEach((l, i) => {
        if (l.material) {
          gsap.to(l.material, { opacity: 0, duration: outDur * 0.9, delay: i * 0.02 });
        }
      });
    }

    Promise.all(promises).then(() => {
      this._buildRing(nodes, true);
      this._transitioning = false;
      if (direction === 'forward' && this.onLevelChange) {
        this.onLevelChange(this.depth, this.path, this._meshes);
      }
    });
  }
}

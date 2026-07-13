// @ts-nocheck
/**
 * User-specific company planet roots in 3D — roots → branches → actions.
 * Radial outward layout on drill (BDT polytope internal-node style).
 */

import * as THREE from 'three';
import gsap from 'gsap';
import type { PlanetTreeNode } from '../../data/companyPlanetRoots';

function flattenChildren(node: PlanetTreeNode) {
  return node.children ?? [];
}

function parseColor(hex: string | undefined, fallback: THREE.Color) {
  if (!hex) return fallback.clone();
  try {
    return new THREE.Color(hex.startsWith('#') ? hex : `#${hex}`);
  } catch {
    return fallback.clone();
  }
}

export class CompanyPlanetRootView {
  constructor() {
    this.active = false;
    this.companyId = null;
    this.companyMesh = null;
    this.anchor = null;
    this.planetSize = 12;
    this.industryColor = new THREE.Color(0x8b5cf6);
    this.tree = [];
    this.depth = 0;
    this.path = [];
    this.group = new THREE.Group();
    this.group.name = 'companyPlanetRoots';
    this._meshes = [];
    this._lines = [];
    this._transitioning = false;
    this._parentPositions = [new THREE.Vector3(0, 0, 0)];
    this.onLevelChange = null;
  }

  enter(companyMesh, tree: PlanetTreeNode[], industryColorHex: string) {
    this.exit();
    if (!companyMesh?.parent) return;

    this.active = true;
    this.companyId = companyMesh.userData.company?.id;
    this.companyMesh = companyMesh;
    this.anchor = companyMesh.parent;
    this.planetSize = companyMesh.userData.planetSize ?? 12;
    this.industryColor = new THREE.Color(industryColorHex ?? '#8b5cf6');
    this.tree = tree ?? [];
    this.depth = 0;
    this.path = [];
    this._parentPositions = [new THREE.Vector3(0, 0, 0)];

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
    gsap.killTweensOf(this.group.rotation);
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
    return Math.max(16, r * 2.35 + this.depth * 4);
  }

  drillInto(nodeId: string) {
    if (this._transitioning) return false;
    const nodes = this._nodesAtCurrentLevel();
    const node = nodes.find(n => n.id === nodeId);
    const kids = flattenChildren(node);
    if (!node || kids.length === 0) return false;

    const parentMesh = this._meshes.find(m => m.userData.nodeId === nodeId);
    const parentPos = parentMesh
      ? parentMesh.position.clone()
      : this._parentPositions[this._parentPositions.length - 1].clone();

    this.path.push(nodeId);
    this.depth += 1;
    this._parentPositions.push(parentPos);
    this._transitionTo(kids, 'forward');
    return true;
  }

  drillBack() {
    if (this._transitioning) return false;
    if (this.depth === 0) return false;
    this.path.pop();
    this.depth -= 1;
    this._parentPositions.pop();
    this._transitionTo(this._nodesAtCurrentLevel(), 'back');
    return true;
  }

  update(elapsed: number) {
    if (!this.active) return;
    const t = elapsed * 0.55;
    this.group.rotation.y = t * 0.14;

    this._meshes.forEach((m, i) => {
      if (!m.userData?.bob) return;
      const baseY = m.userData.baseY ?? 0;
      m.position.y = baseY + Math.sin(t + i * 0.65) * (this.planetSize * 0.08);
      m.rotation.y = Math.sin(t * 1.1 + i * 0.4) * 0.35;
      m.rotation.z = Math.cos(t * 0.85 + i * 0.55) * 0.18;
      if (m.userData.relevance >= 85) {
        const pulse = 1 + Math.sin(t * 2 + i) * 0.04;
        m.scale.setScalar((m.userData.baseScale ?? 1) * pulse);
      }
    });
  }

  _nodesAtCurrentLevel(): PlanetTreeNode[] {
    if (this.depth === 0) return this.tree;
    let list = this.tree;
    for (const id of this.path) {
      const found = list.find(n => n.id === id);
      if (!found) return [];
      list = flattenChildren(found);
    }
    return list;
  }

  _ringRadius() {
    const base = this.planetSize * (5.4 - this.depth * 0.5);
    return Math.max(this.planetSize * 2.9, base);
  }

  _nodeSize(node: PlanetTreeNode) {
    const rel = node.relevance ?? 70;
    const base = this.planetSize * (0.34 - this.depth * 0.04);
    const boost = this.depth === 0 ? (rel / 100) * 0.12 : 0;
    return Math.max(0.95, base + boost);
  }

  _nodeColor(node: PlanetTreeNode) {
    if (node.domain && typeof node.domain === 'string' && node.domain.startsWith('#')) {
      return parseColor(node.domain, this.industryColor);
    }
    return this.industryColor.clone().multiplyScalar(0.85);
  }

  _positionForNode(node: PlanetTreeNode, index: number, count: number): THREE.Vector3 {
    if (this.depth === 0) {
      const ringR = this._ringRadius();
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      let pseudoRand = 0;
      for (let j = 0; j < (node.id?.length ?? 0); j++) pseudoRand += node.id.charCodeAt(j) * (j + 1);
      const yOffset = Math.sin(pseudoRand * 87.123) * this.planetSize * 2.8;
      return new THREE.Vector3(
        Math.cos(angle) * ringR,
        yOffset,
        Math.sin(angle) * ringR,
      );
    }

    const parentPos = this._parentPositions[this._parentPositions.length - 1];
    const dir = parentPos.lengthSq() > 0.01
      ? parentPos.clone().normalize()
      : new THREE.Vector3(0, 1, 0);

    let localUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.dot(localUp)) > 0.99) localUp.set(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(dir, localUp).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();

    const depthStep = this.planetSize * (1.15 - this.depth * 0.08);
    const ringRadius = this.planetSize * (0.55 - this.depth * 0.06) * Math.pow(0.72, this.depth - 1);
    const childCenter = parentPos.clone().add(dir.multiplyScalar(depthStep));
    const angle = (index / count) * Math.PI * 2;
    const depthOffset = index % 2 === 0 ? ringRadius * 0.15 : -ringRadius * 0.15;

    return childCenter
      .clone()
      .add(right.clone().multiplyScalar(Math.cos(angle) * ringRadius))
      .add(up.clone().multiplyScalar(Math.sin(angle) * ringRadius))
      .add(dir.clone().multiplyScalar(depthOffset));
  }

  _clearMeshes() {
    this._meshes.forEach(m => {
      gsap.killTweensOf(m.scale);
      gsap.killTweensOf(m.position);
      gsap.killTweensOf(m.rotation);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
      this.group.remove(m);
    });
    this._meshes = [];

    this._lines.forEach(l => {
      if (l.material) gsap.killTweensOf(l.material);
      if (l.geometry) l.geometry.dispose();
      if (l.material) l.material.dispose();
      this.group.remove(l);
    });
    this._lines = [];
  }

  _buildRing(nodes: PlanetTreeNode[], animateIn: boolean) {
    this._clearMeshes();
    const n = Math.max(nodes.length, 1);
    const company = this.companyMesh?.userData?.company;
    const subdomain = this.companyMesh?.userData?.subdomain;
    const industry = this.companyMesh?.userData?.industry;
    const lineOrigin = this.depth === 0
      ? new THREE.Vector3(0, 0, 0)
      : this._parentPositions[this._parentPositions.length - 1].clone();

    nodes.forEach((node, i) => {
      const pos = this._positionForNode(node, i, n);
      const kids = flattenChildren(node);
      const color = this._nodeColor(node);
      const size = this._nodeSize(node);
      const rel = node.relevance ?? 70;
      const emissiveIntensity = 0.18 + (rel / 100) * 0.22;

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 22, 22),
        new THREE.MeshStandardMaterial({
          color: color.clone().multiplyScalar(0.6),
          emissive: color,
          emissiveIntensity,
          roughness: 0.65,
          metalness: 0.3,
          transparent: true,
          opacity: 0,
        }),
      );

      mesh.position.copy(pos);
      mesh.scale.setScalar(animateIn ? 0.001 : 1);
      mesh.userData = {
        type: 'company_planet_root',
        nodeId: node.id,
        nodeLabel: node.label,
        canDrill: kids.length > 0,
        depth: this.depth,
        relevance: rel,
        baseScale: 1,
        moonSize: size,
        company,
        subdomain,
        industry,
        bob: true,
        baseY: pos.y,
      };

      this.group.add(mesh);
      this._meshes.push(mesh);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        lineOrigin.clone(),
        pos.clone(),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: color.getHex(),
        transparent: true,
        opacity: animateIn ? 0 : 0.35,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      this.group.add(line);
      this._lines.push(line);

      if (animateIn) {
        gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: 0.7, ease: 'back.out(1.7)' });
        gsap.to(mesh.material, { opacity: 1, duration: 0.5 });
        gsap.to(lineMat, { opacity: 0.35, duration: 0.5 });
        gsap.from(mesh.rotation, { y: Math.PI * 2, duration: 0.9, ease: 'power2.out' });
      } else {
        mesh.material.opacity = 1;
      }
    });

    if (this.onLevelChange) {
      this.onLevelChange(this.depth, [...this.path]);
    }
  }

  _transitionTo(nodes: PlanetTreeNode[], direction: string) {
    this._transitioning = true;
    const outDur = 0.3;
    const promises = this._meshes.map((m, i) => new Promise<void>(resolve => {
      gsap.to(m.scale, {
        x: 0.001, y: 0.001, z: 0.001,
        duration: outDur,
        ease: 'power2.in',
        onComplete: () => resolve(),
      });
      if (m.material) {
        gsap.to(m.material, { opacity: 0, duration: outDur * 0.9 });
      }
    }));

    this._lines.forEach((l, i) => {
      if (l.material) gsap.to(l.material, { opacity: 0, duration: outDur * 0.9 });
    });

    Promise.all(promises).then(() => {
      this._buildRing(nodes, true);
      this._transitioning = false;
      if (direction === 'forward' && this.onLevelChange) {
        this.onLevelChange(this.depth, [...this.path]);
      }
    });
  }
}

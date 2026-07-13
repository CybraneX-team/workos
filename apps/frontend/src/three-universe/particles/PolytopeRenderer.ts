// @ts-nocheck
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import starVertexShader from '../shaders/star/vertex.glsl';
import starFragmentShader from '../shaders/star/fragment.glsl';

export class PolytopeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    
    this.visible = false;
    this.group.visible = false;
    
    // Manage current rendered mesh
    this.currentMeshes = [];
  }

  setVisible(v) {
    this.visible = v;
    this.group.visible = v;
  }

  // Generates a Polytope from an array of nodes (industries, companies, or departments)
  // node color, node label, node strength (metric.performance)
  renderPolytope(title, nodes, baseColor) {
    this._clear();

    const centerCol = new THREE.Color(baseColor).lerp(new THREE.Color(0xffffff), 0.5);

    // 1. Organisation Core
    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: centerCol },
        uIntensity: { value: 0.65 },
        uAudio: { value: 0 },
      },
      transparent: true,
    });
    const coreGeo = new THREE.IcosahedronGeometry(15, 6);
    const core = new THREE.Mesh(coreGeo, this.coreMat);
    core.userData = { type: 'polytope_core' };
    this.coreMesh = core;
    this.group.add(core);
    this.currentMeshes.push(core);

    // Glow for core
    const glowMat = new THREE.SpriteMaterial({
      map: this._createGlowTexture(),
      color: centerCol,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(100, 100, 1);
    this.group.add(glow);
    this.currentMeshes.push(glow);

    if (!nodes || nodes.length < 3) {
      // Need at least 3 points for a volume mostly, but convex handles coplanar occasionally.
      // We'll generate dummy nodes if too few exist to create a nice shell.
    }

    const points = [];
    const nodeMeshes = [];

    // Distribute nodes using a spherical distribution
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

    let nodeCount = Math.max(nodes.length, 12); // Pad to at least 12 vertices for a nice shape

    for (let i = 0; i < nodeCount; i++) {
        const y = 1 - (i / (nodeCount - 1)) * 2;
        const radiusAtY = Math.sqrt(1 - y * y);
        const theta = phi * i;

        const x = Math.cos(theta) * radiusAtY;
        const z = Math.sin(theta) * radiusAtY;

        let strength = 50; 
        let col = centerCol;
        
        let pointName = "Structural Node";
        let isReal = false;
        
        if (i < nodes.length) {
            const node = nodes[i];
            col = new THREE.Color(node.color || baseColor);
            
            // Extract metric. If no metric, random strength for visual
            let perf = 70;
            if (node.metrics && node.metrics.performance) perf = node.metrics.performance;
            else if (node.employees) perf = Math.min(100, node.employees / 5);
            
            strength = 30 + (perf * 0.7); // Extrude based on strength
            pointName = node.name;
            isReal = true;
        } else {
            // Padding nodes for shape closure
            strength = 30 + Math.random() * 20;
            col = centerCol.clone().multiplyScalar(0.4);
        }

        const pos = new THREE.Vector3(x * strength, y * strength, z * strength);
        points.push(pos);

        // Department nodes (only rendering the real ones)
        if (isReal) {
            const nGeo = new THREE.SphereGeometry(3, 16, 16);
            const nMat = new THREE.MeshBasicMaterial({ color: col });
            const nMesh = new THREE.Mesh(nGeo, nMat);
            nMesh.position.copy(pos);
            this.group.add(nMesh);
            this.currentMeshes.push(nMesh);
            nodeMeshes.push({ mesh: nMesh, pos });
        }
    }

    // 2. Projected Shell (Convex Geometry)
    const shellGeo = new ConvexGeometry(points);
    const shellMat = new THREE.MeshPhysicalMaterial({
        color: baseColor,
        metalness: 0.2,
        roughness: 0.1,
        transmission: 0.8, // glass-like look
        thickness: 0.5,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    this.group.add(shell);
    this.currentMeshes.push(shell);

    // Shell edges (Wireframe)
    const edges = new THREE.EdgesGeometry(shellGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: baseColor, transparent: true, opacity: 0.6, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edges, edgeMat);
    this.group.add(wireframe);
    this.currentMeshes.push(wireframe);

    // 3. Relationship Network (Internal Beams to core and to each other)
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
    nodeMeshes.forEach(n1 => {
        // Line to core
        const geoOrigin = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), n1.pos]);
        const originLine = new THREE.Line(geoOrigin, lineMat);
        this.group.add(originLine);
        this.currentMeshes.push(originLine);

        // Lines to other nodes (random simulated dependencies)
        nodeMeshes.forEach(n2 => {
            if (n1 !== n2 && Math.random() > 0.7) {
                const connGeo = new THREE.BufferGeometry().setFromPoints([n1.pos, n2.pos]);
                const edgeLine = new THREE.Line(connGeo, lineMat);
                this.group.add(edgeLine);
                this.currentMeshes.push(edgeLine);
            }
        });
    });
    
    // Scale it up somewhat to fit standard camera limits smoothly
    this.group.scale.set(5, 5, 5); 
  }

  update(elapsed) {
      if (!this.visible) return;
      // Gentle floating rotation
      this.group.rotation.y = elapsed * 0.05;
      this.group.rotation.x = Math.sin(elapsed * 0.1) * 0.1;
      if (this.coreMat) {
        this.coreMat.uniforms.uTime.value = elapsed;
      }
  }

  _clear() {
      this.currentMeshes.forEach(m => {
          this.group.remove(m);
          if (m.geometry) m.geometry.dispose();
          if (m.material) m.material.dispose();
      });
      this.currentMeshes = [];
      this.group.rotation.set(0,0,0);
  }
  
  _createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  dispose() {
      this._clear();
  }
}

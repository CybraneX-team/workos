// @ts-nocheck
/**
 * Engine — Core WebGL Engine (container-mounted)
 * Manages renderer, scene, render loop, and performance monitoring.
 * Mounts into an arbitrary container div instead of full window.
 */

import * as THREE from 'three';

export class Engine {
  constructor(container: HTMLElement) {
    this.container = container;

    // Create canvas element inside container
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

    this.clock = new THREE.Clock();
    this.isRunning = false;
    this.onUpdate = null;
    this.frameCount = 0;
    this.fpsHistory = [];
    this._rafId = null;

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initResize();
  }

  _getSize() {
    return {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    };
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });

    const { width, height } = this._getSize();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.logarithmicDepthBuffer = false;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.00010);
  }

  _initCamera() {
    const { width, height } = this._getSize();
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100000);
    this.camera.position.set(0, 5000, 32000);
    this.camera.lookAt(0, 0, 0);
  }

  _initResize() {
    this._resizeObserver = new ResizeObserver(() => {
      const { width, height } = this._getSize();
      if (width === 0 || height === 0) return;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);

      if (this.onResize) this.onResize(width, height);
    });
    this._resizeObserver.observe(this.container);
  }

  start(updateCallback) {
    this.onUpdate = updateCallback;
    this.isRunning = true;
    this._animate();
  }

  stop() {
    this.isRunning = false;
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _animate() {
    if (!this.isRunning) return;
    this._rafId = requestAnimationFrame(() => this._animate());

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    this.frameCount++;
    this.fpsHistory.push(1 / Math.max(delta, 0.001));
    if (this.fpsHistory.length > 60) this.fpsHistory.shift();

    if (this.onUpdate) this.onUpdate(delta, elapsed);

    if (this.composer) {
      this.composer.render(delta);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  getFPS() {
    if (this.fpsHistory.length === 0) return 0;
    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.fpsHistory.length);
  }

  getInfo() {
    const info = this.renderer.info;
    return {
      fps: this.getFPS(),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  dispose() {
    this.isRunning = false;
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    // Dispose all scene objects
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

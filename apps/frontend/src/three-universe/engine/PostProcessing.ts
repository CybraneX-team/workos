// @ts-nocheck
/**
 * PostProcessing.js — Visual Effects Pipeline
 * 
 * Bloom, vignette, and chromatic aberration for cinematic quality.
 * Adaptive quality based on device performance.
 */

import {
  EffectComposer,
  EffectPass,
  RenderPass,
  BloomEffect,
  VignetteEffect,
  ChromaticAberrationEffect,
  KernelSize,
} from 'postprocessing';
import * as THREE from 'three';

export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this._initComposer();
  }

  _initComposer() {
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
    });

    // Base render pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Bloom — the key effect for star/particle glow
    this.bloom = new BloomEffect({
      intensity: 0.7,
      luminanceThreshold: 0.6,
      luminanceSmoothing: 0.3,
      mipmapBlur: true,
      kernelSize: KernelSize.SMALL,
    });

    // Vignette — cinematic framing
    this.vignette = new VignetteEffect({
      offset: 0.3,
      darkness: 0.7,
    });

    // Chromatic aberration — subtle, increases during zoom
    this.chromaticAberration = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0003, 0.0003),
      radialModulation: true,
      modulationOffset: 0.15,
    });

    // Single combined pass for performance
    const effectPass = new EffectPass(
      this.camera,
      this.bloom,
      this.vignette,
      this.chromaticAberration
    );
    this.composer.addPass(effectPass);
  }

  setZoomIntensity(intensity) {
    const offset = 0.0003 + intensity * 0.0025;
    this.chromaticAberration.offset.set(offset, offset);
  }

  setBloomIntensity(intensity) {
    this.bloom.intensity = intensity;
  }

  resize(width, height) {
    this.composer.setSize(width, height);
  }

  render(delta) {
    this.composer.render(delta);
  }

  dispose() {
    this.composer.dispose();
  }
}

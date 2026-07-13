// @ts-nocheck
/**
 * TextureGenerator.js — Programmatic GPU-friendly textures
 * Creates circular gradient textures for particles and glow sprites.
 * All generated on canvas to avoid loading external assets.
 */

export class TextureGenerator {
  /**
   * Circular radial gradient — white-hot center fading to transparent
   * Used for star glow sprites
   */
  static createGlowTexture(size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.15, 'rgba(255,255,240,0.7)');
    gradient.addColorStop(0.4, 'rgba(255,220,180,0.25)');
    gradient.addColorStop(0.7, 'rgba(200,180,255,0.06)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return canvas;
  }

  /**
   * Soft circular particle — used for point materials
   */
  static createParticleTexture(size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return canvas;
  }

  /**
   * Tinted glow — for industry-colored star halos
   */
  static createColoredGlow(color, size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const half = size / 2;
    // Parse hex color
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
    gradient.addColorStop(0.3, `rgba(${r},${g},${b},0.2)`);
    gradient.addColorStop(0.6, `rgba(${r},${g},${b},0.05)`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return canvas;
  }
}

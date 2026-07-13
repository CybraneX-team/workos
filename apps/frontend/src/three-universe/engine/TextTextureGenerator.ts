// @ts-nocheck
import * as THREE from 'three';

export class TextTextureGenerator {
  static createTextTexture(title, subtitle, colorStr) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.textAlign = 'center';
    
    // Title
    ctx.font = 'bold 32px Inter, system-ui, sans-serif';
    ctx.fillStyle = colorStr;
    ctx.shadowColor = colorStr;
    ctx.shadowBlur = 10;
    ctx.fillText(title.toUpperCase(), canvas.width / 2, 80);
    
    ctx.shadowBlur = 0;
    
    // Subtitle
    ctx.font = '18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#a1a1aa';
    ctx.fillText(subtitle, canvas.width / 2, 120);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }
}

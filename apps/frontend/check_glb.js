const fs = require('fs');
const THREE = require('three');

// Just read the JSON chunk of the GLB
const buf = fs.readFileSync('public/models/planet.glb');
const chunkLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + chunkLen).toString('utf8'));

// The positions accessor gives the min/max
const accessors = json.accessors;
if (accessors) {
  accessors.forEach((acc, i) => {
    if (acc.type === 'VEC3' && acc.min && acc.max) {
      console.log(`Accessor ${i}: min=${acc.min}, max=${acc.max}`);
    }
  });
}

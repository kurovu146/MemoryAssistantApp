export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) {
    return 0;
  }
  return dot / denom;
}

export function float32ToBuffer(vec: Float32Array): ArrayBuffer {
  const buf = new ArrayBuffer(vec.length * 4);
  const view = new Float32Array(buf);
  view.set(vec);
  return buf;
}

export function bufferToFloat32(buf: ArrayBuffer): Float32Array {
  return new Float32Array(buf);
}

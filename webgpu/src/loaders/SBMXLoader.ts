import type { LoadingManager } from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

export class SBMXLoader extends GLTFLoader {
  constructor(manager?: LoadingManager) {
    super(manager);
  }

  parse(data: ArrayBuffer, path: string, onLoad: (gltf: GLTF) => void, onError?: (event: ErrorEvent) => void) {
    const formatName = getAsciiString(data.slice(0, 8));
    switch (formatName) {
      case 'SBMG----': {
        const swappedBuffer = swapBytes(data.slice(8));
        return super.parse(swappedBuffer, path, onLoad, onError);
      }
      default: {
        return super.parse(data, path, onLoad, onError);
      }
    }
  }
}

function getAsciiString(buf: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(new Uint8Array(buf));
}

function swapBytes(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);
  for (let i = 0; i < view.byteLength; i++) {
    const byte = view.getUint8(i);
    const swappedByte = ((byte >> 4) & 0x0f) + ((byte << 4) & 0xf0);
    view.setUint8(i, swappedByte);
  }
  return view.buffer;
}

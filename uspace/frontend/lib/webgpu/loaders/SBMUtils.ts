import { Color, MeshStandardNodeMaterial, type Side } from 'three/webgpu';

const BYTE_LENGTH_MAGIC = 8;
const BYTE_LENGTH_HEAD = 130;
const BYTE_LENGTH_ATTACH = 66;

const MAGIC_SBK = 'SBK-----';
const MAGIC_SBM = 'SBM-----';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function decodeSbk(buffer: ArrayBuffer) {
  let read = BYTE_LENGTH_MAGIC;

  const magicBytes = new Uint8Array(buffer, 0, read);

  const magic = textDecoder.decode(magicBytes);

  if (magic !== MAGIC_SBK) {
    return buffer;
  }

  read += BYTE_LENGTH_HEAD;
  const headBytes = new Uint8Array(buffer, 0, read);
  const version = headBytes[40];

  if (version === 1) {
    const magicBuf = textEncoder.encode(MAGIC_SBM);
    const versionBuf = new Uint8Array([headBytes[41]]);

    const sbmKey = getSbmKey(headBytes);
    const encodeKey = getLeftKey(sbmKey);

    let j = BYTE_LENGTH_ATTACH % encodeKey.length;

    const offset = read + BYTE_LENGTH_ATTACH;
    const bodyBytes = new Uint8Array(buffer, offset);
    const bodyBuf = new Uint8Array(bodyBytes.length);

    for (let i = 0; i < bodyBytes.length; i++) {
      bodyBuf[i] = bodyBytes[i] ^ encodeKey[j];
      j = (j + 1) % encodeKey.length;
    }

    const buf = new Uint8Array(magicBuf.length + versionBuf.length + bodyBuf.length);

    buf.set(magicBuf);
    buf.set(versionBuf, magicBuf.length);
    buf.set(bodyBuf, magicBuf.length + versionBuf.length);

    return buf.buffer;
  }
}

function getSbmKey(headBuffer: Uint8Array) {
  const bytes = new Uint8Array(128);

  bytes.set(headBuffer.slice(42, 42 + 32), 0);
  bytes.set(headBuffer.slice(74, 74 + 64), 32);
  bytes.set(headBuffer.slice(8, 8 + 32), 96);

  return bytes;
}

function getLeftKey(sbmKey: Uint8Array) {
  const bytes = new Uint8Array(64);

  bytes.set(sbmKey.slice(0, 8), 0);
  bytes.set(sbmKey.slice(24, 24 + 8), 8);
  bytes.set(sbmKey.slice(40, 40 + 16), 16);
  bytes.set(sbmKey.slice(64, 64 + 24), 32);
  bytes.set(sbmKey.slice(96, 96 + 8), 56);

  return bytes;
}

export const getTextureName = (dataView: DataView, texnamelen: number, offset: number): string => {
  const temp = dataView.buffer.slice(offset, offset + texnamelen);
  let textureName = textDecoder.decode(temp);
  textureName = textureName.replace('\\', '/');
  if (!textureName.startsWith('Maps/')) {
    textureName = `Maps/${textureName}`;
  }
  return textureName;
};

export const generateSbmMaterial = (materialId: string, arr: number[], png: boolean) => {
  const [d0, d1, d2, d3, side] = arr;

  const trans = png || d3 < 1;

  const material = new MeshStandardNodeMaterial({
    name: materialId,
    color: new Color(d0, d1, d2),
    opacity: d3,
    transparent: trans,
    alphaTest: 0.01,
    side: side as Side,
  });

  return material;
};

export const isPNG = (textureUrl?: string): boolean => {
  return textureUrl?.toLowerCase().endsWith('.png') ?? false;
};

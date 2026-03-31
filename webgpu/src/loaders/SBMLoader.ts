import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FileLoader,
  FrontSide,
  Group,
  Loader,
  LoaderUtils,
  Mesh,
  MeshStandardNodeMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  type LoadingManager,
} from 'three/webgpu';
import { decodeSbk, generateSbmMaterial, getTextureName, isPNG } from './SBMUtils';

interface SBMParserOptions {
  path: string;
  crossOrigin: string;
  requestHeader: Record<string, string>;
  manager: LoadingManager;
}

class SBMParser {
  data: ArrayBuffer;
  options: SBMParserOptions;
  textureLoader: TextureLoader;

  littleEndian = true;
  materials = new Map<string, MeshStandardNodeMaterial>();

  constructor(data: ArrayBuffer, options: SBMParserOptions) {
    this.data = data;
    this.options = options;

    this.textureLoader = new TextureLoader(options.manager);
    this.textureLoader.setCrossOrigin(options.crossOrigin);
    this.textureLoader.setRequestHeader(options.requestHeader);
  }

  parse(onLoad: (sbm: Group) => void, onError?: (err: unknown) => void): void {
    let buffer = this.data;

    const decodeBuffer = decodeSbk(this.data);
    if (decodeBuffer) {
      buffer = decodeBuffer;
    }

    const dataView = new DataView(buffer);
    let offset = 8;
    const version = dataView.getUint8(offset);
    offset += 1;

    if (version === 1) {
      this._parseV2(dataView, offset, onLoad);
    } else if (version === 2) {
      this._parseV2(dataView, offset, onLoad);
    } else if (version === 3) {
      this._parseV3(dataView, offset, onLoad);
    } else {
      onError?.(new Error(`SBMLoader: Unsupported SBM version: ${version}`));
    }
  }

  _parseV2(dataView: DataView, offset: number, onLoad: (sbm: Group) => void): void {
    const sbm = new Group();

    // 材质数量
    const materialCount = dataView.getUint16(offset, this.littleEndian);
    offset += 2;

    // Mesh 数量
    const meshCount = dataView.getUint16(offset, this.littleEndian);
    offset += 2;

    // 准备材质
    for (let i = 0; i < materialCount; ++i) {
      // 材质ID
      const materialId = dataView.getUint16(offset, this.littleEndian).toString();

      offset += 2;

      // a

      offset += 4;

      offset += 4;

      offset += 4;

      offset += 4;

      //d
      const d0 = dataView.getFloat32(offset, this.littleEndian);
      offset += 4;
      const d1 = dataView.getFloat32(offset, this.littleEndian);
      offset += 4;
      const d2 = dataView.getFloat32(offset, this.littleEndian);
      offset += 4;
      const d3 = dataView.getFloat32(offset, this.littleEndian);
      offset += 4;

      // s

      offset += 4;

      offset += 4;

      offset += 4;

      offset += 4;

      // side
      let side: number = dataView.getUint8(offset);

      offset += 1;

      // sync threejs side
      if (side === 0) side = FrontSide;
      else if (side === 1) side = BackSide;
      else if (side === 2) side = DoubleSide;

      // 纹理名称长度
      const textureNameLength: number = dataView.getUint16(offset, this.littleEndian);

      offset += 2;

      // 纹理名称
      const textureName = textureNameLength > 0 ? getTextureName(dataView, textureNameLength, offset) : '';

      offset += textureNameLength;

      if (!this.materials.has(materialId)) {
        const materialInfo = [d0, d1, d2, d3, side];

        const material = generateSbmMaterial(materialId, materialInfo, isPNG(textureName));

        this.materials.set(materialId, material);

        if (textureName && this.options.path) {
          this.textureLoader.load(LoaderUtils.resolveURL(textureName, this.options.path), (texture) => {
            texture.colorSpace = SRGBColorSpace;
            texture.wrapS = RepeatWrapping;
            texture.wrapT = RepeatWrapping;
            texture.flipY = false;
            texture.anisotropy = 16;
            material.map = texture;
          });
        }
      }
    }

    // 准备结构
    for (let i = 0; i < meshCount; ++i) {
      // 网格ID
      const meshId = dataView.getUint16(offset, this.littleEndian).toString();

      offset += 2;

      // 对应材质ID
      const materialId = dataView.getUint16(offset, this.littleEndian).toString();

      offset += 2;

      const vertices = [];
      const texcoords = [];
      const faces = [];
      const faceVertexUvs = [];

      // verticesCount
      const verticesCount = dataView.getUint16(offset, this.littleEndian);

      offset += 2;

      if (verticesCount > 0) {
        for (let j = 0; j < verticesCount; j++) {
          const vector3 = new Vector3();

          // x
          vector3.setX(dataView.getFloat32(offset, this.littleEndian));
          offset += 4;

          // y
          vector3.setY(dataView.getFloat32(offset, this.littleEndian));
          offset += 4;

          // z
          vector3.setZ(dataView.getFloat32(offset, this.littleEndian));
          offset += 4;

          vertices.push(vector3);
        }
      }

      // normalsCount
      const normalsCount = dataView.getUint16(offset, this.littleEndian);

      offset += 2;

      if (normalsCount > 0) {
        for (let j = 0; j < normalsCount; j++) {
          // x
          offset += 4;

          // y
          offset += 4;

          // z
          offset += 4;
        }
      }

      // texcoordCount
      const texcoordCount = dataView.getUint16(offset, this.littleEndian);

      offset += 2;

      if (texcoordCount > 0) {
        for (let j = 0; j < texcoordCount; j++) {
          const texcoord = new Vector2();

          // x
          texcoord.setX(dataView.getFloat32(offset, this.littleEndian));
          offset += 4;

          // y
          texcoord.setY(dataView.getFloat32(offset, this.littleEndian));
          offset += 4;

          texcoords.push(texcoord);
        }
      }

      // idxCount
      const idxCount = dataView.getUint16(offset, this.littleEndian);

      offset += 2;

      if (idxCount > 0) {
        for (let j = 0; j < idxCount; j++) {
          // a
          const a = dataView.getUint16(offset, this.littleEndian);

          offset += 2;

          // b
          const b = dataView.getUint16(offset, this.littleEndian);

          offset += 2;

          // c
          const c = dataView.getUint16(offset, this.littleEndian);

          offset += 2;

          const face = [a, b, c];

          faces.push(face);

          if (texcoords.length > 0) {
            faceVertexUvs.push([texcoords[face[0]], texcoords[face[1]], texcoords[face[2]]]);
          }
        }
      }

      const positions = [],
        uvs = [];

      for (let i = 0; i < faces.length; i++) {
        const face = faces[i];

        // 顶点
        const vertex = vertices[face[0]],
          vertex2 = vertices[face[1]],
          vertex3 = vertices[face[2]];

        // 缓存顶点
        positions.push(...vertex.toArray(), ...vertex2.toArray(), ...vertex3.toArray());

        let uv = new Vector2(),
          uv2 = new Vector2(),
          uv3 = new Vector2();

        const vertexUvs = faceVertexUvs[i];

        if (vertexUvs !== undefined) {
          uv = vertexUvs[0];
          uv2 = vertexUvs[1];
          uv3 = vertexUvs[2];
        }

        // 缓存 uv
        uvs.push(...uv.toArray(), ...uv2.toArray(), ...uv3.toArray());
      }

      const positionArray = new Float32Array(positions),
        uvArray = new Float32Array(uvs);

      // 准备几何体
      const bufferGeometry = new BufferGeometry();

      // position
      if (positionArray.length > 0) {
        bufferGeometry.setAttribute('position', new BufferAttribute(positionArray, 3));
      }
      // uv
      if (uvArray.length > 0) {
        bufferGeometry.setAttribute('uv', new BufferAttribute(uvArray, 2));
      }

      bufferGeometry.computeVertexNormals();

      if (this.materials.has(materialId)) {
        const sbmChild = new Mesh(bufferGeometry, this.materials.get(materialId));

        sbmChild.name = meshId;
        sbmChild.castShadow = true;
        sbmChild.receiveShadow = true;

        sbm.add(sbmChild);
      }
    }

    onLoad(sbm);
  }

  _parseV3(_dataView: DataView, _offset: number, onLoad: (sbm: Group) => void): void {
    const sbm = new Group();

    /// TODO: Implement SBM version 3 parsing logic here
    console.warn('SBMLoader: SBM version 3 is not supported yet.');

    onLoad(sbm);
  }
}

export class SBMLoader extends Loader<Group, string> {
  load(
    url: string,
    onLoad: (sbm: Group) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ): void {
    let resourcePath;

    if (this.resourcePath !== '') {
      resourcePath = this.resourcePath;
    } else if (this.path !== '') {
      const relativeUrl = LoaderUtils.extractUrlBase(url);
      resourcePath = LoaderUtils.resolveURL(relativeUrl, this.path);
    } else {
      resourcePath = LoaderUtils.extractUrlBase(url);
    }

    this.manager.itemStart(url);

    const _onError = (e: unknown) => {
      if (onError) {
        onError(e);
      } else {
        console.error(e);
      }
      this.manager.itemError(url);
      this.manager.itemEnd(url);
    };

    const loader = new FileLoader(this.manager);

    loader.setPath(this.path);
    loader.setResponseType('arraybuffer');
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);

    loader.load(
      url,
      (data) => {
        try {
          this.parse(
            data as ArrayBuffer,
            resourcePath,
            (sbm) => {
              onLoad(sbm);
              this.manager.itemEnd(url);
            },
            _onError
          );
        } catch (e) {
          _onError(e);
        }
      },
      onProgress,
      _onError
    );
  }

  parse(data: ArrayBuffer, path: string, onLoad: (sbm: Group) => void, onError?: (err: unknown) => void): void {
    const formatName = new TextDecoder().decode(data.slice(0, 8));

    if (formatName !== 'SBK-----' && formatName !== 'SBM-----') {
      onError?.(new Error(`SBMLoader: Invalid SBM format: ${formatName}`));
      return;
    }

    const parser = new SBMParser(data, {
      path,
      crossOrigin: this.crossOrigin,
      requestHeader: this.requestHeader,
      manager: this.manager,
    });

    parser.parse(onLoad, onError);
  }

  parseAsync(data: ArrayBuffer | string, path: string): Promise<Group> {
    return new Promise((resolve, reject) => {
      this.parse(
        data as ArrayBuffer,
        path,
        (sbm) => {
          resolve(sbm);
        },
        (err) => {
          reject(err);
        }
      );
    });
  }
}

import {
  REVISION,
  Mesh,
  MeshStandardNodeMaterial,
  LoaderUtils,
  FileLoader,
  type Object3D,
  type WebGPURenderer,
  type LoadingManager,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { SBMXLoader } from './SBMXLoader';
import { SBMLoader } from './SBMLoader';

import type { InteractionEventMap } from '../interactions';

export interface LoadParameters {
  persistent?: boolean;
}

export class ModelLoaderManager {
  private static CACHE_NAME = 'u-space-model-loader-cache';

  static fileLoader = new FileLoader().setResponseType('arraybuffer');
  static dracoLoader = new DRACOLoader().setDecoderPath(
    `https://cdn.jsdelivr.net/npm/three@0.${REVISION}.0/examples/jsm/libs/draco/`,
  );
  static ktx2Loader = new KTX2Loader().setTranscoderPath(
    `https://cdn.jsdelivr.net/npm/three@0.${REVISION}.0/examples/jsm/libs/basis/`,
  );
  static gltfLoader = new GLTFLoader()
    .setDRACOLoader(ModelLoaderManager.dracoLoader)
    .setKTX2Loader(ModelLoaderManager.ktx2Loader)
    .setMeshoptDecoder(MeshoptDecoder);
  static sbmxLoader = new SBMXLoader()
    .setDRACOLoader(ModelLoaderManager.dracoLoader)
    .setKTX2Loader(ModelLoaderManager.ktx2Loader)
    .setMeshoptDecoder(MeshoptDecoder);
  static sbmLoader = new SBMLoader();
  static fbxLoader = new FBXLoader();
  static objLoader = new OBJLoader();
  static stlLoader = new STLLoader();

  static setLoadingManager(loadingManager: LoadingManager) {
    this.fileLoader.manager = loadingManager;
    this.dracoLoader.manager = loadingManager;
    this.ktx2Loader.manager = loadingManager;
    this.gltfLoader.manager = loadingManager;
    this.sbmxLoader.manager = loadingManager;
    this.sbmLoader.manager = loadingManager;
    this.fbxLoader.manager = loadingManager;
    this.objLoader.manager = loadingManager;
    this.stlLoader.manager = loadingManager;
  }

  /**
   * Set the renderer to enable KTX2 support and other renderer-dependent features.
   */
  static async setRenderer(renderer: WebGPURenderer) {
    await renderer.init();
    this.ktx2Loader.detectSupport(renderer);
  }

  /**
   * Configure Draco decoder path.
   */
  static setDracoPath(path: string) {
    this.dracoLoader.setDecoderPath(path);
  }

  /**
   * Configure KTX2 transcoder path.
   */
  static setKTX2Path(path: string) {
    this.ktx2Loader.setTranscoderPath(path);
  }

  static async loadAsync(
    url: string,
    parameters: LoadParameters = { persistent: true },
  ): Promise<Object3D<InteractionEventMap>> {
    const extension = url.split('.').pop()?.split('?')[0].toLowerCase();

    let buffer: ArrayBuffer;

    if (parameters.persistent && typeof caches !== 'undefined') {
      buffer = await this.getPersistentData(url);
    } else {
      buffer = (await this.fileLoader.loadAsync(url)) as ArrayBuffer;
    }

    switch (extension) {
      case 'gltf':
      case 'glb':
        const gltf = await this.gltfLoader.parseAsync(buffer, LoaderUtils.extractUrlBase(url));
        return gltf.scene;
      case 'sbmx':
        const sbmx = await this.sbmxLoader.parseAsync(buffer, LoaderUtils.extractUrlBase(url));
        return sbmx.scene;
      case 'sbm':
        const sbm = await this.sbmLoader.parseAsync(buffer, LoaderUtils.extractUrlBase(url));
        return sbm;
      case 'fbx':
        const fbx = this.fbxLoader.parse(buffer, LoaderUtils.extractUrlBase(url));
        return fbx;
      case 'obj':
        const text = new TextDecoder().decode(buffer);
        const obj = this.objLoader.parse(text);
        return obj;
      case 'stl':
        const geometry = this.stlLoader.parse(buffer);
        const mesh = new Mesh(geometry, new MeshStandardNodeMaterial());
        return mesh;
      default:
        throw new Error(`Unsupported model format: ${extension}`);
    }
  }

  private static async getPersistentData(url: string): Promise<ArrayBuffer> {
    try {
      const cache = await caches.open(this.CACHE_NAME);
      const cachedResponse = await cache.match(url);

      if (cachedResponse) {
        return await cachedResponse.arrayBuffer();
      }

      const buffer = (await this.fileLoader.loadAsync(url)) as ArrayBuffer;
      const response = new Response(buffer);
      await cache.put(url, response);
      return buffer;
    } catch (error) {
      console.warn(`[LoaderManager] Failed to use Cache API for ${url}:`, error);
      return (await this.fileLoader.loadAsync(url)) as ArrayBuffer;
    }
  }
}

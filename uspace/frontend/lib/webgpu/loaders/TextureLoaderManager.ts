import { TextureLoader, CubeTextureLoader, EquirectangularReflectionMapping, type LoadingManager } from 'three/webgpu';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export class TextureLoaderManager {
  static textureLoader = new TextureLoader();
  static hdrLoader = new HDRLoader();
  static cubeTextureLoader = new CubeTextureLoader();

  static setLoadingManager(loadingManager: LoadingManager) {
    this.textureLoader.manager = loadingManager;
    this.hdrLoader.manager = loadingManager;
    this.cubeTextureLoader.manager = loadingManager;
  }

  static async loadAsyncTexture(url: string) {
    const texture = await this.textureLoader.loadAsync(url);
    return texture;
  }

  static async loadAsyncHDR(url: string) {
    const dataTexture = await this.hdrLoader.loadAsync(url);
    dataTexture.mapping = EquirectangularReflectionMapping;
    return dataTexture;
  }

  static async loadAsyncCubeTexture(path: string, urls: string[]) {
    this.cubeTextureLoader.setPath(path);
    const cubeTexture = await this.cubeTextureLoader.loadAsync(urls);
    return cubeTexture;
  }
}

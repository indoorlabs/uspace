import { type Object3D } from 'three/webgpu';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

import { ModelLoaderManager } from '../loaders';
import { type InteractionEventMap } from '../interactions';
import { BaseGroup } from './BaseGroup';

export interface ModelParameters {
  url: string;
  cache?: boolean; // Layer 1: Memory cache (Object-level)
  persistent?: boolean; // Layer 2: Browser Cache API (File-level)
}

export class Model extends BaseGroup<InteractionEventMap> {
  readonly isModel = true;
  type = 'Model';

  private static memoryCache = new Map<string, Promise<Object3D<InteractionEventMap>>>();

  constructor() {
    super();
  }

  async loadAsync(parameters: ModelParameters) {
    const { url, cache = true, persistent = true } = parameters;

    try {
      let objectPromise: Promise<Object3D<InteractionEventMap>>;

      if (cache) {
        if (Model.memoryCache.has(url)) {
          objectPromise = Model.memoryCache.get(url)!;
        } else {
          objectPromise = ModelLoaderManager.loadAsync(url, { persistent });
          Model.memoryCache.set(url, objectPromise);
        }
      } else {
        objectPromise = ModelLoaderManager.loadAsync(url, { persistent });
      }

      const object = await objectPromise;

      // Clone the object to ensure multiple Model instances don't share the same Object3D state
      // especially if it's from cache.
      const clonedObject = clone(object);
      this.add(clonedObject);

      return clonedObject;
    } catch (error) {
      console.error(`[Model] Failed to load model from ${url}:`, error);
      return null;
    }
  }

  static clearMemoryCache() {
    this.memoryCache.clear();
  }

  static async clearPersistentCache() {
    if (typeof caches !== 'undefined') {
      await caches.delete('u-space-loader-cache');
    }
  }
}

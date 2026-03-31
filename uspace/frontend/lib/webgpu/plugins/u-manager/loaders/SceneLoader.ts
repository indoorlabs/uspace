import { Group, Loader, LoaderUtils, LoadingManager, Matrix4, type Object3D } from 'three/webgpu';
import { Model, CircleMesh, ShapeMesh, type Viewer, ExtrudeMesh } from 'u-space';

import { BaseFileLoader } from './BaseFileLoader';
import { META_DATA_FILE_PATH } from '../constants';
import type { IMetadata, ITreeData } from '../types';
import { decryptWithDebugKey, decryptWithKey } from '../license/decryptUtils';
import { Watermarker } from '../Watermarker';

const _m4 = new Matrix4();

export interface SceneLoaderOptions {}

class SceneParser {
  viewer: Viewer;
  path: string;
  manager: LoadingManager;

  constructor(viewer: Viewer, path: string, manager: LoadingManager) {
    this.viewer = viewer;
    this.path = path;
    this.manager = manager;
  }

  /**
   *
   * @param treeData
   * @param cachedIds mutated to add loaded ids
   * @param _options
   * @returns
   */
  async parseAsync(treeData: ITreeData[], cachedIds: Set<string>, _options: SceneLoaderOptions): Promise<Group> {
    const group = new Group();

    const innerParse = async (treeNode: ITreeData, parent: Object3D | null = null) => {
      const object = await this.parseTreeNode(treeNode);

      if (object) {
        const { id, sid } = treeNode;

        // Add object to objectManager
        this.viewer.objectManager.add(id, object);
        this.viewer.objectManager.add(sid, object);

        // Cache loaded ids
        cachedIds.add(id);
        cachedIds.add(sid);

        if (parent) {
          parent.add(object);
        } else {
          group.add(object);
        }
      }

      await Promise.all(treeNode.children.map((child) => innerParse(child, object)));
    };

    await Promise.all(treeData.map((treeNode) => innerParse(treeNode, group)));

    return group;
  }

  async parseTreeNode(treeNode: ITreeData): Promise<Object3D | null> {
    const { name, renderType, path, visible, matrix, shape, extra } = treeNode;

    let object: Object3D | null = null;

    if (renderType === '3D' && path) {
      // Load model
      const url = LoaderUtils.resolveURL(path, this.path);
      const model = new Model();
      this.manager.itemStart(url);
      await model.loadAsync({
        url,
      });
      this.manager.itemEnd(url);
      object = model;
    } else if (renderType === 'GROUP' || renderType === 'STUB') {
      // Empty group
      object = new Group();
    } else if (renderType === 'POLYGON' && shape?.points) {
      // Create polygon shape
      const polygon = ShapeMesh.createFromPoints(shape.points);
      // Temporary style
      polygon.material.color.set('blue');
      polygon.material.transparent = true;
      polygon.material.opacity = 0.5;
      object = polygon;
    } else if (renderType === 'CIRCLE' && shape?.radius) {
      // Create circle shape
      const circle = new CircleMesh({
        geometryParameters: {
          radius: shape.radius,
        },
      });
      // Temporary style
      circle.material.color.set('blue');
      circle.material.transparent = true;
      circle.material.opacity = 0.5;
      object = circle;
    } else if ((renderType === 'AREA' || renderType === 'FLOOR' || renderType === 'ROOM') && shape?.points) {
      // Create space shape
      const space = ExtrudeMesh.createFromPoints(shape.points, {
        geometryParameters: { options: { depth: shape.depth, bevelEnabled: false } },
      });
      space.material.color.set(extra?.color ?? 'blue');
      space.material.transparent = true;
      space.material.opacity = extra?.opacity ?? 0.5;
      object = space;
    }

    if (object) {
      // Set transforms
      object.name = name;
      object.visible = visible;
      const objectMatrix = _m4.fromArray(matrix);
      objectMatrix.decompose(object.position, object.quaternion, object.scale);

      // Set userData
      const userData = { ...treeNode };
      Reflect.deleteProperty(userData, 'children');
      Object.assign(object.userData, userData);
    }

    return object;
  }
}

export class SceneLoader extends Loader<unknown, SceneLoaderOptions> {
  viewer: Viewer;
  key = '';
  cachedIds = new Set<string>();

  #previousResourceData: any = null;
  #previousTreeData: ITreeData[] = [];
  #watermarker: Watermarker;

  constructor(viewer: Viewer) {
    super();
    this.viewer = viewer;
    this.#watermarker = new Watermarker(viewer);
    this.manager = new LoadingManager();
  }

  setKey(key: string): this {
    this.key = key;
    return this;
  }

  async loadAsync(options: SceneLoaderOptions = {}) {
    if (!this.path) {
      throw new Error('u-space SceneLoader: path is not set');
    }

    this.manager.itemStart(this.path);

    const itemError = () => {
      this.manager.itemError(this.path);
      this.manager.itemEnd(this.path);
    };

    const loader = new BaseFileLoader(this);
    const metadata = await loader.loadAsync<IMetadata>(META_DATA_FILE_PATH);

    if (metadata.version < 1.5) {
      itemError();
      throw new Error('u-space SceneLoader: Only support version 1.5 and above');
    }

    if (!this.key && metadata.authority === 'OFFICIAL') {
      itemError();
      throw new Error('u-space SceneLoader: options.key is required when authority is OFFICIAL');
    }

    if (this.key && metadata.authority === 'TRIAL') {
      console.warn('u-space SceneLoader: options.key is not used when authority is TRIAL');
    }

    const resourceData = await loader.loadAsync(metadata.resource);

    const needsDecrypt = this.#previousResourceData !== resourceData;

    this.#previousResourceData = resourceData;

    if (needsDecrypt) {
      if (metadata.encryptWith === 'DEBUG') {
        // debug
        try {
          this.#previousTreeData = decryptWithDebugKey(resourceData);
          // Temporary comment out
          // this.#watermarker.enable();
        } catch {
          itemError();
          throw new Error('u-space SceneLoader: decrypt with debug key failed');
        }
      } else if (metadata.encryptWith === 'SCENE' || metadata.encryptWith === 'COMPANY') {
        // authorized
        try {
          this.#previousTreeData = decryptWithKey(resourceData, this.key!);
        } catch {
          itemError();
          throw new Error('u-space SceneLoader: decrypt with authorized key failed');
        }
      } else if (!metadata.encryptWith) {
        // unencrypted
        this.#previousTreeData = resourceData;
      }
    }

    const parser = new SceneParser(this.viewer, this.path, this.manager);
    const group = await parser.parseAsync(this.#previousTreeData, this.cachedIds, options);

    this.manager.itemEnd(this.path);

    return group;
  }

  clearCache() {
    this.cachedIds.forEach((id) => {
      this.viewer.objectManager.removeById(id);
    });
    this.cachedIds.clear();
  }

  dispose() {
    this.clearCache();
    this.#watermarker.dispose();
  }
}

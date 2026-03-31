import { Loader, LoadingManager } from 'three/webgpu';
import type { IVector3, Viewer } from 'u-space';

import { BaseFileLoader } from './BaseFileLoader';
import { VISIONS_DATA_FILE_PATH } from '../constants';

export class VisionsLoader extends Loader {
  constructor() {
    super();
    this.manager = new LoadingManager();
  }

  async loadAsync() {
    const loader = new BaseFileLoader(this);
    const visionsData = await loader.loadAsync<IVisionsData>(VISIONS_DATA_FILE_PATH);
    return visionsData;
  }
}

export class VisionsParser {
  viewer: Viewer;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  async flyToPrimary(visions: IVisions[], enableTransition = true) {
    const vision = visions.find((vision) => vision.primary);
    if (vision) {
      await this.flyTo(vision, enableTransition);
      return true;
    }
    return false;
  }

  async flyTo(vision: IVisions, enableTransition = true) {
    const { camera, position, target, zoom = this.viewer.camera.zoom } = vision;

    if (camera === 'P') {
      this.viewer.setCameraByType('perspective');
    } else if (camera === 'O') {
      this.viewer.setCameraByType('orthographic');
    }

    const { x: px, y: py, z: pz } = position;
    const { x: tx, y: ty, z: tz } = target;

    await Promise.all([
      this.viewer.controls.setLookAt(px, py, pz, tx, ty, tz, enableTransition),
      this.viewer.controls.zoomTo(zoom, enableTransition),
    ]);
  }
}

export interface IVisions {
  id: string;
  uuid: string;
  nodeId: string;
  name: string;
  code?: any;
  camera: 'O' | 'P';
  position: IVector3;
  rotation: IVector3;
  target: IVector3;
  zoom: number;
  primary: boolean;
}

export type IVisionsData = Record<string, IVisions[]>;

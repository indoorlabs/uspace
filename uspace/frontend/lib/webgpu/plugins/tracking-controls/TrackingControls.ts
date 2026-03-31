import { Box3, Vector3, type Object3D } from 'three/webgpu';
import type { Viewer } from 'u-space';

const _box3 = new Box3();
const _vector3 = new Vector3();

class TrackingControls {
  viewer: Viewer;

  target: Object3D | null = null;
  offset = new Vector3();
  type: 'position' | 'box3' = 'position';

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  _update = () => {
    if (!this.target) return;

    if (this.type === 'position') {
      _vector3.setFromMatrixPosition(this.target.matrixWorld);
      _vector3.add(this.offset);
    } else if (this.type === 'box3') {
      _box3.setFromObject(this.target);
      _box3.getCenter(_vector3);
      _vector3.add(this.offset);
    }

    this.viewer.controls.moveTo(_vector3.x, _vector3.y, _vector3.z);
  };

  enable() {
    this.viewer.addEventListener('beforeRender', this._update);
    return this;
  }

  disable() {
    this.viewer.removeEventListener('beforeRender', this._update);
    return this;
  }
}

export { TrackingControls };

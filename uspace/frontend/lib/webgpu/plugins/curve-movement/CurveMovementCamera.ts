import type { Viewer } from 'u-space';
import { CurveMovement } from './CurveMovement';

class CurveMovementCamera extends CurveMovement {
  constructor(viewer: Viewer) {
    super(viewer);

    this.addEventListener('update', this._updateCamera);
  }

  private _updateCamera = () => {
    this.viewer.controls.setPosition(this._tempPosition.x, this._tempPosition.y, this._tempPosition.z);

    if (this.autoLookAt) {
      this.viewer.controls.setTarget(this._tempLookAt.x, this._tempLookAt.y, this._tempLookAt.z);

      if (this.lookAtOffset !== 0) {
        this.viewer.controls.rotate(this.lookAtOffset, 0);
      }
    }
  };

  dispose() {
    super.dispose();
    this.removeEventListener('update', this._updateCamera);
  }
}

export { CurveMovementCamera };

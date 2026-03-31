import { type Object3D } from 'three';
import type { Viewer } from 'u-space';
import { CurveMovement } from './CurveMovement';

class CurveMovementObject extends CurveMovement {
  /** 移动目标对象 */
  target: Object3D | null = null;

  constructor(viewer: Viewer) {
    super(viewer);

    this.addEventListener('update', this._updateObject);
  }

  /**
   * 更新动画帧
   */
  private _updateObject() {
    if (!this.target) return;

    this.target.position.copy(this._tempPosition);

    // 自动朝向
    if (this.autoLookAt) {
      this.target.lookAt(this._tempLookAt);

      // 应用Y轴旋转偏移（修正模型初始朝向）
      if (this.lookAtOffset !== 0) {
        this.target.rotateY(this.lookAtOffset);
      }
    }
  }

  dispose() {
    super.dispose();
    this.removeEventListener('update', this._updateObject);
    this.target = null;
  }
}

export { CurveMovementObject };

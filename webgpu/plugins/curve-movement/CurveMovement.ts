import { CatmullRomCurve3, EventDispatcher, Vector3, type Curve } from 'three/webgpu';
import type { Viewer } from 'u-space';

export type CurveMovementEventMap = {
  update: { progress: number };
  complete: {};
};

class CurveMovement extends EventDispatcher<CurveMovementEventMap> {
  viewer: Viewer;

  /** 路径曲线 */
  path: Curve<Vector3> | null = null;

  /** 当前进度 (0-1) */
  progress = 0;

  /** 移动速度 (每秒进度) */
  speed = 0.1;

  /** 循环模式 */
  loop: 'once' | 'repeat' | 'pingpong' = 'once';

  /** 是否往返移动 */
  pingPong = false;

  /** 位置偏移 */
  positionOffset = new Vector3();

  /** 是否自动朝向路径前方 */
  autoLookAt = true;

  /** Y轴朝向角度偏移 (弧度) */
  lookAtOffset = 0;

  /** 当前方向 (1: 正向, -1: 反向) */
  direction: 1 | -1 = 1;

  /** 是否正在播放 */
  protected _isPlaying = false;

  /** 临时向量用于计算 */
  protected _tempPosition = new Vector3();
  protected _tempTangent = new Vector3();
  protected _tempLookAt = new Vector3();

  constructor(viewer: Viewer) {
    super();

    this.viewer = viewer;
  }

  /**
   * 从点数组创建 CatmullRom 曲线路径
   */
  setFromPoints(points: Vector3[], closed = false) {
    return this.setPath(new CatmullRomCurve3(points, closed, 'catmullrom', 0));
  }

  /**
   * 设置路径曲线
   */
  setPath(path: Curve<Vector3>) {
    this.path = path;
    return this;
  }

  /**
   * 设置当前进度并更新位置
   */
  setProgress(progress: number) {
    this.progress = Math.max(0, Math.min(1, progress));
    return this;
  }

  /**
   * 获取是否正在播放
   */
  get isPlaying() {
    return this._isPlaying;
  }

  /**
   * 开始移动动画
   */
  play() {
    this.resume();
    this.progress = 0;
    this.direction = 1;
    return this;
  }

  resume() {
    this._isPlaying = true;
    this.viewer.addEventListener('beforeControlsUpdate', this._update);
    return this;
  }

  /**
   * 暂停移动动画
   */
  pause() {
    this._isPlaying = false;
    this.viewer.removeEventListener('beforeControlsUpdate', this._update);
    return this;
  }

  /**
   * 停止并重置进度
   */
  stop() {
    this.pause();
    this.progress = 0;
    this.direction = 1;
    return this;
  }

  /**
   * 反转移动方向
   */
  reverse() {
    this.direction *= -1;
    return this;
  }

  /**
   * 更新动画帧
   */
  private _update = () => {
    if (!this._isPlaying || !this.path) return;

    const delta = this.viewer.timer.getDelta();
    this.progress += this.speed * delta * this.direction;

    // 处理边界
    if (this.progress >= 1) {
      switch (this.loop) {
        case 'once':
          this.progress = 1;
          this.pause();
          this.dispatchEvent({ type: 'complete' });
          break;
        case 'repeat':
          this.progress = 0;
          break;
        case 'pingpong':
          this.progress = 1;
          this.direction = -1;
          break;
      }
    } else if (this.progress <= 0) {
      switch (this.loop) {
        case 'once':
          this.progress = 0;
          this.pause();
          this.dispatchEvent({ type: 'complete' });
          break;
        case 'repeat':
          this.progress = 1;
          break;
        case 'pingpong':
          this.progress = 0;
          this.direction = 1;
          break;
      }
    }

    // 获取当前位置
    this.path.getPointAt(this.progress, this._tempPosition);
    this._tempPosition.add(this.positionOffset);

    // 自动朝向
    if (this.autoLookAt) {
      // 获取切线方向
      this.path.getTangentAt(this.progress, this._tempTangent);

      // 计算朝向目标点
      this._tempLookAt.copy(this._tempPosition).add(this._tempTangent);
    }

    this.dispatchEvent({ type: 'update', progress: this.progress });
    this.viewer.render();
  };

  /**
   * 销毁插件
   */
  dispose() {
    this.stop();
    this.path = null;
  }
}

export { CurveMovement };

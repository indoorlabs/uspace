import { EventDispatcher, Loader, LoadingManager, type Object3D } from 'three/webgpu';
import { tweenAnimation, type AnimationModeType, type Tween, type Viewer } from 'u-space';

import { ANIMATIONS_DATA_FILE_PATH } from '../constants';
import { BaseFileLoader } from './BaseFileLoader';

export class AnimationsLoader extends Loader {
  constructor() {
    super();
    this.manager = new LoadingManager();
  }

  async loadAsync() {
    const loader = new BaseFileLoader(this);
    const animationsData = await loader.loadAsync<IAnimations[]>(ANIMATIONS_DATA_FILE_PATH);
    return animationsData;
  }
}

export interface IKeyframe {
  id: string;
  uuid: string;
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  easing: AnimationModeType;
  mode: string;
  delay: number;
  duration: number;
  repeat: number;
  yoyo: boolean;
}

/**
 * 动画
 */
export interface IAnimations {
  id: string;
  sid: string;
  modelId: string;
  name: string;
  keyframes: IKeyframe[];
}

export class AnimationsParser extends EventDispatcher<TAnimationsPlayerEventMap> {
  viewer: Viewer;
  target: Object3D;
  tweenSet: Set<TTweenType>;
  _initialTransformSymbol = Symbol('initialTransform');

  constructor(viewer: Viewer, target: Object3D) {
    super();

    this.viewer = viewer;
    this.target = target;
    this.tweenSet = new Set();
  }

  initTransform(defaultTransform?: TTweenSource): TTweenSource {
    const { position, rotation, scale } = this.target;

    const transformObject =
      defaultTransform ??
      ({
        x: position.x,
        y: position.y,
        z: position.z,
        rotationX: rotation.x,
        rotationY: rotation.y,
        rotationZ: rotation.z,
        scaleX: scale.x,
        scaleY: scale.y,
        scaleZ: scale.z,
      } satisfies TTweenSource);
    Reflect.set(this.target, this._initialTransformSymbol, transformObject);

    return transformObject;
  }

  getInitialTransform(): TTweenSource | undefined {
    return Reflect.get(this.target, this._initialTransformSymbol);
  }

  async play(frames: IKeyframe[]) {
    let initialTransform = this.getInitialTransform() as TTweenSource;
    if (!initialTransform) {
      initialTransform = this.initTransform();
    }

    /**
     * 执行动画
     */
    for (let j = 0; j < frames.length; j++) {
      let currentFrame: TTweenSource = frames[j - 1];

      if (!currentFrame) {
        currentFrame = initialTransform;
      }

      const nextFrame = frames[j];

      const delay = nextFrame.delay ?? 0;
      const duration = nextFrame.duration ?? 1000;
      const mode = nextFrame.easing;
      /**
       * -1 表示无限循环
       */
      const repeat = nextFrame.repeat === -1 ? Infinity : (nextFrame.repeat ?? 0);

      const yoyo = nextFrame.yoyo ?? false;

      await tweenAnimation<TTweenSource>(
        this.viewer,
        {
          ...currentFrame,
        },
        {
          ...nextFrame,
        },
        { delay, duration, mode, repeat, yoyo },
        (source, tween) => {
          const { x, y, z, rotationX, rotationY, rotationZ, scaleX, scaleY, scaleZ } = source;
          this.target.position.set(x, y, z);
          this.target.rotation.set(rotationX, rotationY, rotationZ);
          this.target.scale.set(scaleX, scaleY, scaleZ);
          this.dispatchEvent({ type: 'update', source, tween });
        },
        (tween) => {
          this.tweenSet.add(tween);
          this.dispatchEvent({ type: 'start', tween });
        },
      );
    }
  }

  stop() {
    this.tweenSet.forEach((tween) => tween.stop());
    this.tweenSet.clear();
  }

  reset() {
    const initialTransform = this.getInitialTransform();

    if (initialTransform) {
      const { x, y, z, rotationX, rotationY, rotationZ, scaleX, scaleY, scaleZ } = initialTransform;
      this.target.position.set(x, y, z);
      this.target.rotation.set(rotationX, rotationY, rotationZ);
      this.target.scale.set(scaleX, scaleY, scaleZ);
      this.viewer.render();
    }
  }

  dispose() {
    this.stop();
    this.reset();
    Reflect.deleteProperty(this.target, this._initialTransformSymbol);
  }
}

export type TTweenSource = Pick<
  IKeyframe,
  'x' | 'y' | 'z' | 'rotationX' | 'rotationY' | 'rotationZ' | 'scaleX' | 'scaleY' | 'scaleZ'
>;

export type TTweenType = Tween<TTweenSource>;

export type TAnimationsPlayerEventMap = {
  update: {
    source: TTweenSource;
    tween: TTweenType;
  };
  start: {
    tween: TTweenType;
  };
};

import { Tween as TweenBase, Easing } from 'three/examples/jsm/libs/tween.module.js';
import type { Viewer, ViewerEventMap } from '../viewers';

class Tween<PropType extends Record<string, any>> extends TweenBase<PropType> {
  viewer: Viewer;

  constructor(viewer: Viewer, source: PropType) {
    super(source);

    this.viewer = viewer;
  }

  _update = ({ time }: ViewerEventMap['afterControlsUpdate']) => {
    const needsRender = this.update(time);

    if (needsRender) {
      this.viewer.render();
    }
  };

  easingByMode(mode: AnimationModeType): this {
    const tweenModeFunc = animationModeEnum[mode];
    return super.easing(tweenModeFunc);
  }

  start(time?: number, overrideStartingValues?: boolean): this {
    this.viewer.addEventListener('afterControlsUpdate', this._update);
    return super.start(time, overrideStartingValues);
  }

  stop(): this {
    this.viewer.removeEventListener('afterControlsUpdate', this._update);
    return super.stop();
  }
}

function tweenAnimation<PropType extends Record<string, any>>(
  viewer: Viewer,
  source: PropType,
  target: PropType,
  options: AnimationOptions = {},
  onUpdate?: (source: PropType, tween: Tween<PropType>) => void,
  onStart?: (tween: Tween<PropType>) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const { duration = 1000, delay = 0, repeat = false, mode = 'Linear.None', yoyo = false } = options;

    const tween: Tween<PropType> = new Tween<PropType>(viewer, source)
      .to(target, duration)
      .easingByMode(mode)
      .delay(delay)
      .onUpdate((e: PropType) => {
        // Euler
        onUpdate?.(e, tween);
      })
      .onComplete(() => {
        resolve();
      })
      .onStop(() => {
        reject('animation stop');
      })
      .onStart(() => {
        onStart?.(tween);
      });

    if (typeof repeat === 'number') tween.repeat(repeat);
    else if (typeof repeat === 'boolean' && repeat) tween.repeat(Infinity);

    // fix: https://github.com/tweenjs/tween.js/issues/677
    if (yoyo) tween.repeatDelay(20);
    tween.yoyo(yoyo);
    tween.start();
  });
}

export { Tween, tweenAnimation };

const animationModeEnum: Record<AnimationModeType, (amount: number) => number> = {
  'Linear.None': Easing.Linear.None,
  'Quadratic.In': Easing.Quadratic.In,
  'Quadratic.Out': Easing.Quadratic.Out,
  'Quadratic.InOut': Easing.Quadratic.InOut,
  'Cubic.In': Easing.Cubic.In,
  'Cubic.Out': Easing.Cubic.Out,
  'Cubic.InOut': Easing.Cubic.InOut,
  'Quartic.In': Easing.Quartic.In,
  'Quartic.Out': Easing.Quartic.Out,
  'Quartic.InOut': Easing.Quartic.InOut,
  'Quintic.In': Easing.Quintic.In,
  'Quintic.Out': Easing.Quintic.Out,
  'Quintic.InOut': Easing.Quintic.InOut,
  'Sinusoidal.In': Easing.Sinusoidal.In,
  'Sinusoidal.Out': Easing.Sinusoidal.Out,
  'Sinusoidal.InOut': Easing.Sinusoidal.InOut,
  'Exponential.In': Easing.Exponential.In,
  'Exponential.Out': Easing.Exponential.Out,
  'Exponential.InOut': Easing.Exponential.InOut,
  'Circular.In': Easing.Circular.In,
  'Circular.Out': Easing.Circular.Out,
  'Circular.InOut': Easing.Circular.InOut,
  'Elastic.In': Easing.Elastic.In,
  'Elastic.Out': Easing.Elastic.Out,
  'Elastic.InOut': Easing.Elastic.InOut,
  'Back.In': Easing.Back.In,
  'Back.Out': Easing.Back.Out,
  'Back.InOut': Easing.Back.InOut,
  'Bounce.In': Easing.Bounce.In,
  'Bounce.Out': Easing.Bounce.Out,
  'Bounce.InOut': Easing.Bounce.InOut,
};

export type AnimationModeType =
  | 'Linear.None'
  | 'Quadratic.In'
  | 'Quadratic.Out'
  | 'Quadratic.InOut'
  | 'Cubic.In'
  | 'Cubic.Out'
  | 'Cubic.InOut'
  | 'Quartic.In'
  | 'Quartic.Out'
  | 'Quartic.InOut'
  | 'Quintic.In'
  | 'Quintic.Out'
  | 'Quintic.InOut'
  | 'Sinusoidal.In'
  | 'Sinusoidal.Out'
  | 'Sinusoidal.InOut'
  | 'Exponential.In'
  | 'Exponential.Out'
  | 'Exponential.InOut'
  | 'Circular.In'
  | 'Circular.Out'
  | 'Circular.InOut'
  | 'Elastic.In'
  | 'Elastic.Out'
  | 'Elastic.InOut'
  | 'Back.In'
  | 'Back.Out'
  | 'Back.InOut'
  | 'Bounce.In'
  | 'Bounce.Out'
  | 'Bounce.InOut';

export interface AnimationOptions {
  duration?: number;
  delay?: number;
  repeat?: number | boolean;
  mode?: AnimationModeType;
  yoyo?: boolean;
}

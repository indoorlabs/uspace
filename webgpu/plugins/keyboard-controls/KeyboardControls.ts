import type { Viewer } from 'u-space';

export const ACTION = Object.freeze({
  MOVE_FORWARD: 'move-forward',
  MOVE_BACKWARD: 'move-backward',
  MOVE_LEFT: 'move-left',
  MOVE_RIGHT: 'move-right',
  MOVE_UP: 'move-up',
  MOVE_DOWN: 'move-down',
  ROTATE_LEFT: 'rotate-left',
  ROTATE_RIGHT: 'rotate-right',
  ROTATE_UP: 'rotate-up',
  ROTATE_DOWN: 'rotate-down',
});

type ActionValue = (typeof ACTION)[keyof typeof ACTION];

class KeyboardControls {
  viewer: Viewer;

  moveDistanceDelta = 0.1;
  rotateAngleDelta = Math.PI / 180;
  keys: Record<string, ActionValue> = {
    KeyW: ACTION.MOVE_FORWARD,
    KeyS: ACTION.MOVE_BACKWARD,
    KeyA: ACTION.MOVE_LEFT,
    KeyD: ACTION.MOVE_RIGHT,
    KeyQ: ACTION.MOVE_UP,
    KeyE: ACTION.MOVE_DOWN,
    ArrowLeft: ACTION.ROTATE_LEFT,
    ArrowRight: ACTION.ROTATE_RIGHT,
    ArrowUp: ACTION.ROTATE_UP,
    ArrowDown: ACTION.ROTATE_DOWN,
  };

  _state: Record<ActionValue, { fn: () => void; pressed: boolean }> = {
    [ACTION.MOVE_FORWARD]: { fn: () => this.viewer.controls.forward(this.moveDistanceDelta), pressed: false },
    [ACTION.MOVE_BACKWARD]: { fn: () => this.viewer.controls.forward(-this.moveDistanceDelta), pressed: false },
    [ACTION.MOVE_LEFT]: { fn: () => this.viewer.controls.truck(-this.moveDistanceDelta, 0), pressed: false },
    [ACTION.MOVE_RIGHT]: { fn: () => this.viewer.controls.truck(this.moveDistanceDelta, 0), pressed: false },
    [ACTION.MOVE_UP]: { fn: () => this.viewer.controls.elevate(this.moveDistanceDelta), pressed: false },
    [ACTION.MOVE_DOWN]: { fn: () => this.viewer.controls.elevate(-this.moveDistanceDelta), pressed: false },
    [ACTION.ROTATE_LEFT]: { fn: () => this.viewer.controls.rotate(this.rotateAngleDelta, 0), pressed: false },
    [ACTION.ROTATE_RIGHT]: { fn: () => this.viewer.controls.rotate(-this.rotateAngleDelta, 0), pressed: false },
    [ACTION.ROTATE_UP]: { fn: () => this.viewer.controls.rotate(0, this.rotateAngleDelta), pressed: false },
    [ACTION.ROTATE_DOWN]: { fn: () => this.viewer.controls.rotate(0, -this.rotateAngleDelta), pressed: false },
  };

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  _onKeyDown = (event: KeyboardEvent) => {
    const action = this.keys[event.code];
    if (action) {
      this._state[action].pressed = true;
    }
  };

  _onKeyUp = (event: KeyboardEvent) => {
    const action = this.keys[event.code];
    if (action) {
      this._state[action].pressed = false;
    }
  };

  _update = () => {
    const { _state } = this;

    for (const { pressed, fn } of Object.values(_state)) {
      if (pressed) {
        fn();
      }
    }
  };

  enable() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.viewer.addEventListener('beforeControlsUpdate', this._update);
    return this;
  }

  disable() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.viewer.removeEventListener('beforeControlsUpdate', this._update);
    return this;
  }
}

export { KeyboardControls };

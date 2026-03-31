import { type Raycaster, type Intersection, type Object3DEventMap, Sprite } from 'three/webgpu';

export class BaseSprite<TEventMap extends Object3DEventMap = Object3DEventMap> extends Sprite<TEventMap> {
  readonly isBaseSprite = true;
  type = 'BaseSprite';

  ignoreInvisibleWhenRaycast = true;

  constructor(...args: ConstructorParameters<typeof Sprite<TEventMap>>) {
    super(...args);
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]): boolean | void {
    if (this.visible === false && this.ignoreInvisibleWhenRaycast === true) {
      // Stop propagation if the sprite is not visible
      return false;
    }
    return super.raycast(raycaster, intersects);
  }
}

import { type Raycaster, type Intersection, type Object3DEventMap, Group } from 'three/webgpu';

export class BaseGroup<TEventMap extends Object3DEventMap = Object3DEventMap> extends Group<TEventMap> {
  readonly isBaseGroup = true;
  type = 'BaseGroup';

  ignoreInvisibleWhenRaycast = true;

  constructor(...args: ConstructorParameters<typeof Group<TEventMap>>) {
    super(...args);
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]): boolean | void {
    if (this.visible === false && this.ignoreInvisibleWhenRaycast === true) {
      // Stop propagation if the group is not visible
      return false;
    }
    return super.raycast(raycaster, intersects);
  }
}

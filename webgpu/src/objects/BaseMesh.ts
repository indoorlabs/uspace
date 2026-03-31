import {
  type BufferGeometry,
  type Intersection,
  type Material,
  type Object3DEventMap,
  type Raycaster,
  Mesh,
} from 'three/webgpu';

export class BaseMesh<
  TGeometry extends BufferGeometry = BufferGeometry,
  TMaterial extends Material | Material[] = Material | Material[],
  TEventMap extends Object3DEventMap = Object3DEventMap
> extends Mesh<TGeometry, TMaterial, TEventMap> {
  readonly isBaseMesh = true;
  type = 'BaseMesh';

  ignoreInvisibleWhenRaycast = true;

  constructor(...args: ConstructorParameters<typeof Mesh<TGeometry, TMaterial, TEventMap>>) {
    super(...args);
  }

  raycast(raycaster: Raycaster, intersects: Intersection[]): boolean | void {
    if (this.visible === false && this.ignoreInvisibleWhenRaycast === true) {
      // Stop propagation if the mesh is not visible
      return false;
    }
    return super.raycast(raycaster, intersects);
  }
}

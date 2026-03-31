import {
  MeshStandardNodeMaterial,
  ShapeGeometry,
  Shape,
  Vector2,
  type MeshStandardNodeMaterialParameters,
} from 'three/webgpu';

import type { InteractionEventMap } from '../interactions';
import type { IPlaneVector2 } from '../interfaces';
import { BaseMesh } from './BaseMesh';

export interface ShapeMeshParameters {
  geometryParameters?: {
    shape?: Shape | Shape[];
    curveSegments?: number;
  };
  materialParameters?: MeshStandardNodeMaterialParameters;
}

export class ShapeMesh extends BaseMesh<ShapeGeometry, MeshStandardNodeMaterial, InteractionEventMap> {
  readonly isShapeMesh = true;
  type = 'ShapeMesh';

  constructor({ geometryParameters, materialParameters }: ShapeMeshParameters = {}) {
    super();

    this.geometry = new ShapeGeometry(geometryParameters?.shape, geometryParameters?.curveSegments);
    this.material = new MeshStandardNodeMaterial(materialParameters);

    this.geometry.rotateX(-Math.PI / 2);
  }

  static createFromPoints(points: IPlaneVector2[], parameters: ShapeMeshParameters = {}): ShapeMesh {
    return new ShapeMesh({
      ...parameters,
      geometryParameters: {
        ...parameters.geometryParameters,
        shape: new Shape(points.map((point) => new Vector2(point.x, -point.z))),
      },
    });
  }
}

import {
  ExtrudeGeometry,
  MeshStandardNodeMaterial,
  Shape,
  Vector2,
  type ExtrudeGeometryOptions,
  type MeshStandardNodeMaterialParameters,
} from 'three/webgpu';

import type { InteractionEventMap } from '../interactions';
import type { IPlaneVector2 } from '../interfaces';
import { BaseMesh } from './BaseMesh';

export interface ExtrudeMeshParameters {
  geometryParameters?: {
    shape?: Shape | Shape[];
    options?: ExtrudeGeometryOptions;
  };
  materialParameters?: MeshStandardNodeMaterialParameters;
}

export class ExtrudeMesh extends BaseMesh<ExtrudeGeometry, MeshStandardNodeMaterial, InteractionEventMap> {
  readonly isExtrudeMesh = true;
  type = 'ExtrudeMesh';

  constructor({ geometryParameters, materialParameters }: ExtrudeMeshParameters = {}) {
    super();

    this.geometry = new ExtrudeGeometry(geometryParameters?.shape, geometryParameters?.options);
    this.material = new MeshStandardNodeMaterial(materialParameters);

    this.geometry.rotateX(-Math.PI / 2);
  }

  static createFromPoints(points: IPlaneVector2[], parameters: ExtrudeMeshParameters = {}): ExtrudeMesh {
    return new ExtrudeMesh({
      ...parameters,
      geometryParameters: {
        ...parameters.geometryParameters,
        shape: new Shape(points.map((point) => new Vector2(point.x, -point.z))),
      },
    });
  }
}

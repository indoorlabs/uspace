import { CircleGeometry, MeshStandardNodeMaterial, type MeshStandardNodeMaterialParameters } from 'three/webgpu';
import type { InteractionEventMap } from '../interactions';
import { BaseMesh } from './BaseMesh';

export interface CircleMeshParameters {
  geometryParameters?: {
    radius?: number;
    segments?: number;
    thetaStart?: number;
    thetaLength?: number;
  };
  materialParameters?: MeshStandardNodeMaterialParameters;
}

export class CircleMesh extends BaseMesh<CircleGeometry, MeshStandardNodeMaterial, InteractionEventMap> {
  readonly isCircleMesh = true;
  type = 'CircleMesh';

  constructor({ geometryParameters, materialParameters }: CircleMeshParameters = {}) {
    super(
      new CircleGeometry(
        geometryParameters?.radius,
        geometryParameters?.segments,
        geometryParameters?.thetaStart,
        geometryParameters?.thetaLength
      ),
      new MeshStandardNodeMaterial(materialParameters)
    );

    this.geometry.rotateX(-Math.PI / 2);
  }
}

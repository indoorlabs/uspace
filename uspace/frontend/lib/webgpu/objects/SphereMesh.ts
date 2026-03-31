import { SphereGeometry, MeshStandardNodeMaterial, type MeshStandardNodeMaterialParameters } from 'three/webgpu';

import type { InteractionEventMap } from '../interactions';
import { BaseMesh } from './BaseMesh';

export interface SphereMeshParameters {
  geometryParameters?: {
    radius?: number;
    widthSegments?: number;
    heightSegments?: number;
    phiStart?: number;
    phiLength?: number;
    thetaStart?: number;
    thetaLength?: number;
  };
  materialParameters?: MeshStandardNodeMaterialParameters;
}

export class SphereMesh extends BaseMesh<SphereGeometry, MeshStandardNodeMaterial, InteractionEventMap> {
  readonly isSphereMesh = true;
  type = 'SphereMesh';

  constructor({ geometryParameters, materialParameters }: SphereMeshParameters = {}) {
    super();

    this.geometry = new SphereGeometry(
      geometryParameters?.radius,
      geometryParameters?.widthSegments,
      geometryParameters?.heightSegments,
      geometryParameters?.phiStart,
      geometryParameters?.phiLength,
      geometryParameters?.thetaStart,
      geometryParameters?.thetaLength
    );
    this.material = new MeshStandardNodeMaterial(materialParameters);
  }
}

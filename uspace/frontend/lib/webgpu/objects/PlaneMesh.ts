import { MeshStandardNodeMaterial, PlaneGeometry, type MeshStandardNodeMaterialParameters } from 'three/webgpu';

import type { InteractionEventMap } from '../interactions';
import { BaseMesh } from './BaseMesh';

export interface PlaneMeshParameters {
  geometryParameters?: {
    width?: number;
    height?: number;
    widthSegments?: number;
    heightSegments?: number;
  };
  materialParameters?: MeshStandardNodeMaterialParameters;
}

export class PlaneMesh extends BaseMesh<PlaneGeometry, MeshStandardNodeMaterial, InteractionEventMap> {
  readonly isPlaneMesh = true;
  type = 'PlaneMesh';

  constructor({ geometryParameters, materialParameters }: PlaneMeshParameters = {}) {
    super();

    this.geometry = new PlaneGeometry(
      geometryParameters?.width,
      geometryParameters?.height,
      geometryParameters?.widthSegments,
      geometryParameters?.heightSegments
    );
    this.material = new MeshStandardNodeMaterial(materialParameters);
  }
}

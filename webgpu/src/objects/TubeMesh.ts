import {
  TubeGeometry,
  MeshStandardNodeMaterial,
  type Vector3,
  type Curve,
  type MeshStandardNodeMaterialParameters,
} from 'three/webgpu';

import type { InteractionEventMap } from '../interactions';
import { BaseMesh } from './BaseMesh';

export interface TubeMeshParameters {
  geometryParameters?: {
    path?: Curve<Vector3>;
    tubularSegments?: number;
    radius?: number;
    radialSegments?: number;
    closed?: boolean;
  };
  materialParameters?: MeshStandardNodeMaterialParameters;
}

export class TubeMesh extends BaseMesh<TubeGeometry, MeshStandardNodeMaterial, InteractionEventMap> {
  readonly isTubeMesh = true;
  type = 'TubeMesh';

  constructor({ geometryParameters, materialParameters }: TubeMeshParameters = {}) {
    super();

    this.geometry = new TubeGeometry(
      geometryParameters?.path,
      geometryParameters?.tubularSegments,
      geometryParameters?.radius,
      geometryParameters?.radialSegments,
      geometryParameters?.closed
    );
    this.material = new MeshStandardNodeMaterial(materialParameters);
  }
}

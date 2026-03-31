import { type IVector3 } from 'u-space';

export interface IMetadata {
  platformVersion: number;
  version: number;
  name: string;
  projectId: string;
  sceneId: string;
  cover: string | null;
  flatModel: string;
  treeModel: string;
  resource: string;
  exportTime: number;
  authority: 'TRIAL' | 'OFFICIAL';
  encryptWith: 'DEBUG' | 'SCENE' | 'COMPANY' | null;
  environment: string | null;
  previewSettings: string | null;
  gisSettings: IGisSettings | null;
}

export interface IGisSettings {
  enabled: boolean;
  longitude: number;
  latitude: number;
  altitude: number;
}

export interface ITreeData {
  id: string;
  pid: string | null;
  sid: string;
  name: string;
  path: string | null;
  renderType:
    | 'GROUP'
    | '3D'
    | 'STUB'
    | 'POLYGON'
    | 'CIRCLE'
    | 'WATER_SURFACE'
    | 'DECAL'
    | 'AREA'
    | 'FLOOR'
    | 'ROOM'
    | 'GS';
  deviceCode: string | null;
  matrix: number[];
  familyId: string | null;
  children: ITreeData[];
  visible: boolean;
  shape?: {
    height?: number;
    radius?: number;
    depth?: number;
    points?: IVector3[];
  };
  boundingBox?: number[];
  extra?: {
    [key: string]: any;
  };
}

export interface ILicense {
  sign: string;
  content: string;
  version: number;
}

export interface ITopologyPath {
  id: string;
  name: string;
  position: IVector3;
  rotation: IVector3;
  scale: IVector3;
  nodes: ITopologyNode[];
  type: 'network';
  linkWidth?: number;
  linkColor?: [string];
  nodeRadius?: number;
  nodeColor?: string;
  imgUrl?: string;
  animation?: { duration: 0 };
}

export interface ITopologyNode {
  id: string;
  name: string;
  position: IVector3;
  graphs: ITopologyNodeGraph[];
}

export interface ITopologyNodeGraph {
  linkInfo: ITopologyEdge;
  targetNodeId: string;
  // unused currently, always 0
  passable: 0 | 1 | 2 | 3;
}

export interface ITopologyEdge {
  id: string;
  name: string;
}

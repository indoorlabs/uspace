import { Loader, LoadingManager, Vector3 } from 'three/webgpu';
import { Topology } from 'u-space';

import { BaseFileLoader } from './BaseFileLoader';
import { TOPOLOGY_DATA_FILE_PATH } from '../constants';
import type { ITopologyPath } from '../types';

export class TopologyParser {
  parse(data: ITopologyPath): Topology {
    const {
      name,
      position,
      rotation,
      scale,
      nodes,
      nodeRadius = 0.2,
      nodeColor = '#0000ff',
      linkWidth = 0.1,
      // Legacy support
      linkColor = ['#00ff00'],
    } = data;

    const topology = new Topology({
      nodeRadius,
      nodeColor,
      edgeRadius: linkWidth,
      edgeColor: linkColor[0],
      pathRadius: linkWidth + 0.05,
    });

    topology.name = name;
    topology.position.set(position.x, position.y, position.z);
    topology.rotation.set(rotation.x, rotation.y, rotation.z);
    topology.scale.set(scale.x, scale.y, scale.z);

    // Add nodes and edges
    nodes.forEach((node) => {
      const _p = new Vector3().copy(node.position);
      topology.addNode(node.id, _p);
    });
    nodes.forEach((node) => {
      node.graphs.forEach((graph) => {
        topology.addEdge(node.id, graph.targetNodeId);
      });
    });
    topology.renderGraph();

    // Store original data in userData
    Object.assign(topology.userData, data);

    return topology;
  }
}

export class TopologiesLoader extends Loader {
  constructor() {
    super();
    this.manager = new LoadingManager();
  }

  async loadAsync() {
    if (!this.path) {
      throw new Error('u-manager TopologiesLoader: path is not set');
    }

    const loader = new BaseFileLoader(this);
    const topologiesData = await loader.loadAsync<ITopologyPath[]>(TOPOLOGY_DATA_FILE_PATH);
    const parser = new TopologyParser();
    const topologies: Topology[] = [];

    topologiesData.forEach((topologyData) => {
      const topology = parser.parse(topologyData);
      topologies.push(topology);
    });

    return topologies;
  }
}

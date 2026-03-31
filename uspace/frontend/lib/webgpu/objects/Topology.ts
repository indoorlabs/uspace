import { type Vector3, Mesh, Group, LineCurve3, CatmullRomCurve3, type ColorRepresentation } from 'three/webgpu';

import type { InteractionEventMap } from '../interactions';
import { SphereMesh } from './SphereMesh';
import { TubeMesh } from './TubeMesh';
import { BaseGroup } from './BaseGroup';

export interface TopologyParameters {
  nodeColor?: ColorRepresentation;
  nodeRadius?: number;
  edgeColor?: ColorRepresentation;
  edgeRadius?: number; // Renamed or mapped from width
  pathColor?: ColorRepresentation;
  pathRadius?: number; // Renamed or mapped from width
}

export class Topology extends BaseGroup<InteractionEventMap> {
  readonly isTopology = true;
  type = 'Topology';

  // Visuals
  parameters: Required<TopologyParameters> = {
    nodeColor: 0x0000ff,
    nodeRadius: 0.5,
    edgeColor: 0x00ff00,
    edgeRadius: 0.1,
    pathColor: 0xff00ff,
    pathRadius: 0.2,
  };

  nodes = new Map<string, Vector3>();
  adjacencyMap = new Map<string, Map<string, number>>();

  graphGroup: Group<InteractionEventMap> | null = null;
  pathMeshes: TubeMesh[] = [];

  constructor(parameters?: TopologyParameters) {
    super();
    if (parameters) {
      Object.assign(this.parameters, parameters);
    }
  }

  /**
   * Add a node to the topology graph.
   * @param id Unique identifier for the node
   * @param position 3D position of the node
   */
  addNode(id: string, position: Vector3) {
    if (this.nodes.has(id)) {
      console.warn(`[Topology] Node ${id} already exists. Overwriting.`);
    }
    this.nodes.set(id, position);
    if (!this.adjacencyMap.has(id)) {
      this.adjacencyMap.set(id, new Map());
    }
  }

  /**
   * Remove a node from the topology graph.
   * @param id Unique identifier for the node
   */
  removeNode(id: string) {
    if (!this.nodes.has(id)) {
      console.warn(`[Topology] Node ${id} does not exist.`);
      return;
    }
    this.nodes.delete(id);
    this.adjacencyMap.delete(id);
  }

  /**
   * Add an edge between two nodes.
   * @param from Node ID
   * @param to Node ID
   * @param weight Cost of the edge. Defaults to Euclidean distance.
   * @param bidirectional If true, adds the reverse edge as well. Default true.
   */
  addEdge(from: string, to: string, weight?: number, bidirectional = true) {
    const fromPos = this.nodes.get(from);
    const toPos = this.nodes.get(to);

    if (!fromPos || !toPos) {
      console.error(`[Topology] Cannot add edge. One or both nodes not found: ${from}, ${to}`);
      return;
    }

    const dist = weight ?? fromPos.distanceTo(toPos);

    this.getNeighbors(from)?.set(to, dist);
    if (bidirectional) {
      this.getNeighbors(to)?.set(from, dist);
    }
  }

  /**
   * Remove an edge between two nodes.
   * @param from Node ID
   * @param to Node ID
   * @param bidirectional If true, removes the reverse edge as well. Default true.
   */
  removeEdge(from: string, to: string, bidirectional = true) {
    const fromNeighbors = this.getNeighbors(from);
    fromNeighbors?.delete(to);

    if (bidirectional) {
      const toNeighbors = this.getNeighbors(to);
      toNeighbors?.delete(from);
    }
  }

  /**
   * Find the shortest path between start and end nodes using Dijkstra's algorithm.
   */
  getShortestPath(startId: string, endId: string): Vector3[] {
    if (!this.nodes.has(startId) || !this.nodes.has(endId)) {
      console.warn(`[Topology] Start or End node not found.`);
      return [];
    }

    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const unvisited = new Set<string>();

    for (const [id] of this.nodes) {
      distances.set(id, Infinity);
      previous.set(id, null);
      unvisited.add(id);
    }
    distances.set(startId, 0);

    while (unvisited.size > 0) {
      // Find node with min distance
      let currentId: string | null = null;
      let minDist = Infinity;

      for (const id of unvisited) {
        const d = distances.get(id)!;
        if (d < minDist) {
          minDist = d;
          currentId = id;
        }
      }

      if (currentId === null || currentId === endId) {
        break;
      }
      if (minDist === Infinity) {
        break; // No reachable path
      }

      unvisited.delete(currentId);

      const neighbors = this.adjacencyMap?.get(currentId);

      if (!neighbors) {
        continue;
      }

      for (const [to, weight] of neighbors) {
        if (!unvisited.has(to)) continue;

        const alt = distances.get(currentId)! + weight;
        if (alt < distances.get(to)!) {
          distances.set(to, alt);
          previous.set(to, currentId);
        }
      }
    }

    // Reconstruct path
    const path: Vector3[] = [];
    let curr: string | null = endId;

    // Check if reachable
    if (previous.get(endId) === null && startId !== endId) {
      return [];
    }

    while (curr !== null) {
      const pos = this.nodes.get(curr);
      if (pos) path.unshift(pos);
      curr = previous.get(curr) || null;
    }

    return path;
  }

  /**
   * Renders the entire topology graph structure using TubeGeometry and Spheres.
   */
  renderGraph() {
    this.clearGraph();

    this.graphGroup = new Group();

    // 1. Render Nodes (Spheres)
    const _dummySphere = new SphereMesh({
      geometryParameters: {
        radius: this.parameters.nodeRadius,
        widthSegments: 16,
        heightSegments: 16,
      },
      materialParameters: {
        color: this.parameters.nodeColor,
      },
    });

    this.nodes.forEach((pos, id) => {
      const nodeMesh = _dummySphere.clone();
      nodeMesh.position.copy(pos);
      Object.assign(nodeMesh.userData, { id, type: 'node' });
      this.graphGroup!.add(nodeMesh);
    });

    // 2. Render Edges (TubeGeometry)
    const processedEdges = new Set<string>();

    this.adjacencyMap.forEach((edges, from) => {
      edges.forEach((weight, to) => {
        const key = [from, to].sort().join('-');
        if (processedEdges.has(key)) return;
        processedEdges.add(key);

        const p1 = this.nodes.get(from);
        const p2 = this.nodes.get(to);
        if (p1 && p2) {
          const path = new LineCurve3(p1, p2);
          const tubeMesh = new TubeMesh({
            geometryParameters: {
              path,
              tubularSegments: 1,
              radius: this.parameters.edgeRadius,
              radialSegments: 8,
              closed: false,
            },
            materialParameters: {
              color: this.parameters.edgeColor,
            },
          });
          Object.assign(tubeMesh.userData, { from, to, weight, type: 'edge' });
          this.graphGroup!.add(tubeMesh);
        }
      });
    });

    this.add(this.graphGroup);
  }

  clearGraph() {
    if (this.graphGroup) {
      this.remove(this.graphGroup);
      // Helper to traverse and dispose
      this.graphGroup.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });

      this.graphGroup = null;
    }
  }

  /**
   * Visualizes a path using TubeGeometry (CatmullRomCurve3).
   */
  renderPath(points: Vector3[], color: ColorRepresentation = this.parameters.pathColor) {
    if (points.length < 2) return;

    // Check if points are enough for curve
    const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0);

    const mesh = new TubeMesh({
      geometryParameters: {
        path: curve,
        tubularSegments: points.length * 10,
        radius: this.parameters.pathRadius,
        closed: false,
      },
      materialParameters: {
        color,
      },
    });
    this.add(mesh);
    this.pathMeshes.push(mesh);
    return mesh;
  }

  clearPaths() {
    this.pathMeshes.forEach((m) => {
      this.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    this.pathMeshes = [];
  }

  dispose() {
    this.clearGraph();
    this.clearPaths();
  }

  getNeighbors(id: string) {
    return this.adjacencyMap.get(id);
  }
}

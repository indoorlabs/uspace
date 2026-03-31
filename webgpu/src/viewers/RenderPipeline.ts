import { type Scene, type Camera, RenderPipeline as RenderPipelineBase, type Node } from 'three/webgpu';
import { blendColor, pass } from 'three/tsl';

type Args = [ConstructorParameters<typeof RenderPipelineBase>[0], Scene, Camera];

export class RenderPipeline extends RenderPipelineBase {
  scene: Scene;
  camera: Camera;
  currentOutputNode: Node;
  needsUpdateOutputNode: boolean;

  #overlayPasses: Set<Node>;

  constructor(...args: Args) {
    const [renderer, scene, camera] = args;

    super(renderer);

    this.scene = scene;
    this.camera = camera;
    this.currentOutputNode = pass(scene, camera);
    this.needsUpdateOutputNode = true;

    this.#overlayPasses = new Set();
  }

  addOverlayPass(pass: Node) {
    this.#overlayPasses.add(pass);

    this.needsUpdateOutputNode = true;
  }

  removeOverlayPass(pass: Node) {
    this.#overlayPasses.delete(pass);

    this.needsUpdateOutputNode = true;
  }

  setCamera(camera: Camera): void {
    this.camera = camera;

    this.needsUpdateOutputNode = true;
  }

  setCurrentOutputNode(node: Node) {
    this.currentOutputNode.dispose();
    this.currentOutputNode = node;

    this.needsUpdateOutputNode = true;
  }

  resetCurrentOutputNode() {
    this.currentOutputNode.dispose();
    this.currentOutputNode = pass(this.scene, this.camera);

    this.needsUpdateOutputNode = true;
  }

  #updateOutputNode() {
    let currentNode: Node = this.currentOutputNode;

    if (this.#overlayPasses.size > 0) {
      this.#overlayPasses.forEach((overlayPass) => {
        currentNode = blendColor(currentNode, overlayPass);
      });
    }

    this.outputNode = currentNode;
    this.needsUpdate = true;
  }

  render(): void {
    if (this.needsUpdateOutputNode) {
      this.#updateOutputNode();
      this.needsUpdateOutputNode = false;
    }

    super.render();
  }
}

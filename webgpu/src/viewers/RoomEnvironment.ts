import { PMREMGenerator, type Texture, type WebGPURenderer } from 'three/webgpu';
import { RoomEnvironment as RoomEnvironmentClass } from 'three/addons/environments/RoomEnvironment.js';

export class RoomEnvironment {
  environment = new RoomEnvironmentClass();

  renderer: WebGPURenderer;
  pmremGenerator: PMREMGenerator;
  envMap: Texture | null = null;

  constructor(renderer: WebGPURenderer) {
    this.renderer = renderer;
    this.pmremGenerator = new PMREMGenerator(renderer);
  }

  update() {
    if (!this.envMap) {
      this.envMap = this.pmremGenerator.fromScene(this.environment).texture;
    }
  }

  dispose() {
    this.pmremGenerator.dispose();
    this.envMap?.dispose();
  }
}

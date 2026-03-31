import { type PassNode, Mesh, MeshBasicNodeMaterial, OrthographicCamera, PlaneGeometry, Scene } from 'three/webgpu';
import { pass } from 'three/tsl';
import type { Viewer } from 'u-space';
import { TextureLoaderManager } from 'u-space';
import logo from './assets/logo.webp?inline';

export class Watermarker extends Scene {
  viewer: Viewer;
  camera: OrthographicCamera;
  mesh: Mesh<PlaneGeometry, MeshBasicNodeMaterial>;
  overlayPass: PassNode;

  constructor(viewer: Viewer) {
    super();

    this.viewer = viewer;
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.camera.position.z = 0.5;
    this.mesh = new Mesh(
      new PlaneGeometry(1.8, 1.8),
      new MeshBasicNodeMaterial({
        color: 0xffffff,
        opacity: 0.5,
        transparent: true,
      })
    );
    this.add(this.mesh);
    this.overlayPass = pass(this, this.camera);
  }

  enable() {
    if (!this.mesh.material.map) {
      this.mesh.material.map = TextureLoaderManager.textureLoader.load(logo);
    }

    this.viewer.renderPipeline.addOverlayPass(this.overlayPass);
  }

  disable() {
    // Currently, this is unused, but reserved for future use
    this.viewer.renderPipeline.removeOverlayPass(this.overlayPass);
  }

  dispose() {
    this.overlayPass.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.material.map?.dispose();
  }
}

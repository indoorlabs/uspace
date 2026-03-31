import { texture, uv, vec2 } from 'three/tsl';
import {
  Box3,
  CanvasTarget,
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  type Object3D,
} from 'three/webgpu';
import { type Viewer, CameraControls, ObjectUtils } from 'u-space';

const _v1 = new Vector3();
const _v2 = new Vector3();

class Minimap {
  viewer: Viewer;
  camera: OrthographicCamera;
  scene: Scene;
  canvas: HTMLCanvasElement;
  canvasTarget: CanvasTarget;
  renderTarget: RenderTarget;
  controls: CameraControls;
  plane: Mesh<PlaneGeometry, MeshBasicNodeMaterial>;

  target: Object3D | null;
  marker: Object3D;
  needsUpdate: boolean;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '10px';
    this.canvas.style.left = '10px';
    this.canvasTarget = new CanvasTarget(this.canvas);
    this.camera = new OrthographicCamera();
    this.camera.position.z = 1;
    this.scene = new Scene();
    this.scene.environment = viewer.scene.environment;
    this.renderTarget = new RenderTarget(1, 1, { flipY: false });
    this.controls = new CameraControls(this.camera, this.canvas);
    this.controls.enabled = false;
    this.plane = new Mesh(
      new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new MeshBasicNodeMaterial({
        colorNode: texture(this.renderTarget.texture, vec2(uv().x, uv().y.oneMinus())),
        transparent: true,
        depthTest: false,
      }),
    );

    this.target = null;
    this.marker = new Mesh(
      new ShapeGeometry(
        new Shape([new Vector2(0, 0.9), new Vector2(0.6, -0.9), new Vector2(0, -0.4), new Vector2(-0.6, -0.9)]),
      ).rotateX(-Math.PI / 2),
      new MeshBasicNodeMaterial({ color: 0xff0000, transparent: true, depthTest: false }),
    );
    this.marker.scale.setScalar(5);
    this.marker.renderOrder = 1;
    this.needsUpdate = false;

    this.setSize(300, 300);
  }

  _update = async () => {
    const { renderer, timer, controls: mainControls } = this.viewer;

    if (this.needsUpdate && this.target) {
      this.needsUpdate = false;

      const parent = this.target.parent;
      this.scene.attach(this.target);

      const box = new Box3().setFromObject(this.target);
      const center = box.getCenter(_v1);
      const size = box.getSize(_v2);
      this.plane.position.copy(center);
      this.plane.scale.set(size.x, 1, size.z);

      this.scene.remove(this.plane);
      this.scene.remove(this.marker);

      this.controls.flyToBox(box, {
        viewpoint: 'top',
        enableTransition: false,
      });
      this.controls.update(timer.getDelta());

      const renderTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this.renderTarget);
      renderer.render(this.scene, this.camera);
      renderer.setRenderTarget(renderTarget);

      if (parent) parent.attach(this.target);
      else this.scene.remove(this.target);

      this.scene.add(this.plane);
      this.scene.add(this.marker);
    }

    // to perf: compute matrix related to target
    mainControls.getPosition(_v1);
    this.marker.position.x = _v1.x;
    this.marker.position.y = this.plane.position.y;
    this.marker.position.z = _v1.z;
    this.marker.rotation.y = mainControls.azimuthAngle;

    const canvasTarget = renderer.getCanvasTarget();
    const renderTarget = renderer.getRenderTarget();
    renderer.setCanvasTarget(this.canvasTarget);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
    renderer.setCanvasTarget(canvasTarget);
    renderer.setRenderTarget(renderTarget);
  };

  setSize(width: number, height: number, updateStyle = true) {
    this.canvasTarget.setSize(width, height, updateStyle);
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
    this.renderTarget.setSize(width, height);
  }

  enable() {
    this.viewer.el.appendChild(this.canvas);
    this.viewer.addEventListener('afterRender', this._update);
    return this;
  }

  disable() {
    this.viewer.el.removeChild(this.canvas);
    this.viewer.removeEventListener('afterRender', this._update);
    return this;
  }

  dispose() {
    this.disable();

    ObjectUtils.traverseMeshes(this.marker, (mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    this.renderTarget.dispose();
    this.renderTarget.texture.dispose();
    this.controls.dispose();
  }
}

export { Minimap };

import {
  EventDispatcher,
  WebGPURenderer,
  Scene,
  PerspectiveCamera,
  Timer,
  AgXToneMapping,
  PCFShadowMap,
  Color,
  OrthographicCamera,
  Cache,
} from 'three/webgpu';
// import { Inspector } from 'three/addons/inspector/Inspector.js';

import { InteractionManager } from '../interactions';
import { ObjectManager } from '../managers';
import { RenderPipeline } from './RenderPipeline';
import { CameraControls } from './CameraControls';
import { RoomEnvironment } from './RoomEnvironment';
import { ViewerHelper } from './ViewerHelper';
import { Info } from './Info';

// Default enable cache
Cache.enabled = true;

type ViewerRendererOptions = ConstructorParameters<typeof WebGPURenderer>['0'];

export interface ViewerOptions {
  el: HTMLElement;
  rendererOptions?: ViewerRendererOptions;
}

export interface ViewerEventMap {
  beforeControlsUpdate: { time: number };
  afterControlsUpdate: { time: number };
  beforeRender: { time: number };
  afterRender: { time: number };
  cameraChange: { camera: PerspectiveCamera | OrthographicCamera };
}

class Viewer extends EventDispatcher<ViewerEventMap> {
  el: HTMLElement;
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera | OrthographicCamera;
  info: Info;
  controls: CameraControls;
  renderPipeline: RenderPipeline;
  timer: Timer;
  roomEnvironment: RoomEnvironment;
  interactionManager: InteractionManager;
  objectManager: ObjectManager;
  viewerHelper: ViewerHelper;
  frameCount = 1;
  frameloop: 'always' | 'demand' = 'demand';

  constructor({ el, rendererOptions }: ViewerOptions) {
    super();

    this.el = el;
    this.renderer = this._initRenderer(rendererOptions);
    this.scene = this.createScene();
    this.camera = this.createPerspectiveCamera();
    this.info = new Info(this.el, this.renderer);
    this.controls = new CameraControls(this.camera, this.renderer.domElement);
    this.renderPipeline = new RenderPipeline(this.renderer, this.scene, this.camera);
    this.timer = new Timer();
    this.roomEnvironment = new RoomEnvironment(this.renderer);
    this.interactionManager = new InteractionManager(this.renderer.domElement, this.scene, this.camera);
    this.objectManager = new ObjectManager();
    this.viewerHelper = new ViewerHelper(this);
    window.addEventListener('resize', this.onWindowResize);
  }

  onWindowResize = () => {
    const width = this.el.clientWidth;
    const height = this.el.clientHeight;

    if (this.camera instanceof PerspectiveCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    } else if (this.camera instanceof OrthographicCamera) {
      this.camera.left = -width / 2;
      this.camera.right = width / 2;
      this.camera.top = height / 2;
      this.camera.bottom = -height / 2;
      this.camera.updateProjectionMatrix();
    }

    this.renderer.setSize(width, height);
    this.render();
  };

  async init() {
    await this.renderer.init();

    // Initialize environment
    this.roomEnvironment.update();
    this.scene.environment = this.roomEnvironment.envMap;
  }

  setCamera(camera: PerspectiveCamera | OrthographicCamera) {
    this.camera = camera;
    this.controls.camera = camera;
    this.interactionManager.setCamera(camera);
    this.renderPipeline.setCamera(camera);
    this.onWindowResize();
    this.dispatchEvent({ type: 'cameraChange', camera });
  }

  setCameraByType(type: 'perspective' | 'orthographic') {
    if (type === 'perspective' && !(this.camera instanceof PerspectiveCamera)) {
      this.setCamera(this.createPerspectiveCamera());
    } else if (type === 'orthographic' && !(this.camera instanceof OrthographicCamera)) {
      this.setCamera(this.createOrthographicCamera());
    }
  }

  render(frame = 1) {
    this.frameCount += frame;
    return new Promise<void>((resolve) => {
      const fn = () => {
        this.removeEventListener('afterRender', fn);
        resolve();
      };
      this.addEventListener('afterRender', fn);
    });
  }

  private animate = (time: number) => {
    this.timer.update(time);

    this.dispatchEvent({ type: 'beforeControlsUpdate', time });
    let needsRender = this.controls.update(this.timer.getDelta());
    this.dispatchEvent({ type: 'afterControlsUpdate', time });

    if (this.frameCount > 0) {
      this.frameCount--;
      needsRender = true;
    }

    if (this.frameloop === 'always') {
      needsRender = true;
    }

    if (needsRender) {
      this.dispatchEvent({ type: 'beforeRender', time });
      this.renderer.info.reset();
      this.renderPipeline.render();
      this.info.update();
      this.dispatchEvent({ type: 'afterRender', time });
    }
  };

  private _initRenderer(rendererOptions?: ViewerRendererOptions) {
    const renderer = new WebGPURenderer({
      logarithmicDepthBuffer: true,
      antialias: false,
      depth: false,
      trackTimestamp: true,
      ...rendererOptions,
    });
    renderer.setSize(this.el.clientWidth, this.el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.toneMapping = AgXToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.info.autoReset = false;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setAnimationLoop(this.animate);
    // renderer.inspector = new Inspector();
    this.el.appendChild(renderer.domElement);
    return renderer;
  }

  createScene() {
    const scene = new Scene();
    scene.background = new Color(0x000000);
    return scene;
  }

  createPerspectiveCamera() {
    const camera = new PerspectiveCamera(50, this.el.clientWidth / this.el.clientHeight, 0.1, 1e5);
    camera.position.setScalar(5);
    return camera;
  }

  createOrthographicCamera() {
    const camera = new OrthographicCamera(
      -this.el.clientWidth / 2,
      this.el.clientWidth / 2,
      this.el.clientHeight / 2,
      -this.el.clientHeight / 2,
      0.1,
      1e5,
    );
    camera.position.setScalar(5);
    return camera;
  }

  dispose() {
    this.el.removeChild(this.renderer.domElement);
    window.removeEventListener('resize', this.onWindowResize);
    this.info.dispose();
    this.interactionManager.dispose();
    this.roomEnvironment.dispose();
    this.renderer.dispose();
    this.renderPipeline.dispose();
  }
}

export { Viewer };

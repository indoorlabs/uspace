import CameraControlsBase from 'camera-controls';
import {
  Box3,
  MathUtils,
  Matrix4,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
  type Object3D,
} from 'three/webgpu';

const subsetOfTHREE = {
  Vector2: Vector2,
  Vector3: Vector3,
  Vector4: Vector4,
  Quaternion: Quaternion,
  Matrix4: Matrix4,
  Spherical: Spherical,
  Box3: Box3,
  Sphere: Sphere,
  Raycaster: Raycaster,
};

CameraControlsBase.install({ THREE: subsetOfTHREE });

export interface FlyToBoxOptions {
  viewpoint?:
    | 'current'
    | 'top'
    | 'bottom'
    | 'front'
    | 'back'
    | 'left'
    | 'right'
    | 'frontTop'
    | 'backTop'
    | 'leftTop'
    | 'rightTop'
    | 'leftFrontTop'
    | 'rightFrontTop'
    | 'leftBackTop'
    | 'rightBackTop';
  enableTransition?: boolean;
  padding?: number;
  cover?: boolean;
}

export interface FlyToObjectOptions extends FlyToBoxOptions {}

export class CameraControls extends CameraControlsBase {
  constructor(...args: ConstructorParameters<typeof CameraControlsBase>) {
    super(...args);

    this.minDistance = 0.2;
    this.smoothTime = 0.2;
    this.dollySpeed = 0.2;
  }

  /**
   * Set absolute angle for azimuth to avoid spinning
   */
  absoluteRotations() {
    this.azimuthAngle = absoluteAngle(this.azimuthAngle, 0);
  }

  async flyToBox(box: Box3, options: FlyToBoxOptions = {}) {
    if (box.isEmpty()) {
      console.warn('CameraControls.flyToBox: The provided Box3 is empty.');
      return false;
    }

    this.absoluteRotations();

    const { viewpoint = 'frontTop', enableTransition = true, padding = 0.1, cover = false } = options;

    const promises: Promise<any>[] = [];

    if (viewpoint !== 'current') {
      const spherical = viewpointsSpherical[viewpoint.toUpperCase()] ?? viewpointsSpherical.FRONTTOP;
      const azimuthAngle = spherical.theta,
        polarAngle = spherical.phi;
      promises.push(
        this.fitToBox(box, enableTransition, {
          paddingLeft: padding,
          paddingRight: padding,
          paddingTop: padding,
          paddingBottom: padding,
          cover,
        }),
      );
      promises.push(this.rotateTo(azimuthAngle, polarAngle, enableTransition));
    } else {
      const sphere = new Sphere();
      box.getBoundingSphere(sphere);
      sphere.radius += padding;
      promises.push(this.fitToSphere(sphere, enableTransition));
    }

    await Promise.all(promises);

    return true;
  }

  async flyToObject(object: Object3D, options: FlyToObjectOptions = {}) {
    const box = new Box3().setFromObject(object);
    return this.flyToBox(box, options);
  }
}

const viewpointsSpherical: { [viewpoint: string]: Spherical } = {
  LEFT: new Spherical(0, Math.PI / 2, -Math.PI / 2),
  RIGHT: new Spherical(0, Math.PI / 2, Math.PI / 2),
  FRONT: new Spherical(0, Math.PI / 2, 0),
  BACK: new Spherical(0, Math.PI / 2, Math.PI),
  TOP: new Spherical(0, 0, 0),
  BOTTOM: new Spherical(0, Math.PI, 0),

  FRONTTOP: new Spherical(0, Math.PI / 4, 0),
  BACKTOP: new Spherical(0, Math.PI / 4, Math.PI),

  LEFTTOP: new Spherical(0, Math.PI / 4, -Math.PI / 2),
  RIGHTTOP: new Spherical(0, Math.PI / 4, Math.PI / 2),

  LEFTFRONTTOP: new Spherical(0, Math.PI / 4, -Math.PI / 4),
  RIGHTFRONTTOP: new Spherical(0, Math.PI / 4, Math.PI / 4),

  LEFTBACKTOP: new Spherical(0, Math.PI / 4, (-Math.PI / 4) * 3),
  RIGHTBACKTOP: new Spherical(0, Math.PI / 4, (Math.PI / 4) * 3),
};

function absoluteAngle(targetAngle: number, sourceAngle: number): number {
  const angle = targetAngle - sourceAngle;

  return MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

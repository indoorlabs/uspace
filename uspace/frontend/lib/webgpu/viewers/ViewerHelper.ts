import { type PassNode, OrthographicCamera } from 'three/webgpu';
import { pass } from 'three/tsl';
import { ViewHelper as ViewHelperBase } from 'three/addons/helpers/ViewHelper.js';

import type { Viewer } from './Viewer';

const dim = 128;

class ViewerHelper extends ViewHelperBase {
  viewer: Viewer;
  overlayPass: PassNode;

  constructor(viewer: Viewer) {
    super(viewer.camera, viewer.el);

    this.viewer = viewer;

    const orthoCamera = new OrthographicCamera(-2, 2, 2, -2, 0, 4);
    orthoCamera.position.set(0, 0, 2);

    this.overlayPass = pass(this, orthoCamera);

    this.setLabels('x', 'y', 'z');
  }

  _update = () => {
    this.quaternion.copy(this.viewer.camera.quaternion).invert();

    const location = this.location;

    let x, y;

    if (location.left !== null) {
      x = location.left;
    } else {
      x = this.viewer.el.offsetWidth - dim - location.right;
    }

    if (location.top !== null) {
      // Position from top
      y = location.top;
    } else {
      // Position from bottom
      y = this.viewer.el.offsetHeight - dim - location.bottom;
    }

    this.overlayPass.setViewport(x, y, dim, dim);
  };

  enable() {
    this.viewer.renderPipeline.addOverlayPass(this.overlayPass);
    this.viewer.addEventListener('beforeRender', this._update);
    this.viewer.render()
    return this;
  }

  disable() {
    this.viewer.renderPipeline.removeOverlayPass(this.overlayPass);
    this.viewer.removeEventListener('beforeRender', this._update);
    this.viewer.render()
    return this;
  }
}

export { ViewerHelper };

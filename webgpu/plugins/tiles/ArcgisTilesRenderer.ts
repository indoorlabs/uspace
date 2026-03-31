import { MathUtils } from 'three/webgpu';
import type { Viewer } from 'u-space';

import { Globe } from './Globe';

class ArcgisTilesRenderer extends Globe {
  viewer: Viewer;

  loedTilesSets: Set<() => void> = new Set();

  constructor(viewer: Viewer) {
    super();

    this.viewer = viewer;

    this.tiles.addEventListener('needs-render', this.render);
    this.tiles.addEventListener('needs-update', this.render);
  }

  render = () => {
    this.viewer.render();
  };

  beforeRenderHandler = () => {
    this.viewer.camera.updateMatrixWorld();
    this.tiles.setCamera(this.viewer.camera);
    this.tiles.setResolutionFromRenderer(this.viewer.camera, this.viewer.renderer as never);
    this.tiles.update();
  };

  enable() {
    this.viewer.scene.add(this.tiles.group);
    this.viewer.addEventListener('beforeRender', this.beforeRenderHandler);
    return this;
  }

  disable() {
    this.viewer.scene.remove(this.tiles.group);
    this.viewer.removeEventListener('beforeRender', this.beforeRenderHandler);
    return this;
  }

  invalidate(lon: number, lat: number, alt: number) {
    const loadTileHandle = () => {
      const latRaian = MathUtils.degToRad(lat);
      const lngRaian = MathUtils.degToRad(lon);

      this.reorientationPlugin.transformLatLonHeightToOrigin(latRaian, lngRaian, alt);
      this.render();

      unsubsribe();
    };

    const unsubsribe = () => {
      this.tiles.removeEventListener('load-root-tileset', loadTileHandle);
      this.loedTilesSets.delete(loadTileHandle);
    };

    this.tiles.addEventListener('load-root-tileset', loadTileHandle);
    this.loedTilesSets.add(loadTileHandle);

    // tiles has loaded
    if (this.tiles.root) {
      loadTileHandle();
    }

    return unsubsribe;
  }

  dispose() {
    this.disable();

    this.loedTilesSets.forEach((handle) => this.tiles.removeEventListener('load-root-tileset', handle));
    this.loedTilesSets.clear();
    this.tiles.removeEventListener('needs-render', this.render);
    this.tiles.removeEventListener('needs-update', this.render);
    this.tiles.dispose();
  }
}

export { ArcgisTilesRenderer };

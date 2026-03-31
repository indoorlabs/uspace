import { MeshBasicNodeMaterial } from 'three/webgpu';
import { TilesRenderer } from '3d-tiles-renderer';
import { TileCompressionPlugin, UpdateOnChangePlugin, ReorientationPlugin, XYZTilesPlugin } from '3d-tiles-renderer/plugins';

import { TilesFadePlugin } from './plugins/fade/TilesFadePlugin';
import { TileMaterialReplacementPlugin } from './plugins/TileMaterialReplacementPlugin';

class Globe {
  tiles: TilesRenderer;
  tileCompressionPlugin: TileCompressionPlugin;
  updateOnChangePlugin: UpdateOnChangePlugin;
  reorientationPlugin: ReorientationPlugin;
  xyzTilesPlugin: XYZTilesPlugin;
  tilesFadePlugin: TilesFadePlugin;
  tileMaterialReplacementPlugin: TileMaterialReplacementPlugin;

  constructor() {
    this.tiles = this._initTilesRenderer();
    this.tileCompressionPlugin = this._initTileCompressionPlugin();
    this.updateOnChangePlugin = this._initUpdateOnChangePlugin();
    this.reorientationPlugin = this._initReorientationPlugin();
    this.xyzTilesPlugin = this._initXYZTilesPlugin();
    this.tilesFadePlugin = this._initTilesFadePlugin();
    this.tileMaterialReplacementPlugin = this._initTileMaterialReplacementPlugin();
  }

  _initTilesRenderer() {
    const tiles = new TilesRenderer();
    tiles.maxDepth = 20;
    tiles.errorTarget = 1;
    return tiles;
  }

  _initTileCompressionPlugin() {
    const tileCompressionPlugin = new TileCompressionPlugin();
    this.tiles.registerPlugin(tileCompressionPlugin);
    return tileCompressionPlugin;
  }

  _initUpdateOnChangePlugin() {
    const updateOnChangePlugin = new UpdateOnChangePlugin();
    this.tiles.registerPlugin(updateOnChangePlugin);
    return updateOnChangePlugin;
  }

  _initReorientationPlugin() {
    const reorientationPlugin = new ReorientationPlugin();
    this.tiles.registerPlugin(reorientationPlugin);
    return reorientationPlugin;
  }

  _initXYZTilesPlugin() {
    const xyzTilesPlugin = new XYZTilesPlugin({
      center: true,
      shape: 'ellipsoid',
      url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    });
    this.tiles.registerPlugin(xyzTilesPlugin);
    return xyzTilesPlugin;
  }

  _initTilesFadePlugin() {
    const tilesFadePlugin = new TilesFadePlugin();
    this.tiles.registerPlugin(tilesFadePlugin);
    return tilesFadePlugin;
  }

  _initTileMaterialReplacementPlugin() {
    const tileMaterialReplacementPlugin = new TileMaterialReplacementPlugin(MeshBasicNodeMaterial);
    this.tiles.registerPlugin(tileMaterialReplacementPlugin);
    return tileMaterialReplacementPlugin;
  }
}

export { Globe };

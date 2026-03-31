import { type Material, NodeMaterial } from 'three/webgpu';
// @ts-expect-error
import { FadeMaterialManager as FadeMaterialManagerBase } from '3d-tiles-renderer/src/three/plugins/fade/FadeMaterialManager.js';
// @ts-expect-error
import { wrapFadeMaterial } from '3d-tiles-renderer/src/three/plugins/fade/wrapFadeMaterial.js';

import { wrapFadeNodeMaterial } from './wrapFadeNodeMaterial';

export interface FadeParams {
  fadeIn: { value: number };
  fadeOut: { value: number };
  fadeTexture: { value: unknown };
}

export class FadeMaterialManager extends FadeMaterialManagerBase {
  protected declare _fadeParams: WeakMap<Material, FadeParams>;

  // HACK: Override "wrapFadeMaterial" to support NodeMaterial:
  prepareMaterial(material: Material): void {
    const fadeParams = this._fadeParams;
    if (fadeParams.has(material)) {
      return;
    }

    let params;
    if (material instanceof NodeMaterial) {
      params = wrapFadeNodeMaterial(material);
    } else {
      params = wrapFadeMaterial(material, material.onBeforeCompile);
    }
    fadeParams.set(material, params);
  }
}

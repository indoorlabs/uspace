import { type NodeMaterial, type Object3D, type ColorRepresentation, Color, type Node } from 'three/webgpu';
import { userData, select, materialColor, vec3, Fn, materialOpacity } from 'three/tsl';
import { ObjectUtils } from '../objects';
import { reinterpretType } from '../types';

export interface HighlightOptions {
  enabled?: boolean;
  opacity?: number;
  color?: ColorRepresentation;
  overwrite?: boolean;
}

const _highlightKey = 'uSpaceHighlight';
const _highlightEnabledKey = `${_highlightKey}/enabled`;
const _highlightOpacityKey = `${_highlightKey}/opacity`;
const _highlightColorKey = `${_highlightKey}/color`;
const _highlightOverwriteKey = `${_highlightKey}/overwrite`;
const _highlightColorNode = Fn<Node<'vec3'>>(() => {
  // Build TSL node graph with fallback support
  const enabled = userData(_highlightEnabledKey, 'uint');
  const colorUint = userData(_highlightColorKey, 'uint');
  const overwrite = userData(_highlightOverwriteKey, 'uint');
  reinterpretType<Node<'uint'>>(enabled);
  reinterpretType<Node<'uint'>>(colorUint);
  reinterpretType<Node<'uint'>>(overwrite);
  reinterpretType<Node<'vec3'>>(materialColor);
  // Convert uint to vec3 color
  const hlColorRaw = uintToColor(colorUint);
  // overwrite: 直接替换颜色
  // !overwrite: 与原色相乘（着色/染色效果）
  const tintedColor = materialColor.mul(hlColorRaw);
  const finalHlColor = select(overwrite.greaterThan(0), hlColorRaw, tintedColor);

  // Apply highlight or fallback to original
  const hlColor = select(enabled.greaterThan(0), finalHlColor, materialColor);
  return hlColor;
})();
const _highlightOpacityNode = Fn<Node<'float'>>(() => {
  const enabled = userData(_highlightEnabledKey, 'uint');
  const opacity = userData(_highlightOpacityKey, 'float');
  reinterpretType<Node<'uint'>>(enabled);
  reinterpretType<Node<'float'>>(opacity);
  reinterpretType<Node<'float'>>(materialOpacity);
  const hlOpacity = select(enabled.greaterThan(0), opacity, materialOpacity);
  return hlOpacity;
})();

export class MaterialEffects {
  static highlight(object: Object3D, options: HighlightOptions = {}) {
    const highlightOptions: Required<HighlightOptions> = Object.assign(
      {
        enabled: true,
        opacity: 0.5,
        color: 0xff0000,
        overwrite: false,
      },
      options,
    );

    // Ensure color is a hex number for TSL uint compatibility
    highlightOptions.color = new Color(highlightOptions.color).getHex();

    ObjectUtils.traverseMeshes(object, (mesh) => {
      // 1. Set userData on THIS specific object
      mesh.userData[_highlightEnabledKey] = highlightOptions.enabled ? 1 : 0; // Enable flag
      mesh.userData[_highlightOpacityKey] = highlightOptions.opacity;
      mesh.userData[_highlightColorKey] = highlightOptions.color;
      mesh.userData[_highlightOverwriteKey] = highlightOptions.overwrite ? 1 : 0;

      const material = mesh.material;
      // Currently only support single material
      if (material && !Array.isArray(material)) {
        reinterpretType<NodeMaterial>(material);
        // TODO: Revert material transparent
        material.transparent = true;
        material.colorNode = _highlightColorNode;
        material.opacityNode = _highlightOpacityNode;
        material.needsUpdate = true;
      }
    });
  }
}

/**
 * Convert a uint hex color node (e.g., 0xff0000) to a vec3 RGB node (0-1 range)
 */
const uintToColor = (colorUint: Node<'uint'>) => {
  const r = colorUint.shiftRight(16).bitAnd(0xff).toFloat().div(255);
  const g = colorUint.shiftRight(8).bitAnd(0xff).toFloat().div(255);
  const b = colorUint.bitAnd(0xff).toFloat().div(255);
  return vec3(r, g, b);
};

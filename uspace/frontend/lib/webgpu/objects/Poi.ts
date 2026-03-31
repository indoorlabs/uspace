import { SpriteNodeMaterial, CanvasTexture, SRGBColorSpace } from 'three/webgpu';

import type { InteractionEventMap } from '../interactions';
import { BaseSprite } from './BaseSprite';

export interface PoiParameters {
  /** Image URL or HTMLImageElement */
  img?: string | CanvasImageSource;
  /** Text content */
  text?: string;
  /** Font size in pixels */
  fontSize?: number;
  /** Font family */
  fontFamily?: string;
  /** Text color */
  color?: string;
  /** Icon size in pixels (applied to the image if present) */
  iconSize?: number;
  /** Padding between icon and text, and around the container */
  padding?: number;
  /** Background color of the POI (optional) */
  backgroundColor?: string;
  /** Border radius for the background (optional) */
  borderRadius?: number;
  /** Text position relative to the icon */
  textPosition?: 'top' | 'bottom' | 'left' | 'right';
}

export class Poi extends BaseSprite<InteractionEventMap> {
  readonly isPoi = true;
  type = 'Poi';

  parameters: Required<PoiParameters> = {
    img: '',
    text: '',
    fontSize: 32,
    fontFamily: 'Arial',
    color: '#ffffff',
    iconSize: 64,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    textPosition: 'right',
  };

  constructor(parameters: PoiParameters = {}) {
    super(new SpriteNodeMaterial());

    Object.assign(this.parameters, parameters);
  }

  /**
   * Update the POI with new parameters
   * @param parameters Partial POI parameters
   */
  async updateAsync(parameters: Partial<PoiParameters> = {}) {
    Object.assign(this.parameters, parameters);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Define font for measurement
    ctx.font = `${this.parameters.fontSize}px ${this.parameters.fontFamily}`;

    let image: CanvasImageSource | null = null;
    if (this.parameters.img) {
      image = await this._loadImage(this.parameters.img);
    }

    const { text, fontSize, color, iconSize, padding, backgroundColor, borderRadius, textPosition } = this.parameters;

    // Measure text
    const textMetrics = ctx.measureText(text);
    const textWidth = text ? textMetrics.width : 0;
    const textHeight = text ? fontSize : 0;

    // Calculate canvas size and positions
    let contentWidth = 0;
    let contentHeight = 0;

    // Default positions (assuming single item centered)
    let iconX = 0,
      iconY = 0;
    let textX = 0,
      textY = 0;

    const hasImage = !!image;
    const hasText = !!text;

    if (hasImage && hasText) {
      switch (textPosition) {
        case 'top':
          contentWidth = Math.max(iconSize, textWidth);
          contentHeight = iconSize + padding + textHeight;

          textX = (contentWidth - textWidth) / 2;
          textY = textHeight / 2; // baseline adjustment
          iconX = (contentWidth - iconSize) / 2;
          iconY = textHeight + padding;
          break;
        case 'bottom':
          contentWidth = Math.max(iconSize, textWidth);
          contentHeight = iconSize + padding + textHeight;

          iconX = (contentWidth - iconSize) / 2;
          iconY = 0;
          textX = (contentWidth - textWidth) / 2;
          textY = iconSize + padding + textHeight / 2;
          break;
        case 'left':
          contentWidth = iconSize + padding + textWidth;
          contentHeight = Math.max(iconSize, textHeight);

          textX = 0;
          textY = contentHeight / 2;
          iconX = textWidth + padding;
          iconY = (contentHeight - iconSize) / 2;
          break;
        case 'right':
        default:
          contentWidth = iconSize + padding + textWidth;
          contentHeight = Math.max(iconSize, textHeight);

          iconX = 0;
          iconY = (contentHeight - iconSize) / 2;
          textX = iconSize + padding;
          textY = contentHeight / 2;
          break;
      }
    } else if (hasImage) {
      contentWidth = iconSize;
      contentHeight = iconSize;
      iconX = 0;
      iconY = 0;
    } else if (hasText) {
      contentWidth = textWidth;
      contentHeight = textHeight;
      textX = 0;
      textY = textHeight / 2;
    }

    const canvasWidth = contentWidth + padding * 2;
    const canvasHeight = contentHeight + padding * 2;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Redraw font after canvas resize (reset by resize)
    ctx.font = `${fontSize}px ${this.parameters.fontFamily}`;
    ctx.textBaseline = 'middle';

    // Draw background
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      this._drawRoundedRect(ctx, 0, 0, canvasWidth, canvasHeight, borderRadius);
      ctx.fill();
    }

    // Offset positions by padding
    if (hasImage) {
      ctx.drawImage(image!, iconX + padding, iconY + padding, iconSize, iconSize);
    }

    if (hasText) {
      ctx.fillStyle = color;
      ctx.fillText(text, textX + padding, textY + padding);
    }

    // Update texture
    this.material.map?.dispose();

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.material.map = texture;

    // Adjust sprite scale based on aspect ratio to maintain proportions
    const scaleFactor = 0.01;
    this.scale.set(canvasWidth * scaleFactor, canvasHeight * scaleFactor, 1);
  }

  private _loadImage(img: NonNullable<PoiParameters['img']>): Promise<CanvasImageSource> {
    return new Promise((resolve, reject) => {
      if (typeof img === 'string') {
        const _img = new Image();
        _img.crossOrigin = 'Anonymous';
        _img.onload = () => resolve(_img);
        _img.onerror = (err) => reject(err);
        _img.src = img;
      } else {
        resolve(img);
      }
    });
  }

  private _drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  dispose() {
    this.material.map?.dispose();
    this.material.dispose();
  }
}

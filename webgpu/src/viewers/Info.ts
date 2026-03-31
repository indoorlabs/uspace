import { TimestampQuery, type WebGPURenderer } from 'three/webgpu';

export class Info {
  el: HTMLElement;
  renderer: WebGPURenderer;

  container: HTMLElement;
  drawCallsText: HTMLElement;
  frameCallsText: HTMLElement;
  trianglesText: HTMLElement;
  pointsText: HTMLElement;
  linesText: HTMLElement;
  timestampText: HTMLElement;

  _enabled = false;

  constructor(el: HTMLElement, renderer: WebGPURenderer) {
    this.el = el;
    this.renderer = renderer;

    const container = document.createElement('div');

    container.style.position = 'absolute';
    container.style.left = '12px';
    container.style.bottom = '12px';
    container.style.fontSize = '12px';
    container.style.color = '#fff';
    container.style.pointerEvents = 'none';

    this.container = container;

    function createTextEl(text: string, isMarginLeft = true): HTMLElement {
      const el = document.createElement('span');
      if (isMarginLeft) el.style.marginLeft = '6px';
      el.innerText = text;
      return el;
    }

    function createBr() {
      return document.createElement('br');
    }

    this.drawCallsText = createTextEl('0');
    this.frameCallsText = createTextEl('0');
    this.trianglesText = createTextEl('0');
    this.linesText = createTextEl('0');
    this.pointsText = createTextEl('0');
    this.timestampText = createTextEl('0');

    // draw calls
    this.container.appendChild(createTextEl('draw calls', false));
    this.container.appendChild(this.drawCallsText);
    this.container.appendChild(createBr());

    // frame calls
    this.container.appendChild(createTextEl('frame calls', false));
    this.container.appendChild(this.frameCallsText);
    this.container.appendChild(createBr());

    // triangles
    this.container.appendChild(createTextEl('triangles', false));
    this.container.appendChild(this.trianglesText);
    this.container.appendChild(createBr());

    // points
    this.container.appendChild(createTextEl('points', false));
    this.container.appendChild(this.pointsText);
    this.container.appendChild(createBr());

    // lines
    this.container.appendChild(createTextEl('lines', false));
    this.container.appendChild(this.linesText);
    this.container.appendChild(createBr());

    // timestamp
    this.container.appendChild(createTextEl('timestamp', false));
    this.container.appendChild(this.timestampText);
    this.container.appendChild(createBr());
  }

  update() {
    if (this._enabled) {
      const { render } = this.renderer.info;

      this.drawCallsText.innerText = render.drawCalls.toString();
      this.frameCallsText.innerText = render.frameCalls.toString();
      this.trianglesText.innerText = render.triangles.toString();
      this.pointsText.innerText = render.points.toString();
      this.linesText.innerText = render.lines.toString();

      this.renderer.resolveTimestampsAsync(TimestampQuery.RENDER).then((timestamps) => {
        this.timestampText.innerText = timestamps?.toFixed(2) ?? '0';
      });
    }
  }

  enable() {
    this._enabled = true;
    this.el.appendChild(this.container);
  }

  disable() {
    this._enabled = false;
    this.container.remove();
  }

  dispose() {
    this.disable();
  }
}

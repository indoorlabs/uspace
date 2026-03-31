import { Raycaster, Vector2, type Object3D, type Scene, type Camera, type Intersection } from 'three/webgpu';
import { InteractionEvent, type InteractionEventMap, type InteractionEventType } from './InteractionEvent';

/**
 * Manages pointer interactions with 3D objects in the scene.
 * Handles raycasting and event dispatching with bubbling support.
 */
export class InteractionManager {
  private domElement: HTMLElement;
  private scene: Scene;
  private camera: Camera;
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private hoveredObject: Object3D<InteractionEventMap> | null = null;
  private pointerDownTime = 0;
  private pointerDownPos = new Vector2();
  private clickTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressThreshold = 500;
  private moveThreshold = 0.01;

  /**
   * The objects to check for intersections.
   * If not set, it defaults to the children of the scene.
   */
  targetObjects: Object3D<InteractionEventMap>[] | null = null;

  /**
   * Whether to enable pointer move events (pointermove, pointerenter, pointerleave).
   * Disabled by default for performance optimization.
   */
  pointerMoveEventsEnabled = false;

  constructor(domElement: HTMLElement, scene: Scene, camera: Camera) {
    this.domElement = domElement;
    this.scene = scene;
    this.camera = camera;
    this.raycaster.params.Points.threshold = 0.1;
    this.raycaster.params.Line.threshold = 0.1;
    this._bindEvents();
  }

  /**
   * Updates the camera reference (useful when switching cameras).
   */
  setCamera(camera: Camera) {
    this.camera = camera;
  }

  private _bindEvents() {
    this.domElement.addEventListener('click', this._onClick);
    this.domElement.addEventListener('dblclick', this._onDblClick);
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
  }

  private _updatePointer(event: PointerEvent | MouseEvent) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private _getIntersects(): Intersection<Object3D<InteractionEventMap>>[] {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects = this.targetObjects || this.scene.children;
    return this.raycaster.intersectObjects<Object3D<InteractionEventMap>>(objects, true);
  }

  /**
   * Dispatches an event to the target object and bubbles up the parent chain.
   */
  private _dispatchToTarget(
    type: InteractionEventType,
    target: Object3D<InteractionEventMap>,
    intersect: Intersection<Object3D<InteractionEventMap>> | null,
    originalEvent: PointerEvent | MouseEvent
  ) {
    const event3d = new InteractionEvent({
      type,
      target,
      intersect,
      originalEvent,
    });

    // Bubbling phase: dispatch to target and all ancestors
    let current: Object3D<InteractionEventMap> | null = target;
    while (current && !event3d.propagationStopped) {
      event3d.currentTarget = current;
      // Three.js EventDispatcher expects { type: string, ... }
      current.dispatchEvent({ type, event: event3d });
      current = current.parent as Object3D<InteractionEventMap> | null;
    }
  }

  /**
   * Handles a DOM event by raycasting and dispatching to the first intersected object.
   */
  private _handleEvent(type: InteractionEventType, originalEvent: PointerEvent | MouseEvent) {
    this._updatePointer(originalEvent);
    const intersects = this._getIntersects();

    if (intersects.length === 0) return;

    const hit = intersects[0];
    this._dispatchToTarget(type, hit.object, hit, originalEvent);
  }

  private _onClick = (e: MouseEvent) => {
    const duration = Date.now() - this.pointerDownTime;
    const moveDistance = this.pointer.distanceTo(this.pointerDownPos);

    if (duration > this.longPressThreshold || moveDistance > this.moveThreshold) {
      return;
    }

    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
      this.clickTimer = null;
      return;
    }

    this.clickTimer = setTimeout(() => {
      this._handleEvent('click', e);
      this.clickTimer = null;
    }, 200);
  };

  private _onDblClick = (e: MouseEvent) => {
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
      this.clickTimer = null;
    }
    this._handleEvent('dblclick', e);
  };

  private _onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    this._handleEvent('contextmenu', e);
  };

  private _onPointerDown = (e: PointerEvent) => {
    this.pointerDownTime = Date.now();
    this._updatePointer(e);
    this.pointerDownPos.copy(this.pointer);
    this._handleEvent('pointerdown', e);
  };

  private _onPointerUp = (e: PointerEvent) => this._handleEvent('pointerup', e);

  private _onPointerMove = (e: PointerEvent) => {
    if (!this.pointerMoveEventsEnabled) return;

    this._updatePointer(e);
    const intersects = this._getIntersects();

    const hitObject = intersects.length > 0 ? intersects[0].object : null;
    const intersect = intersects.length > 0 ? intersects[0] : null;

    // Handle pointerenter / pointerleave
    if (this.hoveredObject !== hitObject) {
      // Dispatch pointerleave to the old hovered object
      if (this.hoveredObject) {
        this._dispatchToTarget('pointerleave', this.hoveredObject, null, e);
      }

      this.hoveredObject = hitObject;

      // Dispatch pointerenter to the new hovered object
      if (hitObject && intersect) {
        this._dispatchToTarget('pointerenter', hitObject, intersect, e);
      }
    }

    // Dispatch pointermove if over an object
    if (hitObject && intersect) {
      this._dispatchToTarget('pointermove', hitObject, intersect, e);
    }
  };

  /**
   * Cleans up event listeners.
   */
  dispose() {
    this.domElement.removeEventListener('click', this._onClick);
    this.domElement.removeEventListener('dblclick', this._onDblClick);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.hoveredObject = null;
  }
}

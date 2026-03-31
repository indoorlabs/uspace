import type { Object3D } from 'three/webgpu';

/**
 * Manages 3D objects with custom id and name caching for quick retrieval.
 */
export class ObjectManager {
  private idMap = new Map<string, Object3D>();
  private nameMap = new Map<string, Set<Object3D>>();
  private typeMap = new Map<string, Set<Object3D>>();
  private objectIds = new Map<Object3D, Set<string>>();
  private allObjects = new Set<Object3D>();

  /**
   * Add an object with a custom id.
   * One object can have multiple ids.
   */
  add(id: string, object: Object3D) {
    if (this.idMap.has(id)) {
      console.warn(`ObjectManager: Object with id ${id} already exists.`);
      return;
    }

    this.idMap.set(id, object);
    this.allObjects.add(object);

    // Track all ids for this object
    if (!this.objectIds.has(object)) {
      this.objectIds.set(object, new Set());
    }
    this.objectIds.get(object)!.add(id);

    // Add to name map (Set)
    if (object.name) {
      if (!this.nameMap.has(object.name)) {
        this.nameMap.set(object.name, new Set());
      }
      this.nameMap.get(object.name)!.add(object);
    }

    // Add to type map (Set)
    if (object.type) {
      if (!this.typeMap.has(object.type)) {
        this.typeMap.set(object.type, new Set());
      }
      this.typeMap.get(object.type)!.add(object);
    }
  }

  /**
   * Get an object by its custom id.
   */
  getById<T extends Object3D>(id: string): T | undefined {
    return this.idMap.get(id) as T | undefined;
  }

  /**
   * Get all objects with a given name.
   */
  getByName<T extends Object3D>(name: string): Set<T> {
    return (this.nameMap.get(name) as Set<T>) || new Set();
  }

  /**
   * Get all objects with a given type.
   */
  getByType<T extends Object3D>(type: string): Set<T> {
    return (this.typeMap.get(type) as Set<T>) || new Set();
  }

  /**
   * Get all ids associated with an object.
   */
  getObjectIds(object: Object3D): Set<string> {
    return this.objectIds.get(object) || new Set();
  }

  /**
   * Remove an object and all its associated ids.
   */
  remove(object: Object3D) {
    // Remove all ids associated with this object
    const ids = this.objectIds.get(object);
    if (ids) {
      for (const id of ids) {
        this.idMap.delete(id);
      }
      this.objectIds.delete(object);
    }

    // Remove from name map
    if (object.name && this.nameMap.has(object.name)) {
      const set = this.nameMap.get(object.name)!;
      set.delete(object);
      if (set.size === 0) {
        this.nameMap.delete(object.name);
      }
    }

    // Remove from type map
    if (object.type && this.typeMap.has(object.type)) {
      const set = this.typeMap.get(object.type)!;
      set.delete(object);
      if (set.size === 0) {
        this.typeMap.delete(object.type);
      }
    }

    this.allObjects.delete(object);
  }

  /**
   * Remove an object by its id.
   */
  removeById(id: string) {
    const object = this.idMap.get(id);
    if (object) {
      this.remove(object);
    }
  }

  /**
   * Remove all objects with a given name.
   */
  removeByName(name: string) {
    const objects = this.getByName(name);
    for (const object of objects) {
      this.remove(object);
    }
  }

  /**
   * Remove all objects with a given type.
   */
  removeByType(type: string) {
    const objects = this.getByType(type);
    for (const object of objects) {
      this.remove(object);
    }
  }

  /**
   * Clear all cached objects.
   */
  clear() {
    this.idMap.clear();
    this.nameMap.clear();
    this.typeMap.clear();
    this.objectIds.clear();
    this.allObjects.clear();
  }

  /**
   * Get all cached objects as a Set.
   */
  getAll<T extends Object3D>(): Set<T> {
    return this.allObjects as Set<T>;
  }

  /**
   * Get the number of unique cached objects.
   */
  get size(): number {
    return this.allObjects.size;
  }
}

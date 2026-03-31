import * as THREE from "three";
import buildingData from "../../backend/json/simple1.json";

const SCALE = 0.01; // cm to meters

// Compute bounding box center to position building at origin
function computeCenter(data) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  data.Floors.forEach((floor) => {
    floor.Spaces.forEach((space) => {
      for (let i = 0; i < space.shape.length; i += 2) {
        minX = Math.min(minX, space.shape[i]);
        maxX = Math.max(maxX, space.shape[i]);
        minY = Math.min(minY, space.shape[i + 1]);
        maxY = Math.max(maxY, space.shape[i + 1]);
      }
    });
  });
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function getSpaceMaterial(name) {
  if (name.startsWith("Window_Space")) {
    return new THREE.MeshPhysicalMaterial({
      color: 0x88ccee,
      transparent: true,
      opacity: 0.35,
      metalness: 0.1,
      roughness: 0.05,
      side: THREE.DoubleSide,
    });
  }
  if (name.startsWith("Door_Space")) {
    return new THREE.MeshStandardMaterial({
      color: 0x6b4226,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      metalness: 0.2,
      roughness: 0.8,
    });
  }
  // Regular space
  return new THREE.MeshStandardMaterial({
    color: 0x1a2a3a,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    metalness: 0.3,
    roughness: 0.7,
  });
}

function createSpaceMesh(space, floorLevel, floorIndex, center) {
  const coords = space.shape;
  const shape = new THREE.Shape();

  shape.moveTo((coords[0] - center.x) * SCALE, (coords[1] - center.y) * SCALE);
  for (let i = 2; i < coords.length; i += 2) {
    shape.lineTo((coords[i] - center.x) * SCALE, (coords[i + 1] - center.y) * SCALE);
  }
  shape.closePath();

  // Add holes if present
  if (space.holes) {
    space.holes.forEach((holeCoords) => {
      const hole = new THREE.Path();
      hole.moveTo((holeCoords[0] - center.x) * SCALE, (holeCoords[1] - center.y) * SCALE);
      for (let i = 2; i < holeCoords.length; i += 2) {
        hole.lineTo((holeCoords[i] - center.x) * SCALE, (holeCoords[i + 1] - center.y) * SCALE);
      }
      hole.closePath();
      shape.holes.push(hole);
    });
  }

  // Filled polygon (yellow)
  const shapeGeo = new THREE.ShapeGeometry(shape);
  const fill = new THREE.Mesh(
    shapeGeo,
    new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = floorLevel * SCALE;
  fill.userData = {
    type: "space",
    name: space.name,
    id: space.id,
    floor: floorIndex,
  };

  // Edge outline (white)
  const points = [];
  for (let i = 0; i < coords.length; i += 2) {
    points.push(new THREE.Vector3(
      (coords[i] - center.x) * SCALE,
      0,
      -(coords[i + 1] - center.y) * SCALE
    ));
  }
  if (points.length > 0) {
    points.push(points[0].clone());
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(
    lineGeo,
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  line.position.y = floorLevel * SCALE + 0.01;

  return { fill, line };
}

/**
 * Build the full scene from JSON floor plan data.
 * Returns { floorGroups: THREE.Group[] } so the caller can manipulate floors.
 */
export function buildScene(scene) {
  // ── Lights ──
  scene.add(new THREE.AmbientLight(0x334466, 0.6));

  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(20, 40, 20);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  scene.add(dir);

  const accentLight = new THREE.PointLight(0x00d4ff, 0.8, 60);
  accentLight.position.set(-10, 20, 10);
  scene.add(accentLight);

  const warmLight = new THREE.PointLight(0xff6b3d, 0.4, 50);
  warmLight.position.set(15, 5, -8);
  scene.add(warmLight);

  // ── Ground ──
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x0a0f18, metalness: 0.2, roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Grid ──
  scene.add(new THREE.GridHelper(100, 50, 0x1a2a3a, 0x111922));

  // ── Building from JSON ──
  const center = computeCenter(buildingData);
  const floorGroups = [];

  buildingData.Floors.forEach((floor, index) => {
    const group = new THREE.Group();
    group.name = `floor-${index}`;

    floor.Spaces.forEach((space) => {
      if (space.name.startsWith("Door_Space") || space.name.startsWith("Window_Space")) return;
      const { fill, line } = createSpaceMesh(space, floor.level, index, center);
      group.add(fill);
      group.add(line);
    });

    scene.add(group);
    floorGroups.push(group);
  });

  return { floorGroups };
}

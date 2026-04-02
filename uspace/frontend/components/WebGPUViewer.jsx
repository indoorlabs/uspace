"use client";

import { useEffect, useRef, useState } from "react";
import { THEME } from "@/lib/constants";
// No default building - loaded dynamically via Building tab
const buildingData = { Stories: [], Spaces: [], Walls: [], Doors: [], Windows: [], Columns: [], Staircases: [] };

export default function WebGPUViewer() {
  const mountRef = useRef(null);
  const viewerRef = useRef(null);
  const minimapRef = useRef(null);
  const [minimapVisible, setMinimapVisible] = useState(false);
  const [mmPos, setMmPos] = useState({ x: typeof window !== "undefined" ? window.innerWidth - 230 : 500, y: 60 });
  const mmDragRef = useRef({ dragging: false, ox: 0, oy: 0 });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;

    async function initWebGPU() {
      // Dynamic import to avoid SSR issues
      const THREE = await import("three/webgpu");
      const CameraControlsModule = await import("camera-controls");
      const CameraControls = CameraControlsModule.default;
      CameraControls.install({ THREE });

      if (disposed) return;

      const w = mount.clientWidth;
      const h = mount.clientHeight;

      // WebGPU Renderer
      const renderer = new THREE.WebGPURenderer({
        antialias: true,
      });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.toneMappingExposure = 1.2;
      await renderer.init();
      mount.appendChild(renderer.domElement);

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(THEME.bg);

      // Camera
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
      camera.position.set(8, 8, 8);

      // Camera Controls
      const controls = new CameraControls(camera, renderer.domElement);
      controls.dollyToCursor = true;

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
      dirLight.position.set(15, 30, 15);
      dirLight.castShadow = true;
      scene.add(dirLight);

      // Ground
      const groundGeo = new THREE.PlaneGeometry(80, 80);
      const groundMat = new THREE.MeshStandardNodeMaterial({
        color: 0x111820,
        metalness: 0.2,
        roughness: 0.9,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.05;
      ground.receiveShadow = true;
      scene.add(ground);

      // Grid
      // Grid: 80m size, 0.5m spacing = 160 divisions
      scene.add(new THREE.GridHelper(80, 160, 0x1a2a3a, 0x111922));


      // --- Data references ---
      const SCALE = 0.01; // cm → m
      const stories = buildingData.Stories || [];
      const allSpaces = buildingData.Spaces || [];
      const allWalls = buildingData.Walls || [];
      const allDoors = buildingData.Doors || [];
      const allWindows = buildingData.Windows || [];
      const allColumns = buildingData.Columns || [];
      const allStaircases = buildingData.Staircases || [];

      // Compute center from all space polygons
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      allSpaces.forEach((space) => {
        space.Polygons.forEach((poly) => {
          for (let i = 0; i < poly.shape.length; i += 2) {
            minX = Math.min(minX, poly.shape[i]);
            maxX = Math.max(maxX, poly.shape[i]);
            minY = Math.min(minY, poly.shape[i + 1]);
            maxY = Math.max(maxY, poly.shape[i + 1]);
          }
        });
      });
      const cx = isFinite(minX) ? (minX + maxX) / 2 : 0;
      const cy = isFinite(minY) ? (minY + maxY) / 2 : 0;

      // Helper: create shape from coords
      function makeShape(coords) {
        const shape = new THREE.Shape();
        shape.moveTo((coords[0] - cx) * SCALE, (coords[1] - cy) * SCALE);
        for (let i = 2; i < coords.length; i += 2) {
          shape.lineTo((coords[i] - cx) * SCALE, (coords[i + 1] - cy) * SCALE);
        }
        shape.closePath();
        return shape;
      }

      // --- Helpers ---
      function add2DPolygon(group, coords, color, edgeColor, yFill, yEdge) {
        const shape = makeShape(coords);
        const shapeGeo = new THREE.ShapeGeometry(shape);
        shapeGeo.rotateX(-Math.PI / 2);
        const fill = new THREE.Mesh(
          shapeGeo,
          new THREE.MeshStandardNodeMaterial({
            color, transparent: true,
            opacity: color === 0xffff00 ? 0.3 : 0.5,
            side: THREE.DoubleSide, metalness: 0.1, roughness: 0.7,
          })
        );
        fill.position.y = yFill;
        fill.receiveShadow = true;
        group.add(fill);

        const points = [];
        for (let i = 0; i < coords.length; i += 2) {
          points.push(new THREE.Vector3(
            (coords[i] - cx) * SCALE, yEdge, -(coords[i + 1] - cy) * SCALE
          ));
        }
        if (points.length > 0) points.push(points[0].clone());
        group.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: edgeColor })
        ));
      }

      function add3DPolygon(group, coords, height, yBase, color, opacity) {
        const shape = makeShape(coords);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: height * SCALE, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(
          geo,
          new THREE.MeshStandardNodeMaterial({
            color, transparent: true, opacity,
            side: THREE.DoubleSide, metalness: 0.1, roughness: 0.7,
          })
        );
        mesh.position.y = yBase * SCALE;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }

      // --- Build per-story groups for 2D and 3D ---
      const group2D = new THREE.Group();
      group2D.visible = false;
      scene.add(group2D);

      const group3D = new THREE.Group();
      group3D.visible = false;
      scene.add(group3D);

      const group3DFull = new THREE.Group();
      group3DFull.visible = true;
      group3D.add(group3DFull);

      const group3DHalf = new THREE.Group();
      group3DHalf.visible = false;
      group3D.add(group3DHalf);

      const storyGroups2D = {};
      const storyGroups3DFull = {};
      const storyGroups3DHalf = {};

      console.log("[WebGPU] buildingData stories:", stories.length, "spaces:", allSpaces.length);
      stories.forEach((story) => {
        const name = story.Name;
        const elev = story.Elevation;

        // Per-story 2D group
        const g2d = new THREE.Group();
        group2D.add(g2d);
        storyGroups2D[name] = g2d;

        // Per-story 3D groups (full & half)
        const g3dFull = new THREE.Group();
        group3DFull.add(g3dFull);
        storyGroups3DFull[name] = g3dFull;

        const g3dHalf = new THREE.Group();
        group3DHalf.add(g3dHalf);
        storyGroups3DHalf[name] = g3dHalf;

        // --- 2D (all flat at y=0 regardless of floor elevation) ---
        const yBase = 0;
        (story.Spaces || []).forEach((idx) => {
          const sp = allSpaces[idx]; if (!sp) return;
          sp.Polygons.forEach((p) => add2DPolygon(g2d, p.shape, 0xffff00, 0xffffff, yBase, yBase + 0.01));
        });
        (story.Walls || []).forEach((idx) => {
          const wall = allWalls[idx]; if (!wall) return;
          // Always use main wall polygons for 2D plan (not SubPolygons)
          wall.Polygons.forEach((p) => add2DPolygon(g2d, p.shape, 0x8899aa, 0xaabbcc, yBase + 0.005, yBase + 0.015));
        });
        (story.Staircases || []).forEach((idx) => {
          const stair = allStaircases[idx]; if (!stair) return;
          const pl = stair.Polyline;
          const pts = [];
          for (let i = 0; i < pl.length; i += 3) {
            pts.push(new THREE.Vector3((pl[i] - cx) * SCALE, yBase + 0.02, -(pl[i + 1] - cy) * SCALE));
          }
          g2d.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x44ff88 })
          ));
        });

        // --- 3D Full Wall ---
        (story.Spaces || []).forEach((idx) => {
          const sp = allSpaces[idx]; if (!sp) return;
          sp.Polygons.forEach((p) => add3DPolygon(g3dFull, p.shape, 5, elev + sp.GroundHeight, 0xffff00, 0.2));
        });
        (story.Columns || []).forEach((idx) => {
          const col = allColumns[idx]; if (!col) return;
          col.Polygons.forEach((p) => add3DPolygon(g3dFull, p.shape, col.Height, elev, 0x667788, 0.8));
        });
        (story.Walls || []).forEach((idx) => {
          const wall = allWalls[idx]; if (!wall) return;
          if (!wall.Doors && !wall.Windows) {
            wall.Polygons.forEach((p) => add3DPolygon(g3dFull, p.shape, wall.Height, elev, 0x8899aa, 0.6));
          } else {
            if (wall.SubPolygons) {
              wall.SubPolygons.forEach((p) => add3DPolygon(g3dFull, p.shape, wall.Height, elev, 0x8899aa, 0.6));
            }
            if (wall.Doors) {
              wall.Doors.forEach((dIdx) => {
                const door = allDoors[dIdx]; if (!door) return;
                const topOfDoor = door.Elevation + door.Height;
                const upperH = wall.Height - topOfDoor;
                door.Polygons.forEach((p) => {
                  add3DPolygon(g3dFull, p.shape, door.Height, elev + door.Elevation, 0xff6644, 0.4);
                  if (upperH > 0) add3DPolygon(g3dFull, p.shape, upperH, elev + topOfDoor, 0x8899aa, 0.6);
                });
              });
            }
            if (wall.Windows) {
              wall.Windows.forEach((wIdx) => {
                const win = allWindows[wIdx]; if (!win) return;
                const topOfWin = win.Elevation + win.Height;
                const upperH = wall.Height - topOfWin;
                const lowerH = win.Elevation;
                win.Polygons.forEach((p) => {
                  add3DPolygon(g3dFull, p.shape, win.Height, elev + win.Elevation, 0x44aaff, 0.35);
                  if (upperH > 0) add3DPolygon(g3dFull, p.shape, upperH, elev + topOfWin, 0x8899aa, 0.6);
                  if (lowerH > 0) add3DPolygon(g3dFull, p.shape, lowerH, elev, 0x8899aa, 0.6);
                });
              });
            }
          }
        });
        (story.Staircases || []).forEach((idx) => {
          const stair = allStaircases[idx]; if (!stair) return;
          const pl = stair.Polyline;
          const pts = [];
          for (let i = 0; i < pl.length; i += 3) {
            pts.push(new THREE.Vector3(
              (pl[i] - cx) * SCALE,
              (pl[i + 2] + elev) * SCALE,
              -(pl[i + 1] - cy) * SCALE
            ));
          }
          g3dFull.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x44ff88 })
          ));
        });

        // --- 3D Half Wall ---
        const halfH = story.Height / 2;
        (story.Spaces || []).forEach((idx) => {
          const sp = allSpaces[idx]; if (!sp) return;
          sp.Polygons.forEach((p) => add3DPolygon(g3dHalf, p.shape, 5, elev + sp.GroundHeight, 0xffff00, 0.2));
        });
        (story.Columns || []).forEach((idx) => {
          const col = allColumns[idx]; if (!col) return;
          col.Polygons.forEach((p) => add3DPolygon(g3dHalf, p.shape, Math.min(col.Height, halfH), elev, 0x667788, 0.8));
        });
        (story.Walls || []).forEach((idx) => {
          const wall = allWalls[idx]; if (!wall) return;
          const wHalf = wall.Height / 2;
          if (!wall.Doors && !wall.Windows) {
            wall.Polygons.forEach((p) => add3DPolygon(g3dHalf, p.shape, wHalf, elev, 0x8899aa, 0.6));
          } else {
            if (wall.SubPolygons) {
              wall.SubPolygons.forEach((p) => add3DPolygon(g3dHalf, p.shape, wHalf, elev, 0x8899aa, 0.6));
            }
            if (wall.Doors) {
              wall.Doors.forEach((dIdx) => {
                const door = allDoors[dIdx]; if (!door) return;
                // Door: render up to min(door.Height, wHalf), no upper wall
                const doorRenderH = Math.min(door.Height, wHalf - door.Elevation);
                door.Polygons.forEach((p) => {
                  if (doorRenderH > 0) {
                    add3DPolygon(g3dHalf, p.shape, doorRenderH, elev + door.Elevation, 0xff6644, 0.4);
                  }
                });
              });
            }
            if (wall.Windows) {
              wall.Windows.forEach((wIdx) => {
                const win = allWindows[wIdx]; if (!win) return;
                win.Polygons.forEach((p) => {
                  if (win.Elevation >= wHalf) {
                    // Window starts above half wall — just show wall at half height
                    add3DPolygon(g3dHalf, p.shape, wHalf, elev, 0x8899aa, 0.6);
                  } else {
                    // Lower wall below window
                    if (win.Elevation > 0) {
                      add3DPolygon(g3dHalf, p.shape, win.Elevation, elev, 0x8899aa, 0.6);
                    }
                    // Window portion visible within half wall
                    const visibleWinH = Math.min(win.Height, wHalf - win.Elevation);
                    if (visibleWinH > 0) {
                      add3DPolygon(g3dHalf, p.shape, visibleWinH, elev + win.Elevation, 0x44aaff, 0.35);
                    }
                  }
                });
              });
            }
          }
        });
        (story.Staircases || []).forEach((idx) => {
          const stair = allStaircases[idx]; if (!stair) return;
          const pl = stair.Polyline;
          const pts = [];
          for (let i = 0; i < pl.length; i += 3) {
            pts.push(new THREE.Vector3(
              (pl[i] - cx) * SCALE,
              (pl[i + 2] + elev) * SCALE,
              -(pl[i + 1] - cy) * SCALE
            ));
          }
          g3dHalf.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x44ff88 })
          ));
        });
      });

      // Set initial floor visibility (default: first story only)
      const defaultFloor = stories.length > 0 ? stories[0].Name : "All";
      Object.entries(storyGroups2D).forEach(([name, g]) => { g.visible = (name === defaultFloor); });
      Object.entries(storyGroups3DFull).forEach(([name, g]) => { g.visible = (name === defaultFloor); });
      Object.entries(storyGroups3DHalf).forEach(([name, g]) => { g.visible = (name === defaultFloor); });

      // --- Events ---
      const onToggle2D = (e) => {
        if (groupGazebo.visible) {
          if (gz.g2D) gz.g2D.visible = e.detail.active;
          if (gz.g3D && e.detail.active) gz.g3D.visible = false;
        } else {
          group2D.visible = e.detail.active;
          if (e.detail.active) {
            group3D.visible = false;
            // Show only first floor in 2D by default
            const firstFloor = Object.keys(storyGroups2D)[0];
            if (firstFloor) {
              Object.entries(storyGroups2D).forEach(([name, g]) => { g.visible = (name === firstFloor); });
            }
            // Top-down camera for 2D
            const ext = Math.max((maxX - minX), (maxY - minY)) * SCALE;
            controls.setLookAt(0, ext * 1.5, 0, 0, 0, 0, true);
          }
        }
      };
      const onToggle3D = (e) => {
        if (groupGazebo.visible) {
          if (gz.g3D) gz.g3D.visible = e.detail.active;
          if (gz.g2D && e.detail.active) gz.g2D.visible = false;
        } else {
          group3D.visible = e.detail.active;
          if (e.detail.active) {
            group2D.visible = false;
            const ext = Math.max((maxX - minX), (maxY - minY)) * SCALE;
            controls.setLookAt(ext * 1.2, ext * 1.2, ext * 1.2, 0, ext * 0.4, 0, true);
          }
        }
      };
      const onSelectFloor = (e) => {
        const floor = e.detail.floor;
        Object.entries(storyGroups2D).forEach(([name, g]) => { g.visible = (floor === "All" || floor === name); });
        Object.entries(storyGroups3DFull).forEach(([name, g]) => { g.visible = (floor === "All" || floor === name); });
        Object.entries(storyGroups3DHalf).forEach(([name, g]) => { g.visible = (floor === "All" || floor === name); });
        // Also apply to Gazebo groups
        Object.entries(gz.floorsFull).forEach(([name, g]) => { g.visible = (floor === "All" || floor === name); });
        Object.entries(gz.floorsHalf).forEach(([name, g]) => { g.visible = (floor === "All" || floor === name); });
        Object.entries(gz.floors2D).forEach(([name, g]) => { g.visible = (floor === "All" || floor === name); });
      };
      const onWallMode = (e) => {
        const isHalf = e.detail.mode === "Half Wall";
        group3DFull.visible = !isHalf;
        group3DHalf.visible = isHalf;
        // Also apply to Gazebo groups
        if (gz.gFull) gz.gFull.visible = !isHalf;
        if (gz.gHalf) gz.gHalf.visible = isHalf;
      };
      // --- Gazebo Sim Group ---
      const groupGazebo = new THREE.Group();
      groupGazebo.visible = false;
      scene.add(groupGazebo);
      const gazeboMeshes = {}; // name → THREE.Mesh

      // Gazebo sub-groups for view modes
      const gz = {
        g3D: null, gFull: null, gHalf: null, g2D: null,
        floorsFull: {}, floorsHalf: {}, floors2D: {},
        floorNames: [],
      };

      function parseGzFloor(name) {
        // "building/1F_wall_3" → "1F"
        const m = name.match(/\/(\w+?)_/);
        return m ? m[1] : null;
      }

      function parseGzType(name) {
        // "building/1F_wall_3" → "wall"
        const m = name.match(/\/\w+?_([\w_]+?)_\d+$/);
        if (!m) return "other";
        const t = m[1];
        if (t.startsWith("space")) return "space";
        if (t.startsWith("column")) return "column";
        if (t.startsWith("door")) return "door";
        if (t.startsWith("window")) return "window";
        if (t.startsWith("wall")) return "wall";
        return "other";
      }

      const GZ_COLORS = {
        space: { fill: 0xffff00, edge: 0xffffff, opacity: 0.3 },
        wall: { fill: 0x8899aa, edge: 0xaabbcc, opacity: 0.5 },
        door: { fill: 0xff6644, edge: 0xff8866, opacity: 0.4 },
        window: { fill: 0x44aaff, edge: 0x66ccff, opacity: 0.4 },
        column: { fill: 0x667788, edge: 0x8899aa, opacity: 0.6 },
        other: { fill: 0x999999, edge: 0xbbbbbb, opacity: 0.5 },
      };

      function createGzMesh(info, heightOverride) {
        const color = new THREE.Color(
          info.color?.[0] ?? 0.5,
          info.color?.[1] ?? 0.5,
          info.color?.[2] ?? 0.5
        );
        const isDoor = info.name?.includes("door");
        const mat = new THREE.MeshStandardNodeMaterial({
          color,
          metalness: 0.2,
          roughness: 0.6,
          transparent: (info.color?.[3] ?? 1) < 1 || isDoor,
          opacity: info.color?.[3] ?? 1,
          side: THREE.DoubleSide,
        });

        const h = heightOverride ?? info.height;
        let geo;
        if (info.shape === "polyline" && info.points?.length >= 3) {
          const shape = new THREE.Shape();
          shape.moveTo(info.points[0][0], info.points[0][1]);
          for (let i = 1; i < info.points.length; i++) {
            shape.lineTo(info.points[i][0], info.points[i][1]);
          }
          shape.closePath();
          geo = new THREE.ExtrudeGeometry(shape, {
            depth: h || 1,
            bevelEnabled: false,
          });
          geo.rotateX(-Math.PI / 2);
        } else if (info.shape === "sphere") {
          geo = new THREE.SphereGeometry(info.radius || 0.5, 24, 16);
        } else if (info.shape === "cylinder") {
          geo = new THREE.CylinderGeometry(info.radius || 0.5, info.radius || 0.5, info.length || 1, 24);
        } else {
          const s = info.size || [1, 1, 1];
          geo = new THREE.BoxGeometry(s[0], s[2] || s[1], s[1]);
        }

        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = info.name;

        if (info.pose) {
          mesh.position.set(info.pose[0] || 0, info.pose[2] || 0, -(info.pose[1] || 0));
        }
        return mesh;
      }

      function createGz2DShape(info, yBase) {
        if (info.shape !== "polyline" || !info.points?.length) return null;
        const type = parseGzType(info.name);
        const c = GZ_COLORS[type] || GZ_COLORS.other;

        const group = new THREE.Group();

        // Fill shape
        const shape = new THREE.Shape();
        shape.moveTo(info.points[0][0], info.points[0][1]);
        for (let i = 1; i < info.points.length; i++) {
          shape.lineTo(info.points[i][0], info.points[i][1]);
        }
        shape.closePath();
        const shapeGeo = new THREE.ShapeGeometry(shape);
        shapeGeo.rotateX(-Math.PI / 2);
        const fill = new THREE.Mesh(
          shapeGeo,
          new THREE.MeshStandardNodeMaterial({
            color: c.fill, transparent: true, opacity: c.opacity,
            side: THREE.DoubleSide, metalness: 0.1, roughness: 0.7,
          })
        );
        fill.position.y = yBase;
        fill.receiveShadow = true;
        group.add(fill);

        // Edge outline
        const pts = info.points.map((p) => new THREE.Vector3(p[0], yBase + 0.01, -p[1]));
        if (pts.length > 0) pts.push(pts[0].clone());
        group.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: c.edge })
        ));

        return group;
      }

      const onGazeboScene = (e) => {
        const data = e.detail;
        console.log("[Gazebo] onGazeboScene triggered, models:", data.models?.length, data.models?.map(m => m.name));
        // Hide other groups, show gazebo
        group2D.visible = false;
        group3D.visible = false;
        groupGazebo.visible = true;
        console.log("[Gazebo] group3D.visible:", group3D.visible, "groupGazebo.visible:", groupGazebo.visible);

        // Clear existing gazebo children
        while (groupGazebo.children.length > 0) {
          const child = groupGazebo.children[0];
          groupGazebo.remove(child);
          child.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
          });
        }
        Object.keys(gazeboMeshes).forEach((k) => delete gazeboMeshes[k]);

        const models = data.models || [];

        // Discover floors and their elevations
        const floorElevations = {};
        models.forEach((info) => {
          const floor = parseGzFloor(info.name);
          if (!floor) return;
          const elev = info.pose?.[2] || 0;
          if (!(floor in floorElevations) || elev < floorElevations[floor]) {
            floorElevations[floor] = elev;
          }
        });
        gz.floorNames = Object.keys(floorElevations).sort();

        // Create sub-groups: 3D (full + half) and 2D
        const g3D = new THREE.Group();
        g3D.visible = true;
        groupGazebo.add(g3D);
        gz.g3D = g3D;

        const gFull = new THREE.Group();
        gFull.visible = true;
        g3D.add(gFull);
        gz.gFull = gFull;

        const gHalf = new THREE.Group();
        gHalf.visible = false;
        g3D.add(gHalf);
        gz.gHalf = gHalf;

        const g2D = new THREE.Group();
        g2D.visible = false;
        groupGazebo.add(g2D);
        gz.g2D = g2D;

        gz.floorsFull = {};
        gz.floorsHalf = {};
        gz.floors2D = {};

        gz.floorNames.forEach((floorName) => {
          const ff = new THREE.Group();
          gFull.add(ff);
          gz.floorsFull[floorName] = ff;

          const fh = new THREE.Group();
          gHalf.add(fh);
          gz.floorsHalf[floorName] = fh;

          const f2d = new THREE.Group();
          g2D.add(f2d);
          gz.floors2D[floorName] = f2d;
        });

        // Determine max wall height per floor (for half-wall calculation)
        const floorWallH = {};
        models.forEach((info) => {
          const floor = parseGzFloor(info.name);
          const type = parseGzType(info.name);
          if (floor && type === "wall" && info.height) {
            floorWallH[floor] = Math.max(floorWallH[floor] || 0, info.height);
          }
        });

        // Create models in each sub-group
        models.forEach((info) => {
          const floor = parseGzFloor(info.name);
          const type = parseGzType(info.name);

          // --- Full 3D ---
          const meshFull = createGzMesh(info);
          if (floor && gz.floorsFull[floor]) {
            gz.floorsFull[floor].add(meshFull);
          } else {
            gFull.add(meshFull);
          }
          gazeboMeshes[info.name] = meshFull;

          // --- Half 3D ---
          if (info.shape === "polyline" && info.points?.length >= 3) {
            const wallH = floorWallH[floor] || 3.0;
            const halfH = wallH / 2;
            const elev = info.pose?.[2] || 0;
            const baseElev = floorElevations[floor] || 0;
            const relElev = elev - baseElev; // height relative to floor

            let halfInfo = null;
            if (type === "space") {
              halfInfo = { ...info };
            } else if (type === "column") {
              halfInfo = { ...info, height: Math.min(info.height, halfH) };
            } else if (type === "wall") {
              if (info.name.includes("wall_above")) {
                halfInfo = null; // skip upper walls in half mode
              } else if (info.name.includes("wall_below")) {
                halfInfo = relElev + info.height <= halfH ? { ...info } : null;
              } else {
                halfInfo = { ...info, height: Math.min(info.height, halfH - relElev) };
                if (halfInfo.height <= 0) halfInfo = null;
              }
            } else if (type === "door") {
              const doorH = Math.min(info.height, halfH - relElev);
              halfInfo = doorH > 0 ? { ...info, height: doorH } : null;
            } else if (type === "window") {
              if (relElev >= halfH) {
                halfInfo = null; // window above half wall - skip
              } else {
                const visH = Math.min(info.height, halfH - relElev);
                halfInfo = visH > 0 ? { ...info, height: visH } : null;
              }
            } else {
              halfInfo = { ...info };
            }

            if (halfInfo) {
              const meshHalf = createGzMesh(halfInfo);
              if (floor && gz.floorsHalf[floor]) {
                gz.floorsHalf[floor].add(meshHalf);
              } else {
                gHalf.add(meshHalf);
              }
            }
          } else {
            // Non-polyline: same in both modes
            const meshHalf = createGzMesh(info);
            if (floor && gz.floorsHalf[floor]) {
              gz.floorsHalf[floor].add(meshHalf);
            } else {
              gHalf.add(meshHalf);
            }
          }

          // --- 2D ---
          if (info.shape === "polyline" && info.points?.length >= 3) {
            // Skip wall_above elements in 2D plan view
            if (info.name?.includes("wall_above")) return;
            // All 2D elements flat at y=0
            const shape2d = createGz2DShape(info, 0);
            if (shape2d) {
              if (floor && gz.floors2D[floor]) {
                gz.floors2D[floor].add(shape2d);
              } else {
                g2D.add(shape2d);
              }
            }
          }
        });

        // Default: show first floor only
        const defaultFloor = gz.floorNames[0] || "All";
        gz.floorNames.forEach((name) => {
          const show = name === defaultFloor;
          if (gz.floorsFull[name]) gz.floorsFull[name].visible = show;
          if (gz.floorsHalf[name]) gz.floorsHalf[name].visible = show;
          if (gz.floors2D[name]) gz.floors2D[name].visible = show;
        });

        // Notify TopBar about available floors
        window.dispatchEvent(new CustomEvent("gazebo-floors", {
          detail: { floors: gz.floorNames },
        }));

        // Set camera for Gazebo scene
        camera.far = 500;
        camera.updateProjectionMatrix();
        controls.setLookAt(8, 8, 8, 0, 0, 0, true);
        console.log("[Gazebo] Scene built. groupGazebo children:", groupGazebo.children.length, "gazeboMeshes:", Object.keys(gazeboMeshes));
        // Update minimap data after scene is built
        setTimeout(updateMinimapData, 500);
      };

      const onGazeboPoses = (e) => {
        const data = e.detail;
        if (!data.models || (!groupGazebo.visible && !robotFPV)) return;

        if (!onGazeboPoses._logged) {
          console.log("[Gazebo] onGazeboPoses first call, models:", data.models.map(m => m.name), "gazeboMeshes:", Object.keys(gazeboMeshes));
          onGazeboPoses._logged = true;
        }
        if (robotFPV && robotFPVName && !onGazeboPoses._fpvDebug2) {
          const found = data.models.find(m => m.name === robotFPVName);
          const hasMesh = !!gazeboMeshes[robotFPVName];
          console.log("[Gazebo] FPV debug: looking for", robotFPVName, "found in poses:", !!found, "has mesh:", hasMesh, "all names:", data.models.map(m=>m.name));
          onGazeboPoses._fpvDebug2 = true;
        }

        data.models.forEach((m) => {
          // Skip sub-links named "link"
          if (m.name === "link") return;

          let mesh = gazeboMeshes[m.name];

          // Dynamically create mesh for newly spawned objects
          if (!mesh) {
            let geom, color;
            const n = m.name;

            // Robot model (parent) - build from basic shapes (lightweight)
            if (n.includes("robot") && !n.includes("::")) {
              const group = new THREE.Group();
              group.name = n;
              const p = m.position;
              if (p) group.position.set(p.x || 0, p.z || 0, -(p.y || 0));
              const o = m.orientation;
              if (o) group.quaternion.set(o.x || 0, o.z || 0, -(o.y || 0), o.w || 1);

              const bodyMat = new THREE.MeshStandardNodeMaterial({ color: 0x2299dd, metalness: 0.4, roughness: 0.5 });
              const darkMat = new THREE.MeshStandardNodeMaterial({ color: 0x222222, metalness: 0.3, roughness: 0.7 });
              const accentMat = new THREE.MeshStandardNodeMaterial({ color: 0xff4400, metalness: 0.3, roughness: 0.5 });
              const sensorMat = new THREE.MeshStandardNodeMaterial({ color: 0x44ff88, metalness: 0.5, roughness: 0.3 });

              // Chassis body
              const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.3), bodyMat);
              chassis.position.y = 0.06;
              chassis.castShadow = true;
              group.add(chassis);

              // Top deck
              const deck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.24), bodyMat);
              deck.position.y = 0.14;
              group.add(deck);

              // Front bumper (orange accent)
              const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.28), accentMat);
              bumper.position.set(0.2, 0.04, 0);
              group.add(bumper);

              // Sensor tower
              const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), darkMat);
              tower.position.set(0.05, 0.21, 0);
              group.add(tower);

              // Sensor head (green sphere)
              const sensorHead = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), sensorMat);
              sensorHead.position.set(0.05, 0.28, 0);
              group.add(sensorHead);

              // Wheels (4x)
              const wheelGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12);
              const wheelPositions = [
                [0.12, -0.02, 0.17],   // front-left
                [0.12, -0.02, -0.17],  // front-right
                [-0.12, -0.02, 0.17],  // rear-left
                [-0.12, -0.02, -0.17], // rear-right
              ];
              wheelPositions.forEach(([wx, wy, wz]) => {
                const wheel = new THREE.Mesh(wheelGeo, darkMat);
                wheel.position.set(wx, wy, wz);
                wheel.rotation.x = Math.PI / 2;
                wheel.castShadow = true;
                group.add(wheel);
              });

              // Axles
              const axleGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.34, 6);
              const frontAxle = new THREE.Mesh(axleGeo, darkMat);
              frontAxle.position.set(0.12, -0.02, 0);
              frontAxle.rotation.x = Math.PI / 2;
              group.add(frontAxle);
              const rearAxle = new THREE.Mesh(axleGeo, darkMat);
              rearAxle.position.set(-0.12, -0.02, 0);
              rearAxle.rotation.x = Math.PI / 2;
              group.add(rearAxle);

              if (gz.g3D) gz.g3D.add(group); else groupGazebo.add(group);
              gazeboMeshes[n] = group;
              console.log("[Gazebo] Robot model created:", n);
              return; // skip default mesh creation
            // Robot sub-links - skip (parent model has the real pose)
            } else if (["chassis","left_wheel","right_wheel","caster","front_marker"].includes(n)) {
              return;
            // Spawn primitives
            } else if (n.startsWith("sphere")) {
              geom = new THREE.SphereGeometry(0.5, 16, 16);
              color = new THREE.Color(0xff6600);
            } else if (n.startsWith("cyl")) {
              geom = new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16);
              color = new THREE.Color(0x00cc88);
            } else if (n.startsWith("box")) {
              geom = new THREE.BoxGeometry(1, 1, 1);
              color = new THREE.Color(0x3388ff);
            } else {
              // Skip unknown sub-links to avoid phantom objects
              return;
            }
            const mat = new THREE.MeshStandardNodeMaterial({
              color, metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide,
            });
            mesh = new THREE.Mesh(geom, mat);
            mesh.name = n;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (gz.g3D) {
              gz.g3D.add(mesh);
            } else {
              groupGazebo.add(mesh);
            }
            gazeboMeshes[n] = mesh;
            console.log("[Gazebo] Spawned mesh:", n);
          }

          const p = m.position;
          if (p) mesh.position.set(p.x || 0, p.z || 0, -(p.y || 0));

          const o = m.orientation;
          if (o) {
            mesh.quaternion.set(o.x || 0, o.z || 0, -(o.y || 0), o.w || 1);
          }

          // Record robot path
          if (pathRecordingActive && m.name.includes("robot") && robotPaths[m.name]?.recording) {
            const pts = robotPaths[m.name].points;
            const pos3 = mesh.position;
            // Only record if moved enough (>0.05m)
            const last = pts[pts.length - 1];
            if (!last || Math.hypot(pos3.x - last.x, pos3.z - last.z) > 0.05) {
              const q = mesh.quaternion;
              pts.push({ x: pos3.x, y: pos3.y, z: pos3.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, t: Date.now() });
              // Update trail line
              if (pts.length >= 2) {
                const linePoints = pts.map(p => new THREE.Vector3(p.x, p.y + 0.05, p.z));
                const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
                if (robotPaths[m.name].line) {
                  robotPaths[m.name].line.geometry.dispose();
                  robotPaths[m.name].line.geometry = lineGeo;
                } else {
                  const lineMat = new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 2 });
                  robotPaths[m.name].line = new THREE.Line(lineGeo, lineMat);
                  if (gz.g3D) gz.g3D.add(robotPaths[m.name].line);
                  else groupGazebo.add(robotPaths[m.name].line);
                }
              }
            }
          }

          // FPV camera tracking moved to render loop for smooth updates
        });
      };

      // --- Click-to-Place Robot (2-click: position + direction) ---
      let clickPlaceEnabled = false;
      let clickPlaceStep = 0; // 0=idle, 1=waiting position, 2=waiting direction
      let clickPlacePos = null; // Three.js hit point
      let clickPlaceMarker = null;
      let clickPlaceArrow = null;

      function cleanupClickPlace() {
        if (clickPlaceMarker) { scene.remove(clickPlaceMarker); clickPlaceMarker = null; }
        if (clickPlaceArrow) { scene.remove(clickPlaceArrow); clickPlaceArrow = null; }
      }

      const onClickPlaceToggle = (e) => {
        clickPlaceEnabled = e.detail.enabled;
        clickPlaceStep = clickPlaceEnabled ? 1 : 0;
        clickPlacePos = null;
        cleanupClickPlace();
        renderer.domElement.style.cursor = clickPlaceEnabled ? "crosshair" : "";
      };

      renderer.domElement.addEventListener("click", (e) => {
        if (!clickPlaceEnabled) return;

        if (clickPlaceStep === 1) {
          // Step 1: Set position — use ground plane (avoids hitting robot meshes)
          const rect = renderer.domElement.getBoundingClientRect();
          const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
          );
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(mouse, camera);
          const hit = new THREE.Vector3();
          const gp = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          if (!raycaster.ray.intersectPlane(gp, hit)) return;
          clickPlacePos = hit;

          // Show position marker (green ring)
          cleanupClickPlace();
          const markerGeo = new THREE.RingGeometry(0.15, 0.2, 16);
          markerGeo.rotateX(-Math.PI / 2);
          clickPlaceMarker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide }));
          clickPlaceMarker.position.copy(hit);
          clickPlaceMarker.position.y += 0.02;
          scene.add(clickPlaceMarker);

          clickPlaceStep = 2;
          console.log("[Gazebo] Click place position:", hit.x.toFixed(2), hit.z.toFixed(2));

        } else if (clickPlaceStep === 2) {
          // Step 2: Set direction — use ground plane (fast, consistent)
          const rect = renderer.domElement.getBoundingClientRect();
          const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
          );
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(mouse, camera);
          const dirTarget = new THREE.Vector3();
          groundPlane.constant = -(clickPlacePos.y || 0);
          if (!raycaster.ray.intersectPlane(groundPlane, dirTarget)) return;

          // Direction in Three.js: from clickPlacePos to dirTarget on XZ plane
          const dx = dirTarget.x - clickPlacePos.x;
          const dz = dirTarget.z - clickPlacePos.z;
          // Gazebo coords: gx=three.x, gy=-three.z
          // Gazebo yaw = atan2(gdy, gdx) = atan2(-dz, dx)
          const yaw = Math.atan2(-dz, dx);

          const gx = clickPlacePos.x;
          const gy = -clickPlacePos.z;

          console.log("[Gazebo] Click place at:", gx.toFixed(2), gy.toFixed(2), "yaw:", (yaw * 180 / Math.PI).toFixed(1), "deg");

          // Dispatch with position + yaw (keep markers until robot appears)
          window.dispatchEvent(new CustomEvent("robot-placed", {
            detail: { x: gx, y: gy, z: clickPlacePos.y, yaw },
          }));

          // Keep markers visible, cleanup after robot loads
          clickPlaceEnabled = false;
          clickPlaceStep = 0;
          renderer.domElement.style.cursor = "";
          // Remove markers after delay (robot takes time to spawn)
          setTimeout(cleanupClickPlace, 8000);
        }
      });

      // Show direction preview on mouse move during step 2
      // Use ground plane intersection (fast, no full raycast)
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(clickPlacePos?.y || 0));
      renderer.domElement.addEventListener("mousemove", (e) => {
        if (!clickPlaceEnabled || clickPlaceStep !== 2 || !clickPlacePos) return;

        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const target = new THREE.Vector3();
        groundPlane.constant = -(clickPlacePos.y || 0);
        const hit = raycaster.ray.intersectPlane(groundPlane, target);
        if (!hit) return;

        // Update arrow line (reuse geometry for speed)
        const baseY = clickPlacePos.y + 0.05;
        if (clickPlaceArrow) {
          const positions = clickPlaceArrow.geometry.attributes.position;
          positions.setXYZ(1, target.x, baseY, target.z);
          positions.needsUpdate = true;
        } else {
          const from = new THREE.Vector3(clickPlacePos.x, baseY, clickPlacePos.z);
          const to = new THREE.Vector3(target.x, baseY, target.z);
          const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
          clickPlaceArrow = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x00ff88 }));
          scene.add(clickPlaceArrow);
        }
      });

      // ESC to cancel
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && clickPlaceEnabled) {
          clickPlaceEnabled = false;
          clickPlaceStep = 0;
          renderer.domElement.style.cursor = "";
          cleanupClickPlace();
          window.dispatchEvent(new CustomEvent("robot-click-place", { detail: { enabled: false } }));
        }
      });

      // --- Robot Path Recording ---
      const robotPaths = {}; // robotName → { recording, points: [{x,y,z,t}], line: THREE.Line }
      let pathRecordingActive = false;

      const onRobotPathControl = (e) => {
        const { action, robotName } = e.detail;
        if (action === "startRecord") {
          pathRecordingActive = true;
          if (!robotPaths[robotName]) {
            robotPaths[robotName] = { recording: true, points: [], line: null };
          } else {
            robotPaths[robotName].recording = true;
            robotPaths[robotName].points = [];
            // Remove old line
            if (robotPaths[robotName].line) {
              const parent = robotPaths[robotName].line.parent;
              if (parent) parent.remove(robotPaths[robotName].line);
              robotPaths[robotName].line.geometry?.dispose();
              robotPaths[robotName].line.material?.dispose();
              robotPaths[robotName].line = null;
            }
          }
          console.log("[Gazebo] Path recording started for:", robotName);
        } else if (action === "stopRecord") {
          if (robotPaths[robotName]) {
            robotPaths[robotName].recording = false;
          }
          pathRecordingActive = false;
          console.log("[Gazebo] Path recording stopped for:", robotName, "points:", robotPaths[robotName]?.points.length);
        } else if (action === "clearPath") {
          if (robotPaths[robotName]) {
            if (robotPaths[robotName].line) {
              const parent = robotPaths[robotName].line.parent;
              if (parent) parent.remove(robotPaths[robotName].line);
              robotPaths[robotName].line.geometry?.dispose();
              robotPaths[robotName].line.material?.dispose();
            }
            delete robotPaths[robotName];
          }
        } else if (action === "replay") {
          const path = robotPaths[robotName];
          if (!path || path.points.length < 2) return;
          // Send replay event back with path data
          window.dispatchEvent(new CustomEvent("robot-path-replay", {
            detail: { robotName, points: path.points },
          }));
        }
      };

      // --- Robot First-Person View ---
      let robotFPV = false;
      let robotFPVName = null;
      const savedCamState = { position: null, target: null };

      const onRobotFPV = (e) => {
        const { enabled, robotName } = e.detail;
        robotFPV = enabled;
        robotFPVName = robotName || null;

        if (enabled) {
          // Save current camera state
          const camPos = camera.position.clone();
          const target = new THREE.Vector3();
          controls.getTarget(target);
          savedCamState.position = camPos;
          savedCamState.target = target;
          // Disable orbit controls
          controls.enabled = false;
          console.log("[Gazebo] FPV enabled for:", robotName);
        } else {
          // Restore camera
          controls.enabled = true;
          if (savedCamState.position) {
            controls.setLookAt(
              savedCamState.position.x, savedCamState.position.y, savedCamState.position.z,
              savedCamState.target.x, savedCamState.target.y, savedCamState.target.z,
              true
            );
          }
          console.log("[Gazebo] FPV disabled");
        }
      };

      // --- Gazebo Visualization Controls ---
      const gridHelper = scene.children.find((c) => c.isGridHelper || c.type === "GridHelper");

      const onGazeboViz = (e) => {
        const { type, value } = e.detail;
        console.log("[Gazebo] viz event:", type, value);

        if (type === "wireframe") {
          let count = 0;
          groupGazebo.traverse((obj) => {
            if (obj.isMesh && obj.material) {
              obj.material.wireframe = value;
              obj.material.needsUpdate = true;
              count++;
            }
          });
          console.log("[Gazebo] wireframe applied to", count, "meshes");
        } else if (type === "transparent") {
          groupGazebo.traverse((obj) => {
            if (obj.isMesh && obj.material) {
              obj.material.transparent = true;
              obj.material.opacity = value ? 0.3 : (obj.material._origOpacity ?? 1);
              if (!value && obj.material._origOpacity !== undefined) {
                obj.material.opacity = obj.material._origOpacity;
              } else if (value) {
                if (obj.material._origOpacity === undefined) obj.material._origOpacity = obj.material.opacity;
                obj.material.opacity = 0.3;
              }
            }
          });
        } else if (type === "grid") {
          if (gridHelper) gridHelper.visible = value;
        } else if (type === "collisions") {
          // Toggle collision wireframe overlay
          groupGazebo.traverse((obj) => {
            if (obj.isMesh && obj.name?.includes("collision")) {
              obj.visible = value;
            }
          });
        } else if (type === "toggle-element") {
          const { element, visible } = e.detail;
          Object.entries(gazeboMeshes).forEach(([name, mesh]) => {
            // For doors: only toggle actual door meshes, not wall_above_door
            if (element === "door") {
              if (name.includes("_door") && !name.includes("_wall_above_door")) {
                mesh.visible = visible;
              }
            } else if (element === "window") {
              if (name.includes("_window") && !name.includes("_wall_above_window") && !name.includes("_wall_below_window")) {
                mesh.visible = visible;
              }
            } else if (name.includes(`_${element}`) || name.includes(`_${element}_`)) {
              mesh.visible = visible;
            }
          });
        } else if (type === "element-color") {
          const { element, color } = e.detail;
          const threeColor = new THREE.Color(color);
          Object.entries(gazeboMeshes).forEach(([name, mesh]) => {
            let match = false;
            if (element === "wall_column") {
              match = name.includes("_wall") || name.includes("_column");
            } else {
              match = name.includes(`_${element}`) || name.includes(`_${element}_`);
            }
            if (match) {
              mesh.traverse((obj) => {
                if (obj.isMesh && obj.material) {
                  obj.material.color.copy(threeColor);
                  obj.material.needsUpdate = true;
                }
              });
            }
          });
        } else if (type === "building-opacity") {
          // Apply opacity to building meshes only (skip robots)
          Object.entries(gazeboMeshes).forEach(([name, mesh]) => {
            if (name.includes("robot") || name.includes("simple_robot")) return;
            mesh.traverse((obj) => {
              if (obj.isMesh && obj.material) {
                obj.material.transparent = true;
                obj.material.opacity = value;
                obj.material.needsUpdate = true;
              }
            });
          });
        } else if (type === "bg-color") {
          const { color } = e.detail;
          scene.background = new THREE.Color(color);
          // Update ground plane color to match
          scene.children.forEach((child) => {
            if (child.isMesh && child.geometry?.type === "PlaneGeometry" && child.rotation.x === -Math.PI / 2) {
              child.material.color.set(color);
              child.material.needsUpdate = true;
            }
          });
        } else if (type === "grid-color") {
          const { color } = e.detail;
          const gridHelper = scene.children.find((c) => c.isGridHelper || c.type === "GridHelper");
          if (gridHelper) {
            // GridHelper has array of materials [centerLine, grid]
            if (Array.isArray(gridHelper.material)) {
              gridHelper.material.forEach(m => { m.color.set(color); m.needsUpdate = true; });
            } else if (gridHelper.material) {
              gridHelper.material.color.set(color);
              gridHelper.material.needsUpdate = true;
            }
          }
        } else if (type === "grid-spacing") {
          const spacing = e.detail.value;
          const oldGrid = scene.children.find((c) => c.isGridHelper || c.type === "GridHelper");
          if (oldGrid) {
            const visible = oldGrid.visible;
            // Preserve current color
            let gridColor = 0x1a2a3a;
            if (Array.isArray(oldGrid.material) && oldGrid.material[1]) {
              gridColor = oldGrid.material[1].color.getHex();
            }
            scene.remove(oldGrid);
            const size = 80;
            const divisions = Math.round(size / spacing);
            const newGrid = new THREE.GridHelper(size, divisions, gridColor, gridColor);
            newGrid.visible = visible;
            scene.add(newGrid);
          }
        } else if (type === "axis-color") {
          const { color } = e.detail;
          const axes = scene.children.find((c) => c.isAxesHelper || c.type === "AxesHelper");
          if (axes) {
            const c = new THREE.Color(color);
            // Set all three axes to same color
            const colors = axes.geometry.attributes.color;
            for (let i = 0; i < colors.count; i++) {
              colors.setXYZ(i, c.r, c.g, c.b);
            }
            colors.needsUpdate = true;
          }
        } else if (type === "shadow") {
          renderer.shadowMap.enabled = value;
          scene.traverse((obj) => {
            if (obj.isMesh) {
              obj.castShadow = value;
              obj.receiveShadow = value;
            }
          });
          renderer.shadowMap.needsUpdate = true;
        } else if (type === "resetCamera") {
          controls.setLookAt(8, 8, 8, 0, 0, 0, true);
        } else if (type === "topView") {
          controls.setLookAt(0, 15, 0, 0, 0, 0, true);
        } else if (type === "frontView") {
          controls.setLookAt(0, 3, 12, 0, 3, 0, true);
        }
      };

      const onGazeboSpawn = (e) => {
        const p = e.detail;
        console.log("[Gazebo] Spawn event:", p.name, p.shape);

        // Ensure gazebo group is visible
        groupGazebo.visible = true;

        let geom;
        const color = new THREE.Color(p.r ?? 0.5, p.g ?? 0.5, p.b ?? 0.5);
        if (p.shape === "sphere") {
          geom = new THREE.SphereGeometry(0.5, 16, 16);
        } else if (p.shape === "cylinder") {
          geom = new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16);
        } else {
          geom = new THREE.BoxGeometry(
            p.name?.includes("robot") ? 0.4 : 1,
            p.name?.includes("robot") ? 0.15 : 1,
            p.name?.includes("robot") ? 0.3 : 1,
          );
        }
        const mat = new THREE.MeshStandardNodeMaterial({
          color, metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.name = p.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Gazebo ENU → Three.js: x=x, y=z, z=-y
        mesh.position.set(p.x || 0, p.z || 0, -(p.y || 0));
        if (gz.g3D) {
          gz.g3D.add(mesh);
        } else {
          groupGazebo.add(mesh);
        }
        gazeboMeshes[p.name] = mesh;
      };

      // Track robot model preferences
      const robotModelMap = {}; // namePattern → model name
      const onGazeboRobotModel = (e) => {
        const { namePattern, model } = e.detail;
        robotModelMap[namePattern] = model;
        console.log("[Gazebo] Robot model set:", namePattern, "→", model);
      };

      const onGazeboScreenshot = () => {
        renderer.render(scene, camera);
        const dataURL = renderer.domElement.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = dataURL;
        a.download = `gazebo_screenshot_${Date.now()}.png`;
        a.click();
      };

      window.addEventListener("toggle-2d", onToggle2D);
      window.addEventListener("toggle-3d", onToggle3D);
      window.addEventListener("select-floor", onSelectFloor);
      window.addEventListener("wall-mode", onWallMode);
      window.addEventListener("gazebo-scene", onGazeboScene);
      window.addEventListener("gazebo-poses", onGazeboPoses);
      window.addEventListener("gazebo-spawn", onGazeboSpawn);
      window.addEventListener("robot-fpv", onRobotFPV);
      window.addEventListener("gazebo-robot-model", onGazeboRobotModel);
      window.addEventListener("gazebo-viz", onGazeboViz);
      window.addEventListener("gazebo-screenshot", onGazeboScreenshot);
      window.addEventListener("robot-path-control", onRobotPathControl);
      window.addEventListener("robot-click-place", onClickPlaceToggle);
      window.addEventListener("gazebo-minimap", (e) => setMinimapVisible(e.detail.visible));

      // ── Minimap ──
      const minimapData = { walls: [], spaces: [], bounds: { minX: -4, maxX: 4, minY: -2, maxY: 2 } };

      function updateMinimapData() {
        // Extract wall and space polygons from the gazebo scene for 2D minimap
        minimapData.walls = [];
        minimapData.spaces = [];
        Object.entries(gazeboMeshes).forEach(([name, mesh]) => {
          if (!name.includes("building/")) return;
          const isWall = name.includes("wall") && !name.includes("above");
          const isSpace = name.includes("space");
          const isDoor = name.includes("door");
          const isWindow = name.includes("window");
          if (!isWall && !isSpace && !isDoor && !isWindow) return;

          // Get polyline points from the mesh geometry
          mesh.traverse((child) => {
            if (!child.isMesh || !child.geometry) return;
            const pos = child.geometry.attributes?.position;
            if (!pos) return;
            // Extract unique XZ points (top face)
            const points = [];
            const seen = new Set();
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i);
              const z = pos.getZ(i);
              const key = `${x.toFixed(3)},${z.toFixed(3)}`;
              if (!seen.has(key)) { seen.add(key); points.push([x, z]); }
            }
            if (points.length >= 3) {
              const worldPos = child.getWorldPosition(new THREE.Vector3());
              const entry = {
                points: points.map(([px, pz]) => [px + worldPos.x, pz + worldPos.z]),
                type: isWall ? "wall" : isDoor ? "door" : isWindow ? "window" : "space",
              };
              if (isSpace) minimapData.spaces.push(entry);
              else minimapData.walls.push(entry);
            }
          });
        });

        // Compute bounds
        let bMinX = Infinity, bMaxX = -Infinity, bMinZ = Infinity, bMaxZ = -Infinity;
        [...minimapData.walls, ...minimapData.spaces].forEach((entry) => {
          entry.points.forEach(([x, z]) => {
            bMinX = Math.min(bMinX, x); bMaxX = Math.max(bMaxX, x);
            bMinZ = Math.min(bMinZ, z); bMaxZ = Math.max(bMaxZ, z);
          });
        });
        if (isFinite(bMinX)) {
          const pad = 0.5;
          minimapData.bounds = { minX: bMinX - pad, maxX: bMaxX + pad, minY: bMinZ - pad, maxY: bMaxZ + pad };
        }
      }

      function drawMinimap() {
        const canvas = minimapRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const W = canvas.width;
        const H = canvas.height;
        const { minX, maxX, minY, maxY } = minimapData.bounds;
        const scaleX = W / (maxX - minX);
        const scaleY = H / (maxY - minY);
        const sc = Math.min(scaleX, scaleY) * 0.9;
        const offX = W / 2;
        const offY = H / 2;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const toScreen = (x, z) => [
          offX + (x - cx) * sc,
          offY + (z - cy) * sc,
        ];

        ctx.clearRect(0, 0, W, H);

        // Background
        ctx.fillStyle = "rgba(255, 245, 157, 0.9)";
        ctx.fillRect(0, 0, W, H);

        // Draw spaces
        minimapData.spaces.forEach((s) => {
          ctx.beginPath();
          const [sx, sy] = toScreen(s.points[0][0], s.points[0][1]);
          ctx.moveTo(sx, sy);
          s.points.forEach(([x, z], i) => { if (i > 0) { const [px, py] = toScreen(x, z); ctx.lineTo(px, py); } });
          ctx.closePath();
          ctx.fillStyle = "rgba(204, 204, 170, 0.15)";
          ctx.fill();
        });

        // Draw walls
        minimapData.walls.forEach((w) => {
          ctx.beginPath();
          const [sx, sy] = toScreen(w.points[0][0], w.points[0][1]);
          ctx.moveTo(sx, sy);
          w.points.forEach(([x, z], i) => { if (i > 0) { const [px, py] = toScreen(x, z); ctx.lineTo(px, py); } });
          ctx.closePath();
          if (w.type === "door") {
            ctx.fillStyle = "rgba(255, 102, 68, 0.4)";
            ctx.strokeStyle = "rgba(255, 102, 68, 0.6)";
          } else if (w.type === "window") {
            ctx.fillStyle = "rgba(68, 170, 255, 0.4)";
            ctx.strokeStyle = "rgba(68, 170, 255, 0.6)";
          } else {
            ctx.fillStyle = "rgba(136, 153, 170, 0.5)";
            ctx.strokeStyle = "rgba(180, 190, 200, 0.7)";
          }
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();
        });

        // Draw robots
        Object.entries(gazeboMeshes).forEach(([name, mesh]) => {
          if (!name.includes("robot")) return;
          const [rx, ry] = toScreen(mesh.position.x, mesh.position.z);
          // Robot dot
          ctx.beginPath();
          ctx.arc(rx, ry, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#00d4ff";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Direction indicator
          const forward = new THREE.Vector3(1, 0, 0);
          forward.applyQuaternion(mesh.quaternion);
          const [fx, fy] = toScreen(mesh.position.x + forward.x * 0.5, mesh.position.z + forward.z * 0.5);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(fx, fy);
          ctx.strokeStyle = "#00d4ff";
          ctx.lineWidth = 2;
          ctx.stroke();
        });

        // Border
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, W, H);
      }

      // Default camera position
      const extent = isFinite(minX) ? Math.max((maxX - minX), (maxY - minY)) * SCALE : 8;
      controls.setLookAt(extent * 1.2, extent * 1.2, extent * 1.2, 0, 0, 0, true);

      // Render loop
      const clock = new THREE.Clock();
      const animate = () => {
        if (disposed) return;
        requestAnimationFrame(animate);

        // FPV: follow robot in render loop
        if (robotFPV && robotFPVName && gazeboMeshes[robotFPVName]) {
          const mesh = gazeboMeshes[robotFPVName];
          const robotPos = mesh.position.clone();
          const forward = new THREE.Vector3(1, 0, 0);
          forward.applyQuaternion(mesh.quaternion);
          forward.y = 0;
          forward.normalize();
          const behind = forward.clone().multiplyScalar(-1.5);
          behind.y = 0.8;
          camera.position.copy(robotPos.clone().add(behind));
          const ahead = forward.clone().multiplyScalar(3);
          ahead.y = 0.2;
          camera.lookAt(robotPos.clone().add(ahead));
        } else {
          controls.update(clock.getDelta());
        }

        // Draw minimap
        drawMinimap();

        try {
          renderer.render(scene, camera);
        } catch (e) {
          // WebGPU buffer not ready yet for newly added meshes - skip frame
        }
      };
      animate();

      // Resize
      const onResize = () => {
        const nw = mount.clientWidth;
        const nh = mount.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener("resize", onResize);

      viewerRef.current = { renderer, scene, camera, controls, onResize, onToggle2D, onToggle3D, onSelectFloor, onWallMode, onGazeboScene, onGazeboPoses, onGazeboSpawn, onGazeboRobotModel, onRobotFPV, onRobotPathControl, onGazeboViz, onGazeboScreenshot };
    }

    initWebGPU();

    return () => {
      disposed = true;
      if (viewerRef.current) {
        const { renderer, onResize, onToggle2D, onToggle3D, onSelectFloor, onWallMode, onGazeboScene, onGazeboPoses, onGazeboSpawn, onGazeboRobotModel, onRobotFPV, onRobotPathControl, onGazeboViz, onGazeboScreenshot } = viewerRef.current;
        window.removeEventListener("resize", onResize);
        window.removeEventListener("toggle-2d", onToggle2D);
        window.removeEventListener("toggle-3d", onToggle3D);
        window.removeEventListener("select-floor", onSelectFloor);
        window.removeEventListener("wall-mode", onWallMode);
        window.removeEventListener("gazebo-scene", onGazeboScene);
        window.removeEventListener("gazebo-poses", onGazeboPoses);
        window.removeEventListener("gazebo-spawn", onGazeboSpawn);
        window.removeEventListener("robot-fpv", onRobotFPV);
        window.removeEventListener("gazebo-robot-model", onGazeboRobotModel);
        window.removeEventListener("gazebo-viz", onGazeboViz);
        window.removeEventListener("gazebo-screenshot", onGazeboScreenshot);
        window.removeEventListener("robot-path-control", onRobotPathControl);
        window.removeEventListener("robot-click-place", onClickPlaceToggle);
        if (mount.contains(renderer.domElement)) {
          mount.removeChild(renderer.domElement);
        }
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh", background: THEME.bg }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* WebGPU badge */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: 56,
          padding: "4px 10px",
          background: "#00d4ff15",
          border: "1px solid #00d4ff33",
          borderRadius: 4,
          fontSize: 9,
          color: "#00d4ff88",
          fontWeight: 500,
          letterSpacing: 1,
          pointerEvents: "none",
        }}
      >
        WebGPU RENDERER
      </div>

      {/* Minimap popup - draggable */}
      {minimapVisible && (
        <div
          style={{
            position: "fixed",
            left: mmPos.x,
            top: mmPos.y,
            zIndex: 500,
            background: "rgba(11, 14, 20, 0.9)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "4px 8px",
              fontSize: 10,
              color: "var(--text-dim)",
              background: "rgba(255,255,255,0.05)",
              cursor: "move",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              userSelect: "none",
            }}
            onMouseDown={(e) => {
              mmDragRef.current = { dragging: true, ox: e.clientX - mmPos.x, oy: e.clientY - mmPos.y };
              const onMove = (ev) => {
                if (mmDragRef.current.dragging) {
                  setMmPos({ x: ev.clientX - mmDragRef.current.ox, y: ev.clientY - mmDragRef.current.oy });
                }
              };
              const onUp = () => {
                mmDragRef.current.dragging = false;
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
          >
            <span>Minimap</span>
            <button
              onClick={() => {
                setMinimapVisible(false);
                window.dispatchEvent(new CustomEvent("gazebo-minimap", { detail: { visible: false } }));
              }}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 12, padding: 0 }}
            >✕</button>
          </div>
          <canvas ref={minimapRef} width={220} height={220} style={{ display: "block" }} />
        </div>
      )}
      {!minimapVisible && <canvas ref={minimapRef} width={220} height={220} style={{ display: "none" }} />}

      {/* Controls hint */}
      <div
        style={{
          position: "fixed",
          bottom: 220,
          right: 16,
          fontSize: 9,
          color: THEME.textDim + "88",
          pointerEvents: "none",
          textAlign: "right",
          lineHeight: 1.8,
        }}
      >
        Left drag: orbit&ensp;•&ensp;Right drag: pan&ensp;•&ensp;Scroll: zoom
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useCallback } from "react";
import { THEME } from "@/lib/constants";
// No default building - loaded dynamically via Building tab
const buildingData = { Stories: [], Spaces: [], Walls: [], Doors: [], Windows: [], Columns: [], Staircases: [] };

export default function WebGPUViewer() {
  const mountRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;

    async function initWebGPU() {
      // Dynamic import to avoid SSR issues
      const THREE = await import("three/webgpu");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const CameraControlsModule = await import("camera-controls");
      const CameraControls = CameraControlsModule.default;
      CameraControls.install({ THREE });
      const gltfLoader = new GLTFLoader();

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
      scene.add(new THREE.GridHelper(80, 40, 0x1a2a3a, 0x111922));

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

          // FPV camera tracking moved to render loop for smooth updates
        });
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

      viewerRef.current = { renderer, scene, camera, controls, onResize, onToggle2D, onToggle3D, onSelectFloor, onWallMode, onGazeboScene, onGazeboPoses, onGazeboSpawn, onGazeboRobotModel, onRobotFPV, onGazeboViz, onGazeboScreenshot };
    }

    initWebGPU();

    return () => {
      disposed = true;
      if (viewerRef.current) {
        const { renderer, onResize, onToggle2D, onToggle3D, onSelectFloor, onWallMode, onGazeboScene, onGazeboPoses, onGazeboSpawn, onGazeboRobotModel, onRobotFPV, onGazeboViz, onGazeboScreenshot } = viewerRef.current;
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

      {/* Controls hint */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
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

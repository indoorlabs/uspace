"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { FLOORS, FLOOR_HEIGHT, THEME } from "@/lib/constants";
import { buildScene } from "@/lib/buildingGeometry";
import Sidebar from "./Sidebar";

export default function DigitalTwinViewer() {
  const mountRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const floorsRef = useRef([]);
  const animFrame = useRef(null);

  // Orbit state
  const isDown = useRef(false);
  const rightDown = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const spherical = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: 20 });
  const target = useRef(new THREE.Vector3(0, (FLOORS * FLOOR_HEIGHT) / 2, 0));

  // ── Initialise Three.js scene ────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(THEME.bg);
    scene.fog = new THREE.FogExp2(THEME.bg, 0.008);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    cameraRef.current = camera;

    // Build everything
    const { floorGroups } = buildScene(scene);
    floorsRef.current = floorGroups;

    // Render loop
    const animate = () => {
      animFrame.current = requestAnimationFrame(animate);
      const s = spherical.current;
      const t = target.current;
      camera.position.set(
        t.x + s.radius * Math.sin(s.phi) * Math.cos(s.theta),
        t.y + s.radius * Math.cos(s.phi),
        t.z + s.radius * Math.sin(s.phi) * Math.sin(s.theta)
      );
      camera.lookAt(t);
      renderer.render(scene, camera);
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

    return () => {
      cancelAnimationFrame(animFrame.current);
      window.removeEventListener("resize", onResize);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // ── Pointer handlers ─────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    if (e.button === 2) rightDown.current = true;
    else isDown.current = true;
    prevMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback((e) => {
    if (e.button === 2) rightDown.current = false;
    else isDown.current = false;
  }, []);

  const onPointerMove = useCallback((e) => {
    const dx = e.clientX - prevMouse.current.x;
    const dy = e.clientY - prevMouse.current.y;
    prevMouse.current = { x: e.clientX, y: e.clientY };

    // Orbit
    if (isDown.current) {
      spherical.current.theta -= dx * 0.005;
      spherical.current.phi = Math.max(
        0.2,
        Math.min(Math.PI - 0.2, spherical.current.phi + dy * 0.005)
      );
    }

    // Pan
    if (rightDown.current) {
      const cam = cameraRef.current;
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      target.current.add(right.multiplyScalar(-dx * 0.05));
      target.current.add(up.multiplyScalar(-dy * 0.05));
    }
  }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    spherical.current.radius = Math.max(
      10,
      Math.min(80, spherical.current.radius + e.deltaY * 0.03)
    );
  }, []);

  const onContext = useCallback((e) => e.preventDefault(), []);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        background: THEME.bg,
      }}
    >
      <Sidebar />

      {/* ── Viewport ── */}
      <div style={{ flex: 1, position: "relative" }}>
        <div
          ref={mountRef}
          style={{ width: "100%", height: "100%" }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerMove={onPointerMove}
          onWheel={onWheel}
          onContextMenu={onContext}
        />

        {/* Controls hint */}
        <div
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            fontSize: 9,
            color: THEME.textDim + "88",
            pointerEvents: "none",
            textAlign: "right",
            lineHeight: 1.8,
          }}
        >
          Left drag: orbit&ensp;•&ensp;Right drag: pan&ensp;•&ensp;Scroll:
          zoom&ensp;•&ensp;Click: inspect
        </div>
      </div>
    </div>
  );
}

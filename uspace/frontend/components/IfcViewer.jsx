'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { IFCLoader } from 'web-ifc-three';

/**
 * IfcViewer
 * - IFC 파일을 드래그&드롭 또는 파일 선택으로 로드
 * - Three.js로 3D 렌더링
 * - web-ifc-three 기반 파싱
 */
export default function IfcViewer() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const ifcLoaderRef = useRef(null);
  const animFrameRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | loading | loaded | error
  const [message, setMessage] = useState('IFC 파일을 드래그하거나 선택하세요');
  const [modelInfo, setModelInfo] = useState(null);

  // Three.js 씬 초기화
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Grid
    const grid = new THREE.GridHelper(50, 50, 0x444466, 0x333355);
    scene.add(grid);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(15, 15, 15);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // IFC Loader
    const ifcLoader = new IFCLoader();
    ifcLoader.ifcManager.setWasmPath('/ifc/');
    ifcLoaderRef.current = ifcLoader;

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // IFC 파일 로드
  const loadIfc = async (file) => {
    if (!file || !sceneRef.current) return;
    if (!file.name.endsWith('.ifc')) {
      setStatus('error');
      setMessage('IFC 파일(.ifc)만 지원합니다.');
      return;
    }

    setStatus('loading');
    setMessage(`"${file.name}" 로딩 중...`);

    try {
      const url = URL.createObjectURL(file);
      const ifcLoader = ifcLoaderRef.current;

      // 기존 모델 제거
      sceneRef.current.children
        .filter((c) => c.userData.isIfcModel)
        .forEach((c) => sceneRef.current.remove(c));

      const model = await ifcLoader.loadAsync(url);
      model.userData.isIfcModel = true;
      sceneRef.current.add(model);

      // 카메라를 모델 중심으로 이동
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      cameraRef.current.position.set(
        center.x + maxDim,
        center.y + maxDim,
        center.z + maxDim
      );
      controlsRef.current.target.copy(center);
      controlsRef.current.update();

      URL.revokeObjectURL(url);

      setStatus('loaded');
      setMessage(`✅ "${file.name}" 로드 완료`);
      setModelInfo({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        objects: sceneRef.current.children.filter((c) => c.userData.isIfcModel).length,
      });
    } catch (err) {
      console.error('IFC 로드 실패:', err);
      setStatus('error');
      setMessage(`❌ 로드 실패: ${err.message}`);
    }
  };

  // 파일 선택
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) loadIfc(file);
  };

  // 드래그&드롭
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) loadIfc(file);
  };

  const handleDragOver = (e) => e.preventDefault();

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f0f1a', color: '#e0e0ff', fontFamily: 'Inter, sans-serif' }}>
      {/* 상단 툴바 */}
      <div style={{ padding: '12px 20px', background: '#16213e', borderBottom: '1px solid #2a2a5a', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '18px', fontWeight: 700, color: '#7c83ff' }}>🏗️ IFC Viewer</span>
        <label style={{ cursor: 'pointer', padding: '6px 16px', background: '#7c83ff', borderRadius: '6px', fontSize: '13px', fontWeight: 600, color: '#fff' }}>
          파일 선택
          <input type="file" accept=".ifc" onChange={handleFileChange} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: '13px', color: status === 'error' ? '#ff6b6b' : status === 'loaded' ? '#6bffb8' : '#aaa' }}>
          {message}
        </span>
        {modelInfo && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', fontSize: '12px', color: '#8888cc' }}>
            <span>📄 {modelInfo.name}</span>
            <span>💾 {modelInfo.size}</span>
          </div>
        )}
      </div>

      {/* 3D 뷰포트 */}
      <div
        ref={mountRef}
        style={{ flex: 1, position: 'relative' }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {status === 'idle' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            color: '#5555aa', fontSize: '15px', gap: '8px'
          }}>
            <div style={{ fontSize: '48px' }}>📂</div>
            <div>IFC 파일을 드래그하여 놓으세요</div>
            <div style={{ fontSize: '12px', color: '#3333777' }}>또는 상단 "파일 선택" 버튼 클릭</div>
          </div>
        )}
        {status === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(15,15,26,0.7)', fontSize: '16px', color: '#7c83ff'
          }}>
            ⏳ 파싱 중... 잠시만 기다려주세요
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';

// Three.js / web-ifc-three는 SSR 불가 → dynamic import로 클라이언트에서만 로드
const IfcViewer = dynamic(() => import('@/components/IfcViewer'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#0f0f1a', color: '#7c83ff', fontSize: '16px'
    }}>
      🏗️ IFC Viewer 초기화 중...
    </div>
  ),
});

export default function IfcTestPage() {
  return <IfcViewer />;
}

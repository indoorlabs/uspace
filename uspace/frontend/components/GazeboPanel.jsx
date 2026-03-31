"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = "ws://localhost:9090";
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 10000];

function Section({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 8 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          cursor: "pointer", padding: "3px 0",
          borderBottom: "1px solid rgba(120,53,15,0.15)",
          marginBottom: open ? 6 : 0,
        }}
      >
        <span style={{ fontSize: 10, color: "#78350f", opacity: 0.6 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontSize: 9, letterSpacing: 0.8, fontWeight: 700, color: "#92400e", textTransform: "uppercase" }}>
          {icon} {title}
        </span>
      </div>
      {open && children}
    </div>
  );
}

export default function GazeboPanel() {
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState(null);
  const [modelCount, setModelCount] = useState(0);
  const [modelNames, setModelNames] = useState([]);
  const [simActive, setSimActive] = useState(false);
  const [minimized, setMinimized] = useState(false);
  // Visualization toggles (client-side)
  const [wireframe, setWireframe] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showCollisions, setShowCollisions] = useState(false);
  // Physics
  const [stepSize, setStepSize] = useState(0.001);
  const [targetRTF, setTargetRTF] = useState(1.0);
  // Lighting
  const [lightType, setLightType] = useState("point");
  const [lightIntensity, setLightIntensity] = useState(1.0);
  const [lightColor, setLightColor] = useState("#ffffff");
  const [lightCastShadows, setLightCastShadows] = useState(true);
  // Wind
  const [windX, setWindX] = useState(0);
  const [windY, setWindY] = useState(0);
  const [windZ, setWindZ] = useState(0);
  // Entity control
  const [selectedEntity, setSelectedEntity] = useState("");
  const [moveX, setMoveX] = useState(0);
  const [moveY, setMoveY] = useState(0);
  const [moveZ, setMoveZ] = useState(0);
  const [forceX, setForceX] = useState(0);
  const [forceY, setForceY] = useState(0);
  const [forceZ, setForceZ] = useState(100);
  // Recording
  const [recording, setRecording] = useState(false);
  // Scene graph
  const [sceneGraph, setSceneGraph] = useState(null);

  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const timerRef = useRef(null);
  const sceneDataRef = useRef(null);

  const sendCommand = useCallback((action, extra) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...extra }));
    }
  }, []);

  const activateSimView = useCallback(() => {
    if (sceneDataRef.current) {
      window.dispatchEvent(new CustomEvent("gazebo-scene", { detail: sceneDataRef.current }));
      setSimActive(true);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "scene") {
          sceneDataRef.current = data;
          setModelCount(data.models?.length || 0);
          setModelNames((data.models || []).map((m) => m.name));
        } else if (data.type === "poses") {
          if (!ws._posesLogged) { console.log("[GazeboPanel] poses received, models:", data.models?.length); ws._posesLogged = true; }
          window.dispatchEvent(new CustomEvent("gazebo-poses", { detail: data }));
          if (data.models) setModelCount(data.models.length);
        } else if (data.type === "stats") {
          setStats(data);
          if (data.paused !== undefined) setPaused(data.paused);
        } else if (data.type === "scene_graph") {
          setSceneGraph(data.data);
        } else if (data.type === "world_sdf") {
          const blob = new Blob([data.data], { type: "application/xml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "world.sdf"; a.click();
          URL.revokeObjectURL(url);
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      setSimActive(false);
      wsRef.current = null;
      const delay = RECONNECT_DELAYS[Math.min(retryRef.current, RECONNECT_DELAYS.length - 1)];
      retryRef.current++;
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  // Dispatch visualization events to WebGPUViewer
  const dispatchViz = (type, value) => {
    window.dispatchEvent(new CustomEvent("gazebo-viz", { detail: { type, value } }));
  };

  const handleScreenshot = () => {
    window.dispatchEvent(new CustomEvent("gazebo-screenshot"));
  };

  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
  };

  const btn = (active, small) => ({
    padding: small ? "3px 7px" : "4px 10px",
    borderRadius: 4,
    border: active ? "2px solid #d97706" : "1px solid rgba(120,53,15,0.25)",
    background: active ? "rgba(217, 119, 6, 0.2)" : "rgba(255,255,255,0.5)",
    color: active ? "#92400e" : "#1e293b",
    fontSize: small ? 9 : 10,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    lineHeight: 1.2,
  });

  const toggleBtn = (label, active, onClick) => (
    <button key={label} onClick={onClick} style={btn(active, true)}>{label}</button>
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 56,
        left: 16,
        background: "rgba(255, 245, 157, 0.95)",
        border: connected
          ? "2px solid rgba(251, 191, 36, 0.8)"
          : "2px solid rgba(239, 68, 68, 0.6)",
        borderRadius: 8,
        padding: minimized ? "6px 12px" : "10px 14px",
        fontFamily: '"Inter", "JetBrains Mono", ui-sans-serif, system-ui, sans-serif',
        zIndex: 900,
        width: minimized ? "auto" : 280,
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        maxHeight: minimized ? "auto" : "calc(100vh - 80px)",
        overflowY: minimized ? "visible" : "auto",
      }}
    >
      {/* Header */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        onClick={() => setMinimized(!minimized)}
      >
        <div
          style={{
            width: 7, height: 7, borderRadius: "50%",
            background: connected ? "#34d399" : "#f87171",
            boxShadow: connected ? "0 0 6px #34d399" : "0 0 6px #f87171",
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", letterSpacing: 0.5 }}>
          Gazebo Sim
        </span>
        <span style={{ fontSize: 9, color: "#78350f", fontWeight: 600, marginLeft: "auto" }}>
          {connected ? `${modelCount} models` : "Offline"}
        </span>
        <span style={{ fontSize: 10, color: "#78350f", opacity: 0.5 }}>{minimized ? "+" : "−"}</span>
      </div>

      {!minimized && connected && (
        <>
          {/* Sim View Toggle */}
          <div style={{ marginTop: 8 }}>
            <button
              onClick={activateSimView}
              style={{ ...btn(simActive, false), width: "100%", padding: "6px 10px", fontSize: 11 }}
            >
              {simActive ? "Sim View Active" : "Switch to Sim View"}
            </button>
          </div>

          {/* ── World Control ── */}
          <Section title="World Control" icon="⏱">
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button onClick={() => sendCommand("play")} style={btn(!paused, true)}>
                ▶ Play
              </button>
              <button onClick={() => sendCommand("pause")} style={btn(paused, true)}>
                ⏸ Pause
              </button>
              <button onClick={() => sendCommand("step")} style={btn(false, true)}>
                ⏭ Step
              </button>
              <button onClick={() => sendCommand("reset")} style={btn(false, true)}>
                ↺ Reset
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: "#78350f", lineHeight: 1.6 }}>
              {stats?.realTimeFactor !== undefined && (
                <span>RTF: <b>{stats.realTimeFactor.toFixed(2)}</b>&ensp;</span>
              )}
              {stats?.iterations !== undefined && (
                <span>Steps: <b>{stats.iterations.toLocaleString()}</b>&ensp;</span>
              )}
              <span style={{ color: paused ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                {paused ? "Paused" : "Running"}
              </span>
            </div>
          </Section>

          {/* ── Spawn Entities ── */}
          <Section title="Spawn" icon="➕">
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  const params = { name: `box_${Date.now()}`, shape: "box",
                    x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: 5,
                    r: Math.random(), g: Math.random(), b: Math.random() };
                  sendCommand("spawn", { params });
                  window.dispatchEvent(new CustomEvent("gazebo-spawn", { detail: params }));
                }}
                style={btn(false, true)}
              >
                ◻ Box
              </button>
              <button
                onClick={() => {
                  const params = { name: `sphere_${Date.now()}`, shape: "sphere",
                    x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: 5,
                    r: Math.random(), g: Math.random(), b: Math.random() };
                  sendCommand("spawn", { params });
                  window.dispatchEvent(new CustomEvent("gazebo-spawn", { detail: params }));
                }}
                style={btn(false, true)}
              >
                ● Sphere
              </button>
              <button
                onClick={() => {
                  const params = { name: `cyl_${Date.now()}`, shape: "cylinder",
                    x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: 5,
                    r: Math.random(), g: Math.random(), b: Math.random() };
                  sendCommand("spawn", { params });
                  window.dispatchEvent(new CustomEvent("gazebo-spawn", { detail: params }));
                }}
                style={btn(false, true)}
              >
                ⬤ Cylinder
              </button>
            </div>
          </Section>

          {/* ── Physics ── */}
          <Section title="Physics" icon="⚙" defaultOpen={false}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 9, color: "#78350f", opacity: 0.7, lineHeight: 1.4 }}>
                Gravity는 월드 SDF에서 설정됩니다. 런타임 변경은 Gazebo Harmonic에서 미지원.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 9, color: "#78350f", width: 55 }}>Step Size</label>
                <input
                  type="number" step="0.0001" value={stepSize}
                  onChange={(e) => setStepSize(parseFloat(e.target.value))}
                  style={inputStyle}
                />
                <button
                  onClick={() => sendCommand("set_physics", { params: { step_size: stepSize } })}
                  style={btn(false, true)}
                >Set</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 9, color: "#78350f", width: 55 }}>Target RTF</label>
                <input
                  type="number" step="0.1" value={targetRTF}
                  onChange={(e) => setTargetRTF(parseFloat(e.target.value))}
                  style={inputStyle}
                />
                <button
                  onClick={() => sendCommand("set_physics", { params: { rtf: targetRTF } })}
                  style={btn(false, true)}
                >Set</button>
              </div>
            </div>
          </Section>

          {/* ── Visualization ── */}
          <Section title="Visualization" icon="👁">
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {toggleBtn("Wireframe", wireframe, () => {
                setWireframe(!wireframe);
                dispatchViz("wireframe", !wireframe);
              })}
              {toggleBtn("Transparent", transparent, () => {
                setTransparent(!transparent);
                dispatchViz("transparent", !transparent);
              })}
              {toggleBtn("Grid", showGrid, () => {
                setShowGrid(!showGrid);
                dispatchViz("grid", !showGrid);
              })}
              {toggleBtn("Collisions", showCollisions, () => {
                setShowCollisions(!showCollisions);
                dispatchViz("collisions", !showCollisions);
              })}
            </div>
          </Section>

          {/* ── Scene / Models ── */}
          <Section title="Scene" icon="📋" defaultOpen={false}>
            <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 9, lineHeight: 1.8 }}>
              {modelNames.length === 0 && (
                <div style={{ color: "#78350f", opacity: 0.6 }}>No models loaded</div>
              )}
              {modelNames.map((name) => (
                <div
                  key={name}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "1px 4px", borderRadius: 3,
                    background: "rgba(255,255,255,0.3)",
                    marginBottom: 2,
                  }}
                >
                  <span style={{ color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                    {name}
                  </span>
                  <button
                    onClick={() => sendCommand("remove_entity", { name })}
                    style={{
                      background: "none", border: "none", color: "#dc2626",
                      cursor: "pointer", fontSize: 10, padding: "0 2px", fontWeight: 700,
                    }}
                    title="Remove"
                  >✕</button>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Entity Control ── */}
          <Section title="Entity Control" icon="🎮" defaultOpen={false}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <label style={{ fontSize: 9, color: "#78350f", width: 40 }}>Entity</label>
                <select
                  value={selectedEntity}
                  onChange={(e) => setSelectedEntity(e.target.value)}
                  style={{ ...inputStyle, width: "100%", flex: 1 }}
                >
                  <option value="">Select...</option>
                  {modelNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              {selectedEntity && (
                <>
                  <div style={{ fontSize: 9, color: "#92400e", fontWeight: 700, marginTop: 2 }}>Move / Teleport</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input type="number" step="0.5" value={moveX} onChange={(e) => setMoveX(parseFloat(e.target.value))} style={{ ...inputStyle, width: 50 }} placeholder="X" />
                    <input type="number" step="0.5" value={moveY} onChange={(e) => setMoveY(parseFloat(e.target.value))} style={{ ...inputStyle, width: 50 }} placeholder="Y" />
                    <input type="number" step="0.5" value={moveZ} onChange={(e) => setMoveZ(parseFloat(e.target.value))} style={{ ...inputStyle, width: 50 }} placeholder="Z" />
                    <button onClick={() => sendCommand("move_entity", { name: selectedEntity, x: moveX, y: moveY, z: moveZ })} style={btn(false, true)}>Move</button>
                  </div>
                  <div style={{ fontSize: 9, color: "#92400e", fontWeight: 700, marginTop: 2 }}>Apply Force</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input type="number" step="10" value={forceX} onChange={(e) => setForceX(parseFloat(e.target.value))} style={{ ...inputStyle, width: 50 }} placeholder="Fx" />
                    <input type="number" step="10" value={forceY} onChange={(e) => setForceY(parseFloat(e.target.value))} style={{ ...inputStyle, width: 50 }} placeholder="Fy" />
                    <input type="number" step="10" value={forceZ} onChange={(e) => setForceZ(parseFloat(e.target.value))} style={{ ...inputStyle, width: 50 }} placeholder="Fz" />
                    <button onClick={() => sendCommand("apply_force", { name: selectedEntity, fx: forceX, fy: forceY, fz: forceZ })} style={btn(false, true)}>Push</button>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                    <button onClick={() => sendCommand("clone_entity", { name: selectedEntity })} style={btn(false, true)}>Clone</button>
                    <button onClick={() => sendCommand("toggle_collision", { name: selectedEntity, enable: true })} style={btn(false, true)}>Collision On</button>
                    <button onClick={() => sendCommand("toggle_collision", { name: selectedEntity, enable: false })} style={btn(false, true)}>Collision Off</button>
                  </div>
                </>
              )}
            </div>
          </Section>

          {/* ── Lighting ── */}
          <Section title="Lighting (SDF only)" icon="💡" defaultOpen={false}>
            <div style={{ fontSize: 9, color: "#78350f", opacity: 0.7, lineHeight: 1.4 }}>
              Gazebo Harmonic headless 모드에서 런타임 조명 추가 미지원. 월드 SDF 파일에서 직접 설정하세요.
            </div>
          </Section>

          {/* ── Environment / Wind ── */}
          <Section title="Environment (SDF only)" icon="🌬" defaultOpen={false}>
            <div style={{ fontSize: 9, color: "#78350f", opacity: 0.7, lineHeight: 1.4 }}>
              Wind 시스템은 SDF에서 설정 필요. 런타임 변경 미지원.
            </div>
          </Section>

          {/* ── Recording / Export ── */}
          <Section title="Recording" icon="🎬" defaultOpen={false}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button
                onClick={() => { sendCommand("video_record", { start: !recording }); setRecording(!recording); }}
                style={btn(recording, true)}
              >
                {recording ? "⏹ Stop Recording" : "⏺ Start Recording"}
              </button>
              <button onClick={() => sendCommand("save_world")} style={btn(false, true)}>
                💾 Save World SDF
              </button>
            </div>
            {recording && (
              <div style={{ marginTop: 4, fontSize: 9, color: "#dc2626", fontWeight: 700 }}>
                Recording in progress...
              </div>
            )}
          </Section>

          {/* ── Scene Graph ── */}
          <Section title="Scene Graph" icon="🌲" defaultOpen={false}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button onClick={() => sendCommand("scene_graph")} style={{ ...btn(false, true), width: "100%" }}>
                Load Scene Graph
              </button>
              {sceneGraph && (
                <pre style={{
                  maxHeight: 150, overflowY: "auto", fontSize: 8, lineHeight: 1.4,
                  background: "rgba(255,255,255,0.5)", padding: 6, borderRadius: 4,
                  whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#1e293b",
                  border: "1px solid rgba(120,53,15,0.15)",
                }}>
                  {sceneGraph}
                </pre>
              )}
            </div>
          </Section>

          {/* ── Camera / Tools ── */}
          <Section title="Tools" icon="🔧" defaultOpen={false}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button onClick={handleScreenshot} style={btn(false, true)}>
                📷 Screenshot
              </button>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("gazebo-viz", {
                    detail: { type: "resetCamera" },
                  }));
                }}
                style={btn(false, true)}
              >
                🎯 Reset Camera
              </button>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("gazebo-viz", {
                    detail: { type: "topView" },
                  }));
                }}
                style={btn(false, true)}
              >
                ⬆ Top View
              </button>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("gazebo-viz", {
                    detail: { type: "frontView" },
                  }));
                }}
                style={btn(false, true)}
              >
                ◨ Front View
              </button>
            </div>
          </Section>
        </>
      )}

      {/* Not connected */}
      {!minimized && !connected && (
        <div style={{ marginTop: 8, fontSize: 10, color: "#78350f", lineHeight: 1.6 }}>
          Waiting for bridge on ws://localhost:9090...
          <br />
          Run <code style={{ color: "#92400e", fontWeight: 600 }}>launch_gazebo.sh</code> in WSL2
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: 70, padding: "3px 6px", fontSize: 10,
  border: "1px solid rgba(120,53,15,0.25)",
  borderRadius: 4, background: "rgba(255,255,255,0.6)",
  color: "#1e293b", fontFamily: "inherit",
};

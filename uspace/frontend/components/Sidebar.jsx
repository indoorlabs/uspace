"use client";

import { useState, useEffect, useRef, useCallback } from "react";

function getWsUrl() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  return "ws://localhost:9090";
}
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 10000];

const TABS = [
  { id: "building", label: "Building", icon: "⌂" },
  { id: "robot", label: "Robot", icon: "⊞" },
  { id: "sim", label: "Sim", icon: "▶" },
  { id: "spawn", label: "Spawn", icon: "+" },
  { id: "entity", label: "Entity", icon: "◎" },
  { id: "view", label: "View", icon: "◈" },
  { id: "physics", label: "Physics", icon: "⚙" },
  { id: "export", label: "Export", icon: "↓" },
];

const inputStyle = {
  width: "100%", padding: "5px 8px", fontSize: 11,
  border: "1px solid var(--panel-border)",
  borderRadius: 4, background: "#1a2230",
  color: "#e2e8f0", fontFamily: "inherit",
  outline: "none",
};

const smallInputStyle = {
  ...inputStyle, width: 56, textAlign: "center",
};

export default function Sidebar() {
  const [activeTab, setActiveTab] = useState("building");
  const [collapsed, setCollapsed] = useState(false);

  // Building
  const [buildingFiles, setBuildingFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [buildingStatus, setBuildingStatus] = useState("idle");
  const [viewMode, setViewMode] = useState("3d"); // "2d" | "3d"
  const [wallMode, setWallMode] = useState("full"); // "full" | "half" // idle, converting, loading, done, error
  const [buildingError, setBuildingError] = useState(null);

  // Connection
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState(null);
  const [modelCount, setModelCount] = useState(0);
  const [modelNames, setModelNames] = useState([]);
  const [simActive, setSimActive] = useState(false);

  // Visualization
  const [wireframe, setWireframe] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  // Physics
  const [stepSize, setStepSize] = useState(0.001);
  const [targetRTF, setTargetRTF] = useState(1.0);

  // Entity control
  const [selectedEntity, setSelectedEntity] = useState("");
  const [moveX, setMoveX] = useState(0);
  const [moveY, setMoveY] = useState(0);
  const [moveZ, setMoveZ] = useState(0);
  const [forceX, setForceX] = useState(0);
  const [forceY, setForceY] = useState(0);
  const [forceZ, setForceZ] = useState(100);

  // Robot
  const [robotModels, setRobotModels] = useState([]);
  const [selectedRobot, setSelectedRobot] = useState("simple_robot");
  const [robotX, setRobotX] = useState(0);
  const [robotY, setRobotY] = useState(0);
  const [robotYaw, setRobotYaw] = useState(0);
  const [driveTopic, setDriveTopic] = useState("/model/simple_robot/cmd_vel");
  const [robotAppearance, setRobotAppearance] = useState("curiosity_rover");

  // Robot FPV
  const [fpvActive, setFpvActive] = useState(false);
  const fpvRobotRef = useRef(null);

  // Keyboard drive
  const [keyDriveActive, setKeyDriveActive] = useState(false);
  const keyDriveRef = useRef({ active: false, keys: {}, interval: null, topic: "" });

  // Export
  const [recording, setRecording] = useState(false);
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
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
      ws.send(JSON.stringify({ action: "list_robots" }));
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "scene") {
          sceneDataRef.current = data;
          setModelCount(data.models?.length || 0);
          setModelNames((data.models || []).map((m) => m.name));
        } else if (data.type === "poses") {
          if (!ws._posesLogged) {
            const robot = data.models?.find(m => m.name.includes("chassis") || m.name.includes("robot"));
            console.log("[Sidebar] poses received, count:", data.models?.length, "robot:", robot ? JSON.stringify(robot.position) : "not found");
            ws._posesLogged = true;
          }
          window.dispatchEvent(new CustomEvent("gazebo-poses", { detail: data }));
          if (data.models) setModelCount(data.models.length);
        } else if (data.type === "stats") {
          setStats(data);
          if (data.paused !== undefined) setPaused(data.paused);
        } else if (data.type === "robot_models") {
          setRobotModels(data.models || []);
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
    // Fetch available building JSON files
    fetch(`/api/building-files`)
      .then((r) => r.json())
      .then((d) => {
        if (d.files?.length) {
          setBuildingFiles(d.files);
          setSelectedFile(d.files[0]);
        }
      })
      .catch(() => {});
    return () => {
      clearTimeout(timerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  // ── Keyboard Drive ──
  const startKeyDrive = useCallback(() => {
    if (keyDriveRef.current.active) return;
    keyDriveRef.current.active = true;
    keyDriveRef.current.keys = {};
    keyDriveRef.current.topic = driveTopic;
    setKeyDriveActive(true);

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (["w","a","s","d","q","e"].includes(k)) {
        e.preventDefault();
        keyDriveRef.current.keys[k] = true;
      }
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (["w","a","s","d","q","e"].includes(k)) {
        e.preventDefault();
        delete keyDriveRef.current.keys[k];
      }
      if (e.key === "Escape") stopKeyDrive();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    keyDriveRef.current._onKeyDown = onKeyDown;
    keyDriveRef.current._onKeyUp = onKeyUp;

    // Send commands at 10Hz based on pressed keys
    keyDriveRef.current.interval = setInterval(() => {
      const keys = keyDriveRef.current.keys;
      let linear = 0, angular = 0;
      if (keys.w) linear += 0.5;
      if (keys.s) linear -= 0.5;
      if (keys.a) angular += 0.8;
      if (keys.d) angular -= 0.8;
      if (keys.q) { linear += 0.3; angular += 0.4; }
      if (keys.e) { linear += 0.3; angular -= 0.4; }

      // Always use latest topic from ref (updated when robot spawns)
      const topic = keyDriveRef.current.topic;
      if (topic) {
        sendCommand("drive_robot", { topic, linear, angular });
      }
    }, 100);
  }, [driveTopic, sendCommand]);

  const stopKeyDrive = useCallback(() => {
    if (!keyDriveRef.current.active) return;
    keyDriveRef.current.active = false;
    setKeyDriveActive(false);
    clearInterval(keyDriveRef.current.interval);
    if (keyDriveRef.current._onKeyDown) {
      window.removeEventListener("keydown", keyDriveRef.current._onKeyDown, true);
      window.removeEventListener("keyup", keyDriveRef.current._onKeyUp, true);
    }
    // Send stop command
    sendCommand("drive_robot", { topic: keyDriveRef.current.topic, linear: 0, angular: 0 });
  }, [sendCommand]);

  const dispatchViz = (type, value) => {
    window.dispatchEvent(new CustomEvent("gazebo-viz", { detail: { type, value } }));
  };

  // ── Button styles ──
  const btnStyle = (active = false) => ({
    padding: "6px 10px",
    borderRadius: 4,
    border: active ? "1px solid var(--accent)" : "1px solid var(--panel-border)",
    background: active ? "rgba(0, 212, 255, 0.12)" : "rgba(255,255,255,0.04)",
    color: active ? "var(--accent)" : "var(--text)",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  });

  const btnFullStyle = (active = false) => ({
    ...btnStyle(active),
    width: "100%",
    textAlign: "center",
  });

  const labelStyle = {
    fontSize: 10, color: "var(--text-dim)", fontWeight: 500,
    textTransform: "uppercase", letterSpacing: 0.8,
    marginBottom: 6, marginTop: 12,
  };

  const subLabelStyle = {
    fontSize: 10, color: "var(--text-dim)", marginBottom: 4,
  };

  // ── Spawn helper ──
  const spawnEntity = (shape) => {
    const params = {
      name: `${shape}_${Date.now()}`, shape,
      x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: 5,
      r: Math.random(), g: Math.random(), b: Math.random(),
    };
    sendCommand("spawn", { params });
    window.dispatchEvent(new CustomEvent("gazebo-spawn", { detail: params }));
  };

  // ── Tab content renderers ──
  const renderSim = () => (
    <div>
      <button onClick={activateSimView} style={btnFullStyle(simActive)}>
        {simActive ? "Sim View Active" : "Switch to Sim View"}
      </button>

      <div style={labelStyle}>Playback</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <button onClick={() => sendCommand("play")} style={btnStyle(!paused)}>▶ Play</button>
        <button onClick={() => sendCommand("pause")} style={btnStyle(paused)}>⏸ Pause</button>
        <button onClick={() => sendCommand("step")} style={btnStyle()}>⏭ Step</button>
        <button onClick={() => sendCommand("reset")} style={btnStyle()}>↺ Reset</button>
      </div>

      <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 4, background: "rgba(255,255,255,0.03)", border: "1px solid var(--panel-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-dim)" }}>
          <span>Status</span>
          <span style={{ color: paused ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
            {paused ? "Paused" : "Running"}
          </span>
        </div>
        {stats?.realTimeFactor !== undefined && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
            <span>RTF</span>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>{stats.realTimeFactor.toFixed(2)}</span>
          </div>
        )}
        {stats?.iterations !== undefined && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
            <span>Steps</span>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>{stats.iterations.toLocaleString()}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
          <span>Models</span>
          <span style={{ color: "var(--text)", fontWeight: 500 }}>{modelCount}</span>
        </div>
      </div>
    </div>
  );

  const renderSpawn = () => (
    <div>
      <div style={labelStyle}>Primitives</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        <button onClick={() => spawnEntity("box")} style={btnStyle()}>◻ Box</button>
        <button onClick={() => spawnEntity("sphere")} style={btnStyle()}>● Sphere</button>
        <button onClick={() => spawnEntity("cylinder")} style={btnStyle()}>⬤ Cylinder</button>
      </div>

      <div style={labelStyle}>Scene Models</div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {modelNames.length === 0 && (
          <div style={{ fontSize: 10, color: "var(--text-dim)", padding: 8 }}>No models loaded</div>
        )}
        {modelNames.map((name) => (
          <div key={name} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 8px", borderRadius: 4,
            background: "rgba(255,255,255,0.03)",
            marginBottom: 2, fontSize: 10,
          }}>
            <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
              {name}
            </span>
            <button
              onClick={() => sendCommand("remove_entity", { name })}
              style={{
                background: "none", border: "none", color: "var(--red)",
                cursor: "pointer", fontSize: 11, padding: "0 4px", fontWeight: 700,
              }}
              title="Remove"
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderEntity = () => (
    <div>
      <div style={labelStyle}>Select Entity</div>
      <select
        value={selectedEntity}
        onChange={(e) => setSelectedEntity(e.target.value)}
        style={inputStyle}
      >
        <option value="">Select model...</option>
        {modelNames.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      {selectedEntity && (
        <>
          <div style={labelStyle}>Move / Teleport</div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={subLabelStyle}>X</div>
              <input type="number" step="0.5" value={moveX} onChange={(e) => setMoveX(parseFloat(e.target.value))} style={smallInputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={subLabelStyle}>Y</div>
              <input type="number" step="0.5" value={moveY} onChange={(e) => setMoveY(parseFloat(e.target.value))} style={smallInputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={subLabelStyle}>Z</div>
              <input type="number" step="0.5" value={moveZ} onChange={(e) => setMoveZ(parseFloat(e.target.value))} style={smallInputStyle} />
            </div>
          </div>
          <button onClick={() => sendCommand("move_entity", { name: selectedEntity, x: moveX, y: moveY, z: moveZ })} style={{ ...btnFullStyle(), marginTop: 6 }}>
            Move
          </button>

          <div style={labelStyle}>Apply Force</div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={subLabelStyle}>Fx</div>
              <input type="number" step="10" value={forceX} onChange={(e) => setForceX(parseFloat(e.target.value))} style={smallInputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={subLabelStyle}>Fy</div>
              <input type="number" step="10" value={forceY} onChange={(e) => setForceY(parseFloat(e.target.value))} style={smallInputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={subLabelStyle}>Fz</div>
              <input type="number" step="10" value={forceZ} onChange={(e) => setForceZ(parseFloat(e.target.value))} style={smallInputStyle} />
            </div>
          </div>
          <button onClick={() => sendCommand("apply_force", { name: selectedEntity, fx: forceX, fy: forceY, fz: forceZ })} style={{ ...btnFullStyle(), marginTop: 6 }}>
            Push
          </button>

          <div style={labelStyle}>Actions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <button onClick={() => sendCommand("clone_entity", { name: selectedEntity })} style={btnStyle()}>Clone</button>
            <button onClick={() => sendCommand("remove_entity", { name: selectedEntity })} style={{ ...btnStyle(), color: "var(--red)" }}>Delete</button>
          </div>
        </>
      )}

      {!selectedEntity && (
        <div style={{ marginTop: 16, fontSize: 10, color: "var(--text-dim)", textAlign: "center", padding: 16 }}>
          Select a model to control
        </div>
      )}
    </div>
  );

  const renderView = () => (
    <div>
      <div style={labelStyle}>Render Mode</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <button onClick={() => { setWireframe(!wireframe); dispatchViz("wireframe", !wireframe); }} style={btnStyle(wireframe)}>
          Wireframe
        </button>
        <button onClick={() => { setTransparent(!transparent); dispatchViz("transparent", !transparent); }} style={btnStyle(transparent)}>
          Transparent
        </button>
        <button onClick={() => { setShowGrid(!showGrid); dispatchViz("grid", !showGrid); }} style={btnStyle(showGrid)}>
          Grid
        </button>
      </div>

      <div style={labelStyle}>Camera</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <button onClick={() => dispatchViz("resetCamera")} style={btnStyle()}>Reset</button>
        <button onClick={() => dispatchViz("topView")} style={btnStyle()}>Top</button>
        <button onClick={() => dispatchViz("frontView")} style={btnStyle()}>Front</button>
        <button onClick={() => window.dispatchEvent(new CustomEvent("gazebo-screenshot"))} style={btnStyle()}>Screenshot</button>
      </div>
    </div>
  );

  const renderPhysics = () => (
    <div>
      <div style={labelStyle}>Simulation</div>
      <div style={{ marginBottom: 8 }}>
        <div style={subLabelStyle}>Step Size (s)</div>
        <div style={{ display: "flex", gap: 4 }}>
          <input type="number" step="0.0001" value={stepSize} onChange={(e) => setStepSize(parseFloat(e.target.value))} style={{ ...inputStyle, flex: 1 }} />
          <button onClick={() => sendCommand("set_physics", { params: { step_size: stepSize } })} style={btnStyle()}>Set</button>
        </div>
      </div>
      <div>
        <div style={subLabelStyle}>Real-Time Factor</div>
        <div style={{ display: "flex", gap: 4 }}>
          <input type="number" step="0.1" value={targetRTF} onChange={(e) => setTargetRTF(parseFloat(e.target.value))} style={{ ...inputStyle, flex: 1 }} />
          <button onClick={() => sendCommand("set_physics", { params: { rtf: targetRTF } })} style={btnStyle()}>Set</button>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5, padding: "8px", background: "rgba(255,255,255,0.02)", borderRadius: 4 }}>
        Gravity is configured in the world SDF file. Runtime changes not supported in Gazebo Harmonic.
      </div>
    </div>
  );

  const renderExport = () => (
    <div>
      <div style={labelStyle}>World</div>
      <button onClick={() => sendCommand("save_world")} style={btnFullStyle()}>
        Save World SDF
      </button>

      <div style={labelStyle}>Recording</div>
      <button
        onClick={() => { sendCommand("video_record", { start: !recording }); setRecording(!recording); }}
        style={btnFullStyle(recording)}
      >
        {recording ? "Stop Recording" : "Start Recording"}
      </button>
      {recording && (
        <div style={{ marginTop: 6, fontSize: 10, color: "var(--red)", fontWeight: 600, textAlign: "center" }}>
          Recording in progress...
        </div>
      )}

      <div style={labelStyle}>Scene Graph</div>
      <button onClick={() => sendCommand("scene_graph")} style={btnFullStyle()}>
        Load Scene Graph
      </button>
      {sceneGraph && (
        <pre style={{
          maxHeight: 200, overflowY: "auto", fontSize: 9, lineHeight: 1.4,
          background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 4,
          whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--text-dim)",
          border: "1px solid var(--panel-border)", marginTop: 6,
        }}>
          {sceneGraph}
        </pre>
      )}
    </div>
  );

  const loadBuilding = async () => {
    if (!selectedFile) return;
    setBuildingStatus("converting");
    setBuildingError(null);
    try {
      const res = await fetch(`/api/convert-sdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selectedFile }),
      });
      if (!res.ok) throw new Error("SDF conversion failed");

      setBuildingStatus("loading");
      const loadRes = await fetch(`/api/gazebo-load`, { method: "POST" });
      if (!loadRes.ok) {
        const err = await loadRes.json();
        throw new Error(err.error || "Gazebo load failed");
      }
      const data = await loadRes.json();

      if (data.scene) {
        window.dispatchEvent(new CustomEvent("gazebo-scene", { detail: data.scene }));
        window.dispatchEvent(new CustomEvent("toggle-3d", { detail: { active: true } }));
        setSimActive(true);
        setViewMode("3d");
      }
      setBuildingStatus("done");
    } catch (e) {
      setBuildingStatus("error");
      setBuildingError(e.message);
    }
  };

  const renderBuilding = () => (
    <div>
      <div style={labelStyle}>Building Model</div>
      <select
        value={selectedFile}
        onChange={(e) => { setSelectedFile(e.target.value); setBuildingStatus("idle"); }}
        style={inputStyle}
      >
        {buildingFiles.length === 0 && <option value="">No files found</option>}
        {buildingFiles.map((f) => (
          <option key={f} value={f}>{f.replace(".json", "")}</option>
        ))}
      </select>

      <button
        onClick={loadBuilding}
        disabled={!selectedFile || buildingStatus === "converting" || buildingStatus === "loading"}
        style={{
          ...btnFullStyle(buildingStatus === "done"),
          marginTop: 8,
          opacity: (!selectedFile || buildingStatus === "converting" || buildingStatus === "loading") ? 0.5 : 1,
        }}
      >
        {buildingStatus === "converting" ? "Converting to SDF..."
          : buildingStatus === "loading" ? "Loading into Gazebo..."
          : buildingStatus === "done" ? "Reload Building"
          : "Convert & Load"}
      </button>

      {buildingStatus === "done" && (
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 4, background: "rgba(52, 211, 153, 0.08)", border: "1px solid rgba(52, 211, 153, 0.2)" }}>
          <div style={{ fontSize: 10, color: "var(--green)", fontWeight: 600 }}>
            Building loaded in Gazebo
          </div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
            {modelCount} models in scene
          </div>
        </div>
      )}

      {buildingStatus === "error" && (
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 4, background: "rgba(248, 113, 113, 0.08)", border: "1px solid rgba(248, 113, 113, 0.2)" }}>
          <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 600 }}>Error</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{buildingError}</div>
        </div>
      )}

      <div style={labelStyle}>View Options</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <button onClick={() => { setViewMode("2d"); window.dispatchEvent(new CustomEvent("toggle-2d", { detail: { active: true } })); }} style={btnStyle(viewMode === "2d")}>
          2D Plan
        </button>
        <button onClick={() => { setViewMode("3d"); window.dispatchEvent(new CustomEvent("toggle-3d", { detail: { active: true } })); }} style={btnStyle(viewMode === "3d")}>
          3D View
        </button>
      </div>

      <div style={labelStyle}>Floor</div>
      <select
        value=""
        onChange={(e) => window.dispatchEvent(new CustomEvent("select-floor", { detail: { floor: e.target.value } }))}
        style={inputStyle}
      >
        <option value="All">All Floors</option>
        {modelNames.filter(n => n.includes("/")).map(n => {
          const match = n.match(/\/(\w+?)_/);
          return match ? match[1] : null;
        }).filter((v, i, a) => v && a.indexOf(v) === i).map(f => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>

      <div style={labelStyle}>Wall Mode</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <button onClick={() => { setWallMode("full"); window.dispatchEvent(new CustomEvent("wall-mode", { detail: { mode: "Full Wall" } })); }} style={btnStyle(wallMode === "full")}>
          Full Wall
        </button>
        <button onClick={() => { setWallMode("half"); window.dispatchEvent(new CustomEvent("wall-mode", { detail: { mode: "Half Wall" } })); }} style={btnStyle(wallMode === "half")}>
          Half Wall
        </button>
      </div>
    </div>
  );

  const spawnRobot = () => {
    // Activate Sim View if not already
    if (!simActive) {
      activateSimView();
    }
    const name = `${selectedRobot}_${Date.now()}`;
    fpvRobotRef.current = name; // track latest robot for FPV
    const params = { model: selectedRobot, name, x: robotX, y: robotY, z: 0.15, yaw: robotYaw };
    sendCommand("spawn_robot", { params });
    // Tell viewer which 3D model to use for this robot
    window.dispatchEvent(new CustomEvent("gazebo-robot-model", {
      detail: { namePattern: name, model: robotAppearance },
    }));
    // Update drive topic to match the robot's diff-drive plugin topic
    const newTopic = `/model/${name}/cmd_vel`;
    setDriveTopic(newTopic);
    keyDriveRef.current.topic = newTopic; // update ref for active keyboard drive
  };

  const renderRobot = () => (
    <div>
      <div style={labelStyle}>Select Robot</div>
      <select
        value={selectedRobot}
        onChange={(e) => setSelectedRobot(e.target.value)}
        style={inputStyle}
      >
        {robotModels.length > 0 ? (
          robotModels.map((m) => (
            <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
          ))
        ) : (
          <>
            <option value="simple_robot">Simple Robot (Diff-Drive)</option>
            <option value="quadrotor" disabled>Quadrotor (coming soon)</option>
          </>
        )}
      </select>

      <div style={labelStyle}>Spawn Position</div>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={subLabelStyle}>X (m)</div>
          <input type="number" step="0.5" value={robotX} onChange={(e) => setRobotX(parseFloat(e.target.value))} style={smallInputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={subLabelStyle}>Y (m)</div>
          <input type="number" step="0.5" value={robotY} onChange={(e) => setRobotY(parseFloat(e.target.value))} style={smallInputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={subLabelStyle}>Yaw</div>
          <input type="number" step="0.5" value={robotYaw} onChange={(e) => setRobotYaw(parseFloat(e.target.value))} style={smallInputStyle} />
        </div>
      </div>

      <button onClick={spawnRobot} style={{ ...btnFullStyle(), marginTop: 8 }}>
        Spawn Robot
      </button>

      <div style={labelStyle}>Drive Control</div>
      <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 6 }}>
        Topic: {driveTopic}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        <div />
        <button onClick={() => sendCommand("drive_robot", { topic: driveTopic, linear: 0.5, angular: 0 })} style={btnStyle()}>
          ▲
        </button>
        <div />
        <button onClick={() => sendCommand("drive_robot", { topic: driveTopic, linear: 0, angular: 0.5 })} style={btnStyle()}>
          ◄
        </button>
        <button onClick={() => sendCommand("drive_robot", { topic: driveTopic, linear: 0, angular: 0 })} style={btnStyle()}>
          ■
        </button>
        <button onClick={() => sendCommand("drive_robot", { topic: driveTopic, linear: 0, angular: -0.5 })} style={btnStyle()}>
          ►
        </button>
        <div />
        <button onClick={() => sendCommand("drive_robot", { topic: driveTopic, linear: -0.5, angular: 0 })} style={btnStyle()}>
          ▼
        </button>
        <div />
      </div>
      <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 6, textAlign: "center" }}>
        ▲ Forward &ensp; ▼ Backward &ensp; ◄► Turn &ensp; ■ Stop
      </div>

      <div style={labelStyle}>Keyboard Drive</div>
      <button
        onClick={() => keyDriveActive ? stopKeyDrive() : startKeyDrive()}
        style={{
          ...btnFullStyle(keyDriveActive),
          background: keyDriveActive ? "rgba(52, 211, 153, 0.2)" : undefined,
          borderColor: keyDriveActive ? "rgba(52, 211, 153, 0.5)" : undefined,
          color: keyDriveActive ? "var(--green)" : undefined,
        }}
      >
        {keyDriveActive ? "🎮 WASD Active — Press ESC to stop" : "🎮 Enable WASD Keyboard Drive"}
      </button>
      {keyDriveActive && (
        <div style={{
          marginTop: 6, padding: "8px", borderRadius: 4,
          background: "rgba(52, 211, 153, 0.06)", border: "1px solid rgba(52, 211, 153, 0.15)",
          fontSize: 10, color: "var(--text-dim)", lineHeight: 1.6,
        }}>
          <div><b style={{ color: "var(--green)" }}>W</b> Forward &ensp; <b style={{ color: "var(--green)" }}>S</b> Backward</div>
          <div><b style={{ color: "var(--green)" }}>A</b> Turn Left &ensp; <b style={{ color: "var(--green)" }}>D</b> Turn Right</div>
          <div><b style={{ color: "var(--green)" }}>Q</b> Curve Left &ensp; <b style={{ color: "var(--green)" }}>E</b> Curve Right</div>
          <div><b style={{ color: "var(--text-dim)" }}>ESC</b> Stop</div>
        </div>
      )}
      <div style={labelStyle}>Camera View</div>
      <button
        onClick={() => {
          const next = !fpvActive;
          setFpvActive(next);
          window.dispatchEvent(new CustomEvent("robot-fpv", {
            detail: { enabled: next, robotName: fpvRobotRef.current },
          }));
          // Auto-enable keyboard drive in FPV mode
          if (next && !keyDriveActive) startKeyDrive();
        }}
        style={{
          ...btnFullStyle(fpvActive),
          background: fpvActive ? "rgba(251, 191, 36, 0.2)" : undefined,
          borderColor: fpvActive ? "rgba(251, 191, 36, 0.5)" : undefined,
          color: fpvActive ? "var(--yellow)" : undefined,
        }}
      >
        {fpvActive ? "📹 Robot View ON — Click to exit" : "📹 Robot First-Person View"}
      </button>
      {fpvActive && (
        <div style={{ marginTop: 4, fontSize: 9, color: "var(--yellow)", textAlign: "center" }}>
          Camera follows robot — use WASD to drive
        </div>
      )}
    </div>
  );

  const tabRenderers = {
    building: renderBuilding,
    robot: renderRobot,
    sim: renderSim,
    spawn: renderSpawn,
    entity: renderEntity,
    view: renderView,
    physics: renderPhysics,
    export: renderExport,
  };

  return (
    <div style={{
      position: "fixed",
      top: 48,
      left: 0,
      bottom: 0,
      width: collapsed ? 36 : 260,
      display: "flex",
      flexDirection: "column",
      zIndex: 800,
      background: "var(--panel)",
      borderRight: "1px solid var(--panel-border)",
      fontFamily: '"Inter", "JetBrains Mono", ui-sans-serif, system-ui, sans-serif',
      transition: "width 0.15s",
    }}>
      {/* ── Tab Bar (horizontal, scrollable) ── */}
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        borderBottom: "1px solid var(--panel-border)",
        flexShrink: 0,
      }}>
        {/* Wrapping tabs */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          flex: 1,
          gap: 1,
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (activeTab === tab.id && !collapsed) {
                  setCollapsed(true);
                } else {
                  setActiveTab(tab.id);
                  setCollapsed(false);
                }
              }}
              title={tab.label}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: collapsed ? "6px 8px" : "6px 10px",
                border: "none",
                borderBottom: activeTab === tab.id && !collapsed ? "2px solid var(--accent)" : "2px solid transparent",
                background: activeTab === tab.id && !collapsed ? "rgba(0, 212, 255, 0.06)" : "transparent",
                color: activeTab === tab.id && !collapsed ? "var(--accent)" : "var(--text-dim)",
                fontSize: 10,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "all 0.12s",
              }}
            >
              <span style={{ fontSize: 13 }}>{tab.icon}</span>
              {!collapsed && <span>{tab.label}</span>}
            </button>
          ))}
        </div>

      </div>

      {/* ── Panel Content ── */}
      {!collapsed && (
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 14px",
        }}>
          {/* Not connected state */}
          {!connected ? (
            <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6, padding: "16px 0" }}>
              <div style={{ color: "var(--red)", fontWeight: 600, marginBottom: 8 }}>Disconnected</div>
              Waiting for Gazebo bridge on ws://localhost:9090
              <br /><br />
              Run <code style={{ color: "var(--accent)", fontWeight: 500 }}>launch_gazebo.sh</code> in WSL2
            </div>
          ) : (
            tabRenderers[activeTab]?.()
          )}
        </div>
      )}
    </div>
  );
}

import { NextResponse } from "next/server";
import { existsSync } from "fs";
import path from "path";
import { exec } from "child_process";

const BACKEND_DIR = path.join(process.cwd(), "..", "backend");
const SDF_PATH = path.join(BACKEND_DIR, "json", "building.sdf");
const WSL_SDF_PATH = "/home/jchoi/gazebo/worlds/building.sdf";

function winToWslPath(winPath) {
  // C:\Users\... → /mnt/c/Users/...
  const normalized = winPath.replace(/\\/g, "/");
  return normalized.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
}

export async function POST() {
  try {
    if (!existsSync(SDF_PATH)) {
      return NextResponse.json(
        { error: "building.sdf not found. Run SDF export first." },
        { status: 400 }
      );
    }

    const wslSrc = winToWslPath(SDF_PATH);

    // Copy SDF to WSL2
    await new Promise((resolve, reject) => {
      const cmd = `wsl.exe -d Ubuntu-24.04 -- cp "${wslSrc}" "${WSL_SDF_PATH}"`;
      console.log("[gazebo-load] Copy cmd:", cmd);
      exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
        if (err) {
          console.error("[gazebo-load] Copy error:", stderr, err.message);
          reject(new Error(`Copy failed: ${stderr || err.message}`));
        } else {
          console.log("[gazebo-load] Copy OK");
          resolve(stdout);
        }
      });
    });

    // Send load_world command to bridge from within WSL2 (avoids cross-OS WebSocket issues)
    const loadId = `load_${Date.now()}`;
    const loaderScript = "/home/jchoi/gazebo/load_world.py";

    const sceneJson = await new Promise((resolve, reject) => {
      const cmd = `wsl.exe -d Ubuntu-24.04 -- python3 ${loaderScript} "${WSL_SDF_PATH}" "${loadId}"`;
      console.log("[gazebo-load] Running:", cmd);
      exec(cmd, { timeout: 40000 }, (err, stdout, stderr) => {
        if (err) {
          console.error("[gazebo-load] Load error:", stderr, err.message);
          reject(new Error(`Load failed: ${stderr || err.message}`));
        } else {
          console.log("[gazebo-load] Got response:", stdout.substring(0, 200));
          resolve(stdout.trim());
        }
      });
    });

    const scene = JSON.parse(sceneJson);
    if (scene.error) {
      return NextResponse.json({ error: scene.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      scene,
      message: `Loaded ${scene.models?.length || 0} models into Gazebo`,
    });
  } catch (err) {
    console.error("[gazebo-load] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

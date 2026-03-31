import { NextResponse } from "next/server";
import { existsSync, copyFileSync } from "fs";
import path from "path";
import { exec } from "child_process";

const BACKEND_DIR = path.join(process.cwd(), "..", "backend");
const SDF_PATH = path.join(BACKEND_DIR, "json", "building.sdf");

const IS_WSL = process.platform === "win32";
const GAZEBO_DIR = IS_WSL ? "/home/jchoi/gazebo" : "/opt/uspace/gazebo";
const WSL_SDF_PATH = `${GAZEBO_DIR}/worlds/building.sdf`;

function winToWslPath(winPath) {
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

    if (IS_WSL) {
      // Windows + WSL2 path
      const wslSrc = winToWslPath(SDF_PATH);
      await new Promise((resolve, reject) => {
        const cmd = `wsl.exe -d Ubuntu-24.04 -- cp "${wslSrc}" "${WSL_SDF_PATH}"`;
        console.log("[gazebo-load] Copy cmd:", cmd);
        exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
          if (err) reject(new Error(`Copy failed: ${stderr || err.message}`));
          else { console.log("[gazebo-load] Copy OK"); resolve(stdout); }
        });
      });

      const loadId = `load_${Date.now()}`;
      const loaderScript = `${GAZEBO_DIR}/load_world.py`;
      const sceneJson = await new Promise((resolve, reject) => {
        const cmd = `wsl.exe -d Ubuntu-24.04 -- python3 ${loaderScript} "${WSL_SDF_PATH}" "${loadId}"`;
        console.log("[gazebo-load] Running:", cmd);
        exec(cmd, { timeout: 40000 }, (err, stdout, stderr) => {
          if (err) reject(new Error(`Load failed: ${stderr || err.message}`));
          else { console.log("[gazebo-load] Got response:", stdout.substring(0, 200)); resolve(stdout.trim()); }
        });
      });

      const scene = JSON.parse(sceneJson);
      if (scene.error) return NextResponse.json({ error: scene.error }, { status: 500 });
      return NextResponse.json({ success: true, scene, message: `Loaded ${scene.models?.length || 0} models into Gazebo` });
    } else {
      // Native Linux path
      copyFileSync(SDF_PATH, WSL_SDF_PATH);
      console.log("[gazebo-load] Copied SDF to", WSL_SDF_PATH);

      const loadId = `load_${Date.now()}`;
      const loaderScript = `${GAZEBO_DIR}/load_world.py`;
      const sceneJson = await new Promise((resolve, reject) => {
        const cmd = `python3 ${loaderScript} "${WSL_SDF_PATH}" "${loadId}"`;
        console.log("[gazebo-load] Running:", cmd);
        exec(cmd, { timeout: 40000 }, (err, stdout, stderr) => {
          if (err) reject(new Error(`Load failed: ${stderr || err.message}`));
          else { console.log("[gazebo-load] Got response:", stdout.substring(0, 200)); resolve(stdout.trim()); }
        });
      });

      const scene = JSON.parse(sceneJson);
      if (scene.error) return NextResponse.json({ error: scene.error }, { status: 500 });
      return NextResponse.json({ success: true, scene, message: `Loaded ${scene.models?.length || 0} models into Gazebo` });
    }
  } catch (err) {
    console.error("[gazebo-load] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

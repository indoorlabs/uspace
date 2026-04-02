#!/usr/bin/env python3
"""
Gazebo - WebSocket bridge.
Runs inside WSL2, subscribes to gz-transport topics via 'gz topic' CLI,
and serves pose/stats data to the browser over WebSocket on port 9090.
"""

import asyncio
import json
import subprocess
import sys
import time
import os
import signal
import math
import re
import xml.etree.ElementTree as ET

try:
    import websockets
except ImportError:
    print("Installing websockets...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
    import websockets

WS_PORT = 9090
WORLD_NAME = "uspace_world"
THROTTLE_HZ = 30
THROTTLE_INTERVAL = 1.0 / THROTTLE_HZ
SDF_DIR = "/home/jchoi/gazebo/worlds"

# Track connected clients
clients = set()
# Latest state
latest_poses = None
latest_stats = None
last_send_time = 0
# Scene info parsed from SDF
current_scene = None
# Gazebo process
gz_proc = None
# Async tasks for topic readers
pose_task = None
stats_task = None


def parse_sdf_scene(sdf_path):
    """Parse SDF file to extract model info for the browser."""
    try:
        tree = ET.parse(sdf_path)
        root = tree.getroot()
        world = root.find("world")
        if world is None:
            return None

        models = []
        for model in world.findall("model"):
            name = model.get("name", "")
            if name in ("ground_plane",):
                continue

            static = model.find("static")
            is_static = static is not None and static.text.strip().lower() == "true"

            # For the building model, extract links as sub-models
            links = model.findall("link")
            if len(links) > 1 and is_static:
                # Complex building model - parse each link
                for link in links:
                    link_name = link.get("name", "")
                    visual = link.find("visual")
                    if visual is None:
                        continue

                    # Get pose
                    pose_el = link.find("pose")
                    pose = [0, 0, 0, 0, 0, 0]
                    if pose_el is not None and pose_el.text:
                        parts = pose_el.text.strip().split()
                        pose = [float(p) for p in parts]

                    # Get color from material
                    color = [0.5, 0.5, 0.5]
                    mat = visual.find("material")
                    if mat is not None:
                        diffuse = mat.find("diffuse")
                        if diffuse is not None and diffuse.text:
                            parts = diffuse.text.strip().split()
                            color = [float(parts[0]), float(parts[1]), float(parts[2])]

                    # Get geometry type and dimensions
                    geom = visual.find("geometry")
                    shape_info = {"shape": "box", "size": [1, 1, 1]}

                    if geom is not None:
                        polyline = geom.find("polyline")
                        box = geom.find("box")
                        sphere = geom.find("sphere")

                        if polyline is not None:
                            # Extract polyline points and height
                            points = []
                            for pt in polyline.findall("point"):
                                if pt.text:
                                    xy = pt.text.strip().split()
                                    points.append([float(xy[0]), float(xy[1])])
                            height_el = polyline.find("height")
                            h = float(height_el.text) if height_el is not None else 1.0
                            shape_info = {
                                "shape": "polyline",
                                "points": points,
                                "height": h,
                            }
                        elif box is not None:
                            size_el = box.find("size")
                            if size_el is not None and size_el.text:
                                s = size_el.text.strip().split()
                                shape_info = {"shape": "box", "size": [float(x) for x in s]}
                        elif sphere is not None:
                            radius_el = sphere.find("radius")
                            r = float(radius_el.text) if radius_el is not None else 0.5
                            shape_info = {"shape": "sphere", "radius": r}

                    models.append({
                        "name": f"{name}/{link_name}",
                        "static": True,
                        "pose": pose,
                        "color": color,
                        **shape_info,
                    })
            else:
                # Simple model (single link)
                pose_el = model.find("pose")
                pose = [0, 0, 0, 0, 0, 0]
                if pose_el is not None and pose_el.text:
                    parts = pose_el.text.strip().split()
                    pose = [float(p) for p in parts]

                link = links[0] if links else None
                color = [0.5, 0.5, 0.5]
                shape_info = {"shape": "box", "size": [1, 1, 1]}

                if link is not None:
                    visual = link.find("visual")
                    if visual is not None:
                        mat = visual.find("material")
                        if mat is not None:
                            diffuse = mat.find("diffuse")
                            if diffuse is None:
                                diffuse = mat.find("ambient")
                            if diffuse is not None and diffuse.text:
                                parts = diffuse.text.strip().split()
                                color = [float(parts[0]), float(parts[1]), float(parts[2])]

                        geom = visual.find("geometry")
                        if geom is not None:
                            box = geom.find("box")
                            sphere = geom.find("sphere")
                            if box is not None:
                                size_el = box.find("size")
                                if size_el is not None and size_el.text:
                                    s = size_el.text.strip().split()
                                    shape_info = {"shape": "box", "size": [float(x) for x in s]}
                            elif sphere is not None:
                                radius_el = sphere.find("radius")
                                r = float(radius_el.text) if radius_el is not None else 0.5
                                shape_info = {"shape": "sphere", "radius": r}

                models.append({
                    "name": name,
                    "static": is_static,
                    "pose": pose,
                    "color": color,
                    **shape_info,
                })

        return {
            "type": "scene",
            "world": WORLD_NAME,
            "models": models,
        }
    except Exception as e:
        print(f"[bridge] SDF parse error: {e}", flush=True)
        return None


def parse_pose_v_text(text):
    """Parse gz topic pose output (text protobuf format) into list of models.
    Supports both dynamic_pose/info and pose/info formats."""
    models = []
    current_model = None
    in_position = False
    in_orientation = False
    depth = 0  # track brace nesting

    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue

        # Track nesting depth
        if "{" in line:
            depth += line.count("{")
        if "}" in line:
            depth -= line.count("}")

        if line.startswith("name:"):
            name = line.split('"')[1] if '"' in line else line.split(":")[1].strip()
            if name in ("ground_plane", "building"):
                current_model = None
                continue
            # Skip header/stamp names
            if name in ("header", "stamp"):
                continue
            current_model = {
                "name": name,
                "position": {"x": 0, "y": 0, "z": 0},
                "orientation": {"x": 0, "y": 0, "z": 0, "w": 1},
            }
            models.append(current_model)
            in_position = False
            in_orientation = False
        elif current_model is not None:
            if "position {" in line or "position{" in line:
                in_position = True
                in_orientation = False
            elif "orientation {" in line or "orientation{" in line:
                in_orientation = True
                in_position = False
            elif line == "}":
                if in_position:
                    in_position = False
                elif in_orientation:
                    in_orientation = False
            elif ":" in line and line[0] in "xyzw":
                key = line[0]
                try:
                    val = float(line.split(":")[1].strip())
                except ValueError:
                    continue
                if in_position:
                    current_model["position"][key] = val
                elif in_orientation:
                    current_model["orientation"][key] = val

    return models


async def gz_pose_reader():
    """Read pose data from gz topic subprocess."""
    global latest_poses

    cmd = f"stdbuf -oL gz topic -e -t /world/{WORLD_NAME}/dynamic_pose/info"
    print(f"[bridge] Starting pose reader: {cmd}", flush=True)

    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        buffer = ""
        logged = False

        while True:
            chunk = await proc.stdout.read(4096)
            if not chunk:
                break
            buffer += chunk.decode("utf-8", errors="replace")

            while "\n\n" in buffer:
                msg, buffer = buffer.split("\n\n", 1)
                if msg.strip():
                    models = parse_pose_v_text(msg)
                    if models:
                        latest_poses = {
                            "type": "poses",
                            "timestamp": time.time(),
                            "models": models,
                        }
                        if not logged:
                            print(f"[bridge] Pose reader got {len(models)} models", flush=True)
                            logged = True
    except asyncio.CancelledError:
        proc.terminate()
        raise
    except Exception as e:
        print(f"[bridge] Pose reader error: {e}", flush=True)


async def gz_stats_reader():
    """Read simulation stats from gz topic subprocess."""
    global latest_stats

    cmd = f"stdbuf -oL gz topic -e -t /world/{WORLD_NAME}/stats"
    print(f"[bridge] Starting stats reader: {cmd}", flush=True)

    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        buffer = ""
        logged = False

        while True:
            chunk = await proc.stdout.read(4096)
            if not chunk:
                break
            buffer += chunk.decode("utf-8", errors="replace")

            while "\n\n" in buffer:
                msg, buffer = buffer.split("\n\n", 1)
                if not msg.strip():
                    continue

                stats = {"paused": False}  # default: not paused (Gazebo omits field when running)
                for line in msg.split("\n"):
                    line = line.strip()
                    if line.startswith("paused:"):
                        stats["paused"] = "true" in line.lower()
                    elif line.startswith("iterations:"):
                        try:
                            stats["iterations"] = int(line.split(":")[1].strip())
                        except ValueError:
                            pass
                    elif line.startswith("real_time_factor:"):
                        try:
                            stats["realTimeFactor"] = float(line.split(":")[1].strip())
                        except ValueError:
                            pass

                if stats:
                    latest_stats = {"type": "stats", **stats}
                    if not logged:
                        print(f"[bridge] Stats reader got data: {stats}", flush=True)
                        logged = True
    except asyncio.CancelledError:
        proc.terminate()
        raise
    except Exception as e:
        print(f"[bridge] Stats reader error: {e}", flush=True)


async def broadcast_loop():
    """Broadcast latest data to all connected WebSocket clients at throttled rate."""
    global last_send_time
    logged = False

    print("[bridge] broadcast_loop started", flush=True)
    tick = 0

    while True:
        await asyncio.sleep(THROTTLE_INTERVAL)
        tick += 1

        if tick <= 3:
            print(f"[bridge] broadcast tick={tick}, clients={len(clients)}, poses={latest_poses is not None}, stats={latest_stats is not None}", flush=True)

        if not clients:
            continue

        messages = []
        if latest_poses:
            messages.append(json.dumps(latest_poses))
        if latest_stats:
            messages.append(json.dumps(latest_stats))

        if not logged and messages:
            print(f"[bridge] broadcasting {len(messages)} msg(s) to {len(clients)} client(s)", flush=True)
            logged = True

        if messages:
            dead = set()
            for ws in clients:
                try:
                    for msg in messages:
                        await ws.send(msg)
                except Exception as e:
                    print(f"[bridge] broadcast send error: {e}", flush=True)
                    dead.add(ws)
            clients -= dead


async def start_gazebo(sdf_path, load_id=None):
    """Start Gazebo with the given SDF world file."""
    global gz_proc, pose_task, stats_task, latest_poses, latest_stats, current_scene

    # Kill existing Gazebo
    await stop_gazebo()

    latest_poses = None
    latest_stats = None

    # Clean up previous current_world.sdf if loading a fresh world (not current_world itself)
    current_world_path = f"{SDF_DIR}/current_world.sdf"
    if not sdf_path.endswith("current_world.sdf") and os.path.isfile(current_world_path):
        os.remove(current_world_path)
        print(f"[bridge] Removed old current_world.sdf", flush=True)

    print(f"[bridge] Starting Gazebo with: {sdf_path}", flush=True)

    gz_proc = await asyncio.create_subprocess_exec(
        "gz", "sim", "--headless-rendering", "-s", "-r", sdf_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Wait for Gazebo to initialize
    await asyncio.sleep(4)

    # Parse scene from SDF
    current_scene = parse_sdf_scene(sdf_path)

    # Start topic readers
    pose_task = asyncio.create_task(gz_pose_reader())
    stats_task = asyncio.create_task(gz_stats_reader())

    # Attach load_id so the requesting client can correlate
    if load_id and current_scene:
        current_scene["load_id"] = load_id

    # Send scene to all clients
    if current_scene:
        scene_json = json.dumps(current_scene)
        for ws in clients:
            try:
                await ws.send(scene_json)
            except Exception:
                pass

    print(f"[bridge] Gazebo started, {len(current_scene['models']) if current_scene else 0} models (load_id={load_id})", flush=True)


async def stop_gazebo():
    """Stop Gazebo and topic readers."""
    global gz_proc, pose_task, stats_task

    if pose_task and not pose_task.done():
        pose_task.cancel()
        try:
            await pose_task
        except asyncio.CancelledError:
            pass

    if stats_task and not stats_task.done():
        stats_task.cancel()
        try:
            await stats_task
        except asyncio.CancelledError:
            pass

    if gz_proc and gz_proc.returncode is None:
        print("[bridge] Stopping Gazebo...", flush=True)
        gz_proc.terminate()
        try:
            await asyncio.wait_for(gz_proc.wait(), timeout=5)
        except asyncio.TimeoutError:
            gz_proc.kill()
            await gz_proc.wait()

    # Also kill any lingering gz sim processes
    subprocess.run(["pkill", "-f", "gz sim"], capture_output=True)
    await asyncio.sleep(1)


async def handle_command(data, websocket=None):
    """Handle control commands from browser."""
    action = data.get("action")
    print(f"[bridge] Command: {action}", flush=True)

    try:
        if action == "pause":
            subprocess.Popen([
                "gz", "service", "-s", f"/world/{WORLD_NAME}/control",
                "--reqtype", "gz.msgs.WorldControl",
                "--reptype", "gz.msgs.Boolean",
                "--timeout", "1000",
                "--req", "pause: true",
            ])
        elif action == "play":
            subprocess.Popen([
                "gz", "service", "-s", f"/world/{WORLD_NAME}/control",
                "--reqtype", "gz.msgs.WorldControl",
                "--reptype", "gz.msgs.Boolean",
                "--timeout", "1000",
                "--req", "pause: false",
            ])
        elif action == "reset":
            subprocess.Popen([
                "gz", "service", "-s", f"/world/{WORLD_NAME}/control",
                "--reqtype", "gz.msgs.WorldControl",
                "--reptype", "gz.msgs.Boolean",
                "--timeout", "1000",
                "--req", "reset { all: true }",
            ])
        elif action == "load_world":
            sdf_path = data.get("sdf_path")
            load_id = data.get("load_id")
            if sdf_path and os.path.isfile(sdf_path):
                await start_gazebo(sdf_path, load_id=load_id)
            else:
                print(f"[bridge] SDF file not found: {sdf_path}", flush=True)
                # Send error back to requesting client
                if websocket and load_id:
                    try:
                        await websocket.send(json.dumps({
                            "type": "load_error",
                            "load_id": load_id,
                            "error": f"SDF file not found: {sdf_path}",
                        }))
                    except Exception:
                        pass
        elif action == "step":
            # Single step (run one iteration then pause)
            subprocess.Popen([
                "gz", "service", "-s", f"/world/{WORLD_NAME}/control",
                "--reqtype", "gz.msgs.WorldControl",
                "--reptype", "gz.msgs.Boolean",
                "--timeout", "1000",
                "--req", "multi_step: 1",
            ])
        elif action == "set_physics":
            params = data.get("params", {})
            step_size = params.get("step_size")
            rtf = params.get("rtf")
            gravity = params.get("gravity")
            req_parts = []
            if step_size is not None:
                req_parts.append(f"max_step_size: {step_size}")
            if rtf is not None:
                req_parts.append(f"real_time_factor: {rtf}")
            if gravity is not None:
                req_parts.append(f"gravity {{x: 0 y: 0 z: {gravity}}}")
            if req_parts:
                subprocess.Popen([
                    "gz", "service", "-s", f"/world/{WORLD_NAME}/set_physics",
                    "--reqtype", "gz.msgs.Physics",
                    "--reptype", "gz.msgs.Boolean",
                    "--timeout", "1000",
                    "--req", " ".join(req_parts),
                ])
        elif action == "remove_entity":
            entity_name = data.get("name", "")
            if entity_name:
                subprocess.Popen([
                    "gz", "service", "-s", f"/world/{WORLD_NAME}/remove",
                    "--reqtype", "gz.msgs.Entity",
                    "--reptype", "gz.msgs.Boolean",
                    "--timeout", "1000",
                    "--req", f'name: "{entity_name}" type: MODEL',
                ])
        elif action == "spawn":
            params = data.get("params", {})
            name = params.get("name", f"spawned_{int(time.time())}")
            x = params.get("x", 0)
            y = params.get("y", 0)
            z = params.get("z", 5)
            shape = params.get("shape", "box")
            r = params.get("r", 0.5)
            g = params.get("g", 0.2)
            b = params.get("b", 0.8)

            if shape == "sphere":
                geom_sdf = '<sphere><radius>0.5</radius></sphere>'
                inertia = '<ixx>0.1</ixx><iyy>0.1</iyy><izz>0.1</izz>'
            elif shape == "cylinder":
                geom_sdf = '<cylinder><radius>0.3</radius><length>1.0</length></cylinder>'
                inertia = '<ixx>0.145</ixx><iyy>0.145</iyy><izz>0.045</izz>'
            else:
                geom_sdf = '<box><size>1 1 1</size></box>'
                inertia = '<ixx>0.167</ixx><iyy>0.167</iyy><izz>0.167</izz>'

            sdf_str = (
                '<?xml version="1.0"?>'
                '<sdf version="1.8">'
                f'<model name="{name}">'
                f'<pose>{x} {y} {z} 0 0 0</pose>'
                '<link name="link">'
                '<inertial><mass>1.0</mass>'
                f'<inertia>{inertia}</inertia>'
                '</inertial>'
                f'<collision name="collision"><geometry>{geom_sdf}</geometry></collision>'
                f'<visual name="visual"><geometry>{geom_sdf}</geometry>'
                f'<material><ambient>{r} {g} {b} 1</ambient><diffuse>{r} {g} {b} 1</diffuse></material>'
                '</visual>'
                '</link>'
                '</model>'
                '</sdf>'
            )
            # Write SDF to temp file to avoid quote escaping issues
            sdf_file = f"/tmp/spawn_{name}.sdf"
            with open(sdf_file, "w") as f:
                f.write(sdf_str)
            subprocess.Popen([
                "gz", "service", "-s", f"/world/{WORLD_NAME}/create",
                "--reqtype", "gz.msgs.EntityFactory",
                "--reptype", "gz.msgs.Boolean",
                "--timeout", "1000",
                "--req", f'sdf_filename: "{sdf_file}"',
            ])
        elif action == "spawn_robot":
            # Spawn a robot model from pre-built SDF file
            params = data.get("params", {})
            model = params.get("model", "simple_robot")
            name = params.get("name", f"{model}_{int(time.time())}")
            px = params.get("x", 0)
            py = params.get("y", 0)
            pz = params.get("z", 0.1)
            yaw = params.get("yaw", 0)
            model_path = f"/home/jchoi/gazebo/models/{model}.sdf"
            if os.path.isfile(model_path):
                # Read SDF template and inject name/pose
                with open(model_path, "r") as f:
                    sdf_content = f.read()
                # Replace model name
                sdf_content = re.sub(
                    r'<model name="[^"]*"',
                    f'<model name="{name}"',
                    sdf_content,
                    count=1,
                )
                # Replace pose
                sdf_content = re.sub(
                    r'<pose>[^<]*</pose>',
                    f'<pose>{px} {py} {pz} 0 0 {yaw}</pose>',
                    sdf_content,
                    count=1,
                )
                # Replace cmd_vel topic with unique name
                sdf_content = sdf_content.replace(
                    "/robot/cmd_vel",
                    f"/model/{name}/cmd_vel",
                )
                # Write temp file and spawn
                tmp_path = f"/tmp/spawn_{name}.sdf"
                with open(tmp_path, "w") as f:
                    f.write(sdf_content)
                # Build world SDF from original building + all existing robots + new robot
                # Always start from original building.sdf (not current_world)
                world_sdf_path = None
                for wf in [f"{SDF_DIR}/building.sdf", f"{SDF_DIR}/test_world.sdf"]:
                    if os.path.isfile(wf):
                        world_sdf_path = wf
                        break

                if world_sdf_path:
                    with open(world_sdf_path, "r") as wf:
                        world_sdf = wf.read()

                    # Add existing robots from browser's spawned list
                    existing_robots = params.get("existingRobots", [])
                    for er in existing_robots:
                        er_name = er.get("name", "")
                        er_x = er.get("x", 0)
                        er_y = er.get("y", 0)
                        er_yaw = er.get("yaw", 0)
                        # Build robot SDF for existing robot
                        er_model_path = f"/home/jchoi/gazebo/models/{model}.sdf"
                        if os.path.isfile(er_model_path):
                            with open(er_model_path, "r") as ef:
                                er_sdf = ef.read()
                            er_sdf = re.sub(r'<model name="[^"]*"', f'<model name="{er_name}"', er_sdf, count=1)
                            er_sdf = re.sub(r'<pose>[^<]*</pose>', f'<pose>{er_x} {er_y} 0.15 0 0 {er_yaw}</pose>', er_sdf, count=1)
                            er_sdf = er_sdf.replace("/robot/cmd_vel", f"/model/{er_name}/cmd_vel")
                            er_start = er_sdf.find("<model")
                            er_end = er_sdf.rfind("</model>") + len("</model>")
                            if er_start >= 0 and er_end > er_start:
                                er_model = er_sdf[er_start:er_end]
                                world_sdf = world_sdf.replace("</world>", f"\n    {er_model}\n  </world>")
                                print(f"[bridge] Added existing robot {er_name} at ({er_x:.2f}, {er_y:.2f})", flush=True)

                    # Add new robot
                    with open(tmp_path, "r") as rf:
                        robot_sdf = rf.read()
                    model_start = robot_sdf.find("<model")
                    model_end = robot_sdf.rfind("</model>") + len("</model>")
                    if model_start >= 0 and model_end > model_start:
                        robot_model = robot_sdf[model_start:model_end]
                        new_world = world_sdf.replace("</world>", f"\n    {robot_model}\n  </world>")
                        robot_world_path = f"{SDF_DIR}/current_world.sdf"
                        with open(robot_world_path, "w") as wf:
                            wf.write(new_world)
                        await start_gazebo(robot_world_path)
                        print(f"[bridge] Spawned robot {name} with {len(existing_robots)} existing robots", flush=True)
                    else:
                        print(f"[bridge] Could not extract robot model from SDF", flush=True)
                else:
                    print(f"[bridge] No world SDF found to inject robot into", flush=True)
            else:
                print(f"[bridge] Robot model not found: {model_path}", flush=True)
        elif action == "list_robots":
            # List available robot models
            models_dir = "/home/jchoi/gazebo/models"
            robots = []
            if os.path.isdir(models_dir):
                for f in os.listdir(models_dir):
                    if f.endswith(".sdf"):
                        robots.append(f.replace(".sdf", ""))
            if websocket:
                try:
                    await websocket.send(json.dumps({
                        "type": "robot_models",
                        "models": robots,
                    }))
                except Exception:
                    pass
        elif action == "drive_robot":
            # Send velocity command to a diff-drive robot
            topic = data.get("topic", "/robot/cmd_vel")
            linear = data.get("linear", 0)
            angular = data.get("angular", 0)
            print(f"[bridge] drive_robot topic={topic} linear={linear} angular={angular}", flush=True)
            subprocess.Popen([
                "gz", "topic", "-t", topic,
                "-m", "gz.msgs.Twist", "-p",
                f'linear {{x: {linear}}} angular {{z: {angular}}}',
            ])
        elif action == "move_entity":
            # Teleport entity to new pose with optional orientation
            name = data.get("name", "")
            px = data.get("x", 0)
            py = data.get("y", 0)
            pz = data.get("z", 0)
            qx = data.get("qx")
            qy = data.get("qy")
            qz = data.get("qz")
            qw = data.get("qw")
            if name:
                req = f'name: "{name}" position {{x: {px} y: {py} z: {pz}}}'
                if qw is not None:
                    req += f' orientation {{x: {qx} y: {qy} z: {qz} w: {qw}}}'
                subprocess.Popen([
                    "gz", "service", "-s", f"/world/{WORLD_NAME}/set_pose",
                    "--reqtype", "gz.msgs.Pose",
                    "--reptype", "gz.msgs.Boolean",
                    "--timeout", "1000",
                    "--req", req,
                ])
        elif action == "apply_force":
            # Apply force/wrench to entity link (repeated for visible effect)
            name = data.get("name", "")
            fx = data.get("fx", 0)
            fy = data.get("fy", 0)
            fz = data.get("fz", 0)
            if name:
                # Use link name format: "model_name::link"
                link_name = f"{name}::link"
                for _ in range(10):
                    subprocess.Popen([
                        "gz", "topic", "-t", f"/world/{WORLD_NAME}/wrench",
                        "-m", "gz.msgs.EntityWrench", "-p",
                        f'entity {{name: "{link_name}" type: LINK}} '
                        f'wrench {{force {{x: {fx} y: {fy} z: {fz}}}}}',
                    ])
        elif action == "add_light":
            params = data.get("params", {})
            lname = params.get("name", f"light_{int(time.time())}")
            ltype = params.get("type", "point")  # point, spot, directional
            lx = params.get("x", 0)
            ly = params.get("y", 0)
            lz = params.get("z", 8)
            lr = params.get("r", 1.0)
            lg = params.get("g", 1.0)
            lb = params.get("b", 1.0)
            intensity = params.get("intensity", 1.0)
            cast_shadows = "true" if params.get("cast_shadows", True) else "false"
            light_sdf = (
                '<?xml version="1.0"?>'
                '<sdf version="1.8">'
                f'<light type="{ltype}" name="{lname}">'
                f'<pose>{lx} {ly} {lz} 0 0 0</pose>'
                f'<cast_shadows>{cast_shadows}</cast_shadows>'
                f'<diffuse>{lr * intensity} {lg * intensity} {lb * intensity} 1</diffuse>'
                f'<specular>{lr * 0.3} {lg * 0.3} {lb * 0.3} 1</specular>'
                '<attenuation><range>50</range>'
                '<constant>0.5</constant><linear>0.01</linear><quadratic>0.001</quadratic>'
                '</attenuation>'
            )
            if ltype == "directional":
                light_sdf += '<direction>-0.5 0.1 -0.9</direction>'
            elif ltype == "spot":
                light_sdf += '<direction>0 0 -1</direction>'
                light_sdf += '<spot><inner_angle>0.6</inner_angle><outer_angle>1.0</outer_angle><falloff>1.0</falloff></spot>'
            light_sdf += '</light></sdf>'
            sdf_file = f"/tmp/light_{lname}.sdf"
            with open(sdf_file, "w") as f:
                f.write(light_sdf)
            subprocess.Popen([
                "gz", "service", "-s", f"/world/{WORLD_NAME}/create",
                "--reqtype", "gz.msgs.EntityFactory",
                "--reptype", "gz.msgs.Boolean",
                "--timeout", "1000",
                "--req", f'sdf_filename: "{sdf_file}"',
            ])
        elif action == "set_wind":
            wx = data.get("x", 0)
            wy = data.get("y", 0)
            wz = data.get("z", 0)
            subprocess.Popen([
                "gz", "topic", "-t", f"/world/{WORLD_NAME}/wind",
                "-m", "gz.msgs.Wind", "-p",
                f'enable_wind: true linear_velocity {{x: {wx} y: {wy} z: {wz}}}',
            ])
        elif action == "toggle_collision":
            name = data.get("name", "")
            enable = data.get("enable", True)
            svc = "enable_collision" if enable else "disable_collision"
            if name:
                subprocess.Popen([
                    "gz", "service", "-s", f"/world/{WORLD_NAME}/{svc}",
                    "--reqtype", "gz.msgs.Entity",
                    "--reptype", "gz.msgs.Boolean",
                    "--timeout", "1000",
                    "--req", f'name: "{name}" type: MODEL',
                ])
        elif action == "save_world":
            # Generate world SDF and send to requesting client
            proc = subprocess.run(
                ["gz", "service", "-s", f"/world/{WORLD_NAME}/generate_world_sdf",
                 "--reqtype", "gz.msgs.SdfGeneratorConfig",
                 "--reptype", "gz.msgs.StringMsg",
                 "--timeout", "5000",
                 "--req", ""],
                capture_output=True, text=True, timeout=10,
            )
            if websocket:
                try:
                    await websocket.send(json.dumps({
                        "type": "world_sdf",
                        "data": proc.stdout,
                    }))
                except Exception:
                    pass
        elif action == "clone_entity":
            name = data.get("name", "")
            if name:
                new_name = f"{name}_clone_{int(time.time())}"
                subprocess.Popen([
                    "gz", "service", "-s", f"/world/{WORLD_NAME}/create",
                    "--reqtype", "gz.msgs.EntityFactory",
                    "--reptype", "gz.msgs.Boolean",
                    "--timeout", "1000",
                    "--req", f'clone_name: "{name}" name: "{new_name}"',
                ])
        elif action == "scene_graph":
            # Get scene hierarchy
            proc = subprocess.run(
                ["gz", "service", "-s", f"/world/{WORLD_NAME}/scene/graph",
                 "--reqtype", "gz.msgs.Empty",
                 "--reptype", "gz.msgs.StringMsg",
                 "--timeout", "3000",
                 "--req", ""],
                capture_output=True, text=True, timeout=5,
            )
            if websocket:
                try:
                    await websocket.send(json.dumps({
                        "type": "scene_graph",
                        "data": proc.stdout,
                    }))
                except Exception:
                    pass
        elif action == "video_record":
            start = data.get("start", True)
            subprocess.Popen([
                "gz", "topic", "-t", "/gui/record_video",
                "-m", "gz.msgs.VideoRecord", "-p",
                f'start: {"true" if start else "false"} '
                f'format: "mp4" save_filename: "/tmp/gazebo_recording.mp4"',
            ])
    except Exception as e:
        print(f"[bridge] Command error: {e}", flush=True)


async def client_sender(websocket):
    """Send pose/stats data to a single client at throttled rate."""
    try:
        while True:
            await asyncio.sleep(THROTTLE_INTERVAL)
            messages = []
            if latest_poses:
                messages.append(json.dumps(latest_poses))
            if latest_stats:
                messages.append(json.dumps(latest_stats))
            for msg in messages:
                await websocket.send(msg)
    except Exception:
        pass


async def ws_handler(websocket, path=None):
    """Handle a WebSocket connection."""
    clients.add(websocket)
    remote = getattr(websocket, "remote_address", "unknown")
    print(f"[bridge] Client connected: {remote} (total: {len(clients)})", flush=True)

    # Send current scene info
    if current_scene:
        await websocket.send(json.dumps(current_scene))

    # Start per-client sender task
    sender_task = asyncio.create_task(client_sender(websocket))

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                await handle_command(data, websocket=websocket)
            except json.JSONDecodeError:
                pass
    except Exception:
        pass
    finally:
        sender_task.cancel()
        clients.discard(websocket)
        print(f"[bridge] Client disconnected: {remote} (total: {len(clients)})", flush=True)


async def main():
    print(f"[bridge] Gazebo WebSocket Bridge starting on port {WS_PORT}", flush=True)
    print(f"[bridge] World: {WORLD_NAME}", flush=True)

    # Start with test world if it exists
    test_world = os.path.join(SDF_DIR, "test_world.sdf")
    if os.path.isfile(test_world):
        await start_gazebo(test_world)
    else:
        print(f"[bridge] No default world found at {test_world}", flush=True)

    # broadcast_loop replaced by per-client sender in ws_handler

    # Start WebSocket server
    server = await websockets.serve(ws_handler, "0.0.0.0", WS_PORT)
    print(f"[bridge] WebSocket server listening on ws://0.0.0.0:{WS_PORT}", flush=True)

    await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[bridge] Shutting down...", flush=True)

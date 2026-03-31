#!/usr/bin/env python3
"""
Send a load_world command to gz_bridge.py and wait for the new scene.
Usage: python3 load_world.py <sdf_path> [load_id]
"""
import asyncio
import json
import sys

async def main():
    try:
        import websockets
    except ImportError:
        print(json.dumps({"error": "websockets not installed"}))
        sys.exit(1)

    sdf_path = sys.argv[1]
    load_id = sys.argv[2] if len(sys.argv) > 2 else f"load_{id(sdf_path)}"

    try:
        async with websockets.connect("ws://localhost:9090") as ws:
            # Drain initial cached scene sent on connect
            try:
                await asyncio.wait_for(ws.recv(), timeout=3)
            except asyncio.TimeoutError:
                pass

            # Send load_world command
            await ws.send(json.dumps({
                "action": "load_world",
                "sdf_path": sdf_path,
                "load_id": load_id,
            }))

            # Wait for scene with matching load_id (Gazebo restart takes ~5s)
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=25)
                msg = json.loads(raw)
                if msg.get("type") == "scene" and msg.get("load_id") == load_id:
                    print(json.dumps(msg))
                    return
                if msg.get("type") == "load_error" and msg.get("load_id") == load_id:
                    print(json.dumps({"error": msg.get("error")}))
                    sys.exit(1)

    except asyncio.TimeoutError:
        print(json.dumps({"error": "Timeout waiting for Gazebo scene"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())

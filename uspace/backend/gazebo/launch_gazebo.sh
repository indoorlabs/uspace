#!/bin/bash
# Launch Gazebo Harmonic headless server + WebSocket bridge
# Run this script inside WSL2

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORLD_FILE="$SCRIPT_DIR/worlds/test_world.sdf"

echo "=== uSpace Gazebo Bridge ==="
echo "World: $WORLD_FILE"

# Start Gazebo headless server in background
echo "[1/2] Starting Gazebo server (headless)..."
gz sim --headless-rendering -s -r "$WORLD_FILE" &
GZ_PID=$!
echo "  Gazebo PID: $GZ_PID"

# Wait for Gazebo to be ready
sleep 3
echo "  Checking topics..."
gz topic -l 2>/dev/null | head -5

# Start WebSocket bridge
echo "[2/2] Starting WebSocket bridge on port 9090..."
python3 "$SCRIPT_DIR/gz_bridge.py" &
BRIDGE_PID=$!
echo "  Bridge PID: $BRIDGE_PID"

echo ""
echo "=== Running ==="
echo "  Gazebo server: PID $GZ_PID"
echo "  WS bridge:     PID $BRIDGE_PID (ws://localhost:9090)"
echo ""
echo "Press Ctrl+C to stop both."

# Trap Ctrl+C to kill both
trap "echo 'Shutting down...'; kill $GZ_PID $BRIDGE_PID 2>/dev/null; exit 0" INT TERM

# Wait for either to exit
wait

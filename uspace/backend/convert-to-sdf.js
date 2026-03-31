/**
 * SemanticModel JSON → SDF (Simulation Description Format) Converter
 * Generates Gazebo-compatible SDF world files from building data.
 *
 * Usage: node convert-to-sdf.js [input.json] [output.sdf]
 */

const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2] || path.join(__dirname, "json/0310_Simple2_SemanticModel.json");
const outputPath = process.argv[3] || path.join(__dirname, "json/building.sdf");

const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

const SCALE = 0.01; // cm → m

const stories = data.Stories || [];
const allSpaces = data.Spaces || [];
const allWalls = data.Walls || [];
const allDoors = data.Doors || [];
const allWindows = data.Windows || [];
const allColumns = data.Columns || [];
const allStaircases = data.Staircases || [];

// --- Compute center from all space polygons ---
let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;
allSpaces.forEach((space) => {
  space.Polygons.forEach((poly) => {
    for (let i = 0; i < poly.shape.length; i += 2) {
      minX = Math.min(minX, poly.shape[i]);
      maxX = Math.max(maxX, poly.shape[i]);
      minY = Math.min(minY, poly.shape[i + 1]);
      maxY = Math.max(maxY, poly.shape[i + 1]);
    }
  });
});
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;

// --- Helpers ---
function coordsToPoints(coords) {
  const pts = [];
  for (let i = 0; i < coords.length; i += 2) {
    pts.push({
      x: (coords[i] - cx) * SCALE,
      y: (coords[i + 1] - cy) * SCALE,
    });
  }
  return pts;
}

function rgba(hex, a) {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return { r: r.toFixed(3), g: g.toFixed(3), b: b.toFixed(3), a: a.toFixed(3) };
}

let linkCount = 0;

function makeLink(name, coords, heightCm, zBaseCm, color) {
  const id = linkCount++;
  const points = coordsToPoints(coords);
  const h = heightCm * SCALE;
  const z = zBaseCm * SCALE;
  const c = rgba(color.hex, color.a);

  const pointsXml = points
    .map((p) => `              <point>${p.x.toFixed(6)} ${p.y.toFixed(6)}</point>`)
    .join("\n");

  return `
      <link name="${name}_${id}">
        <pose>0 0 ${z.toFixed(6)} 0 0 0</pose>
        <visual name="visual">
          <geometry>
            <polyline>
${pointsXml}
              <height>${h.toFixed(6)}</height>
            </polyline>
          </geometry>
          <material>
            <ambient>${c.r} ${c.g} ${c.b} ${c.a}</ambient>
            <diffuse>${c.r} ${c.g} ${c.b} ${c.a}</diffuse>
          </material>
        </visual>
        <collision name="collision">
          <geometry>
            <polyline>
${pointsXml}
              <height>${h.toFixed(6)}</height>
            </polyline>
          </geometry>
        </collision>
      </link>`;
}

// --- Build links ---
const links = [];

stories.forEach((story) => {
  const elev = story.Elevation;
  const storyName = story.Name;

  // Spaces (thin floor slab, 5cm)
  (story.Spaces || []).forEach((idx) => {
    const sp = allSpaces[idx];
    if (!sp) return;
    sp.Polygons.forEach((p) => {
      links.push(makeLink(`${storyName}_space`, p.shape, 5, elev + sp.GroundHeight, { hex: 0xccccaa, a: 1.0 }));
    });
  });

  // Columns
  (story.Columns || []).forEach((idx) => {
    const col = allColumns[idx];
    if (!col) return;
    col.Polygons.forEach((p) => {
      links.push(makeLink(`${storyName}_column`, p.shape, col.Height, elev, { hex: 0x667788, a: 1.0 }));
    });
  });

  // Walls
  (story.Walls || []).forEach((idx) => {
    const wall = allWalls[idx];
    if (!wall) return;

    if (!wall.Doors && !wall.Windows) {
      // Simple wall — no openings
      wall.Polygons.forEach((p) => {
        links.push(makeLink(`${storyName}_wall`, p.shape, wall.Height, elev, { hex: 0x8899aa, a: 1.0 }));
      });
    } else {
      // Wall with openings — use SubPolygons for wall segments beside openings
      if (wall.SubPolygons) {
        wall.SubPolygons.forEach((p) => {
          links.push(makeLink(`${storyName}_wall`, p.shape, wall.Height, elev, { hex: 0x8899aa, a: 1.0 }));
        });
      }

      // Doors
      if (wall.Doors) {
        wall.Doors.forEach((dIdx) => {
          const door = allDoors[dIdx];
          if (!door) return;
          const topOfDoor = door.Elevation + door.Height;
          const upperH = wall.Height - topOfDoor;
          door.Polygons.forEach((p) => {
            // Door opening — no collision (robot can pass through)
            links.push(makeDoorLink(`${storyName}_door`, p.shape, door.Height, elev + door.Elevation, { hex: 0xff6644, a: 0.5 }));
            // Upper wall above door
            if (upperH > 0) {
              links.push(makeLink(`${storyName}_wall_above_door`, p.shape, upperH, elev + topOfDoor, { hex: 0x8899aa, a: 1.0 }));
            }
          });
        });
      }

      // Windows
      if (wall.Windows) {
        wall.Windows.forEach((wIdx) => {
          const win = allWindows[wIdx];
          if (!win) return;
          const topOfWin = win.Elevation + win.Height;
          const upperH = wall.Height - topOfWin;
          const lowerH = win.Elevation;
          win.Polygons.forEach((p) => {
            // Window — has collision (robot cannot pass through)
            links.push(makeLink(`${storyName}_window`, p.shape, win.Height, elev + win.Elevation, { hex: 0x44aaff, a: 1.0 }));
            // Upper wall above window
            if (upperH > 0) {
              links.push(makeLink(`${storyName}_wall_above_window`, p.shape, upperH, elev + topOfWin, { hex: 0x8899aa, a: 1.0 }));
            }
            // Lower wall below window (sill)
            if (lowerH > 0) {
              links.push(makeLink(`${storyName}_wall_below_window`, p.shape, lowerH, elev, { hex: 0x8899aa, a: 1.0 }));
            }
          });
        });
      }
    }
  });
});

// Door link — visual only, no collision (passable opening)
function makeDoorLink(name, coords, heightCm, zBaseCm, color) {
  const id = linkCount++;
  const points = coordsToPoints(coords);
  const h = heightCm * SCALE;
  const z = zBaseCm * SCALE;
  const c = rgba(color.hex, color.a);

  const pointsXml = points
    .map((p) => `              <point>${p.x.toFixed(6)} ${p.y.toFixed(6)}</point>`)
    .join("\n");

  return `
      <link name="${name}_${id}">
        <pose>0 0 ${z.toFixed(6)} 0 0 0</pose>
        <visual name="visual">
          <geometry>
            <polyline>
${pointsXml}
              <height>${h.toFixed(6)}</height>
            </polyline>
          </geometry>
          <material>
            <ambient>${c.r} ${c.g} ${c.b} ${c.a}</ambient>
            <diffuse>${c.r} ${c.g} ${c.b} ${c.a}</diffuse>
          </material>
        </visual>
      </link>`;
}

// --- Assemble SDF ---
const sdf = `<?xml version="1.0" ?>
<sdf version="1.8">
  <world name="uspace_world">
    <physics type="ode">
      <max_step_size>0.001</max_step_size>
      <real_time_factor>1</real_time_factor>
    </physics>

    <light type="directional" name="sun">
      <cast_shadows>true</cast_shadows>
      <pose>0 0 10 0 0 0</pose>
      <diffuse>0.8 0.8 0.8 1</diffuse>
      <specular>0.2 0.2 0.2 1</specular>
      <direction>-0.5 0.1 -0.9</direction>
    </light>

    <model name="ground_plane">
      <static>true</static>
      <link name="link">
        <collision name="collision">
          <geometry>
            <plane>
              <normal>0 0 1</normal>
              <size>100 100</size>
            </plane>
          </geometry>
        </collision>
        <visual name="visual">
          <geometry>
            <plane>
              <normal>0 0 1</normal>
              <size>100 100</size>
            </plane>
          </geometry>
          <material>
            <ambient>0.3 0.3 0.3 1</ambient>
            <diffuse>0.3 0.3 0.3 1</diffuse>
          </material>
        </visual>
      </link>
    </model>

    <model name="building">
      <static>true</static>
      <pose>0 0 0 0 0 0</pose>
${links.join("\n")}
    </model>
  </world>
</sdf>
`;

fs.writeFileSync(outputPath, sdf, "utf-8");

const stats = {
  stories: stories.length,
  links: linkCount,
  outputSize: `${(Buffer.byteLength(sdf) / 1024).toFixed(1)} KB`,
};
console.log("SDF generated:", outputPath);
console.log("Stats:", JSON.stringify(stats, null, 2));

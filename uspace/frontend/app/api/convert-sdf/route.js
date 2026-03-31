import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SCALE = 0.01;

function coordsToPoints(coords, cx, cy) {
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

function buildSDF(data) {
  const stories = data.Stories || [];
  const allSpaces = data.Spaces || [];
  const allWalls = data.Walls || [];
  const allDoors = data.Doors || [];
  const allWindows = data.Windows || [];
  const allColumns = data.Columns || [];

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

  let linkCount = 0;
  const links = [];

  function makeLink(name, coords, heightCm, zBaseCm, color, hasCollision = true) {
    const id = linkCount++;
    const points = coordsToPoints(coords, cx, cy);
    const h = heightCm * SCALE;
    const z = zBaseCm * SCALE;
    const c = rgba(color.hex, color.a);
    const pointsXml = points
      .map((p) => `              <point>${p.x.toFixed(6)} ${p.y.toFixed(6)}</point>`)
      .join("\n");

    let xml = `
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
        </visual>`;

    if (hasCollision) {
      xml += `
        <collision name="collision">
          <geometry>
            <polyline>
${pointsXml}
              <height>${h.toFixed(6)}</height>
            </polyline>
          </geometry>
        </collision>`;
    }

    xml += `
      </link>`;
    return xml;
  }

  stories.forEach((story) => {
    const elev = story.Elevation;
    const sn = story.Name;

    (story.Spaces || []).forEach((idx) => {
      const sp = allSpaces[idx]; if (!sp) return;
      sp.Polygons.forEach((p) => {
        links.push(makeLink(`${sn}_space`, p.shape, 5, elev + sp.GroundHeight, { hex: 0xccccaa, a: 1.0 }));
      });
    });

    (story.Columns || []).forEach((idx) => {
      const col = allColumns[idx]; if (!col) return;
      col.Polygons.forEach((p) => {
        links.push(makeLink(`${sn}_column`, p.shape, col.Height, elev, { hex: 0x667788, a: 1.0 }));
      });
    });

    (story.Walls || []).forEach((idx) => {
      const wall = allWalls[idx]; if (!wall) return;
      if (!wall.Doors && !wall.Windows) {
        wall.Polygons.forEach((p) => {
          links.push(makeLink(`${sn}_wall`, p.shape, wall.Height, elev, { hex: 0x8899aa, a: 1.0 }));
        });
      } else {
        if (wall.SubPolygons) {
          wall.SubPolygons.forEach((p) => {
            links.push(makeLink(`${sn}_wall`, p.shape, wall.Height, elev, { hex: 0x8899aa, a: 1.0 }));
          });
        }
        if (wall.Doors) {
          wall.Doors.forEach((dIdx) => {
            const door = allDoors[dIdx]; if (!door) return;
            const topOfDoor = door.Elevation + door.Height;
            const upperH = wall.Height - topOfDoor;
            door.Polygons.forEach((p) => {
              links.push(makeLink(`${sn}_door`, p.shape, door.Height, elev + door.Elevation, { hex: 0xff6644, a: 0.5 }, false));
              if (upperH > 0) links.push(makeLink(`${sn}_wall_above_door`, p.shape, upperH, elev + topOfDoor, { hex: 0x8899aa, a: 1.0 }));
            });
          });
        }
        if (wall.Windows) {
          wall.Windows.forEach((wIdx) => {
            const win = allWindows[wIdx]; if (!win) return;
            const topOfWin = win.Elevation + win.Height;
            const upperH = wall.Height - topOfWin;
            const lowerH = win.Elevation;
            win.Polygons.forEach((p) => {
              links.push(makeLink(`${sn}_window`, p.shape, win.Height, elev + win.Elevation, { hex: 0x44aaff, a: 1.0 }));
              if (upperH > 0) links.push(makeLink(`${sn}_wall_above_window`, p.shape, upperH, elev + topOfWin, { hex: 0x8899aa, a: 1.0 }));
              if (lowerH > 0) links.push(makeLink(`${sn}_wall_below_window`, p.shape, lowerH, elev, { hex: 0x8899aa, a: 1.0 }));
            });
          });
        }
      }
    });
  });

  return `<?xml version="1.0" ?>
<sdf version="1.8">
  <world name="uspace_world">
    <plugin filename="gz-sim-physics-system" name="gz::sim::systems::Physics"/>
    <plugin filename="gz-sim-user-commands-system" name="gz::sim::systems::UserCommands"/>
    <plugin filename="gz-sim-scene-broadcaster-system" name="gz::sim::systems::SceneBroadcaster"/>
    <plugin filename="gz-sim-contact-system" name="gz::sim::systems::Contact"/>
    <plugin filename="gz-sim-apply-link-wrench-system" name="gz::sim::systems::ApplyLinkWrench"/>

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
          <geometry><plane><normal>0 0 1</normal><size>100 100</size></plane></geometry>
        </collision>
        <visual name="visual">
          <geometry><plane><normal>0 0 1</normal><size>100 100</size></plane></geometry>
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
}

export async function POST(request) {
  try {
    let filename = "0310_Simple2_SemanticModel.json";
    try {
      const body = await request.json();
      if (body.filename) filename = body.filename;
    } catch {}
    // Prevent path traversal
    filename = path.basename(filename);
    const jsonPath = path.join(process.cwd(), "..", "backend", "json", filename);
    const raw = fs.readFileSync(jsonPath, "utf-8");
    const data = JSON.parse(raw);

    const sdf = buildSDF(data);

    // Save to file
    const outPath = path.join(process.cwd(), "..", "backend", "json", "building.sdf");
    fs.writeFileSync(outPath, sdf, "utf-8");

    return new NextResponse(sdf, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": 'attachment; filename="building.sdf"',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

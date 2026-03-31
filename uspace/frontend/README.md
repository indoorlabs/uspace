# uSpace — Digital Twin Viewer

3D digital twin viewer for architectural buildings and facilities, built with **Next.js** and **Three.js**.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- **3D Building Viewer** — Procedural 5-floor building with glass facades, structural pillars, and interior partitions
- **Orbit / Pan / Zoom** — Left-drag to orbit, right-drag to pan, scroll to zoom
- **Floor-by-Floor Exploration** — Toggle between full building view and isolated floor view
- **Sensor Data Overlay** — Temperature, humidity, occupancy, CO₂, and power readings per floor
- **Click-to-Inspect** — Click any element to identify its type, floor, and room

## Project Structure

```
uspace/
├── app/
│   ├── globals.css          # Global styles + CSS variables
│   ├── layout.jsx           # Root layout with fonts
│   └── page.jsx             # Entry page (dynamic import)
├── components/
│   ├── DigitalTwinViewer.jsx # Main 3D viewport + orchestration
│   ├── Sidebar.jsx          # Floor list, view mode, inspection
│   └── SensorOverlay.jsx    # Sensor data panel
├── lib/
│   ├── constants.js         # Theme, building dims, sensor mock data
│   └── buildingGeometry.js  # Three.js scene & floor builders
├── public/                  # Static assets (place .glb models here)
├── next.config.js
├── jsconfig.json
└── package.json
```

## Next Steps

- Upload `.glb` files to `/public/models/` and load them with `GLTFLoader`
- Connect real sensor APIs in `lib/constants.js`
- Add floor plan overlays and annotation layers

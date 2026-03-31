// ── Building constants ─────────────────────────────────────────
export const FLOORS = 2;
export const FLOOR_HEIGHT = 3.0;

// ── Theme tokens ───────────────────────────────────────────────
export const THEME = {
  bg: "#0b0e14",
  panel: "#121721",
  panelBorder: "#1e2736",
  accent: "#00d4ff",
  accentDim: "#006880",
  warm: "#ff6b3d",
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
  text: "#e2e8f0",
  textDim: "#64748b",
};

// ── Generate random sensor payload per floor ───────────────────
export function generateSensorData() {
  return Array.from({ length: FLOORS }, (_, i) => ({
    floor: i + 1,
    label:
      i === 0 ? "Lobby" : i === FLOORS - 1 ? "Rooftop Lounge" : `Floor ${i + 1}`,
    temperature: +(20 + Math.random() * 6).toFixed(1),
    humidity: +(35 + Math.random() * 30).toFixed(0),
    occupancy: Math.floor(Math.random() * 60),
    maxOccupancy: 60,
    co2: Math.floor(350 + Math.random() * 350),
    power: +(5 + Math.random() * 15).toFixed(1),
    status: Math.random() > 0.15 ? "normal" : "alert",
  }));
}

// ── Helper colour functions ────────────────────────────────────
export const tempColor = (t) =>
  t > 24 ? THEME.warm : t < 20 ? THEME.accent : THEME.green;

export const occPercent = (s) =>
  ((s.occupancy / s.maxOccupancy) * 100).toFixed(0);

export const occColor = (s) => {
  const p = s.occupancy / s.maxOccupancy;
  return p > 0.8 ? THEME.red : p > 0.5 ? THEME.yellow : THEME.green;
};

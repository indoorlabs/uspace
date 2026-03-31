"use client";

import { THEME, tempColor, occColor, occPercent } from "@/lib/constants";

export default function SensorOverlay({ data }) {
  if (!data) return null;

  const metrics = [
    {
      label: "Temperature",
      value: `${data.temperature}°C`,
      color: tempColor(data.temperature),
    },
    {
      label: "Humidity",
      value: `${data.humidity}%`,
      color: THEME.text,
    },
    {
      label: "Occupancy",
      value: `${data.occupancy} / ${data.maxOccupancy} (${occPercent(data)}%)`,
      color: occColor(data),
    },
    {
      label: "CO₂",
      value: `${data.co2} ppm`,
      color: data.co2 > 600 ? THEME.yellow : THEME.green,
    },
    {
      label: "Power",
      value: `${data.power} kW`,
      color: THEME.text,
    },
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        width: 210,
        background: THEME.panel + "ee",
        border: `1px solid ${THEME.panelBorder}`,
        borderRadius: 8,
        padding: 16,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: THEME.textDim,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          marginBottom: 10,
        }}
      >
        Sensor Data
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 14,
          color: THEME.accent,
        }}
      >
        {data.label}
      </div>

      {metrics.map((m) => (
        <div key={m.label} style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 9,
              color: THEME.textDim,
              marginBottom: 3,
              letterSpacing: 0.5,
            }}
          >
            {m.label}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: m.color }}>
            {m.value}
          </div>
        </div>
      ))}

      {/* Status badge */}
      <div
        style={{
          marginTop: 6,
          padding: "5px 0",
          borderTop: `1px solid ${THEME.panelBorder}`,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background:
              data.status === "normal" ? THEME.green : THEME.red,
          }}
        />
        <span
          style={{
            fontSize: 10,
            color:
              data.status === "normal" ? THEME.green : THEME.red,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          {data.status}
        </span>
      </div>
    </div>
  );
}

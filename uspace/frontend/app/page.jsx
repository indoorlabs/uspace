import dynamic from "next/dynamic";

const WebGPUViewer = dynamic(() => import("@/components/WebGPUViewer"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0e14",
        color: "#64748b",
        fontFamily: "monospace",
        fontSize: 13,
        gap: 12,
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          border: "2px solid #1e2736",
          borderTopColor: "#00d4ff",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      Initializing WebGPU…
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  ),
});

export default function Home() {
  return <WebGPUViewer />;
}

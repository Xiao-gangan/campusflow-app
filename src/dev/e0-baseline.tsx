import { createRoot } from "react-dom/client";
import "../globals.css";

function Baseline() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        padding: 28,
        background: "#f4f1ea",
        color: "#182420",
        fontFamily:
          "'PingFang SC','Noto Sans SC','Microsoft YaHei',system-ui,sans-serif",
      }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <p
          style={{
            margin: 0,
            color: "#1d5343",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".2em",
          }}
        >
          E0 · BASELINE
        </p>
        <h1 style={{ margin: "8px 0 18px", fontSize: 26 }}>普通文本框基线</h1>
        <textarea
          data-testid="e0-baseline-textarea"
          defaultValue={"你好，{{candidate_name}} 同学"}
          style={{
            width: "100%",
            minHeight: 190,
            padding: 16,
            border: "1px solid #cfc8b9",
            borderRadius: 14,
            background: "#fff",
            font: "inherit",
            fontSize: 15,
            lineHeight: 1.95,
          }}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Baseline />);

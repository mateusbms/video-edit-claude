import React, { useContext } from "react";
import { ThemeContext } from "../theme/context";

export const BrowserWindow: React.FC<{
  url: string;
  width: number;
  children: React.ReactNode;
}> = ({ url, width, children }) => {
  const theme = useContext(ThemeContext);
  return (
    <div style={{
      width, borderRadius: 14, background: theme.card,
      border: `1px solid ${theme.border}`,
      boxShadow: "0 25px 60px rgba(0,0,0,0.08), 0 8px 20px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderBottom: `1px solid ${theme.border}`,
      }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
        <div style={{
          flex: 1, display: "flex", justifyContent: "center",
        }}>
          <div style={{
            background: theme.bg, border: `1px solid ${theme.border}`,
            padding: "4px 16px", borderRadius: 999,
            fontFamily: theme.fontBody, fontSize: 13, color: theme.muted,
          }}>{url}</div>
        </div>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  );
};

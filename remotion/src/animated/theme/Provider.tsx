import React from "react";
import { brandKitToTheme } from "./brand";
import { ThemeContext } from "./context";

export const ThemeProvider: React.FC<{
  value: { colors?: any; fonts?: any } | undefined;
  children: React.ReactNode;
}> = ({ value, children }) => {
  const theme = brandKitToTheme(value ?? {});
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

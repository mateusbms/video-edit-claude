import React from "react";
import { SENDKIT_DEFAULTS, Theme } from "./brand";
export const ThemeContext = React.createContext<Theme>(SENDKIT_DEFAULTS);

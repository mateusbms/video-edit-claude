import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

// Sandboxed environments (CI, cloud sessions) may block Remotion's Chrome
// Headless Shell download; point REMOTION_BROWSER_EXECUTABLE at a local
// headless-shell binary to skip it.
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
}

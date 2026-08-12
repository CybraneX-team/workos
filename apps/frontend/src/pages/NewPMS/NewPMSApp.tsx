import { useEffect, useState } from "react";
import { LocalBackendProvider } from "./localBackend";
import { AccountGate, DemoControls } from "./AccountGate";
import ArcadeApp from "./App";
import { Loader } from "../PMS3D/arcade/Loader";

// Same task-arcade CSS as /3d-pms — reused, not duplicated.
const ARCADE_STYLESHEETS = [
  "/task-arcade-css/styles.css",
  "/task-arcade-css/arcade.css",
  "/task-arcade-css/cinematic.css",
];

function useArcadeStylesheets() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pending = ARCADE_STYLESHEETS.length;
    const onOneReady = () => {
      pending -= 1;
      if (pending <= 0 && !cancelled) setReady(true);
    };
    const links = ARCADE_STYLESHEETS.map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.arcadeStylesheet = "true";
      link.addEventListener("load", onOneReady);
      link.addEventListener("error", onOneReady);
      document.head.appendChild(link);
      return link;
    });
    return () => {
      cancelled = true;
      links.forEach((link) => link.remove());
    };
  }, []);

  return ready;
}

const SETTLE_DELAY_MS = 500;
const FAILSAFE_MS = 3000;

export default function NewPMSApp() {
  const stylesheetsReady = useArcadeStylesheets();
  const [curtainUp, setCurtainUp] = useState(true);

  useEffect(() => {
    const failsafe = setTimeout(() => setCurtainUp(false), FAILSAFE_MS);
    return () => clearTimeout(failsafe);
  }, []);

  useEffect(() => {
    if (!stylesheetsReady) return;
    const settle = setTimeout(() => setCurtainUp(false), SETTLE_DELAY_MS);
    return () => clearTimeout(settle);
  }, [stylesheetsReady]);

  return (
    <LocalBackendProvider>
      <AccountGate>
        <ArcadeApp />
      </AccountGate>
      <DemoControls />
      {curtainUp && <Loader label="Loading Task Arcade" />}
    </LocalBackendProvider>
  );
}

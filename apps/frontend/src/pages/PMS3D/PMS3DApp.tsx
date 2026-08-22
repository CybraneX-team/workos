import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { LocalBackendProvider } from "./arcade/localBackend";
import { AccountGate, DemoControls } from "./arcade/AccountGate";
import ArcadeApp from "./arcade/App";
import { Loader } from "./arcade/Loader";

// The Task Arcade reference app (./arcade/*) is an exact, unmodified copy of
// the working local-backend build — same App.tsx, same CSS, same assets, so
// this page matches it pixel for pixel. Its stylesheets are loaded as plain
// <link> tags (not JS imports) and removed on unmount, so they never leak
// into the rest of WorkOS once you navigate away from /3d-pms.
const ARCADE_STYLESHEETS = [
  "/task-arcade-css/styles.css",
  "/task-arcade-css/arcade.css",
  "/task-arcade-css/cinematic.css",
];

// These <link> tags are appended after mount, so on a fresh load there's a
// window where .app-shell's CSS gradient background hasn't been parsed yet
// (nothing, or the page's default background, shows) followed by it
// suddenly appearing, followed by the WebGL canvas's own first-paint delay
// on top of that — three separate flashes stacked together, which is what
// read as "blue top, green bottom, then the island appears". Waiting for
// every stylesheet's `load` event before mounting the real app (behind the
// existing Loader overlay, which the original app shipped with but this
// page never wired up) collapses that into one clean loading screen.
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

// How this actually guarantees the two-tone gradient never shows, instead of
// just making it less likely:
//
// Toggling between "render <Loader/>" and "render <ArcadeApp/>" (the
// previous approach) still has a gap, because knowing the CSS has loaded
// and the GLTF *data* has been fetched into memory isn't the same as the
// WebGL canvas having actually compiled its shaders and painted a complete
// frame — with ~900+ terrain tiles, that first real paint takes further,
// separate time on top of the network/asset loading. Any signal-based
// "are we ready yet" check still has a residual timing gap; different
// devices/browsers will hit it differently.
//
// So instead: ArcadeApp mounts and starts rendering immediately, every
// time, in the background — and Loader sits on top of it as a fully
// opaque, fixed, full-viewport, high-z-index curtain (see Loader.tsx) the
// entire time it's rendered. Whatever the canvas underneath is doing —
// blank, mid-shader-compile, gradient showing through — is physically
// covered and cannot be seen, regardless of exact timing. The curtain only
// lifts once stylesheets + assets report ready *and* a fixed settle delay
// has passed (giving the canvas real time to paint behind it), with a hard
// failsafe so a first-time sign-up form (rendered behind the curtain,
// inside AccountGate) is never stuck hidden for more than a few seconds.
const SETTLE_DELAY_MS = 500;
const FAILSAFE_MS = 3000;

export default function PMS3DApp() {
  const stylesheetsReady = useArcadeStylesheets();
  // App.tsx kicks off useGLTF.preload() for every kit model at module-eval
  // time (before this component even renders), so by the time this reads
  // useProgress(), the loading manager already reflects that in-flight work.
  const { active: assetsLoading } = useProgress();
  const [curtainUp, setCurtainUp] = useState(true);

  useEffect(() => {
    const failsafe = setTimeout(() => setCurtainUp(false), FAILSAFE_MS);
    return () => clearTimeout(failsafe);
  }, []);

  useEffect(() => {
    if (!stylesheetsReady || assetsLoading) return;
    const settle = setTimeout(() => setCurtainUp(false), SETTLE_DELAY_MS);
    return () => clearTimeout(settle);
  }, [stylesheetsReady, assetsLoading]);

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

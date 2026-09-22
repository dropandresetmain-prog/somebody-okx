(() => {
  const DESIGN_WIDTH = 1920;
  const DESIGN_HEIGHT = 1080;
  const SEQUENCE_DURATION_MS = 15000;

  const stage = document.getElementById("stage");
  if (!stage) return;

  let assetsReady = false;
  let startToken = 0;

  function fitStage() {
    const scale = Math.min(
      window.innerWidth / DESIGN_WIDTH,
      window.innerHeight / DESIGN_HEIGHT,
    );
    stage.style.setProperty("--stage-scale", String(scale));
  }

  async function preloadAssets() {
    if (assetsReady) return;
    const images = Array.from(document.images);
    await Promise.all(
      images.map(async (image) => {
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }
        if (typeof image.decode === "function") {
          try { await image.decode(); } catch { /* keep recorder moving */ }
        }
      }),
    );
    assetsReady = true;
  }

  function restartSequence() {
    startToken += 1;
    const token = startToken;
    stage.classList.remove("is-playing");
    void stage.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (token === startToken) {
          stage.classList.add("is-playing");
          window.dispatchEvent(new CustomEvent("somebody:sequence-start", {
            detail: { durationMs: SEQUENCE_DURATION_MS },
          }));
        }
      });
    });
  }

  window.addEventListener("resize", fitStage, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === "r" || key === " ") {
      event.preventDefault();
      restartSequence();
    }
  });

  window.SomebodySeq1 = {
    restart: restartSequence,
    durationMs: SEQUENCE_DURATION_MS,
  };

  fitStage();
  const manualStart = new URLSearchParams(window.location.search).get("manual") === "1";
  void preloadAssets().then(() => {
    window.dispatchEvent(new CustomEvent("somebody:sequence-ready"));
    if (!manualStart) restartSequence();
  });
})();

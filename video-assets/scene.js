(() => {
  const DESIGN_WIDTH = 1920;
  const DESIGN_HEIGHT = 1080;
  const VALID_SCENES = new Set(["opening", "working", "closing"]);
  const SCENE_ALIASES = {
    "1": "opening",
    "2": "working",
    "3": "closing",
  };

  const stage = document.getElementById("stage");
  if (!stage) return;

  let assetsReady = false;
  let startToken = 0;

  function normalizeScene(value) {
    const normalized = String(value || "opening").toLowerCase();
    const scene = SCENE_ALIASES[normalized] || normalized;
    return VALID_SCENES.has(scene) ? scene : "opening";
  }

  function sceneFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return normalizeScene(params.get("scene"));
  }

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
          try {
            await image.decode();
          } catch {
            // A failed decode should not trap the recorder on a blank frame.
          }
        }
      }),
    );

    assetsReady = true;
  }

  function restartScene() {
    startToken += 1;
    const token = startToken;

    stage.classList.remove("is-playing");
    // Force style recalculation so CSS animations restart from their first frame.
    void stage.offsetWidth;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (token === startToken) stage.classList.add("is-playing");
      });
    });
  }

  async function setScene(nextScene, { updateUrl = true } = {}) {
    const scene = normalizeScene(nextScene);
    stage.dataset.scene = scene;
    document.title = `Somebody — ${scene[0].toUpperCase()}${scene.slice(1)} Scene`;

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("scene", scene);
      window.history.replaceState({}, "", url);
    }

    await preloadAssets();
    restartScene();
  }

  window.addEventListener("resize", fitStage, { passive: true });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;

    const key = event.key.toLowerCase();
    if (key === "r" || key === " ") {
      event.preventDefault();
      restartScene();
      return;
    }

    if (SCENE_ALIASES[key]) {
      event.preventDefault();
      void setScene(SCENE_ALIASES[key]);
    }
  });

  window.addEventListener("popstate", () => {
    void setScene(sceneFromUrl(), { updateUrl: false });
  });

  fitStage();
  void setScene(sceneFromUrl(), { updateUrl: false });
})();

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createRayfieldRenderer, RayfieldRenderer } from "./renderer.js";
import type { RayfieldHandle, SeamRayfieldProps } from "./types.js";

export const SeamRayfield = forwardRef<RayfieldHandle, SeamRayfieldProps>(function SeamRayfield(
  {
    className,
    style,
    config,
    paused = false,
    source = null,
    pixelRatio,
    ariaLabel = "Animated light ray field",
    fallback = "The light field is unavailable because WebGL 2 could not start.",
    onReady,
    onError,
  },
  forwardedRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RayfieldRenderer | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const renderer = createRayfieldRenderer(canvas, { config, pixelRatio, autoStart: !paused });
      rendererRef.current = renderer;
      const handle: RayfieldHandle = {
        canvas,
        renderer,
        resize: () => renderer.resize(),
        pause: () => renderer.pause(),
        resume: () => renderer.resume(),
        reset: () => renderer.reset(),
        setSource: (next) => renderer.setSource(next),
      };
      onReady?.(handle);
      return () => {
        renderer.destroy();
        rendererRef.current = null;
      };
    } catch (caught) {
      const next = caught instanceof Error ? caught : new Error("Seam Rayfield could not start.");
      setError(next);
      onError?.(next);
    }
  }, []);

  useEffect(() => {
    if (config) rendererRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    rendererRef.current?.setSource(source);
  }, [source]);

  useEffect(() => {
    if (paused) rendererRef.current?.pause();
    else rendererRef.current?.resume();
  }, [paused]);

  useImperativeHandle(forwardedRef, () => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) throw new Error("Seam Rayfield is not ready yet.");
    return {
      canvas,
      renderer,
      resize: () => renderer.resize(),
      pause: () => renderer.pause(),
      resume: () => renderer.resume(),
      reset: () => renderer.reset(),
      setSource: (next) => renderer.setSource(next),
    };
  }, []);

  return (
    <div className={["seam-rayfield", className].filter(Boolean).join(" ")} style={style}>
      <canvas ref={canvasRef} className="seam-rayfield__canvas" aria-label={ariaLabel} role="img" />
      {error ? <p className="seam-rayfield__fallback" role="status">{fallback}</p> : null}
    </div>
  );
});

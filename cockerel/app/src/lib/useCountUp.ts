// RN port of cockerel/js/ui.js's animateCount: an eased 0(or `from`)
// -> `to` count-up over `ms`, driven by requestAnimationFrame (works
// identically in RN and react-native-web). One-shot per mount, same as the
// original calling animateCount once per screen render.
import { useEffect, useState } from "react";

export function useCountUp(to: number, opts: { from?: number; ms?: number; onComplete?: () => void } = {}): number {
  const { from = 0, ms = 900 } = opts;
  const [value, setValue] = useState(from);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    const start = Date.now();
    function tick() {
      if (cancelled) return;
      const t = Math.min(1, (Date.now() - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else opts.onComplete?.();
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, from, ms]);

  return value;
}

import { useState, useEffect } from "react";

interface ArtemisData {
  btcPrice: number | null;
  vesuTvl: number | null;
  loading: boolean;
}

export function useArtemisData(): ArtemisData {
  const [data, setData] = useState<ArtemisData>({ btcPrice: null, vesuTvl: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    async function fetch() {
      try {
        const res = await window.fetch("/api/btc-price");
        if (!res.ok) throw new Error("Failed");
        const json = await res.json();
        if (!cancelled) {
          setData({ btcPrice: json.price, vesuTvl: json.tvl, loading: false });
        }
      } catch {
        if (!cancelled) setData((d) => ({ ...d, loading: false }));
      }
    }

    fetch();
    const id = setInterval(fetch, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return data;
}

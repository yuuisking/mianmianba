"use client";

import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "var(--font-ui)",
});

export default function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      if (!chart || !ref.current) return;
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: generatedSvg } = await mermaid.render(id, chart);
        if (isMounted) {
          setSvg(generatedSvg);
        }
      } catch (error) {
        console.error("Mermaid parsing failed", error);
        if (isMounted) {
          setSvg(`<div style="color: red; padding: 10px; border: 1px solid red; border-radius: 4px;">Failed to render Mermaid chart</div>`);
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  return (
    <div 
      ref={ref} 
      className="mermaid-chart flex justify-center my-4" 
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  );
}

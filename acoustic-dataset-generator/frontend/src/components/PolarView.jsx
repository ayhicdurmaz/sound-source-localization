/**
 * PolarView – Kartezyen koordinat sistemi üzerinde oda + mikrofon + kaynak görünümü.
 * Orijin = mic array merkezi. Sonsuz ızgara. Pan: sürükle | Zoom: tekerlek | Reset: çift tık
 */
import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";

const MIC_COLORS = [
  "#38bdf8", "#34d399", "#f472b6", "#facc15",
  "#a78bfa", "#fb923c", "#e879f9", "#4ade80",
];

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 20;

// Izgara aralığını zoom'a göre otomatik seç (1m, 2m, 5m, 10m ...)
function niceStep(metersPerPixel) {
  const raw = metersPerPixel * 80; // her ~80px'de bir çizgi
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  if (raw / base < 2)  return base;
  if (raw / base < 5)  return base * 2;
  return base * 5;
}

export default function PolarView({ label, nMics, micRadius, centerMic,
                                    roomX, roomY, micCenterX, micCenterY, sampleRate }) {
  const n   = nMics || 4;
  const r   = micRadius || 0.05;
  const RX  = roomX || 6.0;
  const RY  = roomY || 6.0;
  // mic merkezi — koordinat sistemi orijini
  const MCX = micCenterX != null ? micCenterX : RX / 2;
  const MCY = micCenterY != null ? micCenterY : RY / 2;

  // Multi-source support: `label.sources` (array) or legacy single-source label
  const sources = Array.isArray(label?.sources)
    ? label.sources
    : (label?.source_pos ? [label] : []);

  const SOUND_SPEED = 343;
  const fMax = (sampleRate ?? 16000) / 2;
  const ffBoundary = parseFloat((2*(2*r)*(2*r) / (SOUND_SPEED / fMax)).toFixed(2));

  // ─── Container boyutu ───
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setSize({ w: Math.max(1, Math.floor(width)), h: Math.max(1, Math.floor(height)) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const W = size.w;
  const H = size.h;

  // ─── Pan & Zoom ───
  // pan = piksel cinsinden orijin'in SVG içindeki konumu
  const [zoom, setZoom] = useState(1);   // piksel / metre
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos  = useRef({ x: 0, y: 0 });
  const svgRef   = useRef(null);

  // İlk render / oda değişince: orijini ekran merkezine taşı, oda sığacak şekilde zoom
  const fitToRoom = useCallback((w, h, rx, ry, mcx, mcy) => {
    const pad = 48;
    // Oda dünya koordinatında: x ∈ [-mcx, rx-mcx], y ∈ [-mcy, ry-mcy]
    const worldW = rx;  // oda genişliği
    const worldH = ry;  // oda yüksekliği
    const z = Math.min((w - pad * 2) / worldW, (h - pad * 2) / worldH, 80);
    // Odanın dünya merkezi: (rx/2 - mcx, ry/2 - mcy) → bunu ekran merkezine koy
    const roomCenterWX = rx / 2 - mcx;
    const roomCenterWY = ry / 2 - mcy;
    setPan({ x: w / 2 - roomCenterWX * z, y: h / 2 + roomCenterWY * z });
    setZoom(z);
  }, []);

  // Oda boyutu VEYA container boyutu değişince yeniden fit et
  useEffect(() => {
    if (W > 1 && H > 1) fitToRoom(W, H, RX, RY, MCX, MCY);
  }, [RX, RY, MCX, MCY, W, H]); // eslint-disable-line

  const resetView = useCallback(() => fitToRoom(W, H, RX, RY, MCX, MCY), [W, H, RX, RY, MCX, MCY, fitToRoom]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setZoom(prev => {
      const next = Math.min(ZOOM_MAX * 10, Math.max(ZOOM_MIN, prev * factor));
      const scale = next / prev;
      setPan(p => ({
        x: cx - scale * (cx - p.x),
        y: cy - scale * (cy - p.y),
      }));
      return next;
    });
  }, []);

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.style.cursor = "grabbing";
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const onMouseUp = useCallback((e) => {
    dragging.current = false;
    if (e.currentTarget) e.currentTarget.style.cursor = "grab";
  }, []);

  // ─── Koordinat dönüşümleri ───
  // Dünya (metre) → SVG piksel
  // pan = orijin'in SVG koordinatı, Y ekseni ters (SVG aşağı, dünya yukarı)
  function w2s(wx, wy) {
    return [pan.x + wx * zoom, pan.y - wy * zoom];
  }

  // ─── Izgara hesabı ───
  // Ekranda görünen dünya koordinat aralığı
  const worldLeft   = (-pan.x) / zoom;
  const worldRight  = (W - pan.x) / zoom;
  const worldBottom = (pan.y - H) / zoom;
  const worldTop    = pan.y / zoom;

  const metersPerPixel = 1 / zoom;
  const step = useMemo(() => niceStep(metersPerPixel), [metersPerPixel]);

  const gridLines = useMemo(() => {
    const lines = [];
    const x0 = Math.floor(worldLeft  / step) * step;
    const x1 = Math.ceil(worldRight  / step) * step;
    const y0 = Math.floor(worldBottom / step) * step;
    const y1 = Math.ceil(worldTop    / step) * step;
    for (let x = x0; x <= x1; x = parseFloat((x + step).toFixed(10))) {
      const isAxis = Math.abs(x) < step * 0.01;
      lines.push({ type: "v", val: x, axis: isAxis });
    }
    for (let y = y0; y <= y1; y = parseFloat((y + step).toFixed(10))) {
      const isAxis = Math.abs(y) < step * 0.01;
      lines.push({ type: "h", val: y, axis: isAxis });
    }
    return lines;
  }, [worldLeft, worldRight, worldBottom, worldTop, step]);

  // Tick etiketleri (her step'te ama çok sık olmasın)
  const xLabels = useMemo(() => {
    const labels = [];
    const x0 = Math.floor(worldLeft  / step) * step;
    const x1 = Math.ceil(worldRight  / step) * step;
    for (let x = x0; x <= x1; x = parseFloat((x + step).toFixed(10))) {
      if (Math.abs(x) < step * 0.01) continue; // orijin etiketi ayrıca
      labels.push(x);
    }
    return labels;
  }, [worldLeft, worldRight, step]);

  const yLabels = useMemo(() => {
    const labels = [];
    const y0 = Math.floor(worldBottom / step) * step;
    const y1 = Math.ceil(worldTop    / step) * step;
    for (let y = y0; y <= y1; y = parseFloat((y + step).toFixed(10))) {
      if (Math.abs(y) < step * 0.01) continue;
      labels.push(y);
    }
    return labels;
  }, [worldBottom, worldTop, step]);

  // ─── Mikrofon pozisyonları (orijin = MCX,MCY yani dünyada 0,0) ───
  const mics = useMemo(() => {
    const arr = Array.from({ length: n }, (_, i) => {
      const angle = (2 * Math.PI * i) / n;
      // dünya koordinatı: mic merkezine göre ofset
      return {
        wx: r * Math.cos(angle),
        wy: r * Math.sin(angle),
        color: MIC_COLORS[i % MIC_COLORS.length],
        isCenter: false,
      };
    });
    if (centerMic) arr.push({ wx: 0, wy: 0, color: "#f87171", isCenter: true });
    return arr;
  }, [n, r, centerMic]);

  // Kaynak pozisyonları: dünya koordinatında, orijin = MCX,MCY
  const srcWs = (sources || [])
    .map((s, idx) => {
      const sp = s?.source_pos;
      if (!Array.isArray(sp) || sp.length < 2) return null;
      return {
        idx,
        wx: sp[0] - MCX,
        wy: sp[1] - MCY,
        azimuth_deg: s?.azimuth_deg,
        distance_m: s?.distance_m,
      };
    })
    .filter(Boolean);

  // Oda köşeleri (orijin = MCX,MCY)
  const roomCorners = [
    [-MCX,       -MCY      ],
    [RX - MCX,   -MCY      ],
    [RX - MCX,   RY - MCY  ],
    [-MCX,       RY - MCY  ],
  ];

  const [ox, oy] = w2s(0, 0); // orijin piksel

  // Label font boyutu — zoom'dan bağımsız sabit piksel
  const FS = 10;

  return (
    <div className="polar-view-fullscreen" ref={containerRef}>

      {/* Overlay bilgi çubuğu */}
      <div className="polar-overlay-bar">
        <span className="polar-overlay-title">🏠 Room View</span>
        <span style={{ fontSize: 10, color: "#64748b" }}>{zoom.toFixed(1)} px/m</span>
        <button onClick={resetView} className="polar-reset-btn" title="Görünümü sıfırla (çift tık)">⟲</button>
        {label && srcWs.length > 0 && (
          <span className="polar-overlay-info">
            {srcWs.length === 1 ? (
              <>
                {Number.isFinite(srcWs[0].azimuth_deg) ? `${srcWs[0].azimuth_deg.toFixed(1)}°` : "—"}
                &nbsp;/&nbsp;
                {Number.isFinite(srcWs[0].distance_m) ? `${srcWs[0].distance_m.toFixed(2)} m` : "—"}
                &nbsp;·&nbsp;
                ({(srcWs[0].wx + MCX).toFixed(2)}, {(srcWs[0].wy + MCY).toFixed(2)})
              </>
            ) : (
              <>
                {srcWs.length} sources
              </>
            )}
          </span>
        )}
      </div>

      <svg
        ref={svgRef}
        width={W} height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ cursor: "grab", display: "block", userSelect: "none", position: "absolute", inset: 0 }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={resetView}
      >
        <defs>
          <marker id="ax" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#1e40af" />
          </marker>
        </defs>

        {/* ── Arka plan ── */}
        <rect x={0} y={0} width={W} height={H} fill="#060d1a" />

        {/* ── Izgara çizgileri ── */}
        {gridLines.map((l, i) => {
          if (l.type === "v") {
            const [sx] = w2s(l.val, 0);
            return <line key={i} x1={sx} y1={0} x2={sx} y2={H}
              stroke={l.axis ? "#1e40af" : "#0f1f3a"}
              strokeWidth={l.axis ? 1.5 : 0.5} />;
          } else {
            const [, sy] = w2s(0, l.val);
            return <line key={i} x1={0} y1={sy} x2={W} y2={sy}
              stroke={l.axis ? "#1e40af" : "#0f1f3a"}
              strokeWidth={l.axis ? 1.5 : 0.5} />;
          }
        })}

        {/* ── Ok uçlu eksenler ── */}
        <line x1={0} y1={oy} x2={W} y2={oy} stroke="#1e40af" strokeWidth={1.5} markerEnd="url(#ax)" />
        <line x1={ox} y1={H} x2={ox} y2={0} stroke="#1e40af" strokeWidth={1.5} markerEnd="url(#ax)" />

        {/* X ekseni etiketleri */}
        {xLabels.map((x) => {
          const [sx] = w2s(x, 0);
          if (sx < 0 || sx > W) return null;
          const fmt = Number.isInteger(x) ? String(x) : x.toFixed(1);
          return (
            <g key={`xl${x}`}>
              <line x1={sx} y1={oy - 3} x2={sx} y2={oy + 3} stroke="#1e40af" strokeWidth={1} />
              <text x={sx} y={oy + 14} fill="#334e7a" fontSize={FS} fontFamily="monospace"
                textAnchor="middle">{fmt}m</text>
            </g>
          );
        })}

        {/* Y ekseni etiketleri */}
        {yLabels.map((y) => {
          const [, sy] = w2s(0, y);
          if (sy < 0 || sy > H) return null;
          const fmt = Number.isInteger(y) ? String(y) : y.toFixed(1);
          return (
            <g key={`yl${y}`}>
              <line x1={ox - 3} y1={sy} x2={ox + 3} y2={sy} stroke="#1e40af" strokeWidth={1} />
              <text x={ox - 6} y={sy + 4} fill="#334e7a" fontSize={FS} fontFamily="monospace"
                textAnchor="end">{fmt}m</text>
            </g>
          );
        })}

        {/* Orijin etiketi */}
        <text x={ox + 5} y={oy + 13} fill="#1e40af" fontSize={FS} fontFamily="monospace">(0,0)</text>

        {/* ── Oda dikdörtgeni ── */}
        {(() => {
          const [x0, y0] = w2s(roomCorners[0][0], roomCorners[0][1]);
          const [x1, y1] = w2s(roomCorners[2][0], roomCorners[2][1]);
          return (
            <>
              <rect x={Math.min(x0,x1)} y={Math.min(y0,y1)}
                width={Math.abs(x1-x0)} height={Math.abs(y1-y0)}
                fill="#0b1a2e60" stroke="#1e3a5f" strokeWidth={1.5} rx={2} />
              {/* Oda köşe etiketi */}
              <text x={Math.min(x0,x1)+4} y={Math.min(y0,y1)-4}
                fill="#1e3a5f" fontSize={FS} fontFamily="monospace">
                {RX}m × {RY}m
              </text>
            </>
          );
        })()}

        {/* ── FF sınır çemberi ── */}
        <circle cx={ox} cy={oy} r={ffBoundary * zoom}
          fill="none" stroke="#f59e0b" strokeWidth={1} strokeDasharray="6,3" opacity={0.5} />
        <text x={ox + ffBoundary * zoom + 4} y={oy - 4}
          fill="#f59e0b" fontSize={FS} fontFamily="monospace" opacity={0.8}>
          ff={ffBoundary}m
        </text>

        {/* ── Mic array yarıçap halkası ── */}
        <circle cx={ox} cy={oy} r={r * zoom}
          fill="none" stroke="#475569" strokeWidth={1} strokeDasharray="2,2" />

        {/* ── Kaynak → orijin çizgisi ── */}
        {srcWs && srcWs.map(s => {
          const [sx, sy] = w2s(s.wx, s.wy);
          const color = MIC_COLORS[s.idx % MIC_COLORS.length];
          return (
            <g key={`src-line-${s.idx}`}>
              <line x1={ox} y1={oy} x2={sx} y2={sy}
                stroke={color} strokeWidth={1.5} strokeDasharray="5,3" opacity={0.7} />
              <circle cx={sx} cy={sy} r={10} fill={color} opacity={0.2} />
              <circle cx={sx} cy={sy} r={4} fill={color} />
            </g>
          );
        })}

        {/* ── Kaynak(lar) ── */}
        {srcWs.map((s) => {
          const [sx, sy] = w2s(s.wx, s.wy);
          const color = MIC_COLORS[s.idx % MIC_COLORS.length];
          return (
            <g key={`src-${s.idx}`}>
              <circle cx={sx} cy={sy} r={7} fill={color} opacity={0.9} />
              <circle cx={sx} cy={sy} r={14} fill={color} opacity={0.12} />
              <text x={sx + 10} y={sy - 10} fontSize={FS} fill={color}>
                S{s.idx + 1}
              </text>
            </g>
          );
        })}

        {/* ── Mikrofonlar ── */}
        {mics.map((m, i) => {
          const [mx, my] = w2s(m.wx, m.wy);
          if (m.isCenter) return (
            <g key="center-mic">
              <rect x={mx-5} y={my-5} width={10} height={10}
                fill={m.color} opacity={0.9} rx={2} />
              <text x={mx+8} y={my+4} fill={m.color} fontSize={FS} fontFamily="monospace">C</text>
            </g>
          );
          return (
            <g key={i}>
              <circle cx={mx} cy={my} r={6} fill={m.color} opacity={0.9} />
              <text x={mx+8} y={my+4} fill={m.color} fontSize={FS} fontFamily="monospace">M{i+1}</text>
            </g>
          );
        })}

        {/* Eksen isimleri — köşelere sabit */}
        <text x={W - 14} y={oy - 8} fill="#1e40af" fontSize={FS} fontFamily="monospace" textAnchor="end">X</text>
        <text x={ox + 8} y={16}     fill="#1e40af" fontSize={FS} fontFamily="monospace">Y</text>

      </svg>
    </div>
  );
}

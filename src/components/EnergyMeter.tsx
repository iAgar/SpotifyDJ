interface Props {
  energyScore: number; // 0.0 – 1.0
}

function label(score: number): string {
  if (score < 0.3) return 'CHILL';
  if (score < 0.6) return 'WARMING UP';
  return 'PEAK ENERGY';
}

function color(score: number): string {
  if (score < 0.3) return '#1db954';
  if (score < 0.6) return '#facc15';
  return '#f87171';
}

export function EnergyMeter({ energyScore }: Props) {
  const pct = Math.round(energyScore * 100);
  const c   = color(energyScore);
  const lbl = label(energyScore);
  const isPeak = energyScore >= 0.6;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '0.75rem',
      height: '100%',
    }}>
      {/* Label */}
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: c,
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        transform: 'rotate(180deg)',
        transition: 'color 0.4s ease',
        animation: isPeak ? 'pulse-label 1s ease-in-out infinite alternate' : 'none',
      }}>
        {lbl}
      </div>

      {/* Track */}
      <div style={{
        flex: 1,
        width: 28,
        borderRadius: 14,
        background: '#1a1a1a',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid #222',
      }}>
        {/* Fill — grows from bottom */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: `${pct}%`,
          background: `linear-gradient(to top, ${c}, ${c}88)`,
          borderRadius: 14,
          transition: 'height 0.4s ease, background 0.4s ease',
          animation: isPeak ? 'pulse-bar 1s ease-in-out infinite alternate' : 'none',
        }} />
      </div>

      {/* Percentage */}
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        color: c,
        transition: 'color 0.4s ease',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {pct}%
      </div>

      <style>{`
        @keyframes pulse-bar {
          from { opacity: 0.85; }
          to   { opacity: 1;    box-shadow: 0 0 12px #f87171aa; }
        }
        @keyframes pulse-label {
          from { opacity: 0.7; }
          to   { opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

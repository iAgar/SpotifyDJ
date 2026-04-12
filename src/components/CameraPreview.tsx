interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  energyScore: number;
}

function energyColor(score: number): string {
  if (score < 0.3) return '#1db954';
  if (score < 0.6) return '#facc15';
  return '#f87171';
}

export function CameraPreview({ videoRef, isActive, energyScore }: Props) {
  if (!isActive) return null;

  const pct = Math.round(energyScore * 100);
  const c   = energyColor(energyScore);

  return (
    <div style={{
      position: 'relative',
      width: 160,
      height: 120,
      borderRadius: 10,
      overflow: 'hidden',
      border: `2px solid ${c}`,
      background: '#000',
      transition: 'border-color 0.4s ease',
      flexShrink: 0,
    }}>
      <video
        ref={videoRef}
        width={160}
        height={120}
        muted
        playsInline
        style={{
          display: 'block',
          transform: 'scaleX(-1)',
          objectFit: 'cover',
        }}
      />

      {/* Energy overlay */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '0.2rem 0.4rem',
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
      }}>
        <div style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: '#222',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: c,
            borderRadius: 2,
            transition: 'width 0.3s ease, background 0.3s ease',
          }} />
        </div>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: c,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 28,
          textAlign: 'right',
        }}>
          {pct}%
        </div>
      </div>
    </div>
  );
}

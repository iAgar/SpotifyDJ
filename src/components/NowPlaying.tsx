interface Props {
  trackName: string | null;
  artistName: string | null;
  albumArt: string | null;
  isReady: boolean;
}

const BAR_COUNT = 5;

export function NowPlaying({ trackName, artistName, albumArt, isReady }: Props) {
  console.log('[NowPlaying] albumArt:', albumArt, '| trackName:', trackName);
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1.25rem',
    }}>
      {/* Album art */}
      <div style={{
        width: 300,
        height: 300,
        borderRadius: 12,
        overflow: 'hidden',
        background: '#1a1a1a',
        flexShrink: 0,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        {albumArt ? (
          <img
            src={albumArt}
            alt={trackName ?? 'Album art'}
            width={300}
            height={300}
            style={{ display: 'block', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#333',
            fontSize: '3rem',
          }}>
            ♫
          </div>
        )}
      </div>

      {/* Track info + equaliser */}
      <div style={{ textAlign: 'center', width: '100%' }}>
        <div style={{
          fontSize: 32,
          fontWeight: 700,
          color: '#ffffff',
          lineHeight: 1.2,
          letterSpacing: '-0.5px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 320,
          margin: '0 auto',
        }}>
          {trackName ?? '—'}
        </div>

        <div style={{
          fontSize: 18,
          color: '#888',
          marginTop: '0.35rem',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 320,
          margin: '0.35rem auto 0',
        }}>
          {artistName ?? 'No track playing'}
        </div>

        {/* Equaliser bars — animate only while a track is playing */}
        {isReady && trackName && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 4,
            height: 24,
            marginTop: '0.9rem',
          }}>
            {Array.from({ length: BAR_COUNT }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  borderRadius: 2,
                  background: '#1db954',
                  animation: `eq-bar ${0.6 + i * 0.15}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes eq-bar {
          from { height: 4px;  opacity: 0.5; }
          to   { height: 22px; opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

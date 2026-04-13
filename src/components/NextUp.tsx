import type { RecommendedTrack } from '../spotify/useRecommendations';

interface Props {
  track: RecommendedTrack | null;
  onPlayNext: () => void;
}

export function NextUp({ track, onPlayNext }: Props) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: '#555',
      }}>
        UP NEXT
      </div>

      {track ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          background: '#111',
          border: '1px solid #222',
          borderRadius: 10,
          padding: '0.6rem',
        }}>
          {track.albumArt ? (
            <img
              src={track.albumArt}
              alt={track.name}
              width={48}
              height={48}
              style={{ borderRadius: 6, flexShrink: 0, display: 'block' }}
            />
          ) : (
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 6,
              background: '#1a1a1a',
              flexShrink: 0,
            }} />
          )}

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {track.name}
            </div>
            <div style={{
              fontSize: 12,
              color: '#666',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 2,
            }}>
              {track.artist}
            </div>
          </div>

          <button
            onClick={onPlayNext}
            style={{
              flexShrink: 0,
              background: '#1db954',
              color: '#000',
              border: 'none',
              borderRadius: 20,
              padding: '0.4rem 0.9rem',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            SKIP
          </button>
        </div>
      ) : (
        <div style={{
          fontSize: 12,
          color: '#333',
          fontStyle: 'italic',
        }}>
          Finding next track…
        </div>
      )}
    </div>
  );
}

interface Props {
  entries: string[];
}

export function DJLog({ entries }: Props) {
  const visible = entries.slice(0, 10);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      width: '100%',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: '#555',
        marginBottom: '0.25rem',
      }}>
        DJ LOG
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
        overflowY: 'auto',
        maxHeight: 220,
      }}>
        {visible.length === 0 ? (
          <div style={{ fontSize: 12, color: '#333', fontFamily: 'monospace' }}>
            Waiting for decisions…
          </div>
        ) : (
          visible.map((entry, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: i === 0 ? '#1db954' : '#555',
                fontFamily: 'monospace',
                lineHeight: 1.4,
                transition: 'color 0.3s ease',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {entry}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

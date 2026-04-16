export const JsonFormatter = ({ data }: { data: any }) => {
  if (typeof data === 'number' && data > 1000000000000 && data < 2000000000000) {
    // Likely a timestamp in ms (between 2001 and 2033)
    const iso = new Date(data).toISOString();
    return <span className="timestamp-val" data-iso={iso}>{data}</span>;
  }

  if (data === null) return <span style={{ color: '#94a3b8' }}>null</span>;
  if (typeof data === 'string') return <span style={{ color: '#4ade80' }}>"{data}"</span>;
  if (typeof data === 'boolean') return <span style={{ color: '#fb923c' }}>{String(data)}</span>;
  if (typeof data === 'number') return <span style={{ color: '#fb923c' }}>{data}</span>;

  if (Array.isArray(data)) {
    return (
      <span>
        [
        <div style={{ paddingLeft: '1.5rem' }}>
          {data.map((item, i) => (
            <div key={i}>
              <JsonFormatter data={item} />
              {i < data.length - 1 ? ',' : ''}
            </div>
          ))}
        </div>
        ]
      </span>
    );
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    return (
      <span>
        {'{'}
        <div style={{ paddingLeft: '1.5rem' }}>
          {keys.map((key, i) => (
            <div key={key}>
              <span style={{ color: '#818cf8' }}>"{key}"</span>: <JsonFormatter data={data[key]} />
              {i < keys.length - 1 ? ',' : ''}
            </div>
          ))}
        </div>
        {'}'}
      </span>
    );
  }

  return <span>{String(data)}</span>;
};

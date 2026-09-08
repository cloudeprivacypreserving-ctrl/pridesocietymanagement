import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function ResidentPhoto({ path, alt }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    api
      .post('/photos/signed-url', { path })
      .then((data) => {
        if (!cancelled) setUrl(data.signed_url);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) return <div className="photo-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--ink-dim)' }}>No photo</div>;
  if (!url) return <div className="photo-thumb" />;

  return <img className="photo-thumb" src={url} alt={alt || 'Resident photo'} />;
}

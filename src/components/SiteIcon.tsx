import { useState } from 'react';
import { Globe2 } from 'lucide-react';
import { faviconUrl } from '../lib/favicon';

function IconImage({src}: {src: string | null}) {
  const [state, setState] = useState<'loading' | 'loaded' | 'fallback'>(src ? 'loading' : 'fallback');
  return <span className="site-icon" data-state={state} aria-hidden="true">
    {state !== 'loaded' && <Globe2 size={18}/>}
    {src && state !== 'fallback' && <img src={src} alt="" width={24} height={24}
      loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onLoad={()=>setState('loaded')} onError={()=>setState('fallback')}/>}
  </span>;
}

/** Keying the image resets failed/loaded state when a different site is rendered. */
export function SiteIcon({url}: {url: string}) {
  const src = faviconUrl(url);
  return <IconImage key={src || 'fallback'} src={src}/>;
}

import React from 'react';
import { navigate } from '../router/useRoute';

const LOGO_URL = 'https://res.cloudinary.com/dlesei0kn/image/upload/v1787478477/file_000000005a44820885c9d29411b18ee4_rsbyqc.png';

export function Logo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return <button type="button" onClick={() => navigate('/')} className="focus-ring flex items-center gap-2.5" aria-label="DocBit home" title="DocBit home">
    <img src={LOGO_URL} alt="DocBit" title="DocBit" className={`${compact ? "h-8 w-8" : "h-9 w-auto max-w-[132px]"} object-contain ${dark ? "brightness-0 invert" : ""}`} />
  </button>;
}

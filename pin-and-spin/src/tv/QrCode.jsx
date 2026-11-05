import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

// Scannable join code (dark modules on white, the most reliable for phone cameras).
export function QrCode({ text, label }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ scalable: true, margin: 2 });
  }, [text]);
  return <div className="qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

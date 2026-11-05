import QRCode from "qrcode"
import { useEffect, useState } from "react"

import { cn } from "@/shared/lib/utils"
import { Skeleton } from "@/shared/ui/skeleton"

/**
 * QR kodu (SVG). Canvas gerektirmez; baskıda keskin çıkar. `label` ekran okuyucu için
 * görselin anlamını verir ("Kadın tuvaleti QR kodu").
 */
export function QrCode({
  value,
  label,
  size = 128,
  className,
}: {
  value: string
  label: string
  size?: number
  className?: string
}) {
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void QRCode.toString(value, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
    }).then((markup) => {
      if (active) setSvg(markup)
    })
    return () => {
      active = false
    }
  }, [value])
  if (!svg) {
    return (
      <Skeleton
        className={cn("shrink-0", className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <img
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      alt={label}
      width={size}
      height={size}
      className={cn("shrink-0 bg-white", className)}
      data-qr-value={value}
    />
  )
}

/** Base UI Slider tekli değerde `number`, aralıkta dizi döner; tekli değeri güvenle çıkarır. */
export function firstSliderValue(
  value: number | readonly number[],
  fallback = 0
): number {
  return typeof value === "number" ? value : (value[0] ?? fallback)
}

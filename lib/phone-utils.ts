// Normalización de teléfonos móviles chilenos.
// Canónico: "569XXXXXXXX" (11 dígitos, sin "+").
//
// Casos de prueba:
//   '+56995620994'     -> '56995620994'
//   '56995620994'      -> '56995620994'
//   '995620994'        -> '56995620994'
//   '95620994'         -> '56995620994'
//   '9 9562 0994'      -> '56995620994'
//   '+56 9 9562-0994'  -> '56995620994'
//   '(+56) 9 9562 0994'-> '56995620994'
//   '09 9562 0994'     -> '56995620994'
//   '0056 9 9562 0994' -> '56995620994'
//   '5622123456'       -> null  (landline — mobile chileno empieza con 9)
//   'abc'              -> null
//   '' / null / undef  -> null

export function normalizeChileanPhone(input: string | null | undefined): string | null {
  if (input == null) return null
  let digits = String(input).replace(/\D/g, '')
  if (digits.length === 0) return null

  // Drop '00' internacional si está, luego un único '0' inicial.
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)

  if (digits.length === 11 && digits.startsWith('569')) return digits
  if (digits.length === 9 && digits.startsWith('9')) return '56' + digits
  if (digits.length === 8) return '569' + digits

  return null
}

// Post-condición: /^569\d{8}$/
export function isValidNormalizedPhone(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^569\d{8}$/.test(value)
}

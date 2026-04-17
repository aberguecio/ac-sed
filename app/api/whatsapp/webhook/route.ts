import { NextResponse } from 'next/server'

// Stub reservado para la integración WhatsApp (implementada por otro miembro del equipo).
// GET: handshake de verificación del proveedor.
// POST: recibe eventos de mensajería; implementación pendiente.

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  try {
    const body = await req.text()
    console.log('[whatsapp webhook stub] body:', body)
  } catch {
    // ignore parse errors; stub
  }
  return NextResponse.json(
    { error: 'Not Implemented', todo: 'Integración WhatsApp pendiente' },
    { status: 501 }
  )
}

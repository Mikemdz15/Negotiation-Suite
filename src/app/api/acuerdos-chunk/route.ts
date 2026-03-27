import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use same SERVICE_ROLE pattern since we are doing backend insertions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const maxDuration = 60; // Max allowed for Vercel Hobby

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { chunkText, empresaId } = body;

    if (!chunkText || !empresaId) {
      return NextResponse.json({ error: 'Falta texto o ID de empresa' }, { status: 400 });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      throw new Error('Sin clave de OpenRouter');
    }

    const prompt = `Eres un extractor experto de datos estructurados corporativos. Del siguiente fragmento RAW extraído de un PDF, extrae TODOS los Acuerdos Comerciales. (Asegúrate de extraer absolutamente TODAS las filas de la tabla sin omitir ninguna).
INSTRUCCIONES CLAVE:
1. "proveedor": Está en el encabezado, usualmente dice "Acuerdo Comercial- [NOMBRE COMPAÑIA]". Si no está en este fragmento, colócalo basándote en un proveedor cercano.
2. "articulo_sku": Extrae el código EXACTO de la columna SKU (ej. PREFOR38GR).
3. "udm": Extrae la unidad de medida (ej. PZA o MILLAR o CAJA).
4. "precio_anterior": Extrae el valor numérico del precio anterior, omite el símbolo de dólar.
5. "precio_unitario": Extrae el valor numérico de la columna "PRECIO NUEVO".
6. "variacion_porcentaje": Extrae el string de % VAR (ej. "-1.81%").
7. "moq": La columna MOQ extrae el texto textual tal como viene.
8. "lead_time_dias": Extrae el LEAD TIME en días (ej. 30), si no, pon 0.
9. "moneda": Extrae la MONEDA (ej. PESOS). Si es PESOS conviertelo a MXN.
10. "fecha_inicio": Extrae la FECHA INICIO DEL PRECIO VIGENTE en formato YYYY-MM-DD. Si no existe, omite la llave.
11. "condiciones": Extrae los TÉRMINOS DE PAGO o MÉTODO DE PAGO y días de crédito del encabezado del documento (ej. "CRÉDITO 60 DÍAS" o "PPD").
Devuelve EXCLUSIVAMENTE un JSON Array puro sin markdown con este schema: [{"proveedor": "string", "articulo_sku": "string", "descripcion": "string", "udm": "string", "precio_anterior": 0.0, "precio_unitario": 0.0, "variacion_porcentaje": "string", "moq": "string", "lead_time_dias": 0, "moneda": "MXN", "fecha_inicio": "2024-01-01", "condiciones": "string"}]. Si no hay tablas, devuelve \`[]\`.
TEXTO:\n${chunkText}`;

    const iaRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!iaRes.ok) {
      console.error("OpenRouter error chunk:", await iaRes.text());
      return NextResponse.json({ inserted: 0, error: 'OpenRouter no respondió correctamente' }, { status: 502 });
    }

    const iaData = await iaRes.json();
    let rawJson = iaData.choices[0].message.content.trim();
    rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '');
    let parsed = [];
    try {
      parsed = JSON.parse(rawJson);
    } catch(e) {
      console.error("Failed to parse JSON from AI", rawJson);
      return NextResponse.json({ inserted: 0 });
    }

    if (!Array.isArray(parsed)) parsed = [];

    const allAcuerdos = parsed.filter((a: any) => a && a.articulo_sku && a.articulo_sku !== 'EMPTY' && a.articulo_sku !== 'null');
    const finalAcuerdos = allAcuerdos.map((a: any) => ({ ...a, empresa_id: empresaId }));

    if (finalAcuerdos.length > 0) {
      const { error: insError } = await supabase.from('acuerdos').insert(finalAcuerdos);
      if (insError) {
        console.error("DB Insert Chunk Error:", insError);
        return NextResponse.json({ inserted: 0, error: insError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ inserted: finalAcuerdos.length });
  } catch(e: any) {
    console.error("Chunk processing error", e);
    return NextResponse.json({ inserted: 0, error: e.message }, { status: 500 });
  }
}

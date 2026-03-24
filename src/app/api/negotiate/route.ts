import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { proveedor, macroContexto } = body;

    if (!proveedor) {
      return NextResponse.json({ error: 'Proveedor no especificado' }, { status: 400 });
    }

    // 1. Obtener datos históricos de Supabase
    const { data: acuerdos, error: errAcuerdos } = await supabase
      .from('acuerdos')
      .select('*')
      .eq('proveedor', proveedor);

    const { data: compras, error: errCompras } = await supabase
      .from('compras')
      .select('*')
      .eq('proveedor', proveedor)
      .order('fecha_creacion', { ascending: false });

    if (errAcuerdos || errCompras) {
      console.error(errAcuerdos, errCompras);
      return NextResponse.json({ error: 'Error consultando datos históricos.' }, { status: 500 });
    }

    // Calcular un resumen básico estadístico para la IA (Techos y Pisos)
    const qtyTransacciones = compras?.length || 0;
    const gastoTotal = compras?.reduce((acc: number, c: any) => acc + (Number(c.importe_neto) || 0), 0) || 0;

    const skuData: Record<string, number[]> = {};
    if (compras) {
      compras.forEach(c => {
        if (!skuData[c.articulo_sku]) skuData[c.articulo_sku] = [];
        skuData[c.articulo_sku].push(Number(c.precio_unitario));
      });
    }

    const analisisPrecios = Object.keys(skuData).map(sku => {
      const prices = skuData[sku];
      const max = Math.max(...prices);
      const min = Math.min(...prices);
      const avg = prices.reduce((a,b)=>a+b,0) / prices.length;
      return `- SKU: ${sku} | Techo (Resistencia): $${max.toFixed(2)} | Piso (Soporte): $${min.toFixed(2)} | Prom. Histórico: $${avg.toFixed(2)}`;
    }).join('\n');

    // Resumen para el prompt
    const dataSummary = `
PROVEEDOR OBJETIVO: ${proveedor}
GASTO HISTÓRICO CONSOLIDADO: $${gastoTotal.toFixed(2)} MXN
TRANSACCIONES: ${qtyTransacciones}

COMPORTAMIENTO HISTÓRICO DE PRECIOS (TECHOS Y PISOS):
${analisisPrecios || 'Sin historial de compras para calcular.'}

ACUERDOS ACTIVOS:
${acuerdos?.map((a: any) => `- SKU: ${a.articulo_sku} | Precio: ${a.precio_unitario} | MOQ: ${a.moq} | Lead Time: ${a.lead_time_dias} días`).join('\n') || 'Ninguno registrado.'}

CONTEXTO MACROECONÓMICO ADICIONAL INYECTADO POR EL USUARIO:
${macroContexto || 'Ninguno especificado.'}
`;

    // 2. Comunicar con OpenRouter
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'Clave de OpenRouter no configurada en las variables de entorno.' },
        { status: 500 }
      );
    }

    const systemPrompt = `Eres el Agente Negociador B2B de Alphalab. Has recibido los datos de gasto para el proveedor: ${proveedor}. 
Con base en la habilidad de "Estrategia B2B de 3 niveles", genera una estrategia con la siguiente estructura:
1. Objetivo Ventajoso (Anclaje)
2. Compromiso Integrador (Creación de Valor)
3. Límite de Resistencia (Umbral de Ruptura)

Toma en cuenta estrictamente los MOQs actuales, y el Contexto Macroeconómico para neutralizar inflación de costos especulativos.
Devuelve tu repuesta formateada elegantemente en HTML o Markdown. ¡IMPORTANTE! Evita absolutamente las alucinaciones. Si el contexto no justifica un precio, no lo asumas.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o', // Model de alta capacidad para razonamiento
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: dataSummary }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenRouter Error", errorData);
      return NextResponse.json({ error: 'Error del motor de Inteligencia Artificial.' }, { status: 502 });
    }

    const iaData = await response.json();
    const estrategia = iaData.choices[0].message.content;

    return NextResponse.json({ estrategia });

  } catch (error: any) {
    console.error("Negotiation API error: ", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

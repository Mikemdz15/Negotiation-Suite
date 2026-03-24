import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as xlsx from 'xlsx';
const PDFParser = require('pdf2json');

// Se ocupa el SERVICE_ROLE para el Drop & Replace, ya que implica bypass de politicas RLS o acceso total a DB
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const excelFile = formData.get('excel') as File | null;
    const pdfFile = formData.get('pdf') as File | null;

    if (!excelFile || !pdfFile) {
      return NextResponse.json({ error: 'Faltan archivos' }, { status: 400 });
    }

    // --- 1. Subida Opcional a Storage (Para Respaldo Mensual) ---
    const monthId = new Date().toISOString().substring(0, 7); // Formato YYYY-MM
    await supabase.storage.from('documentos_mensuales').upload(`${monthId}_compras.xlsx`, excelFile, { upsert: true });
    await supabase.storage.from('documentos_mensuales').upload(`${monthId}_acuerdos.pdf`, pdfFile, { upsert: true });

    // --- 2. TRUNCATE DB (Drop & Replace) ---
    // Invocamos la RPC creada en el schema.sql inicial
    const { error: rpcError } = await supabase.rpc('truncate_data_for_monthly_update');
    if (rpcError) {
      console.error("Error truncating:", rpcError);
      return NextResponse.json({ error: 'Fallo al purgar la base de datos previa. ' + rpcError.message }, { status: 500 });
    }

    // --- 3. Procesamiento del Excel ---
    const buffer = Buffer.from(await excelFile.arrayBuffer());
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Parseo seguro de filas al esquema de DB (compras)
    const normalizedData = rawData.map((row: any) => {
      let fCreacion = null;
      if (row['Fecha de creación']) {
        if (typeof row['Fecha de creación'] === 'number') {
          // Fix Excel decimal serial dates to UTC
          fCreacion = new Date(Math.round((row['Fecha de creación'] - 25569) * 86400 * 1000));
        } else {
          fCreacion = new Date(row['Fecha de creación']);
        }
      }

      return {
        proveedor: row['Proveedor: Nombre de la empresa'] || 'DESCONOCIDO',
        articulo_sku: row['Artículo: Nombre'] || row['Artculo: Nombre'] || 'N/A',
        descripcion_articulo: row['Artículo: Descripción (compras)'] || '',
        cantidad_recibida: Number(row['Cantidad recibida']) || 0,
        precio_unitario: Number(row['Precio unitario de cambio']) || 0,
        importe_neto: Number(row['Importe (neto)']) || 0,
        fecha_creacion: fCreacion
      };
    }).filter((r: any) => r.importe_neto !== 0);

    // Insert en lotes de 1000 para Supabase
    const BATCH_SIZE = 1000;
    for (let i = 0; i < normalizedData.length; i += BATCH_SIZE) {
      const batch = normalizedData.slice(i, i + BATCH_SIZE);
      const { error: insErr } = await supabase.from('compras').insert(batch);
      if (insErr) {
        console.error("Error batch insert:", insErr);
        throw new Error("Fallo la inyección de historial de compras: " + insErr.message);
      }
    }

    // --- 4. Procesamiento Automático (Agentic Ai) del PDF ---
    try {
      const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
      
      const pdfText = await new Promise<string>((resolve, reject) => {
        const pdfParser = new PDFParser(null, 1);
        pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
        pdfParser.parseBuffer(pdfBuffer);
      });

      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      if (OPENROUTER_API_KEY && pdfText) {
        const CHUNK_SIZE = 40000;
        const chunks = [];
        for (let i = 0; i < pdfText.length; i += CHUNK_SIZE) {
          chunks.push(pdfText.substring(i, i + CHUNK_SIZE));
        }

        const chunkPromises = chunks.map(async (chunkText) => {
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
Devuelve EXCLUSIVAMENTE un JSON Array puro sin markdown con este schema: [{"proveedor": "string", "articulo_sku": "string", "descripcion": "string", "udm": "string", "precio_anterior": 0.0, "precio_unitario": 0.0, "variacion_porcentaje": "string", "moq": "string", "lead_time_dias": 0, "moneda": "MXN", "fecha_inicio": "2024-01-01"}]. Si no hay tablas, devuelve \`[]\`.
TEXTO:\n${chunkText}`;
          
          try {
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

            if (iaRes.ok) {
              const iaData = await iaRes.json();
              let rawJson = iaData.choices[0].message.content.trim();
              rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '');
              const parsed = JSON.parse(rawJson);
              return Array.isArray(parsed) ? parsed : [];
            }
          } catch(e) {
            console.error("Error AI Chunk", e);
          }
          return [];
        });

        const chunkedResults = await Promise.all(chunkPromises);
        const allAcuerdos = chunkedResults.flat().filter(a => a && a.articulo_sku && a.articulo_sku !== 'EMPTY' && a.articulo_sku !== 'null');
        
        if (allAcuerdos.length > 0) {
          const { error: insError } = await supabase.from('acuerdos').insert(allAcuerdos);
          if(insError) console.error("Error insertando Acuerdos:", insError);
        }
      }
    } catch (pdfErr) {
      console.error("No se pudo extraer el PDF con IA, omitiendo acuerdos: ", pdfErr);
    }

    return NextResponse.json({ success: true, message: `Procesados ${normalizedData.length} registros y extraídos Acuerdos del PDF.` });

  } catch (error: any) {
    console.error("Upload API error: ", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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
    const empresaId = formData.get('empresaId') as string | null;
    const empresaNombre = formData.get('empresaNombre') as string | null;

    if (!excelFile || !pdfFile || !empresaId || !empresaNombre) {
      return NextResponse.json({ error: 'Faltan archivos o contexto empresarial faltante' }, { status: 400 });
    }

    // --- 0. VALIDACION DE SUBSIDIARIA OBLIGATORIA (Cero Contaminación) ---
    const buffer = Buffer.from(await excelFile.arrayBuffer());
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (rawData.length > 0) {
      // Find the first valid row that contains 'Subsidiaria: Nombre'
      const sampleRow: any = rawData.find((r: any) => r['Subsidiaria: Nombre']);
      if (sampleRow) {
        const fileSubsidiary = (sampleRow['Subsidiaria: Nombre'] || '').trim().toLowerCase();
        const activeCompany = (empresaNombre || '').trim().toLowerCase();
        
        // Match check: If strings don't overlap or match
        if (!fileSubsidiary.includes(activeCompany) && !activeCompany.includes(fileSubsidiary)) {
          return NextResponse.json({ 
            error: `¡Alerta de Contaminación Cruzada! El archivo Excel pertenece a la subsidiaria "${sampleRow['Subsidiaria: Nombre']}", pero estás intentando subirlo a la empresa "${empresaNombre}". Cambia de empresa en la barra superior o sube el archivo correcto.` 
          }, { status: 400 });
        }
      }
    }

    // --- 1. Subida Opcional a Storage (Para Respaldo Mensual) ---
    const monthId = new Date().toISOString().substring(0, 7); // Formato YYYY-MM
    await supabase.storage.from('documentos_mensuales').upload(`${monthId}_${empresaId}_compras.xlsx`, excelFile, { upsert: true });

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
        empresa_id: empresaId,
        proveedor: row['Proveedor: Nombre de la empresa'] || 'DESCONOCIDO',
        articulo_sku: row['Artículo: Nombre'] || row['Artculo: Nombre'] || 'N/A',
        descripcion_articulo: row['Artículo: Descripción (compras)'] || '',
        cantidad_recibida: Number(row['Cantidad recibida']) || 0,
        precio_unitario: Number(row['Precio unitario de cambio']) || 0,
        importe_neto: Number(row['Importe (neto)']) || 0,
        fecha_creacion: fCreacion
      };
    }).filter((r: any) => r.importe_neto !== 0 || r.cantidad_recibida !== 0);

    // --- 2. Drop & Replace: Borrar datos anteriores para evitar duplicidad ---
    const { error: delComprasErr } = await supabase
      .from('compras')
      .delete()
      .eq('empresa_id', empresaId);
      
    if (delComprasErr) {
      console.error("Error deleting old compras:", delComprasErr);
      throw new Error("Fallo al limpiar historial de compras anterior: " + delComprasErr.message);
    }

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
11. "condiciones": Extrae los TÉRMINOS DE PAGO o MÉTODO DE PAGO y días de crédito del encabezado del documento (ej. "CRÉDITO 60 DÍAS" o "PPD").
Devuelve EXCLUSIVAMENTE un JSON Array puro sin markdown con este schema: [{"proveedor": "string", "articulo_sku": "string", "descripcion": "string", "udm": "string", "precio_anterior": 0.0, "precio_unitario": 0.0, "variacion_porcentaje": "string", "moq": "string", "lead_time_dias": 0, "moneda": "MXN", "fecha_inicio": "2024-01-01", "condiciones": "string"}]. Si no hay tablas, devuelve \`[]\`.
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
        
        const finalAcuerdos = allAcuerdos.map(a => ({ ...a, empresa_id: empresaId }));

        let acuerdosInsertados = 0;
        if (finalAcuerdos.length > 0) {
          // --- Drop & Replace para Acuerdos ---
          const { error: delAcuerdosErr } = await supabase
            .from('acuerdos')
            .delete()
            .eq('empresa_id', empresaId);
            
          if (delAcuerdosErr) {
            console.error("Error deleting old acuerdos:", delAcuerdosErr);
          }

          const { error: insError } = await supabase.from('acuerdos').insert(finalAcuerdos);
          if (insError) {
            console.error("Error insertando Acuerdos:", insError);
          } else {
            acuerdosInsertados = finalAcuerdos.length;
          }
        }

        if (acuerdosInsertados === 0) {
          return NextResponse.json({ success: true, message: `Historial de compras guardado (${normalizedData.length} cols). SIN EMBARGO, no se detectaron Acuerdos en el PDF. Si el archivo es una imagen o documento escaneado, el sistema no puede leerlo. Sube un PDF exportado con texto nativo.` });
        }

        return NextResponse.json({ success: true, message: `Procesados ${normalizedData.length} registros y extraídos ${acuerdosInsertados} Acuerdos del PDF.` });
      }
    } catch (pdfErr) {
      console.error("No se pudo extraer el PDF con IA, omitiendo acuerdos: ", pdfErr);
      return NextResponse.json({ success: true, message: `Historial guardado, pero falló la lectura del PDF por un error en el servidor AI.` });
    }

    return NextResponse.json({ success: true, message: `Historial guardado, pero no se pudo leer el PDF.` });

  } catch (error: any) {
    console.error("Upload API error: ", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

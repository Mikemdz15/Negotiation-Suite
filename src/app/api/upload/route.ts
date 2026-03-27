import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as xlsx from 'xlsx';
const PDFParser = require('pdf2json');

export const maxDuration = 300; // Increase Vercel function timeout to 5 minutes

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
    const delComprasPromise = supabase.from('compras').delete().eq('empresa_id', empresaId);
    const delAcuerdosPromise = supabase.from('acuerdos').delete().eq('empresa_id', empresaId);
    
    const [delComprasRes, delAcuerdosRes] = await Promise.all([delComprasPromise, delAcuerdosPromise]);
      
    if (delComprasRes.error) {
      console.error("Error deleting old compras:", delComprasRes.error);
      throw new Error("Fallo al limpiar historial de compras anterior: " + delComprasRes.error.message);
    }
    if (delAcuerdosRes.error) {
      console.error("Error deleting old acuerdos:", delAcuerdosRes.error);
    }

    // --- 3. Iniciar el parseo del PDF en background ---
    const pdfPromise = (async () => {
      try {
        const pdBuf = Buffer.from(await pdfFile.arrayBuffer());
        return await new Promise<string>((resolve, reject) => {
          const pdfParser = new PDFParser(null, 1);
          pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
          pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
          pdfParser.parseBuffer(pdBuf);
        });
      } catch (err) {
        console.error("No se pudo extraer el PDF crudo:", err);
        return '';
      }
    })();

    // Insert en lotes masivos para Vercel (hasta 5000)
    const BATCH_SIZE = 5000;
    for (let i = 0; i < normalizedData.length; i += BATCH_SIZE) {
      const batch = normalizedData.slice(i, i + BATCH_SIZE);
      const { error: insErr } = await supabase.from('compras').insert(batch);
      if (insErr) {
        console.error("Error batch insert:", insErr);
        throw new Error("Fallo la inyección de historial de compras: " + insErr.message);
      }
    }

    // --- 4. Extracción Inicial del PDF (La IA se orquesta desde el Cliente) ---
    const extractedPdfText = await pdfPromise;

    return NextResponse.json({ 
      success: true, 
      message: `Procesados ${normalizedData.length} registros del historial. Iniciando lectura inteligente de Acuerdos...`,
      pdfText: extractedPdfText
    });

  } catch (error: any) {
    console.error("Upload API error: ", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

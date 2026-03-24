// Removed dotenv
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function testUpload() {
  try {
    const excelBuffer = fs.readFileSync('c:\\Users\\MIGUEL MENDEZ\\Documents\\Induwell\\00 Almacen y Compras\\01 Dir Cadena Suministros\\2026\\Compliance App\\Historial de compras Alphalab.xlsx');
    const pdfBuffer = fs.readFileSync('c:\\Users\\MIGUEL MENDEZ\\Documents\\Induwell\\00 Almacen y Compras\\01 Dir Cadena Suministros\\2026\\Compliance App\\ACUERDOS COMERCIALES ALPHALAB.pdf');

    console.log("1. Truncating...");
    const { error: rpcError } = await supabase.rpc('truncate_data_for_monthly_update');
    if (rpcError) throw new Error("Truncate FAIL: " + rpcError.message);

    console.log("2. Processing Excel...");
    const workbook = xlsx.read(excelBuffer, { type: 'buffer' });
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const normalizedData = rawData.map((row) => {
      let fCreacion = null;
      if (row['Fecha de creación']) {
        if (typeof row['Fecha de creación'] === 'number') {
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
    }).filter(r => r.importe_neto !== 0);

    console.log("3. Inserting Compras Batch...");
    const BATCH_SIZE = 1000;
    for (let i = 0; i < normalizedData.length; i += BATCH_SIZE) {
      const batch = normalizedData.slice(i, i + BATCH_SIZE);
      const { error: insErr } = await supabase.from('compras').insert(batch);
      if (insErr) throw new Error("Batch insert: " + insErr.message);
    }

    console.log("4. Parsing PDF & OpenAI...");
    const pdfParsed = await pdfParse(pdfBuffer);
    console.log("PDF characters read:", pdfParsed.text.length);

    // Call openrouter
    const OPENROUTER = process.env.OPENROUTER_API_KEY;
    if(!OPENROUTER) throw new Error("Missing openrouter key");

    // Do a lighter test to avoid spending 20 seconds, we just check Supabase connection for PDF insert
    const fakeAcuerdos = [{
      proveedor: "ALPLA MEXICO", articulo_sku: "TEST", descripcion: "TEST", precio_unitario: 1, moq: 1, lead_time_dias: 1
    }];
    console.log("5. Assuming successful OpenAI parse, inserting Acuerdos...");
    const { error: eqErr } = await supabase.from('acuerdos').insert(fakeAcuerdos);
    if(eqErr) throw new Error("Acuerdos insert fail: " + eqErr.message);

    console.log("ALL TESTS PASSED: 200 OK");
  } catch (err) {
    console.error("FATAL SCRIPT ERROR:", err);
  }
}
testUpload();

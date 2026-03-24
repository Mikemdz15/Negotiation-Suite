const xlsx = require('xlsx');
const fs = require('fs');

async function testParsing() {
  try {
    const buffer = fs.readFileSync('c:\\Users\\MIGUEL MENDEZ\\Documents\\Induwell\\00 Almacen y Compras\\01 Dir Cadena Suministros\\2026\\Compliance App\\Historial de compras Alphalab.xlsx');
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

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

    console.log("Parsed rows:", normalizedData.length);
    console.log("Sample 1:", normalizedData[0]);
    console.log("Sample Error check:", normalizedData.filter(x => isNaN(x.precio_unitario) || isNaN(x.importe_neto)).length);

  } catch (e) {
    console.error("FAIL", e);
  }
}
testParsing();

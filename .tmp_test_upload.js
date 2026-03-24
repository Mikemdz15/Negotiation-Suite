const fs = require('fs');

async function sendUpload() {
  try {
    const FormData = require('form-data');
    const form = new FormData();
    
    // Add real files from the user's machine
    const excelPath = 'c:\\Users\\MIGUEL MENDEZ\\Documents\\Induwell\\00 Almacen y Compras\\01 Dir Cadena Suministros\\2026\\Compliance App\\Historial de compras Alphalab.xlsx';
    const pdfPath = 'c:\\Users\\MIGUEL MENDEZ\\Documents\\Induwell\\00 Almacen y Compras\\01 Dir Cadena Suministros\\2026\\Compliance App\\ACUERDOS COMERCIALES ALPHALAB.pdf';
    
    if (fs.existsSync(excelPath)) {
      form.append('excel', fs.createReadStream(excelPath));
    }
    if (fs.existsSync(pdfPath)) {
      form.append('pdf', fs.createReadStream(pdfPath));
    }

    const { default: fetch } = await import('node-fetch');

    const res = await fetch('http://localhost:3000/api/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const body = await res.text();
    console.log("STATUS:", res.status);
    console.log("RESPONSE BODY:", body);
  } catch (err) {
    console.log("FETCH ERROR:", err);
  }
}

sendUpload();

// Test pdf2json
const fs = require('fs');
const PDFParser = require("pdf2json");

async function testPdf2json() {
  const pdfBuffer = fs.readFileSync('c:\\Users\\MIGUEL MENDEZ\\Documents\\Induwell\\00 Almacen y Compras\\01 Dir Cadena Suministros\\2026\\Compliance App\\ACUERDOS COMERCIALES ALPHALAB.pdf');
  
  const pdfText = await new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);
    pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
    pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
    pdfParser.parseBuffer(pdfBuffer);
  });

  console.log("Extracted characters:", pdfText.length);
  console.log("Snippet:", pdfText.substring(0, 100));
}
testPdf2json();

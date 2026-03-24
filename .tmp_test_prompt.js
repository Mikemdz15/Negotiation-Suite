const PDFParser = require("pdf2json");
const fs = require('fs');

async function testPrompt() {
  const pdfBuffer = fs.readFileSync('c:\\Users\\MIGUEL MENDEZ\\Documents\\Induwell\\00 Almacen y Compras\\01 Dir Cadena Suministros\\2026\\Compliance App\\ACUERDOS COMERCIALES ALPHALAB.pdf');
  
  const pdfText = await new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);
    pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
    pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
    pdfParser.parseBuffer(pdfBuffer);
  });

  const prompt = `Extrae los Acuerdos Comerciales de este PDF.
El encabezado tiene el proveedor, ej: "Acuerdo Comercial- ALPLA MEXICO SA DE CV".
Cada fila de la tabla inferior tiene:
1. SKU (EJ: PREFOR38GR) -> "articulo_sku"
2. DESCRIPCIÓN (EJ: PREFORMA R38) -> "descripcion"
3. UDM (EJ: PZA) -> "udm"
4. PRECIO ANTERIOR (EJ: $1.66) -> "precio_anterior" (Float)
5. PRECIO NUEVO (EJ: $1.63) -> "precio_nuevo" (Float)
6. % VAR (EJ: -1.81%) -> "variacion_porcentaje" (String)
7. FECHA INICIO (EJ: 01/01/2026) -> "fecha_inicio" (YYYY-MM-DD)
8. MOQ (EJ: MIX DE 60 GAYLORS) -> "moq" (String)
9. MONEDA (EJ: PESOS) -> "moneda" (String)

Devuelve ÚNICAMENTE un JSON Array puro, nada de markdown, siguiendo esta estructura exacta:
[
  {
    "proveedor": "ALPLA MEXICO SA DE CV",
    "articulo_sku": "PREFOR38GR",
    "descripcion": "PREFORMA R38",
    "udm": "PZA",
    "precio_anterior": 1.66,
    "precio_nuevo": 1.63,
    "variacion_porcentaje": "-1.81%",
    "fecha_inicio": "2026-01-01",
    "moq": "MIX DE 60 GAYLORS",
    "moneda": "MXN"
  }
]
No inventes datos. Si falta, pon null o "".
TEXTO DEL PDF:
${pdfText.substring(0, 10000)}
`;

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY; // Requires env pass
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  const dat = await res.json();
  console.log("AI RESPONSE HEAD:", dat.choices[0].message.content.substring(0, 500));
}

testPrompt();

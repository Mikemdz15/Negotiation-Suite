import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { proveedor, macroContexto, selectedSkus, empresaId } = body;

    if (!proveedor || !empresaId) {
      return NextResponse.json({ error: 'Proveedor o Empresa no especificados' }, { status: 400 });
    }

    let acuerdos = [];
    let compras = [];

    try {
      const cleanProv = proveedor.replace(/S\.?A\.?\s*(de\s*C\.?V\.?)?$/i, '').trim();

      const fetchAllCompras = async (queryBuilder: any) => {
        let allData: any[] = [];
        let step = 1000;
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await queryBuilder.range(from, from + step - 1);
          if (error) throw error;
          if (data && data.length > 0) {
            allData = allData.concat(data);
            from += step;
            if (data.length < step) hasMore = false;
          } else {
            hasMore = false;
          }
        }
        return allData;
      };

      if (selectedSkus && selectedSkus.length > 0) {
        // If user already picked specific SKUs from UI, fetch just those for this supplier
        const { data: aSku, error: errA } = await supabase.from('acuerdos').select('*').eq('empresa_id', empresaId).in('articulo_sku', selectedSkus).ilike('proveedor', `%${cleanProv}%`);
        
        let q = supabase.from('compras').select('*').eq('empresa_id', empresaId).in('articulo_sku', selectedSkus).ilike('proveedor', `%${cleanProv}%`).order('fecha_creacion', { ascending: false });
        const cSku = await fetchAllCompras(q);
        
        if (errA) throw new Error("Error fetching by selected SKUs");
        acuerdos = aSku || [];
        compras = cSku || [];
      } else {
        // Fallback: Smart cross-referencing by exact substring match
        const { data: acuerdosByName } = await supabase.from('acuerdos').select('*').eq('empresa_id', empresaId).ilike('proveedor', `%${cleanProv}%`);
        
        let qByName = supabase.from('compras').select('*').eq('empresa_id', empresaId).ilike('proveedor', `%${cleanProv}%`).order('fecha_creacion', { ascending: false });
        const comprasByName = await fetchAllCompras(qByName);

        const skuSet = new Set<string>();
        acuerdosByName?.forEach((a: any) => { if (a.articulo_sku) skuSet.add(a.articulo_sku); });
        comprasByName?.forEach((c: any) => { if (c.articulo_sku) skuSet.add(c.articulo_sku); });

        if (skuSet.size > 0) {
          const skuArray = Array.from(skuSet);
          const { data: aSku } = await supabase.from('acuerdos').select('*').eq('empresa_id', empresaId).in('articulo_sku', skuArray).ilike('proveedor', `%${cleanProv}%`);
          
          let qSku = supabase.from('compras').select('*').eq('empresa_id', empresaId).in('articulo_sku', skuArray).ilike('proveedor', `%${cleanProv}%`).order('fecha_creacion', { ascending: false });
          const cSku = await fetchAllCompras(qSku);
          
          acuerdos = aSku || acuerdosByName || [];
          compras = cSku || comprasByName || [];
        } else {
          acuerdos = acuerdosByName || [];
          compras = comprasByName || [];
        }
      }
    } catch (err: any) {
      console.error(err);
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

    // Calcular la tendencia de volumen histórico por SKU y por año
    const comprasPorSkuAno: Record<string, Record<string, number>> = {};
    const gastoPorAnoObj: Record<string, number> = {};

    if (compras) {
      compras.forEach((c: any) => {
        if (c.fecha_creacion && c.articulo_sku) {
          const year = new Date(c.fecha_creacion).getFullYear().toString();
          const sku = c.articulo_sku;
          
          if (!comprasPorSkuAno[sku]) comprasPorSkuAno[sku] = {};
          comprasPorSkuAno[sku][year] = (comprasPorSkuAno[sku][year] || 0) + Number(c.cantidad_recibida || 0);
          
          gastoPorAnoObj[year] = (gastoPorAnoObj[year] || 0) + Number(c.importe_neto || 0);
        }
      });
    }

    const tendenciaVolumen = Object.keys(comprasPorSkuAno).map(sku => {
      const years = Object.keys(comprasPorSkuAno[sku]).sort();
      const vols = years.map(y => `${y}: ${comprasPorSkuAno[sku][y].toLocaleString()} piezas`).join(' | ');
      return `* SKU [${sku}]: ${vols}`;
    }).join('\n');

    const gastoPorAnoStr = Object.keys(gastoPorAnoObj).sort().map(y => {
      return `* ${y}: $${gastoPorAnoObj[y].toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }).join('\n');

    // Detectar % exigido en el macro contexto
    let topesPrecalculados = "";
    const macroStr = macroContexto || '';
    const pctMatch = macroStr.match(/(\d+(?:\.\d+)?)%/);

    if (pctMatch) {
      const exigidoPct = parseFloat(pctMatch[1]);
      const n2Perc = exigidoPct * 0.5;
      const n3Perc = exigidoPct * 0.7;

      topesPrecalculados += `\nLÍMITES MATEMÁTICOS PRE-CALCULADOS (CERO ERRORES - COPIA OBLIGATORIAMENTE ESTOS VALORES):\n`;
      topesPrecalculados += `El analista determinó del contexto un aumento exigido del ${exigidoPct}%. Por mandato corporativo, el Nivel 2 es máximo al ${n2Perc}% y el Nivel 3 al ${n3Perc}%.\n`;

      Object.keys(skuData).forEach(sku => {
        const acuerdo = acuerdos?.find((a: any) => a.articulo_sku === sku);
        const precioBase = acuerdo ? Number(acuerdo.precio_unitario) : Math.min(...skuData[sku]);

        const n1 = precioBase;
        const n2 = precioBase * (1 + (n2Perc / 100));
        const n3 = precioBase * (1 + (n3Perc / 100));

        topesPrecalculados += `- SKU [${sku}]: Base $${n1.toFixed(2)} | Nivel 1 = $${n1.toFixed(2)} | Nivel 2 = $${n2.toFixed(2)} | Nivel 3 = $${n3.toFixed(2)}\n`;
      });
    }

    // Resumen para el prompt
    const dataSummary = `
PROVEEDOR OBJETIVO: ${proveedor}
GASTO HISTÓRICO CONSOLIDADO: $${gastoTotal.toFixed(2)} MXN
TRANSACCIONES: ${qtyTransacciones}

COMPORTAMIENTO HISTÓRICO DE PRECIOS (TECHOS Y PISOS):
${analisisPrecios || 'Sin historial de compras para calcular.'}

TENDENCIA DE VOLUMEN HISTÓRICO (AGRUPADO POR AÑO Y SKU):
${tendenciaVolumen || 'Sin historial de volumen para calcular.'}

GASTO HISTÓRICO CONSOLIDADO POR AÑO (MXN):
${gastoPorAnoStr || 'Sin historial de gasto para calcular.'}

ACUERDOS ACTIVOS:
${acuerdos?.map((a: any) => `- SKU: ${a.articulo_sku} | Precio: $${a.precio_unitario.toFixed(2)} | MOQ: ${a.moq} | Lead Time: ${a.lead_time_dias} días | Términos de Pago: ${a.condiciones || 'No especificado'}`).join('\n') || 'Ninguno registrado.'}

${topesPrecalculados}
CONTEXTO MACROECONÓMICO:
${macroContexto || 'No proporcionado.'}
`;

    // 2. Comunicar con OpenRouter
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'Clave de OpenRouter no configurada en las variables de entorno.' },
        { status: 500 }
      );
    }

    const systemPrompt = `Actúa como un Director de Cadena de Suministro y Estratega Avanzado de Compras B2B para el sector manufacturero. Tu objetivo es diseñar estrategias de negociación altamente tácticas, cuantitativas y de contención de costos para cuentas clave.

El usuario te proporcionará datos sobre un proveedor, la materia prima, el contexto macroeconómico y exigencias del proveedor (ej. inflación, aumentos solicitados), el gasto histórico y las condiciones actuales. 

REGLA DE ORO (CERO ALUCINACIONES Y LÍMITES ESTRICTOS): 
1. Cero alucinaciones: Basa tus cálculos ÚNICAMENTE en la data. Jamás inventes índices o cifras.
2. Contención Matemática del Contexto Macro: Utiliza ÚNICAMENTE los "LÍMITES MATEMÁTICOS PRE-CALCULADOS" proporcionados en la data para establecer el precio del Nivel 1, Nivel 2 y Nivel 3. ¡ES UNA IMPOSICIÓN DE SISTEMA! COPIA Y PEGA EXACTAMENTE el valor calculado. Si no existe la sección pre-calculada, entonces sí realiza tú mismo la operación recordando no exceder el 50% y 70%.

3. REGLA DE VOLUMEN (AÑOS INCOMPLETOS): Al analizar la tendencia de volumen anual para justificar tu exigencia, IGNORA el año en curso (ej. 2026) para determinar si bajó o subió, ya que es un año incompleto estadísticamente. Compara estrictamente el último año cerrado (ej. 2025) versus el anterior (ej. 2024). Si de 2024 a 2025 el volumen subió, tu argumento DEBE SER que hemos incrementado significativamente las compras y por nuestra lealtad exigimos mantener el precio. Usa el año actual solo como referencia secundaria.

4. REGLA DE INGENIERÍA FINANCIERA (PLAZOS DE PAGO Y PRONTO PAGO): El costo del dinero (factoraje/interés) es de 16% a 20% anual en el mercado, equivalente a entre 1.2% y 1.7% mensual. Es OBLIGATORIO que, si en el Nivel 2 o Nivel 3 concedes un aumento de precio, exijas a cambio una extensión en las Condiciones de Pago de por lo menos 30 a 60 días de crédito adicionales. Debes argumentar matemáticamente que conceder esos 30 días de crédito equivale a un descuento financiero a nuestro favor de ~1.5%, lo cual sirve para "pagar" o amortizar parcialmente el aumento de precio que les estamos aceptando.

5. REGLA DE PRONTO PAGO (OPCIÓN DE LIQUIDEZ): Como alternativa a la exigencia de extensión de crédito, DEBES ofrecer siempre en los Niveles 2 y 3 un esquema de "Pronto Pago" para solucionar la pretensión de aumento. Si el proveedor necesita flujo de efectivo, ofrécele pagarle anticipadamente a cambio de un descuento:
   - En Nivel 2 (donde exigirías +30 días de crédito), ofrécele como alternativa pagarle de contado o pronto pago a cambio de un descuento del 3% sobre el nuevo precio.
   - En Nivel 3 (donde exigirías +60 días de crédito), ofrécele el pronto pago a cambio de un descuento del 6% sobre el precio de ruptura.
   - Argumento OBLIGATORIO para Compras: Menciona que este descuento por pronto pago se traduce matemáticamente en un rendimiento anualizado extraordinario cercano al 36% para el proveedor. Esta opción de pronto pago debe plantearse junto a la extensión de crédito en la misma sección de Beneficios Exigibles / Compensación y en el guion correspondiente.

*** EJEMPLO DE USO DE LÍMITES ***
Si en la data dice "SKU [PELICULA]: Nivel 1 = $34.00 | Nivel 2 = $35.53 | Nivel 3 = $36.14", tu DEBER es escribir literamente "$35.53" en la directriz del Nivel 2 y "$36.14" en el Nivel 3. NUNCA SUMES NADA MÁS. NUNCA TE JUSTIFIQUES CON EL PROMEDIO HISTÓRICO.

Tu respuesta DEBE seguir estrictamente la siguiente estructura y formato en Markdown, sin omitir ninguna sección, tabla o viñeta. Utiliza un tono corporativo, analítico, persuasivo y orientado a resultados financieros.

### Estructura Obligatoria:

# Estrategia de Negociación B2B: ${proveedor}

**Misión Funcional:** Redacta un párrafo breve definiendo el objetivo algorítmico frente a la pretensión del proveedor documentada en el contexto macroeconómico.

### ANÁLISIS DE DATOS HISTÓRICOS (SIN ALUCINACIONES)
Copia LITERAL Y EXACTAMENTE los datos tal cual los reporté en el "CONTEXTO" de tus instrucciones. PROHIBIDO comentar o agregar análisis de texto aquí. Imprime las siguientes 4 listas planas:

**1. Comparativo de Volumen por Año:**
[Imprime la TENDENCIA DE VOLUMEN HISTÓRICO exactamente como te la pasé]

**2. Gasto Histórico por Año (MXN):**
[Imprime el GASTO HISTÓRICO CONSOLIDADO POR AÑO exactamente como te lo pasé]

**3. Techos y Pisos Históricos por SKU:**
[Imprime el COMPORTAMIENTO HISTÓRICO DE PRECIOS exactamente como te lo pasé]

**4. Acuerdos Activos y Condiciones de Pago:**
[Imprime los ACUERDOS ACTIVOS tal cual, resaltando los Términos de Pago para referencia durante la negociación]

### PASO 3: Generación de la Estrategia (Progresión de 3 Niveles)
Desarrolla el guion táctico para el equipo de compras, asegurando que los argumentos utilicen las cifras exactas provistas en la entrada. 
**REGLA IMPORTANTE PARA EL PASO 3:** 
1) **Volumen Literal:** Es **forzoso** analizar la "TENDENCIA DE VOLUMEN HISTÓRICO". Tienes que escribir textualmente cada SKU y su evolución anual, con esta estructura exacta obligatoria: "compra en [Año1] [Cantidad] unidades, compra en [Año2] [Cantidad] unidades". Calcula el déficit/superavit absoluto e insértalo como el argumento principal.
2) **Imprimir Límites Matemáticos:** En el Nivel 1 debes escribir numéricamente el "Piso (Soporte)" histórico (y usarlo como meta). En el Nivel 2, el precio que aceptes (que no superará el 50% de lo exigido por el proveedor). En el Nivel 3 debes escribir numéricamente el "Techo de Resistencia" calculado obligatoriamente al máximo 70% del incremento pretendido, y no debes rebasarlo.

**Nivel 1: El Objetivo Ventajoso (Anclaje Agresivo y Distributivo)**
* **Objetivo Táctico:** Rechazo rotundo fundamentado en las comparativas anuales de volumen cerrado (ej. 2024 vs 2025).
* **Directriz de Precio Unitario:** [Lista el Precio Piso (Soporte) o el actual].
* **Beneficios Exigibles / Compensación:** Exigir mejores plazos de pago o mantener condiciones dado el historial.
* **Guion para Compras (Justificación):** "[Diálogo exacto y profesional, citando el ALZA o BAJA de volumen por SKU en los años cerrados ignorando el año actual, plantándote en el soporte]".

**Nivel 2: El Compromiso Integrador (Creación de Valor Conjunto)**
* **Objetivo Táctico:** Cedemos máximo el 50% de lo que pidió el proveedor para destrabar la negociación y asegurar mejoras financieras conjuntas.
* **Directriz de Precio Unitario:** [Precio calculado exactamente a no más de 50% del aumento pretendido por cada SKU].
* **Beneficios Exigibles / Compensación:** [OBLIGATORIO exigir +30 días de crédito (rescate financiero del ~1.5% mensual) O, COMO ALTERNATIVA DE LIQUIDEZ, ofrecer pagarles por anticipado (Pronto Pago) a cambio de un descuento del 3% sobre la factura pactada].
* **Guion para Compras (Justificación):** "[Diálogo que ofrezca nuestra concesión en precio ÚNICAMENTE condicionada a que nos otorguen los 30 días adicionales, o bien, si necesitan liquidez, podemos liquidar por anticipado obteniendo un 3% de descuento por pronto pago (rendimiento anualizado del 36% para ellos)]".

**Nivel 3: El Límite de Resistencia (Umbral de Ruptura)**
* **Objetivo Táctico:** El límite físico de nuestra empresa fijado al 70% innegociable del aumento solicitado, respaldado por condiciones comerciales extendidas.
* **Directriz de Precio Unitario:** [Precio techo matemáticamente calculado al 70%].
* **Beneficios Exigibles / Compensación:** [Última concesión comercial exigible: +60 días de crédito (alivio financiero del 3% bimestral), O BIEN ofrecer pagos anticipados (Pronto Pago) a cambio de un descuento del 6% sobre el valor total de la factura].
* **Acción de Ejecución (BATNA):** "[Aviso de migración a otros proveedores si excede esta franja estricta de precio y condiciones de plazo/pronto pago]".

Reglas adicionales: No agregues conclusiones genéricas ni saludos al final. Termina la respuesta directamente después de la "Acción de Ejecución" del Nivel 3.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 segundos timeout de seguridad

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'openai/gpt-4o', // Model de alta capacidad para razonamiento
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: dataSummary }
          ]
        })
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.text();
        console.error("OpenRouter Error", errorData);
        return NextResponse.json({ error: 'Error del motor de Inteligencia Artificial.' }, { status: 502 });
      }

      const iaData = await response.json();
      const estrategia = iaData.choices[0].message.content;

      return NextResponse.json({ estrategia });

    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json({ error: 'Tiempo de espera agotado. OpenRouter / GPT-4o tardó más de 120 segundos en responder.' }, { status: 504 });
      }
      throw fetchErr;
    }

  } catch (error: any) {
    console.error("Negotiation API error: ", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

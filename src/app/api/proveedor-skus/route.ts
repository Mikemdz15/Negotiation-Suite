import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proveedor = searchParams.get('proveedor');
    const empresaId = searchParams.get('empresaId');

    if (!proveedor || !empresaId) {
      return NextResponse.json({ skus: [] });
    }

    // We use exactly what the user provides, since they will copy it from agreements
    const cleanProv = proveedor.trim();

    // First pass: Find related records by name in acuerdos
    const { data: acuerdos, error: errAcuerdos } = await supabase
      .from('acuerdos')
      .select('articulo_sku, descripcion')
      .eq('empresa_id', empresaId)
      .ilike('proveedor', `%${cleanProv}%`);

    if (errAcuerdos) {
      throw errAcuerdos;
    }

    // First pass: Find related records by name in compras just in case it's there but not in acuerdos
    const { data: compras, error: errCompras } = await supabase
      .from('compras')
      .select('articulo_sku, descripcion_articulo')
      .eq('empresa_id', empresaId)
      .ilike('proveedor', `%${cleanProv}%`);

    // Collect all unique SKUs with their descriptions
    const skuMap = new Map();
    acuerdos?.forEach((a: any) => {
      if (a.articulo_sku && !skuMap.has(a.articulo_sku)) {
        skuMap.set(a.articulo_sku, a.descripcion || a.articulo_sku);
      }
    });

    compras?.forEach((c: any) => {
      if (c.articulo_sku && !skuMap.has(c.articulo_sku)) {
        skuMap.set(c.articulo_sku, c.descripcion_articulo || c.articulo_sku);
      }
    });

    const skus = Array.from(skuMap.entries()).map(([sku, desc]) => ({ sku, desc }));

    return NextResponse.json({ skus });

  } catch (error: any) {
    console.error("Fetch SKUs API error: ", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

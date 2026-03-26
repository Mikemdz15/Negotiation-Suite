'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import styles from './Dashboard.module.css';
import { useCompany } from '@/context/CompanyContext';

export default function Dashboard() {
  const { selectedCompanyId } = useCompany();
  const [totals, setTotals] = useState({ compras: 0, acuerdos: 0 });
  const [proveedores, setProveedores] = useState<string[]>([]);
  const [selectedProveedor, setSelectedProveedor] = useState<string>('');
  const [skuData, setSkuData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (!selectedCompanyId) return;

    const fetchInitialData = async () => {
      setInitialLoading(true);
      // 1. Conteo Básico
      const { count: countCom } = await supabase.from('compras').select('*', { count: 'exact', head: true }).eq('empresa_id', selectedCompanyId);
      const { count: countAcu } = await supabase.from('acuerdos').select('*', { count: 'exact', head: true }).eq('empresa_id', selectedCompanyId);
      
      setTotals({ compras: countCom || 0, acuerdos: countAcu || 0 });

      // 2. Traer todos los proveedores únicos
      let allProvs: Set<string> = new Set();
      let step = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('compras')
          .select('proveedor')
          .eq('empresa_id', selectedCompanyId)
          .range(from, from + step - 1);
          
        if (data && data.length > 0) {
          data.forEach(d => { if (d.proveedor) allProvs.add(d.proveedor.trim()); });
          from += step;
          if (data.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      
      const provArray = Array.from(allProvs).sort();
      setProveedores(provArray);
      
      // Auto-select first provider to show data
      if (provArray.length > 0) {
        setSelectedProveedor(provArray[0]);
      } else {
        setSelectedProveedor('');
        setSkuData([]);
      }
      
      setInitialLoading(false);
    };

    fetchInitialData();
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedProveedor || !selectedCompanyId) return;

    const fetchSupplierData = async () => {
      setLoading(true);
      
      let allData: any[] = [];
      let step = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('compras')
          .select('*')
          .eq('empresa_id', selectedCompanyId)
          .ilike('proveedor', `%${selectedProveedor}%`)
          .range(from, from + step - 1);

        if (data && data.length > 0) {
          allData = allData.concat(data);
          from += step;
          if (data.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      if (allData.length > 0) {
        // Objeto para agrupar por SKU y por Año
        const agg: Record<string, Record<string, { pzs: number, importe: number }>> = {};
        const skusNameMap: Record<string, string> = {};

        allData.forEach(c => {
          if (!c.articulo_sku || !c.fecha_creacion) return;
          const sku = c.articulo_sku;
          const year = new Date(c.fecha_creacion).getFullYear().toString();
          
          if (!agg[sku]) agg[sku] = {};
          if (!agg[sku][year]) agg[sku][year] = { pzs: 0, importe: 0 };
          
          skusNameMap[sku] = c.descripcion_articulo || c.descripcion || '';
          agg[sku][year].pzs += Number(c.cantidad_recibida || 0);
          agg[sku][year].importe += Number(c.importe_neto || 0);
        });

        // Formatear array final para la tabla
        const finalArray = Object.keys(agg).map(sku => {
          return {
            sku,
            desc: skusNameMap[sku],
            years: agg[sku]
          };
        }).sort((a,b) => a.sku.localeCompare(b.sku));

        setSkuData(finalArray);
      }
      setLoading(false);
    };

    fetchSupplierData();
  }, [selectedProveedor]);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Visión General de Abastecimiento</h2>
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricTitle}>Registros de Compra</div>
          <div className={styles.metricValue}>{totals.compras.toLocaleString()}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricTitle}>Acuerdos Vigentes</div>
          <div className={styles.metricValue}>{totals.acuerdos}</div>
        </div>
      </div>

      <div className={styles.chartsSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 className={styles.subtitle} style={{ margin: 0 }}>Consulta de Proveedores</h3>
          
          <select 
            className={styles.select}
            value={selectedProveedor}
            onChange={(e) => setSelectedProveedor(e.target.value)}
            disabled={initialLoading}
          >
            {initialLoading ? (
              <option>Cargando proveedores...</option>
            ) : (
              proveedores.map(p => (
                <option key={p} value={p}>{p}</option>
              ))
            )}
          </select>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>2024 (Pzas | Importe)</th>
                <th>2025 (Pzas | Importe)</th>
                <th>2026 (Pzas | Importe)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className={styles.loadingData}>Analizando historial financiero...</td></tr>
              ) : skuData.length === 0 ? (
                <tr><td colSpan={4} className={styles.empty}>Sin adquisiciones registradas.</td></tr>
              ) : (
                skuData.map((row) => (
                  <tr key={row.sku}>
                    <td>
                      <strong>{row.sku}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>{row.desc}</div>
                    </td>
                    <td className={styles.amount}>
                      {row.years['2024'] ? `${row.years['2024'].pzs.toLocaleString()} pzs | $${row.years['2024'].importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className={styles.amount}>
                      {row.years['2025'] ? `${row.years['2025'].pzs.toLocaleString()} pzs | $${row.years['2025'].importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className={styles.amount}>
                      {row.years['2026'] ? `${row.years['2026'].pzs.toLocaleString()} pzs | $${row.years['2026'].importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

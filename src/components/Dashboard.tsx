'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const [totals, setTotals] = useState({ compras: 0, acuerdos: 0 });
  const [topProveedores, setTopProveedores] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Conteo Básico
      const { count: countCom } = await supabase.from('compras').select('*', { count: 'exact', head: true });
      const { count: countAcu } = await supabase.from('acuerdos').select('*', { count: 'exact', head: true });
      
      setTotals({ compras: countCom || 0, acuerdos: countAcu || 0 });

      // 2. Traer todos los importes para calcular el Top Proveedor mediante paginación
      let allCompras: any[] = [];
      let step = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('compras')
          .select('proveedor, importe_neto')
          .range(from, from + step - 1);
          
        if (data && data.length > 0) {
          allCompras = allCompras.concat(data);
          from += step;
          if (data.length < step) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      
      if (allCompras.length > 0) {
        const agrupar: Record<string, number> = {};
        allCompras.forEach(c => {
          const val = Number(c.importe_neto) || 0;
          agrupar[c.proveedor] = (agrupar[c.proveedor] || 0) + val;
        });

        const sorted = Object.entries(agrupar)
          .map(([k, v]) => ({ proveedor: k, gasto: v }))
          .sort((a, b) => b.gasto - a.gasto)
          .slice(0, 5);

        setTopProveedores(sorted);
      }
    };

    fetchData();
  }, []);

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
        <h3 className={styles.subtitle}>Top 5 Proveedores (Por Gasto MXN)</h3>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Gasto Histórico (MXN)</th>
              </tr>
            </thead>
            <tbody>
              {topProveedores.map((p, i) => (
                <tr key={i}>
                  <td>{p.proveedor}</td>
                  <td className={styles.amount}>
                    ${p.gasto.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {topProveedores.length === 0 && <p className={styles.empty}>Sin datos. Por favor cargue el archivo mensual.</p>}
        </div>
      </div>
    </div>
  );
}

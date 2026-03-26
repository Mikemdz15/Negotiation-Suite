'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import styles from './TradeAgreements.module.css';
import { useCompany } from '@/context/CompanyContext';

export default function TradeAgreements() {
  const { selectedCompanyId } = useCompany();
  const [acuerdos, setAcuerdos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [proveedores, setProveedores] = useState<string[]>([]);
  const [selectedProveedor, setSelectedProveedor] = useState<string>('all');

  useEffect(() => {
    if (!selectedCompanyId) return;

    const loadAcuerdos = async () => {
      setLoading(true);
      // Pedimos hasta 5000 acuerdos sin límite forzado de 50
      const { data } = await supabase.from('acuerdos').select('*').eq('empresa_id', selectedCompanyId).limit(5000);
      if (data) {
        setAcuerdos(data);
        const unique = Array.from(new Set(data.map(item => item.proveedor))).filter(Boolean).sort();
        setProveedores(unique as string[]);
      }
      setLoading(false);
    };
    loadAcuerdos();
  }, [selectedCompanyId]);

  const filteredAcuerdos = selectedProveedor === 'all' 
    ? acuerdos 
    : acuerdos.filter(a => a.proveedor === selectedProveedor);

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Acuerdos Comerciales Vigentes</h2>
          <p className={styles.subtitle}>Listado histórico de parámetros de los contratos actuales.</p>
        </div>
        {!loading && proveedores.length > 0 && (
          <div className={styles.filterBox}>
            <label className={styles.filterLabel}>Filtrar por Proveedor:</label>
            <select 
              className={styles.select} 
              value={selectedProveedor} 
              onChange={(e) => setSelectedProveedor(e.target.value)}
            >
              <option value="all">Todos los Proveedores</option>
              {proveedores.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      
      {loading ? (
        <div className={styles.loading}>Cargando datos desde Supabase...</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>SKU</th>
                <th>Descripción</th>
                <th>UDM</th>
                <th>P. Anterior</th>
                <th>Precio Nuevo</th>
                <th>% Var</th>
                <th>Fecha Inicio</th>
                <th>MOQ</th>
                <th>Moneda</th>
              </tr>
            </thead>
            <tbody>
              {filteredAcuerdos.map((item) => (
                <tr key={item.id}>
                  <td className={styles.proveedor}>{item.proveedor}</td>
                  <td className={styles.sku}>{item.articulo_sku}</td>
                  <td>{item.descripcion}</td>
                  <td>{item.udm || '-'}</td>
                  <td>{item.precio_anterior ? `$${Number(item.precio_anterior).toFixed(2)}` : '-'}</td>
                  <td className={styles.precio}>${Number(item.precio_unitario).toFixed(2)}</td>
                  <td style={{ color: item.variacion_porcentaje?.includes('-') ? '#10b981' : '#ef4444' }}>
                    {item.variacion_porcentaje || '-'}
                  </td>
                  <td>{item.fecha_inicio || '-'}</td>
                  <td>{item.moq}</td>
                  <td className={styles.moneda} style={{fontSize: '12px', color: '#a0a0a0'}}>{item.moneda}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAcuerdos.length === 0 && <p className={styles.empty}>Sin acuerdos comerciales indexados acorde al filtro.</p>}
        </div>
      )}
    </div>
  );
}

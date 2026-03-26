'use client';

import React, { useState } from 'react';
import styles from './NegotiationEngine.module.css';
import { useCompany } from '@/context/CompanyContext';

export default function NegotiationEngine() {
  const { selectedCompanyId } = useCompany();
  const [proveedor, setProveedor] = useState('');
  const [macroContexto, setMacroContexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [estrategia, setEstrategia] = useState('');
  const [error, setError] = useState('');

  const [availableSkus, setAvailableSkus] = useState<{sku: string, desc: string}[]>([]);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [loadingSkus, setLoadingSkus] = useState(false);

  const fetchSkus = async () => {
    if (!proveedor || !selectedCompanyId) return;
    setLoadingSkus(true);
    setAvailableSkus([]);
    setSelectedSkus([]);
    try {
      const res = await fetch(`/api/proveedor-skus?proveedor=${encodeURIComponent(proveedor)}&empresaId=${selectedCompanyId}`);
      const data = await res.json();
      setAvailableSkus(data.skus || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSkus(false);
    }
  };

  const toggleSku = (sku: string) => {
    setSelectedSkus(prev => 
      prev.includes(sku) ? prev.filter(s => s !== sku) : [...prev, sku]
    );
  };

  const handleNegotiate = async () => {
    if (!proveedor || !selectedCompanyId) {
      setError('Por favor ingresa un proveedor objetivo y asegúrate de tener una empresa activa.');
      return;
    }
    
    setLoading(true);
    setError('');
    setEstrategia('');

    try {
      const res = await fetch('/api/negotiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          proveedor,
          macroContexto,
          selectedSkus: selectedSkus.length > 0 ? selectedSkus : availableSkus.map(s => s.sku),
          empresaId: selectedCompanyId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error desconocido del servidor');
      }

      setEstrategia(data.estrategia);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Motor CPO de Negociación IA</h2>
        <p className={styles.subtitle}>Genera estrategias comerciales de 3 niveles blindadas matemáticamente.</p>
      </div>

      <div className={styles.inputSection}>
        <div className={styles.inputGroup}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label>Proveedor Objetivo</label>
              <input 
                type="text" 
                placeholder="Ej. ALPLA MEXICO" 
                value={proveedor}
                onChange={e => setProveedor(e.target.value)}
                className={styles.input}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <button 
              onClick={fetchSkus} 
              disabled={!proveedor || loadingSkus || loading}
              className={styles.button}
              style={{ marginTop: '23px', padding: '10px 16px', fontSize: '14px', height: '46px' }}
            >
              {loadingSkus ? 'Buscando...' : 'Buscar SKUs'}
            </button>
          </div>
        </div>

        {availableSkus.length > 0 && (
          <div className={styles.inputGroup}>
            <label>Filtrar por SKUs Específicos (Opcional)</label>
            <div className={styles.skuList}>
              {availableSkus.map(s => (
                <label key={s.sku} className={styles.skuItem}>
                  <input 
                    type="checkbox" 
                    checked={selectedSkus.includes(s.sku)}
                    onChange={() => toggleSku(s.sku)}
                  />
                  <span>{s.sku} - {s.desc}</span>
                </label>
              ))}
            </div>
            <span className={styles.hint}>
              Si no seleccionas ninguno, la Inteligencia Artificial analizará todos los SKUs encontrados.
            </span>
          </div>
        )}

        <div className={styles.inputGroup}>
          <label>Contexto Macroeconómico (Opcional)</label>
          <textarea 
            placeholder="Pega aquí noticias, proyecciones del crudo, USD, o contexto geopolítico para que la IA lo neutralice en la negociación..." 
            value={macroContexto}
            onChange={e => setMacroContexto(e.target.value)}
            className={styles.textarea}
            rows={4}
          />
          <span className={styles.hint}>Soporte para análisis de variables externas</span>
        </div>

        <button 
          onClick={handleNegotiate} 
          disabled={loading}
          className={styles.button}
        >
          {loading ? 'Calculando Estrategia...' : 'Construir Estrategia'}
        </button>

        {error && <div className={styles.error}>{error}</div>}
      </div>

      {estrategia && (
        <div className={styles.resultSection}>
          <h3 className={styles.resultTitle}>Estrategia Generada</h3>
          <div className={styles.strategyContent}>
            {/* En un caso real usariamos reac-markdown, por simplicidad inyectamos el texto conservando espacios o lo procesamos */}
            <pre className={styles.preformatted}>{estrategia}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

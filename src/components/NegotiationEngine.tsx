'use client';

import React, { useState } from 'react';
import styles from './NegotiationEngine.module.css';

export default function NegotiationEngine() {
  const [proveedor, setProveedor] = useState('');
  const [macroContexto, setMacroContexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [estrategia, setEstrategia] = useState('');
  const [error, setError] = useState('');

  const handleNegotiate = async () => {
    if (!proveedor) {
      setError('Por favor ingresa un proveedor objetivo.');
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
          macroContexto
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
          <label>Proveedor Objetivo</label>
          <input 
            type="text" 
            placeholder="Ej. ALPLA MEXICO" 
            value={proveedor}
            onChange={e => setProveedor(e.target.value)}
            className={styles.input}
          />
        </div>

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

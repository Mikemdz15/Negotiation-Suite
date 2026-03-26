'use client';

import React, { useState } from 'react';
import styles from './UploadSection.module.css';
import { useCompany } from '@/context/CompanyContext';

export default function UploadSection() {
  const { selectedCompanyId, empresas } = useCompany();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle'|'uploading'|'success'|'error'>('idle');
  const [msg, setMsg] = useState('');

  const activeCompanyName = empresas.find(e => e.id === selectedCompanyId)?.nombre || '';

  const handleUpload = async () => {
    if (!pdfFile || !excelFile) {
      setMsg('Por favor selecciona tanto el PDF de Acuerdos como el Excel de Compras.');
      setStatus('error');
      return;
    }

    if (!selectedCompanyId) {
      setMsg('Selecciona una empresa en la barra superior antes de subir archivos.');
      setStatus('error');
      return;
    }

    setStatus('uploading');
    setMsg(`Vaciando historial antiguo de ${activeCompanyName} y subiendo nueva base de datos...`);

    // Simulando el POST al endpoint /api/upload
    const formData = new FormData();
    formData.append('pdf', pdfFile);
    formData.append('excel', excelFile);
    formData.append('empresaId', selectedCompanyId);
    formData.append('empresaNombre', activeCompanyName);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Fallo al cargar y procesar los archivos en Supabase.');
      }

      setStatus('success');
      setMsg(`¡Base de datos de ${activeCompanyName} actualizada con éxito! Refresca la página para ver cambios.`);
      setPdfFile(null);
      setExcelFile(null);
    } catch (err: any) {
      setStatus('error');
      setMsg(err.message);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Motor de Ingestión Mensual</h2>
      <p className={styles.subtitle}>Sube el PDF de Acuerdos y el Excel ERP. Se sincronizará a la empresa activa: <strong>{activeCompanyName}</strong>.</p>
      
      <div className={styles.dropZoneContainer}>
        <div className={styles.fileDrop}>
          <label>PDF (Acuerdos)</label>
          <input 
            type="file" 
            accept=".pdf" 
            onChange={e => setPdfFile(e.target.files?.[0] || null)}
          />
          <div className={styles.fileName}>{pdfFile ? pdfFile.name : 'Ningún archivo'}</div>
        </div>

        <div className={styles.fileDrop}>
          <label>Excel (Compras Históricas)</label>
          <input 
            type="file" 
            accept=".xlsx, .xls, .csv" 
            onChange={e => setExcelFile(e.target.files?.[0] || null)}
          />
          <div className={styles.fileName}>{excelFile ? excelFile.name : 'Ningún archivo'}</div>
        </div>
      </div>

      <button 
        disabled={status === 'uploading' || (!pdfFile && !excelFile)} 
        onClick={handleUpload}
        className={styles.button}
      >
        {status === 'uploading' ? 'Sincronizando con Supabase...' : 'Actualizar Base de Datos'}
      </button>

      {msg && (
        <div className={status === 'error' ? styles.msgError : styles.msgSuccess}>
          {msg}
        </div>
      )}
    </div>
  );
}

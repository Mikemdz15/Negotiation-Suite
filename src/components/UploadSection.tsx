'use client';

import React, { useState } from 'react';
import styles from './UploadSection.module.css';

export default function UploadSection() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle'|'uploading'|'success'|'error'>('idle');
  const [msg, setMsg] = useState('');

  const handleUpload = async () => {
    if (!pdfFile || !excelFile) {
      setMsg('Por favor selecciona tanto el PDF de Acuerdos como el Excel de Compras.');
      setStatus('error');
      return;
    }

    setStatus('uploading');
    setMsg('Mecanismo Drop & Replace en curso. Esto vaciará las bases antiguas...');

    // Simulando el POST al endpoint /api/upload
    const formData = new FormData();
    formData.append('pdf', pdfFile);
    formData.append('excel', excelFile);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Fallo al cargar y procesar los archivos en Supabase.');
      }

      setStatus('success');
      setMsg('¡Bases de datos actualizadas con éxito!');
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
      <p className={styles.subtitle}>Sube el PDF de Acuerdos Comerciales y el Excel del ERP. Este proceso ejecuta un Drop & Replace en Supabase.</p>
      
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

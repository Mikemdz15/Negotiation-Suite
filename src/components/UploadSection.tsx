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
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Fallo al cargar los archivos en la nube.');
      }

      const uploadData = await res.json();
      
      if (!uploadData.pdfText) {
        setStatus('success');
        setMsg(uploadData.message || `¡Base de datos de ${activeCompanyName} actualizada con éxito!`);
        setPdfFile(null);
        setExcelFile(null);
        return;
      }

      // Procesamiento de Chunks por Inteligencia Artificial (Bypass Vercel Timeout)
      const pdfText: string = uploadData.pdfText;
      const CHUNK_SIZE = 40000;
      const totalChunks = Math.ceil(pdfText.length / CHUNK_SIZE);
      let totalInserted = 0;

      for (let i = 0; i < totalChunks; i++) {
        setMsg(`Analizando Acuerdos Comerciales con IA (${i + 1}/${totalChunks})... Por favor no cierres la ventana.`);
        const chunkText = pdfText.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

        const chunkRes = await fetch('/api/acuerdos-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunkText, empresaId: selectedCompanyId })
        });

        if (chunkRes.ok) {
          const chunkData = await chunkRes.json();
          totalInserted += (chunkData.inserted || 0);
        } else {
          console.error(`Error procesando chunk ${i + 1}`);
        }
      }

      if (totalInserted === 0) {
        setStatus('success');
        setMsg(`Historial guardado, pero NO se encontraron Acuerdos válidos. Si el PDF es una imagen escaneada, el sistema no puede leerlo.`);
      } else {
        setStatus('success');
        setMsg(`¡Éxito! Base de datos actualizada y ${totalInserted} acuerdos comerciales extraídos correctamente.`);
      }

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

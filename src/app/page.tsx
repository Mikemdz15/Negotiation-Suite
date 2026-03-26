'use client';

import UploadSection from '@/components/UploadSection';
import Dashboard from '@/components/Dashboard';
import TradeAgreements from '@/components/TradeAgreements';
import NegotiationEngine from '@/components/NegotiationEngine';
import { useCompany } from '@/context/CompanyContext';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
  const { empresas, selectedCompanyId, setSelectedCompanyId, loadingContext } = useCompany();

  const handleAddCompany = async () => {
    const newName = window.prompt("Ingrese el nombre exacto de la nueva Subsidiary/Empresa tal cual aparece en el ERP:");
    if (!newName) return;

    if (empresas.some(e => e.nombre.toLowerCase() === newName.trim().toLowerCase())) {
      alert("Esta empresa ya existe.");
      return;
    }

    const { data, error } = await supabase.from('empresas').insert([{ nombre: newName.trim() }]).select();
    
    if (error) {
      alert("Error al crear la empresa: " + error.message);
    } else if (data && data.length > 0) {
      alert(`Empresa "${newName}" creada exitosamente. Recargando para actualizar el entorno...`);
      window.location.reload();
    }
  };

  return (
    <main className="main-layout">
      <header className="header-nav">
        <div className="logo-section">
          <div className="logo-mark">A</div>
          <h1>Negotiation Suite</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {!loadingContext && empresas.length > 0 && (
            <div style={{ display: 'flex', gap: '5px' }}>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  backgroundColor: '#1E293B',
                  color: '#fff',
                  fontSize: '0.85rem',
                  outline: 'none',
                  minWidth: '200px'
                }}
              >
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                ))}
              </select>
              <button 
                onClick={handleAddCompany}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
                title="Añadir Nueva Empresa"
              >
                +
              </button>
            </div>
          )}
          <div className="nav-badges">
            <span className="badge">B2B Compliance</span>
            <span className="badge active">Supabase Connected</span>
          </div>
        </div>
      </header>

      <div className="content-grid">
        <div className="left-column">
          <div className="section-title">
            <span>01</span> Inteligencia Artificial
          </div>
          <NegotiationEngine />
          
          <div className="section-title" style={{marginTop: '40px'}}>
            <span>02</span> Ingestión Mensual
          </div>
          <UploadSection />
        </div>

        <div className="right-column">
          <div className="section-title">
            <span>03</span> Métricas de Abastecimiento
          </div>
          <Dashboard />

          <div className="section-title" style={{marginTop: '40px'}}>
            <span>04</span> Consulta de Acuerdos
          </div>
          <TradeAgreements />
        </div>
      </div>
    </main>
  );
}

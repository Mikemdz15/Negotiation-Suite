import UploadSection from '@/components/UploadSection';
import Dashboard from '@/components/Dashboard';
import TradeAgreements from '@/components/TradeAgreements';
import NegotiationEngine from '@/components/NegotiationEngine';

export default function Home() {
  return (
    <main className="main-layout">
      <header className="header-nav">
        <div className="logo-section">
          <div className="logo-mark">A</div>
          <h1>Alphalab Negotiation Suite</h1>
        </div>
        <div className="nav-badges">
          <span className="badge">B2B Compliance</span>
          <span className="badge active">Supabase Connected</span>
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

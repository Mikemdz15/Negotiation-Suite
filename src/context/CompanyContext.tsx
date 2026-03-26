'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Empresa = {
  id: string;
  nombre: string;
};

type CompanyContextType = {
  empresas: Empresa[];
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  loadingContext: boolean;
};

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [loadingContext, setLoadingContext] = useState(true);

  useEffect(() => {
    const fetchEmpresas = async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .order('nombre');
      
      if (data && data.length > 0) {
        setEmpresas(data);
        // Default to the first one (often the Principal one)
        const principal = data.find(e => e.id === '00000000-0000-0000-0000-000000000001') || data[0];
        setSelectedCompanyId(principal.id);
      }
      setLoadingContext(false);
    };

    fetchEmpresas();
  }, []);

  return (
    <CompanyContext.Provider value={{ empresas, selectedCompanyId, setSelectedCompanyId, loadingContext }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}

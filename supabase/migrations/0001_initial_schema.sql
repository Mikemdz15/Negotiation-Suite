-- Schema Inicial para la Aplicación de Negociaciones B2B

-- Tabla de Acuerdos Comerciales Vigentes (PDF)
CREATE TABLE public.acuerdos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    proveedor TEXT NOT NULL,
    articulo_sku TEXT NOT NULL,
    descripcion TEXT,
    precio_unitario NUMERIC NOT NULL,
    moneda TEXT DEFAULT 'MXN',
    fecha_inicio DATE,
    moq NUMERIC,
    lead_time_dias INTEGER,
    condiciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla de Compras Históricas (Excel)
CREATE TABLE public.compras (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transaccion_id TEXT,
    fecha_creacion DATE,
    proveedor TEXT NOT NULL,
    articulo_sku TEXT NOT NULL,
    descripcion_articulo TEXT,
    cantidad_recibida NUMERIC,
    precio_unitario NUMERIC NOT NULL,
    importe_neto NUMERIC,
    moneda TEXT DEFAULT 'MXN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indices para facilitar búsquedas por proveedor (muy frecuentes en la app)
CREATE INDEX idx_acuerdos_proveedor ON public.acuerdos(proveedor);
CREATE INDEX idx_compras_proveedor ON public.compras(proveedor);
CREATE INDEX idx_compras_sku ON public.compras(articulo_sku);

-- Storage Bucket para los Archivos Mensuales
insert into storage.buckets (id, name, public) 
values ('documentos_mensuales', 'documentos_mensuales', false)
on conflict do nothing;

-- Creación de la Función para 'Drop & Replace' (Trunca tablas)
CREATE OR REPLACE FUNCTION truncate_data_for_monthly_update()
RETURNS void AS $$
BEGIN
    TRUNCATE TABLE public.acuerdos;
    TRUNCATE TABLE public.compras;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

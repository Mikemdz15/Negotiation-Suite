-- Ampliar la tabla de acuerdos comerciales basado en las exigencias del nuevo modelo
ALTER TABLE public.acuerdos ADD COLUMN IF NOT EXISTS udm TEXT;
ALTER TABLE public.acuerdos ADD COLUMN IF NOT EXISTS precio_anterior NUMERIC;
ALTER TABLE public.acuerdos ADD COLUMN IF NOT EXISTS variacion_porcentaje TEXT;
ALTER TABLE public.acuerdos ALTER COLUMN moq TYPE TEXT;

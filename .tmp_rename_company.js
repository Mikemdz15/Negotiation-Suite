import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('empresas')
    .update({ nombre: 'GRUPO ALPHALAB DE MEXICO HOME AND BEAUTY CARE' })
    .eq('id', '00000000-0000-0000-0000-000000000001');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Renamed company successfully!');
  }
}

main();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
        envVars[key.trim()] = values.join('=').trim().replace(/"/g, '');
    }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching WRAP AROUND...");
    const { data, error } = await supabase
        .from('compras')
        .select('articulo_sku, descripcion_articulo, fecha_creacion, cantidad_recibida, importe_neto')
        .ilike('descripcion_articulo', '%WRAP AROUND%')
        .order('fecha_creacion', { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Found ${data.length} rows:`);
    data.forEach(d => {
        console.log(`SKU: ${d.articulo_sku} | Desc: ${d.descripcion_articulo} | Date: ${d.fecha_creacion} | Pzs: ${d.cantidad_recibida} | Imp: ${d.importe_neto}`);
    });
}
run();

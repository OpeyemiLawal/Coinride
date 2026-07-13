const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

let _client = null;

function getClient() {
  if (_client) return _client;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local');
  }
  _client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  return _client;
}

// Proxy so routes can use `supabase.from(...)` directly
const supabase = new Proxy({}, {
  get(_, prop) {
    const client = getClient();
    return client[prop].bind(client);
  }
});

module.exports = supabase;

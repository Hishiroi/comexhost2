'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

if (!env.supabase.url || !env.supabase.key) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] Warning: SUPABASE_URL or SUPABASE_KEY is missing. File uploads to storage will fail.');
}

const supabase = createClient(
  env.supabase.url || 'https://placeholder.supabase.co',
  env.supabase.key || 'placeholder-key'
);

module.exports = supabase;

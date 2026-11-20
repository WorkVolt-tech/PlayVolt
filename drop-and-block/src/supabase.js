import { createClient } from '@supabase/supabase-js';
// Public anon key from the same Game DB as Dekabess and Pin & Spin.
// Never put a service-role key in a browser bundle.
const url = 'https://eybzbtyfafmqbkulyvog.supabase.co';
const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5YnpidHlmYWZtcWJrdWx5dm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MjE0MDksImV4cCI6MjA5MDM5NzQwOX0.65mO6dICDWAlS4nh0gBs7tSNobuNMNo103YY0Ylccq8';
export const db = createClient(url, anon);
export async function action(type, code = '', data = {}) {
  const { data: result, error } = await db.rpc('drop_block_action', {
    p_action: type, p_code: code, p_data: data
  });
  if (error) throw new Error(error.message || 'Could not contact the game service');
  return result;
}

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://eybzbtyfafmqbkulyvog.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5YnpidHlmYWZtcWJrdWx5dm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MjE0MDksImV4cCI6MjA5MDM5NzQwOX0.65mO6dICDWAlS4nh0gBs7tSNobuNMNo103YY0Ylccq8'

export const db = createClient(SUPABASE_URL, SUPABASE_KEY)

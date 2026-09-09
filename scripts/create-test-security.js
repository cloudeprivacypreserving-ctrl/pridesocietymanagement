// Throwaway script: creates a test Security user with a known password
// directly, sidestepping Supabase's invite-email rate limit during local
// testing. Not part of the app.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = 'test-security@example.com';
  const password = 'test-security-password-123';

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error('Create user failed:', error.message);
    process.exit(1);
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    full_name: 'Test Security',
    role: 'security',
    must_change_password: false,
  });

  if (profileError) {
    console.error('Create profile failed:', profileError.message);
    process.exit(1);
  }

  console.log(JSON.stringify({ email, password, id: data.user.id }));
}

main();

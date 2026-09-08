// One-time script to create the very first Admin account.
// Run locally: node scripts/bootstrap-admin.js
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BOOTSTRAP_ADMIN_EMAIL,
// and BOOTSTRAP_ADMIN_NAME in your local environment (see .env.example).
// Never commit real credentials. This script is not deployed with the app.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const fullName = process.env.BOOTSTRAP_ADMIN_NAME || 'Society Admin';

  if (!url || !serviceKey || !email) {
    console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or BOOTSTRAP_ADMIN_EMAIL');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Inviting ${email} as the first Admin...`);

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
  if (error || !data?.user) {
    console.error('Failed to invite user:', error?.message);
    process.exit(1);
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    full_name: fullName,
    role: 'admin',
    must_change_password: true,
  });

  if (profileError) {
    console.error('Failed to create profile row:', profileError.message);
    await supabase.auth.admin.deleteUser(data.user.id);
    process.exit(1);
  }

  console.log(`Done. ${email} has been invited as Admin and will set their password via the invite email.`);
}

main();

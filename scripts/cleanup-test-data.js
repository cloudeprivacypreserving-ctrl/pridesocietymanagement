// Removes the throwaway test-admin / test-security accounts and the test
// resident/audit data created while exercising the API locally. Run once
// after testing, then delete this script along with create-test-admin.js
// and create-test-security.js.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: testProfiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('full_name', ['Test Admin', 'Test Security']);

  const ids = (testProfiles || []).map((p) => p.id);
  console.log('Test profile ids:', ids);

  await supabase.from('audit_log').delete().in('actor_id', ids);
  await supabase.from('pending_approvals').delete().in('submitted_by', ids);
  await supabase.from('residents').delete().eq('flat_number', 'A-101');
  await supabase.from('profiles').delete().in('id', ids);

  for (const id of ids) {
    await supabase.auth.admin.deleteUser(id);
  }

  console.log('Cleanup done.');
}

main();

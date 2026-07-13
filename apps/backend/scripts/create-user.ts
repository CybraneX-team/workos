import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

async function main() {
  const email = process.argv[2] ?? 'test_twin_user@example.com';
  // Generates a random secure password
  const password = Math.random().toString(36).substring(2, 10) + '!' + Math.random().toString(36).substring(2, 6).toUpperCase();
  
  console.log(`Attempting to create user: ${email}...`);

  // First, check if the user already exists to avoid conflicts. If they do, we can delete them first or just reuse/update.
  // Deleting and recreating guarantees a clean state.
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users:', listError);
  } else {
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      console.log(`User ${email} already exists. Deleting first to ensure a clean state...`);
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
      if (deleteError) {
        console.error('Error deleting existing user:', deleteError);
        process.exit(1);
      }
      console.log('Existing user deleted successfully.');
    }
  }

  // Create the new user with confirmed email status
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: 'Digital',
      last_name: 'Twin User'
    }
  });

  if (error) {
    console.error('Error creating user:', error);
    process.exit(1);
  }

  console.log('\nSuccess! User account created and verified:');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log('\nYou can now use these credentials to sign in on the frontend!');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

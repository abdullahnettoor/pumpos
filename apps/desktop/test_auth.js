import { createClient } from '@supabase/supabase-js';

const url = 'https://sniubtppskopxkpznfkh.supabase.co';
const key = 'sb_publishable_4qh9e2uY02O81ph_1Z31EA_McoeuVjq';

console.log('Initializing Supabase client...');
const supabase = createClient(url, key);

async function test() {
  console.log('Attempting login test with: manager@pump.com...');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'manager@pump.com',
      password: 'password123'
    });

    if (error) {
      console.log('\n--- DIAGNOSIS ---');
      console.log('Status Code:', error.status);
      console.log('Error Code:', error.code);
      console.log('Error Message:', error.message);
    } else {
      console.log('Success! Logged in as:', data.user.email);
    }
  } catch (err) {
    console.error('Failed to execute test:', err);
  }
}

test();

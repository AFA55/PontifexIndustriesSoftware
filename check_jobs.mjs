import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl ? 'Set' : 'Not set');
console.log('Service Key:', supabaseServiceKey ? 'Set' : 'Not set');

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkJobs() {
  console.log('\nChecking job_orders table...');
  
  const { data, error } = await supabase
    .from('job_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${data.length} job orders:`);
    if (data.length === 0) {
      console.log('No jobs found in database!');
    } else {
      data.forEach(job => {
        console.log(`\n- Job #${job.job_number}:`);
        console.log(`  Title: ${job.title}`);
        console.log(`  Customer: ${job.customer_name}`);
        console.log(`  Status: ${job.status}`);
        console.log(`  Scheduled: ${job.scheduled_date}`);
        console.log(`  Assigned to: ${job.assigned_to || 'Unassigned'}`);
      });
    }
  }
  
  process.exit(0);
}

checkJobs();

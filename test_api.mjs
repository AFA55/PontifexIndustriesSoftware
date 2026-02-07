import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read env file
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkJobs() {
  console.log('Checking job_orders table...\n');
  
  const { data, error, count } = await supabase
    .from('job_orders')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Total jobs in database: ${count}`);
    if (data.length === 0) {
      console.log('\n❌ No jobs found in database!');
    } else {
      console.log('\n✅ Jobs found:');
      data.forEach((job, i) => {
        console.log(`\n${i + 1}. Job #${job.job_number}:`);
        console.log(`   Title: ${job.title}`);
        console.log(`   Customer: ${job.customer_name}`);
        console.log(`   Status: ${job.status}`);
        console.log(`   Scheduled: ${job.scheduled_date} at ${job.arrival_time || 'TBD'}`);
        console.log(`   Assigned to: ${job.assigned_to || 'Unassigned'}`);
        console.log(`   Created: ${new Date(job.created_at).toLocaleString()}`);
      });
    }
  }
  
  process.exit(0);
}

checkJobs().catch(console.error);

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkJobs() {
  console.log('Checking job_orders table...');
  
  const { data, error } = await supabase
    .from('job_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${data.length} job orders:`);
    data.forEach(job => {
      console.log(`- Job #${job.job_number}: ${job.title} (Status: ${job.status}, Date: ${job.scheduled_date})`);
    });
  }
}

checkJobs();

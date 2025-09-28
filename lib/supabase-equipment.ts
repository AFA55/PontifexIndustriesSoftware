import { supabase } from './supabase';

export interface Equipment {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  qr_code: string;
  status: 'available' | 'assigned' | 'maintenance';
  assigned_to: string | null;
  assigned_at: string | null;
  location: string | null;
  notes: string | null;
  qr_image: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddEquipmentData {
  name: string;
  brand?: string;
  model?: string;
  serial_number?: string;
  location?: string;
  notes?: string;
  assigned_to?: string;
}

// Test database connection
export const testDatabaseAccess = async (): Promise<{ success: boolean; message: string; details?: any }> => {
  try {
    console.log('🔍 Testing database access...');
    
    // Test 1: Simple count query
    const { data, error, count } = await supabase
      .from('equipment')
      .select('*', { count: 'exact' })
      .limit(1);
      
    if (error) {
      console.error('❌ Database access test failed:', error);
      return {
        success: false,
        message: `Database error: ${error.message}`,
        details: error
      };
    }
    
    console.log('✅ Database access successful');
    console.log('📊 Equipment count:', count);
    console.log('📄 Sample data:', data);
    
    return {
      success: true,
      message: `Database connected successfully. Found ${count || 0} equipment records.`,
      details: { count, sampleData: data }
    };
    
  } catch (err: any) {
    console.error('💥 Unexpected error during database test:', err);
    return {
      success: false,
      message: `Unexpected error: ${err.message || err}`,
      details: err
    };
  }
};

// Test direct insert
export const testDirectInsert = async (): Promise<{ success: boolean; message: string; details?: any }> => {
  try {
    console.log('🧪 Testing direct insert...');
    
    const testData = {
      name: 'Test Equipment ' + Date.now(),
      brand: 'Test Brand',
      model: 'Test Model',
      serial_number: 'TEST-' + Date.now(),
      qr_code: 'QR-TEST-' + Date.now(),
      location: 'Test Location'
    };
    
    console.log('📤 Inserting test data:', testData);
    
    const { data, error } = await supabase
      .from('equipment')
      .insert([testData])
      .select()
      .single();
      
    if (error) {
      console.error('❌ Direct insert test failed:', error);
      return {
        success: false,
        message: `Insert error: ${error.message}`,
        details: error
      };
    }
    
    console.log('✅ Direct insert successful:', data);
    
    return {
      success: true,
      message: 'Direct insert test successful',
      details: data
    };
    
  } catch (err: any) {
    console.error('💥 Unexpected error during insert test:', err);
    return {
      success: false,
      message: `Unexpected error: ${err.message || err}`,
      details: err
    };
  }
};

export const addEquipment = async (data: AddEquipmentData): Promise<{ success: boolean; equipment?: Equipment; error?: string; details?: any }> => {
  try {
    console.log('🔧 Starting addEquipment with input data:', JSON.stringify(data, null, 2));
    
    // Simple validation - only name is required
    if (!data.name || !data.name.trim()) {
      console.error('❌ Validation failed: name is required');
      return {
        success: false,
        error: 'Equipment name is required'
      };
    }

    // Generate QR code
    const qrCode = 'EQ-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log('🔖 Generated QR code:', qrCode);

    // Prepare simple data object
    const insertData = {
      name: data.name.trim(),
      brand: data.brand?.trim() || null,
      model: data.model?.trim() || null,
      serial_number: data.serial_number?.trim() || null,
      location: data.location?.trim() || 'Shop',
      notes: data.notes?.trim() || null,
      qr_code: qrCode,
      status: 'available',
      assigned_to: data.assigned_to?.trim() || 'Shop'
    };

    console.log('📤 Data prepared for Supabase insert:', JSON.stringify(insertData, null, 2));
    console.log('🔍 Insert data types:', Object.entries(insertData).map(([key, value]) => `${key}: ${typeof value} (${value === null ? 'null' : value})`));

    // Attempt database insert
    console.log('🚀 Calling supabase.from("equipment").insert()...');
    
    const { data: equipment, error } = await supabase
      .from('equipment')
      .insert(insertData)
      .select()
      .single();

    console.log('📥 Supabase response received');
    console.log('📊 Error object:', error);
    console.log('📊 Data object:', equipment);

    if (error) {
      console.error('❌ Database insert failed with error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        fullError: error
      });
      
      return {
        success: false,
        error: `Database error: ${error.message}`,
        details: error
      };
    }

    if (!equipment) {
      console.error('❌ No equipment data returned from insert');
      return {
        success: false,
        error: 'No equipment data returned from database'
      };
    }

    console.log('✅ Equipment added successfully:', equipment);
    return {
      success: true,
      equipment: equipment as Equipment
    };

  } catch (err: any) {
    console.error('💥 Unexpected error in addEquipment:');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Full error object:', err);
    
    return {
      success: false,
      error: `Unexpected error: ${err.message || 'Unknown error'}`,
      details: err
    };
  }
};

export const getAllEquipment = async (): Promise<Equipment[]> => {
  try {
    console.log('📋 Fetching all equipment...');
    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching equipment:', error);
      throw error;
    }

    console.log(`✅ Fetched ${data?.length || 0} equipment records`);
    return data as Equipment[];
  } catch (err) {
    console.error('💥 Unexpected error fetching equipment:', err);
    throw err;
  }
};

export const getEquipmentByQR = async (qrCode: string): Promise<Equipment | null> => {
  try {
    console.log('🔍 Searching for equipment with QR:', qrCode);
    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .eq('qr_code', qrCode)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('📄 No equipment found with QR code:', qrCode);
        return null;
      }
      console.error('❌ Error fetching equipment by QR:', error);
      throw error;
    }

    console.log('✅ Found equipment:', data);
    return data as Equipment;
  } catch (err) {
    console.error('💥 Unexpected error fetching equipment by QR:', err);
    throw err;
  }
};

export const updateEquipmentStatus = async (
  id: string, 
  status: Equipment['status'], 
  assignedTo?: string
): Promise<Equipment> => {
  try {
    console.log(`🔄 Updating equipment ${id} status to ${status}`, assignedTo ? `assigned to ${assignedTo}` : '');
    
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };
    
    if (status === 'assigned' && assignedTo) {
      updateData.assigned_to = assignedTo;
      updateData.assigned_at = new Date().toISOString();
    } else if (status === 'maintenance' && assignedTo) {
      updateData.assigned_to = assignedTo;
      updateData.assigned_at = new Date().toISOString();
    } else if (status === 'available') {
      updateData.assigned_to = null;
      updateData.assigned_at = null;
    }

    const { data, error } = await supabase
      .from('equipment')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating equipment status:', error);
      throw error;
    }

    console.log('✅ Equipment status updated:', data);
    return data as Equipment;
  } catch (err) {
    console.error('💥 Unexpected error updating equipment status:', err);
    throw err;
  }
};

export const updateEquipment = async (id: string, updates: Partial<Equipment>): Promise<Equipment> => {
  try {
    console.log(`📝 Updating equipment ${id}:`, updates);
    
    const { data, error } = await supabase
      .from('equipment')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating equipment:', error);
      throw error;
    }

    console.log('✅ Equipment updated:', data);
    return data as Equipment;
  } catch (err) {
    console.error('💥 Unexpected error updating equipment:', err);
    throw err;
  }
};

export const getOperatorEquipment = async (operatorName: string): Promise<Equipment[]> => {
  try {
    console.log(`🔍 Getting equipment for operator: ${operatorName}`);
    
    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .eq('assigned_to', operatorName)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching operator equipment:', error);
      throw error;
    }

    console.log(`✅ Found ${data.length} equipment items for ${operatorName}`);
    return data as Equipment[];
  } catch (err) {
    console.error('💥 Unexpected error fetching operator equipment:', err);
    throw err;
  }
};

export const getEquipmentForUser = async (userRole: string, userName: string): Promise<Equipment[]> => {
  try {
    console.log(`🔍 Getting equipment for user: ${userName}, role: ${userRole}`);
    
    // If admin/demo user, return all equipment
    if (userRole === 'admin' || userName === 'Demo User') {
      return await getAllEquipment();
    }
    
    // If operator, return only their assigned equipment
    return await getOperatorEquipment(userName);
  } catch (err) {
    console.error('💥 Unexpected error in getEquipmentForUser:', err);
    throw err;
  }
};
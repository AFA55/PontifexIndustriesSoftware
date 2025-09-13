import { supabase, isSupabaseConfigured } from './supabase'

export interface Equipment {
  id?: string
  name: string
  brand_name: string
  model_number: string
  type: string
  serial_number: string
  status: 'Available' | 'In Use' | 'Maintenance' | 'Out of Service'
  assigned_to: string
  location?: string
  last_service_date?: string
  next_service_due?: string
  notes?: string
  equipment_image_url?: string
  qr_code_url?: string
  usage_hours?: number
  created_at?: string
  updated_at?: string
}

export interface EquipmentNote {
  id?: string
  equipment_id: string
  note: string
  author: string
  timestamp: string
}

export interface MaintenanceRecord {
  id?: string
  equipment_id: string
  service_type: string
  description: string
  technician: string
  cost?: number
  date: string
  parts_used?: string[]
  next_service_date?: string
}

async function generateQRCode(equipment: Equipment): Promise<string> {
  const QRCode = (await import('qrcode')).default

  const qrData = {
    id: equipment.id,
    name: equipment.name,
    brand: equipment.brand_name,
    model: equipment.model_number,
    serial: equipment.serial_number,
    type: "pontifex-equipment"
  }

  try {
    const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
      width: 256,
      margin: 2,
      color: {
        dark: '#0891b2',
        light: '#ffffff'
      }
    })
    return qrCodeUrl
  } catch (error) {
    console.error('Error generating QR code:', error)
    return ''
  }
}

// Fallback to localStorage if Supabase is not configured
function getStoredEquipment(): Equipment[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem('pontifex_equipment')

  if (!stored) {
    const demoEquipment: Equipment[] = [
      {
        id: '1',
        name: 'FS 500 Floor Saw',
        brand_name: 'Husqvarna',
        model_number: 'FS 500',
        type: 'Floor Saw',
        serial_number: 'HS-2024-001',
        status: 'Available',
        assigned_to: 'Shop',
        location: 'Main Shop',
        last_service_date: '2024-01-15',
        next_service_due: '2024-04-15',
        notes: 'Recently serviced, blade replaced',
        usage_hours: 234,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '2',
        name: 'EK7301 Hand Saw',
        brand_name: 'Makita',
        model_number: 'EK7301',
        type: 'Hand Saw',
        serial_number: 'MK-2024-002',
        status: 'In Use',
        assigned_to: 'Rex Z',
        location: 'Site #142',
        last_service_date: '2024-01-10',
        next_service_due: '2024-03-10',
        notes: 'Deployed to construction site',
        usage_hours: 156,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '3',
        name: 'DSH 700 Wall Saw',
        brand_name: 'Hilti',
        model_number: 'DSH 700',
        type: 'Wall Saw',
        serial_number: 'HT-2024-003',
        status: 'Maintenance',
        assigned_to: 'Shop',
        location: 'Service Bay 1',
        last_service_date: '2024-01-20',
        next_service_due: '2024-02-20',
        notes: 'Hydraulic system maintenance',
        usage_hours: 412,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ]

    localStorage.setItem('pontifex_equipment', JSON.stringify(demoEquipment))
    return demoEquipment
  }

  return JSON.parse(stored)
}

function saveStoredEquipment(equipment: Equipment[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('pontifex_equipment', JSON.stringify(equipment))
}

export async function saveEquipment(equipmentData: Omit<Equipment, 'id' | 'created_at' | 'updated_at' | 'qr_code_url'>) {
  try {
    if (isSupabaseConfigured() && supabase) {
      // Use Supabase
      const { data, error } = await supabase
        .from('equipment')
        .insert([{
          name: equipmentData.name,
          brand_name: equipmentData.brand_name,
          model_number: equipmentData.model_number,
          type: equipmentData.type,
          serial_number: equipmentData.serial_number,
          status: equipmentData.status,
          assigned_to: equipmentData.assigned_to,
          location: equipmentData.location,
          last_service_date: equipmentData.last_service_date,
          next_service_due: equipmentData.next_service_due,
          notes: equipmentData.notes,
          equipment_image_url: equipmentData.equipment_image_url,
          usage_hours: equipmentData.usage_hours || 0
        }])
        .select()
        .single()

      if (error) {
        console.error('Supabase error:', error)
        return { success: false, error: error.message }
      }

      // Generate QR code
      const qrCodeUrl = await generateQRCode(data)

      // Update with QR code
      if (qrCodeUrl) {
        await supabase
          .from('equipment')
          .update({ qr_code_url: qrCodeUrl })
          .eq('id', data.id)
      }

      return { success: true, data: { ...data, qr_code_url: qrCodeUrl } }
    } else {
      // Fallback to localStorage
      console.warn('Supabase not configured, using localStorage fallback')

      const allEquipment = getStoredEquipment()

      const newEquipment: Equipment = {
        ...equipmentData,
        id: Date.now().toString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      // Generate QR code
      newEquipment.qr_code_url = await generateQRCode(newEquipment)

      allEquipment.push(newEquipment)
      saveStoredEquipment(allEquipment)

      return { success: true, data: newEquipment }
    }
  } catch (error) {
    console.error('Error saving equipment:', error)
    return { success: false, error: 'Failed to save equipment' }
  }
}

export async function getAllEquipment() {
  try {
    if (isSupabaseConfigured() && supabase) {
      // Use Supabase
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase error:', error)
        return { success: false, error: error.message, data: [] }
      }

      return { success: true, data: data || [] }
    } else {
      // Fallback to localStorage
      console.warn('Supabase not configured, using localStorage fallback')
      const equipment = getStoredEquipment()
      return { success: true, data: equipment }
    }
  } catch (error) {
    console.error('Error fetching equipment:', error)
    return { success: false, error: 'Failed to fetch equipment', data: [] }
  }
}

export async function getUserEquipment() {
  try {
    if (isSupabaseConfigured() && supabase) {
      // Use Supabase - for now, return all equipment
      // TODO: Implement user-specific filtering based on authentication
      return await getAllEquipment()
    } else {
      // Fallback to localStorage with user filtering
      console.warn('Supabase not configured, using localStorage fallback')

      const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null
      if (!userStr) {
        return { success: false, error: 'No user logged in', data: [] }
      }

      const user = JSON.parse(userStr)
      const allEquipment = getStoredEquipment()

      // Check if user is an operator or admin
      const operators = ['Rex Z', 'Skinny H', 'Brandon R', 'Matt M']

      if (operators.includes(user.name)) {
        // If operator, only show their equipment
        const filtered = allEquipment.filter(item =>
          item.assigned_to === user.name
        )
        return { success: true, data: filtered }
      } else {
        // If admin/demo, show all equipment
        return { success: true, data: allEquipment }
      }
    }
  } catch (error) {
    console.error('Error fetching user equipment:', error)
    return { success: false, error: 'Failed to fetch user equipment', data: [] }
  }
}

export async function updateEquipment(id: string, updates: Partial<Equipment>) {
  try {
    if (isSupabaseConfigured() && supabase) {
      // Use Supabase
      const { data, error } = await supabase
        .from('equipment')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Supabase error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } else {
      // Fallback to localStorage
      console.warn('Supabase not configured, using localStorage fallback')

      const allEquipment = getStoredEquipment()
      const index = allEquipment.findIndex(item => item.id === id)

      if (index === -1) {
        return { success: false, error: 'Equipment not found' }
      }

      allEquipment[index] = {
        ...allEquipment[index],
        ...updates,
        updated_at: new Date().toISOString()
      }

      saveStoredEquipment(allEquipment)

      return { success: true, data: allEquipment[index] }
    }
  } catch (error) {
    console.error('Error updating equipment:', error)
    return { success: false, error: 'Failed to update equipment' }
  }
}

export async function deleteEquipment(id: string) {
  try {
    if (isSupabaseConfigured() && supabase) {
      // Use Supabase
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Supabase error:', error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } else {
      // Fallback to localStorage
      console.warn('Supabase not configured, using localStorage fallback')

      const allEquipment = getStoredEquipment()
      const filtered = allEquipment.filter(item => item.id !== id)

      saveStoredEquipment(filtered)

      return { success: true }
    }
  } catch (error) {
    console.error('Error deleting equipment:', error)
    return { success: false, error: 'Failed to delete equipment' }
  }
}

export async function getEquipmentByStatus(status: Equipment['status']) {
  try {
    if (isSupabaseConfigured() && supabase) {
      // Use Supabase
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase error:', error)
        return { success: false, error: error.message, data: [] }
      }

      return { success: true, data: data || [] }
    } else {
      // Fallback to localStorage
      console.warn('Supabase not configured, using localStorage fallback')

      const allEquipment = getStoredEquipment()
      const filtered = allEquipment.filter(item => item.status === status)
      return { success: true, data: filtered }
    }
  } catch (error) {
    console.error('Error fetching equipment by status:', error)
    return { success: false, error: 'Failed to fetch equipment by status', data: [] }
  }
}

export async function getMaintenanceAssignments() {
  try {
    const result = await getEquipmentByStatus('Maintenance')

    if (result.success) {
      // Group by assigned_to
      const grouped = result.data.reduce((acc, item) => {
        const assignee = item.assigned_to || 'Unassigned'
        if (!acc[assignee]) {
          acc[assignee] = []
        }
        acc[assignee].push(item)
        return acc
      }, {} as Record<string, Equipment[]>)

      return { success: true, data: grouped }
    } else {
      return { success: false, error: result.error, data: {} }
    }
  } catch (error) {
    console.error('Error fetching maintenance assignments:', error)
    return { success: false, error: 'Failed to fetch maintenance assignments', data: {} }
  }
}
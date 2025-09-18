'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import QRCode from 'qrcode';
import { Download, Printer, CheckCircle, ArrowLeft } from 'lucide-react';

export default function AddEquipment() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedEquipment, setSavedEquipment] = useState<any>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    brand_name: '',
    model_number: '',
    type: 'Chain Saw',
    serial_number: '',
    assigned_to: 'Unassigned',
    location: 'West Side Shop',
    notes: '',
    status: 'Available'
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validation
    if (!formData.name || !formData.serial_number) {
      setError('Equipment name and serial number are required');
      setLoading(false);
      return;
    }

    try {
      console.log('Generating QR code...');

      // Generate QR code with serial number for scanning
      const qrData = {
        type: 'pontifex-equipment',
        serial: formData.serial_number
      };

      const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      console.log('QR code generated successfully');
      setQrCodeUrl(qrCodeDataUrl);

      // Prepare data for database
      const dataToSave = {
        name: formData.name,
        brand_name: formData.brand_name || '',
        model_number: formData.model_number || '',
        type: formData.type,
        serial_number: formData.serial_number,
        status: formData.status,
        assigned_to: formData.assigned_to,
        location: formData.location,
        notes: formData.notes || '',
        qr_code: qrCodeDataUrl,
        usage_hours: 0
      };

      console.log('Saving to database:', dataToSave);

      // Save to Supabase
      const { data, error: saveError } = await supabase
        .from('equipment')
        .insert([dataToSave])
        .select()
        .single();

      if (saveError) {
        console.error('Database error:', saveError);
        setError(`Failed to save: ${saveError.message}`);
        setLoading(false);
        return;
      }

      console.log('Equipment saved successfully:', data);
      setSavedEquipment(data);

    } catch (err: any) {
      console.error('Unexpected error:', err);
      setError(`Error: ${err.message}`);
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const downloadQRCode = () => {
    const link = document.createElement('a');
    link.download = `QR-${savedEquipment.serial_number}.png`;
    link.href = qrCodeUrl;
    link.click();
  };

  const printQRCode = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>QR Code - ${savedEquipment.name}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              font-family: Arial, sans-serif;
              margin: 0;
            }
            .container {
              text-align: center;
              padding: 20px;
              border: 2px solid #000;
              border-radius: 10px;
            }
            h2 { margin: 0 0 10px 0; }
            p { margin: 5px 0; font-size: 14px; }
            .label { font-weight: bold; }
            img { margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>PONTIFEX INDUSTRIES</h2>
            <h3>${savedEquipment.name}</h3>
            <p><span class="label">Serial:</span> ${savedEquipment.serial_number}</p>
            <p><span class="label">Type:</span> ${savedEquipment.type}</p>
            <img src="${qrCodeUrl}" width="250" height="250" />
            <p style="font-size: 10px; margin-top: 10px;">Scan QR code for equipment details</p>
          </div>
        </body>
      </html>
    `);
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const addAnother = () => {
    setSavedEquipment(null);
    setQrCodeUrl('');
    setFormData({
      name: '',
      brand_name: '',
      model_number: '',
      type: 'Chain Saw',
      serial_number: '',
      assigned_to: 'Unassigned',
      location: 'West Side Shop',
      notes: '',
      status: 'Available'
    });
    setError('');
  };

  // Show success screen with QR code
  if (savedEquipment && qrCodeUrl) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 border border-gray-700">
            <div className="text-center mb-6">
              <CheckCircle className="w-20 h-20 text-green-400 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-white mb-2">Equipment Added!</h2>
              <p className="text-gray-400">QR code generated successfully</p>
            </div>

            <div className="bg-white rounded-xl p-6 mb-6">
              <img src={qrCodeUrl} alt="QR Code" className="mx-auto" />
            </div>

            <div className="bg-gray-900/50 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-400">Name:</p>
                  <p className="text-white font-medium">{savedEquipment.name}</p>
                </div>
                <div>
                  <p className="text-gray-400">Serial:</p>
                  <p className="text-white font-medium">{savedEquipment.serial_number}</p>
                </div>
                <div>
                  <p className="text-gray-400">Type:</p>
                  <p className="text-white font-medium">{savedEquipment.type}</p>
                </div>
                <div>
                  <p className="text-gray-400">Location:</p>
                  <p className="text-white font-medium">{savedEquipment.location}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={downloadQRCode}
                className="flex items-center justify-center gap-2 py-3 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 rounded-lg text-green-400 font-medium transition-colors"
              >
                <Download className="w-5 h-5" />
                Download QR
              </button>
              <button
                onClick={printQRCode}
                className="flex items-center justify-center gap-2 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 rounded-lg text-blue-400 font-medium transition-colors"
              >
                <Printer className="w-5 h-5" />
                Print Label
              </button>
            </div>

            <div className="flex gap-4">
              <button
                onClick={addAnother}
                className="flex-1 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg text-cyan-400 font-medium transition-colors"
              >
                Add Another
              </button>
              <button
                onClick={() => router.push('/my-equipment')}
                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 rounded-lg font-semibold transition-all text-white"
              >
                View My Equipment
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Regular form view
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => router.push('/equipment-dashboard')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <h1 className="text-3xl font-bold text-white mb-2">Add Equipment</h1>
        <p className="text-gray-400 mb-8">Register new equipment to the inventory</p>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-6 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div>
              <label className="block text-gray-400 mb-2">
                Equipment Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-400 mb-2">Brand Name</label>
              <input
                type="text"
                name="brand_name"
                value={formData.brand_name}
                onChange={handleInputChange}
                className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-400 mb-2">Model Number</label>
              <input
                type="text"
                name="model_number"
                value={formData.model_number}
                onChange={handleInputChange}
                className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-400 mb-2">Equipment Type</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="Chain Saw">Chain Saw</option>
                <option value="Floor Saw">Floor Saw</option>
                <option value="Core Drill">Core Drill</option>
                <option value="Wall Saw">Wall Saw</option>
                <option value="Jackhammer">Jackhammer</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 mb-2">
                Serial Number <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="serial_number"
                value={formData.serial_number}
                onChange={handleInputChange}
                required
                className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-400 mb-2">Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="Available">Available</option>
                <option value="In Use">In Use</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 mb-2">Assign To</label>
              <select
                name="assigned_to"
                value={formData.assigned_to}
                onChange={handleInputChange}
                className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="Unassigned">Unassigned</option>
                <option value="Skinny H">Skinny H</option>
                <option value="Rex Z">Rex Z</option>
                <option value="Brandon R">Brandon R</option>
                <option value="Matt M">Matt M</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 mb-2">Location</label>
              <select
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="West Side Shop">West Side Shop</option>
                <option value="East Side Shop">East Side Shop</option>
                <option value="Truck 1">Truck 1</option>
                <option value="Truck 2">Truck 2</option>
                <option value="Truck 3">Truck 3</option>
                <option value="Job Site">Job Site</option>
              </select>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-gray-400 mb-2">Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full p-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-8 w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 rounded-lg font-semibold transition-all text-white"
          >
            {loading ? 'Adding Equipment...' : 'Add Equipment'}
          </button>
        </form>
      </div>
    </div>
  );
}
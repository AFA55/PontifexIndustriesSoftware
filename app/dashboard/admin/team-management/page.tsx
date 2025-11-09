'use client';

import { useState } from 'react';
import Link from 'next/link';

// Mock data for team members
const mockTeamMembers = [
  {
    id: '1',
    name: 'John Smith',
    email: 'john.smith@pontifex.com',
    role: 'Admin',
    department: 'Operations',
    status: 'active',
    avatar: '👨‍💼',
    phone: '(555) 123-4567',
    joinDate: '2023-01-15',
    lastActive: '2 mins ago',
    permissions: {
      dispatch: { view: true, create: true, edit: true, delete: true },
      projects: { view: true, create: true, edit: true, delete: true },
      team: { view: true, create: true, edit: true, delete: true },
      estimates: { view: true, create: true, edit: true, delete: true },
      analytics: { view: true, create: false, edit: false, delete: false },
    }
  },
  {
    id: '2',
    name: 'Mike Johnson',
    email: 'mike.johnson@pontifex.com',
    role: 'Operator',
    department: 'Field Operations',
    status: 'active',
    avatar: '👷',
    phone: '(555) 234-5678',
    joinDate: '2023-03-20',
    lastActive: '1 hour ago',
    permissions: {
      dispatch: { view: true, create: false, edit: false, delete: false },
      projects: { view: true, create: false, edit: true, delete: false },
      team: { view: true, create: false, edit: false, delete: false },
      estimates: { view: true, create: false, edit: false, delete: false },
      analytics: { view: false, create: false, edit: false, delete: false },
    }
  },
  {
    id: '3',
    name: 'Sarah Williams',
    email: 'sarah.williams@pontifex.com',
    role: 'Project Manager',
    department: 'Operations',
    status: 'active',
    avatar: '👩‍💼',
    phone: '(555) 345-6789',
    joinDate: '2023-02-10',
    lastActive: '30 mins ago',
    permissions: {
      dispatch: { view: true, create: true, edit: true, delete: false },
      projects: { view: true, create: true, edit: true, delete: false },
      team: { view: true, create: false, edit: false, delete: false },
      estimates: { view: true, create: true, edit: true, delete: false },
      analytics: { view: true, create: false, edit: false, delete: false },
    }
  },
  {
    id: '4',
    name: 'Bob Williams',
    email: 'bob.williams@pontifex.com',
    role: 'Operator',
    department: 'Field Operations',
    status: 'inactive',
    avatar: '👨‍🔧',
    phone: '(555) 456-7890',
    joinDate: '2022-11-05',
    lastActive: '2 days ago',
    permissions: {
      dispatch: { view: true, create: false, edit: false, delete: false },
      projects: { view: true, create: false, edit: true, delete: false },
      team: { view: true, create: false, edit: false, delete: false },
      estimates: { view: true, create: false, edit: false, delete: false },
      analytics: { view: false, create: false, edit: false, delete: false },
    }
  },
];

const roles = [
  {
    name: 'Admin',
    description: 'Full access to all features and settings',
    color: 'red',
    count: 1
  },
  {
    name: 'Project Manager',
    description: 'Can manage projects, dispatch, and view analytics',
    color: 'blue',
    count: 1
  },
  {
    name: 'Operator',
    description: 'Can view and update assigned jobs',
    color: 'green',
    count: 2
  },
  {
    name: 'Estimator',
    description: 'Can create and manage estimates',
    color: 'purple',
    count: 0
  },
];

export default function TeamManagementPage() {
  const [teamMembers, setTeamMembers] = useState(mockTeamMembers);
  const [selectedMember, setSelectedMember] = useState<typeof mockTeamMembers[0] | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // New user form state
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'Operator',
    department: '',
    phone: ''
  });

  const filteredMembers = teamMembers.filter(member => {
    const matchesRole = filterRole === 'all' || member.role === filterRole;
    const matchesStatus = filterStatus === 'all' || member.status === filterStatus;
    return matchesRole && matchesStatus;
  });

  // Handle permission changes
  const handlePermissionChange = (module: string, action: string, value: boolean) => {
    if (!selectedMember) return;

    setSelectedMember({
      ...selectedMember,
      permissions: {
        ...selectedMember.permissions,
        [module]: {
          ...selectedMember.permissions[module as keyof typeof selectedMember.permissions],
          [action]: value
        }
      }
    });
  };

  // Set operator-only permissions
  const setOperatorOnlyPermissions = () => {
    if (!selectedMember) return;

    setSelectedMember({
      ...selectedMember,
      role: 'Operator',
      permissions: {
        dispatch: { view: false, create: false, edit: false, delete: false },
        projects: { view: false, create: false, edit: false, delete: false },
        team: { view: false, create: false, edit: false, delete: false },
        estimates: { view: false, create: false, edit: false, delete: false },
        analytics: { view: false, create: false, edit: false, delete: false },
      }
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Admin': return 'bg-red-100 text-red-700 border-red-200';
      case 'Project Manager': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Operator': return 'bg-green-100 text-green-700 border-green-200';
      case 'Estimator': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="container mx-auto px-6 py-8 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard/admin"
              className="group p-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all duration-300 hover:scale-105 shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
                <span className="text-5xl">👥</span>
                Team Management
              </h1>
              <p className="text-gray-600 font-medium mt-1">Create accounts and manage team member access</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl hover:from-orange-700 hover:to-red-700 transition-all shadow-lg hover:shadow-xl font-bold flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Team Member
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Total Team Members</span>
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <span className="text-xl">👥</span>
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">{teamMembers.length}</div>
            <div className="text-sm text-green-600 font-medium mt-1">+2 this month</div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Active Users</span>
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <span className="text-xl">✅</span>
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-800 bg-clip-text text-transparent">
              {teamMembers.filter(m => m.status === 'active').length}
            </div>
            <div className="text-sm text-gray-500 font-medium mt-1">Currently online</div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Roles Defined</span>
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <span className="text-xl">🎭</span>
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">{roles.length}</div>
            <div className="text-sm text-gray-500 font-medium mt-1">Permission groups</div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Pending Invites</span>
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <span className="text-xl">📧</span>
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">0</div>
            <div className="text-sm text-gray-500 font-medium mt-1">Awaiting response</div>
          </div>
        </div>

        {/* Filters and View Toggle */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200 p-6 mb-6 shadow-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-medium text-gray-700"
                >
                  <option value="all">All Roles</option>
                  <option value="Admin">Admin</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Operator">Operator</option>
                  <option value="Estimator">Estimator</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-medium text-gray-700"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-4 py-2 rounded-lg transition-all font-medium ${
                  viewMode === 'grid' ? 'bg-white shadow-md text-blue-600' : 'text-gray-500'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-lg transition-all font-medium ${
                  viewMode === 'list' ? 'bg-white shadow-md text-blue-600' : 'text-gray-500'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Grid View */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200 p-6 shadow-xl hover:shadow-2xl transition-all hover:scale-105 cursor-pointer"
                onClick={() => setSelectedMember(member)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center text-3xl">
                      {member.avatar}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-lg">{member.name}</h3>
                      <p className="text-sm text-gray-500">{member.department}</p>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {member.status === 'active' ? '● Online' : '○ Offline'}
                  </div>
                </div>

                <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border-2 mb-4 ${getRoleBadgeColor(member.role)}`}>
                  {member.role}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {member.email}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {member.phone}
                  </div>
                  <div className="flex items-center gap-2 text-gray-500 text-xs">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Last active: {member.lastActive}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMember(member);
                      setShowPermissionsModal(true);
                    }}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-bold"
                  >
                    Edit Permissions
                  </button>
                  <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200 overflow-hidden shadow-xl">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Member</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Department</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Contact</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => setSelectedMember(member)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center text-2xl">
                          {member.avatar}
                        </div>
                        <div>
                          <div className="font-bold text-gray-800">{member.name}</div>
                          <div className="text-sm text-gray-500">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border-2 ${getRoleBadgeColor(member.role)}`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 font-medium">{member.department}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{member.phone}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {member.status === 'active' ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMember(member);
                            setShowPermissionsModal(true);
                          }}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-bold"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create User Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-gray-200">
              <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-red-50">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-pink-600 bg-clip-text text-transparent">
                    Add New Team Member
                  </h2>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Full Name</label>
                    <input
                      type="text"
                      value={newUser.name}
                      onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-medium"
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-medium"
                      placeholder="john@pontifex.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Phone Number</label>
                    <input
                      type="tel"
                      value={newUser.phone}
                      onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-medium"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Department</label>
                    <input
                      type="text"
                      value={newUser.department}
                      onChange={(e) => setNewUser({...newUser, department: e.target.value})}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-medium"
                      placeholder="Operations"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Role</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none font-medium"
                  >
                    <option value="Admin">Admin</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Operator">Operator</option>
                    <option value="Estimator">Estimator</option>
                  </select>
                </div>

                <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
                  <p className="text-sm text-blue-800 font-medium">
                    📧 An invitation email will be sent to {newUser.email || 'the user'} with instructions to set up their password.
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      alert(`Invitation sent to ${newUser.name}!`);
                      setShowCreateModal(false);
                      setNewUser({ name: '', email: '', role: 'Operator', department: '', phone: '' });
                    }}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl hover:from-orange-700 hover:to-red-700 transition-all shadow-lg font-bold"
                  >
                    Send Invitation
                  </button>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Permissions Modal */}
        {showPermissionsModal && selectedMember && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
              <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                      Edit Permissions
                    </h2>
                    <p className="text-gray-600 font-medium mt-1">{selectedMember.name} - {selectedMember.role}</p>
                  </div>
                  <button
                    onClick={() => setShowPermissionsModal(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700 hover:text-gray-900"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-6">
                  {/* Dispatch Permissions */}
                  <div className="bg-orange-50 rounded-xl p-5 border-2 border-orange-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                        <span className="text-2xl">🚚</span>
                      </div>
                      <h3 className="font-bold text-gray-800 text-lg">Dispatch & Scheduling</h3>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      {['view', 'create', 'edit', 'delete'].map((action) => (
                        <label key={action} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedMember.permissions.dispatch[action as keyof typeof selectedMember.permissions.dispatch]}
                            onChange={(e) => handlePermissionChange('dispatch', action, e.target.checked)}
                            className="w-5 h-5 rounded border-2 border-orange-300 accent-orange-600"
                          />
                          <span className="text-sm font-medium text-gray-700 capitalize">{action}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Projects Permissions */}
                  <div className="bg-red-50 rounded-xl p-5 border-2 border-red-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                        <span className="text-2xl">📊</span>
                      </div>
                      <h3 className="font-bold text-gray-800 text-lg">Project Board</h3>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      {['view', 'create', 'edit', 'delete'].map((action) => (
                        <label key={action} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedMember.permissions.projects[action as keyof typeof selectedMember.permissions.projects]}
                            onChange={(e) => handlePermissionChange('projects', action, e.target.checked)}
                            className="w-5 h-5 rounded border-2 border-red-300 accent-red-600"
                          />
                          <span className="text-sm font-medium text-gray-700 capitalize">{action}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Team Permissions */}
                  <div className="bg-blue-50 rounded-xl p-5 border-2 border-blue-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <span className="text-2xl">👥</span>
                      </div>
                      <h3 className="font-bold text-gray-800 text-lg">Team Management</h3>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      {['view', 'create', 'edit', 'delete'].map((action) => (
                        <label key={action} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedMember.permissions.team[action as keyof typeof selectedMember.permissions.team]}
                            onChange={(e) => handlePermissionChange('team', action, e.target.checked)}
                            className="w-5 h-5 rounded border-2 border-blue-300 accent-blue-600"
                          />
                          <span className="text-sm font-medium text-gray-700 capitalize">{action}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Estimates Permissions */}
                  <div className="bg-purple-50 rounded-xl p-5 border-2 border-purple-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                        <span className="text-2xl">📝</span>
                      </div>
                      <h3 className="font-bold text-gray-800 text-lg">Create Estimates</h3>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      {['view', 'create', 'edit', 'delete'].map((action) => (
                        <label key={action} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedMember.permissions.estimates[action as keyof typeof selectedMember.permissions.estimates]}
                            onChange={(e) => handlePermissionChange('estimates', action, e.target.checked)}
                            className="w-5 h-5 rounded border-2 border-purple-300 accent-purple-600"
                          />
                          <span className="text-sm font-medium text-gray-700 capitalize">{action}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Analytics Permissions */}
                  <div className="bg-green-50 rounded-xl p-5 border-2 border-green-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                        <span className="text-2xl">📈</span>
                      </div>
                      <h3 className="font-bold text-gray-800 text-lg">Analytics & Reports</h3>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      {['view', 'create', 'edit', 'delete'].map((action) => (
                        <label key={action} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedMember.permissions.analytics[action as keyof typeof selectedMember.permissions.analytics]}
                            onChange={(e) => handlePermissionChange('analytics', action, e.target.checked)}
                            className="w-5 h-5 rounded border-2 border-green-300 accent-green-600"
                          />
                          <span className="text-sm font-medium text-gray-700 capitalize">{action}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="pt-4 border-t-2 border-gray-200">
                  <p className="text-sm font-semibold text-gray-600 mb-3">QUICK PRESETS</p>
                  <button
                    onClick={setOperatorOnlyPermissions}
                    className="w-full px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-xl transition-all shadow-md hover:shadow-lg font-bold flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Set as Operator Dashboard Only
                  </button>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    This will remove all admin access and set user to only see the operator dashboard
                  </p>
                </div>

                <div className="flex gap-3 pt-6">
                  <button
                    onClick={() => {
                      alert(`Permissions updated for ${selectedMember.name}!`);
                      setShowPermissionsModal(false);
                    }}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg font-bold"
                  >
                    Save Permissions
                  </button>
                  <button
                    onClick={() => setShowPermissionsModal(false)}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

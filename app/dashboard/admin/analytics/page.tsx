'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';

// Types
interface Project {
  id: string;
  name: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  assignedOperator: string;
  scheduledDate: string;
  completedDate?: string;

  // Financial data
  totalRevenue?: number;
  laborCost?: number;
  materialCost?: number;
  equipmentCost?: number;

  // Production data
  linearFeetCut?: number;
  hoursWorked?: number;
  squareFeetCompleted?: number;
}

interface OperatorPerformance {
  name: string;
  projectsCompleted: number;
  totalRevenue: number;
  totalLinearFeet: number;
  totalHoursWorked: number;
  avgProductionRate: number; // linear feet per hour
  revenuePerHour: number;
  onTimeCompletionRate: number;
}

export default function AnalyticsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'operators' | 'financial'>('overview');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectPLModal, setShowProjectPLModal] = useState(false);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  // Form state for P&L input
  const [plForm, setPLForm] = useState({
    totalRevenue: 0,
    laborCost: 0,
    materialCost: 0,
    equipmentCost: 0
  });

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  // Mock data - in production, this would come from database
  const [projects, setProjects] = useState<Project[]>([
    {
      id: '1',
      name: 'Downtown Plaza - Wall Cutting',
      status: 'completed',
      assignedOperator: 'ANDRES GUERRERO-C',
      scheduledDate: '2024-11-10',
      completedDate: '2024-11-12',
      totalRevenue: 8500,
      laborCost: 2400,
      materialCost: 1200,
      equipmentCost: 800,
      linearFeetCut: 450,
      hoursWorked: 16,
      squareFeetCompleted: 320
    },
    {
      id: '2',
      name: 'Harbor Construction - Core Drilling',
      status: 'completed',
      assignedOperator: 'CARLOS MARTINEZ',
      scheduledDate: '2024-11-08',
      completedDate: '2024-11-09',
      totalRevenue: 5200,
      laborCost: 1800,
      materialCost: 600,
      equipmentCost: 400,
      linearFeetCut: 280,
      hoursWorked: 12,
      squareFeetCompleted: 180
    },
    {
      id: '3',
      name: 'Riverside Building - Slab Sawing',
      status: 'completed',
      assignedOperator: 'MIKE JOHNSON',
      scheduledDate: '2024-11-15',
      completedDate: '2024-11-16',
      totalRevenue: 12000,
      laborCost: 3200,
      materialCost: 1800,
      equipmentCost: 1000,
      linearFeetCut: 620,
      hoursWorked: 20,
      squareFeetCompleted: 480
    },
    {
      id: '4',
      name: 'City Center - Hand Sawing',
      status: 'in_progress',
      assignedOperator: 'ANDRES GUERRERO-C',
      scheduledDate: '2024-11-20',
      linearFeetCut: 150,
      hoursWorked: 8
    },
    {
      id: '5',
      name: 'Industrial Park - Wall Opening',
      status: 'scheduled',
      assignedOperator: 'SARAH WILLIAMS',
      scheduledDate: '2024-11-25'
    }
  ]);

  // Calculate operator performance metrics
  const calculateOperatorPerformance = (): OperatorPerformance[] => {
    const operatorMap = new Map<string, OperatorPerformance>();

    projects
      .filter(p => p.status === 'completed')
      .forEach(project => {
        const operator = project.assignedOperator;

        if (!operatorMap.has(operator)) {
          operatorMap.set(operator, {
            name: operator,
            projectsCompleted: 0,
            totalRevenue: 0,
            totalLinearFeet: 0,
            totalHoursWorked: 0,
            avgProductionRate: 0,
            revenuePerHour: 0,
            onTimeCompletionRate: 0
          });
        }

        const operatorData = operatorMap.get(operator)!;
        operatorData.projectsCompleted++;
        operatorData.totalRevenue += project.totalRevenue || 0;
        operatorData.totalLinearFeet += project.linearFeetCut || 0;
        operatorData.totalHoursWorked += project.hoursWorked || 0;
      });

    // Calculate averages
    operatorMap.forEach((data, operator) => {
      data.avgProductionRate = data.totalHoursWorked > 0
        ? Math.round((data.totalLinearFeet / data.totalHoursWorked) * 10) / 10
        : 0;
      data.revenuePerHour = data.totalHoursWorked > 0
        ? Math.round((data.totalRevenue / data.totalHoursWorked) * 100) / 100
        : 0;
      data.onTimeCompletionRate = 95; // Mock - would calculate from actual vs scheduled dates
    });

    return Array.from(operatorMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  };

  const operatorPerformance = calculateOperatorPerformance();

  // Calculate financial KPIs
  const completedProjects = projects.filter(p => p.status === 'completed' && p.totalRevenue);

  const totalRevenue = completedProjects.reduce((sum, p) => sum + (p.totalRevenue || 0), 0);
  const totalLaborCost = completedProjects.reduce((sum, p) => sum + (p.laborCost || 0), 0);
  const totalMaterialCost = completedProjects.reduce((sum, p) => sum + (p.materialCost || 0), 0);
  const totalEquipmentCost = completedProjects.reduce((sum, p) => sum + (p.equipmentCost || 0), 0);
  const totalCosts = totalLaborCost + totalMaterialCost + totalEquipmentCost;
  const grossProfit = totalRevenue - totalCosts;
  const grossProfitMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  const avgProjectRevenue = completedProjects.length > 0 ? totalRevenue / completedProjects.length : 0;
  const avgProjectProfit = completedProjects.length > 0 ? grossProfit / completedProjects.length : 0;

  // Production KPIs
  const totalLinearFeet = completedProjects.reduce((sum, p) => sum + (p.linearFeetCut || 0), 0);
  const totalHoursWorked = completedProjects.reduce((sum, p) => sum + (p.hoursWorked || 0), 0);
  const avgProductionRate = totalHoursWorked > 0 ? (totalLinearFeet / totalHoursWorked).toFixed(1) : '0.0';
  const revenuePerLinearFoot = totalLinearFeet > 0 ? (totalRevenue / totalLinearFeet).toFixed(2) : '0.00';

  // Schedule Performance
  const scheduledProjects = projects.filter(p => p.status !== 'cancelled').length;
  const onTimeProjects = completedProjects.length; // Mock - would calculate from actual vs scheduled dates
  const schedulePerformance = scheduledProjects > 0 ? ((onTimeProjects / scheduledProjects) * 100).toFixed(0) : '0';

  const handleUpdateProjectPL = () => {
    if (!selectedProject) return;

    setProjects(prev => prev.map(p =>
      p.id === selectedProject.id
        ? {
            ...p,
            totalRevenue: plForm.totalRevenue,
            laborCost: plForm.laborCost,
            materialCost: plForm.materialCost,
            equipmentCost: plForm.equipmentCost
          }
        : p
    ));

    setShowProjectPLModal(false);
    setSelectedProject(null);
    setPLForm({ totalRevenue: 0, laborCost: 0, materialCost: 0, equipmentCost: 0 });
  };

  const openProjectPLModal = (project: Project) => {
    setSelectedProject(project);
    setPLForm({
      totalRevenue: project.totalRevenue || 0,
      laborCost: project.laborCost || 0,
      materialCost: project.materialCost || 0,
      equipmentCost: project.equipmentCost || 0
    });
    setShowProjectPLModal(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Global input text color fix */}
      <style jsx global>{`
        input[type="text"],
        input[type="number"],
        select,
        option {
          color: #111827 !important;
        }
        input::placeholder {
          color: #9ca3af !important;
        }
      `}</style>

      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
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
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Business Analytics & KPIs
              </h1>
              <p className="text-gray-600 font-medium mt-1">Performance metrics, P&L tracking, and operational insights</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-4 py-2 bg-white border-2 border-gray-300 rounded-xl font-semibold focus:border-blue-500 focus:outline-none"
            >
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
            </select>
            {user?.role === 'admin' && (
              <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg">
                👑 ADMIN
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-4 mb-6 shadow-lg">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📊 Overview
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'projects'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📋 Project P&L
            </button>
            <button
              onClick={() => setActiveTab('operators')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'operators'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              👷 Operator Performance
            </button>
            <button
              onClick={() => setActiveTab('financial')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'financial'
                  ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              💰 Financial Details
            </button>
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Key Financial Metrics */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white shadow-xl">
              <h2 className="text-2xl font-bold mb-4">💎 Key Financial Metrics</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white/20 backdrop-blur-lg rounded-xl p-4">
                  <p className="text-blue-100 text-sm font-semibold mb-1">Total Revenue</p>
                  <p className="text-3xl font-bold">${totalRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-white/20 backdrop-blur-lg rounded-xl p-4">
                  <p className="text-blue-100 text-sm font-semibold mb-1">Gross Profit</p>
                  <p className="text-3xl font-bold">${grossProfit.toLocaleString()}</p>
                  <p className="text-xs text-blue-100 mt-1">{grossProfitMargin}% margin</p>
                </div>
                <div className="bg-white/20 backdrop-blur-lg rounded-xl p-4">
                  <p className="text-blue-100 text-sm font-semibold mb-1">Total Costs</p>
                  <p className="text-3xl font-bold">${totalCosts.toLocaleString()}</p>
                </div>
                <div className="bg-white/20 backdrop-blur-lg rounded-xl p-4">
                  <p className="text-blue-100 text-sm font-semibold mb-1">Avg Project Profit</p>
                  <p className="text-3xl font-bold">${avgProjectProfit.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* KPI Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Projects Completed */}
              <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-gray-600 text-sm font-semibold">Projects Completed</p>
                    <p className="text-green-600 text-4xl font-bold">{completedProjects.length}</p>
                  </div>
                  <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {projects.filter(p => p.status === 'in_progress').length} in progress
                </div>
              </div>

              {/* Schedule Performance */}
              <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-gray-600 text-sm font-semibold">On-Time Rate</p>
                    <p className="text-blue-600 text-4xl font-bold">{schedulePerformance}%</p>
                  </div>
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Projects on/ahead of schedule
                </div>
              </div>

              {/* Production Rate */}
              <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-gray-600 text-sm font-semibold">Avg Production Rate</p>
                    <p className="text-purple-600 text-4xl font-bold">{avgProductionRate}</p>
                  </div>
                  <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Linear feet per hour
                </div>
              </div>

              {/* Revenue Per Unit */}
              <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-gray-600 text-sm font-semibold">Revenue/Linear Foot</p>
                    <p className="text-orange-600 text-4xl font-bold">${revenuePerLinearFoot}</p>
                  </div>
                  <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Pricing efficiency metric
                </div>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
              <h3 className="text-xl font-bold text-gray-800 mb-4">💵 Cost Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-blue-700">Labor Costs</span>
                    <span className="text-xs text-blue-600">
                      {totalRevenue > 0 ? ((totalLaborCost / totalRevenue) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">${totalLaborCost.toLocaleString()}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-green-700">Material Costs</span>
                    <span className="text-xs text-green-600">
                      {totalRevenue > 0 ? ((totalMaterialCost / totalRevenue) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-green-900">${totalMaterialCost.toLocaleString()}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-purple-700">Equipment Costs</span>
                    <span className="text-xs text-purple-600">
                      {totalRevenue > 0 ? ((totalEquipmentCost / totalRevenue) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-purple-900">${totalEquipmentCost.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Top Performers */}
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
              <h3 className="text-xl font-bold text-gray-800 mb-4">🏆 Top Performing Operators</h3>
              <div className="space-y-3">
                {operatorPerformance.slice(0, 3).map((operator, index) => (
                  <div key={operator.name} className="flex items-center justify-between bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-4 border border-yellow-200">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                        index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-orange-600'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">{operator.name}</p>
                        <p className="text-xs text-gray-600">{operator.projectsCompleted} projects completed</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-green-600">${operator.totalRevenue.toLocaleString()}</p>
                      <p className="text-xs text-gray-600">{operator.avgProductionRate} ft/hr</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Project P&L Tab */}
        {activeTab === 'projects' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-6 text-white shadow-xl">
              <h2 className="text-2xl font-bold mb-2">📋 Project Profit & Loss</h2>
              <p className="text-green-100">Click on any project to input or update financial data</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {projects.map(project => {
                const profit = (project.totalRevenue || 0) -
                               (project.laborCost || 0) -
                               (project.materialCost || 0) -
                               (project.equipmentCost || 0);
                const margin = project.totalRevenue
                  ? ((profit / project.totalRevenue) * 100).toFixed(1)
                  : '0.0';

                return (
                  <div
                    key={project.id}
                    onClick={() => openProjectPLModal(project)}
                    className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer hover:scale-[1.01]"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-bold text-gray-800 text-lg">{project.name}</h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            project.status === 'completed' ? 'bg-green-100 text-green-700' :
                            project.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            project.status === 'scheduled' ? 'bg-gray-100 text-gray-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {project.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">Operator: {project.assignedOperator}</p>
                        <p className="text-xs text-gray-500">
                          Scheduled: {new Date(project.scheduledDate).toLocaleDateString()}
                          {project.completedDate && ` | Completed: ${new Date(project.completedDate).toLocaleDateString()}`}
                        </p>
                      </div>

                      {project.totalRevenue ? (
                        <div className="text-right">
                          <p className="text-sm text-gray-600 mb-1">Profit Margin</p>
                          <p className={`text-3xl font-bold ${parseFloat(margin) > 30 ? 'text-green-600' : parseFloat(margin) > 15 ? 'text-blue-600' : 'text-orange-600'}`}>
                            {margin}%
                          </p>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 rounded-xl px-4 py-2 border border-yellow-200">
                          <p className="text-xs font-semibold text-yellow-700">Click to add P&L</p>
                        </div>
                      )}
                    </div>

                    {project.totalRevenue ? (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                          <p className="text-xs text-green-700 font-semibold mb-1">Revenue</p>
                          <p className="text-lg font-bold text-green-900">${project.totalRevenue.toLocaleString()}</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                          <p className="text-xs text-blue-700 font-semibold mb-1">Labor</p>
                          <p className="text-lg font-bold text-blue-900">${(project.laborCost || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                          <p className="text-xs text-purple-700 font-semibold mb-1">Materials</p>
                          <p className="text-lg font-bold text-purple-900">${(project.materialCost || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                          <p className="text-xs text-orange-700 font-semibold mb-1">Equipment</p>
                          <p className="text-lg font-bold text-orange-900">${(project.equipmentCost || 0).toLocaleString()}</p>
                        </div>
                        <div className={`rounded-lg p-3 border-2 ${profit > 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                          <p className={`text-xs font-semibold mb-1 ${profit > 0 ? 'text-green-700' : 'text-red-700'}`}>Net Profit</p>
                          <p className={`text-lg font-bold ${profit > 0 ? 'text-green-900' : 'text-red-900'}`}>
                            ${profit.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center">
                        <p className="text-sm text-gray-600">No financial data entered yet</p>
                      </div>
                    )}

                    {/* Production metrics */}
                    {(project.linearFeetCut || project.hoursWorked) && (
                      <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-3 gap-3">
                        {project.linearFeetCut && (
                          <div>
                            <p className="text-xs text-gray-600">Linear Feet Cut</p>
                            <p className="text-lg font-bold text-gray-800">{project.linearFeetCut} ft</p>
                          </div>
                        )}
                        {project.hoursWorked && (
                          <div>
                            <p className="text-xs text-gray-600">Hours Worked</p>
                            <p className="text-lg font-bold text-gray-800">{project.hoursWorked} hrs</p>
                          </div>
                        )}
                        {project.linearFeetCut && project.hoursWorked && (
                          <div>
                            <p className="text-xs text-gray-600">Production Rate</p>
                            <p className="text-lg font-bold text-gray-800">
                              {(project.linearFeetCut / project.hoursWorked).toFixed(1)} ft/hr
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Operators Tab */}
        {activeTab === 'operators' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-6 text-white shadow-xl">
              <h2 className="text-2xl font-bold mb-2">👷 Operator Performance Analytics</h2>
              <p className="text-purple-100">Production rates, revenue generation, and efficiency metrics</p>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {operatorPerformance.map((operator, index) => (
                <div key={operator.name} className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white ${
                        index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' :
                        index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500' :
                        index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
                        'bg-gradient-to-br from-blue-400 to-blue-600'
                      }`}>
                        #{index + 1}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-800">{operator.name}</h3>
                        <p className="text-sm text-gray-600">{operator.projectsCompleted} projects completed</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600 mb-1">Total Revenue Generated</p>
                      <p className="text-3xl font-bold text-green-600">${operator.totalRevenue.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                      <p className="text-xs text-blue-700 font-semibold mb-2">Production Rate</p>
                      <p className="text-2xl font-bold text-blue-900">{operator.avgProductionRate}</p>
                      <p className="text-xs text-blue-600">linear feet/hour</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                      <p className="text-xs text-green-700 font-semibold mb-2">Revenue/Hour</p>
                      <p className="text-2xl font-bold text-green-900">${operator.revenuePerHour}</p>
                      <p className="text-xs text-green-600">per hour worked</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                      <p className="text-xs text-purple-700 font-semibold mb-2">Total Production</p>
                      <p className="text-2xl font-bold text-purple-900">{operator.totalLinearFeet}</p>
                      <p className="text-xs text-purple-600">linear feet cut</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                      <p className="text-xs text-orange-700 font-semibold mb-2">On-Time Rate</p>
                      <p className="text-2xl font-bold text-orange-900">{operator.onTimeCompletionRate}%</p>
                      <p className="text-xs text-orange-600">schedule adherence</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financial Tab */}
        {activeTab === 'financial' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-2xl p-6 text-white shadow-xl">
              <h2 className="text-2xl font-bold mb-2">💰 Financial Performance Details</h2>
              <p className="text-orange-100">Detailed cost analysis and profit metrics</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Revenue Analysis</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total Revenue</span>
                    <span className="text-xl font-bold text-gray-800">${totalRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Avg Per Project</span>
                    <span className="text-lg font-bold text-blue-600">${avgProjectRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Revenue/Linear Foot</span>
                    <span className="text-lg font-bold text-purple-600">${revenuePerLinearFoot}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total Linear Feet</span>
                    <span className="text-lg font-bold text-gray-700">{totalLinearFeet.toLocaleString()} ft</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Profit Analysis</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Gross Profit</span>
                    <span className="text-xl font-bold text-green-600">${grossProfit.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Profit Margin</span>
                    <span className="text-lg font-bold text-green-600">{grossProfitMargin}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Avg Per Project</span>
                    <span className="text-lg font-bold text-blue-600">${avgProjectProfit.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Profit/Linear Foot</span>
                    <span className="text-lg font-bold text-purple-600">
                      ${totalLinearFeet > 0 ? (grossProfit / totalLinearFeet).toFixed(2) : '0.00'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cost Breakdown Details */}
            <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Detailed Cost Breakdown</h3>
              <div className="space-y-4">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-blue-900">Labor Costs</span>
                    <span className="text-2xl font-bold text-blue-900">${totalLaborCost.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-blue-600">% of Revenue</p>
                      <p className="font-bold text-blue-800">
                        {totalRevenue > 0 ? ((totalLaborCost / totalRevenue) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-600">Per Project</p>
                      <p className="font-bold text-blue-800">
                        ${completedProjects.length > 0 ? (totalLaborCost / completedProjects.length).toLocaleString() : 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-600">Per Linear Foot</p>
                      <p className="font-bold text-blue-800">
                        ${totalLinearFeet > 0 ? (totalLaborCost / totalLinearFeet).toFixed(2) : '0.00'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-green-900">Material Costs</span>
                    <span className="text-2xl font-bold text-green-900">${totalMaterialCost.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-green-600">% of Revenue</p>
                      <p className="font-bold text-green-800">
                        {totalRevenue > 0 ? ((totalMaterialCost / totalRevenue) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                    <div>
                      <p className="text-green-600">Per Project</p>
                      <p className="font-bold text-green-800">
                        ${completedProjects.length > 0 ? (totalMaterialCost / completedProjects.length).toLocaleString() : 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-green-600">Per Linear Foot</p>
                      <p className="font-bold text-green-800">
                        ${totalLinearFeet > 0 ? (totalMaterialCost / totalLinearFeet).toFixed(2) : '0.00'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-purple-900">Equipment Costs</span>
                    <span className="text-2xl font-bold text-purple-900">${totalEquipmentCost.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-purple-600">% of Revenue</p>
                      <p className="font-bold text-purple-800">
                        {totalRevenue > 0 ? ((totalEquipmentCost / totalRevenue) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                    <div>
                      <p className="text-purple-600">Per Project</p>
                      <p className="font-bold text-purple-800">
                        ${completedProjects.length > 0 ? (totalEquipmentCost / completedProjects.length).toLocaleString() : 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-purple-600">Per Linear Foot</p>
                      <p className="font-bold text-purple-800">
                        ${totalLinearFeet > 0 ? (totalEquipmentCost / totalLinearFeet).toFixed(2) : '0.00'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Insights */}
            <div className="bg-blue-50 rounded-2xl border-2 border-blue-200 p-6">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <div>
                  <h4 className="text-lg font-bold text-blue-900 mb-2">Key Financial Insights</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Target profit margin for construction businesses: 15-20% (Your margin: {grossProfitMargin}%)</li>
                    <li>• Labor costs should ideally be 20-40% of revenue (Currently: {totalRevenue > 0 ? ((totalLaborCost / totalRevenue) * 100).toFixed(1) : 0}%)</li>
                    <li>• Material costs typically run 30-50% of revenue (Currently: {totalRevenue > 0 ? ((totalMaterialCost / totalRevenue) * 100).toFixed(1) : 0}%)</li>
                    <li>• Average production rate benchmark: 25-35 linear feet/hour (Your avg: {avgProductionRate} ft/hr)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Project P&L Modal */}
        {showProjectPLModal && selectedProject && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-2xl font-bold text-gray-800 mb-2">Project P&L Input</h3>
                <p className="text-gray-600 mb-6">{selectedProject.name}</p>

                <div className="space-y-4">
                  {/* Total Revenue */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Total Project Revenue <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 text-lg font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={plForm.totalRevenue || ''}
                        onChange={(e) => setPLForm(prev => ({ ...prev, totalRevenue: parseFloat(e.target.value) || 0 }))}
                        className="w-full pl-10 pr-4 py-3 text-lg font-bold border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Labor Cost */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Labor Cost
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={plForm.laborCost || ''}
                        onChange={(e) => setPLForm(prev => ({ ...prev, laborCost: parseFloat(e.target.value) || 0 }))}
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Material Cost */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Material Cost
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={plForm.materialCost || ''}
                        onChange={(e) => setPLForm(prev => ({ ...prev, materialCost: parseFloat(e.target.value) || 0 }))}
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Equipment Cost */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Equipment Cost
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={plForm.equipmentCost || ''}
                        onChange={(e) => setPLForm(prev => ({ ...prev, equipmentCost: parseFloat(e.target.value) || 0 }))}
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Calculated Profit */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border-2 border-green-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-green-700">Calculated Net Profit:</span>
                      <span className="text-2xl font-bold text-green-900">
                        ${(plForm.totalRevenue - plForm.laborCost - plForm.materialCost - plForm.equipmentCost).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-green-600">Profit Margin:</span>
                      <span className="text-lg font-bold text-green-800">
                        {plForm.totalRevenue > 0
                          ? (((plForm.totalRevenue - plForm.laborCost - plForm.materialCost - plForm.equipmentCost) / plForm.totalRevenue) * 100).toFixed(1)
                          : '0.0'}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowProjectPLModal(false);
                      setSelectedProject(null);
                      setPLForm({ totalRevenue: 0, laborCost: 0, materialCost: 0, equipmentCost: 0 });
                    }}
                    className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateProjectPL}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-colors font-semibold"
                  >
                    Save P&L Data
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

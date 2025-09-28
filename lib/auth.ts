// Demo authentication for development
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

// Demo credentials
const DEMO_CREDENTIALS = [
  {
    email: 'demo@pontifex.com',
    password: 'Demo1234!',
    user: {
      id: 'demo-user-1',
      name: 'Demo Operator',
      email: 'demo@pontifex.com',
      role: 'operator'
    }
  },
  {
    email: 'admin@pontifex.com',
    password: 'Admin1234!',
    user: {
      id: 'admin-user-1',
      name: 'Admin User',
      email: 'admin@pontifex.com',
      role: 'admin'
    }
  }
];

export const checkCredentials = async (email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> => {
  console.log('🔐 Checking credentials...');
  console.log('📧 Email entered:', email);
  console.log('🔑 Password entered:', password.replace(/./g, '*')); // Mask password

  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check against all demo credentials
  const matchingCredential = DEMO_CREDENTIALS.find(
    cred => cred.email === email && cred.password === password
  );

  if (matchingCredential) {
    console.log('✅ Credentials match!', matchingCredential.user.role);

    // Store user in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('pontifex-user', JSON.stringify(matchingCredential.user));
      console.log('💾 User stored in localStorage');
    }

    return {
      success: true,
      user: matchingCredential.user
    };
  } else {
    console.log('❌ Credentials do not match any account');

    return {
      success: false,
      error: 'Invalid email or password. Use demo@pontifex.com / Demo1234! or admin@pontifex.com / Admin1234!'
    };
  }
};

export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const userStr = localStorage.getItem('pontifex-user');
    if (userStr && userStr.trim()) {
      const user = JSON.parse(userStr);
      console.log('👤 Current user from localStorage:', user);
      return user;
    }
  } catch (error) {
    console.error('Error getting user from localStorage:', error);
    // Clear corrupted data
    localStorage.removeItem('pontifex-user');
  }
  
  return null;
};

export const logout = (): void => {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem('pontifex-user');
  console.log('🚪 User logged out');
};

export const isAuthenticated = (): boolean => {
  return getCurrentUser() !== null;
};

export const isAdmin = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'admin';
};

export const isOperator = (): boolean => {
  const user = getCurrentUser();
  return user?.role === 'operator';
};

export const hasRole = (role: string): boolean => {
  const user = getCurrentUser();
  return user?.role === role;
};
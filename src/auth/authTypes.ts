export type RoleId = 'operator' | 'auditor' | 'esg_officer' | 'manager';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  roleId: RoleId;
  roleTitle: string;
  department: string;
  initials: string;
  avatarColor: string;
  allowedViews: string[];
  description: string;
  badge: {
    label: string;
    bg: string;
    color: string;
    border: string;
  };
}

export const DEMO_USERS: Record<RoleId, UserProfile> = {
  operator: {
    id: 'usr_op_01',
    email: 'operator@precisionworks.mfg',
    name: 'Vikram Malhotra',
    roleId: 'operator',
    roleTitle: 'Plant SCADA Operator',
    department: 'Shop Floor & Pneumatics Operations',
    initials: 'VM',
    avatarColor: '#10B981',
    allowedViews: ['overview', 'scada', 'simulator', 'diagnostics', 'anomalies'],
    description: 'Direct operational telemetry, machine diagnostics, sensor anomaly triage, and physics interlocks.',
    badge: {
      label: 'SCADA OPERATOR',
      bg: '#D1FAE5',
      color: '#065F46',
      border: 'rgba(16, 185, 129, 0.4)',
    },
  },
  auditor: {
    id: 'usr_aud_02',
    email: 'ananya.sharma@kirloskar-audit.in',
    name: 'Dr. Ananya Sharma',
    roleId: 'auditor',
    roleTitle: 'Certified Energy Auditor (BEE)',
    department: 'Energy Auditing & ISO 50001 Advisory',
    initials: 'AS',
    avatarColor: '#8B5CF6',
    allowedViews: ['overview', 'simulator', 'forecast', 'carbon', 'evidence', 'reports', 'configurator', 'diagnostics'],
    description: 'Time-of-Day tariff arbitrage, Specific Energy Consumption (SEC), ISO 50001 audits, and peak shaving.',
    badge: {
      label: 'ENERGY AUDITOR',
      bg: '#EDE9FE',
      color: '#5B21B6',
      border: 'rgba(139, 92, 246, 0.4)',
    },
  },
  esg_officer: {
    id: 'usr_esg_03',
    email: 'kavita.rao@precisionworks.mfg',
    name: 'Kavita Rao',
    roleId: 'esg_officer',
    roleTitle: 'Sustainability & ESG Lead',
    department: 'Corporate Sustainability & Carbon Compliance',
    initials: 'KR',
    avatarColor: '#06B6D4',
    allowedViews: ['overview', 'carbon', 'quota', 'evidence', 'reports', 'executive', 'forecast'],
    description: 'Scope 1 & 2 carbon accounting, CEA India grid emission factors, statutory quotas, and BRSR disclosures.',
    badge: {
      label: 'ESG OFFICER',
      bg: '#CFFAFE',
      color: '#155E75',
      border: 'rgba(6, 182, 212, 0.4)',
    },
  },
  manager: {
    id: 'usr_gm_04',
    email: 'rajesh.nair@precisionworks.mfg',
    name: 'Rajesh Nair',
    roleId: 'manager',
    roleTitle: 'Plant General Manager (Admin)',
    department: 'Executive Factory Leadership',
    initials: 'RN',
    avatarColor: '#F59E0B',
    allowedViews: [
      'overview',
      'executive',
      'diagnostics',
      'scada',
      'simulator',
      'configurator',
      'quota',
      'forecast',
      'carbon',
      'anomalies',
      'evidence',
      'reports',
    ],
    description: 'Unrestricted plant-wide authority, high-level executive KPI dashboards, and interlock authorization.',
    badge: {
      label: 'PLANT GM (ADMIN)',
      bg: '#FEF3C7',
      color: '#92400E',
      border: 'rgba(245, 158, 11, 0.4)',
    },
  },
};

export const VIEW_SECURITY_METADATA: Record<
  string,
  {
    title: string;
    requiredRoles: RoleId[];
    category: 'Operations' | 'Analytics' | 'Sustainability' | 'Executive';
  }
> = {
  overview: {
    title: 'Plant Overview',
    requiredRoles: ['operator', 'auditor', 'esg_officer', 'manager'],
    category: 'Operations',
  },
  executive: {
    title: 'Executive Presentation View',
    requiredRoles: ['esg_officer', 'manager'],
    category: 'Executive',
  },
  diagnostics: {
    title: 'Engineering Diagnostics Cockpit',
    requiredRoles: ['operator', 'auditor', 'manager'],
    category: 'Operations',
  },
  scada: {
    title: '3D SCADA Factory Twin',
    requiredRoles: ['operator', 'manager'],
    category: 'Operations',
  },
  simulator: {
    title: 'Digital Twin Simulation Lab',
    requiredRoles: ['operator', 'auditor', 'manager'],
    category: 'Analytics',
  },
  configurator: {
    title: '50-Asset Catalog & Configurator',
    requiredRoles: ['auditor', 'manager'],
    category: 'Analytics',
  },
  quota: {
    title: 'Carbon Quotas & Interlock Ledger',
    requiredRoles: ['esg_officer', 'manager'],
    category: 'Sustainability',
  },
  forecast: {
    title: 'Energy Forecast Intelligence',
    requiredRoles: ['auditor', 'esg_officer', 'manager'],
    category: 'Analytics',
  },
  carbon: {
    title: 'ISO 14064 Carbon Accounting',
    requiredRoles: ['auditor', 'esg_officer', 'manager'],
    category: 'Sustainability',
  },
  anomalies: {
    title: 'AI Anomaly Intelligence & Triage',
    requiredRoles: ['operator', 'manager'],
    category: 'Operations',
  },
  evidence: {
    title: 'Evidence & Compliance Vault',
    requiredRoles: ['auditor', 'esg_officer', 'manager'],
    category: 'Sustainability',
  },
  reports: {
    title: 'Certified Audit Reports',
    requiredRoles: ['auditor', 'esg_officer', 'manager'],
    category: 'Sustainability',
  },
};

export function hasViewAccess(roleId: RoleId, viewId: string): boolean {
  const user = DEMO_USERS[roleId];
  if (!user) return false;
  return user.allowedViews.includes(viewId);
}

export type EntityType = 'collaborators' | 'machines' | 'servers' | 'printers' | 'ups' | 'licenses' | 'units';

export interface Collaborator {
  id: string;
  name: string;
  machine_id?: string;
  login: string;
  login_password?: string;
  network_group: string;
  email: string;
  alias_creation: string;
  forwarding: string;
  sector_responsible: string;
  allocation_sector?: string;
  unit: string;
  email_password?: string;
  office_license?: string;
  autodesk_credentials?: string;
  status: 'active' | 'inactive' | 'deactivated';
  lastCommentAt?: any;
}

export interface Machine {
  id: string;
  type: 'desktop' | 'laptop';
  brand: string;
  model: string;
  serialNumber: string;
  invoiceNumber?: string;
  danfeKey?: string;
  biosDate?: string;
  hostname: string;
  ipAddress?: string;
  os?: 'W10' | 'W11' | 'Linux' | 'MacOS';
  osVersion?: string;
  unit: string;
  status: 'available' | 'in-use' | 'maintenance' | 'retired' | 'deactivated';
  assignedTo?: string; // Collaborator ID
  nextMaintenanceDate?: string;
  processor?: string;
  memory?: string;
  disk?: string;
  ups?: string;
  specs?: {
    cpu: string;
    ram: string;
    storage: string;
  };
  lastCommentAt?: any;
}

export interface Server {
  id: string;
  name: string;
  ipAddress: string;
  os: string;
  role: string;
  status: 'online' | 'offline' | 'maintenance';
  unit: string;
  nextMaintenanceDate?: string;
  specs: {
    cpu: string;
    ram: string;
    storage: string;
  };
}

export interface Printer {
  id: string;
  brand: string;
  model: string;
  connectionType: 'USB' | 'WIFI' | 'Cabo de rede';
  ipAddress: string; // Endereço IP/Compartilhamento
  location: string;
  status: 'online' | 'offline' | 'maintenance';
  unit: string;
  nextMaintenanceDate?: string;
  photoUrl?: string;
}

export interface Ups {
  id: string;
  brand: string;
  model: string;
  powerCapacity?: string;
  serialNumber?: string;
  location?: string;
  unit?: string;
  status: 'online' | 'offline' | 'maintenance';
  batteryChangeDate?: string;
  nextMaintenanceDate?: string;
  connectedDevices?: string;
  photoUrl?: string;
}

export interface Unit {
  id: string;
  name: string;
  code?: string;
  cnpj?: string;
  razaoSocial?: string;
  cnpjSituacao?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  responsible?: string;
  notes?: string;
  status: 'active' | 'inactive' | 'deactivated';
}

export interface License {
  id: string;
  softwareName: string;
  licenseKey: string;
  expirationDate: string;
  quantity: number;
  used: number;
  unit: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large' | 'extra';
  notifications: {
    email: boolean;
    browser: boolean;
    system: boolean;
  };
}

export interface PasswordStatus {
  lastChanged: string;
  expiresAt: string;
  mustChange: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  userName?: string;
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'export';
  entityType: string;
  entityId: string;
  details?: string;
  before?: any;
  after?: any;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failure' | 'pending';
}

export type UserRole = 'viewer' | 'editor' | 'manager' | 'admin' | 'super_admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  permissions?: string[];
  sector?: string;
  existsInFirestore?: boolean;
  lastSignInTime?: string;
  createdAt?: any;
  preferences?: UserPreferences;
  passwordStatus?: PasswordStatus;
  loginHistory?: {
    timestamp: any;
    ipAddress: string;
  }[];
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  createdAt: string;
  link?: string;
}

export type CommentTag = '#Erro' | '#Incomplete' | '#SolicitaçãoMudança' | '#Desligamento' | '#TrocaSetor' | 'none';

export interface Comment {
  id: string;
  entityId: string;
  entityType: 'users' | 'machines' | 'collaborators' | 'servers' | 'printers' | 'ups' | 'licenses';
  authorId: string;
  authorName: string;
  authorEmail: string;
  content: string;
  tag: CommentTag;
  mentions: string[]; // uids
  parentId?: string; // For replies
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskCategory = 'software' | 'hardware' | 'network' | 'access' | 'other';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  assignedTo: string; // uid
  assignedToName: string;
  createdBy: string; // uid
  createdByName: string;
  dueDate?: string;
  createdAt: any;
  updatedAt: any;
}

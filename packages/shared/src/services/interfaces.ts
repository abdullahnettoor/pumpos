import {
  Station,
  Product,
  Tank,
  DispenserUnit,
  Nozzle,
  ShiftTemplate,
  User,
  FinalizeOnboardingPayload,
  FinalizeOnboardingResult,
} from '../types/entities.js';

export interface IStationService {
  getStation(id: string): Promise<Station | null>;
  updateStation(id: string, data: { name: string; address?: string | null; phone?: string | null; settings?: Record<string, any>; onboardingStatus?: string }): Promise<Station>;
  getOnboardingStatus(stationId: string): Promise<any>;
  completeOnboarding(stationId: string): Promise<any>;
  finalizeOnboarding(payload: FinalizeOnboardingPayload): Promise<FinalizeOnboardingResult>;
  getCurrentSession(): Promise<any>;
}

export interface IProductService {
  listProducts(orgId: string): Promise<Product[]>;
  createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product>;
  updateProduct(id: string, data: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Product>;
  archiveProduct(id: string): Promise<void>;
}

export interface ITankService {
  listTanks(stationId: string): Promise<Tank[]>;
  createTank(data: Omit<Tank, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tank>;
  updateTank(id: string, data: Partial<Omit<Tank, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Tank>;
  deleteTank(id: string): Promise<void>;
}

export interface IDispenserService {
  listDispensers(stationId: string): Promise<DispenserUnit[]>;
  createDispenser(data: Omit<DispenserUnit, 'id' | 'createdAt' | 'updatedAt'>): Promise<DispenserUnit>;
  updateDispenser(id: string, data: Partial<Omit<DispenserUnit, 'id' | 'createdAt' | 'updatedAt'>>): Promise<DispenserUnit>;
  deleteDispenser(id: string): Promise<void>;
}

export interface INozzleService {
  listNozzles(stationId: string): Promise<Nozzle[]>;
  createNozzle(data: Omit<Nozzle, 'id' | 'createdAt' | 'updatedAt'>): Promise<Nozzle>;
  updateNozzle(id: string, data: Partial<Omit<Nozzle, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Nozzle>;
  deleteNozzle(id: string): Promise<void>;
}

export interface IShiftTemplateService {
  listTemplates(orgId: string): Promise<ShiftTemplate[]>;
  createTemplate(data: Omit<ShiftTemplate, 'id'>): Promise<ShiftTemplate>;
  updateTemplate(id: string, data: Partial<Omit<ShiftTemplate, 'id'>>): Promise<ShiftTemplate>;
  deleteTemplate(id: string): Promise<void>;
}

export interface IUserAssignmentService {
  listUsers(): Promise<User[]>;
  assignUserToStation(userId: string, stationId: string): Promise<void>;
  setUserRole(userId: string, role: string): Promise<void>;
  createUser(data: any): Promise<User>;
  updateUser(id: string, data: any): Promise<User>;
}

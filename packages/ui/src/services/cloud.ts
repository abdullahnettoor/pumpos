import {
  IStationService,
  IProductService,
  ITankService,
  IDispenserService,
  INozzleService,
  IShiftTemplateService,
  IUserAssignmentService,
  Station,
  Product,
  Tank,
  DispenserUnit,
  Nozzle,
  ShiftTemplate,
  User,
  ShiftOpenPayload,
  ShiftClosePayload,
  FinalizeOnboardingPayload,
  FinalizeOnboardingResult,
} from '@pump/shared';

// Base API configuration. App shells should call setApiBaseUrl() at startup.
let apiBase = 'http://localhost:8787/api';

export function setApiBaseUrl(url?: string) {
  if (!url) {
    return;
  }

  let normalized = url.endsWith('/') ? url.slice(0, -1) : url;
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  apiBase = `${normalized}/api`;
}

// For local testing, we attach a mock token.
// The app can set this dynamically upon user selection.
let activeToken = '';

export function setAuthToken(token: string) {
  activeToken = token;
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${activeToken}`,
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${apiBase}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  });

  const res = await response.json() as any;
  if (!res.success) {
    const error = new Error(res.error?.message || 'API request failed') as Error & {
      code?: string;
      details?: Record<string, any>;
      status?: number;
    };
    error.code = res.error?.code;
    error.details = res.error?.details;
    error.status = response.status;
    throw error;
  }
  return res.data;
}

export class CloudStationService implements IStationService {
  async getStation(id: string): Promise<Station | null> {
    const list = await request<Station[]>('/setup/stations');
    return list.find((s) => s.id === id) || null;
  }

  async getStations(): Promise<Station[]> {
    return request<Station[]>('/setup/stations');
  }

  async createStation(data: any): Promise<Station> {
    return request<Station>('/setup/stations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStation(id: string, data: any): Promise<Station> {
    return request<Station>(`/setup/stations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getOnboardingStatus(stationId: string): Promise<any> {
    return request<any>(`/setup/onboarding/status?stationId=${stationId}`);
  }

  async completeOnboarding(stationId: string): Promise<any> {
    return request<any>('/setup/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ stationId }),
    });
  }

  async finalizeOnboarding(payload: FinalizeOnboardingPayload): Promise<FinalizeOnboardingResult> {
    return request<FinalizeOnboardingResult>('/setup/onboarding/finalize', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getCurrentSession(): Promise<any> {
    return request<any>('/session');
  }
}

export class CloudProductService implements IProductService {
  async listProducts(): Promise<Product[]> {
    return request<Product[]>('/setup/products');
  }

  async createProduct(data: any): Promise<Product> {
    return request<Product>('/setup/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProduct(id: string, data: any): Promise<Product> {
    return request<Product>(`/setup/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async archiveProduct(id: string): Promise<void> {
    await request<void>(`/setup/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: false }),
    });
  }
}

export class CloudTankService implements ITankService {
  async listTanks(stationId: string): Promise<Tank[]> {
    return request<Tank[]>(`/setup/tanks?stationId=${stationId}`);
  }

  async createTank(data: any): Promise<Tank> {
    return request<Tank>('/setup/tanks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTank(id: string, data: any): Promise<Tank> {
    return request<Tank>(`/setup/tanks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTank(id: string): Promise<void> {
    await request<void>(`/setup/tanks/${id}`, {
      method: 'DELETE',
    });
  }
}

export class CloudDispenserService implements IDispenserService {
  async listDispensers(stationId: string): Promise<DispenserUnit[]> {
    return request<DispenserUnit[]>(`/setup/dispensers?stationId=${stationId}`);
  }

  async createDispenser(data: any): Promise<DispenserUnit> {
    return request<DispenserUnit>('/setup/dispensers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDispenser(id: string, data: any): Promise<DispenserUnit> {
    return request<DispenserUnit>(`/setup/dispensers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteDispenser(id: string): Promise<void> {
    await request<void>(`/setup/dispensers/${id}`, {
      method: 'DELETE',
    });
  }
}

export class CloudNozzleService implements INozzleService {
  async listNozzles(stationId: string): Promise<Nozzle[]> {
    return request<Nozzle[]>(`/setup/nozzles?stationId=${stationId}`);
  }

  async createNozzle(data: any): Promise<Nozzle> {
    return request<Nozzle>('/setup/nozzles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNozzle(id: string, data: any): Promise<Nozzle> {
    return request<Nozzle>(`/setup/nozzles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteNozzle(id: string): Promise<void> {
    await request<void>(`/setup/nozzles/${id}`, {
      method: 'DELETE',
    });
  }
}

export class CloudShiftTemplateService implements IShiftTemplateService {
  async listTemplates(): Promise<ShiftTemplate[]> {
    return request<ShiftTemplate[]>('/setup/shift-templates');
  }

  async createTemplate(data: any): Promise<ShiftTemplate> {
    return request<ShiftTemplate>('/setup/shift-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTemplate(id: string, data: any): Promise<ShiftTemplate> {
    return request<ShiftTemplate>(`/setup/shift-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTemplate(id: string): Promise<void> {
    await request<void>(`/setup/shift-templates/${id}`, {
      method: 'DELETE',
    });
  }
}

export class CloudUserAssignmentService implements IUserAssignmentService {
  async listUsers(): Promise<User[]> {
    return request<User[]>('/setup/users');
  }

  async assignUserToStation(_userId: string, _stationId: string): Promise<void> {
    // In MVP represented as updating users station assignments
  }

  async setUserRole(_userId: string, _role: string): Promise<void> {
    // Role change
  }

  async createUser(data: any): Promise<User> {
    return request<User>('/setup/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: string, data: any): Promise<User> {
    return request<User>(`/setup/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
}

export class CloudShiftService {
  async getShiftStatus(stationId: string, lite: boolean = false): Promise<any> {
    return request<any>(`/shifts/status?stationId=${stationId}${lite ? '&lite=true' : ''}`);
  }

  async openShift(payload: ShiftOpenPayload): Promise<any> {
    return request<any>('/shifts/open', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateNozzleReadings(shiftId: string, readings: { nozzleId: string; closingReading: number }[]): Promise<any> {
    return request<any>('/shifts/readings', {
      method: 'PUT',
      body: JSON.stringify({ shiftId, readings }),
    });
  }

  async closeShift(shiftId: string, payload: ShiftClosePayload): Promise<any> {
    return request<any>('/shifts/close', {
      method: 'POST',
      body: JSON.stringify({ shiftId, payload }),
    });
  }

  async reopenShift(shiftId: string): Promise<any> {
    return request<any>('/shifts/reopen', {
      method: 'POST',
      body: JSON.stringify({ shiftId }),
    });
  }

  async recordHandover(payload: any): Promise<any> {
    return request<any>('/shifts/handovers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getHandovers(shiftId: string): Promise<any[]> {
    return request<any[]>(`/shifts/handovers?shiftId=${shiftId}`);
  }

  async getShiftSummaries(stationId: string): Promise<any[]> {
    const data = await request<any[]>(`/shifts/shift-summaries?stationId=${stationId}`);
    return data || [];
  }

  async generateDailyDssr(stationId: string, businessDate: string): Promise<any> {
    return request<any>('/dssr/daily/generate', {
      method: 'POST',
      body: JSON.stringify({ stationId, businessDate }),
    });
  }

  async getDailyDssr(stationId: string, date: string): Promise<any> {
    return request<any>(`/dssr/daily?stationId=${stationId}&date=${date}`);
  }

  async getDailyDssrRange(stationId: string, from: string, to: string): Promise<any[]> {
    const data = await request<any[]>(`/dssr/daily/range?stationId=${stationId}&from=${from}&to=${to}`);
    return data || [];
  }
}

export class CloudTransactionService {
  async getShiftTransactions(shiftId: string): Promise<any> {
    return request<any>(`/transactions/shifts/${shiftId}/transactions`);
  }

  async getExpenseCategories(): Promise<any> {
    return request<any>('/transactions/expense-categories');
  }

  async getSuppliers(activeOnly: boolean = true): Promise<any> {
    return request<any>(`/transactions/suppliers?activeOnly=${activeOnly}`);
  }

  async createSupplier(payload: { name: string; phone?: string | null; isActive?: boolean; metadata?: { gstin?: string | null; pan?: string | null; tradeName?: string | null; billingAddress?: string | null } | null }): Promise<any> {
    return request<any>('/transactions/suppliers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateSupplier(id: string, payload: { name: string; phone?: string | null; isActive?: boolean; metadata?: { gstin?: string | null; pan?: string | null; tradeName?: string | null; billingAddress?: string | null } | null }): Promise<any> {
    return request<any>(`/transactions/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteSupplier(id: string): Promise<any> {
    return request<any>(`/transactions/suppliers/${id}`, {
      method: 'DELETE',
    });
  }

  async getCustomers(activeOnly: boolean = true): Promise<any> {
    return request<any>(`/transactions/customers?activeOnly=${activeOnly}`);
  }

  async createCustomer(payload: { name: string; phone?: string | null; customerType: 'Regular' | 'Credit' | 'Fleet'; creditLimit?: number | null; fleetCode?: string | null; isPrepaid?: boolean; isActive?: boolean; metadata?: { gstin?: string | null; pan?: string | null; tradeName?: string | null; billingAddress?: string | null } | null }): Promise<any> {
    return request<any>('/transactions/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateCustomer(id: string, payload: { name: string; phone?: string | null; customerType: 'Regular' | 'Credit' | 'Fleet'; creditLimit?: number | null; fleetCode?: string | null; isPrepaid?: boolean; isActive?: boolean; metadata?: { gstin?: string | null; pan?: string | null; tradeName?: string | null; billingAddress?: string | null } | null }): Promise<any> {
    return request<any>(`/transactions/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async topupCustomer(customerId: string, payload: { amount: number; paymentMethod: 'Cash' | 'Card' | 'UPI' | 'BankTransfer'; notes?: string }): Promise<any> {
    return request<any>(`/transactions/customers/${customerId}/topup`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async reconcilePrepaid(): Promise<any> {
    return request<any>('/transactions/internal/reconcile-prepaid', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async deleteCustomer(id: string): Promise<any> {
    return request<any>(`/transactions/customers/${id}`, {
      method: 'DELETE',
    });
  }

  async getCustomerVehicles(customerId: string, activeOnly: boolean = false): Promise<any[]> {
    return request<any[]>(`/transactions/customers/${customerId}/vehicles?activeOnly=${activeOnly}`);
  }

  async createCustomerVehicle(
    customerId: string,
    payload: { registrationNumber: string; vehicleType: string; defaultProductId?: string | null; isActive?: boolean }
  ): Promise<any> {
    return request<any>(`/transactions/customers/${customerId}/vehicles`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateCustomerVehicle(
    vehicleId: string,
    payload: { registrationNumber: string; vehicleType: string; defaultProductId?: string | null; isActive?: boolean }
  ): Promise<any> {
    return request<any>(`/transactions/vehicles/${vehicleId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteCustomerVehicle(vehicleId: string): Promise<any> {
    return request<any>(`/transactions/vehicles/${vehicleId}`, {
      method: 'DELETE',
    });
  }

  async getExpenses(): Promise<any[]> {
    return request<any[]>('/transactions/expenses');
  }

  async getPurchases(): Promise<any[]> {
    return request<any[]>('/transactions/purchases');
  }

  async getCollections(): Promise<any[]> {
    return request<any[]>('/transactions/collections');
  }

  async recordExpense(payload: { shiftId: string; categoryId: string; amount: number; description?: string }): Promise<any> {
    return request<any>('/transactions/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async recordPurchase(payload: {
    shiftId: string;
    supplierId: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    invoiceNumber?: string;
    notes?: string;
    tankAllocations?: { tankId: string; quantity: number }[] | null;
  }): Promise<any> {
    return request<any>('/transactions/purchases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async recordCollection(payload: { shiftId: string; customerId?: string; amount: number; paymentMethod: 'Cash' | 'Card' | 'UPI' | 'Credit'; notes?: string }): Promise<any> {
    return request<any>('/transactions/collections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getInventoryStatus(stationId: string): Promise<any[]> {
    return request<any[]>(`/transactions/inventory/status?stationId=${stationId}`);
  }

  async getInventoryMovements(stationId: string): Promise<any[]> {
    return request<any[]>(`/transactions/inventory/movements?stationId=${stationId}`);
  }

  async getInventoryVariances(stationId: string): Promise<any[]> {
    return request<any[]>(`/transactions/inventory/variances?stationId=${stationId}`);
  }

  async getCustomerLedger(customerId: string): Promise<any[]> {
    return request<any[]>(`/transactions/customers/${customerId}/ledger`);
  }

  async getSupplierLedger(supplierId: string): Promise<any[]> {
    return request<any[]>(`/transactions/suppliers/${supplierId}/ledger`);
  }

  async recordSupplierPayment(payload: { shiftId: string; supplierId: string; amount: number; notes?: string }): Promise<any> {
    return request<any>('/transactions/supplier-payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export class CloudPricingService {
  async getPricing(stationId: string): Promise<any[]> {
    return request<any[]>(`/setup/pricing?stationId=${stationId}`);
  }

  async getPricingHistory(stationId: string): Promise<any[]> {
    return request<any[]>(`/setup/pricing/history?stationId=${stationId}`);
  }

  async recordPricing(payload: { stationId: string; productId: string; price: number; effectiveFrom?: string | null }): Promise<any> {
    return request<any>('/setup/pricing', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

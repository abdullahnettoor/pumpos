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
} from '@pump/shared';

// Base API configuration
const API_BASE = 'http://localhost:8787/api';

// For local testing, we attach a mock token.
// The app can set this dynamically upon user selection.
let activeToken = 'mock-Owner';

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
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  });

  const res = await response.json() as any;
  if (!res.success) {
    throw new Error(res.error?.message || 'API request failed');
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
}

export class CloudShiftService {
  async getShiftStatus(stationId: string): Promise<any> {
    return request<any>(`/shifts/status?stationId=${stationId}`);
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
}


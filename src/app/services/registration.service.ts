import { Injectable } from '@angular/core';
import { HTTP } from '@awesome-cordova-plugins/http/ngx';
import { Platform, ToastController } from '@ionic/angular';
import { SQLite, SQLiteObject } from '@ionic-native/sqlite/ngx';
import * as CryptoJS from 'crypto-js';
import { Storage } from '@ionic/storage-angular';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, BehaviorSubject } from 'rxjs';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class RegistrationService {
  private currentUserSubject = new BehaviorSubject<any>(null);
  currentUser$ = this.currentUserSubject.asObservable();
  private dbInstance: SQLiteObject | null = null;
  private API_URL = 'http://3.26.113.125:8000';
  private REGISTER_URL = `${this.API_URL}/users/`;
  private LOGIN_URL = `${this.API_URL}/users/login`;

  constructor(
    private sqlite: SQLite,
    private platform: Platform,
    private storage: Storage,
    private http: HttpClient,
    private nativeHttp: HTTP,
    private toastCtrl: ToastController
  ) {
    this.platform.ready().then(async () => {
      await this.initStorage();
      await this.initDatabase();
      await this.setupNativeHttp();
      this.checkBackendConnection();

      window.addEventListener('online', () => {
        console.log('🌐 Device online. Syncing offline data...');
        this.syncOfflineData();
      });
    });
  }

  // ---------------- Platform Helpers ----------------
  private isNative(): boolean {
    return (this.platform.is('hybrid') || (Capacitor as any)?.isNativePlatform?.()) ?? false;
  }

  // ---------------- Storage Initialization ----------------
  private async initStorage() {
    if (!this.storage['_db']) {
      await this.storage.create();
    }
  }


  // ---------------- Database Initialization ----------------
public async initDatabase() {
  if (!this.platform.is('hybrid')) {
    console.warn('SQLite not available on this platform.');
    return;
  }

  this.dbInstance = await this.sqlite.create({
    name: 'barangayconnect.db',
    location: 'default',
  });

  // ---------------- CREATE TABLE IF NOT EXISTS ----------------
  await this.dbInstance.executeSql(
    `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backend_id INTEGER DEFAULT NULL,
      firstName TEXT,
      middleName TEXT,
      lastName TEXT,
      dob TEXT,
      gender TEXT,
      civilStatus TEXT,
      contact TEXT UNIQUE,
      purok TEXT,
      barangay TEXT,
      city TEXT,
      province TEXT,
      postalCode TEXT,
      placeOfBirth TEXT,
      password TEXT,
      rawPassword TEXT,
      photo TEXT,
      role TEXT,
      synced INTEGER DEFAULT 0
    )
    `,
    []
  );

  // ---------------- CHECK AND ADD MISSING COLUMNS ----------------
  try {
    const res = await this.dbInstance.executeSql(`PRAGMA table_info(users);`, []);
    let hasPendingUpdates = false;
    let hasPlaceOfBirth = false;

    for (let i = 0; i < res.rows.length; i++) {
      const columnName = res.rows.item(i).name;
      if (columnName === 'pending_updates') hasPendingUpdates = true;
      if (columnName === 'placeOfBirth') hasPlaceOfBirth = true;
    }

    if (!hasPendingUpdates) {
      await this.dbInstance.executeSql(
        `ALTER TABLE users ADD COLUMN pending_updates TEXT DEFAULT NULL`,
        []
      );
      console.log('✅ pending_updates column added.');
    } else {
      console.log('ℹ️ pending_updates column already exists.');
    }

    if (!hasPlaceOfBirth) {
      await this.dbInstance.executeSql(
        `ALTER TABLE users ADD COLUMN placeOfBirth TEXT`,
        []
      );
      console.log('✅ placeOfBirth column added to local SQLite.');
    } else {
      console.log('ℹ️ placeOfBirth column exists, skipping ALTER TABLE.');
    }

  } catch (err) {
    console.error('❌ Error checking/adding columns:', err);
  }
}
    private async setupNativeHttp() {
    if (!this.isNative()) return; // Skip web
    try {
      await this.nativeHttp.setServerTrustMode('nocheck');
      console.log('✅ Native HTTP trust mode enabled (nocheck)');
    } catch (err) {
      console.warn('⚠️ Failed to set native HTTP trust mode:', err);
    }
  }

  // ---------------- Password Hashing ----------------
  private hashPassword(password: string): string {
    return CryptoJS.SHA256(password).toString();
  }
async request(method: string, url: string, body: any = {}): Promise<any> {
  const isNative = this.isNative();
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  // =====================================================
  // 📱 NATIVE HTTP (cordova-plugin-advanced-http)
  // =====================================================
  if (isNative) {
    try {
      this.nativeHttp.setDataSerializer("json");

      let res: any;

      switch (method.toLowerCase()) {
        case "get":
          res = await this.nativeHttp.get(url, {}, headers);
          break;
        case "post":
          res = await this.nativeHttp.post(url, body, headers);
          break;
        case "put":
          res = await this.nativeHttp.put(url, body, headers);
          break;
        case "delete":
          res = await this.nativeHttp.delete(url, {}, headers);
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      if (!res) throw new Error("❌ Empty native response");
      if (res.status === 0) throw new Error("❌ Native HTTP: Cannot reach backend (status 0)");

      const data = res.data;

      // If already JSON object
      if (typeof data === "object") return data;

      // Try parsing
      try {
        return JSON.parse(data);
      } catch {
        return { raw: data }; // Non-JSON fallback
      }

    } catch (nativeErr: any) {
      console.error("❌ Native HTTP error:", nativeErr);

      // If backend DID NOT receive the request
      if (nativeErr.status === 0) {
        throw new Error("❌ Native HTTP failed — backend unreachable.");
      }

      // Error might contain JSON body
      if (nativeErr.error) {
        try {
          return JSON.parse(nativeErr.error);
        } catch {
          return { error: nativeErr.error };
        }
      }

      // Continue to web fallback
    }
  }

  // =====================================================
  // 🌐 ANGULAR HTTPCLIENT FALLBACK
  // =====================================================
  try {
    const obs = this.http.request(method, url, {
      headers,
      body,
    });

    const result = await firstValueFrom(obs);

    if (!result) {
      throw new Error("❌ Empty web response");
    }

    return result;

  } catch (webErr: any) {
    console.error("❌ Web HTTP error:", webErr);

    // If Angular cannot reach backend
    if (webErr.status === 0) {
      throw new Error("❌ Web HTTP: Cannot reach backend (status 0)");
    }

    if (webErr.error) return webErr.error;

    throw webErr;
  }
}

  // ---------------- Registration ----------------
async register(data: any): Promise<any> {
  const payload = this.sanitizePayload(data, false);
  console.log("📤 Payload from app:", payload);

  const online = await this.checkBackendAvailable();
  if (!online) {
    throw new Error("⚠️ No internet or backend unreachable.");
  }

  let response: any;

  try {
    response = await this.request("post", this.REGISTER_URL, payload);
    console.log("📥 Response from backend:", response);
  } catch (err: any) {
    console.error("❌ Registration error:", err);
    throw new Error(err?.message || "Registration failed.");
  }

  // ------------------------
  // ⛔ FIX: Prevent fake success
  // ------------------------
  if (!response) {
    throw new Error("❌ Empty response from backend.");
  }

  if (response.detail) {
    // FastAPI sends errors as { detail: "text" }
    throw new Error(response.detail);
  }

  if (response.error) {
    throw new Error(response.error);
  }

  if (Object.keys(response).length === 0) {
    throw new Error("❌ Backend returned an empty object.");
  }

  return response;
}



private async checkBackendAvailable(): Promise<boolean> {
  try {
    if (this.isNative()) {
      const res = await this.nativeHttp.get(`${this.API_URL}/ping`, {}, {});
      console.log('✅ Backend reachable (native):', res.status, res.data);
    } else {
      await firstValueFrom(this.http.get(`${this.API_URL}/ping`));
      console.log('✅ Backend reachable (web)');
    }
    return true;
  } catch (err) {
    console.error('❌ Backend not reachable:', err);
    return false;
  }
}


//login

  async login(contact: string, password: string): Promise<any> {
    const online = await this.checkBackendAvailable();
    if (!online) throw new Error('⚠️ Login requires internet connection.');

    const normalizedContact = contact
      .trim()
      .replace(/^\+63/, '0')
      .replace(/^63/, '0')
      .replace(/^\+/, '');

    const payload = { contact: normalizedContact, password };
    console.log('📤 Login payload:', payload);

     try {
      let response: any = await this.request('post', this.LOGIN_URL, payload);
      if (typeof response === 'string') response = JSON.parse(response);

      if (!response?.user) throw new Error('Invalid login response.');

      const user = {
        ...response.user,
        firstName: response.user.first_name,
        middleName: response.user.middle_name,
        lastName: response.user.last_name,
        civilStatus: response.user.civil_status,
        postalCode: response.user.postal_code,
        backend_id: response.user.id,
      };

      // Block residents who are not approved
      if (user.role === 'resident' && user.status !== 'Approved') {
        throw new Error(`Resident account not approved yet. Status: ${user.status}`);
      }

      this.setCurrentUser(user);
      await this.saveOfflineUser({ ...user, rawPassword: password });
      console.log('✅ Login successful — user stored offline:', user);

      return user;
    } catch (err: any) {
      console.error('❌ Login error raw:', err);
      let backendMessage = 'Login failed.';
      if (err?.message) backendMessage = err.message;
      throw new Error(backendMessage);
    }
  }

  // ---------------- Backend Connection Check ----------------
  private async checkBackendConnection() {
    try {
      const res = await this.request('get', `${this.API_URL}/ping`);
      console.log('✅ Connected to backend', res);
    } catch (err) {
      console.error('❌ Connection failed', err);
      const toast = await this.toastCtrl.create({
        message: '⚠️ Cannot connect to backend. Some features may not work.',
        color: 'warning',
        duration: 3000,
        position: 'top',
      });
      await toast.present();
    }
  }

  // ---------------- Offline Login ----------------
  private async offlineLogin(contact: string, password: string): Promise<any | null> {
    const hashed = this.hashPassword(password);

    if (this.dbInstance) {
      const result = await this.dbInstance.executeSql(
        'SELECT * FROM users WHERE contact = ? AND password = ?',
        [contact, hashed]
      );
      if (result.rows.length > 0) {
        const user = result.rows.item(0);
        this.setCurrentUser(user);
        return user;
      }
    }

    const roles: ('secretary' | 'captain')[] = ['secretary', 'captain'];
    for (const role of roles) {
      const stored = await this.storage.get(`${role}-${contact}`);
      if (stored && stored.password === hashed) {
        this.setCurrentUser({ ...stored, role });
        return { ...stored, role };
      }
    }

    throw new Error('⚠️ Offline login failed. No local record found.');
  }

  // ---------------- Save Offline ----------------
  async saveOfflineUser(user: any) {
  if (!this.dbInstance || user.role !== 'resident') return;

  const hashedPassword = user.rawPassword ? this.hashPassword(user.rawPassword) : user.password;

  const query = `
    INSERT INTO users (
      backend_id, firstName, middleName, lastName, dob, gender, civilStatus, contact,
      purok, barangay, city, province, postalCode, placeOfBirth, password, rawPassword, photo, role, synced
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(contact) DO UPDATE SET
      backend_id = excluded.backend_id,
      firstName = excluded.firstName,
      middleName = excluded.middleName,
      lastName = excluded.lastName,
      dob = excluded.dob,
      gender = excluded.gender,
      civilStatus = excluded.civilStatus,
      purok = excluded.purok,
      barangay = excluded.barangay,
      city = excluded.city,
      province = excluded.province,
      postalCode = excluded.postalCode,
      placeOfBirth = excluded.placeOfBirth,
      password = excluded.password,
      rawPassword = excluded.rawPassword,
      photo = excluded.photo,
      role = excluded.role,
      synced = excluded.synced
  `;

  const values = [
    user.backend_id || null,
    user.firstName,
    user.middleName,
    user.lastName,
    user.dob,
    user.gender,
    user.civilStatus,
    user.contact,
    user.purok,
    user.barangay,
    user.city,
    user.province,
    user.postalCode,
    user.placeOfBirth || '',
    hashedPassword,
    user.rawPassword || user.password,
    user.photo,
    user.role,
    0,
  ];

  try {
    await this.dbInstance.executeSql(query, values);
    console.log('✅ User saved or updated offline:', user.contact);
  } catch (err) {
    console.error('❌ Save offline error:', err);
  }
}


 // ---------------- Sanitize Payload ----------------
private sanitizePayload(data: any, isUpdate: boolean = false): any {
  // Validate names
  if (data.firstName) this.validateName(data.firstName, 'First Name');
  if (data.middleName) this.validateName(data.middleName, 'Middle Name');
  if (data.lastName) this.validateName(data.lastName, 'Last Name');

  const payload: any = {
    first_name: data.firstName?.trim() || null,
    middle_name: data.middleName?.trim() || null,
    last_name: data.lastName?.trim() || null,
    dob: data.dob ? data.dob.split('T')[0] : null,
    gender: data.gender?.trim() || null,
    civil_status: data.civilStatus?.trim() || null,
    contact: data.contact?.trim() || null,
    purok: data.purok?.trim() || null,
    barangay: data.barangay?.trim() || null,
    city: data.city?.trim() || null,
    province: data.province?.trim() || null,
    postal_code: data.postalCode ? String(data.postalCode).trim() : null,
    place_of_birth: data.placeOfBirth?.trim() || null,
    role: data.role || 'Resident',
  };

  if (!isUpdate) {
    if (!data.password || data.password.trim() === '') {
      throw new Error('⚠️ A password is required for registration.');
    }
    payload.password = data.password.trim();
  } else if (data.password && data.password.trim() !== '') {
    payload.password = data.password.trim();
  }

  if (data.photo && data.photo.trim() !== '') {
    payload.photo = data.photo.replace(/^data:image\/[a-z]+;base64,/, '');
  } else if (!isUpdate) {
    throw new Error('⚠️ A photo is required for registration.');
  }

  return payload;
}

// ---------------- Name Validation ----------------
private validateName(name: string, fieldName: string) {
  const regex = /^[a-zA-Z\s'-]+$/; // only letters, spaces, apostrophes, hyphens
  if (!name || !regex.test(name)) {
    throw new Error(`⚠️ ${fieldName} contains invalid characters.`);
  }
}

  // ---------------- Sync Offline Users ----------------
  public async syncOfflineData(): Promise<void> {
    if (!this.dbInstance || !navigator.onLine) return;

    try {
      const result = await this.dbInstance.executeSql('SELECT * FROM users WHERE synced = 0', []);
      const promises: Promise<void>[] = [];

      for (let i = 0; i < result.rows.length; i++) {
        const user = result.rows.item(i);

        const payload = this.sanitizePayload({
          ...user,
          password: user.rawPassword,
        }, false);

        console.log('📤 Sync payload:', payload);

        const p = this.request('post', this.REGISTER_URL, payload)
          .then(async (response: any) => {
            if (response?.id || response?.first_name) {
  await this.dbInstance!.executeSql(
    'UPDATE users SET synced = 1, backend_id = ? WHERE contact = ?',
    [response.id || null, user.contact]
  );
}

          })
          .catch(err => {
            console.error(`❌ Failed to sync user: ${user.contact}`, err);
          });

        promises.push(p);
      }

      await Promise.all(promises);
      console.log('✅ Offline data sync complete');
    } catch (err) {
      console.error('❌ Sync failed', err);
    }
  }

  // ---------------- Helpers ----------------
  setCurrentUser(user: any) {
  this.currentUserSubject.next(user);
}

getCurrentUser() {
  return this.currentUserSubject.value;
}


  async isDuplicateContact(contact: string): Promise<boolean> {
    if (!this.dbInstance) return false;
    const result = await this.dbInstance.executeSql('SELECT * FROM users WHERE contact = ?', [contact]);
    return result.rows.length > 0;
  }

  async isDuplicateName(first: string, middle: string, last: string): Promise<boolean> {
    if (!this.dbInstance) return false;
    const result = await this.dbInstance.executeSql(
      'SELECT * FROM users WHERE lower(firstName) = ? AND lower(middleName) = ? AND lower(lastName) = ?',
      [first.toLowerCase(), middle.toLowerCase(), last.toLowerCase()]
    );
    return result.rows.length > 0;
  }

  async getAllRegistrations(): Promise<any[]> {
    const allUsers: any[] = [];

    if (this.dbInstance) {
      const result = await this.dbInstance.executeSql('SELECT * FROM users', []);
      for (let i = 0; i < result.rows.length; i++) allUsers.push(result.rows.item(i));
    }

    const keys = await this.storage.keys();
    for (const key of keys) {
      if (key.startsWith('secretary-') || key.startsWith('captain-')) {
        const user = await this.storage.get(key);
        allUsers.push(user);
      }
    }

    return allUsers;
  }

  // ---------------- Auto Login ----------------
  public async checkAutoLogin(): Promise<void> {
    const keys = await this.storage.keys();
    for (const key of keys) {
      if (key.startsWith('secretary-') || key.startsWith('captain-')) {
        const user = await this.storage.get(key);
        if (user) {
          this.setCurrentUser(user);
          return;
        }
      }
    }

    if (this.dbInstance) {
      const result = await this.dbInstance.executeSql('SELECT * FROM users ORDER BY id DESC LIMIT 1', []);
      if (result.rows.length > 0) {
        const latestUser = result.rows.item(0);
        this.setCurrentUser(latestUser);
      }
    }
  }

  getPhotoBase64(): string | null {
    const user = this.getCurrentUser();
    if (!user?.photo || user.photo.trim() === '') return null;
    const base64 = user.photo.replace(/^data:image\/[a-z]+;base64,/, '');
    return 'data:image/png;base64,' + base64;
  }

  // ---------------- Clear All ----------------
  async clearAll(): Promise<void> {
    await this.clearUsersTable();
    const keys = await this.storage.keys();
    for (const key of keys) {
      if (key.startsWith('secretary-') || key.startsWith('captain-')) {
        await this.storage.remove(key);
      }
    }
    this.setCurrentUser(null); //g ilisan ni atong pag unknown http 3

  }

  async sendResetOTP(contact: string): Promise<any> {
  return await this.request('post', `${this.API_URL}/users/forgot-password`, { contact });
}


  async clearUsersTable(): Promise<void> {
    if (!this.dbInstance) return;
    try {
      await this.dbInstance.executeSql('DELETE FROM users', []);
      console.log('✅ Users table cleared');
    } catch (err) {
      console.error('❌ Failed to clear users table', err);
    }
  }
// ---------------- Update Profile Online (with contact OTP handling) ----------------
async updateProfileOnline(user: any): Promise<any> {
  const online = await this.checkBackendAvailable();
  if (!online) throw new Error('⚠️ No internet connection.');

  // Make a copy to avoid overwriting offline contact prematurely
  const payload = this.sanitizePayload(user, true);
  console.log('📤 Sending profile update:', payload);

  // Separate contact change logic
  const isContactChanging = payload.contact && payload.contact !== user.contact;

  // Remove contact from payload if it's changing (OTP needed)
  if (isContactChanging) {
    delete payload.contact;
  }

  try {
    const response = await this.request('put', `${this.API_URL}/users/${user.backend_id}`, payload);
    console.log('📥 Backend response:', response);

    // Update offline DB for all non-contact fields
    user.synced = 1;
    if (this.dbInstance) {
      const query = `
        UPDATE users SET
          firstName = ?, middleName = ?, lastName = ?, dob = ?, gender = ?, civilStatus = ?,
          purok = ?, barangay = ?, city = ?, province = ?, postalCode = ?, placeOfBirth = ?, 
          password = ?, rawPassword = ?, photo = ?, synced = ?
        WHERE backend_id = ? OR id = ?
      `;
      const values = [
        user.firstName, user.middleName, user.lastName, user.dob, user.gender, user.civilStatus,
        user.purok, user.barangay, user.city, user.province, user.postalCode, user.placeOfBirth || '', 
        user.password || null, user.rawPassword || user.password || null,
        user.photo || '', user.synced,
        user.backend_id || user.id, user.backend_id || user.id
      ];
      await this.dbInstance.executeSql(query, values);
      console.log('✅ Local record updated after online save (excluding contact).');
    }

    // Handle contact change separately
    if (isContactChanging) {
      console.log('📲 Contact change requested. OTP sent to new contact.');
      // You can now prompt the user to enter OTP and call verifyContactChange()
    }

    return response;
  } catch (error) {
    console.error('❌ Profile update failed:', error);
    throw new Error('Failed to update profile. Please try again.');
  }
}

// ---------------- Verify Contact Change ----------------
async verifyContactChange(user: any, otp: string): Promise<any> {
  if (!user.backend_id) throw new Error('Invalid user backend ID');

  try {
    const response = await this.request(
      'post',
      `${this.API_URL}/users/verify-contact/${user.backend_id}`,
      { otp }
    );

    // Update offline DB with new contact after verification
    if (this.dbInstance) {
      await this.dbInstance.executeSql(
        `UPDATE users SET contact = ? WHERE backend_id = ? OR id = ?`,
        [user.new_contact_temp || user.contact, user.backend_id, user.backend_id]
      );
      user.contact = user.new_contact_temp || user.contact;
      console.log('✅ Offline contact updated after OTP verification.');
    }

    return response;
  } catch (err: any) {
    console.error('❌ Contact verification failed:', err);
    throw new Error(err?.message || 'OTP verification failed.');
}

}

// Add this inside RegistrationService
async verifyContactOtp(user: any, otp: string): Promise<any> {
  return this.verifyContactChange(user, otp);
}


 }



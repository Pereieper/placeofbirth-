import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Platform } from '@ionic/angular';
import { throwError, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HTTP } from '@awesome-cordova-plugins/http/ngx';

// ----------------- Interfaces -----------------
export interface UserInfo {
  firstName: string;
  middleName?: string;
  lastName: string;
  photo?: string;
}

export type RequestStatus =
  | 'Pending' | 'Returned' | 'Approved' | 'For Print'
  | 'For Pickup' | 'Completed' | 'Rejected' | 'Cancelled'
  | 'Expired' | 'Released';

export interface DocumentRequestPayload {
  id?: number;
  documentType: string;
  purpose: string;
  copies: number;
  requirements?: string;
  authorizationPhoto?: string | null;
  contact: string;
  notes?: string;
  status: RequestStatus;
  action?: string;
  created_at: Date;
  updated_at?: Date | null;
  pickup_date?: string | null;
  user?: UserInfo;
  pending_updates?: Record<string, any> | null;
}

export interface AddRequestPayload {
  documentType: string;
  purpose: string;
  copies: number;
  requirements?: string;
  contact: string;
  notes?: string;
  authorizationPhoto?: string | null;
}

export interface UpdateStatusPayload {
  id: number;
  status: RequestStatus;
  action?: string;
  notes?: string;
}

// --------------------------------------------------

@Injectable({ providedIn: 'root' })
export class DocumentRequestService {
  
  private API_URL = 'http://3.26.113.125:8000';
  private DOCUMENT_REQUEST_URL = `${this.API_URL}/document-requests`;

  constructor(
    private http: HttpClient,
    private nativeHttp: HTTP,
    private platform: Platform
  ) {}

  // -----------------------------------------
  // CONTACT NORMALIZER
  // -----------------------------------------
  private normalizeContact(contact: string): string {
    contact = (contact || '').trim();

    if (contact.startsWith('+63')) return '0' + contact.slice(3);
    if (contact.startsWith('63')) return '0' + contact.slice(2);

    return contact;
  }

  // -----------------------------------------
  // HEADERS
  // -----------------------------------------
  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  // -----------------------------------------
  // UNIFIED REQUEST HANDLER
  // -----------------------------------------
  private async request<T>(
    method: 'get' | 'post' | 'delete',
    url: string,
    body: any = {}
  ): Promise<T> {
    const headers = this.getHeaders();

    try {
      // -------- HYBRID (IOS / ANDROID) --------
      if (this.platform.is('hybrid')) {
        this.nativeHttp.setDataSerializer('json');

        let res: any;
        if (method === 'get') res = await this.nativeHttp.get(url, {}, headers);
        else if (method === 'post') res = await this.nativeHttp.post(url, body, headers);
        else if (method === 'delete') res = await this.nativeHttp.delete(url, {}, headers);

        return JSON.parse(res.data);
      }

      // -------- WEB MODE --------
      const options = { headers: new HttpHeaders(headers) };

      if (method === 'get')
        return await firstValueFrom(
          this.http.get<T>(url, options).pipe(catchError(err => this.handleError(err)))
        );

      if (method === 'post')
        return await firstValueFrom(
          this.http.post<T>(url, body, options).pipe(catchError(err => this.handleError(err)))
        );

      if (method === 'delete')
        return await firstValueFrom(
          this.http.delete<T>(url, options).pipe(catchError(err => this.handleError(err)))
        );

      throw new Error(`Unsupported method: ${method}`);

    } catch (err: any) {
      console.error('❌ Request failed:', err);

      // Parse backend error if available
      if (err?.error) {
        try {
          const backendErr = typeof err.error === 'string'
            ? JSON.parse(err.error)
            : err.error;

          if (backendErr?.detail) throw new Error(backendErr.detail);
        } catch {}
      }

      throw err;
    }
  }

  // -----------------------------------------
  // ERROR HANDLER
  // -----------------------------------------
  private handleError(error: HttpErrorResponse) {
    console.error('HTTP Error:', error);

    let msg = 'An unknown error occurred';

    if (error.status === 0) msg = 'Cannot connect to server. Check network/server.';
    else if (error.status === 500) msg = 'Server error.';
    else if (error.status === 409) msg = error.error?.detail || 'Conflict error.';
    else if (error.error?.detail) msg = error.error.detail;

    return throwError(() => new Error(msg));
  }

  // -----------------------------------------
  // NORMALIZER
  // -----------------------------------------
  private normalizeRequest(req: DocumentRequestPayload): DocumentRequestPayload {
    return {
      ...req,
      created_at: new Date(req.created_at),
      updated_at: req.updated_at ? new Date(req.updated_at) : null,
      user: req.user || {
        firstName: '',
        middleName: '',
        lastName: '',
        photo: ''
      }
    };
  }

  // ======================================================
  //                    API ENDPOINTS
  // ======================================================

  async getAllRequests() {
    const res = await this.request<DocumentRequestPayload[]>('get', this.DOCUMENT_REQUEST_URL);
    return res.map(r => this.normalizeRequest(r));
  }

  async getReleasedDocuments() {
    const res = await this.request<DocumentRequestPayload[]>(
      'get',
      `${this.DOCUMENT_REQUEST_URL}?status=Released`
    );
    return res.map(r => this.normalizeRequest(r));
  }

  async getRequestsByContact(contact: string) {
    const url = `${this.DOCUMENT_REQUEST_URL}?contact=${this.normalizeContact(contact)}`;
    const res = await this.request<DocumentRequestPayload[]>('get', url);
    return res.map(r => this.normalizeRequest(r));
  }

  async getRequestsByContactAndStatus(contact: string, status: string) {
    const url = `${this.DOCUMENT_REQUEST_URL}?contact=${this.normalizeContact(contact)}&status=${status}`;
    const res = await this.request<DocumentRequestPayload[]>('get', url);
    return res.map(r => this.normalizeRequest(r));
  }

  async getRequestById(id: number) {
    const res = await this.request<DocumentRequestPayload>('get', `${this.DOCUMENT_REQUEST_URL}/${id}`);
    return this.normalizeRequest(res);
  }

  // ---------------- Add Request ----------------
  async addRequest(data: AddRequestPayload) {
    const payload = {
      documentType: data.documentType.trim(),
      purpose: data.purpose.trim(),
      copies: data.copies,
      requirements: data.requirements?.trim() || '',
      authorizationPhoto: data.authorizationPhoto || null,
      contact: this.normalizeContact(data.contact),
      notes: data.notes?.trim() || ''
    };

    const res = await this.request<DocumentRequestPayload>(
      'post',
      `${this.DOCUMENT_REQUEST_URL}/`,
      payload
    );

    return this.normalizeRequest(res);
  }

  // ---------------- Update Status ----------------
  async updateStatus(data: UpdateStatusPayload, performedById: number) {
    const body = {
      payload: data,
      performed_by_id: performedById
    };

    const res = await this.request<DocumentRequestPayload>(
      'post',
      `${this.DOCUMENT_REQUEST_URL}/status`,
      body
    );

    return this.normalizeRequest(res);
  }

  // ---------------- Cancel ----------------
  async cancelRequestById(id: number) {
    const res = await this.request<DocumentRequestPayload>('delete', `${this.DOCUMENT_REQUEST_URL}/${id}`);
    return this.normalizeRequest(res);
  }

  // ---------------- Delete ----------------
  async deleteRequestById(id: number) {
    return await this.request('delete', `${this.DOCUMENT_REQUEST_URL}/${id}`);
  }

  // ---------------- Update ----------------
  async updateRequest(data: Partial<DocumentRequestPayload>) {
    if (!data.id) throw new Error('Missing request ID');
    const res = await this.request<DocumentRequestPayload>(
      'post',
      `${this.DOCUMENT_REQUEST_URL}/${data.id}/update`,
      data
    );
    return this.normalizeRequest(res);
  }
}

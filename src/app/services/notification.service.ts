import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { HTTP } from '@awesome-cordova-plugins/http/ngx';
import { Platform } from '@ionic/angular';
import { from, Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private baseUrl = 'http://3.26.113.125:8000/notifications';

  constructor(
    private http: HttpClient,
    private nativeHttp: HTTP,
    private platform: Platform
  ) {}

  // ------------------------------------------------------------
  // 🔹 Unified HTTP handler (works for web + native)
  // ------------------------------------------------------------
 private makeRequest<T>(method: 'get' | 'put' | 'delete', url: string, body: any = {}, token?: string): Observable<T> {
    const authToken = token ?? localStorage.getItem('authToken') ?? '';
    if (this.platform.is('hybrid')) {
      return from(this.nativeHttp[method](url, body, { Authorization: `Bearer ${authToken}` })
        .then(res => JSON.parse(res.data) as T));
    } else {
      const headers = new HttpHeaders({ Authorization: `Bearer ${authToken}` });
      let request$: Observable<T>;
      if (method === 'get') request$ = this.http.get<T>(url, { headers });
      else if (method === 'put') request$ = this.http.put<T>(url, body, { headers });
      else if (method === 'delete') request$ = this.http.delete<T>(url, { headers });
      else throw new Error(`Unsupported HTTP method: ${method}`);
      return request$.pipe(catchError(err => throwError(() => err)));
    }
  }

  // ------------------------------------------------------------
  // 🔹 Build query string for a user
  // ------------------------------------------------------------
  private buildQuery(userId?: number, role?: string): string {
    const id = userId ?? Number(localStorage.getItem('userId'));
    const userRole = role?.toLowerCase() ?? (localStorage.getItem('role') || '').toLowerCase();
    const query: string[] = [];

    if (userRole === 'resident' || userRole === 'user') {
      query.push(`user_id=${id}`);
      query.push(`role=resident`);
    } else if (userRole === 'secretary') {
      query.push(`role=secretary`);
    } else if (userRole === 'captain') {
      query.push(`role=captain`);
    }

    return query.length ? `?${query.join('&')}` : '';
  }

  // ------------------------------------------------------------
  // 🔹 Get notifications
  // ------------------------------------------------------------
  getAllNotifications(unreadOnly: boolean = false, userId?: number, role?: string, token?: string): Observable<any[]> {
    let query = this.buildQuery(userId, role);
    if (unreadOnly) query += query.includes('?') ? '&unread_only=true' : '?unread_only=true';
    return this.makeRequest<any[]>('get', `${this.baseUrl}${query}`, {}, token);
  }

  markAsRead(id: number, token?: string): Observable<any> {
    return this.makeRequest<any>('put', `${this.baseUrl}/${id}/read`, {}, token);
  }

  markAllAsRead(userId?: number, token?: string): Observable<any> {
    let url = `${this.baseUrl}/mark-all-read`;
    if (userId) url += `?user_id=${userId}`;
    return this.makeRequest<any>('put', url, {}, token);
  }
  // ------------------------------------------------------------
  // 🔹 Get notifications by specific user ID (optional for admins)
  // ------------------------------------------------------------
  getNotificationsByUserId(userId: number): Observable<any[]> {
    const url = `${this.baseUrl}?user_id=${userId}`;
    return this.makeRequest<any[]>('get', url);
  }

  deleteNotification(id: number, token?: string): Observable<any> {
  return this.makeRequest<any>('delete', `${this.baseUrl}/${id}`, {}, token);
}

}

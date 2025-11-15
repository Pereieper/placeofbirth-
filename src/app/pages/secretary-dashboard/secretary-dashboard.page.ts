import { Component, OnInit, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { IonicModule, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { DocumentRequestService, DocumentRequestPayload } from 'src/app/services/document-request.service';
import { NotificationService } from 'src/app/services/notification.service';

Chart.register(...registerables);

@Component({
  selector: 'app-secretary-dashboard',
  templateUrl: './secretary-dashboard.page.html',
  styleUrls: ['./secretary-dashboard.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SecretaryDashboardPage implements OnInit, OnDestroy {
  requestData: DocumentRequestPayload[] = [];
  filteredData: DocumentRequestPayload[] = [];

  totalRequests = 0;
  pendingRequests = 0;
  completedRequests = 0;
  approvedCount = 0;
  rejectedCount = 0;

  currentDate: Date = new Date();
  selectedFilter = 'thisMonth';

  barChart!: Chart;
  pieChart!: Chart;
  statusChart!: Chart;

  notifications: {
    id?: number;
    title: string;
    message: string;
    timestamp: Date;
    is_read?: boolean;
    userPhoto?: string;
    type?: string;
  }[] = [];

  notificationCount = 0;
  showNotifications = false;
  private notificationInterval: any;

  constructor(
    private router: Router,
    private alertController: AlertController,
    private documentRequestService: DocumentRequestService,
    private cd: ChangeDetectorRef,
    private notificationService: NotificationService
  ) {}

  async ngOnInit() {
    await this.loadDashboardCounts();
    await this.loadNotifications();
    this.notificationInterval = setInterval(() => this.loadNotifications(), 10000);
  }

  ngOnDestroy() {
    this.barChart?.destroy();
    this.pieChart?.destroy();
    this.statusChart?.destroy();
    if (this.notificationInterval) clearInterval(this.notificationInterval);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: any) {
    const target = event.target;
    if (!target.closest('.notification-wrapper')) {
      this.showNotifications = false;
    }
  }

  /** ============================ DASHBOARD STATISTICS ============================ */
  async loadDashboardCounts() {
    this.requestData = await this.documentRequestService.getAllRequests();
    this.totalRequests = this.requestData.length;
    this.pendingRequests = this.requestData.filter(r => r.status === 'Pending').length;
    this.completedRequests = this.requestData.filter(r => r.status === 'Completed').length;
    this.approvedCount = this.requestData.filter(r => r.status === 'Approved').length;
    this.rejectedCount = this.requestData.filter(r => r.status === 'Rejected').length;

    // Filter for selected period
    this.filterData(this.selectedFilter);
    this.cd.detectChanges();

    this.renderBarChart();
    this.renderPieChart();
    this.renderStatusChart();
  }

  /** ============================ NOTIFICATIONS ============================ */
  async loadNotifications() {
    try {
const userId = Number(localStorage.getItem('userId')); // or however you store it
const notifs = await firstValueFrom(this.notificationService.getNotificationsByUserId(userId));
      if (!Array.isArray(notifs)) {
        this.notifications = [];
        this.notificationCount = 0;
        return;
      }

      this.notifications = notifs.map((n: any) => ({
        id: n.id,
        title: n.title || 'No title',
        message: n.message || '',
        timestamp: n.created_at ? new Date(n.created_at) : new Date(),
        is_read: n.is_read || false,
        userPhoto: this.convertPhoto(n.userPhoto),
        type: n.type || '',
      }));

      this.notificationCount = this.notifications.filter(n => !n.is_read).length;
      this.cd.detectChanges();
    } catch (err) {
      console.error('Failed to load notifications:', err);
      this.notifications = [];
      this.notificationCount = 0;
    }
  }

  async handleNotificationClick(notif: any) {
    if (notif.id) {
      try {
        await firstValueFrom(this.notificationService.markAsRead(notif.id));
        notif.is_read = true;
        this.notificationCount = this.notifications.filter(n => !n.is_read).length;
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }

    if (notif.type === 'user_registration' || notif.title?.toLowerCase().includes('new user registration')) {
      this.router.navigate(['/user-registration']);
    } else if (notif.type === 'user_request' || notif.title?.toLowerCase().includes('document request')) {
      this.router.navigate(['/user-request'], { queryParams: { id: notif.id } });
    } else {
      console.log('Notification clicked:', notif);
    }
  }

  openNotifications() {
    this.showNotifications = !this.showNotifications;
    if (this.showNotifications) this.notificationCount = 0;
  }

  /** ============================ FILTERING ============================ */
  filterData(filter: string) {
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date = now;

    switch (filter) {
      case 'thisWeek':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        break;
      case 'lastWeek':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay() - 7);
        endDate = new Date(now);
        endDate.setDate(now.getDate() - now.getDay() - 1);
        break;
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'lastMonth':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      default:
        startDate = null;
        break;
    }

    this.filteredData = this.requestData
      .filter(r => {
        const reqDate = r.created_at ? new Date(r.created_at) : new Date();
        if (!startDate) return true;
        return reqDate >= startDate && reqDate <= endDate;
      })
      .sort((a, b) => (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0));
  }

  /** ============================ CHARTS ============================ */
  renderBarChart() {
    const canvas = document.getElementById('barChart') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.barChart?.destroy();

    this.barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Pending', 'Approved', 'Rejected', 'Completed'],
        datasets: [{
          label: 'Requests Summary',
          data: [this.pendingRequests, this.approvedCount, this.rejectedCount, this.completedRequests],
          backgroundColor: ['#FFA500', '#4CAF50', '#F44336', '#2196F3']
        }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  renderPieChart() {
    const canvas = document.getElementById('pieChart') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.pieChart?.destroy();

    const typeCounts: Record<string, number> = {};
    this.requestData.forEach(r => {
      const type = r.documentType || 'Unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    this.pieChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: Object.keys(typeCounts),
        datasets: [{ data: Object.values(typeCounts), backgroundColor: Object.keys(typeCounts).map(() => this.randomColor()) }]
      },
      options: { responsive: true }
    });
  }

  renderStatusChart() {
    const canvas = document.getElementById('statusChart') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.statusChart?.destroy();

    const statusCounts: Record<string, number> = {};
    this.requestData.forEach(r => {
      const status = r.status || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    this.statusChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: Object.keys(statusCounts),
        datasets: [{ data: Object.values(statusCounts), backgroundColor: Object.keys(statusCounts).map(() => this.randomColor()) }]
      },
      options: { responsive: true }
    });
  }

  randomColor(): string {
    const r = Math.floor(Math.random() * 255);
    const g = Math.floor(Math.random() * 255);
    const b = Math.floor(Math.random() * 255);
    return `rgba(${r},${g},${b},0.7)`;
  }

  /** ============================ UTILITIES ============================ */
  getStatusColor(status?: string): string {
    switch (status) {
      case 'Pending': return 'warning';
      case 'Approved': return 'success';
      case 'Rejected': return 'danger';
      case 'Completed': return 'medium';
      case 'For Pickup': return 'primary';
      default: return 'light';
    }
  }

  convertPhoto(photo: string | null | undefined): string {
    if (!photo || photo.trim() === '') return 'assets/default-user.png';
    if (photo.startsWith('data:image')) return photo;
    if (/^[A-Za-z0-9+/=]+={0,2}$/.test(photo)) return `data:image/png;base64,${photo}`;
    if (photo.startsWith('http')) return photo;
    if (photo.match(/\.(jpg|jpeg|png|gif)$/i)) return `assets/${photo}`;
    return 'assets/default-user.png';
  }

  /** ============================ NAVIGATION ============================ */
  navigateTo(path: string) {
    this.router.navigate(['/' + path]);
  }

  async logout() {
    const alert = await this.alertController.create({
      header: 'Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Logout', handler: () => { localStorage.clear(); this.router.navigate(['/login']); } }
      ]
    });
    await alert.present();
  }

  goToUserRequest(req: DocumentRequestPayload) {
    this.router.navigate(['/user-request'], { queryParams: { id: req.id } });
  }
}

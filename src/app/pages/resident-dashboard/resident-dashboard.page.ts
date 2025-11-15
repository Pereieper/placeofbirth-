import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonAvatar, IonContent, IonHeader, IonTitle, IonToolbar,
  IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle,
  IonGrid, IonRow, IonCol, IonIcon, IonButtons,
  IonMenuButton, IonButton, IonMenu, IonList, IonItem, IonLabel, IonBadge,
  IonModal, IonItemSliding, IonItemOptions, IonItemOption
} from '@ionic/angular/standalone';
import { Router, NavigationEnd } from '@angular/router';
import { RegistrationService } from 'src/app/services/registration.service';
import { NotificationService } from 'src/app/services/notification.service';
import { AlertController } from '@ionic/angular';
import { firstValueFrom, Subscription } from 'rxjs';

@Component({
  selector: 'app-resident-dashboard',
  templateUrl: './resident-dashboard.page.html',
  styleUrls: ['./resident-dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonContent, IonHeader, IonTitle, IonToolbar,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle,
    IonGrid, IonRow, IonCol, IonIcon, IonButtons,
    IonMenuButton, IonButton, IonMenu, IonList, IonItem,
    IonLabel, IonAvatar, IonBadge, IonModal,
    IonItemSliding, IonItemOptions, IonItemOption
  ]
})
export class ResidentDashboardPage implements OnInit, OnDestroy {
  currentDate = '';
  currentDay = '';
  currentTime = '';
  user: any = null;

  unreadCount = 0;
  notifs: any[] = [];
  notifModalOpen = false;
  notifDetailOpen = false;
  selectedNotif: any = null;

  private notifInterval: any;
  private routerSub!: Subscription;

  documents = [
    { name: 'Barangay Clearance', leadTime: '1 Day', requirements: 'Valid ID', fee: '₱50' },
    { name: 'Barangay Indigency', leadTime: '1 Day', requirements: 'None', fee: '₱30' },
    { name: 'Business Permit', leadTime: '2 Days', requirements: 'Application Form', fee: '₱100' },
  ];

  constructor(
    private router: Router,
    private registrationService: RegistrationService,
    private notificationService: NotificationService,
    private alertController: AlertController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.updateDateTime();
    setInterval(() => this.updateDateTime(), 1000);

    this.registrationService.currentUser$.subscribe(user => {
      if (!user) return;
      this.user = user;
      localStorage.setItem('userId', user.id.toString());
      localStorage.setItem('role', user.role);
      localStorage.setItem('authToken', user.token);

      this.loadNotifications(); // load user-specific notifications
    });

    // Auto-refresh notifications every 10s while modal is open
    this.notifInterval = setInterval(() => {
      if (this.user?.id && this.notifModalOpen) {
        this.loadNotifications();
      }
    }, 10000);

    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd && this.user?.id) {
        this.loadNotifications();
      }
    });

    this.initData();
  }

  ngOnDestroy() {
    if (this.notifInterval) clearInterval(this.notifInterval);
    if (this.routerSub) this.routerSub.unsubscribe();
  }

  private async initData() {
    const user = await this.registrationService.getCurrentUser();
    if (user) {
      this.user = user;
      this.loadNotifications();
    }
  }

  private updateDateTime() {
    const now = new Date();
    const locale = navigator.language || 'en-US';
    this.currentDate = now.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    this.currentDay = now.toLocaleDateString(locale, { weekday: 'long' });
    this.currentTime = now.toLocaleTimeString(locale);
  }

  /** Load notifications only for current user */
  async loadNotifications() {
    if (!this.user?.id) return;

    try {
      const notifs = await firstValueFrom(
        this.notificationService.getAllNotifications(false, this.user.id, this.user.role, this.user.token)
      );
      this.notifs = notifs?.filter(n => n.user_id === this.user.id) || [];
      this.unreadCount = this.notifs.filter(n => !n.is_read).length;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }

  openNotifications() { 
    this.notifModalOpen = true;
    this.loadNotifications();
  }
  closeNotifications() { this.notifModalOpen = false; }

  /** Click notification: mark read + navigate if needed */
  openNotificationDetail(notif: any) {
    if (!notif.is_read) this.markAsRead(notif);

    if (['user_request','status_update'].includes(notif.type)) {
      this.goToRequestLog();
      this.closeNotifications();
    } else {
      this.selectedNotif = notif;
      this.notifDetailOpen = true;
    }
  }

  closeNotificationDetail() {
    this.selectedNotif = null;
    this.notifDetailOpen = false;
  }

  private async markAsRead(notif: any) {
    if (notif.is_read) return;
    try {
      await firstValueFrom(this.notificationService.markAsRead(notif.id, this.user?.token));
      notif.is_read = true;
      this.unreadCount = this.notifs.filter(n => !n.is_read).length;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }

  /** Swipe to delete notification */
  async deleteNotification(notif: any, slidingItem: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Delete Notification',
      message: 'Are you sure you want to delete this notification?',
      buttons: [
        { text: 'Cancel', role: 'cancel', handler: () => slidingItem.close() },
        {
          text: 'Delete', role: 'destructive', handler: async () => {
            try {
              await firstValueFrom(this.notificationService.deleteNotification(notif.id, this.user?.token));
              this.notifs = this.notifs.filter(n => n.id !== notif.id);
              this.unreadCount = this.notifs.filter(n => !n.is_read).length;
              this.cdr.detectChanges();
            } catch (err) {
              console.error('Failed to delete notification:', err);
            } finally {
              slidingItem.close();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  /** Navigation */
  editProfile() { this.router.navigate(['/profile']); }
  goToRequestDocument() { this.router.navigate(['/request-document']); }
  goToRequestLog() { 
    this.router.navigate(['/request-log']); 
    this.closeNotifications(); 
    this.closeNotificationDetail(); 
  }
  goToReleasedDocuments() { this.router.navigate(['/released-documents']); }

  /** Returns proper base64 photo */
  getPhotoBase64(): string | null {
    if (!this.user?.photo || this.user.photo.trim() === '') return null;
    if (this.user.photo.startsWith('data:image')) return this.user.photo;
    return 'data:image/png;base64,' + this.user.photo;
  }

  /** Logout */
  async logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('role');

    const alert = await this.alertController.create({
      header: 'Confirm Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Logout', handler: () => this.router.navigate(['/login']) }
      ]
    });
    await alert.present();
  }
}

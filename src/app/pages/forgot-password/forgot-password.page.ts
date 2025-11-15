import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonInput,
} from '@ionic/angular/standalone';
import { IonicModule } from '@ionic/angular';
import { RegistrationService } from 'src/app/services/registration.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonButton,
    IonInput,
    IonicModule
  ]
})
export class ForgotPasswordPage implements OnInit {
  phoneNumber: string = '';

  constructor(
    private router: Router,
    private registrationService: RegistrationService
  ) {}

  ngOnInit() {}

  async sendCode() {
  const formattedPhone = this.phoneNumber.startsWith('0')
    ? '+63' + this.phoneNumber.slice(1)
    : this.phoneNumber;

  if (!/^(\+639)\d{9}$/.test(formattedPhone)) {
    alert('❌ Invalid phone number. Must be like 09123456789.');
    return;
  }

  try {
    await this.registrationService.sendResetOTP(formattedPhone);

    alert('✅ A reset code has been sent to ' + formattedPhone);

    this.router.navigate(['/verify-code'], {
      queryParams: { phone: formattedPhone, mode: 'reset' }
    });

  } catch (err: any) {
    alert(err.message || 'Failed to send reset code.');
  }
}
  goToLogin() {
    this.router.navigate(['/login']);
  }
}

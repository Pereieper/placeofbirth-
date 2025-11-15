import { Component } from '@angular/core';
import { RegistrationService } from 'src/app/services/registration.service';
import { ToastController, NavController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as CryptoJS from 'crypto-js';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ProfilePage {
  user: any = {};
  isEditing = false;
  isContactModalOpen = false;

  newPassword = '';
  confirmPassword = '';
  showNewPassword = false;
  showConfirmPassword = false;

  otpCode = '';
  otpExpiresIn = 5; // default 5 minutes
  photoBase64: string | null = null;

  constructor(
    private registrationService: RegistrationService,
    private toastCtrl: ToastController,
    private navCtrl: NavController
  ) {}

  goBack() {
    this.navCtrl.back();
  }

  ionViewWillEnter() {
    this.user = this.registrationService.getCurrentUser() || {};
    this.photoBase64 = this.getPhotoBase64();
  }

  getPhotoBase64(): string | null {
    if (!this.user?.photo || this.user.photo.trim() === '') return null;
    const base64 = this.user.photo.replace(/^data:image\/[a-z]+;base64,/, '');
    return 'data:image/png;base64,' + base64;
  }

  onFileChange(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.photoBase64 = reader.result as string;
      this.user.photo = this.photoBase64;
    };
    reader.readAsDataURL(file);
  }

  async toggleEdit() {
    if (this.isEditing) {
      const currentUser = this.registrationService.getCurrentUser();

      // ---------------------------
      // 1️⃣ Password update
      // ---------------------------
      if (this.newPassword || this.confirmPassword) {
        if (this.newPassword !== this.confirmPassword) {
          this.presentToast('⚠️ Passwords do not match.', 'danger');
          return;
        }
        this.user.password = CryptoJS.SHA256(this.newPassword).toString();
        this.user.rawPassword = this.newPassword;
      }

      // ---------------------------
      // 2️⃣ Check contact change
      // ---------------------------
      const contactChanged = currentUser?.contact !== this.user.contact;
      if (contactChanged) {
        try {
          const res: any = await this.registrationService.updateProfileOnline({
            id: this.user.id,
            contact: this.user.contact,
          });
          this.presentToast(res.message || '⚠️ Verification code sent.', 'warning');
          this.user.contact = currentUser.contact; // keep old until verified
          this.otpExpiresIn = res.expires_in_minutes || 5;
          this.isContactModalOpen = true;
          return; // wait for OTP verification
        } catch (err: any) {
          console.error('❌ Error sending OTP:', err);
          this.presentToast(err?.message || '⚠️ Failed to update contact.', 'danger');
          return;
        }
      }

      // ---------------------------
      // 3️⃣ Update other fields
      // ---------------------------
      const updateData = { ...this.user };
      delete updateData.contact;
      delete updateData.password;

      try {
        const res = await this.registrationService.updateProfileOnline(updateData);
        this.registrationService.setCurrentUser({ ...currentUser, ...updateData });
        this.photoBase64 = this.getPhotoBase64();
        this.presentToast('✅ Profile updated successfully.', 'success');
      } catch (err: any) {
        console.error('❌ Error updating profile online:', err);
        this.presentToast(err?.message || '⚠️ Failed to update profile.', 'danger');
        return;
      }

      // Clear password fields
      this.newPassword = '';
      this.confirmPassword = '';
    }

    this.isEditing = !this.isEditing;
  }

  // ---------------------------
  // Password visibility toggles
  // ---------------------------
  toggleNewPasswordVisibility() {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  // ---------------------------
  // Contact Modal
  // ---------------------------
  async verifyOtp() {
    if (!this.otpCode) {
      this.presentToast('⚠️ Please enter the OTP.', 'danger');
      return;
    }

    try {
      const res: any = await this.registrationService.verifyContactOtp(this.user.id, this.otpCode);
      this.user.contact = res.updated_contact || this.user.contact;
      this.registrationService.setCurrentUser(this.user);
      this.presentToast('✅ Contact number updated successfully.', 'success');
      this.closeModal();
    } catch (err: any) {
      console.error('❌ OTP verification failed:', err);
      this.presentToast(err?.message || '⚠️ OTP verification failed.', 'danger');
    }
  }

  openContactModal() {
    if (this.isEditing) this.isContactModalOpen = true;
  }

  closeModal() {
    this.isContactModalOpen = false;
    this.otpCode = '';
  }

  async presentToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'top',
      color,
    });
    await toast.present();
  }
}

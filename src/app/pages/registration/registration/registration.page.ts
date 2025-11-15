import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { RegistrationService } from 'src/app/services/registration.service';
import { ToastController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';

@Component({
  selector: 'app-registration',
  templateUrl: './registration.page.html',
  styleUrls: ['./registration.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule]
})
export class RegistrationPage implements OnInit, AfterViewInit {
  [key: string]: any;

  // User Info
  firstName = '';
  middleName = '';
  lastName = '';
  dob = '';
  placeOfBirth = '';
  gender = '';
  civilStatus = '';
  contact = '';
  purok = '';
  barangay = '';
  city = '';
  province = '';
  postalCode = '';

  // Security
  password = '';
  confirmPassword = '';
  showPassword = false;
  showConfirm = false;
  passwordError = false;
  confirmError = false;
  passwordFocused = false;
  confirmFocused = false;
  placeOfBirthError = '';

  // Photo
  photo: string = '';

  // Age Validation
  maxDate = '';
  isUnderage = false;
  calculatedAge = 0;
  dobSelected = false;

  // Validation
  nameErrors: { [key: string]: string } = {};

  purokOptions: string[] = [
    'Purok Mangga', 'Purok Tambis', 'Purok Lubi', 'Purok Tinago',
    'Purok Tabok', 'Purok Tagaytay', 'Purok Sapa', 'Purok Centro'
  ];

  @ViewChild('video', { static: false }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private faceMesh: FaceMesh | null = null;
  private cameraInstance: any;
  faceDetected = false;
  statusMessage = '⚠️ No face detected';
  private stableFaceStart: number | null = null;
  private autoCaptureInProgress = false;

  constructor(
    private registrationService: RegistrationService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
    this.setMaxDOB();
    await this.loadFaceModel();
  }

  async ngAfterViewInit() {
    if (this.videoRef?.nativeElement && this.faceMesh) {
      setTimeout(() => this.startLiveCamera(), 500);
    }
  }

  private async startLiveCamera() {
    if (!this.faceMesh || !this.videoRef?.nativeElement) return;

    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;

    video.addEventListener('loadeddata', () => {
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
    });

    this.cameraInstance = new Camera(video, {
      onFrame: async () => {
        if (this.faceMesh) await this.faceMesh.send({ image: video });
      },
      width: 320,
      height: 240,
    });

    try {
      await this.cameraInstance.start();
    } catch (err) {
      console.error('❌ Camera failed:', err);
      await this.presentToast('⚠️ Cannot access camera', 'warning');
    }
  }

  private async onFaceResults(results: any) {
    if (!this.canvasRef || !results.image) return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    const detected = results.multiFaceLandmarks?.length > 0;
    this.faceDetected = detected;

    if (detected) {
      const face = results.multiFaceLandmarks[0];
      const left = face[234];
      const right = face[454];
      const faceWidthRatio = Math.abs(right.x - left.x);

      if (faceWidthRatio < 0.18) {
        this.statusMessage = '📏 Move closer to camera';
        this.stableFaceStart = null;
        return;
      }

      const nose = face[1];
      if (nose.x < 0.30 || nose.x > 0.70) {
        this.statusMessage = '🎯 Center your face in the frame';
        this.stableFaceStart = null;
        return;
      }

      this.statusMessage = '✅ Hold still... capturing soon';

      if (!this.stableFaceStart) this.stableFaceStart = Date.now();
      else if (Date.now() - this.stableFaceStart >= 2000 && !this.autoCaptureInProgress) {
        this.autoCaptureInProgress = true;
        await this.autoCaptureFromCanvas();
      }

    } else {
      this.faceDetected = false;
      this.stableFaceStart = null;
      if (!this.autoCaptureInProgress) this.statusMessage = '⚠️ No face detected';
    }
  }

  private async autoCaptureFromCanvas() {
    if (!this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;

    if (this.isImageBlurred(canvas)) {
      this.statusMessage = '⚠️ Hold still... image is blurred';
      this.stableFaceStart = Date.now();
      setTimeout(() => (this.autoCaptureInProgress = false), 500);
      return;
    }

    this.photo = canvas.toDataURL('image/png');
    this.statusMessage = '📸 Photo captured successfully';
    await this.presentToast('✅ Clear face captured!', 'success');

    setTimeout(() => (this.autoCaptureInProgress = false), 2000);
  }

  private isImageBlurred(canvas: HTMLCanvasElement, threshold: number = 40): boolean {
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let laplacian = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      laplacian += gray;
      count++;
    }

    const mean = laplacian / count;
    let variance = 0;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      variance += (gray - mean) ** 2;
    }

    variance /= count;
    return variance < threshold;
  }

  private async loadFaceModel() {
    try {
      this.faceMesh = new FaceMesh({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      this.faceMesh.onResults(this.onFaceResults.bind(this));
      console.log('✅ MediaPipe FaceMesh loaded successfully.');
    } catch (err) {
      console.error('❌ Failed to initialize FaceMesh:', err);
      await this.presentToast('⚠️ Face detection model failed to load.', 'warning');
    }
  }

  // ---------------------------
  // Helpers & Validators
  // ---------------------------
  setMaxDOB() {
    const today = new Date();
    today.setFullYear(today.getFullYear() - 18);
    this.maxDate = today.toISOString().split('T')[0];
  }

  checkAge(value: string | string[] | null | undefined) {
    const dateStr = Array.isArray(value) ? value[0] : value;
    if (!dateStr) return;

    const today = new Date();
    const birthDate = new Date(dateStr);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();

    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;

    this.calculatedAge = age;
    this.isUnderage = age < 18;
    this.dobSelected = true;

    if (this.isUnderage) this.presentToast('🚫 You must be at least 18 years old.', 'warning');
  }

  togglePasswordVisibility() { this.showPassword = !this.showPassword; }
  toggleConfirmVisibility() { this.showConfirm = !this.showConfirm; }

  validatePassword() {
    const hasUpper = /[A-Z]/.test(this.password);
    const hasLower = /[a-z]/.test(this.password);
    const hasSpecial = /[\W_]/.test(this.password);
    const isLongEnough = this.password.length >= 8;
    this.passwordError = !(hasUpper && hasLower && hasSpecial && isLongEnough);
  }

  autoUppercaseLive(event: any, fieldName: string) {
    const input = event.target;
    const start = input.selectionStart;
    const rawValue = input.value.replace(/[^a-zA-ZñÑ\s'-]/g, '');
    const uppercased = rawValue.toUpperCase();
    this[fieldName] = uppercased;

    setTimeout(() => input.setSelectionRange(start, start));
  }

  validateName(field: string) {
    const value = (this as any)[field].trim();
    if (!value || /^[\s'-]+$/.test(value)) this.nameErrors[field] = 'Name must not be empty or contain only special characters.';
    else if (!/^[A-Za-zÑñ\s'-]+$/.test(value)) this.nameErrors[field] = 'Only letters, spaces, hyphens, and apostrophes are allowed.';
    else this.nameErrors[field] = '';
  }

  validatePlaceOfBirth() {
    if (!this.placeOfBirth || this.placeOfBirth.trim().length === 0) {
      this.placeOfBirthError = 'Place of Birth is required.';
      return false;
    }
    this.placeOfBirthError = '';
    return true;
  }

  preventPaste(event: Event) { event.preventDefault(); }

  // ---------------------------
  // Registration
  // ---------------------------
  async register() {
    this.validatePassword();
    this.confirmError = this.password !== this.confirmPassword;

    if (!this.validatePlaceOfBirth()) {
      await this.presentToast('⚠️ Please enter your Place of Birth.', 'warning');
      return;
    }

    const missingFields: string[] = [];
    if (!this.firstName) missingFields.push('First Name');
    if (!this.lastName) missingFields.push('Last Name');
    if (!this.contact) missingFields.push('Contact Number');
    if (!this.gender) missingFields.push('Gender');
    if (!this.dob) missingFields.push('Date of Birth');
    if (!this.password) missingFields.push('Password');
    if (!this.confirmPassword) missingFields.push('Confirm Password');
    if (!this.purok) missingFields.push('Purok');
    if (!this.photo) missingFields.push('Photo');

    if (missingFields.length > 0) {
      await this.presentToast(`⚠️ Missing: ${missingFields.join(', ')}`, 'warning');
      return;
    }

    if (this.isUnderage) {
      await this.presentToast('🚫 You must be at least 18 years old to register.', 'danger');
      return;
    }

    if (this.passwordError || this.confirmError) {
      await this.presentToast('❌ Please fix password errors.', 'danger');
      return;
    }

   const isValidName = (name: string) => {
  const trimmed = name.trim();
  return trimmed && /^[A-Za-zÑñ\s]+$/.test(trimmed);  // ONLY letters and spaces
};

if (![this.firstName, this.lastName].every(isValidName)) {
  await this.presentToast('❌ Names must only contain letters and spaces.', 'danger');
  return;
}


    const normalizeForBackend = (phone: string): string => {
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('63')) return '0' + cleaned.slice(2);
      if (cleaned.startsWith('9') && cleaned.length === 10) return '0' + cleaned;
      return cleaned;
    };
    const backendContact = normalizeForBackend(this.contact);

    if (!/^09\d{9}$/.test(backendContact)) {
      await this.presentToast('⚠️ Enter a valid 11-digit mobile number (starts with 09)', 'warning');
      return;
    }

    const isDupContact = await this.registrationService.isDuplicateContact(backendContact);
    const isDupName = await this.registrationService.isDuplicateName(this.firstName, this.middleName, this.lastName);
    if (isDupContact || isDupName) {
      await this.presentToast('⚠️ Duplicate record found.', 'danger');
      return;
    }

    const newRecord = {
      firstName: this.firstName.trim(),
      middleName: this.middleName.trim(),
      lastName: this.lastName.trim(),
      dob: this.dob,
      placeOfBirth: this.placeOfBirth.trim(),
      gender: this.gender,
      civilStatus: this.civilStatus,
      contact: backendContact,
      purok: this.purok,
      barangay: this.barangay,
      city: this.city,
      province: this.province,
      postalCode: this.postalCode,
      password: this.password,
      photo: this.photo,
      role: 'resident',
    };

    if (!navigator.onLine) {
      await this.presentToast('⚠️ Internet required to register.', 'warning');
      return;
    }

    console.log('📤 Sending registration data:', newRecord);

    try {
      const user = await this.registrationService.register(newRecord);
      await this.registrationService.saveOfflineUser({ ...user, password: newRecord.password });
      await this.presentToast('✅ Registered successfully!', 'success');
      this.clearForm();
      this.router.navigate(['/login']);
    } catch (err: any) {
      console.error('❌ Registration failed:', err);
      const msg = err?.error?.detail || err?.message || JSON.stringify(err);
      await this.presentToast(`❌ ${msg}`, 'danger');
    }
  }

  // ---------------------------
  // Helpers
  // ---------------------------
  clearForm() {
    this.firstName = '';
    this.middleName = '';
    this.lastName = '';
    this.dob = '';
    this.placeOfBirth = '';
    this.placeOfBirthError = '';
    this.gender = '';
    this.civilStatus = '';
    this.contact = '';
    this.purok = '';
    this.barangay = '';
    this.city = '';
    this.province = '';
    this.postalCode = '';
    this.password = '';
    this.confirmPassword = '';
    this.photo = '';
    this.passwordError = false;
    this.confirmError = false;
    this.showPassword = false;
    this.showConfirm = false;
    this.isUnderage = false;
    this.calculatedAge = 0;
    this.dobSelected = false;
    this.nameErrors = {};
  }

  goToLogin() { this.router.navigate(['/login']); }

  async presentToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'top',
    });
    await toast.present();
  }

  async testView() {
    const all = await this.registrationService.getAllRegistrations();
    console.log('📄 All registrations:', all);
  }
}


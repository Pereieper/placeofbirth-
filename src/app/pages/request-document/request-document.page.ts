import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  NavController,
  AlertController,
  ActionSheetController,
  Platform
} from '@ionic/angular';

import {
  DocumentRequestService,
  DocumentRequestPayload,
  AddRequestPayload
} from 'src/app/services/document-request.service';

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { RegistrationService } from 'src/app/services/registration.service';

@Component({
  selector: 'app-request-document',
  templateUrl: './request-document.page.html',
  styleUrls: ['./request-document.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class RequestDocumentPage implements OnInit {

  documentType = '';
  purpose = '';
  customPurpose = '';
  numberOfCopies = 1;
  requirements = '';
  authorizationPhoto?: string;

  dateNow = '';
  timeNow = '';
  requests: DocumentRequestPayload[] = [];

  documentOptions = [
    'Barangay Clearance',
    'Certificate of Residency',
    'Certificate of Indigency'
  ];

  purposeOptions = [
    'Employment',
    'School Requirement',
    'Financial Assistance',
    'Others'
  ];

  constructor(
    private navCtrl: NavController,
    private requestService: DocumentRequestService,
    private alertCtrl: AlertController,
    private actionSheetCtrl: ActionSheetController,
    private platform: Platform,
    private registrationService: RegistrationService
  ) {}

  ngOnInit() {
    const now = new Date();
    this.dateNow = now.toLocaleDateString();
    this.timeNow = now.toLocaleTimeString();

    const currentUser = this.registrationService.getCurrentUser();
    if (currentUser?.contact) {
      this.loadUserRequests(currentUser.contact);
    }
  }

  // -------------------------------
  // LOAD USER REQUEST HISTORY
  // -------------------------------
  async loadUserRequests(contact: string) {
    try {
      this.requests = await this.requestService.getRequestsByContact(contact);
    } catch (err) {
      console.error('Error loading user requests:', err);
    }
  }

  // -------------------------------
  // SUBMIT DOCUMENT REQUEST
  // -------------------------------
 async onContinue() {
  try {
    // ---------------- VALIDATION ----------------
    if (!this.documentType.trim()) {
      return alert('Please select a document type.');
    }

    if (!this.purpose.trim()) {
      return alert('Please select a purpose.');
    }

    if (this.purpose === 'Others' && !this.customPurpose.trim()) {
      return alert('Please specify your purpose.');
    }

    if (!this.numberOfCopies || this.numberOfCopies < 1) {
      return alert('Number of copies must be at least 1.');
    }

    const currentUser = this.registrationService.getCurrentUser();
    if (!currentUser?.contact) {
      return alert('No logged-in user found.');
    }

    // REQUIRE AUTHORIZATION PHOTO
    const authPhotoToUse =
      this.authorizationPhoto || currentUser.authorizationPhoto;

    if (!authPhotoToUse) {
      return alert('Please upload your authorization photo.');
    }

    const finalPurpose =
      this.purpose === 'Others'
        ? this.customPurpose.trim()
        : this.purpose.trim();

    // ---------------- PAYLOAD ----------------
    const payload: AddRequestPayload = {
      documentType: this.documentType.trim(),
      purpose: finalPurpose,
      copies: this.numberOfCopies,
      requirements: this.requirements?.trim() || '',
      authorizationPhoto: authPhotoToUse, // FIXED
      contact: currentUser.contact,
      notes: ''
    };

    console.log('Sending payload:', payload);

    // ---------------- SEND REQUEST ----------------
    const response = await this.requestService.addRequest(payload);

    if (!response || !response.id) {
      return alert('Unexpected response from server.');
    }

    alert('Your request has been successfully submitted.');

    this.resetForm();

    // reload user previous requests
    await this.loadUserRequests(currentUser.contact);

  } catch (err: any) {
    console.error('Submit failed:', err);

    let message = 'Failed to submit request.';
    if (err?.message) message = err.message;

    alert(message);
  }
}


  // ------------------------------------------
  // TAKE / SELECT AUTHORIZATION PHOTO
  // ------------------------------------------
  async openPhotoOptions() {
    try {
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt
      });

      this.authorizationPhoto = image.dataUrl;

    } catch (err) {
      console.error('Failed to get photo', err);
    }
  }

  // ------------------------------------------
  // RESET FORM (DOES NOT CLEAR SAVED USER PHOTO)
  // ------------------------------------------
  resetForm() {
    this.documentType = '';
    this.purpose = '';
    this.customPurpose = '';
    this.numberOfCopies = 1;
    this.requirements = '';
    this.authorizationPhoto = undefined;
  }

  // ------------------------------------------
  // CANCEL FORM
  // ------------------------------------------
  onCancel() {
    this.navCtrl.back();
  }
}

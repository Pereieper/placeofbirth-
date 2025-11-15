import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { DocumentRequestService, DocumentRequestPayload } from 'src/app/services/document-request.service';
import { RegistrationService } from 'src/app/services/registration.service';

@Component({
  selector: 'app-released-documents',
  templateUrl: './released-documents.page.html',
  styleUrls: ['./released-documents.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ReleasedDocumentsPage implements OnInit {
  releasedDocuments: DocumentRequestPayload[] = [];
  filteredDocuments: DocumentRequestPayload[] = [];
  paginatedDocuments: DocumentRequestPayload[] = [];
  selectedDocument: DocumentRequestPayload | null = null;

  currentPage = 1;
  itemsPerPage = 5;
  totalPages = 1;
  searchTerm = '';
  showModal = false;
  loading = false;

  constructor(
    private requestService: DocumentRequestService,
    private registrationService: RegistrationService,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    const currentUser = this.registrationService.getCurrentUser();
    if (currentUser?.contact) {
      this.loadReleasedDocuments(currentUser.contact);
    }
  }

  async loadReleasedDocuments(contact: string) {
    this.loading = true;
    try {
      const allRequests = await this.requestService.getAllRequests();
      this.releasedDocuments = allRequests.filter(r =>
        r.contact === contact &&
        (r.status === 'For Pickup' || r.status === 'Completed')
      );
      this.filteredDocuments = [...this.releasedDocuments];
      this.updatePagination();
      this.paginateDocuments();
    } catch (err) {
      console.error(err);
      await this.showToast('❌ Failed to load documents.', 'danger');
    } finally {
      this.loading = false;
    }
  }

  filterDocuments() {
    const term = this.searchTerm.toLowerCase();
    this.filteredDocuments = this.releasedDocuments.filter(doc =>
      doc.documentType.toLowerCase().includes(term) ||
      doc.status.toLowerCase().includes(term)
    );
    this.updatePagination();
    this.paginateDocuments();
  }

  updatePagination() {
    this.totalPages = Math.ceil(this.filteredDocuments.length / this.itemsPerPage) || 1;
    if (this.currentPage > this.totalPages) this.currentPage = 1;
  }

  paginateDocuments() {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    this.paginatedDocuments = this.filteredDocuments.slice(start, end);
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.paginateDocuments();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.paginateDocuments();
    }
  }

  async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom'
    });
    toast.present();
  }

  // ---------------- Status Helpers ----------------
  isForPickup(doc: DocumentRequestPayload | null): boolean {
    return doc?.status === 'For Pickup';
  }

  isCompleted(doc: DocumentRequestPayload | null): boolean {
    return doc?.status === 'Completed';
  }

  // ---------------- Modal ----------------
  openModal(document: DocumentRequestPayload) {
    this.selectedDocument = document;
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    setTimeout(() => this.selectedDocument = null, 150);
  }
}

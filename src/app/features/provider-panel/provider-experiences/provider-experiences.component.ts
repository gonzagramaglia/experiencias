import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ProviderStoreService } from '../../../core/services/provider-store.service';
import { ProviderExperience } from '../../../core/models/bank-transfer.model';
import { ArsPipe, FechaPipe } from '../../../shared/pipes/format.pipes';

type ExpFilterTab = 'todas' | 'publicadas' | 'revision' | 'borradores' | 'ocultas';

@Component({
  selector: 'app-provider-experiences',
  standalone: true,
  imports: [RouterLink, MatIconModule, ArsPipe, FechaPipe],
  templateUrl: './provider-experiences.component.html',
  styleUrl: './provider-experiences.component.css',
})
export class ProviderExperiencesComponent {
  readonly store = inject(ProviderStoreService);

  readonly activeTab = signal<ExpFilterTab>('todas');
  readonly selectedExpForDelete = signal<ProviderExperience | null>(null);
  readonly deleteErrorModal = signal<string | null>(null);
  readonly hideReasonModal = signal<ProviderExperience | null>(null);
  readonly hideReasonText = signal('');
  readonly feedbackToast = signal<string | null>(null);

  readonly rows = computed(() => {
    const list = this.store.providerExperiences();
    const tab = this.activeTab();

    return list
      .filter((exp) => {
        if (tab === 'publicadas') return exp.status === 'publicada';
        if (tab === 'revision') {
          return (
            exp.status === 'pendiente_publicacion' ||
            exp.status === 'pendiente_ocultar' ||
            exp.status === 'pendiente_eliminar'
          );
        }
        if (tab === 'borradores') return exp.status === 'borrador';
        if (tab === 'ocultas') return exp.status === 'oculta';
        return true;
      })
      .map((experience) => {
        const submissions = this.store.submissionsFor(experience.id);
        const enrolledCount = this.store.totalEnrolledInExperience(experience.id);
        const canDelete = this.store.canDeleteExperience(experience.id);

        return {
          experience,
          enrolledCount,
          canDelete,
          pendingSubmissions: submissions.filter((s) => s.status === 'pendiente').length,
          confirmedRevenue: submissions
            .filter((s) => s.status === 'aprobado')
            .reduce((total, s) => total + s.amountArs, 0),
          nextDates: experience.dates.slice(0, 3).map((date) => ({
            date,
            reserved: this.store.reservedSeats(experience.id, date),
          })),
        };
      });
  });

  onRequestPublish(exp: ProviderExperience): void {
    try {
      this.store.requestPublish(exp.id);
      this.showToast('✅ Solicitud de publicación enviada al Admin para revisión.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al solicitar publicación';
      this.showToast(`⚠️ ${msg}`);
    }
  }

  openHideModal(exp: ProviderExperience): void {
    this.hideReasonModal.set(exp);
    this.hideReasonText.set('');
  }

  confirmHide(): void {
    const exp = this.hideReasonModal();
    if (!exp) return;
    this.store.requestHide(exp.id, this.hideReasonText());
    this.hideReasonModal.set(null);
    this.showToast('🟠 Solicitud de ocultación enviada al Admin.');
  }

  onDeleteClick(exp: ProviderExperience): void {
    const check = this.store.canDeleteExperience(exp.id);
    if (!check.allowed) {
      this.deleteErrorModal.set(check.reason || 'No se puede eliminar la experiencia.');
      return;
    }
    this.selectedExpForDelete.set(exp);
  }

  confirmDelete(): void {
    const exp = this.selectedExpForDelete();
    if (!exp) return;
    try {
      this.store.requestDelete(exp.id);
      this.selectedExpForDelete.set(null);
      this.showToast('🔴 Solicitud de eliminación enviada al Admin.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar';
      this.showToast(`⚠️ ${msg}`);
    }
  }

  onAdminSimulateApprove(expId: string): void {
    this.store.adminApproveAction(expId);
    this.showToast('✨ [Simulador Admin] Solicitud aprobada con éxito.');
  }

  private showToast(msg: string): void {
    this.feedbackToast.set(msg);
    setTimeout(() => this.feedbackToast.set(null), 4000);
  }
}

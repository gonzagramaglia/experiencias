import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ProviderStoreService } from '../../../core/services/provider-store.service';
import { ExperienceStatus, ProviderExperience } from '../../../core/models/bank-transfer.model';
import { FechaPipe } from '../../../shared/pipes/format.pipes';

const MAX_DATES = 25;

interface PresetImage {
  url: string;
  label: string;
}

@Component({
  selector: 'app-provider-experience-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatIconModule, FechaPipe],
  templateUrl: './provider-experience-form.component.html',
  styleUrl: './provider-experience-form.component.css',
})
export class ProviderExperienceFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(ProviderStoreService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isEditMode = signal(false);
  readonly editingExpId = signal<string | null>(null);
  readonly currentStatus = signal<ExperienceStatus>('borrador');

  readonly difficulties: ProviderExperience['difficulty'][] = [
    'Baja',
    'Moderada',
    'Exigente',
    'Alta Montaña',
  ];
  readonly regions = [
    'Valle Central y Ambato',
    'Puna de Atacama',
    'Antofagasta de la Sierra',
    'Fiambalá y Seismiles',
    'Belén y Ruta del Telar',
    'Andalgalá y Cuesta de Zapata',
  ];
  readonly today = new Date().toISOString().slice(0, 10);

  readonly presetImages: PresetImage[] = [
    { url: '/assets/images/kayak-club-de-experiencias.jpg', label: 'Kayak en Dique El Jumeal' },
    { url: '/assets/images/catamarca_pomez.jpg', label: 'Campo de Piedra Pómez' },
    { url: '/assets/images/laguna_blanca.jpg', label: 'Laguna Blanca y Vicuñas' },
    { url: '/assets/images/laguna-verde.jpg', label: 'Laguna Verde y Seismiles' },
    { url: '/assets/images/catamarca_hero.jpg', label: 'Puna Andina Hero' },
  ];

  readonly selectedCoverImage = signal<string>(this.presetImages[0].url);

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(100)]],
    shortTitle: ['', [Validators.maxLength(40)]],
    tagline: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', [Validators.required, Validators.minLength(30), Validators.maxLength(2500)]],
    region: [this.regions[0], Validators.required],
    meetingPoint: ['', [Validators.required, Validators.maxLength(160)]],
    difficulty: this.fb.nonNullable.control<ProviderExperience['difficulty']>(
      'Baja',
      Validators.required,
    ),
    durationLabel: ['', [Validators.required, Validators.maxLength(50)]],
    priceArs: [65000, [Validators.required, Validators.min(1000), Validators.max(20_000_000)]],
    capacityPerDate: [12, [Validators.required, Validators.min(1), Validators.max(200)]],
  });

  readonly dates = signal<string[]>([]);
  readonly newDate = signal('');
  readonly datesError = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.editingExpId.set(id);
      const exp = this.store.getExperienceById(id);
      if (exp) {
        this.currentStatus.set(exp.status);
        this.selectedCoverImage.set(exp.coverImage || this.presetImages[0].url);
        this.dates.set([...exp.dates]);
        this.form.patchValue({
          title: exp.title,
          shortTitle: exp.shortTitle || '',
          tagline: exp.tagline,
          description: exp.description,
          region: exp.region,
          meetingPoint: exp.meetingPoint,
          difficulty: exp.difficulty,
          durationLabel: exp.durationLabel,
          priceArs: exp.priceArs,
          capacityPerDate: exp.capacityPerDate,
        });
      }
    }
  }

  addDate(): void {
    const value = this.newDate();
    if (!value) return;
    if (value < this.today) {
      this.datesError.set('La fecha tiene que ser futura.');
      return;
    }
    if (this.dates().includes(value)) {
      this.datesError.set('Esa fecha ya está cargada.');
      return;
    }
    if (this.dates().length >= MAX_DATES) {
      this.datesError.set(`Podés cargar hasta ${MAX_DATES} fechas.`);
      return;
    }
    this.dates.update((list) => [...list, value].sort());
    this.newDate.set('');
    this.datesError.set(null);
  }

  removeDate(date: string): void {
    this.dates.update((list) => list.filter((d) => d !== date));
  }

  fieldInvalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  save(requestPublication: boolean): void {
    this.form.markAllAsTouched();
    if (requestPublication && this.dates().length === 0) {
      this.datesError.set('Agregá al menos una fecha futura para solicitar publicación.');
      return;
    }
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    const payload = {
      title: value.title.trim(),
      shortTitle: value.shortTitle.trim() || undefined,
      tagline: value.tagline.trim(),
      description: value.description.trim(),
      region: value.region,
      meetingPoint: value.meetingPoint.trim(),
      difficulty: value.difficulty,
      durationLabel: value.durationLabel.trim(),
      priceArs: Math.round(Number(value.priceArs)),
      capacityPerDate: Math.round(Number(value.capacityPerDate)),
      dates: this.dates(),
      coverImage: this.selectedCoverImage(),
    };

    if (this.isEditMode() && this.editingExpId()) {
      // Update existing
      this.store.updateExperience(this.editingExpId()!, {
        ...payload,
        status: requestPublication ? 'pendiente_publicacion' : this.currentStatus(),
        ...(requestPublication
          ? {
              moderation: {
                action: 'publicar',
                requestedAt: new Date().toISOString(),
                status: 'pendiente',
              },
            }
          : {}),
      });
    } else {
      // Create new
      this.store.createExperience(
        {
          ...payload,
          status: requestPublication ? 'pendiente_publicacion' : 'borrador',
          providerId: this.store.currentProvider()?.id || 'prov-default',
          providerName: this.store.currentProvider()?.agency || 'Prestador Catamarca',
        },
        requestPublication,
      );
    }

    this.router.navigate(['/prestadores/experiencias']);
  }
}

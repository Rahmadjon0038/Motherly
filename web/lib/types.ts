export interface StaffMember {
  id?: number; // yangi qo'shilgan xodimda hali id yo'q
  name: string;
  position: string;
  schedule: string;
  experience: number | null; // yil
}

export interface ClinicPhoto {
  id: number;
  url: string;
}

export interface WorkDay {
  day: number; // 1 = dushanba … 7 = yakshanba
  closed: boolean;
  open: string | null; // "09:00"
  close: string | null;
}

export interface ExtraPhone {
  label: string;
  number: string;
}

export interface Clinic {
  id: number;
  name: string;
  address: string;
  hours: string;
  workHours: WorkDay[] | null;
  phone: string;
  extraPhones: ExtraPhone[];
  about: string;
  services: string;
  lat: number | null;
  lng: number | null;
  photoUrl: string | null;
  photos: ClinicPhoto[];
  mapUrl: string | null;
  staff: StaffMember[];
}

export interface RequestChild {
  name: string;
  birthDate: string;
  allergies: string | null;
  medicalNotes: string | null;
}

/** Onaning klinikaga yuborgan murojaati. */
export interface ClinicRequest {
  id: number;
  handled: boolean;
  createdAt: string;
  name: string;
  phone: string;
  children: RequestChild[];
}

export interface AuthResult {
  token: string;
  user: { id: number; phone: string | null; role: string; name: string | null; username: string | null };
}

export interface Credentials {
  username: string;
  password: string;
}

export interface AdminClinic {
  id: number;
  name: string;
  address: string;
  phone: string;
  username: string | null;
  complete: boolean;
  photoCount: number;
  photoUrl: string | null;
  createdAt: string;
}

export interface AdminClinicDetail extends AdminClinic {
  about: string;
  services: string;
  extraPhones: ExtraPhone[];
  hours: string;
  workHours: WorkDay[] | null;
  openNow: boolean | null;
  hoursNote: string;
  lat: number | null;
  lng: number | null;
  mapUrl: string | null;
  photos: ClinicPhoto[];
  requestsThisMonth: number;
  requestsLast30d: number;
}

export interface AdminVideo {
  id: number;
  title: string;
  description: string;
  category: string;
  durationSec: number;
  playlistId: number | null;
  position: number;
  price: number;
  videoUrl: string;
  isFile: boolean;
  createdAt: string;
}

export interface AdminPlaylist {
  id: number;
  title: string;
  description: string;
  price: number;
  createdAt: string;
  count: number;
  durationSec: number;
  cover: { videoUrl: string; isFile: boolean } | null;
}

export interface AdminPlaylistDetail extends AdminPlaylist {
  videos: AdminVideo[];
}

export interface Stats {
  totals: {
    clinics: number;
    completeClinics: number;
    mothers: number;
    newMothers30d: number;
    guests: number;
    consultants: number;
    clinicNurses: number;
    visitsTotal: number;
  };
  visits: { today: number; last7d: number; last30d: number };
  visitsByDay: { day: string; count: number }[];
  topClinics: { id: number; name: string; visits: number }[];
  visitStatuses: { status: string; count: number }[];
}

export interface ClinicConsultant {
  id: number;
  phone: string;
  name: string;
  /** Yo'nalishi (masalan "Laktatsiya"). */
  field: string;
  /** Parolni ko'rish va o'zgartirish mumkinmi (akkauntni shu klinika yaratgan). */
  canManage: boolean;
  /** Shifokorlik hujjati holati: none | pending | approved | rejected. */
  verification?: string;
  /** Shu klinika nomidan e'lon joylaganmi. */
  listing: { field: string; price: number } | null;
}

// domain.ts - Add these missing types
export type UserRole =
  | "admin"
  | "doctor"
  | "secretary"
  | "accountant"
  | "hr"
  | "support_client"
  | "manager"
  | "receptionist"
  | "assistant";

export const roleLabels: Record<UserRole, string> = {
  admin: "Administrateur",
  doctor: "Médecin",
  secretary: "Secrétaire",
  accountant: "Comptable",
  hr: "Responsable RH",
  support_client: "Agent Support",
  manager: "Manager",
  receptionist: "Réceptionniste",
  assistant: "Assistant(e)",
};

export type TicketPriority = "Faible" | "Moyenne" | "Élevée" | "Critique";
export type TicketStatus = "Nouveau" | "En cours" | "En attente" | "Résolu" | "Fermé";

// Add these types for patients and agents
export type Patient = {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_naissance?: string;
  adresse?: string;
  num_securite_sociale?: string;
};

export type Agent = {
  id: number;
  name: string;
  email?: string;
  role?: UserRole;
  first_name?: string;
  last_name?: string;
  matricule?: string;
};

export type Ticket = {
  id: number;
  numero: string;
  titre: string;
  description: string;
  priorite: TicketPriority;
  statut: TicketStatus;
  client: string;
  agent: string;
  dateCreation: string;
};

export type ComplaintStatus = "Nouvelle" | "En traitement" | "Résolue" | "Fermée";

export type Complaint = {
  id: number;
  description: string;
  statut: ComplaintStatus;
  client: string;
  dateCreation: string;
};

export type Employee = {
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  telephone: string;
  email: string;
  fonction: string;
  dateEmbauche: string;
};

export type LeaveStatus = "En attente" | "Acceptée" | "Refusée";

export type LeaveRequest = {
  id: number;
  employeeId: number;
  employe: string;
  dateDebut: string;
  dateFin: string;
  statut: LeaveStatus;
};

export type Absence = {
  id: number;
  employeeId: number;
  employe: string;
  date: string;
  motif: string;
};

export type InvoiceStatus = "Brouillon" | "Émise" | "Payée" | "Annulée";

export type Invoice = {
  id: number;
  numero: string;
  client: string;
  montant: number;
  statut: InvoiceStatus;
  date: string;
};

export type PaymentMode = "Espèces" | "Chèque" | "Virement bancaire";

export type Payment = {
  id: number;
  invoiceId: number;
  montant: number;
  datePaiement: string;
  mode: PaymentMode;
};
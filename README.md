# 🏥 HealthHub — Medical Clinic Management Platform

> **Full-stack CRM/ERP platform for modern medical clinics**
>
> **Django REST API · React · TypeScript · PostgreSQL · Docker**

HealthHub is a full-stack **medical clinic management platform** designed to centralize clinical, administrative, financial, HR, inventory, equipment, and patient operations in a single secure system.

The platform replaces fragmented workflows such as spreadsheets, paper records, disconnected HR tools, manual accounting, and separate patient-management systems with a unified application built around **role-based access control, centralized data, and a complete audit trail**.

It is designed to support different types of medical clinics rather than being tied to a single medical specialty.

---

# 🇬🇧 English

## 📋 Overview

HealthHub provides a centralized platform for managing the day-to-day operations of a medical clinic.

The system connects:

* Patient management
* Medical records
* Appointments
* Staff and HR
* Payroll
* Billing and payments
* Inventory
* Equipment
* Support and incidents
* Messaging
* Administration
* Reporting and analytics

A single workflow can update multiple parts of the system while maintaining consistent records and audit information.

The platform also supports **French/English interfaces** and features adapted to the Tunisian environment, including **TND currency and CNAM-related workflows** where applicable.

---

# ✨ Key Features

| Domain                     | Capabilities                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 👤 **Patient Management**  | Patient profiles, medical history, documents, appointments, portal access                                     |
| 🌐 **Patient Portal**      | Isolated authentication, dashboard, appointments, medical history, secure messaging, ratings, document access |
| 📅 **Appointments**        | Smart scheduling, doctor availability, room availability, waiting lists, automatic appointment release        |
| 🩺 **Clinical Management** | Medical records, consultations, clinical notes, treatment/session records, protocols and medical follow-up    |
| 🎫 **Support & Incidents** | Tickets, priorities, SLA deadlines, breach detection, Kanban, complaints and incidents                        |
| ⚙️ **Equipment**           | Equipment records, maintenance interventions, MTBF, MTTR, availability, calibration alerts and depreciation   |
| 👥 **HR & Payroll**        | Employees, leave, shifts, skills, training, salary advances and payroll processing                            |
| 💰 **Finance**             | Invoices, payments, CNAM claims, payment follow-up, subscriptions and outgoing payments                       |
| 📦 **Inventory**           | Medical products, stock entries, movements, low-stock alerts and expiry monitoring                            |
| 💬 **Messaging**           | Internal communication and secure patient/staff messaging                                                     |
| 🔐 **Administration**      | Dynamic RBAC, audit trail, permissions, configuration and user management                                     |
| 📊 **Analytics**           | Live KPIs, dashboards and operational statistics                                                              |

---

# 👥 User Roles

The platform currently defines seven main user personas:

1. **Patient** — Self-service patient portal
2. **Receptionist** — Patient intake, appointments and check-in/out
3. **Clinician** — Agenda, medical records and clinical workflows
4. **HR Secretary** — Employees, leave, shifts and training
5. **Accountant** — Billing, payments, CNAM and financial operations
6. **Maintenance Technician** — Equipment maintenance and reliability
7. **Clinic Manager** — KPIs, RBAC, audit and operational oversight

The permission system is designed to support both predefined and configurable roles.

---

# 🏗️ Architecture

```text
                         ┌──────────────────────┐
                         │    Patient Portal    │
                         │      / Frontend      │
                         └──────────┬───────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│                                                          │
│ React · TypeScript · Vite                               │
│ TanStack Router · TanStack Query                        │
│ shadcn/ui · Tailwind CSS                                │
└───────────────────────────┬──────────────────────────────┘
                            │
                            │ REST API
                            ▼
┌──────────────────────────────────────────────────────────┐
│                    Django Backend                        │
│                                                          │
│ Django REST Framework                                    │
│ Authentication · RBAC · Business Logic                  │
│                                                          │
│ CRM · Accounts · HR · Payroll · Accounting               │
│ Inventory · Messaging · Audit · Dashboard                │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │    PostgreSQL    │
                   │     Database     │
                   └──────────────────┘

                    Docker Compose
          ┌────────────────────────────────┐
          │ Backend · Frontend · Database  │
          └────────────────────────────────┘
```

---

# 🧩 Backend Architecture

The backend is organized into dedicated Django applications.

Current applications include:

```text
crm
accounting
hr
payroll
accounts
stocks
messaging
audit
dashboard
```

The architecture separates:

* Authentication
* Domain models
* Business logic
* API endpoints
* Permissions
* Audit logging
* Background processing

This allows individual business domains to evolve without putting all application logic into a single Django application.

---

# 👤 Patient Portal

The patient portal is architecturally separated from staff authentication.

Patients can access functionality such as:

* Patient dashboard
* Appointment management
* Medical history
* Secure messaging
* Session/appointment ratings
* Document access

The portal uses a separate authentication model and token pool.

A patient authentication token is not intended to provide access to staff-only endpoints.

---

# 📅 Appointment Management

HealthHub provides centralized appointment management with support for:

* Doctor availability
* Room availability
* Appointment scheduling
* Waiting lists
* Appointment priorities
* Automatic release of unused reservations
* Weighted scheduling logic

The scheduling system can evaluate multiple factors such as:

* Doctor workload
* Patient preferences
* Available resources
* Timing

This allows appointments to be managed through a single scheduling workflow.

---

# 🩺 Clinical Management

The clinical module is designed around **general medical clinic workflows** rather than a specific specialty.

It provides support for:

* Patient medical records
* Consultations
* Clinical notes
* Medical follow-up
* Treatment/session records
* Medical protocols
* Clinical history

The architecture is intended to allow additional medical specialties and workflows to be added without redesigning the entire platform.

---

# 🎫 Support & SLA Management

The platform includes a ticketing and incident-management system.

Tickets can include:

* Priority
* SLA deadline
* Status
* Assigned user
* Comments
* Complaints
* Incidents

Supported SLA levels include:

```text
4 hours
24 hours
72 hours
7 days
```

An automated process checks for SLA breaches and identifies overdue tickets.

A Kanban-style workflow is available for operational tracking.

---

# ⚙️ Equipment Management

Equipment management tracks the operational lifecycle of clinic equipment.

Features include:

* Equipment records
* Maintenance interventions
* Maintenance history
* Calibration monitoring
* Availability
* MTBF
* MTTR
* Depreciation
* Book value
* Maintenance alerts

Reliability metrics can be recalculated from maintenance records to provide operational visibility.

---

# 👥 HR & Payroll

The HR domain manages employee-related workflows including:

* Employee records
* Leave requests
* Absences
* Shifts
* Skills
* Training
* Salary advances
* Payroll inputs
* Payroll batches

Payroll functionality is separated from the general HR domain to allow dedicated payroll processing and permissions.

---

# 💰 Accounting & Finance

The finance domain supports:

* Invoice generation
* Payments
* Payment tracking
* CNAM claims
* Payment follow-up
* Subscription plans
* Outgoing payments
* Depreciation

Financial records are connected to the relevant operational workflows rather than being maintained as an isolated accounting system.

---

# 📦 Inventory

Inventory management is designed around medical clinic requirements.

It includes:

* Medical products
* Stock entries
* Stock movements
* Current quantities
* Low-stock alerts
* Expiry monitoring

The inventory system can be connected to other clinic workflows where products or resources are required.

---

# 🔐 Security

Security is handled at multiple architectural levels.

### Authentication

Staff authentication uses:

* JWT
* HttpOnly cookies
* CSRF protection

### Authorization

The application provides:

* Role-based access control
* Built-in roles
* Custom roles
* UI-configurable permissions

### Account Protection

Account lockout is implemented after repeated failed login attempts.

### Audit Trail

Important operations can be recorded through a centralized audit system using Django's content-type framework.

### Patient Isolation

The patient portal uses a separate authentication mechanism from staff users.

This prevents patient credentials from being treated as staff credentials.

---

# 🧠 Dynamic RBAC

One of the main administrative features is the ability to configure roles and permissions.

Instead of relying exclusively on hard-coded roles, the system supports:

```text
Built-in Roles
      │
      ├── Permissions
      │
      ▼
Custom Roles
      │
      ├── Read permissions
      ├── Write permissions
      └── Module access
```

This allows clinic administrators to adapt permissions to their organizational structure.

---

# 📊 Architecture Snapshot

Current project metrics documented from the source repository:

* **9 Django applications**
* **56 database models**
* **48 migrations**
* **46 router resources**
* **46 standalone endpoints**
* **56 frontend routes/pages**
* **~53,000 lines of code**
* **78 unit tests**
* **3 major automation engines**

The three major automation areas currently include:

1. Smart appointment scheduling
2. SLA enforcement
3. Equipment reliability calculations

These metrics are based on the repository documentation/source rather than estimates.

---

# 🛠️ Technology Stack

| Layer                     | Technology                      |
| ------------------------- | ------------------------------- |
| **Backend**               | Django 4.2+                     |
| **API**                   | Django REST Framework           |
| **Authentication**        | SimpleJWT                       |
| **Security**              | HttpOnly Cookies + CSRF         |
| **Frontend**              | React 19                        |
| **Language**              | TypeScript                      |
| **Build Tool**            | Vite                            |
| **Routing**               | TanStack Router                 |
| **Data Fetching**         | TanStack Query                  |
| **UI**                    | shadcn/ui + Tailwind CSS        |
| **Database**              | PostgreSQL                      |
| **Local Development**     | SQLite                          |
| **Containers**            | Docker + Docker Compose         |
| **Code Quality**          | ESLint + Prettier               |
| **Background Processing** | Django management/cron commands |
| **Planned Scaling**       | Celery + Redis                  |

---

# 📁 Repository Structure

```text
crm-erp-medical/
│
├── docker-compose.yml
│
├── backend/
│   │
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env
│   │
│   ├── apps/
│   │   ├── accounts/
│   │   ├── crm/
│   │   ├── hr/
│   │   ├── payroll/
│   │   ├── accounting/
│   │   ├── stocks/
│   │   ├── messaging/
│   │   ├── audit/
│   │   └── dashboard/
│   │
│   └── ...
│
├── frontend/
│   │
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── routes/
│   │   ├── components/
│   │   ├── services/
│   │   ├── lib/
│   │   └── ...
│   │
│   └── ...
│
└── README.md
```

The repository structure is centered on a Django REST backend, React/Vite frontend, and Docker Compose development environment.

---

# 🚀 Getting Started

## Prerequisites

Install:

* Git
* Python 3.x
* Node.js
* Docker
* Docker Compose

---

## Option 1 — Docker

From the project root:

```bash
docker compose up --build
```

This starts the application services and database.

Access:

```text
Backend:
http://localhost:8000

Frontend:
http://localhost:5173
```

The repository's documented Docker workflow uses `docker compose up --build`.

---

## Option 2 — Backend Locally

```powershell
cd backend

python -m venv venv

.\venv\Scripts\Activate.ps1

python -m pip install -r requirements.txt

python manage.py migrate

python manage.py runserver
```

Backend:

```text
http://127.0.0.1:8000/
```

---

## Option 3 — Frontend Locally

```powershell
cd frontend

npm install

npm run dev -- --host
```

Frontend:

```text
http://localhost:5173
```

---

# ⚙️ Environment Configuration

Create a local `.env` file before starting the application.

Typical configuration includes:

```text
DJANGO_SECRET_KEY
DJANGO_DEBUG
DJANGO_ALLOWED_HOSTS
DATABASE configuration
```

The frontend uses:

```text
VITE_API_BASE_URL
```

to determine the Django API URL.

**Never commit production secrets, passwords, API keys, or private credentials to the repository.**

---

# 🧪 Testing & Code Quality

## Backend Tests

```powershell
cd backend

python manage.py test
```

## Frontend Linting

```powershell
cd frontend

npm run lint
```

## Formatting

```powershell
npm run format
```

The repository currently documents **78 unit tests**, while full endpoint coverage remains part of the future quality roadmap.

---

# 🔄 Background Processing

Current background automation relies primarily on Django management/cron processes.

Planned scaling infrastructure includes:

```text
Celery
   +
Redis
```

This can eventually be used for more frequent and distributed background processing.

---

# 📈 Current Maturity

HealthHub has a substantial implemented feature set spanning clinical management, appointments, HR, payroll, finance, inventory, equipment, patient access, RBAC, and auditing.

The repository currently documents the core platform as production-ready for its main workflows, while identifying additional work around scalability, CI/CD, test coverage, and some unfinished backend integrations.

### Roadmap

Planned improvements include:

* Celery + Redis
* CI/CD pipeline
* PostgreSQL read replica
* Expanded endpoint test coverage
* Additional HR workflows
* Recruitment
* Social/event management
* HR document requests
* Expanded patient online booking functionality

These should be treated as **roadmap items**, not currently implemented features.

---

# ⚠️ Known Limitations

The project is actively evolving and is not presented as a finished enterprise SaaS product.

Areas requiring continued work include:

* Complete automated endpoint coverage
* CI/CD
* Background job infrastructure
* Production deployment hardening
* Monitoring and observability
* Scalability testing
* Additional integrations

The goal is to maintain a clear distinction between **implemented functionality** and **planned functionality**.

---

# 📝 Development Notes

The repository may contain development artifacts such as:

```text
__pycache__/
venv/
local caches
temporary files
development scripts
```

Generated dependencies and local development environments should not be treated as part of the application's architecture.

---

# 📄 License

**Proprietary — All Rights Reserved**

Contact the project authors for deployment, licensing, or partnership inquiries.

---

# 🇫🇷 Français

## 📋 Présentation

**HealthHub** est une plateforme **CRM/ERP full-stack de gestion des cliniques médicales**.

Elle centralise les opérations cliniques, administratives, financières, RH, logistiques et patient dans une seule application sécurisée et basée sur les rôles.

Le projet n'est plus limité à une spécialité médicale particulière. Son architecture est conçue pour être adaptable à différents types de **cliniques et établissements médicaux**.

La plateforme remplace les processus fragmentés tels que les tableurs, dossiers papier, outils RH séparés, comptabilité manuelle et systèmes indépendants de gestion des patients par un système centralisé avec une base de données commune et une piste d'audit.

Elle intègre également une interface **français/anglais** et des fonctionnalités adaptées au contexte tunisien, notamment la devise **TND** et certains workflows liés à la **CNAM**.

---

# ✨ Fonctionnalités principales

| Domaine                    | Fonctionnalités                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| 👤 **Patients**            | Dossiers patients, historique médical, documents, rendez-vous, portail                             |
| 🌐 **Portail Patient**     | Authentification isolée, tableau de bord, rendez-vous, historique, messagerie, documents           |
| 📅 **Rendez-vous**         | Planification intelligente, disponibilité médecins/salles, liste d'attente, libération automatique |
| 🩺 **Gestion médicale**    | Dossiers médicaux, consultations, notes cliniques, suivi, traitements et séances                   |
| 🎫 **Support & Incidents** | Tickets, priorités, SLA, détection des dépassements, Kanban, plaintes                              |
| ⚙️ **Équipements**         | Maintenance, MTBF, MTTR, disponibilité, étalonnage, amortissement                                  |
| 👥 **RH & Paie**           | Employés, congés, shifts, compétences, formations, avances et paie                                 |
| 💰 **Finance**             | Factures, paiements, CNAM, relances, abonnements, paiements sortants                               |
| 📦 **Stocks**              | Produits médicaux, mouvements, stocks faibles, péremptions                                         |
| 💬 **Messagerie**          | Communication interne et messagerie sécurisée                                                      |
| 🔐 **Administration**      | RBAC dynamique, audit, permissions et configuration                                                |
| 📊 **Analytique**          | KPI, tableaux de bord et statistiques                                                              |

---

# 👥 Profils utilisateurs

1. **Patient**
2. **Réceptionniste**
3. **Clinicien**
4. **Secrétaire RH**
5. **Comptable**
6. **Technicien de maintenance**
7. **Responsable de clinique**

---

# 🏗️ Architecture

```text
                    ┌─────────────────────┐
                    │    Portail Patient  │
                    └──────────┬──────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │    Frontend React         │
                 │ TypeScript · Vite        │
                 │ TanStack · Tailwind      │
                 └────────────┬─────────────┘
                              │
                              │ REST API
                              ▼
                 ┌──────────────────────────┐
                 │    Backend Django        │
                 │                          │
                 │ DRF · Auth · RBAC        │
                 │ CRM · RH · Paie          │
                 │ Finance · Stocks        │
                 │ Audit · Messaging        │
                 └────────────┬─────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │   PostgreSQL    │
                     └─────────────────┘
```

---

# 🔐 Sécurité

La plateforme utilise :

* JWT
* Cookies HttpOnly
* Protection CSRF
* Verrouillage des comptes après plusieurs échecs
* RBAC dynamique
* Rôles intégrés et personnalisables
* Piste d'audit
* Isolation du portail patient

Le portail patient possède son propre mécanisme d'authentification afin de séparer les accès patients des accès du personnel.

---

# 📊 État du projet

Le projet comprend actuellement :

* **9 applications Django**
* **56 modèles**
* **48 migrations**
* **46 ressources API via router**
* **46 endpoints autonomes**
* **56 routes/pages frontend**
* **~53 000 lignes de code**
* **78 tests unitaires**

Les fonctionnalités principales couvrent actuellement les domaines patient, clinique, rendez-vous, RH, paie, finance, stocks, équipements, support, administration et audit.

---

# 🚀 Installation

### Docker

```bash
docker compose up --build
```

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### Frontend

```powershell
cd frontend
npm install
npm run dev -- --host
```

---

# 🧪 Tests

```powershell
cd backend
python manage.py test
```

Frontend :

```powershell
cd frontend
npm run lint
npm run format
```

---

# 🗺️ Feuille de route

Les évolutions prévues comprennent :

* Celery + Redis
* CI/CD
* Réplica PostgreSQL
* Couverture de tests élargie
* Recrutement
* Événements sociaux
* Gestion des demandes de documents RH
* Extension du système de réservation en ligne

Ces éléments représentent la **feuille de route** et ne doivent pas être considérés comme des fonctionnalités déjà finalisées.

---

# 📄 Licence

**Propriétaire — Tous droits réservés**

Contacter les auteurs pour toute demande concernant le déploiement, la licence ou un partenariat.

---

> **HealthHub — One platform for the modern medical clinic.**
>
> **HealthHub — Une plateforme unique pour la clinique médicale moderne.**
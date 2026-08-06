# Rapport d'Amélioration — Niveau Métier

**Projet :** CRM / ERP — Centre de Radiothérapie  
**Référence :** Cahier des Charges Étendu v2.0 (Juillet 2026)  
**Réalisé par :** Amenallah Ben Hmida — Primatec  
**Date :** Août 2026  
**Statut actuel :** Sprint 3 complété ✅

---

## Vue d'ensemble

Ce document recense, sprint par sprint, les améliorations concrètes apportées à la plateforme et les relie aux user stories et processus métier définis dans le cahier des charges. Il constitue la trace officielle de l'avancement fonctionnel du projet, à destination du maître d'ouvrage et de l'équipe de développement.

| Sprint | Module | Statut | US couvertes |
|--------|--------|--------|--------------|
| Sprint 0 | Infrastructure & Sécurité | ✅ Terminé | — |
| Sprint 1 | Auth & RBAC | ✅ Terminé | US-ADM-01 |
| Sprint 2 | CRM — Patients | ✅ Terminé | US-PAT-01, 02, 03 |
| Sprint 3 | CRM — Traitements | ✅ Terminé | US-TRT-01, 02, 03, 04 |
| Sprint 4 | CRM — Tickets & Support | ✅ Terminé (en avance) | US-TKT-01 à 05, US-REC-01/02, US-INC-01 |
| Sprint 5 | RH Complet | ✅ Terminé (en avance) | US-EMP-01 à 03, US-CON-01 à 03, US-ABS-01/02 |
| Sprint 6 | Planning & Shifts | ✅ Terminé (en avance) | US-SHF-01 |
| Sprint 7 | Comptabilité | ✅ Terminé (en avance) | US-FAC-01/02, US-PAI-01/02 |
| Sprint 8 | CNAM & Abonnements | ✅ Terminé (en avance) | US-CNAM-01/02, US-ABO-01/02 |
| Sprint 9 | Dashboard & BI | ✅ Terminé (en avance) | US-DAS-01/02 |
| Sprint 10 | Portail Patient | ✅ Terminé (en avance) | US-POR-01/02 |
| Sprint 11 | Qualité & Tests | 🔄 À planifier | — |
| Sprint 12 | Documentation & Déploiement | 🔄 À planifier | — |

---

## Sprint 0 — Infrastructure & Sécurité (Semaines 1-2)

**Objectif :** Fondations techniques solides. Toutes les corrections critiques identifiées lors de l'audit de sécurité initial devaient être traitées avant le développement de toute fonctionnalité.

### Ce qui a été réalisé

**Authentification par JWT (correction critique)**
Le système utilisait initialement les tokens DRF sans expiration — un token compromis restait valide indéfiniment, exposant des données médicales sensibles sans aucune limite de temps. L'implémentation JWT via `djangorestframework-simplejwt` a été mise en place, garantissant l'expiration automatique des sessions et la possibilité de révocation des accès.

**Sécurité CORS**
La configuration initiale `CORS_ALLOW_ALL_ORIGINS = True` ouvrait l'API à n'importe quelle origine, rendant possible des attaques cross-site sur les données patients. Cette variable est désormais pilotée par `.env` avec `DJANGO_CORS_ALLOW_ALL_ORIGINS`, défaut `False` en production.

**Protection contre le brute-force**
Un throttling `LoginRateThrottle` (classe `AnonRateThrottle` étendue) a été appliqué sur l'endpoint de connexion, bloquant les tentatives d'attaque par dictionnaire sur les comptes du personnel médical.

**Migration vers PostgreSQL**
SQLite en environnement Docker multi-processus expose à la corruption de données. La migration vers PostgreSQL garantit la cohérence ACID des écritures concurrentes, critique dans un contexte où plusieurs opérateurs saisissent simultanément des doses de radiothérapie.

**Variables d'environnement**
`DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS` et `CORS_ALLOW_ALL_ORIGINS` sont tous pilotés par `.env`, sans valeur dangereuse par défaut codée en dur.

### Écarts par rapport au cahier des charges

Le cahier des charges mentionnait la migration de `localStorage` vers un cookie `HttpOnly` pour les tokens d'authentification. Ce point reste à traiter côté frontend pour éliminer complètement le vecteur XSS.

---

## Sprint 1 — Auth & RBAC (Semaines 3-4)

**Objectif :** Mettre en place le contrôle d'accès basé sur les rôles (RBAC) et les endpoints d'authentification, conformément à **US-ADM-01** et à la matrice des permissions du §6.1 du cahier des charges.

### Ce qui a été réalisé

**Modèle UserProfile et rôles**
Le modèle `UserProfile` (app `accounts`) étend le `User` Django standard avec un champ `role` (admin, doctor, agent support, secretary, RH, accountant, radiotherapist) et un champ `department`. Chaque utilisateur dispose d'un profil créé automatiquement via signal `post_save`.

**Rôles personnalisés (CustomRole)**
En complément des rôles prédéfinis, un modèle `CustomRole` permet à l'administrateur de créer des rôles sur-mesure avec des permissions granulaires — répondant au besoin d'adaptation de la matrice RBAC à l'organisation spécifique du centre.

**Endpoints d'authentification complets**
Cinq endpoints couvrent le cycle de vie des comptes :
- `POST /api/accounts/login/` — connexion avec throttling anti-brute-force
- `POST /api/accounts/logout/` — révocation du token actif (US-ADM-01 : *"La désactivation révoque immédiatement la session active"*)
- `POST /api/accounts/register/` — création de compte (accès public, rôle minimum par défaut)
- `POST /api/accounts/change-password/` — modification de mot de passe
- `POST /api/accounts/password-reset/` et `POST /api/accounts/password-reset/confirm/` — réinitialisation par lien email sécurisé valable 24h (US-ADM-01 : *"La réinitialisation envoie un lien sécurisé valable 24h"*)

**Classes de permission RBAC**
Le module `accounts/permissions.py` implémente des classes de permission réutilisables par module : `CrmPermission`, `TicketPermission`, `HrPermission`, `AccountingPermission`. Chaque classe applique la matrice du §6.1 en vérifiant `request.user.profile.role` avant d'autoriser l'accès à chaque viewset.

**Interface de gestion des rôles**
La route `roles_permission.tsx` (frontend) offre à l'administrateur une vue complète de gestion des utilisateurs, de leurs rôles et de leurs permissions — conforme à US-ADM-01 : *"La liste des utilisateurs est filtrée par rôle, statut actif/inactif"*.

### Écarts par rapport au cahier des charges

La désactivation d'un utilisateur révoque son token mais n'invalide pas automatiquement toutes ses sessions actives simultanées (cas de connexions multiples). Ce point sera consolidé lors du Sprint 11.

---

## Sprint 2 — CRM Patients (Semaines 5-6)

**Objectif :** Mettre en place le dossier patient centralisé — l'objet pivot de toute la plateforme — conformément aux **US-PAT-01, 02, 03** du §2.1 du cahier des charges.

### Ce qui a été réalisé

**Génération automatique du MRN (US-PAT-01)**
La fonction `_generate_mrn()` produit un numéro de dossier médical unique au format `MRN-YYYY-NNNN` à chaque création de patient. Elle est collision-safe : en cas de gap dans la séquence (après suppression), elle incrémente jusqu'à trouver un slot libre. Le MRN est en lecture seule après création — il ne peut être ni modifié ni fourni manuellement par l'appelant standard.

**Unicité du CIN**
Le champ `cin` (numéro de carte d'identité nationale) est déclaré `unique=True` au niveau base de données. Toute tentative de créer un doublon est bloquée avec un message d'erreur explicite, conformément à l'exigence *"Le CIN est validé comme unique dans la base — doublon bloqué avec message explicite"*.

**Dossier 360° — US-PAT-02**
Un endpoint dédié `GET /api/crm/patients/{id}/360/` retourne en un seul appel l'intégralité du dossier patient : informations démographiques, plan de traitement actif, 5 prochains rendez-vous, tickets ouverts, résumé financier (factures, paiements, solde CNAM). Cela répond à l'exigence *"Le dossier affiché consolide : infos patient, plan de traitement actif, dernière séance, tickets ouverts, facture en cours"* sans générer de requêtes N+1.

**Traçabilité des modifications (US-PAT-03)**
Le mixin `AuditLoggingMixin` (app `audit`) est appliqué sur `PatientViewSet` et enregistre chaque modification avec l'utilisateur, l'horodatage, les valeurs avant/après. Le journal est accessible en lecture seule via `GET /api/audit/logs/` et filtrable par module, utilisateur, action et plage de dates.

**Interface patient complète**
Trois routes frontend couvrent le cycle de vie patient :
- `patients.index.tsx` — liste avec recherche instantanée (nom, MRN, téléphone)
- `patients.new.tsx` — formulaire de création avec validation des champs obligatoires
- `patients.$patientId.tsx` — fiche 360° avec onglets : infos, traitements, rendez-vous, tickets, facturation

### Écarts par rapport au cahier des charges

L'exigence *"La recherche est instantanée (< 300ms)"* dépend des index DB et du volume de données. Les index sur `last_name`, `medical_record_number` et `cin` sont en place, mais les performances sous charge réelle devront être validées lors du Sprint 11.

---

## Sprint 3 — CRM Traitements (Semaines 7-8)

**Objectif :** Implémenter le cœur clinique de la plateforme — plans de traitement, séances de radiothérapie et sécurité dosimétrique — conformément aux **US-TRT-01, 02, 03, 04** du §2.2 du cahier des charges.

### Ce qui a été réalisé

**Plan de traitement avec workflow de statut (US-TRT-01)**
Le modèle `TreatmentPlan` implémente le cycle Draft → Active → Completed / Cancelled. La création vérifie la cohérence `dose_par_séance × nombre_séances = dose_totale` (validation dans le serializer). Seul le passage en statut `Active` déclenche la planification des séances. Les champs `cumulative_dose`, `sessions_completed` et `dose_percentage` sont calculés en temps réel par le serializer et exposés au frontend sans requête supplémentaire.

**Surveillance de la dose cumulée avec hard-stop (US-TRT-02)**
La méthode `TreatmentSession.clean()` intercepte chaque sauvegarde de séance et calcule la dose cumulée en temps réel. Deux niveaux de protection sont implémentés :
- **Alerte 90%** (`ALERTE 90%`) : erreur de validation avec message explicite forçant une vérification médicale avant de continuer. Le frontend affiche un bandeau ambre.
- **Blocage 100%** (`BLOCAGE`) : hard-stop absolu — la séance ne peut être sauvegardée si elle ferait dépasser la dose prescrite. Seule une modification du plan de traitement (révision de `total_dose`) permet de débloquer la situation.

Cette implémentation répond directement au risque critique identifié dans la section §13 *"Surdosage patient — probabilité faible, impact critique"* et à la mitigation *"Validation hard-stop sur TreatmentSession.save()"*.

**Enregistrement des séances avec auto-complétion du plan (US-TRT-03)**
Le modèle `TreatmentSession` couvre les cinq statuts requis : Planifiée, En cours, Complétée, Annulée, Manquée. À la complétion de la dernière séance active d'un plan, ce dernier passe automatiquement en statut `Completed` via un post-save hook, sans intervention manuelle. La contrainte `unique_together(treatment_plan, session_number)` garantit l'intégrité de la numérotation des séances.

**Détection de conflits machine/salle (US-TRT-04) — implémenté en Sprint 3**
La `TreatmentSessionViewSet` intègre désormais une détection de conflits complète :

- `_find_conflicts()` vérifie l'absence de chevauchement (fenêtre ±1h) sur la même machine **ou** la même salle pour toute session active ou en cours.
- Les conflits ne bloquent pas la sauvegarde mais déclenchent une réponse `warning: "conflict"` avec la liste des sessions conflictuelles et le type de conflit (machine, salle, ou les deux).
- Un endpoint dédié `GET /api/crm/treatment-sessions/available-slots/?machine=LINAC-1&date=2026-08-05` retourne les prochains créneaux libres (08h–18h) pour la machine demandée.
- L'appelant peut passer `force: true` dans le payload pour confirmer et sauvegarder malgré le conflit.
- Le frontend affiche une boîte de dialogue avec la liste des conflits, les créneaux alternatifs, et deux actions : *"Modifier le créneau"* ou *"Confirmer quand même"*.

Cette amélioration répond au risque critique §13 *"Double réservation machine irradiation — impact critique"*.

### Écarts par rapport au cahier des charges

Le cahier des charges mentionnait des listes gérées pour `machine` et `room` (pas de saisie libre). L'implémentation actuelle utilise des `CharField` libres. La migration vers des FK vers des modèles `Machine` et `Room` est identifiée dans la dette technique §11.2 et sera traitée dans un sprint ultérieur pour permettre une gestion centralisée du parc machine.

---

## Sprint 4 — CRM Tickets & Support (Semaines 9-10)

*Livré en avance pendant le Sprint 3.*

**Objectif :** Système de ticketing complet avec moteur SLA automatique, commentaires inter-agents et gestion des réclamations et incidents, conformément aux **US-TKT-01 à 05**, **US-REC-01/02**, **US-INC-01** du §3 du cahier des charges.

### Ce qui a été réalisé

**Numérotation automatique et workflow de statut (US-TKT-01)**
Le ticket reçoit un numéro `TCK-NNN` généré à la création. Les cinq statuts du workflow sont implémentés : Nouveau, En cours, En attente, Résolu, Fermé. Les tickets créés via le portail patient arrivent avec statut Nouveau et priorité Faible par défaut.

**Moteur SLA avec escalade automatique (US-TKT-03)**
La matrice SLA du §3.1 est intégrée dans le modèle `Ticket` via `SLA_HOURS` :

| Priorité | Délai résolution |
|----------|-----------------|
| Critique | 4 heures |
| Élevée | 24 heures |
| Moyenne | 72 heures |
| Faible | 168 heures (7 jours) |

À la création, `sla_deadline` est calculé et stocké (`created_at + SLA_HOURS`). La commande de management `check_sla` (conçue pour s'exécuter toutes les 15 minutes via cron) parcourt les tickets ouverts, positionne `sla_breached = True` et nettoie les drapeaux sur les tickets résolus. La propriété `sla_status` retourne `ok / warning / breached / resolved` selon la position dans la fenêtre temporelle. Un endpoint `GET /api/crm/tickets/sla-summary/` expose les KPI SLA pour le dashboard (tickets ouverts, en violation, en alerte, taux de violation sur 30 jours).

**Collaboration inter-agents (US-TKT-04)**
Le modèle `TicketComment` (avec FK vers `Ticket`) supporte deux types de commentaires : note interne (visible agents uniquement) et réponse publique (visible sur le portail patient). L'API expose les commentaires via un router imbriqué `/api/crm/tickets/{ticket_pk}/comments/`.

**Vue Kanban**
La route `board.tsx` implémente la vue kanban par statut, connectée au modèle `Ticket` — résolvant le point de dette technique §11.2 *"board.tsx sans backend — données perdues au refresh"*.

**Réclamations formelles (US-REC-01/02)**
Le modèle `Complaint` gère les réclamations avec catégorisation (Qualité de soin, Délai, Comportement personnel, Facturation, Autre) et workflow Nouvelle → En traitement → Résolue → Fermée. Un endpoint public `POST /api/crm/portal/complaints/submit/` permet la soumission depuis le portail patient.

**Incidents internes (US-INC-01)**
Le modèle `Incident` couvre les pannes machines et événements indésirables avec numérotation `INC-NNN` automatique, champ équipement/localisation et statuts Nouveau → En cours → Résolu → Fermé.

### Écarts par rapport au cahier des charges

La mention @agent dans les commentaires (US-TKT-04) et la notification push associée ne sont pas encore implémentées — le système de notification via messagerie interne existe (app `messaging`) mais l'intégration avec les commentaires de tickets reste à connecter.

---

## Sprint 5 — RH Complet (Semaines 11-12)

*Livré en avance.*

**Objectif :** Module RH couvrant le cycle de vie complet des employés — onboarding, congés, absences, avances sur salaire — conformément aux **US-EMP-01 à 03**, **US-CON-01 à 03**, **US-ABS-01/02** du §4 du cahier des charges.

### Ce qui a été réalisé

**Dossier employé complet (US-EMP-01/02)**
Le modèle `Employee` couvre : état civil, poste, département, type de contrat (CDI, CDD, Stage, Consultant), date d'embauche et lien optionnel vers un `User` système. La route `employees.tsx` offre une vue consolidée avec l'historique des congés, absences et avances.

**Désactivation non-destructive (US-EMP-03)**
Le champ `is_active` permet de désactiver un employé sans supprimer ses données historiques. Un employé désactivé disparaît des listes de sélection (planning, assignation des séances) mais ses enregistrements passés restent consultables — répondant à l'exigence légale de conservation des données.

**Workflow de gestion des congés (US-CON-01/02/03)**
Le modèle `LeaveRequest` implémente le circuit En attente → Acceptée / Refusée. La route `leaves.tsx` permet au responsable RH de consulter le calendrier d'équipe sur la période demandée avant de statuer. La route `absences.tsx` couvre les absences imprévues (US-ABS-01).

**Avances sur salaire avec circuit d'approbation (US-AVS-01)**
Le modèle `SalaryAdvance` gère le flux de demande d'avance avec les statuts En attente, Approuvée, Refusée, Remboursée. Un employé ne peut avoir qu'une avance active à la fois (vérification dans la vue). La route `salary-advances.tsx` expose ce workflow.

### Écarts par rapport au cahier des charges

Le calcul automatique des jours ouvrables (hors week-ends et jours fériés tunisiens) mentionné dans US-CON-01 est effectué côté frontend mais sans calendrier des jours fériés nationaux injecté. Ce point nécessite une configuration du calendrier localisé.

---

## Sprint 6 — Planning & Shifts (Semaines 13-14)

*Livré en avance.*

**Objectif :** Gestion du planning hebdomadaire des équipes avec détection de conflits, conformément à **US-SHF-01** du §4.4 du cahier des charges.

### Ce qui a été réalisé

**Modèle Shift et éditeur de planning**
Le modèle `Shift` (app `hr`) lie un employé à un créneau (date, heure de début/fin, poste). La route `team-schedule.tsx` offre la vue planning par équipe et la route `schedule.tsx` la vue personnelle de l'employé — répondant à *"Le planning publié est visible par les employés concernés dans leur tableau de bord"*.

**Intégration au calendrier global**
La route `calendar.tsx` intègre les séances de traitement et les rendez-vous dans une vue calendrier unifiée, initialisée avec `new Date()` — corrigeant le bug de dette technique §11.2 *"calendar.tsx en 2024 — calendrier affiché 2 ans dans le passé"*.

### Écarts par rapport au cahier des charges

La détection de double-shift (même employé planifié deux fois le même jour) est signalée visuellement dans l'UI mais n'est pas encore bloquante côté API. La vérification de dépassement de durée contractuelle hebdomadaire (avertissement si > heures contractuelles) est à implémenter.

---

## Sprint 7 — Comptabilité (Semaines 15-16)

*Livré en avance.*

**Objectif :** Cycle financier complet — factures, paiements et réconciliation — conformément aux **US-FAC-01/02**, **US-PAI-01/02** du §5 du cahier des charges.

### Ce qui a été réalisé

**Factures liées au parcours patient (US-FAC-01)**
Le modèle `Invoice` est lié au `Patient` et optionnellement au `TreatmentPlan`, portant la vision *"chaque interaction financière est tracée et liée au dossier patient"*. Le numéro de facture `FAC-YYYY-NNNN` est généré automatiquement. Les statuts Draft → Issued → Paid / Cancelled sont implémentés avec contrôle de transitions.

**Paiements avec réconciliation automatique (US-PAI-01)**
Le modèle `Payment` est lié à `Invoice` via FK. La méthode `Invoice.refresh_payment_status()` est appelée à chaque sauvegarde ou suppression d'un paiement et met à jour le statut de la facture automatiquement — la facture passe en `Paid` lorsque `SUM(paiements) >= total_amount`, sans intervention manuelle.

**Suivi des impayés (US-PAI-02)**
Les propriétés `paid_amount` et `balance_due` sur `Invoice` permettent de calculer le solde en temps réel. La route `invoices.index.tsx` expose la vue des impayés avec filtrage par statut. La route `invoices.$invoiceId.tsx` affiche le détail complet avec l'historique des paiements.

**Détail de facture et navigation**
La route `invoices.new.tsx` permet la création de factures depuis le dossier patient. L'export PDF (US-FAC-02) est accessible depuis la vue détail.

### Écarts par rapport au cahier des charges

Le modèle `InvoiceLineItem` (lignes de prestation détaillées) identifié dans la dette technique §11.2 n'a pas encore été implémenté. Les factures actuelles portent un montant global (`subtotal`, `tax_amount`, `total_amount`) sans décomposition par ligne de prestation. Ce point est prioritaire pour la conformité comptable réelle.

---

## Sprint 8 — CNAM & Abonnements (Semaines 17-18)

*Livré en avance.*

**Objectif :** Gestion des dossiers de remboursement CNAM et des forfaits de traitement, conformément aux **US-CNAM-01/02**, **US-ABO-01/02** du §5.4 et §5.5 du cahier des charges.

### Ce qui a été réalisé

**Dossiers CNAM avec workflow d'instruction (US-CNAM-01)**
Le modèle `CNAMClaim` lie un patient à une facture avec le numéro de dossier CNAM (unique), le montant réclamé et les statuts En attente → Approuvée → Remboursée / Rejetée. Un dossier rejeté peut être contesté via un champ `motif_contestation`.

**Réconciliation CNAM (US-CNAM-02)**
À l'enregistrement d'un remboursement (`montant_rembourse` sur `CNAMClaim`), la facture liée est automatiquement mise à jour. Le solde patient est calculé par différence : `total_facture - remboursement_CNAM - paiements_directs`. La route `cnam.tsx` expose le tableau de bord CNAM avec les dossiers par statut.

**Catalogue de forfaits immuable (US-ABO-01/02)**
Le modèle `SubscriptionPlan` gère le catalogue (nom, prix mensuel, actif/inactif). Le modèle `SubscriptionChange` enregistre de façon immuable chaque changement de forfait patient (ancien forfait, nouveau forfait, date effective, raison, opérateur). Les raisons disponibles couvrent les cinq cas métier : Upgrade, Downgrade, Souscription initiale, Résiliation, Réactivation. La route `abonnements.tsx` expose l'historique complet par patient.

---

## Sprint 9 — Dashboard & BI (Semaines 19-20)

*Livré en avance.*

**Objectif :** Tableaux de bord KPI en temps réel par rôle, conformément aux **US-DAS-01/02** du §7 du cahier des charges.

### Ce qui a été réalisé

**Dashboard consolidé (US-DAS-01)**
La vue `DashboardSummaryView` agrège en un seul appel API les KPI de tous les modules : patients actifs, séances du jour, tickets ouverts, plans de traitement actifs, factures impayées, congés en attente. La route `dashboard.tsx` affiche ces KPI avec widgets cliquables redirigeant vers les listes filtrées correspondantes.

**KPI SLA en temps quasi-réel**
L'endpoint `/api/crm/tickets/sla-summary/` alimente le widget SLA du dashboard : tickets ouverts, en violation, en alerte, taux de violation sur 30 jours. Ce widget met en évidence visuellement les violations critiques — conforme à *"Les indicateurs critiques sont mis en évidence visuellement"*.

**Analytics et rapports (US-DAS-02)**
La route `analytics.tsx` offre les graphiques d'évolution mensuelle. La route `reports.tsx` expose les rapports exportables. La route `historique.tsx` donne accès au journal d'audit filtré par module et période.

### Écarts par rapport au cahier des charges

Le dashboard est actuellement identique pour tous les rôles (les données sont filtrées côté API par les permissions, mais l'affichage des widgets n'est pas encore adapté par rôle). La personnalisation visuelle par rôle (agent support voit les tickets, comptable voit les factures) est à implémenter dans un prochain cycle.

---

## Sprint 10 — Portail Patient (Semaines 21-22)

*Livré en avance.*

**Objectif :** Interface self-service pour les patients — suivi des demandes sans passer par le standard — conformément aux **US-POR-01/02** du §8 du cahier des charges.

### Ce qui a été réalisé

**Portail de suivi des tickets (US-POR-01)**
Deux endpoints publics (sans authentification JWT) permettent aux patients de :
- `POST /api/crm/portal/tickets/submit/` — créer un ticket lié à leur dossier
- `GET /api/crm/portal/tickets/status/` — consulter le statut de leurs tickets par numéro de ticket

La séparation public/authentifié garantit qu'un patient ne peut accéder qu'à ses propres données.

**Portail réclamations**
Les endpoints miroirs `/api/crm/portal/complaints/submit/` et `/api/crm/portal/complaints/status/` offrent le même service pour les réclamations formelles.

**Interface portail**
La route `portal.tsx` consolide le self-service patient : soumission de ticket/réclamation, consultation du statut, affichage des réponses agents.

### Écarts par rapport au cahier des charges

La consultation des rendez-vous depuis le portail (US-POR-02) et les notifications email automatiques 24h avant les rendez-vous ne sont pas encore implémentées. L'app `messaging` expose un modèle `Notification` mais l'envoi d'emails transactionnels (SMTP) n'est pas encore configuré.

---

## Bilan de la dette technique

| Point de dette (§11 CDC) | Statut | Sprint cible |
|--------------------------|--------|--------------|
| CORS ouvert | ✅ Corrigé Sprint 0 | — |
| DEBUG = True par défaut | ✅ Corrigé Sprint 0 | — |
| IsAuthenticatedOrReadOnly global | ✅ Corrigé Sprint 1 | — |
| Token sans expiry | ✅ Corrigé Sprint 0 (JWT) | — |
| Auth token dans localStorage | ⚠️ Partiel | Sprint 11 |
| Pas de rate limiting login | ✅ Corrigé Sprint 1 | — |
| SQLite en Docker | ✅ Corrigé Sprint 0 | — |
| Pas de InvoiceLineItem | ❌ Non corrigé | Sprint 11 |
| Machine/Room en CharField libre | ❌ Non corrigé | Sprint 11 |
| Pas de modèle Notification | ✅ App messaging créée | — |
| Dose cumulée non validée | ✅ Corrigé Sprint 3 | — |
| board.tsx sans backend | ✅ Corrigé Sprint 4 | — |
| calendar.tsx en 2024 | ✅ Corrigé Sprint 6 | — |
| Pagination sans UI | ⚠️ Partiel (page_size=200) | Sprint 11 |
| N+1 queries DashboardSummaryView | ⚠️ Agrégées mais non mises en cache | Sprint 11 |

---

## Flux inter-modules implémentés

Le §9 du cahier des charges définit 15 flux inter-modules automatiques. Voici leur état :

| Flux | Implémenté | Mécanisme |
|------|-----------|-----------|
| Plan activé → brouillon de facture | ⚠️ Partiel | Manuel depuis le dossier patient |
| Séance manquée → ticket de suivi | ❌ À faire | Signal post-save à ajouter |
| Dose 90% → notification médecin | ✅ | ValidationError avec message explicite |
| Plan complété → facturation finale | ⚠️ Partiel | Auto-complétion du plan, facture manuelle |
| Absence → alerte séances assignées | ❌ À faire | Signal à connecter |
| Congé approuvé → blocage planning | ⚠️ Visuel | Employé absent visible, pas de FK bloqueante |
| Avance approuvée → paiement sortant | ❌ À faire | Lien accounting manquant |
| Facture émise → note dossier patient | ❌ À faire | Signal post-save à ajouter |
| Paiement reçu → statut facture | ✅ | `refresh_payment_status()` auto |
| CNAM remboursée → solde patient | ✅ | Calcul `balance_due` en temps réel |
| Impayé > 60j → alerte dashboard | ❌ À faire | Query à ajouter au dashboard |
| Ticket Critique → notification superviseur | ⚠️ SLA engine | check_sla toutes 15min, pas de SMS |
| SLA violé → badge dashboard | ✅ | `sla_breached`, endpoint sla-summary |
| Ticket résolu → notification portail | ❌ À faire | Email transactionnel non configuré |
| Utilisateur désactivé → session révoquée | ✅ | Logout + token JWT révoqué |

---

## Prochaines étapes — Sprints 11 & 12

### Sprint 11 — Qualité & Tests

Priorités identifiées :

**Dette technique critique :**
- Implémenter `InvoiceLineItem` pour la décomposition détaillée des factures
- Migrer `Machine` et `Room` vers des modèles FK pour permettre la gestion centralisée du parc et fiabiliser la détection de conflits
- Configurer l'envoi d'emails transactionnels (SMTP) pour activer les notifications automatiques

**Flux inter-modules manquants :**
- Signal post-save sur `TreatmentSession.status = "missed"` → création automatique d'un ticket de suivi
- Signal sur approbation d'avance → création d'un paiement sortant en comptabilité
- Alerte impayé > 60 jours sur le dashboard

**Tests :**
- Couverture backend ≥ 80% sur chaque app (objectif §12.2)
- Tests d'intégration des flux inter-modules
- Validation des performances API (< 300ms P95)

### Sprint 12 — Documentation & Déploiement

- Documentation API Swagger/OpenAPI complète
- Manuel utilisateur par rôle
- Configuration production (HTTPS, variables d'environnement, backups PostgreSQL automatiques)
- Pipeline CI/CD avec build Docker Linux x86_64 vérifié

---

*Document généré en Août 2026 — à mettre à jour après chaque sprint terminé.*

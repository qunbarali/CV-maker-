# similiaOS

**Commercial proprietary clinical workflow and decision-support application — Version 1.0.4**

> **PRIVATE COMMERCIAL SOFTWARE — NOT OPEN SOURCE**

similiaOS is a clinic application built around local SQLite storage, Firebase authentication/synchronization, clinical case-taking workflows, anatomy resources, AI-assisted analysis, prescription/document generation, OCR/PDF tooling and a separate commercial activation system.

## Commercial status

This project is intended to be **sold through activation/license credentials**.

A customer purchases permission to use the compiled application under the activation and applicable commercial agreement. A customer does not receive source-code ownership, GitHub repository access, redistribution rights, activation-sharing rights, permission to bypass activation, or permission to copy proprietary knowledge assets.

See LICENSE, EULA.md, PRIVATE-REPO-POLICY.md and SECURITY.md.

## Repository confidentiality — mandatory

**The similiaOS repository must remain private at all times.**

The companion similiaOS_Activator repository (GitHub repository: AdminCodeGenerator) must also remain private because it contains the commercial activation/licensing workflow.

GitHub describes private repositories as accessible to the owner and people explicitly granted access. A license file does not control GitHub visibility; repository visibility is a GitHub setting. Review that setting regularly. citeturn0search5turn0search3

## Two-repository commercial architecture

### similiaOS
The main licensed application. It contains the clinic UI, patient/case workflows, SQLite database, examination/vitals, anatomy integration, AI-assisted analysis, prescription/documents, OCR/PDF support and Firebase authentication/sync.

### similiaOS_Activator
The private administrative licensing application (GitHub repository: AdminCodeGenerator). It contains activation-code generation, customer/license records, expiry management, username/account binding, HWID/device binding and Firebase license administration.

**Do not distribute AdminCodeGenerator to ordinary customers.**

## Commercial license model

Each activation can represent:
- customer or username;
- activation code;
- edition/features;
- issue date;
- expiry date;
- maximum devices;
- HWID/device binding;
- active/revoked/expired status;
- Firebase owner UID linkage where enabled;
- audit timestamps.

The existing activation signatures, expiry handling, username binding, HWID logic, recovery compatibility and Firebase license records are compatibility-sensitive and must not be casually redesigned.

## Suggested commercial editions

The activation system can support commercial entitlements such as:

**Clinic Standard** — core clinic workflow, SQLite records, case taking, diagnosis workflow and prescriptions.

**Clinic Professional** — Standard plus advanced anatomy, expanded knowledge/AI resources, advanced documents and additional workflow features.

**Multi-Device / Multi-Clinic** — entitlement based on a defined device or clinic allowance.

Prices and entitlements should be maintained in commercial documentation rather than hard-coded into the source.

## Activation lifecycle

1. Customer purchases a license.
2. Administrator creates the license record.
3. Admin Code Generator issues the activation credential.
4. Customer activates the application.
5. The application validates activation and device/account conditions.
6. Existing local/offline license behavior remains available where implemented.
7. Firebase synchronization maintains cloud-side state when authorized and online.
8. Expiry, revocation, device limits and account binding follow the license implementation.

## Security principle

Do not put Admin Code Generator master/signing secrets into the distributed Homeopathic Clinic application.

Client-side license verification can be reverse engineered by a determined attacker. The licensing system should therefore be treated as a commercial client-license mechanism, not an unbreakable security boundary.

A future server-side verification service can protect sensitive license decisions while preserving an offline grace period.

## Firebase and licensing

Do not weaken authenticated ownership rules, license-user authorization, admin-only license operations, Firebase Authentication persistence, owner UID linkage or Firestore default-deny behavior.

Never commit Firebase service-account/private credentials or activation signing secrets.

## Data architecture

SQLite remains the local application data layer.

The reliability model is:

User action -> SQLite/local state -> sync outbox -> Firebase when authorized/online -> retry/replay.

Version 1.0.4 adds sync status, retry/backoff, idempotent sync protocol, conflict records, failed-sync replay, SQLite integrity checking, redacted diagnostics, case-draft persistence and analysis provenance.

## Clinical workflow

Version 1.0.4 includes or preserves autosaved case drafts, patient continuity/timeline data, structured examination, vitals, visit states, case templates, anatomy findings, AI-assisted analysis and analysis provenance.

Clinical information is sensitive. Production deployments should use strong account passwords, device security, controlled backups, appropriate access permissions and legally appropriate privacy procedures.

## AI and knowledge governance

Knowledge resources are versioned and checked for integrity.

Version 1.0.4 adds knowledge-pack validation, SHA-256 integrity manifests, analysis input/result hashes, deterministic regression fixtures and engine/knowledge version metadata.

AI output remains decision support. A qualified healthcare professional must review clinical information and make the final clinical decision.

## Professional documents

The document subsystem supports prescription templates, clinic branding, isolated print documents, PDF fallback/export paths, document numbering and audit metadata.

The browser application's full UI should not be printed as the prescription.

## Backup and recovery

Before commercial release, test SQLite integrity, backup/restore, recovery-token workflow, offline operation, reconnect/synchronization, failed-sync replay, license recovery and device/HWID behavior.

## Release verification

Run:

npm install
npm run verify:all
npm run verify:release
npm run build

Then run the actual Windows and Android workflows.

Required commercial tests include startup, SQLite, registration, login, activation, expiry, HWID/device limits, recovery, Firebase restoration, Firebase sync, offline/reconnect/retry, conflicts, prescription printing, PDF export, anatomy/OCR assets, knowledge integrity, AI regression and backup/restore.

## GitHub Actions

Workflows are intentionally manual-only to prevent unwanted build/email traffic.

Do not add push-triggered release workflows, pull-request build storms, scheduled workflows or automatic activation-code generation.

## Versioning

Current baseline: **1.0.4**

GitHub main is the authoritative source for current development.

Historical v6/v7 snapshots are not the current version baseline.

## Source-code licensing

This is proprietary software, not open-source software. GitHub notes that a software license determines what others may and may not do with code; this project uses a proprietary license rather than an open-source license. citeturn0search0

The commercial customer license grants application-use rights only. It does not transfer intellectual property ownership or repository rights.

## Distribution rule

Public distribution should be limited to the compiled customer application and legitimate runtime dependencies.

Never publish source archives, AdminCodeGenerator, internal signing keys, private Firebase credentials, customer/license databases, patient databases, internal diagnostic logs or proprietary source datasets that are not licensed for redistribution.

## Commercial records

Maintain a separate commercial record for each customer containing, as appropriate, customer/business name, order/invoice identifier, purchased edition, activation identifier, issue/expiry dates, device allowance, support/update entitlement, refund/cancellation status and activation/revocation history.

Do not put customer payment information or unnecessary personal data into the source repository.

## Support and updates

Commercial support should distinguish bug fixes, security fixes, feature upgrades, knowledge-pack updates, platform compatibility updates and paid major upgrades.

Do not promise perpetual updates unless that is part of the customer's purchase agreement.

## Medical/legal notice

This documentation is an engineering/product baseline and is not jurisdiction-specific legal advice. Before commercial launch, have qualified counsel review the final EULA, refund/cancellation terms, taxes/invoicing, consumer protection, privacy/data-processing terms, medical software obligations, warranty language and enforceability of activation restrictions.

## Current release

**similiaOS 1.0.4 — Commercial Private Release**

The source repository and Admin Code Generator are confidential commercial assets. Customer activation grants application-use rights only; it does not grant repository or source-code rights.

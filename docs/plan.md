# Plan de développement — tranches verticales

Ordre par dépendance. Chaque tranche est testable et se termine par un commit. Coche les cases au fur et à mesure. Ne pas démarrer une tranche sans avoir lu la spec et les règles associées.

## Tranche 0 — Fondations
- [ ] Dépôt git initialisé, kit de démarrage en place, premier commit.
- [ ] `backend/` scaffoldé (NestJS), connexion PostgreSQL OK.
- [x] `vitrine/`, `admin/`, `portal/` scaffoldés (Next.js / Vite+React+shadcn).
- [ ] Swagger/OpenAPI activé côté backend ; génération du client TS côté fronts vérifiée sur un endpoint bidon.

## Tranche 1 — Modèle de données (réf. spec §8)
- [x] Schéma PostgreSQL : Affilie, Pack, NoeudArbre, GrandLivreBV, Ecard, Commission, RunCommission, Produit, Commande, AdminUser, Parametre, JournalAudit.
- [x] Choix ORM tranché (Prisma ou TypeORM) — noter dans backend/CLAUDE.md.
- [x] Migrations + seed minimal (packs par défaut, 1 admin).

## Tranche 2 — Authentification (réf. D-011)
- [x] Connexion email / téléphone / code membre + mot de passe, récupération de mot de passe.
- [x] RBAC admin (super-admin / gestionnaire / support).
- [x] Tests auth.

## Tranche 3 — Grand livre BV (réf. rules/bv-ledger.md)
- [x] Service de mouvements BV atomiques, solde jamais négatif.
- [x] Ajustement admin tracé.
- [x] **Tests d'invariants** (voir la règle).

## Tranche 4 — Inscription, placement, cycle de vie (réf. rules/inscription-placement.md, rules/tree.md)
- [x] Formulaire d'inscription (sponsor + upline + jambe), code auto-incrémenté, état INSCRIT, placement définitif.
- [x] Transition INSCRIT → ACTIF (activation structurelle : snapshot du pack, débit BV, propagation du palier à tous les ancêtres).
- [x] Baseline figée à l'activation.
- [x] Verrou de concurrence sur une position (contrainte DB `@@unique([uplineId, leg])`) + ordre de verrouillage d'arbre (D-024).
- [x] Consultation de l'arbre (CTE récursive descendante, une requête).
- [x] Vérification d'identité : champs + upload local, non bloquante (D-018).
- [x] Seed du réseau d'amorçage : 7 comptes ACTIFS sur 3 niveaux (D-019).
- [x] Tests placement + baseline (16 tests d'intégration + unitaires).
- [ ] **Reporté** : transition ACTIF → INACTIF (renouvellement annuel validé par l'admin, §5.9). Le montant `annual_renewal_bv` est encore « à confirmer avec la cliente » : l'implémenter reviendrait à inventer une règle. À traiter avec le back-office (Tranche 8).
- [ ] **Reporté** : tests de charge de l'arbre (D-014).

## Tranche 5 — E-cards (réf. rules/ecard.md)
- [x] Création plafonnée, format, états, expiration paramétrable (cron quotidien), remboursement créateur.
- [x] Consommation atomique (activation par e-card, `ActivationPayment` — D-025) + rate-limiting sur la vérification.
- [x] Génération admin (amorçage/promo, SUPER_ADMIN) + révocation + prolongation (D-026).
- [x] Tests e-card (unit + int : rollback, concurrence, conservation de la masse BV).

## Tranche 6 — Boutique & activation (réf. spec §5.6, §5.7)
- [x] Produits (prix DT + valeur BV, type physique/virtuel, stock, livraison, promo).
- [x] Panier + checkout activation (palier exact, paiement e-card).
- [x] Achat libre (sans effet arbre).
- [x] Commandes + statuts d'expédition.

## Tranche 6.5 — Refactor d'unité monétaire (réf. D-028, D-029)
- [x] Modèle à deux dimensions : POINTS (`Int`) pour palier + arbre ; DINARS (`Decimal(12,3)`) pour tout l'argent. Aucune conversion.
- [x] Schéma + migration en place (rename/cast, `BvLedgerEntry→LedgerEntry`, `…Bv→…Dt` monétaires), `src/common/money.ts`.
- [x] Services : grand livre, e-cards (valeur DT), checkout (`dueDt` = prix du pack en activation, Σ prix DT en libre), activation (paie le prix, propage le palier en points), endpoints admin.
- [x] Seed recalé sur la table cliente (paliers points / prix + plan de rémunération DT).
- [x] Vérifié : aucune conversion points↔dinars dans le code.
- [x] Docs (spec §5.1/§6, decisions D-028/D-029 + révision D-002 + point ouvert e-card, rules, CLAUDE.md) ; tests des 2 suites adaptés (build OK, typecheck 0, migrate status propre, 126 unit + 63 int verts).

## Tranche 7 — Moteur de commissions (réf. rules/commission-engine.md) — LE joyau
- [x] Temps 1 (D-035) : événements écrits au fil de l'eau à l'activation — équilibres (consommation immédiate, carry-over en réserve), bonus de démarrage (D-031, annule D-012), Points Fidélité du 6e équilibre (D-032), éligibilité à l'instant (D-034), snapshot.
- [x] Temps 2 : cron hebdo (vendredi 23:59 Tunis), plafond chronologique (D-033, paiement partiel au franchissement), crédit grand livre + Points Fidélité, run journalisé (supervision UI en T8), idempotence par réclamation.
- [x] Gel / réactivation — partie moteur (D-034) : `RenewalService`, nouvelle baseline, carry-over conservé (circuit admin 100 DT en T8).
- [x] **Tests de scénarios déterministes** (voir la règle) — bloquant. (149 unit + 76 int verts.)

## Tranche 8 — Back-office admin (réf. spec §7.2) — 12 modules
- [ ] Dashboard, membres, généalogie, packs, produits, commandes.
- [ ] Moteur de commissions (supervision), soldes BV, e-cards, rapports, paramètres, RBAC.

## Tranche 9 — Portail affilié (réf. spec §7.1)
- [ ] Dashboard, e-cards, achat/activation, arbre, downlines, profil.

## Tranche 10 — Site vitrine (réf. spec §7.3)
- [ ] Pages (accueil, produits, galerie, qui-sommes-nous, contact), SEO, footer conformité.

## Transverse (à ne pas oublier)
- [ ] i18n dès le départ (FR ; préparer AR/RTL).
- [ ] Journal d'audit sur les actions sensibles.
- [ ] Sauvegardes PostgreSQL.

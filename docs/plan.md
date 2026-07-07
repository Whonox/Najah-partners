# Plan de développement — tranches verticales

Ordre par dépendance. Chaque tranche est testable et se termine par un commit. Coche les cases au fur et à mesure. Ne pas démarrer une tranche sans avoir lu la spec et les règles associées.

## Tranche 0 — Fondations
- [ ] Dépôt git initialisé, kit de démarrage en place, premier commit.
- [ ] `backend/` scaffoldé (NestJS), connexion PostgreSQL OK.
- [ ] `vitrine/`, `admin/`, `portal/` scaffoldés (Next.js / Vite+React+shadcn).
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

## Tranche 4 — Inscription, placement, cycle de vie (réf. rules/inscription-placement.md)
- [ ] Formulaire d'inscription (sponsor + upline + jambe), code auto-incrémenté, état INSCRIT, placement définitif.
- [ ] Machine à états INSCRIT → ACTIF → INACTIF (pas d'expiration).
- [ ] Baseline figée à l'activation.
- [ ] Verrou de concurrence sur une position.
- [ ] Tests placement + baseline.

## Tranche 5 — E-cards (réf. rules/ecard.md)
- [ ] Création plafonnée, format, états, expiration paramétrable, remboursement créateur.
- [ ] Consommation atomique + rate-limiting sur la validation.
- [ ] Génération admin (amorçage/promo).
- [ ] Tests e-card.

## Tranche 6 — Boutique & activation (réf. spec §5.6, §5.7)
- [ ] Produits (prix DT + valeur BV, type physique/virtuel, stock, livraison, promo).
- [ ] Panier + checkout activation (palier exact, paiement e-card).
- [ ] Achat libre (sans effet arbre).
- [ ] Commandes + statuts d'expédition.

## Tranche 7 — Moteur de commissions (réf. rules/commission-engine.md) — LE joyau
- [ ] Cron hebdo (vendredi 23:59 Tunis), run + supervision.
- [ ] Cycles équilibrés, bonus de démarrage, carry-over, plafond, snapshot.
- [ ] **Tests de scénarios déterministes** (voir la règle) — bloquant.

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

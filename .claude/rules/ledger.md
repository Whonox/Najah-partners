# Règle — Grand livre (invariants)

> Source : `docs/spec.md` §5.1, §8 ; décisions **D-028** (modèle à deux dimensions), D-025, D-017.

Le grand livre est la comptabilité interne — le journal des **SOLDES**, donc des **DINARS**
(D-028). Chaque mouvement est tracé, jamais silencieux. Il ne connaît que l'argent : les
**points** de l'arbre ne sont pas un avoir, ils n'entrent jamais ici.

## Unité (D-028)
- Tous les montants du grand livre sont en **DT** (`Decimal(12,3)`, le millime) : `amountDt`
  (signé), `balanceAfterDt`, `Member.balanceDt`. Le nommage reflète la décision : `LedgerEntry`,
  `LedgerMovementType`, `LedgerService` (plus aucun préfixe `Bv…` sur ce qui est monétaire).
- Un montant plus fin que le millime est **refusé** (Postgres l'arrondirait en silence). Les
  soldes verrouillés sont relus en `::text` puis reconstruits en `Decimal` : jamais de flottant.

## Invariants
- Un solde ne devient **jamais négatif** (vérifié sous verrou + CHECK `Member_balance_dt_ck`).
- **Création d'e-card** = débit du solde du créateur, du montant exact (en DT) de l'e-card.
- **Utilisation d'e-card** = **AUCUN mouvement de solde** (D-025). L'e-card est un instrument de paiement consommé au point de transaction, pas une recharge : sa valeur paie le montant dû, elle ne transite jamais par le solde du bénéficiaire. Le grand livre est le journal des SOLDES — aucun solde ne bouge, donc il n'écrit rien. La trace de la consommation vit dans l'`Ecard` (`USED`, `usedAt`, `userId`) et l'`AuditLog`. **Il n'existe pas de `ECARD_USE`** dans `LedgerMovementType` : la valeur a été supprimée de l'enum pour rendre le retour au modèle recharge impossible.
- **Expiration / révocation d'e-card** = recrédit du créateur (`ECARD_REFUND`). Sauf e-card de **genèse** (sans créateur) : personne à rembourser.
- **Activation réglée sur le solde** = débit `ACTIVATION` du **prix du pack** en DT (D-029) — voie seed/tests uniquement (la voie réelle est l'e-card, qui ne touche aucun solde).
- **Commission** = crédit (en DT) issu d'un run, avec snapshot des paramètres.
- **Ajustement admin** = mouvement tracé avec motif obligatoire.
- Toute opération touchant un solde est **atomique** (transaction base de données) : jamais de débit sans le crédit correspondant.

## Chaque ligne de mouvement enregistre
`memberId, type, amountDt (signé), reference (ecard/commission/ajustement/activation), balanceAfterDt, date`.

## Tests attendus
- Somme des mouvements d'un membre = son solde courant.
- Impossible de débiter en dessous de zéro (dont concurrence : 5 débits simultanés → exactement N passent).
- Un montant au millime (3 décimales) est écrit exactement, sans arrondi.
- Un flux e-card complet (créer → transférer → utiliser) conserve la masse **en DT** : le créateur est débité une fois, le bénéficiaire n'est jamais crédité, la valeur est consommée en payant.
- Rollback : une transaction interrompue ne laisse aucun mouvement partiel.

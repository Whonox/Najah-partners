# Règle — Grand livre BV (invariants)

> Source : `docs/spec.md` §5.1, §8 (entités GrandLivreBV, Ecard, Commission).

Le grand livre BV est la comptabilité interne. Chaque mouvement est tracé, jamais silencieux.

## Invariants
- Un solde BV ne devient **jamais négatif**.
- **Création d'e-card** = débit du solde du créateur, du montant exact de l'e-card.
- **Utilisation d'e-card** = **AUCUN mouvement de solde** (D-025). L'e-card est un instrument de paiement consommé au point de transaction, pas une recharge : sa valeur paie le montant dû, elle ne transite jamais par le solde du bénéficiaire. Le grand livre est le journal des SOLDES — aucun solde ne bouge, donc il n'écrit rien. La trace de la consommation vit dans l'`Ecard` (`USED`, `usedAt`, `userId`) et l'`AuditLog`. **Il n'existe pas de `ECARD_USE`** dans `BvMovementType` : la valeur a été supprimée de l'enum pour rendre le retour au modèle recharge impossible.
- **Expiration / révocation d'e-card** = recrédit du créateur (`ECARD_REFUND`). Sauf e-card de **genèse** (sans créateur) : personne à rembourser.
- **Commission** = crédit issu d'un run, avec snapshot des paramètres.
- **Ajustement admin** = mouvement tracé avec motif obligatoire.
- Toute opération touchant un solde est **atomique** (transaction base de données) : jamais de débit sans le crédit correspondant.

## Chaque ligne de mouvement enregistre
`affilie_id, type_mouvement, montant_bv, reference (ecard/commission/ajustement/activation), solde_apres, date`.

## Tests attendus
- Somme des mouvements d'un membre = son solde courant.
- Impossible de débiter en dessous de zéro.
- Un flux e-card complet (créer → transférer → utiliser) conserve la masse BV totale : le créateur est débité une fois, le bénéficiaire n'est jamais crédité, la valeur est consommée en payant.
- Rollback : une transaction interrompue ne laisse aucun mouvement partiel.

# Règle — Grand livre BV (invariants)

> Source : `docs/spec.md` §5.1, §8 (entités GrandLivreBV, Ecard, Commission).

Le grand livre BV est la comptabilité interne. Chaque mouvement est tracé, jamais silencieux.

## Invariants
- Un solde BV ne devient **jamais négatif**.
- **Création d'e-card** = débit du solde du créateur, du montant exact de l'e-card.
- **Utilisation d'e-card** = crédit du solde du bénéficiaire (ou consommation à l'activation), montant exact.
- **Expiration / révocation d'e-card** = recrédit du créateur.
- **Commission** = crédit issu d'un run, avec snapshot des paramètres.
- **Ajustement admin** = mouvement tracé avec motif obligatoire.
- Toute opération touchant un solde est **atomique** (transaction base de données) : jamais de débit sans le crédit correspondant.

## Chaque ligne de mouvement enregistre
`affilie_id, type_mouvement, montant_bv, reference (ecard/commission/ajustement/activation), solde_apres, date`.

## Tests attendus
- Somme des mouvements d'un membre = son solde courant.
- Impossible de débiter en dessous de zéro.
- Un flux e-card complet (créer → transférer → utiliser) conserve la masse BV totale.
- Rollback : une transaction interrompue ne laisse aucun mouvement partiel.

# Règle — E-cards

> Source : `docs/spec.md` §5.5, §9.2.

- **Format** : `XXX-XXX-XXX-XXX` (4 groupes de 3 caractères alphanumériques, ex. `HHD-7Z7-JJD-77D`). Unicité garantie (régénérer en cas de collision). Génération aléatoire non prédictible. Distinct du code membre (`NP` + numéro auto-incrémenté).
- **Libellé en BV.** Une e-card porte une valeur en BV.
- **Création plafonnée** au solde BV disponible du créateur. La création **débite immédiatement** le solde et met l'e-card à `ACTIVE`.
- **Transférable, usage unique.** Transmise à un autre membre (cash réglé hors système). Brûlée (`USED`) après utilisation ; irréversible.
- **Couverture exacte** : un achat par e-card exige une valeur **égale exactement** au montant BV dû. Pas de trop-perçu, une seule e-card par transaction.
- **Expiration paramétrable** en jours ; `-1` = illimité. À `EXPIRED` (échéance) comme à `REVOKED` (révocation admin), le BV est **recrédité au créateur**. Action « prolonger » possible.
- **Genèse du réseau** : l'admin peut générer des e-cards (et du BV) pour amorcer le réseau et pour des promotions.

## Machine à états
`ACTIVE → USED` (achat) · `ACTIVE → EXPIRED` (échéance, rembourse le créateur) · `ACTIVE → REVOKED` (admin, rembourse le créateur). `USED` est définitif.

## Sécurité
Les codes = de la valeur : rate-limiting sur la validation (anti-brute-force), consommation atomique (l'e-card n'est brûlée que si l'achat aboutit entièrement ; un achat interrompu la laisse `ACTIVE`).

## Tests attendus
- Création > solde → refusée.
- Création puis achat exact → e-card `USED`, solde débité une seule fois.
- Achat avec valeur ≠ montant dû → refusé.
- Expiration/révocation → BV recrédité au créateur, e-card non réutilisable.

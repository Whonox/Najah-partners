# Règle — Arbre binaire : traversée et verrouillage

> Source : `docs/spec.md` §5.2, §8 ; décisions D-014, D-020, D-024. Établie en Tranche 4.

## Traversée : toujours ensembliste
- Remontée (activation) et descente (généalogie) se font en **CTE récursive SQL**, jamais en boucle applicative (D-014).
- Chaque requête récursive porte un **garde-fou de profondeur** (`depth < 1000`) : une corruption de données ne doit pas produire une boucle infinie.
- Une propagation **tronquée qui committe** est une corruption comptable irréversible : le `RETURNING` de la remontée est compté et comparé au nombre d'ancêtres attendu ; tout écart → rollback.

## La jambe à créditer
Pour chaque nœud `N` du chemin (le membre activé inclus), on crédite `N.uplineId` sur **la jambe de `N`** — *pas* sur la jambe du membre activé. Crédit à tous les ancêtres jusqu'à la racine, quel que soit leur état (D-020).

## Verrouillage (D-024) — invariant inter-tranches
- **Toute** transaction touchant plusieurs lignes `Member` les verrouille **par `id` croissant, en une seule instruction**. L'ordre total commun rend le graphe d'attente acyclique : aucun interblocage possible. Un verrou pris hors de cette séquence (ex. le membre lui-même verrouillé avant ses ancêtres) suffit à réintroduire le deadlock.
- **`FOR NO KEY UPDATE`**, jamais `FOR UPDATE` : `FOR UPDATE` entre en conflit avec le `FOR KEY SHARE` que prend tout INSERT référençant le membre (login → `RefreshToken`, e-card, commande, inscription d'un filleul) et bloque donc des opérations sans rapport. `FOR NO KEY UPDATE` reste exclusif entre écrivains → l'invariant « solde jamais négatif » est préservé (vérifié par EXPLAIN : le plan porte bien un nœud `LockRows` sur `Member`).
- On **joint la table de base** `"Member" m` et on verrouille `FOR NO KEY UPDATE OF m` : c'est la jointure sur la table de base — pas les lignes matérialisées de la CTE — qui produit un verrou réel. Verrouiller la CTE (`FOR ... OF chain`) lève une erreur ; sélectionner *uniquement* depuis la CTE ne verrouille rien. Le `OF m` est donc à la fois explicite (on ne verrouille que `Member`) et un garde-fou si la requête gagne d'autres tables. *(Nuance mesurée sur PG 16 : pour cette forme de requête, un `FOR NO KEY UPDATE` nu verrouille tout de même `Member` ; `OF m` reste la bonne pratique, mais ce n'est pas lui, seul, qui empêche un « verrou silencieusement ignoré ».)*
- Ordre inter-tables à respecter quand les deux sont touchées : `Member` (id croissant) → `Ecard` → `Order`.

## Tests attendus
- Chaîne à jambes mixtes : un membre en jambe gauche d'un upline lui-même en jambe droite → l'ancêtre est crédité **à droite**.
- Deux activations concurrentes partageant un ancêtre : l'ancêtre reçoit **exactement la somme** des deux paliers, et aucune des deux transactions n'échoue.
- `EXPLAIN` de la requête de verrou : le plan contient un nœud `LockRows`.

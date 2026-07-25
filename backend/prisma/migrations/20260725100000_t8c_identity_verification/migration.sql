-- Tranche 8c — Traçabilité de la vérification d'identité (D-018, D-039).
--
-- Ce que cette migration acte : la vérification d'identité, en attente depuis la Tranche 4,
-- devient une ACTION D'ADMINISTRATION et non plus un simple état par défaut. Une action a un
-- auteur, une date, et — quand elle refuse — un motif.
--
-- Ce qu'elle ne change PAS : la vérification reste NON BLOQUANTE. Aucune de ces colonnes n'est
-- lue par l'inscription, l'activation, le moteur de commissions ou le renouvellement. Un membre
-- PENDING ou REJECTED fonctionne exactement comme un membre VERIFIED — le badge informe, il
-- n'interdit rien.

ALTER TABLE "Member" ADD COLUMN "verificationReason" TEXT;
ALTER TABLE "Member" ADD COLUMN "verificationAt" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN "verificationByAdminId" INTEGER;

ALTER TABLE "Member" ADD CONSTRAINT "Member_verificationByAdminId_fkey"
  FOREIGN KEY ("verificationByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Member_verificationByAdminId_idx" ON "Member"("verificationByAdminId");

-- Un motif n'existe QUE pour un rejet. Le rejet sans motif est le cas nuisible (le membre ne
-- saurait pas quoi corriger) ; le motif conservé après une validation ultérieure est le cas
-- trompeur (un « vérifié » qui traîne une critique). La contrainte interdit les deux, plutôt que
-- de faire confiance à chaque appelant présent et futur.
ALTER TABLE "Member" ADD CONSTRAINT "Member_verification_reason_ck" CHECK (
  ("verificationStatus" = 'REJECTED' AND "verificationReason" IS NOT NULL)
  OR ("verificationStatus" <> 'REJECTED' AND "verificationReason" IS NULL)
);

-- Statuer, c'est toujours « qui » ET « quand » : l'un sans l'autre est une trace inutilisable.
ALTER TABLE "Member" ADD CONSTRAINT "Member_verification_author_ck" CHECK (
  ("verificationAt" IS NULL) = ("verificationByAdminId" IS NULL)
);

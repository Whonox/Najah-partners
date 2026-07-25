import type { ReactNode } from "react"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import { ArrowLeft, GitFork, Info, Wallet } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  memberLedgerQueryOptions,
  memberQueryOptions,
  type MemberDetail,
  type MemberRef,
} from "@/api/queries/members"
import { DataState } from "@/components/common/data-state"
import { Pagination, TableShell } from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import {
  MemberStatusBadge,
  VerificationBadge,
} from "@/components/common/status-badge"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { IdDocumentViewer } from "./id-document-viewer"

/**
 * Fiche membre (spec §7.2.2). CONSULTATION : rien ne s'écrit depuis cet écran.
 *
 * La fiche est organisée autour de la distinction qui structure tout le modèle (D-028) :
 *  — l'onglet « Position dans l'arbre » ne parle QUE de points (entiers, `PointsBv`) ;
 *  — l'onglet « Mouvements de solde » ne parle QUE de dinars (`MoneyDt`, 3 décimales).
 * Aucun encart ne mélange les deux, et aucun ne propose de convertir l'un en l'autre.
 *
 * Le second piège qu'elle doit désamorcer est la confusion sponsor / upline de placement :
 * les deux liens sont présentés côte à côte, nommés en toutes lettres, avec la phrase qui
 * dit à quoi chacun sert.
 */
export function MemberDetailPage() {
  const t = useT()
  const params = useParams()
  const memberId = Number(params.memberId)
  const query = useQuery(memberQueryOptions(memberId))

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ms-2" nativeButton={false}
              render={<Link to="/members" />}>
        <ArrowLeft />
        {t("members.title")}
      </Button>

      <DataState
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        rows={6}
      >
        {query.data ? <MemberDetailView member={query.data} /> : null}
      </DataState>
    </div>
  )
}

function MemberDetailView({ member }: { member: MemberDetail }) {
  const t = useT()

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${member.lastName} ${member.firstName}`}
        description={member.memberCode}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MemberStatusBadge status={member.status} />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to={`/genealogy?member=${member.id}`} />}
            >
              <GitFork />
              {t("member.action.genealogy")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to={`/orders?memberCode=${member.memberCode}`} />}
            >
              {t("member.action.orders")}
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity">{t("member.tab.identity")}</TabsTrigger>
          <TabsTrigger value="tree">{t("member.tab.tree")}</TabsTrigger>
          <TabsTrigger value="ledger">{t("member.tab.ledger")}</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-4">
          <IdentityTab member={member} />
        </TabsContent>

        <TabsContent value="tree" className="space-y-4">
          <TreeTab member={member} />
        </TabsContent>

        <TabsContent value="ledger" className="space-y-4">
          <LedgerTab member={member} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─────────────────────────── Onglet identité ───────────────────────────

function IdentityTab({ member }: { member: MemberDetail }) {
  const t = useT()

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={t("member.section.contact")}>
        <Field label={t("member.field.email")}>
          {member.email ?? t("common.none")}
        </Field>
        <Field label={t("member.field.phone")}>
          {member.phone ?? t("common.none")}
        </Field>
        <Field label={t("member.field.registeredAt")}>
          {formatDateTime(member.registeredAt)}
        </Field>
        <Field label={t("member.field.activatedAt")}>
          {member.activatedAt ? formatDateTime(member.activatedAt) : t("common.none")}
        </Field>
        <Field label={t("member.field.renewalAt")}>
          {member.renewalAt ? formatDateTime(member.renewalAt) : t("common.none")}
        </Field>
      </Section>

      <Section
        title={t("member.section.idDocument")}
        hint={t("member.hint.identity")}
      >
        <Field label={t("member.field.idType")}>
          {member.idDocumentType
            ? t(`idDocument.${member.idDocumentType}`)
            : t("common.none")}
        </Field>
        {/* D-039 : le numéro est SAISI À LA MAIN par le membre ; l'admin le compare à l'image
            ci-dessous. D'où le rendu en monospace, qui rend la comparaison chiffre à chiffre
            possible. */}
        <Field label={t("member.field.idNumber")}>
          <span className="font-mono">
            {member.idDocumentNumber ?? t("common.none")}
          </span>
        </Field>
        <Field label={t("member.field.verification")}>
          <VerificationBadge status={member.verificationStatus} />
        </Field>
        <IdDocumentViewer
          memberId={member.id}
          hasDocument={member.hasIdDocument}
        />
      </Section>

      <Section title={t("member.section.pack")} hint={t("member.hint.snapshot")}>
        <Field label={t("member.field.pack")}>
          {member.packName ?? t("common.none")}
        </Field>
        {/* POINTS : ce que l'ARBRE a reçu. Distinct du prix, en dinars, juste en dessous. */}
        <Field label={t("member.field.tier")}>
          {member.activationTierBv !== null &&
          member.activationTierBv !== undefined ? (
            <PointsBv value={member.activationTierBv} />
          ) : (
            t("common.none")
          )}
        </Field>
        {member.activationSnapshot ? (
          <>
            <Separator />
            <MoneyField
              label={t("packs.field.price")}
              value={member.activationSnapshot.priceDt}
            />
            <MoneyField
              label={t("member.field.registrationPaid")}
              value={member.activationSnapshot.registrationCreditDt}
            />
            <MoneyField
              label={t("orders.section.payment")}
              value={member.activationSnapshot.amountDueDt}
            />
            <MoneyField
              label={t("packs.column.direct")}
              value={member.activationSnapshot.directCommissionDt}
            />
            <MoneyField
              label={t("packs.column.indirect")}
              value={member.activationSnapshot.indirectCommissionDt}
            />
            <MoneyField
              label={t("packs.column.cap")}
              value={member.activationSnapshot.weeklyCapDt}
            />
          </>
        ) : null}
      </Section>

      <Section
        title={t("member.section.engine")}
        hint={t("member.hint.rewardPoints")}
      >
        <Field label={t("member.field.lifetimeBalances")}>
          <span className="tabular-nums">{member.lifetimeBalanceCount}</span>
        </Field>
        <Field label={t("member.field.startupBonus")}>
          {t(member.startupBonusUsed ? "common.yes" : "common.no")}
        </Field>
        {/* Points Fidélité : TROISIÈME unité (D-032). Ni `MoneyDt` ni `PointsBv` — les
            confondre avec l'une des deux autres serait exactement l'erreur à éviter. */}
        <Field label={t("member.field.rewardPoints")}>
          <span className="tabular-nums">{member.rewardPoints}</span>
        </Field>
        <Field label={t("member.field.activatedDescendants")}>
          <span className="tabular-nums">{member.activatedDescendants}</span>
        </Field>
      </Section>
    </div>
  )
}

// ─────────────────────── Onglet position dans l'arbre ───────────────────────

function TreeTab({ member }: { member: MemberDetail }) {
  const t = useT()

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section
        title={t("member.section.position")}
        hint={t("member.hint.sponsorVsUpline")}
      >
        {/* Les deux liens séparés par un trait : l'un rémunère (direct), l'autre place
            (binaire). Les empiler sans démarcation est la première source de confusion. */}
        <Field label={t("member.field.sponsor")}>
          <MemberLink member={member.sponsor} />
        </Field>
        <Separator />
        <Field label={t("member.field.upline")}>
          <MemberLink member={member.upline} />
        </Field>
        <Field label={t("member.field.leg")}>
          {member.leg
            ? member.leg === "LEFT"
              ? t("genealogy.legLeft")
              : t("genealogy.legRight")
            : t("common.none")}
        </Field>
        <Separator />
        <Field label={t("member.field.leftDownline")}>
          <MemberLink member={member.leftDownline} />
        </Field>
        <Field label={t("member.field.rightDownline")}>
          <MemberLink member={member.rightDownline} />
        </Field>
      </Section>

      <Section title={t("member.section.points")} hint={t("member.hint.points")}>
        {/* Tout cet encart est en POINTS — pas un dinar n'y figure (D-028). */}
        <PointsField
          label={t("member.field.leftPoints")}
          value={member.leftPoints}
        />
        <PointsField
          label={t("member.field.rightPoints")}
          value={member.rightPoints}
        />
        <Separator />
        <PointsField
          label={`${t("member.field.carried")} — ${t("genealogy.legLeft")}`}
          value={member.carriedLeftPoints}
        />
        <PointsField
          label={`${t("member.field.carried")} — ${t("genealogy.legRight")}`}
          value={member.carriedRightPoints}
        />
        <Separator />
        <PointsField
          label={`${t("member.field.baseline")} — ${t("genealogy.legLeft")}`}
          value={member.baselineLeft}
        />
        <PointsField
          label={`${t("member.field.baseline")} — ${t("genealogy.legRight")}`}
          value={member.baselineRight}
        />
      </Section>
    </div>
  )
}

// ──────────────────── Onglet mouvements de solde (DINARS) ────────────────────

function LedgerTab({ member }: { member: MemberDetail }) {
  const t = useT()
  const [page, setPage] = useState(1)
  const history = useQuery(memberLedgerQueryOptions(member.id, page))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title={t("member.field.balance")}>
          <Field label={t("member.field.balance")}>
            <MoneyDt value={member.balanceDt} />
          </Field>
          <Field label={t("member.field.registrationPaid")}>
            <MoneyDt value={member.registrationPaidDt} />
          </Field>
        </Section>

        {/* L'ajustement manuel existe côté backend, mais il appartient au module Soldes &
            mouvements : le dupliquer ici ferait deux chemins vers la même écriture tracée. */}
        <Section title={t("member.action.adjustBalance")}>
          <p className="text-sm text-muted-foreground">
            {t("member.action.adjustHint")}
          </p>
          <Button variant="outline" size="sm" nativeButton={false}
              render={<Link to="/ledger" />}>
            <Wallet />
            {t("nav.ledger")}
          </Button>
        </Section>
      </div>

      {/* L'explication « aucun mouvement, c'est normal » n'a de sens QUE s'il n'y en a
          effectivement aucun. Rendue en toutes circonstances, elle contredisait le tableau
          juste en dessous — sur un écran d'argent, c'est la crédibilité de l'écran entier qui
          tombe. On attend donc la réponse (`total` fait foi sur TOUTES les pages, là où
          `items` ne parle que de la page courante). */}
      {history.data && history.data.total === 0 ? (
        <Alert>
          <Info />
          <AlertDescription>{t("member.ledger.empty")}</AlertDescription>
        </Alert>
      ) : null}

      <DataState
        isLoading={history.isPending}
        error={history.error}
        isEmpty={history.data?.items.length === 0}
        onRetry={() => void history.refetch()}
        rows={5}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">
                  {t("member.ledger.column.date")}
                </TableHead>
                <TableHead className="w-44">
                  {t("member.ledger.column.type")}
                </TableHead>
                <TableHead className="w-36 text-end">
                  {t("member.ledger.column.amount")}
                </TableHead>
                <TableHead className="w-36 text-end">
                  {t("member.ledger.column.balanceAfter")}
                </TableHead>
                <TableHead>{t("member.ledger.column.reason")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.data?.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </TableCell>
                  <TableCell>{t(`ledgerType.${entry.type}`)}</TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={entry.amountDt} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={entry.balanceAfterDt} />
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {entry.reason ?? t("common.none")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {history.data ? (
        <Pagination
          page={history.data.page}
          pageSize={history.data.pageSize}
          total={history.data.total}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  )
}

// ─────────────────────────── Présentation ───────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {hint ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-2.5 text-sm">{children}</CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end font-medium">{children}</span>
    </div>
  )
}

/**
 * Un champ de DINARS — toujours par `MoneyDt` (3 décimales, unité DT). La valeur peut être
 * ABSENTE : un snapshot d'activation antérieur à D-028 n'a jamais figé de montant en dinars.
 * On affiche alors « — », et surtout pas un montant reconstruit depuis le pack courant, qui
 * serait faux par construction.
 */
function MoneyField({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <Field label={label}>
      <MoneyDt value={value} />
    </Field>
  )
}

/** Un champ de POINTS — toujours par `PointsBv` (entier, unité « pts »). */
function PointsField({ label, value }: { label: string; value: number }) {
  return (
    <Field label={label}>
      <PointsBv value={value} />
    </Field>
  )
}

function MemberLink({ member }: { member: MemberRef | null | undefined }) {
  const t = useT()
  if (!member) {
    return <span className="text-muted-foreground">{t("common.none")}</span>
  }
  return (
    <Link
      to={`/members/${member.id}`}
      className="text-primary underline-offset-4 hover:underline"
    >
      <span className="font-mono text-xs">{member.memberCode}</span>{" "}
      {member.lastName} {member.firstName}
    </Link>
  )
}

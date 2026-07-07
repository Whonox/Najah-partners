import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ── Packs (spec §6.1) — valeurs par défaut, paramétrables ensuite ──
  const packs = [
    { name: 'Silver', tierBv: 1000, refPriceDt: 2200, directCommissionBv: 500, indirectCommissionBv: 250, weeklyCapBv: 10000 },
    { name: 'Gold', tierBv: 2000, refPriceDt: 3350, directCommissionBv: 700, indirectCommissionBv: 400, weeklyCapBv: 16000 },
    { name: 'Safari', tierBv: 3000, refPriceDt: 5400, directCommissionBv: 900, indirectCommissionBv: 600, weeklyCapBv: 24000 },
    { name: 'Diamond', tierBv: 4000, refPriceDt: 8350, directCommissionBv: 1200, indirectCommissionBv: 900, weeklyCapBv: 36000 },
  ];
  for (const p of packs) {
    await prisma.pack.upsert({ where: { name: p.name }, update: p, create: p });
  }

  // ── Paramètres système (spec §7.2.11) ──
  const settings = [
    { key: 'startup_bonus_default', value: '6', description: 'Réserve de paliers de bonus de démarrage figée à l\'activation' },
    { key: 'ecard_expiration_days', value: '-1', description: 'Durée de validité des e-cards en jours (-1 = illimité)' },
    { key: 'annual_renewal_bv', value: '0', description: 'Valeur BV du renouvellement annuel (à confirmer avec la cliente)' },
    { key: 'commission_cron_day', value: 'FRIDAY', description: 'Jour de clôture du run hebdomadaire' },
    { key: 'commission_cron_time', value: '23:59', description: 'Heure de clôture (heure de Tunis)' },
    { key: 'commission_timezone', value: 'Africa/Tunis', description: 'Fuseau horaire des runs de commissions' },
    { key: 'member_code_prefix', value: 'NP', description: 'Préfixe du code membre auto-incrémenté' },
    { key: 'display_currency', value: 'DT', description: 'Devise d\'affichage (jamais transactionnelle)' },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: s, create: s });
  }

  // ── Compte admin initial (mot de passe à changer au premier login) ──
  const email = 'admin@najah.local';
  const passwordHash = await bcrypt.hash('ChangeMe123!', 10);
  await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: { name: 'Super Admin', email, passwordHash, role: 'SUPER_ADMIN' },
  });

  console.log(`Seed terminé : ${packs.length} packs, ${settings.length} paramètres, 1 admin (${email}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

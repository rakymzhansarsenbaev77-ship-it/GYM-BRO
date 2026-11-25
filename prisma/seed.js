import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const exercises = [
  ['Жим гантелей лёжа', 'Грудь', 'гантели'], ['Тяга верхнего блока', 'Спина', 'блок'],
  ['Присед с гантелью', 'Ноги', 'гантель'], ['Румынская тяга', 'Задняя поверхность бедра', 'штанга'],
  ['Планка', 'Кор', 'коврик'], ['Жим гантелей сидя', 'Плечи', 'гантели'],
];

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@eliteone.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe-OnlyForLocalDevelopment';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash: await bcrypt.hash(password, 12), role: Role.ADMIN },
  });
  for (const [name, muscleGroup, equipment] of exercises) {
    await prisma.exercise.upsert({ where: { name }, update: { muscleGroup, equipment }, create: { name, muscleGroup, equipment } });
  }
  console.log(`Seeded ${exercises.length} exercises and admin ${adminEmail}`);
}

main().finally(() => prisma.$disconnect());

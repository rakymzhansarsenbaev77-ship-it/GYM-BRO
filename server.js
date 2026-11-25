import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, Role, WorkoutStatus } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const sessionCookie = 'elite_session';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('JWT_SECRET is missing or too short. Set a unique 32+ character secret in .env before deployment.');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

const publicUser = (user) => ({ id: user.id, email: user.email, role: user.role });
const text = (value, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const numberOrNull = (value) => value === '' || value === undefined || value === null ? null : Number(value);
const dateOrNull = (value) => value ? new Date(value) : null;
const validDate = (value) => value instanceof Date && !Number.isNaN(value.valueOf());

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function setSession(res, user) {
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

async function attachUser(req, _res, next) {
  const token = req.cookies[sessionCookie];
  if (!token || !process.env.JWT_SECRET) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { clientProfile: true, trainerProfile: true },
    });
    if (user) req.auth = {
      userId: user.id,
      role: user.role,
      clientId: user.clientProfile?.id,
      trainerId: user.trainerProfile?.id,
      user,
    };
  } catch {
    // Invalid/expired tokens are intentionally treated as logged out.
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.auth) return fail(res, 401, 'Требуется авторизация.');
  next();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.auth) return fail(res, 401, 'Требуется авторизация.');
    if (!roles.includes(req.auth.role)) return fail(res, 403, 'Недостаточно прав доступа.');
    next();
  };
}

async function trainerClient(req, res, next) {
  const { clientId } = req.params;
  if (req.auth.role === Role.ADMIN) {
    const client = await prisma.clientProfile.findUnique({ where: { id: clientId } });
    if (!client) return fail(res, 404, 'Клиент не найден.');
    req.client = client;
    return next();
  }
  const client = await prisma.clientProfile.findFirst({ where: { id: clientId, trainerId: req.auth.trainerId } });
  if (!client) return fail(res, 404, 'Клиент не найден.'); // Do not disclose clients owned by another trainer.
  req.client = client;
  next();
}

const profileInclude = {
  user: { select: { id: true, email: true, role: true } },
  trainer: { include: { user: { select: { email: true } } } },
};

app.use(attachUser);

app.get('/api/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const email = text(req.body.email, 254).toLowerCase();
    const password = String(req.body.password || '');
    const firstName = text(req.body.firstName, 80);
    const lastName = text(req.body.lastName, 80);
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10 || !firstName || !lastName) {
      return fail(res, 400, 'Укажите имя, фамилию, корректный email и пароль не короче 10 символов.');
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail(res, 409, 'Пользователь с таким email уже существует.');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: Role.CLIENT,
        clientProfile: { create: { firstName, lastName } },
      },
      include: { clientProfile: true },
    });
    setSession(res, user);
    res.status(201).json({ user: publicUser(user), profile: user.clientProfile });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = text(req.body.email, 254).toLowerCase();
    const password = String(req.body.password || '');
    const user = await prisma.user.findUnique({ where: { email }, include: { clientProfile: true, trainerProfile: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return fail(res, 401, 'Неверный email или пароль.');
    }
    setSession(res, user);
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(sessionCookie, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' });
  res.status(204).end();
});

app.get('/api/auth/me', (req, res) => {
  if (!req.auth) return res.json({ user: null });
  res.json({ user: publicUser(req.auth.user) });
});

// Trainer accounts are deliberately provisioned by an administrator, never through public registration.
app.post('/api/admin/trainers', requireRoles(Role.ADMIN), async (req, res, next) => {
  try {
    const email = text(req.body.email, 254).toLowerCase();
    const password = String(req.body.password || '');
    const firstName = text(req.body.firstName, 80), lastName = text(req.body.lastName, 80);
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10 || !firstName || !lastName) return fail(res, 400, 'Укажите имя, фамилию, email и пароль не короче 10 символов.');
    const trainer = await prisma.trainerProfile.create({ data: {
      firstName, lastName, specialty: text(req.body.specialty, 250) || null, bio: text(req.body.bio, 3000) || null,
      user: { create: { email, passwordHash: await bcrypt.hash(password, 12), role: Role.TRAINER } },
    }, include: { user: { select: { id: true, email: true, role: true } } } });
    res.status(201).json({ trainer });
  } catch (error) { next(error); }
});

app.get('/api/client/dashboard', requireRoles(Role.CLIENT), async (req, res, next) => {
  try {
    const now = new Date();
    const clientId = req.auth.clientId;
    const [profile, nextWorkout, nutritionPlan, recentWorkouts, latestProgress, appointments] = await Promise.all([
      prisma.clientProfile.findUnique({ where: { id: clientId }, include: profileInclude }),
      prisma.workout.findFirst({ where: { clientId, scheduledAt: { gte: now }, status: WorkoutStatus.PLANNED }, orderBy: { scheduledAt: 'asc' }, include: { exercises: { include: { exercise: true }, orderBy: { sortOrder: 'asc' } } } }),
      prisma.nutritionPlan.findFirst({ where: { clientId, isActive: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.workout.findMany({ where: { clientId }, orderBy: { scheduledAt: 'desc' }, take: 12 }),
      prisma.progressRecord.findFirst({ where: { clientId }, orderBy: { recordedAt: 'desc' } }),
      prisma.appointment.findMany({ where: { clientId, startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, take: 3 }),
    ]);
    res.json({ profile, nextWorkout, nutritionPlan, recentWorkouts, latestProgress, appointments });
  } catch (error) { next(error); }
});

app.get('/api/client/profile', requireRoles(Role.CLIENT), async (req, res, next) => {
  try {
    const profile = await prisma.clientProfile.findUnique({ where: { id: req.auth.clientId }, include: profileInclude });
    res.json({ profile });
  } catch (error) { next(error); }
});

app.put('/api/client/profile', requireRoles(Role.CLIENT), async (req, res, next) => {
  try {
    const data = {
      firstName: text(req.body.firstName, 80), lastName: text(req.body.lastName, 80), phone: text(req.body.phone, 50) || null,
      goals: text(req.body.goals, 3000) || null, heightCm: numberOrNull(req.body.heightCm),
    };
    if (!data.firstName || !data.lastName || (data.heightCm !== null && (!Number.isInteger(data.heightCm) || data.heightCm < 80 || data.heightCm > 260))) return fail(res, 400, 'Проверьте введённые данные профиля.');
    const profile = await prisma.clientProfile.update({ where: { id: req.auth.clientId }, data, include: profileInclude });
    res.json({ profile });
  } catch (error) { next(error); }
});

app.get('/api/client/workouts', requireRoles(Role.CLIENT), async (req, res, next) => {
  try {
    const workouts = await prisma.workout.findMany({
      where: { clientId: req.auth.clientId }, orderBy: { scheduledAt: 'desc' },
      include: { program: { select: { title: true } }, exercises: { orderBy: { sortOrder: 'asc' }, include: { exercise: true } } },
    });
    res.json({ workouts });
  } catch (error) { next(error); }
});

app.post('/api/client/workouts/:workoutId/complete', requireRoles(Role.CLIENT), async (req, res, next) => {
  try {
    const workout = await prisma.workout.updateMany({
      where: { id: req.params.workoutId, clientId: req.auth.clientId },
      data: { status: WorkoutStatus.COMPLETED, completedAt: new Date() },
    });
    if (!workout.count) return fail(res, 404, 'Тренировка не найдена.');
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/client/nutrition', requireRoles(Role.CLIENT), async (req, res, next) => {
  try {
    const plans = await prisma.nutritionPlan.findMany({ where: { clientId: req.auth.clientId }, orderBy: { updatedAt: 'desc' } });
    res.json({ plans });
  } catch (error) { next(error); }
});

app.get('/api/client/progress', requireRoles(Role.CLIENT), async (req, res, next) => {
  try {
    const records = await prisma.progressRecord.findMany({ where: { clientId: req.auth.clientId }, orderBy: { recordedAt: 'asc' } });
    res.json({ records });
  } catch (error) { next(error); }
});

app.post('/api/client/progress', requireRoles(Role.CLIENT), async (req, res, next) => {
  try {
    const body = req.body;
    const energy = numberOrNull(body.energy);
    if (energy !== null && (!Number.isInteger(energy) || energy < 1 || energy > 10)) return fail(res, 400, 'Энергия указывается по шкале от 1 до 10.');
    const record = await prisma.progressRecord.create({ data: {
      clientId: req.auth.clientId, recordedAt: validDate(dateOrNull(body.recordedAt)) ? dateOrNull(body.recordedAt) : new Date(),
      weightKg: numberOrNull(body.weightKg), bodyFatPct: numberOrNull(body.bodyFatPct), chestCm: numberOrNull(body.chestCm),
      waistCm: numberOrNull(body.waistCm), hipCm: numberOrNull(body.hipCm), energy, note: text(body.note, 3000) || null,
    } });
    res.status(201).json({ record });
  } catch (error) { next(error); }
});

app.get('/api/client/appointments', requireRoles(Role.CLIENT), async (req, res, next) => {
  try {
    const appointments = await prisma.appointment.findMany({ where: { clientId: req.auth.clientId }, orderBy: { startsAt: 'asc' } });
    res.json({ appointments });
  } catch (error) { next(error); }
});

app.get('/api/trainer/clients', requireRoles(Role.TRAINER, Role.ADMIN), async (req, res, next) => {
  try {
    const q = text(req.query.q, 100);
    const sort = ['firstName', 'lastName', 'updatedAt', 'createdAt'].includes(req.query.sort) ? req.query.sort : 'updatedAt';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    const where = {
      ...(req.auth.role === Role.TRAINER ? { trainerId: req.auth.trainerId } : {}),
      ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { user: { email: { contains: q, mode: 'insensitive' } } }] } : {}),
    };
    const clients = await prisma.clientProfile.findMany({ where, orderBy: { [sort]: order }, include: { user: { select: { email: true } }, progressRecords: { orderBy: { recordedAt: 'desc' }, take: 1 }, _count: { select: { workouts: true } } } });
    res.json({ clients });
  } catch (error) { next(error); }
});

app.post('/api/trainer/clients', requireRoles(Role.TRAINER), async (req, res, next) => {
  try {
    const email = text(req.body.email, 254).toLowerCase();
    const password = String(req.body.password || '');
    const firstName = text(req.body.firstName, 80), lastName = text(req.body.lastName, 80);
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10 || !firstName || !lastName) return fail(res, 400, 'Укажите имя, фамилию, email и временный пароль от 10 символов.');
    const client = await prisma.clientProfile.create({ data: {
      firstName, lastName, phone: text(req.body.phone, 50) || null, goals: text(req.body.goals, 3000) || null, trainerId: req.auth.trainerId,
      user: { create: { email, passwordHash: await bcrypt.hash(password, 12), role: Role.CLIENT } },
    }, include: profileInclude });
    res.status(201).json({ client });
  } catch (error) { next(error); }
});

app.get('/api/trainer/clients/:clientId', requireRoles(Role.TRAINER, Role.ADMIN), trainerClient, async (req, res, next) => {
  try {
    const client = await prisma.clientProfile.findUnique({ where: { id: req.client.id }, include: { ...profileInclude, programs: { orderBy: { updatedAt: 'desc' } }, nutritionPlans: { orderBy: { updatedAt: 'desc' } }, progressRecords: { orderBy: { recordedAt: 'desc' }, take: 30 }, workouts: { orderBy: { scheduledAt: 'desc' }, take: 20 }, appointments: { orderBy: { startsAt: 'desc' }, take: 10 } } });
    res.json({ client });
  } catch (error) { next(error); }
});

app.put('/api/trainer/clients/:clientId', requireRoles(Role.TRAINER, Role.ADMIN), trainerClient, async (req, res, next) => {
  try {
    const update = {};
    for (const key of ['firstName', 'lastName', 'phone', 'goals', 'medicalNotes']) if (key in req.body) update[key] = text(req.body[key], key === 'goals' || key === 'medicalNotes' ? 3000 : 80) || null;
    if ('heightCm' in req.body) update.heightCm = numberOrNull(req.body.heightCm);
    if ('birthDate' in req.body) update.birthDate = validDate(dateOrNull(req.body.birthDate)) ? dateOrNull(req.body.birthDate) : null;
    if (!Object.keys(update).length) return fail(res, 400, 'Нет данных для обновления.');
    const client = await prisma.clientProfile.update({ where: { id: req.client.id }, data: update, include: profileInclude });
    res.json({ client });
  } catch (error) { next(error); }
});

app.post('/api/trainer/clients/:clientId/programs', requireRoles(Role.TRAINER), trainerClient, async (req, res, next) => {
  try {
    const title = text(req.body.title, 160);
    if (!title) return fail(res, 400, 'Укажите название программы.');
    const program = await prisma.trainingProgram.create({ data: { clientId: req.client.id, trainerId: req.auth.trainerId, title, description: text(req.body.description, 5000) || null, startsAt: validDate(dateOrNull(req.body.startsAt)) ? dateOrNull(req.body.startsAt) : null, endsAt: validDate(dateOrNull(req.body.endsAt)) ? dateOrNull(req.body.endsAt) : null } });
    res.status(201).json({ program });
  } catch (error) { next(error); }
});

app.post('/api/trainer/clients/:clientId/workouts', requireRoles(Role.TRAINER), trainerClient, async (req, res, next) => {
  try {
    const title = text(req.body.title, 160), scheduledAt = dateOrNull(req.body.scheduledAt);
    if (!title || !validDate(scheduledAt)) return fail(res, 400, 'Укажите название и дату тренировки.');
    const items = Array.isArray(req.body.exercises) ? req.body.exercises.slice(0, 30) : [];
    const exerciseIds = items.map((item) => text(item.exerciseId, 100)).filter(Boolean);
    if (exerciseIds.length !== new Set(exerciseIds).size) return fail(res, 400, 'Одно упражнение нельзя добавлять дважды в одну тренировку.');
    if (exerciseIds.length) {
      const count = await prisma.exercise.count({ where: { id: { in: exerciseIds } } });
      if (count !== exerciseIds.length) return fail(res, 400, 'В списке есть неизвестное упражнение.');
    }
    const programId = text(req.body.programId, 100) || null;
    if (programId && !await prisma.trainingProgram.findFirst({ where: { id: programId, clientId: req.client.id, trainerId: req.auth.trainerId } })) return fail(res, 400, 'Программа не принадлежит выбранному клиенту.');
    const workout = await prisma.workout.create({ data: { clientId: req.client.id, trainerId: req.auth.trainerId, programId, title, scheduledAt, durationMin: numberOrNull(req.body.durationMin), notes: text(req.body.notes, 3000) || null, exercises: { create: items.map((item, index) => ({ exerciseId: text(item.exerciseId, 100), sortOrder: index, sets: numberOrNull(item.sets), reps: text(item.reps, 30) || null, restSeconds: numberOrNull(item.restSeconds), rpe: numberOrNull(item.rpe), notes: text(item.notes, 1000) || null })) } }, include: { exercises: { include: { exercise: true } } } });
    res.status(201).json({ workout });
  } catch (error) { next(error); }
});

app.post('/api/trainer/clients/:clientId/nutrition-plans', requireRoles(Role.TRAINER), trainerClient, async (req, res, next) => {
  try {
    const title = text(req.body.title, 160);
    if (!title) return fail(res, 400, 'Укажите название плана питания.');
    await prisma.nutritionPlan.updateMany({ where: { clientId: req.client.id, isActive: true }, data: { isActive: false } });
    const plan = await prisma.nutritionPlan.create({ data: { clientId: req.client.id, trainerId: req.auth.trainerId, title, dailyCalories: numberOrNull(req.body.dailyCalories), proteinGrams: numberOrNull(req.body.proteinGrams), carbohydrateGrams: numberOrNull(req.body.carbohydrateGrams), fatGrams: numberOrNull(req.body.fatGrams), guidance: text(req.body.guidance, 5000) || null } });
    res.status(201).json({ plan });
  } catch (error) { next(error); }
});

app.post('/api/trainer/clients/:clientId/progress', requireRoles(Role.TRAINER), trainerClient, async (req, res, next) => {
  try {
    const record = await prisma.progressRecord.create({ data: { clientId: req.client.id, weightKg: numberOrNull(req.body.weightKg), bodyFatPct: numberOrNull(req.body.bodyFatPct), chestCm: numberOrNull(req.body.chestCm), waistCm: numberOrNull(req.body.waistCm), hipCm: numberOrNull(req.body.hipCm), energy: numberOrNull(req.body.energy), note: text(req.body.note, 3000) || null } });
    res.status(201).json({ record });
  } catch (error) { next(error); }
});

app.get('/api/trainer/appointments', requireRoles(Role.TRAINER, Role.ADMIN), async (req, res, next) => {
  try {
    const appointments = await prisma.appointment.findMany({
      where: req.auth.role === Role.TRAINER ? { trainerId: req.auth.trainerId } : {},
      include: { client: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { startsAt: 'asc' },
    });
    res.json({ appointments });
  } catch (error) { next(error); }
});

app.post('/api/trainer/clients/:clientId/appointments', requireRoles(Role.TRAINER), trainerClient, async (req, res, next) => {
  try {
    const startsAt = dateOrNull(req.body.startsAt), endsAt = dateOrNull(req.body.endsAt);
    if (!validDate(startsAt) || !validDate(endsAt) || endsAt <= startsAt) return fail(res, 400, 'Проверьте время встречи.');
    const appointment = await prisma.appointment.create({ data: {
      trainerId: req.auth.trainerId, clientId: req.client.id, startsAt, endsAt,
      kind: text(req.body.kind, 100) || null, notes: text(req.body.notes, 3000) || null,
    } });
    res.status(201).json({ appointment });
  } catch (error) { next(error); }
});

// Notes deliberately exclude ADMIN: a note is visible only to its authoring trainer.
app.get('/api/trainer/notes', requireRoles(Role.TRAINER), async (req, res, next) => {
  try {
    const q = text(req.query.q, 100);
    const notes = await prisma.trainerNote.findMany({ where: { trainerId: req.auth.trainerId, ...(q ? { OR: [{ body: { contains: q, mode: 'insensitive' } }, { client: { firstName: { contains: q, mode: 'insensitive' } } }, { client: { lastName: { contains: q, mode: 'insensitive' } } }] } : {}) }, include: { client: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' } });
    res.json({ notes });
  } catch (error) { next(error); }
});

app.post('/api/trainer/clients/:clientId/notes', requireRoles(Role.TRAINER), trainerClient, async (req, res, next) => {
  try {
    const body = text(req.body.body, 5000);
    if (!body) return fail(res, 400, 'Текст заметки обязателен.');
    const note = await prisma.trainerNote.create({ data: { trainerId: req.auth.trainerId, clientId: req.client.id, body, category: text(req.body.category, 80) || null } });
    res.status(201).json({ note });
  } catch (error) { next(error); }
});

app.delete('/api/trainer/notes/:noteId', requireRoles(Role.TRAINER), async (req, res, next) => {
  try {
    const result = await prisma.trainerNote.deleteMany({ where: { id: req.params.noteId, trainerId: req.auth.trainerId } });
    if (!result.count) return fail(res, 404, 'Заметка не найдена.');
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/trainer/statistics', requireRoles(Role.TRAINER, Role.ADMIN), async (req, res, next) => {
  try {
    const clientFilter = req.auth.role === Role.TRAINER ? { trainerId: req.auth.trainerId } : {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [activeClients, plannedWorkouts, appointments, completedWorkouts] = await Promise.all([
      prisma.clientProfile.count({ where: clientFilter }),
      prisma.workout.count({ where: { trainerId: req.auth.trainerId, scheduledAt: { gte: today }, status: WorkoutStatus.PLANNED } }),
      prisma.appointment.count({ where: { trainerId: req.auth.trainerId, startsAt: { gte: today } } }),
      prisma.workout.count({ where: { trainerId: req.auth.trainerId, status: WorkoutStatus.COMPLETED } }),
    ]);
    res.json({ activeClients, plannedWorkouts, upcomingAppointments: appointments, completedWorkouts });
  } catch (error) { next(error); }
});

app.get('/api/exercises', requireAuth, async (_req, res, next) => {
  try { res.json({ exercises: await prisma.exercise.findMany({ orderBy: { name: 'asc' } }) }); } catch (error) { next(error); }
});

// Do not expose the repository (schema, .env.example, server source) as static files.
// Hash navigation keeps all browser routes on '/', so this small allow-list is sufficient.
app.get(['/', '/index.html'], (_req, res) => res.sendFile('index.html', { root: process.cwd() }));
app.get(['/app.js', '/styles.css', '/hero-training.png'], (req, res) => res.sendFile(req.path.slice(1), { root: process.cwd(), dotfiles: 'deny' }));
app.get('/assets/:asset', (req, res) => res.sendFile(`assets/${req.params.asset}`, { root: process.cwd(), dotfiles: 'deny' }));
app.use('/api', (_req, res) => fail(res, 404, 'Маршрут API не найден.'));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === 'P2002') return fail(res, 409, 'Такие данные уже существуют.');
  if (error.code === 'P2003') return fail(res, 400, 'Связанная запись не найдена.');
  return fail(res, 500, 'Внутренняя ошибка сервера.');
});

if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`ELITE / ONE running at http://localhost:${port}`));
}

export default app;

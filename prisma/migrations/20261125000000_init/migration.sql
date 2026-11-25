-- Initial ELITE / ONE data model. Generated-equivalent baseline for PostgreSQL.
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TRAINER', 'CLIENT');
CREATE TYPE "WorkoutStatus" AS ENUM ('PLANNED', 'COMPLETED', 'SKIPPED');
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'CLIENT', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TrainerProfile" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL,
  "bio" TEXT, "specialty" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TrainerProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientProfile" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "trainerId" TEXT, "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL, "phone" TEXT, "birthDate" TIMESTAMP(3), "heightCm" INTEGER,
  "goals" TEXT, "medicalNotes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Exercise" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "muscleGroup" TEXT NOT NULL, "equipment" TEXT,
  "instructions" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TrainingProgram" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "trainerId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT, "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingProgram_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Workout" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "trainerId" TEXT NOT NULL, "programId" TEXT,
  "title" TEXT NOT NULL, "scheduledAt" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3), "durationMin" INTEGER,
  "status" "WorkoutStatus" NOT NULL DEFAULT 'PLANNED', "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkoutExercise" (
  "id" TEXT NOT NULL, "workoutId" TEXT NOT NULL, "exerciseId" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL,
  "sets" INTEGER, "reps" TEXT, "restSeconds" INTEGER, "rpe" INTEGER, "notes" TEXT,
  CONSTRAINT "WorkoutExercise_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NutritionPlan" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "trainerId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "dailyCalories" INTEGER, "proteinGrams" INTEGER, "carbohydrateGrams" INTEGER, "fatGrams" INTEGER,
  "guidance" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "NutritionPlan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProgressRecord" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "weightKg" DECIMAL(5,2), "bodyFatPct" DECIMAL(4,2), "chestCm" DECIMAL(5,2), "waistCm" DECIMAL(5,2),
  "hipCm" DECIMAL(5,2), "energy" INTEGER, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgressRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TrainerNote" (
  "id" TEXT NOT NULL, "trainerId" TEXT NOT NULL, "clientId" TEXT NOT NULL, "body" TEXT NOT NULL,
  "category" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainerNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Appointment" (
  "id" TEXT NOT NULL, "trainerId" TEXT NOT NULL, "clientId" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL, "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED', "kind" TEXT,
  "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "TrainerProfile_userId_key" ON "TrainerProfile"("userId");
CREATE UNIQUE INDEX "ClientProfile_userId_key" ON "ClientProfile"("userId");
CREATE UNIQUE INDEX "Exercise_name_key" ON "Exercise"("name");
CREATE UNIQUE INDEX "WorkoutExercise_workoutId_sortOrder_key" ON "WorkoutExercise"("workoutId", "sortOrder");
CREATE INDEX "ClientProfile_trainerId_idx" ON "ClientProfile"("trainerId");
CREATE INDEX "ClientProfile_lastName_firstName_idx" ON "ClientProfile"("lastName", "firstName");
CREATE INDEX "TrainerProfile_lastName_firstName_idx" ON "TrainerProfile"("lastName", "firstName");
CREATE INDEX "TrainingProgram_clientId_isActive_idx" ON "TrainingProgram"("clientId", "isActive");
CREATE INDEX "TrainingProgram_trainerId_idx" ON "TrainingProgram"("trainerId");
CREATE INDEX "Workout_clientId_scheduledAt_idx" ON "Workout"("clientId", "scheduledAt");
CREATE INDEX "Workout_trainerId_scheduledAt_idx" ON "Workout"("trainerId", "scheduledAt");
CREATE INDEX "Workout_programId_idx" ON "Workout"("programId");
CREATE INDEX "WorkoutExercise_exerciseId_idx" ON "WorkoutExercise"("exerciseId");
CREATE INDEX "NutritionPlan_clientId_isActive_idx" ON "NutritionPlan"("clientId", "isActive");
CREATE INDEX "NutritionPlan_trainerId_idx" ON "NutritionPlan"("trainerId");
CREATE INDEX "ProgressRecord_clientId_recordedAt_idx" ON "ProgressRecord"("clientId", "recordedAt");
CREATE INDEX "TrainerNote_trainerId_clientId_createdAt_idx" ON "TrainerNote"("trainerId", "clientId", "createdAt");
CREATE INDEX "Appointment_trainerId_startsAt_idx" ON "Appointment"("trainerId", "startsAt");
CREATE INDEX "Appointment_clientId_startsAt_idx" ON "Appointment"("clientId", "startsAt");

ALTER TABLE "TrainerProfile" ADD CONSTRAINT "TrainerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingProgram" ADD CONSTRAINT "TrainingProgram_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingProgram" ADD CONSTRAINT "TrainingProgram_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_programId_fkey" FOREIGN KEY ("programId") REFERENCES "TrainingProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainerNote" ADD CONSTRAINT "TrainerNote_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainerNote" ADD CONSTRAINT "TrainerNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "public"."pomodoro_kind" ADD VALUE 'flow';--> statement-breakpoint
ALTER TABLE "pomodoro_session" DROP CONSTRAINT "pomodoro_deadline";--> statement-breakpoint
ALTER TABLE "pomodoro_session" DROP CONSTRAINT "pomodoro_duration";--> statement-breakpoint
ALTER TABLE "pomodoro_session" ALTER COLUMN "planned_seconds" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD COLUMN "resumed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "pomodoro_session" SET "resumed_at" = "ends_at" - ("planned_seconds" - "elapsed_seconds") * interval '1 second' WHERE "status" = 'running';--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_target" CHECK (("pomodoro_session"."kind"::text = 'flow') = ("pomodoro_session"."planned_seconds" is null));--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_running" CHECK (("pomodoro_session"."status" = 'running') = ("pomodoro_session"."resumed_at" is not null));--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_duration" CHECK ("pomodoro_session"."elapsed_seconds" >= 0 and ("pomodoro_session"."planned_seconds" is null or ("pomodoro_session"."planned_seconds" > 0 and "pomodoro_session"."elapsed_seconds" <= "pomodoro_session"."planned_seconds")));
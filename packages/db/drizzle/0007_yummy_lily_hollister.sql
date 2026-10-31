CREATE TYPE "public"."pomodoro_kind" AS ENUM('focus', 'short_break', 'long_break');--> statement-breakpoint
CREATE TYPE "public"."pomodoro_status" AS ENUM('running', 'paused', 'completed', 'interrupted');--> statement-breakpoint
CREATE TABLE "pomodoro_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "pomodoro_kind" NOT NULL,
	"status" "pomodoro_status" NOT NULL,
	"task_id" uuid,
	"project_id" uuid,
	"title" text NOT NULL,
	"project_name" text,
	"planned_seconds" integer NOT NULL,
	"elapsed_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "pomodoro_duration" CHECK ("pomodoro_session"."planned_seconds" > 0 and "pomodoro_session"."elapsed_seconds" >= 0 and "pomodoro_session"."elapsed_seconds" <= "pomodoro_session"."planned_seconds"),
	CONSTRAINT "pomodoro_deadline" CHECK (("pomodoro_session"."status" = 'running') = ("pomodoro_session"."ends_at" is not null)),
	CONSTRAINT "pomodoro_finished" CHECK (("pomodoro_session"."status" in ('completed', 'interrupted')) = ("pomodoro_session"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "pomodoro_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"focus_minutes" integer DEFAULT 25 NOT NULL,
	"short_break_minutes" integer DEFAULT 5 NOT NULL,
	"long_break_minutes" integer DEFAULT 15 NOT NULL,
	"long_break_every" integer DEFAULT 4 NOT NULL,
	"daily_goal" integer DEFAULT 4 NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_session_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_session_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pomodoro_settings" ADD CONSTRAINT "pomodoro_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pomodoro_session_user_id_finished_at_index" ON "pomodoro_session" USING btree ("user_id","finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pomodoro_one_active_per_user" ON "pomodoro_session" USING btree ("user_id") WHERE "pomodoro_session"."status" in ('running', 'paused');
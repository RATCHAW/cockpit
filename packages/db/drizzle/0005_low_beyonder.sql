CREATE TABLE "transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"from_account_id" uuid,
	"to_account_id" uuid,
	"amount" numeric(30, 10) NOT NULL,
	"received" numeric(30, 10) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_from_account_id_finance_account_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."finance_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_to_account_id_finance_account_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."finance_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfer_user_id_date_index" ON "transfer" USING btree ("user_id","date");
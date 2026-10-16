ALTER TABLE "recurring_transaction" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_transaction" ADD CONSTRAINT "recurring_transaction_account_id_finance_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_finance_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_account_id_date_index" ON "transaction" USING btree ("account_id","date");
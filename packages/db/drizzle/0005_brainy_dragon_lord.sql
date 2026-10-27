CREATE TABLE "finance_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "transaction_kind" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_category" ADD CONSTRAINT "finance_category_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_category_user_id_kind_name_index" ON "finance_category" USING btree ("user_id","kind",lower("name"));--> statement-breakpoint
INSERT INTO "finance_category" ("user_id", "kind", "name")
SELECT "user_id", "kind", "category" FROM "transaction"
UNION
SELECT "user_id", "kind", "category" FROM "recurring_transaction"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Frozen copy of DEFAULT_CATEGORIES as of this migration. Don't update it.
INSERT INTO "finance_category" ("user_id", "kind", "name")
SELECT "user"."id", "defaults"."kind"::transaction_kind, "defaults"."name"
FROM "user"
CROSS JOIN (VALUES
  ('expense', 'Housing'),
  ('expense', 'Groceries'),
  ('expense', 'Dining'),
  ('expense', 'Transport'),
  ('expense', 'Utilities'),
  ('expense', 'Subscriptions'),
  ('expense', 'Shopping'),
  ('expense', 'Health'),
  ('expense', 'Entertainment'),
  ('expense', 'Travel'),
  ('expense', 'Education'),
  ('expense', 'Gifts'),
  ('expense', 'Other'),
  ('income', 'Salary'),
  ('income', 'Freelance'),
  ('income', 'Investments'),
  ('income', 'Refunds'),
  ('income', 'Gifts'),
  ('income', 'Other')
) AS "defaults" ("kind", "name")
ON CONFLICT DO NOTHING;

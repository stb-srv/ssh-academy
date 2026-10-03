CREATE TYPE "public"."connection_kind" AS ENUM('terminal', 'sftp');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('pending', 'active', 'closed', 'failed');--> statement-breakpoint
CREATE TABLE "api_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "session_recording" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ssh_ca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"organization_id" text,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"fingerprint_sha256" text NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"kek_version" integer NOT NULL,
	"next_serial" bigint DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ssh_ca_single_owner" CHECK ((owner_user_id IS NOT NULL) <> (organization_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ssh_certificate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ca_id" uuid NOT NULL,
	"key_id" uuid,
	"user_id" text,
	"serial" bigint NOT NULL,
	"cert_key_id" text NOT NULL,
	"principals" text[] NOT NULL,
	"public_key_fingerprint" text NOT NULL,
	"valid_after" timestamp with time zone NOT NULL,
	"valid_before" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"record_sessions" boolean DEFAULT false NOT NULL,
	"idle_timeout_minutes" integer DEFAULT 15 NOT NULL,
	"max_session_hours" integer DEFAULT 8 NOT NULL,
	"max_cert_minutes" integer DEFAULT 720 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connection_session" ALTER COLUMN "started_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "connection_session" ALTER COLUMN "started_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "kind" "connection_kind" DEFAULT 'terminal' NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "status" "connection_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "auth_method" text DEFAULT 'key' NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "record" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "idle_timeout_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "max_duration_minutes" integer DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "bytes_in" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "connection_session" ADD COLUMN "bytes_out" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "management_key_id" uuid;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "trusted_ca_id" uuid;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_recording" ADD CONSTRAINT "session_recording_session_id_connection_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."connection_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_ca" ADD CONSTRAINT "ssh_ca_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_ca" ADD CONSTRAINT "ssh_ca_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_ca" ADD CONSTRAINT "ssh_ca_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_certificate" ADD CONSTRAINT "ssh_certificate_ca_id_ssh_ca_id_fk" FOREIGN KEY ("ca_id") REFERENCES "public"."ssh_ca"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_certificate" ADD CONSTRAINT "ssh_certificate_key_id_ssh_key_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."ssh_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_certificate" ADD CONSTRAINT "ssh_certificate_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_settings" ADD CONSTRAINT "team_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_token_user_idx" ON "api_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ssh_ca_owner_user_idx" ON "ssh_ca" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "ssh_ca_org_idx" ON "ssh_ca" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ssh_certificate_serial_idx" ON "ssh_certificate" USING btree ("ca_id","serial");--> statement-breakpoint
CREATE INDEX "ssh_certificate_user_idx" ON "ssh_certificate" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "connection_session" ADD CONSTRAINT "connection_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_management_key_id_ssh_key_id_fk" FOREIGN KEY ("management_key_id") REFERENCES "public"."ssh_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_trusted_ca_id_ssh_ca_id_fk" FOREIGN KEY ("trusted_ca_id") REFERENCES "public"."ssh_ca"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connection_session_org_idx" ON "connection_session" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "connection_session" DROP COLUMN "recording_path";--> statement-breakpoint
ALTER TABLE "connection_session" ADD CONSTRAINT "connection_session_token_hash_unique" UNIQUE("token_hash");
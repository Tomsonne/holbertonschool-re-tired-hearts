import { MigrationInterface, QueryRunner } from "typeorm";

// Schéma initial du MVP : les neuf tables de docs/modele-donnees.md, avec leurs types
// énumérés, clés primaires et étrangères, contraintes uniques et de vérification, et index.
// Générée depuis les entités puis relue. Ne jamais la modifier une fois fusionnée : ajouter
// une nouvelle migration à la place.

export class InitialSchema1792395636639 implements MigrationInterface {
    name = 'InitialSchema1792395636639'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."user_role" AS ENUM('member', 'organizer', 'moderator')`);
        await queryRunner.query(`CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(254) NOT NULL, "password_hash" character varying(255) NOT NULL, "role" "public"."user_role" NOT NULL DEFAULT 'member', "status" "public"."account_status" NOT NULL DEFAULT 'active', "session_version" integer NOT NULL DEFAULT '0', "suspended_at" TIMESTAMP WITH TIME ZONE, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_users_email" UNIQUE ("email"), CONSTRAINT "chk_users_suspension" CHECK (("status" = 'suspended') = ("suspended_at" IS NOT NULL)), CONSTRAINT "chk_users_email_lowercase" CHECK ("email" = lower("email")), CONSTRAINT "pk_users" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "interests" ("id" integer GENERATED ALWAYS AS IDENTITY NOT NULL, "slug" character varying(50) NOT NULL, "label" character varying(80) NOT NULL, CONSTRAINT "uq_interests_label" UNIQUE ("label"), CONSTRAINT "uq_interests_slug" UNIQUE ("slug"), CONSTRAINT "pk_interests" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled', 'completed')`);
        await queryRunner.query(`CREATE TABLE "events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organizer_id" uuid NOT NULL, "interest_id" integer NOT NULL, "title" character varying(120) NOT NULL, "description" character varying(2000) NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "city_name" character varying(100) NOT NULL, "department_code" character varying(3) NOT NULL, "postal_code" character varying(5) NOT NULL, "city_code" character varying(5), "location_verified" boolean NOT NULL DEFAULT false, "area_hint" character varying(120), "exact_address" character varying(200) NOT NULL, "capacity" smallint NOT NULL, "status" "public"."event_status" NOT NULL DEFAULT 'draft', "cancellation_reason" character varying(300), "published_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_events_completion" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL)), CONSTRAINT "chk_events_cancellation" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL AND "cancellation_reason" IS NOT NULL)), CONSTRAINT "chk_events_postal_code" CHECK ("postal_code" ~ '^[0-9]{5}$'), CONSTRAINT "chk_events_capacity" CHECK ("capacity" BETWEEN 1 AND 50), CONSTRAINT "chk_events_dates" CHECK ("ends_at" > "starts_at"), CONSTRAINT "pk_events" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_events_department_code" ON "events" ("department_code") `);
        await queryRunner.query(`CREATE INDEX "idx_events_city_code" ON "events" ("city_code") `);
        await queryRunner.query(`CREATE INDEX "idx_events_organizer_id" ON "events" ("organizer_id") `);
        await queryRunner.query(`CREATE INDEX "idx_events_interest_id" ON "events" ("interest_id") `);
        await queryRunner.query(`CREATE INDEX "idx_events_status_starts_at" ON "events" ("status", "starts_at") `);
        await queryRunner.query(`CREATE TYPE "public"."registration_status" AS ENUM('registered', 'withdrawn')`);
        await queryRunner.query(`CREATE TABLE "event_registrations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "event_id" uuid NOT NULL, "user_id" uuid NOT NULL, "status" "public"."registration_status" NOT NULL DEFAULT 'registered', "registered_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "withdrawn_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_event_registrations_event_user" UNIQUE ("event_id", "user_id"), CONSTRAINT "chk_event_registrations_withdrawal" CHECK (("status" = 'withdrawn') = ("withdrawn_at" IS NOT NULL)), CONSTRAINT "pk_event_registrations" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_event_registrations_user_id" ON "event_registrations" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "conversations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "participant_a_id" uuid NOT NULL, "participant_b_id" uuid NOT NULL, "context_event_id" uuid, "last_message_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_conversations_pair" UNIQUE ("participant_a_id", "participant_b_id"), CONSTRAINT "chk_conversations_distinct_ordered" CHECK ("participant_a_id" < "participant_b_id"), CONSTRAINT "pk_conversations" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_conversations_participant_b_id" ON "conversations" ("participant_b_id") `);
        await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "conversation_id" uuid NOT NULL, "sender_id" uuid NOT NULL, "body" character varying(1000) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_messages_body_length" CHECK (char_length(btrim("body")) BETWEEN 1 AND 1000), CONSTRAINT "pk_messages" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_messages_conversation_id_created_at" ON "messages" ("conversation_id", "created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."moderation_action_type" AS ENUM('approve_profile', 'block_profile', 'unblock_profile', 'suspend_account', 'reactivate_account', 'cancel_event', 'grant_organizer', 'revoke_organizer')`);
        await queryRunner.query(`CREATE TABLE "moderation_actions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "moderator_id" uuid NOT NULL, "action" "public"."moderation_action_type" NOT NULL, "target_user_id" uuid, "target_event_id" uuid, "reason" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_moderation_actions_single_target" CHECK (num_nonnulls("target_user_id", "target_event_id") = 1), CONSTRAINT "pk_moderation_actions" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_moderation_actions_target_event_id" ON "moderation_actions" ("target_event_id") `);
        await queryRunner.query(`CREATE INDEX "idx_moderation_actions_target_user_id" ON "moderation_actions" ("target_user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_moderation_actions_created_at" ON "moderation_actions" ("created_at") `);
        await queryRunner.query(`CREATE TYPE "public"."profile_status" AS ENUM('pending', 'approved', 'blocked')`);
        await queryRunner.query(`CREATE TABLE "profiles" ("user_id" uuid NOT NULL, "display_name" character varying(40) NOT NULL, "bio" character varying(500), "looking_for" character varying(20) array NOT NULL DEFAULT '{}', "city_name" character varying(100), "department_code" character varying(3), "postal_code" character varying(5), "city_code" character varying(5), "location_verified" boolean NOT NULL DEFAULT false, "discoverable" boolean NOT NULL DEFAULT true, "allow_messages" boolean NOT NULL DEFAULT true, "status" "public"."profile_status" NOT NULL DEFAULT 'pending', "reviewed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_profiles_location_when_approved" CHECK ("status" <> 'approved' OR ("city_name" IS NOT NULL AND "department_code" IS NOT NULL)), CONSTRAINT "chk_profiles_postal_code" CHECK ("postal_code" IS NULL OR "postal_code" ~ '^[0-9]{5}$'), CONSTRAINT "chk_profiles_looking_for" CHECK ("looking_for" <@ ARRAY['friendship', 'companionship', 'romance', 'activities']::varchar[]), CONSTRAINT "chk_profiles_display_name_length" CHECK (char_length(btrim("display_name")) BETWEEN 2 AND 40), CONSTRAINT "pk_profiles" PRIMARY KEY ("user_id"))`);
        await queryRunner.query(`CREATE INDEX "idx_profiles_discovery" ON "profiles" ("status", "department_code") `);
        await queryRunner.query(`CREATE TABLE "profile_interests" ("profile_id" uuid NOT NULL, "interest_id" integer NOT NULL, CONSTRAINT "pk_profile_interests" PRIMARY KEY ("profile_id", "interest_id"))`);
        await queryRunner.query(`CREATE INDEX "idx_profile_interests_interest_id" ON "profile_interests" ("interest_id") `);
        await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "fk_events_organizer_id" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "fk_events_interest_id" FOREIGN KEY ("interest_id") REFERENCES "interests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "event_registrations" ADD CONSTRAINT "fk_event_registrations_event_id" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "event_registrations" ADD CONSTRAINT "fk_event_registrations_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversations" ADD CONSTRAINT "fk_conversations_participant_a_id" FOREIGN KEY ("participant_a_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversations" ADD CONSTRAINT "fk_conversations_participant_b_id" FOREIGN KEY ("participant_b_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversations" ADD CONSTRAINT "fk_conversations_context_event_id" FOREIGN KEY ("context_event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_sender_id" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "moderation_actions" ADD CONSTRAINT "fk_moderation_actions_moderator_id" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "moderation_actions" ADD CONSTRAINT "fk_moderation_actions_target_user_id" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "moderation_actions" ADD CONSTRAINT "fk_moderation_actions_target_event_id" FOREIGN KEY ("target_event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "profiles" ADD CONSTRAINT "fk_profiles_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "profile_interests" ADD CONSTRAINT "fk_profile_interests_profile_id" FOREIGN KEY ("profile_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "profile_interests" ADD CONSTRAINT "fk_profile_interests_interest_id" FOREIGN KEY ("interest_id") REFERENCES "interests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profile_interests" DROP CONSTRAINT "fk_profile_interests_interest_id"`);
        await queryRunner.query(`ALTER TABLE "profile_interests" DROP CONSTRAINT "fk_profile_interests_profile_id"`);
        await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "fk_profiles_user_id"`);
        await queryRunner.query(`ALTER TABLE "moderation_actions" DROP CONSTRAINT "fk_moderation_actions_target_event_id"`);
        await queryRunner.query(`ALTER TABLE "moderation_actions" DROP CONSTRAINT "fk_moderation_actions_target_user_id"`);
        await queryRunner.query(`ALTER TABLE "moderation_actions" DROP CONSTRAINT "fk_moderation_actions_moderator_id"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "fk_messages_sender_id"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "fk_messages_conversation_id"`);
        await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "fk_conversations_context_event_id"`);
        await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "fk_conversations_participant_b_id"`);
        await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "fk_conversations_participant_a_id"`);
        await queryRunner.query(`ALTER TABLE "event_registrations" DROP CONSTRAINT "fk_event_registrations_user_id"`);
        await queryRunner.query(`ALTER TABLE "event_registrations" DROP CONSTRAINT "fk_event_registrations_event_id"`);
        await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "fk_events_interest_id"`);
        await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "fk_events_organizer_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_profile_interests_interest_id"`);
        await queryRunner.query(`DROP TABLE "profile_interests"`);
        await queryRunner.query(`DROP INDEX "public"."idx_profiles_discovery"`);
        await queryRunner.query(`DROP TABLE "profiles"`);
        await queryRunner.query(`DROP TYPE "public"."profile_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_moderation_actions_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_moderation_actions_target_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_moderation_actions_target_event_id"`);
        await queryRunner.query(`DROP TABLE "moderation_actions"`);
        await queryRunner.query(`DROP TYPE "public"."moderation_action_type"`);
        await queryRunner.query(`DROP INDEX "public"."idx_messages_conversation_id_created_at"`);
        await queryRunner.query(`DROP TABLE "messages"`);
        await queryRunner.query(`DROP INDEX "public"."idx_conversations_participant_b_id"`);
        await queryRunner.query(`DROP TABLE "conversations"`);
        await queryRunner.query(`DROP INDEX "public"."idx_event_registrations_user_id"`);
        await queryRunner.query(`DROP TABLE "event_registrations"`);
        await queryRunner.query(`DROP TYPE "public"."registration_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_events_status_starts_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_events_interest_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_events_organizer_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_events_city_code"`);
        await queryRunner.query(`DROP INDEX "public"."idx_events_department_code"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`DROP TYPE "public"."event_status"`);
        await queryRunner.query(`DROP TABLE "interests"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."account_status"`);
        await queryRunner.query(`DROP TYPE "public"."user_role"`);
    }

}

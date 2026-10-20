import { MigrationInterface, QueryRunner } from 'typeorm';

export class WithdrawOnModeration1792395636800 implements MigrationInterface {
  name = 'WithdrawOnModeration1792395636800';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION withdraw_future_registrations_on_status_change() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE member_id uuid;
      BEGIN
        IF TG_TABLE_NAME = 'users' THEN
          IF NEW.status <> 'suspended' OR OLD.status = NEW.status THEN RETURN NEW; END IF;
          member_id := NEW.id;
        ELSE
          IF NEW.status <> 'blocked' OR OLD.status = NEW.status THEN RETURN NEW; END IF;
          member_id := NEW.user_id;
        END IF;

        -- Même verrou que l'inscription et le changement de capacité, dans un ordre stable.
        PERFORM id FROM events
        WHERE id IN (
          SELECT r.event_id FROM event_registrations r
          WHERE r.user_id = member_id AND r.status = 'registered'
        ) AND starts_at > now()
        ORDER BY id FOR UPDATE;

        UPDATE event_registrations r
        SET status = 'withdrawn', withdrawn_at = now(), updated_at = now()
        FROM events e
        WHERE r.event_id = e.id AND r.user_id = member_id
          AND r.status = 'registered' AND e.starts_at > now();
        RETURN NEW;
      END $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER withdraw_on_account_suspension
      AFTER UPDATE OF status ON users
      FOR EACH ROW EXECUTE FUNCTION withdraw_future_registrations_on_status_change()
    `);
    await queryRunner.query(`
      CREATE TRIGGER withdraw_on_profile_block
      AFTER UPDATE OF status ON profiles
      FOR EACH ROW EXECUTE FUNCTION withdraw_future_registrations_on_status_change()
    `);
    await queryRunner.query(`
      UPDATE event_registrations r
      SET status = 'withdrawn', withdrawn_at = now(), updated_at = now()
      FROM events e, users u, profiles p
      WHERE r.event_id = e.id AND r.user_id = u.id AND p.user_id = u.id
        AND r.status = 'registered' AND e.starts_at > now()
        AND (u.status = 'suspended' OR p.status = 'blocked')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER withdraw_on_profile_block ON profiles`);
    await queryRunner.query(`DROP TRIGGER withdraw_on_account_suspension ON users`);
    await queryRunner.query(`DROP FUNCTION withdraw_future_registrations_on_status_change()`);
  }
}

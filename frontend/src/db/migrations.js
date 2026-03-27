import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    // v1 → initial schema (no migration needed, handled by schema creation)
    // Add future migrations here as:
    // {
    //   toVersion: 2,
    //   steps: [
    //     addColumns({
    //       table: 'messages',
    //       columns: [
    //         { name: 'thread_id', type: 'string', isOptional: true }
    //       ]
    //     }),
    //   ],
    // },
  ],
});

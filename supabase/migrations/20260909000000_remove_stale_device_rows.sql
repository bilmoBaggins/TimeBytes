-- This project has one tablet. Keep the latest snapshot for each local row ID
-- after an older anonymous or reset-device account created duplicate snapshots.
delete from public.device_employees
where (user_id, local_id) in (
  select user_id, local_id
  from (
    select
      user_id,
      local_id,
      row_number() over (
        partition by local_id
        order by updated_at desc, user_id desc
      ) as row_number
    from public.device_employees
  ) ranked
  where row_number > 1
);

delete from public.device_shifts
where (user_id, local_id) in (
  select user_id, local_id
  from (
    select
      user_id,
      local_id,
      row_number() over (
        partition by local_id
        order by updated_at desc, user_id desc
      ) as row_number
    from public.device_shifts
  ) ranked
  where row_number > 1
);

delete from public.device_admin_faces
where (user_id, local_id) in (
  select user_id, local_id
  from (
    select
      user_id,
      local_id,
      row_number() over (
        partition by local_id
        order by updated_at desc, user_id desc
      ) as row_number
    from public.device_admin_faces
  ) ranked
  where row_number > 1
);
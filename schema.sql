-- Run this in the Neon SQL editor. It is safe to run again, and safe to run
-- on a database that already has FRIFT data in it.

create table if not exists people (
  id         serial primary key,
  name       text not null,
  colour     text not null,
  created_at timestamptz not null default now()
);

-- Names are unique ignoring case, so "Sam" and "sam" cannot both exist.
create unique index if not exists people_name_unique on people (lower(name));

-- The list of exercises. Anyone in the group can add one from the app.
create table if not exists exercises (
  id         text primary key,                      -- slug, e.g. 'bench_press'
  name       text not null,
  kind       text not null default 'strength' check (kind in ('strength', 'reps', 'cardio')),  -- reps = reps only, no weight
  equipment_choice boolean not null default false,  -- true = log each set as barbell or dumbbell
  created_by int references people(id) on delete set null,
  sort_order serial,                                -- charts appear in this order
  created_at timestamptz not null default now()
);

create unique index if not exists exercises_name_unique on exercises (lower(name));

-- Databases created before barbell/dumbbell support need the column added.
alter table exercises add column if not exists equipment_choice boolean not null default false;

-- Databases created before reps-only exercises need the wider kind check.
alter table exercises drop constraint if exists exercises_kind_check;
alter table exercises add constraint exercises_kind_check check (kind in ('strength', 'reps', 'cardio'));

-- The original seven. Do not add sort_order here: the sequence numbers them in order.
insert into exercises (id, name, kind, equipment_choice) values
  ('bench_press',     'Bench press',           'strength', true),
  ('lat_pulldown',    'Lat pull down',         'strength', false),
  ('squat',           'Squat',                 'strength', true),
  ('leg_extension',   'Leg extension',         'strength', false),
  ('shoulder_press',  'Shoulder press',        'strength', true),
  ('incline_db_curl', 'Incline dumbbell curl', 'strength', false),
  ('cardio',          'Cardio',                'cardio',   false)
on conflict do nothing;

-- Existing databases already have these rows, so switch the option on for them too.
update exercises set equipment_choice = true where id in ('bench_press', 'squat', 'shoulder_press');

-- One row per set. Cardio is one row per day with only duration_min filled in.
-- Reps-only exercises leave weight null.
create table if not exists entries (
  id           serial primary key,
  person_id    int not null references people(id) on delete cascade,
  exercise     text not null,
  entry_date   date not null,
  set_number   int not null default 1,
  weight       numeric(6,2),
  reps         int,
  duration_min numeric(6,1),
  equipment    text check (equipment in ('barbell', 'dumbbell')),  -- null = not recorded (counted as barbell)
  created_at   timestamptz not null default now(),

  constraint entries_shape check (
    (exercise = 'cardio' and duration_min is not null and weight is null and reps is null)
    or
    (exercise <> 'cardio' and reps is not null and duration_min is null)
  ),
  constraint entries_positive check (
    coalesce(weight, 0) >= 0 and coalesce(reps, 1) >= 1 and coalesce(duration_min, 1) > 0
  )
);

-- Databases created before reps-only exercises required a weight on every set.
alter table entries drop constraint if exists entries_shape;
alter table entries add constraint entries_shape check (
  (exercise = 'cardio' and duration_min is not null and weight is null and reps is null)
  or
  (exercise <> 'cardio' and reps is not null and duration_min is null)
);

-- Databases created before barbell/dumbbell support need the column added.
alter table entries add column if not exists equipment text check (equipment in ('barbell', 'dumbbell'));

-- Every entry must belong to a real exercise.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entries_exercise_fk') then
    alter table entries
      add constraint entries_exercise_fk foreign key (exercise) references exercises(id);
  end if;
end $$;

-- Set numbers are unique per person, exercise and day.
create unique index if not exists entries_set_unique
  on entries (person_id, exercise, entry_date, set_number);

-- Only one cardio entry per person per day.
create unique index if not exists entries_one_cardio_per_day
  on entries (person_id, entry_date) where exercise = 'cardio';

create index if not exists entries_by_exercise_date on entries (exercise, entry_date);

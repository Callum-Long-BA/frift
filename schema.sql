-- Run this once in the Neon SQL editor. It is safe to run again.

create table if not exists people (
  id         serial primary key,
  name       text not null,
  colour     text not null,
  created_at timestamptz not null default now()
);

-- Names are unique ignoring case, so "Sam" and "sam" cannot both exist.
create unique index if not exists people_name_unique on people (lower(name));

-- One row per set. Cardio is one row per day with only duration_min filled in.
create table if not exists entries (
  id           serial primary key,
  person_id    int not null references people(id) on delete cascade,
  exercise     text not null,
  entry_date   date not null,
  set_number   int not null default 1,
  weight       numeric(6,2),
  reps         int,
  duration_min numeric(6,1),
  created_at   timestamptz not null default now(),

  constraint entries_shape check (
    (exercise = 'cardio' and duration_min is not null and weight is null and reps is null)
    or
    (exercise <> 'cardio' and weight is not null and reps is not null and duration_min is null)
  ),
  constraint entries_positive check (
    coalesce(weight, 0) >= 0 and coalesce(reps, 1) >= 1 and coalesce(duration_min, 1) > 0
  )
);

-- Set numbers are unique per person, exercise and day.
create unique index if not exists entries_set_unique
  on entries (person_id, exercise, entry_date, set_number);

-- Only one cardio entry per person per day.
create unique index if not exists entries_one_cardio_per_day
  on entries (person_id, entry_date) where exercise = 'cardio';

create index if not exists entries_by_exercise_date on entries (exercise, entry_date);

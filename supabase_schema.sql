-- Create a table for public profiles (optional, but good for storing extra user data)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text,
  full_name text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can view their own profile" on profiles
  for select using (auth.uid() = id);

create policy "Users can update their own profile" on profiles
  for update using (auth.uid() = id);

create policy "Users can insert their own profile" on profiles
  for insert with check (auth.uid() = id);

-- Create contacts table
create table contacts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  type text not null check (type in ('SALE', 'PURCHASE')),
  price_per_liter numeric not null default 0,
  created_at timestamptz default now()
);

alter table contacts enable row level security;

create policy "Users can view their own contacts" on contacts
  for select using (auth.uid() = user_id);

create policy "Users can insert their own contacts" on contacts
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own contacts" on contacts
  for update using (auth.uid() = user_id);

create policy "Users can delete their own contacts" on contacts
  for delete using (auth.uid() = user_id);

-- Create milk_records table
create table milk_records (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references contacts(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null, -- Denormalized for easier RLS
  date date not null,
  morning_quantity numeric default 0,
  evening_quantity numeric default 0,
  total_quantity numeric default 0, -- Auto-calculated in app, stored here
  total_price numeric default 0,
  created_at timestamptz default now()
);

alter table milk_records enable row level security;

create policy "Users can view their own records" on milk_records
  for select using (auth.uid() = user_id);

create policy "Users can insert their own records" on milk_records
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own records" on milk_records
  for update using (auth.uid() = user_id);

create policy "Users can delete their own records" on milk_records
  for delete using (auth.uid() = user_id);

-- Create payments table
create table payments (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references contacts(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null, -- Denormalized for RLS
  amount numeric not null,
  date date not null,
  description text,
  created_at timestamptz default now()
);

alter table payments enable row level security;

create policy "Users can view their own payments" on payments
  for select using (auth.uid() = user_id);

create policy "Users can insert their own payments" on payments
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own payments" on payments
  for update using (auth.uid() = user_id);

create policy "Users can delete their own payments" on payments
  for delete using (auth.uid() = user_id);

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to automatically create profile on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

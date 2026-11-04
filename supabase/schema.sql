-- ==============================================================================
-- SISTEM BERBAGI BALIK LAYAR (SBBL) - PRODUCTION DATABASE SCHEMA & POLICIES
-- Target: Supabase / PostgreSQL 15+
-- Version: Final Production (Public Access Ready)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. DROP EXISTING OBJECTS FOR CLEAN RE-CREATION (IF NEEDED)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP TABLE IF EXISTS delivery_logs CASCADE;
DROP TABLE IF EXISTS scheduled_jobs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ------------------------------------------------------------------------------
-- 3. PROFILES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'member')) DEFAULT 'member',
    status TEXT NOT NULL CHECK (status IN ('approved', 'pending', 'suspended', 'rejected')) DEFAULT 'pending',
    suspension_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);

-- ------------------------------------------------------------------------------
-- 4. CATEGORIES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_category_name_type UNIQUE(name, type)
);

CREATE INDEX idx_categories_type_active ON categories(type, is_active);

-- ------------------------------------------------------------------------------
-- 5. TRANSACTIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    counterparty TEXT NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'Transfer Bank',
    notes TEXT,
    receipt_url TEXT,
    recorded_by UUID NOT NULL REFERENCES profiles(id),
    status TEXT NOT NULL CHECK (status IN ('active', 'void')) DEFAULT 'active',
    void_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_category ON transactions(category_id);

-- ------------------------------------------------------------------------------
-- 6. SYSTEM SETTINGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
);

-- ------------------------------------------------------------------------------
-- 7. AUDIT LOGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id UUID REFERENCES profiles(id),
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    details JSONB
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity);

-- ------------------------------------------------------------------------------
-- 8. NOTIFICATIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('announcement', 'contribution_reminder', 'payment_recorded', 'transaction_update', 'system')),
    created_by UUID REFERENCES profiles(id),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_id, read_at);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ------------------------------------------------------------------------------
-- 9. SCHEDULED JOBS & DELIVERY LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT UNIQUE NOT NULL,
    description TEXT,
    cron_expression TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Makassar',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'running')),
    recipients_count INTEGER NOT NULL DEFAULT 0,
    details TEXT,
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_logs_executed_at ON delivery_logs(executed_at DESC);

-- ------------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- Non-recursive, production hardened
-- ------------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_logs ENABLE ROW LEVEL SECURITY;

-- Helper functions using SECURITY DEFINER to bypass RLS internally
CREATE OR REPLACE FUNCTION public.check_user_is_approved(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = user_id AND status = 'approved'
    );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = user_id;
$$;

-- PROFILES POLICIES
CREATE POLICY "profiles_select_auth" ON profiles
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "profiles_update_self" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND role = (SELECT role FROM profiles WHERE id = auth.uid())
        AND status = (SELECT status FROM profiles WHERE id = auth.uid())
    );

-- CATEGORIES POLICIES
CREATE POLICY "categories_select_auth" ON categories
    FOR SELECT TO authenticated
    USING (public.check_user_is_approved(auth.uid()));

CREATE POLICY "categories_all_managers" ON categories
    FOR ALL TO authenticated
    USING (
        public.check_user_is_approved(auth.uid()) 
        AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
    )
    WITH CHECK (
        public.check_user_is_approved(auth.uid()) 
        AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
    );

-- TRANSACTIONS POLICIES
CREATE POLICY "transactions_select_auth" ON transactions
    FOR SELECT TO authenticated
    USING (public.check_user_is_approved(auth.uid()));

CREATE POLICY "transactions_insert_update_managers" ON transactions
    FOR ALL TO authenticated
    USING (
        public.check_user_is_approved(auth.uid()) 
        AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
    )
    WITH CHECK (
        public.check_user_is_approved(auth.uid()) 
        AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
    );

-- SYSTEM SETTINGS POLICIES
CREATE POLICY "system_settings_select_auth" ON system_settings
    FOR SELECT TO authenticated
    USING (public.check_user_is_approved(auth.uid()));

CREATE POLICY "system_settings_superadmin_all" ON system_settings
    FOR ALL TO authenticated
    USING (
        public.check_user_is_approved(auth.uid()) 
        AND public.get_user_role(auth.uid()) = 'super_admin'
    )
    WITH CHECK (
        public.check_user_is_approved(auth.uid()) 
        AND public.get_user_role(auth.uid()) = 'super_admin'
    );

-- AUDIT LOGS POLICIES
CREATE POLICY "audit_logs_select_managers" ON audit_logs
    FOR SELECT TO authenticated
    USING (
        public.check_user_is_approved(auth.uid()) 
        AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
    );

CREATE POLICY "audit_logs_insert_auth" ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (public.check_user_is_approved(auth.uid()));

-- NOTIFICATIONS POLICIES
CREATE POLICY "notifications_select_recipient" ON notifications
    FOR SELECT TO authenticated
    USING (recipient_id = auth.uid());

CREATE POLICY "notifications_update_recipient" ON notifications
    FOR UPDATE TO authenticated
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "notifications_insert_managers" ON notifications
    FOR INSERT TO authenticated
    WITH CHECK (
        public.check_user_is_approved(auth.uid()) 
        AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
    );

-- SCHEDULED JOBS & LOGS POLICIES
CREATE POLICY "scheduled_jobs_select_managers" ON scheduled_jobs
    FOR SELECT TO authenticated
    USING (
        public.check_user_is_approved(auth.uid()) 
        AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
    );

CREATE POLICY "delivery_logs_select_managers" ON delivery_logs
    FOR SELECT TO authenticated
    USING (
        public.check_user_is_approved(auth.uid()) 
        AND public.get_user_role(auth.uid()) IN ('super_admin', 'admin')
    );

-- ------------------------------------------------------------------------------
-- 11. RPC SECURITY DEFINER FUNCTIONS
-- ------------------------------------------------------------------------------

-- RPC: create_transaction
CREATE OR REPLACE FUNCTION create_transaction(
    p_date DATE,
    p_description TEXT,
    p_counterparty TEXT,
    p_category_id UUID,
    p_type TEXT,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'Transfer Bank',
    p_notes TEXT DEFAULT NULL,
    p_receipt_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT;
    v_status TEXT;
    v_user_email TEXT;
    v_cat_type TEXT;
    v_cat_active BOOLEAN;
    v_tx_id UUID;
BEGIN
    SELECT role, status, email INTO v_role, v_status, v_user_email
    FROM profiles WHERE id = v_user_id;

    IF v_user_id IS NULL OR v_status != 'approved' THEN
        RAISE EXCEPTION 'Akses ditolak: Akun belum terverifikasi atau tidak memiliki izin.';
    END IF;

    IF v_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya pengelola yang dapat mencatat transaksi.';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Nominal transaksi harus berupa bilangan positif.';
    END IF;

    SELECT type, is_active INTO v_cat_type, v_cat_active
    FROM categories WHERE id = p_category_id;

    IF v_cat_type IS NULL THEN
        RAISE EXCEPTION 'Kategori tidak ditemukan.';
    END IF;

    IF v_cat_type != p_type THEN
        RAISE EXCEPTION 'Jenis kategori (%) tidak cocok dengan jenis transaksi (%).', v_cat_type, p_type;
    END IF;

    IF NOT v_cat_active THEN
        RAISE EXCEPTION 'Kategori yang dipilih saat ini non-aktif.';
    END IF;

    INSERT INTO transactions (
        transaction_date,
        description,
        counterparty,
        category_id,
        type,
        amount,
        payment_method,
        notes,
        receipt_url,
        recorded_by,
        status
    ) VALUES (
        p_date,
        p_description,
        p_counterparty,
        p_category_id,
        p_type,
        p_amount,
        p_payment_method,
        p_notes,
        p_receipt_url,
        v_user_id,
        'active'
    ) RETURNING id INTO v_tx_id;

    INSERT INTO audit_logs (
        actor_id,
        actor_email,
        action,
        entity,
        details
    ) VALUES (
        v_user_id,
        v_user_email,
        'CREATE_TRANSACTION',
        'transactions',
        jsonb_build_object(
            'transaction_id', v_tx_id,
            'type', p_type,
            'amount', p_amount,
            'description', p_description,
            'counterparty', p_counterparty
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'message', 'Transaksi berhasil dicatat ke dalam kas bersama.'
    );
END;
$$;

-- RPC: void_transaction
CREATE OR REPLACE FUNCTION void_transaction(
    p_transaction_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT;
    v_status TEXT;
    v_user_email TEXT;
    v_old_status TEXT;
    v_amount NUMERIC;
    v_desc TEXT;
BEGIN
    SELECT role, status, email INTO v_role, v_status, v_user_email
    FROM profiles WHERE id = v_user_id;

    IF v_user_id IS NULL OR v_status != 'approved' OR v_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya pengelola yang dapat membatalkan transaksi.';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) = 0 THEN
        RAISE EXCEPTION 'Alasan pembatalan transaksi wajib diisi.';
    END IF;

    SELECT status, amount, description INTO v_old_status, v_amount, v_desc
    FROM transactions WHERE id = p_transaction_id;

    IF v_old_status IS NULL THEN
        RAISE EXCEPTION 'Transaksi tidak ditemukan.';
    END IF;

    IF v_old_status = 'void' THEN
        RAISE EXCEPTION 'Transaksi ini sudah dalam status dibatalkan (void).';
    END IF;

    UPDATE transactions
    SET status = 'void',
        void_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_transaction_id;

    INSERT INTO audit_logs (
        actor_id,
        actor_email,
        action,
        entity,
        details
    ) VALUES (
        v_user_id,
        v_user_email,
        'VOID_TRANSACTION',
        'transactions',
        jsonb_build_object(
            'transaction_id', p_transaction_id,
            'amount', v_amount,
            'description', v_desc,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object('success', true, 'message', 'Transaksi berhasil dibatalkan (void).');
END;
$$;

-- RPC: mark_my_notifications_read
CREATE OR REPLACE FUNCTION mark_my_notifications_read()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_count INT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE notifications
    SET read_at = NOW()
    WHERE recipient_id = v_user_id AND read_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'updated_count', v_count);
END;
$$;

-- RPC: broadcast_announcement
CREATE OR REPLACE FUNCTION broadcast_announcement(
    p_title TEXT,
    p_body TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT;
    v_status TEXT;
    v_user_email TEXT;
    v_recipients_count INT := 0;
BEGIN
    SELECT role, status, email INTO v_role, v_status, v_user_email
    FROM profiles WHERE id = v_user_id;

    IF v_user_id IS NULL OR v_status != 'approved' OR v_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya pengelola yang dapat mengirim pengumuman.';
    END IF;

    IF LENGTH(TRIM(p_title)) = 0 OR LENGTH(TRIM(p_body)) = 0 THEN
        RAISE EXCEPTION 'Judul dan isi pengumuman tidak boleh kosong.';
    END IF;

    INSERT INTO notifications (recipient_id, title, body, type, created_by)
    SELECT id, p_title, p_body, 'announcement', v_user_id
    FROM profiles
    WHERE status = 'approved';

    GET DIAGNOSTICS v_recipients_count = ROW_COUNT;

    INSERT INTO audit_logs (
        actor_id,
        actor_email,
        action,
        entity,
        details
    ) VALUES (
        v_user_id,
        v_user_email,
        'BROADCAST_ANNOUNCEMENT',
        'notifications',
        jsonb_build_object(
            'title', p_title,
            'recipients_count', v_recipients_count
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'recipients_count', v_recipients_count,
        'message', format('Pengumuman berhasil disiarkan ke %s anggota.', v_recipients_count)
    );
END;
$$;

-- RPC: update_member_role (Max 4 Admin + 1 Super Admin = 5 managers total)
CREATE OR REPLACE FUNCTION update_member_role(
    p_target_member_id UUID,
    p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_email TEXT;
    v_target_email TEXT;
    v_target_old_role TEXT;
    v_admin_count INT;
BEGIN
    SELECT role, email INTO v_caller_role, v_caller_email
    FROM profiles WHERE id = v_caller_id;

    IF v_caller_id IS NULL OR v_caller_role != 'super_admin' THEN
        RAISE EXCEPTION 'Hanya Super Admin yang berhak mengubah peran pengelola.';
    END IF;

    IF p_new_role NOT IN ('super_admin', 'admin', 'member') THEN
        RAISE EXCEPTION 'Role tidak valid.';
    END IF;

    SELECT email, role INTO v_target_email, v_target_old_role
    FROM profiles WHERE id = p_target_member_id;

    IF v_target_email IS NULL THEN
        RAISE EXCEPTION 'Anggota tidak ditemukan.';
    END IF;

    IF p_new_role = 'admin' AND v_target_old_role != 'admin' THEN
        SELECT COUNT(*) INTO v_admin_count FROM profiles WHERE role = 'admin';
        IF v_admin_count >= 4 THEN
            RAISE EXCEPTION 'Batas kuota tercapai: Maksimal 4 Admin biasa dalam SBBL (Total 5 Pengelola).';
        END IF;
    END IF;

    IF p_new_role = 'super_admin' THEN
        UPDATE profiles SET role = 'admin' WHERE role = 'super_admin';
    END IF;

    UPDATE profiles
    SET role = p_new_role,
        updated_at = NOW()
    WHERE id = p_target_member_id;

    INSERT INTO audit_logs (
        actor_id,
        actor_email,
        action,
        entity,
        details
    ) VALUES (
        v_caller_id,
        v_caller_email,
        'UPDATE_MEMBER_ROLE',
        'profiles',
        jsonb_build_object(
            'target_member_id', p_target_member_id,
            'target_email', v_target_email,
            'old_role', v_target_old_role,
            'new_role', p_new_role
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Role anggota %s berhasil diubah menjadi %s.', v_target_email, p_new_role)
    );
END;
$$;

-- RPC: update_member_status
CREATE OR REPLACE FUNCTION update_member_status(
    p_target_member_id UUID,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_email TEXT;
    v_target_email TEXT;
    v_target_old_status TEXT;
BEGIN
    SELECT role, email INTO v_caller_role, v_caller_email
    FROM profiles WHERE id = v_caller_id;

    IF v_caller_id IS NULL OR v_caller_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya pengelola yang dapat mengubah status anggota.';
    END IF;

    IF p_new_status NOT IN ('approved', 'pending', 'suspended', 'rejected') THEN
        RAISE EXCEPTION 'Status tidak valid.';
    END IF;

    IF p_new_status = 'suspended' AND (p_reason IS NULL OR LENGTH(TRIM(p_reason)) = 0) THEN
        RAISE EXCEPTION 'Penonaktifan akun (suspend) wajib menyertakan alasan.';
    END IF;

    SELECT email, status INTO v_target_email, v_target_old_status
    FROM profiles WHERE id = p_target_member_id;

    IF v_target_email IS NULL THEN
        RAISE EXCEPTION 'Anggota tidak ditemukan.';
    END IF;

    UPDATE profiles
    SET status = p_new_status,
        suspension_reason = CASE WHEN p_new_status = 'suspended' THEN p_reason ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_target_member_id;

    INSERT INTO audit_logs (
        actor_id,
        actor_email,
        action,
        entity,
        details
    ) VALUES (
        v_caller_id,
        v_caller_email,
        'UPDATE_MEMBER_STATUS',
        'profiles',
        jsonb_build_object(
            'target_member_id', p_target_member_id,
            'target_email', v_target_email,
            'old_status', v_target_old_status,
            'new_status', p_new_status,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Status anggota %s berhasil diperbarui menjadi %s.', v_target_email, p_new_status)
    );
END;
$$;

-- RPC: trigger_weekly_contribution_reminder (Thursday 09:00 WITA)
CREATE OR REPLACE FUNCTION trigger_weekly_contribution_reminder()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_idempotency_key TEXT;
    v_already_executed BOOLEAN;
    v_count INT := 0;
    v_current_wita TIMESTAMPTZ := NOW() AT TIME ZONE 'Asia/Makassar';
BEGIN
    v_idempotency_key := 'weekly-reminder-' || TO_CHAR(v_current_wita, 'IYYY-IW');

    SELECT EXISTS (
        SELECT 1 FROM delivery_logs WHERE idempotency_key = v_idempotency_key AND status = 'success'
    ) INTO v_already_executed;

    IF v_already_executed THEN
        RETURN jsonb_build_object(
            'success', true,
            'skipped', true,
            'message', 'Pengingat iuran minggu ini sudah terkirim sebelumnya (Idempotent).'
        );
    END IF;

    INSERT INTO delivery_logs (job_name, status, details, idempotency_key)
    VALUES ('weekly_contribution_reminder', 'running', 'Memulai pengiriman notifikasi pengingat iuran Rp10.000', v_idempotency_key);

    INSERT INTO notifications (recipient_id, title, body, type)
    SELECT 
        id, 
        'Pengingat Iuran Kas Mingguan SBBL', 
        'Halo! Hari ini Kamis adalah jadwal iuran kas bersama SBBL sebesar Rp 10.000. Mohon transfer ke rekening kas atau serahkan kepada bendahara. Terima kasih!', 
        'contribution_reminder'
    FROM profiles
    WHERE status = 'approved';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE delivery_logs
    SET status = 'success',
        recipients_count = v_count,
        details = format('Berhasil mengirim pengingat kepada %s anggota approved.', v_count)
    WHERE idempotency_key = v_idempotency_key;

    UPDATE scheduled_jobs
    SET last_run_at = NOW(),
        next_run_at = NOW() + INTERVAL '7 days'
    WHERE job_name = 'weekly_contribution_reminder';

    RETURN jsonb_build_object(
        'success', true,
        'recipients_count', v_count,
        'message', format('Pengingat iuran mingguan sukses terkirim ke %s anggota.', v_count)
    );
EXCEPTION WHEN OTHERS THEN
    UPDATE delivery_logs
    SET status = 'failed',
        details = SQLERRM
    WHERE idempotency_key = v_idempotency_key;

    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. AUTOMATIC PROFILE TRIGGER (ON GOOGLE AUTH SIGNUP)
-- The FIRST registered user automatically becomes SUPER_ADMIN & APPROVED!
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_is_first_user BOOLEAN;
    v_user_name TEXT;
    v_avatar TEXT;
BEGIN
    SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO v_is_first_user;

    v_user_name := COALESCE(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        split_part(new.email, '@', 1)
    );

    v_avatar := COALESCE(
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'picture'
    );

    INSERT INTO public.profiles (id, full_name, email, avatar_url, role, status)
    VALUES (
        new.id,
        v_user_name,
        new.email,
        v_avatar,
        CASE WHEN v_is_first_user THEN 'super_admin' ELSE 'member' END,
        CASE WHEN v_is_first_user THEN 'approved' ELSE 'pending' END
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 13. ENABLE SUPABASE REALTIME REPLICATION FOR LIVE UPDATES
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE system_settings;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 14. SEED INITIAL SYSTEM DATA
-- ------------------------------------------------------------------------------
INSERT INTO system_settings (key, value, description)
VALUES 
    ('opening_balance', '{"amount": 500000, "currency": "IDR", "notes": "Saldo awal pembukuan kas SBBL"}', 'Saldo awal pembukuan kas'),
    ('bank_accounts', '[
        {"bank_name": "Bank Central Asia (BCA)", "account_number": "8720194821", "holder_name": "KAS BERSAMA SBBL"},
        {"bank_name": "Bank Mandiri", "account_number": "1420019283741", "holder_name": "KAS BERSAMA SBBL"},
        {"bank_name": "QRIS SBBL", "account_number": "NMID-938172948172", "holder_name": "KAS SBBL"}
    ]', 'Daftar rekening bank / sumber kas resmi'),
    ('weekly_contribution_config', '{"amount": 10000, "day": "Thursday", "time": "09:00", "timezone": "Asia/Makassar"}', 'Aturan iuran mingguan')
ON CONFLICT (key) DO NOTHING;

INSERT INTO categories (name, type, is_active) VALUES
    ('Iuran Mingguan Anggota', 'income', TRUE),
    ('Donasi & Sumbangan', 'income', TRUE),
    ('Bunga Kas & Bagi Hasil', 'income', TRUE),
    ('Pemasukan Lainnya', 'income', TRUE),
    ('Konsumsi Kegiatan', 'expense', TRUE),
    ('Alat Tulis Kantor & Cetak', 'expense', TRUE),
    ('Operasional & Transportasi', 'expense', TRUE),
    ('Bantuan Sosial Anggota', 'expense', TRUE),
    ('Biaya Administrasi & Bank', 'expense', TRUE),
    ('Pengeluaran Lainnya', 'expense', TRUE)
ON CONFLICT (name, type) DO NOTHING;

INSERT INTO scheduled_jobs (job_name, description, cron_expression, timezone, is_active)
VALUES (
    'weekly_contribution_reminder',
    'Pengingat iuran mingguan Rp10.000 setiap Kamis pukul 09.00 WITA',
    '0 1 * * 4',
    'Asia/Makassar',
    TRUE
)
ON CONFLICT (job_name) DO NOTHING;

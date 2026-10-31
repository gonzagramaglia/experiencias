-- ============================================================
-- EXPERIENCIAS.CLUB • Supabase Schema
-- Separación: 1. Tabla waitlist (Prospectos) y 2. Tabla socios (Miembros)
-- ============================================================
-- 1. waitlist: Tabla sencilla para recopilar mails en la landing (/)
-- 2. socios: Tabla de socios emergentes, plenos y fundadores con número de socio (arranca en 100)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TABLA: waitlist (Recopilación inicial ágil desde la landing)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.waitlist (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE,
  converted            BOOLEAN NOT NULL DEFAULT false,
  google_linked        BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS google_linked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist(email);

-- ============================================================
-- 2. SECUENCIA Y TABLA: socios (Socios Emergentes del Club)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.socios_position_seq START WITH 100;

CREATE TABLE IF NOT EXISTS public.socios (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE,
  full_name            TEXT NOT NULL,
  dni                  TEXT NOT NULL,
  phone                TEXT NOT NULL,
  experiences_wishlist JSONB DEFAULT '[]'::jsonb,
  experiences_other    TEXT,
  position             INTEGER DEFAULT nextval('public.socios_position_seq') UNIQUE,
  membership_tier      TEXT NOT NULL DEFAULT 'emergente'
                       CHECK (membership_tier IN ('emergente', 'activo', 'fundador')),
  auth_user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Para login con Google
  google_linked        BOOLEAN NOT NULL DEFAULT false,
  registration_token   UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS google_linked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_token UUID NOT NULL DEFAULT gen_random_uuid();

-- Asegurar que la secuencia continúe desde el máximo actual (o arranque en 100 si no hay socios)
SELECT setval(
  'public.socios_position_seq',
  GREATEST(COALESCE((SELECT MAX(position) FROM public.socios), 99), 99),
  true
);

CREATE INDEX IF NOT EXISTS idx_socios_email    ON public.socios(email);
CREATE INDEX IF NOT EXISTS idx_socios_position ON public.socios(position);

-- Normalización de datos existentes antes de crear índice único de DNI
UPDATE public.waitlist
SET email = LOWER(TRIM(email)),
    converted = CASE WHEN google_linked = true THEN true ELSE converted END;

UPDATE public.socios
SET email = LOWER(TRIM(email)),
    full_name = TRIM(full_name),
    dni = regexp_replace(COALESCE(dni, ''), '\D', '', 'g'),
    phone = TRIM(COALESCE(phone, ''));

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_socios_dni_unique
    ON public.socios(dni)
    WHERE dni <> '';
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'Aviso: Ya existen filas con DNI duplicado en public.socios; el índice único idx_socios_dni_unique se omitió hasta limpiar duplicados.';
END;
$$;

-- Trigger de normalización estricta en waitlist
CREATE OR REPLACE FUNCTION public.normalize_waitlist_row()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email = LOWER(TRIM(NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS waitlist_normalize_before_write ON public.waitlist;
CREATE TRIGGER waitlist_normalize_before_write
  BEFORE INSERT OR UPDATE ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.normalize_waitlist_row();

-- Trigger de normalización estricta en socios
CREATE OR REPLACE FUNCTION public.normalize_socio_row()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email = LOWER(TRIM(NEW.email));
  NEW.full_name = TRIM(COALESCE(NEW.full_name, ''));
  NEW.dni = regexp_replace(COALESCE(NEW.dni, ''), '\D', '', 'g');
  NEW.phone = TRIM(COALESCE(NEW.phone, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS socios_normalize_before_write ON public.socios;
CREATE TRIGGER socios_normalize_before_write
  BEFORE INSERT OR UPDATE ON public.socios
  FOR EACH ROW EXECUTE FUNCTION public.normalize_socio_row();

-- Trigger para updated_at automático en socios
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS socios_updated_at ON public.socios;
CREATE TRIGGER socios_updated_at
  BEFORE UPDATE ON public.socios
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger al registrarse o actualizarse en socios: sincroniza google_linked y valida si ya tiene pago (converted)
CREATE OR REPLACE FUNCTION public.handle_socio_registered()
RETURNS TRIGGER AS $$
DECLARE
  v_has_paid BOOLEAN := false;
BEGIN
  SELECT true INTO v_has_paid
  FROM public.pagos_transferencias
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
  LIMIT 1;

  INSERT INTO public.waitlist (email, converted, google_linked)
  VALUES (
    LOWER(TRIM(NEW.email)),
    COALESCE(v_has_paid, false),
    COALESCE(NEW.google_linked, false) OR (NEW.auth_user_id IS NOT NULL)
  )
  ON CONFLICT (email) DO UPDATE
  SET google_linked = public.waitlist.google_linked OR EXCLUDED.google_linked,
      converted = public.waitlist.converted OR COALESCE(v_has_paid, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_socio_created_mark_waitlist ON public.socios;
CREATE TRIGGER on_socio_created_mark_waitlist
  AFTER INSERT OR UPDATE OF email, auth_user_id, google_linked ON public.socios
  FOR EACH ROW EXECUTE FUNCTION public.handle_socio_registered();

-- ============================================================
-- VINCULACIÓN AUTOMÁTICA CON SUPABASE AUTH (Google OAuth / Email)
-- ============================================================
-- 1. Cuando el usuario inicia sesión con Google en auth.users, vincula auth_user_id y google_linked en socios y waitlist:
CREATE OR REPLACE FUNCTION public.handle_user_auth_link()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.socios
  SET auth_user_id = NEW.id,
      google_linked = true
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
    AND (auth_user_id IS NULL OR auth_user_id != NEW.id OR google_linked = false);

  UPDATE public.waitlist
  SET google_linked = true
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
    AND google_linked = false;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_link_socio ON auth.users;
CREATE TRIGGER on_auth_user_created_link_socio
  AFTER INSERT OR UPDATE OF email, last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_auth_link();

-- 2. Si el usuario ya existe en auth.users al registrarse o actualizarse en socios, asigna auth_user_id y google_linked:
CREATE OR REPLACE FUNCTION public.link_socio_to_existing_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  matching_auth_id UUID;
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    SELECT id INTO matching_auth_id
    FROM auth.users
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
    LIMIT 1;

    IF matching_auth_id IS NOT NULL THEN
      NEW.auth_user_id = matching_auth_id;
    END IF;
  END IF;

  IF NEW.auth_user_id IS NOT NULL THEN
    NEW.google_linked = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS before_socio_insert_link_auth ON public.socios;
CREATE TRIGGER before_socio_insert_link_auth
  BEFORE INSERT OR UPDATE ON public.socios
  FOR EACH ROW EXECUTE FUNCTION public.link_socio_to_existing_auth_user();

-- Sincronización retroactiva para registros existentes
UPDATE public.socios s
SET auth_user_id = u.id,
    google_linked = true
FROM auth.users u
WHERE LOWER(TRIM(s.email)) = LOWER(TRIM(u.email));

UPDATE public.socios
SET google_linked = true
WHERE auth_user_id IS NOT NULL AND google_linked = false;

UPDATE public.waitlist w
SET converted = true,
    google_linked = w.google_linked OR s.google_linked OR (s.auth_user_id IS NOT NULL)
FROM public.socios s
WHERE LOWER(TRIM(w.email)) = LOWER(TRIM(s.email));

UPDATE public.waitlist w
SET google_linked = true
FROM auth.users u
WHERE LOWER(TRIM(w.email)) = LOWER(TRIM(u.email)) AND w.google_linked = false;

-- ============================================================
-- VISTA PÚBLICA DE ESTADÍSTICAS
-- ============================================================
CREATE OR REPLACE VIEW public.waitlist_stats AS
SELECT
  COUNT(*)                                  AS total_members,
  COALESCE(MAX(position), 100)              AS max_position
FROM public.socios;

-- ============================================================
-- SEGURIDAD (Row Level Security - RLS) Y FUNCIONES RPC SEGURAS
-- ============================================================
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas previas de waitlist y socios
DROP POLICY IF EXISTS "Permitir guardar email en waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Permitir consultar waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Permitir actualizar waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Permitir consultar waitlist propio" ON public.waitlist;
DROP POLICY IF EXISTS "Permitir actualizar waitlist propio" ON public.waitlist;

DROP POLICY IF EXISTS "Permitir registro de socios" ON public.socios;
DROP POLICY IF EXISTS "Permitir consultar socios" ON public.socios;
DROP POLICY IF EXISTS "Permitir actualizar socios" ON public.socios;
DROP POLICY IF EXISTS "Permitir consultar socio propio autenticado" ON public.socios;
DROP POLICY IF EXISTS "Permitir actualizar socio propio autenticado" ON public.socios;

-- Políticas para waitlist: inserción ágil pública, lectura/edición directa solo del propio usuario autenticado
CREATE POLICY "Permitir guardar email en waitlist"
  ON public.waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Permitir consultar waitlist propio"
  ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = email);

CREATE POLICY "Permitir actualizar waitlist propio"
  ON public.waitlist
  FOR UPDATE
  TO authenticated
  USING (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = email)
  WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = email);

-- Políticas para socios: lectura y edición directa en tabla restringida al propio socio autenticado con Google/Supabase Auth
CREATE POLICY "Permitir consultar socio propio autenticado"
  ON public.socios
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = email
  );

CREATE POLICY "Permitir actualizar socio propio autenticado"
  ON public.socios
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = auth_user_id
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = email
  )
  WITH CHECK (
    auth.uid() = auth_user_id
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = email
  );

-- ============================================================
-- FUNCIONES RPC (SECURITY DEFINER) PARA EL FLUJO DE REGISTRO Y LOGIN
-- ============================================================

-- 1. Registrar o actualizar correo en waitlist de forma atómica y segura
CREATE OR REPLACE FUNCTION public.record_waitlist_email(
  p_email TEXT,
  p_google_linked BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
BEGIN
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;

  INSERT INTO public.waitlist (email, converted, google_linked)
  VALUES (v_email, false, COALESCE(p_google_linked, false))
  ON CONFLICT (email) DO UPDATE
  SET google_linked = public.waitlist.google_linked OR EXCLUDED.google_linked;

  RETURN jsonb_build_object('success', true, 'email', v_email);
END;
$$;

-- 2. Consultar estado de registro de un correo sin exponer datos sensibles (DNI, teléfono, nombre)
CREATE OR REPLACE FUNCTION public.check_email_registration_status(
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_in_socios BOOLEAN := false;
  v_in_waitlist BOOLEAN := false;
  v_google_linked BOOLEAN := false;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object(
      'in_socios', false,
      'in_waitlist', false,
      'google_linked', false
    );
  END IF;

  SELECT true, COALESCE(s.google_linked, s.auth_user_id IS NOT NULL, false)
  INTO v_in_socios, v_google_linked
  FROM public.socios s
  WHERE s.email = v_email
  LIMIT 1;

  IF NOT FOUND THEN
    v_in_socios := false;
  END IF;

  SELECT true, COALESCE(v_google_linked, false) OR COALESCE(w.google_linked, false)
  INTO v_in_waitlist, v_google_linked
  FROM public.waitlist w
  WHERE w.email = v_email
  LIMIT 1;

  IF NOT FOUND THEN
    v_in_waitlist := false;
  END IF;

  RETURN jsonb_build_object(
    'in_socios', COALESCE(v_in_socios, false),
    'in_waitlist', COALESCE(v_in_waitlist, false),
    'google_linked', COALESCE(v_google_linked, false)
  );
END;
$$;

-- 3. Registrar Socio Emergente de forma atómica (valida email y DNI únicos y marca converted=true en waitlist)
CREATE OR REPLACE FUNCTION public.register_emergente_socio(
  p_email TEXT,
  p_full_name TEXT,
  p_dni TEXT,
  p_phone TEXT,
  p_experiences_wishlist JSONB DEFAULT '[]'::jsonb,
  p_experiences_other TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_name TEXT := TRIM(COALESCE(p_full_name, ''));
  v_dni TEXT := regexp_replace(COALESCE(p_dni, ''), '\D', '', 'g');
  v_phone TEXT := TRIM(COALESCE(p_phone, ''));
  v_jwt_email TEXT := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
  v_auth_uid UUID := auth.uid();
  v_inserted public.socios%ROWTYPE;
BEGIN
  IF v_email = '' OR v_name = '' OR length(v_dni) < 7 OR length(v_dni) > 9 OR v_phone = '' THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  IF EXISTS (SELECT 1 FROM public.socios WHERE email = v_email) THEN
    UPDATE public.socios
    SET full_name = CASE WHEN v_name <> '' THEN v_name ELSE full_name END,
        dni = CASE WHEN v_dni <> '' THEN v_dni ELSE dni END,
        phone = CASE WHEN v_phone <> '' THEN v_phone ELSE phone END,
        experiences_wishlist = CASE WHEN p_experiences_wishlist IS NOT NULL THEN p_experiences_wishlist ELSE experiences_wishlist END,
        experiences_other = CASE WHEN p_experiences_other IS NOT NULL AND TRIM(p_experiences_other) <> '' THEN TRIM(p_experiences_other) ELSE experiences_other END,
        auth_user_id = CASE WHEN v_auth_uid IS NOT NULL AND v_jwt_email = v_email THEN v_auth_uid ELSE auth_user_id END,
        google_linked = CASE WHEN v_auth_uid IS NOT NULL AND v_jwt_email = v_email THEN true ELSE google_linked END,
        updated_at = now()
    WHERE email = v_email
    RETURNING * INTO v_inserted;

    RETURN jsonb_build_object(
      'status', 'created',
      'socio', to_jsonb(v_inserted)
    );
  END IF;

  IF EXISTS (SELECT 1 FROM public.socios WHERE dni = v_dni AND dni <> '') THEN
    RETURN jsonb_build_object('status', 'already_registered_dni');
  END IF;

  INSERT INTO public.socios (
    email,
    full_name,
    dni,
    phone,
    experiences_wishlist,
    experiences_other,
    membership_tier,
    auth_user_id,
    google_linked
  )
  VALUES (
    v_email,
    v_name,
    v_dni,
    v_phone,
    COALESCE(p_experiences_wishlist, '[]'::jsonb),
    NULLIF(TRIM(COALESCE(p_experiences_other, '')), ''),
    'emergente',
    CASE WHEN v_auth_uid IS NOT NULL AND v_jwt_email = v_email THEN v_auth_uid ELSE NULL END,
    CASE WHEN v_auth_uid IS NOT NULL AND v_jwt_email = v_email THEN true ELSE false END
  )
  RETURNING * INTO v_inserted;

  INSERT INTO public.waitlist (email, converted, google_linked)
  VALUES (
    v_email,
    EXISTS (SELECT 1 FROM public.pagos_transferencias WHERE LOWER(TRIM(email)) = v_email),
    v_inserted.google_linked
  )
  ON CONFLICT (email) DO UPDATE
  SET converted = public.waitlist.converted OR EXISTS (SELECT 1 FROM public.pagos_transferencias WHERE LOWER(TRIM(email)) = v_email),
      google_linked = public.waitlist.google_linked OR EXCLUDED.google_linked;

  RETURN jsonb_build_object(
    'status', 'created',
    'socio', to_jsonb(v_inserted)
  );
END;
$$;

-- 4. Obtener socio de forma segura (requiere sesión de Google activa o el registration_token del dispositivo que lo creó)
CREATE OR REPLACE FUNCTION public.get_socio_by_session_or_token(
  p_email TEXT,
  p_registration_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_jwt_email TEXT := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
  v_auth_uid UUID := auth.uid();
  v_socio public.socios%ROWTYPE;
BEGIN
  SELECT * INTO v_socio
  FROM public.socios
  WHERE email = v_email
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Autorizado si tiene sesión de Supabase Auth coincidente
  IF v_auth_uid IS NOT NULL AND (v_socio.auth_user_id = v_auth_uid OR v_jwt_email = v_email) THEN
    IF v_socio.auth_user_id IS NULL OR v_socio.google_linked = false THEN
      UPDATE public.socios
      SET auth_user_id = v_auth_uid,
          google_linked = true
      WHERE id = v_socio.id
      RETURNING * INTO v_socio;
    END IF;
    RETURN jsonb_build_object('status', 'ok', 'socio', to_jsonb(v_socio));
  END IF;

  -- Autorizado si aún no vinculó Google y presenta el registration_token emitido al registrarse
  IF v_socio.google_linked = false
     AND p_registration_token IS NOT NULL
     AND v_socio.registration_token = p_registration_token THEN
    RETURN jsonb_build_object('status', 'ok', 'socio', to_jsonb(v_socio));
  END IF;

  RETURN jsonb_build_object('status', 'unauthorized');
END;
$$;

-- 5. Actualizar perfil de socio de forma segura (exige JWT de Google o registration_token válido)
CREATE OR REPLACE FUNCTION public.update_socio_profile_secure(
  p_email TEXT,
  p_registration_token UUID DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_dni TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_experiences_wishlist JSONB DEFAULT NULL,
  p_experiences_other TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_jwt_email TEXT := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
  v_auth_uid UUID := auth.uid();
  v_clean_dni TEXT := regexp_replace(COALESCE(p_dni, ''), '\D', '', 'g');
  v_socio public.socios%ROWTYPE;
  v_is_authorized BOOLEAN := false;
BEGIN
  SELECT * INTO v_socio
  FROM public.socios
  WHERE email = v_email
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_auth_uid IS NOT NULL AND (v_socio.auth_user_id = v_auth_uid OR v_jwt_email = v_email) THEN
    v_is_authorized := true;
  ELSIF v_socio.google_linked = false
        AND p_registration_token IS NOT NULL
        AND v_socio.registration_token = p_registration_token THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;

  IF v_clean_dni <> '' AND EXISTS (
    SELECT 1 FROM public.socios
    WHERE dni = v_clean_dni AND id <> v_socio.id
  ) THEN
    RETURN jsonb_build_object('status', 'dni_conflict');
  END IF;

  UPDATE public.socios
  SET full_name = COALESCE(NULLIF(TRIM(p_full_name), ''), full_name),
      dni = CASE WHEN v_clean_dni <> '' THEN v_clean_dni ELSE dni END,
      phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
      experiences_wishlist = COALESCE(p_experiences_wishlist, experiences_wishlist),
      experiences_other = p_experiences_other,
      auth_user_id = COALESCE(auth_user_id, CASE WHEN v_auth_uid IS NOT NULL AND v_jwt_email = v_email THEN v_auth_uid ELSE NULL END),
      google_linked = google_linked OR (v_auth_uid IS NOT NULL AND v_jwt_email = v_email),
      updated_at = now()
  WHERE id = v_socio.id
  RETURNING * INTO v_socio;

  RETURN jsonb_build_object('status', 'updated', 'socio', to_jsonb(v_socio));
END;
$$;

-- Permisos para API de Supabase
GRANT SELECT, INSERT, UPDATE ON public.waitlist TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.socios TO anon, authenticated;
GRANT SELECT ON public.waitlist_stats TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.socios_position_seq TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_waitlist_email(TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_registration_status(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_emergente_socio(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_socio_by_session_or_token(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_socio_profile_secure(TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;

-- ============================================================
-- 3. TABLA Y COLUMNAS: Postulaciones de Socios Fundadores
--    (con teléfono obligatorio y adhesión al protocolo)
-- ============================================================
ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS founder_motivation_letter TEXT,
  ADD COLUMN IF NOT EXISTS founder_agreed_to_protocol BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founder_application_status TEXT
    CHECK (founder_application_status IN ('pendiente', 'aprobado', 'rechazado'));

-- Asegurar que phone sea obligatorio (NOT NULL) en socios
UPDATE public.socios SET phone = '' WHERE phone IS NULL;
ALTER TABLE public.socios ALTER COLUMN phone SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.postulaciones_fundadores (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name            TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT NOT NULL, -- Obligatorio
  motivation_letter    TEXT NOT NULL,
  agreed_to_protocol   BOOLEAN NOT NULL DEFAULT true CHECK (agreed_to_protocol = true),
  status               TEXT NOT NULL DEFAULT 'en_evaluacion'
                       CHECK (status IN ('en_evaluacion', 'aprobada', 'rechazada')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Si la tabla ya existía con phone nullable, actualizarla a NOT NULL
UPDATE public.postulaciones_fundadores SET phone = '' WHERE phone IS NULL;
ALTER TABLE public.postulaciones_fundadores ALTER COLUMN phone SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_postulaciones_fundadores_email ON public.postulaciones_fundadores(email);

DROP TRIGGER IF EXISTS postulaciones_fundadores_updated_at ON public.postulaciones_fundadores;
CREATE TRIGGER postulaciones_fundadores_updated_at
  BEFORE UPDATE ON public.postulaciones_fundadores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.postulaciones_fundadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir envío de postulaciones de fundadores" ON public.postulaciones_fundadores;
CREATE POLICY "Permitir envío de postulaciones de fundadores"
  ON public.postulaciones_fundadores
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir consultar postulaciones de fundadores" ON public.postulaciones_fundadores;
CREATE POLICY "Permitir consultar postulaciones de fundadores"
  ON public.postulaciones_fundadores
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT, INSERT ON public.postulaciones_fundadores TO anon, authenticated;

-- ============================================================
-- 4. TABLA: Postulaciones de Prestadores & Guías Locales (/experiencias/prestadores)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.postulaciones_prestadores (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name            TEXT NOT NULL, -- Nombre y Apellido / Razón Social
  category             TEXT NOT NULL DEFAULT 'guia_montaña'
                       CHECK (category IN (
                         'guia_montaña',
                         'kayak_nautica',
                         'transporte_4x4',
                         'alojamiento',
                         'gastronomia',
                         'fotografia',
                         'cabalgatas',
                         'arqueologia',
                         'artesanias'
                       )),
  region               TEXT NOT NULL DEFAULT 'Puna & Fiambalá',
  email                TEXT NOT NULL,
  phone                TEXT NOT NULL,
  website              TEXT NOT NULL,
  description          TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pendiente'
                       CHECK (status IN ('pendiente', 'aprobado', 'rechazado')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_postulaciones_prestadores_email    ON public.postulaciones_prestadores(email);
CREATE INDEX IF NOT EXISTS idx_postulaciones_prestadores_category ON public.postulaciones_prestadores(category);
CREATE INDEX IF NOT EXISTS idx_postulaciones_prestadores_region   ON public.postulaciones_prestadores(region);

DROP TRIGGER IF EXISTS postulaciones_prestadores_updated_at ON public.postulaciones_prestadores;
CREATE TRIGGER postulaciones_prestadores_updated_at
  BEFORE UPDATE ON public.postulaciones_prestadores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.postulaciones_prestadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir envío de postulaciones de prestadores" ON public.postulaciones_prestadores;
CREATE POLICY "Permitir envío de postulaciones de prestadores"
  ON public.postulaciones_prestadores
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir consultar postulaciones de prestadores" ON public.postulaciones_prestadores;
CREATE POLICY "Permitir consultar postulaciones de prestadores"
  ON public.postulaciones_prestadores
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT, INSERT ON public.postulaciones_prestadores TO anon, authenticated;

-- ============================================================
-- 5. TABLA: Experiencias Oficiales del Club (public.experiencias_club)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.experiencias_club (
  id                   TEXT PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  short_title          TEXT,
  tagline              TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  region               TEXT NOT NULL DEFAULT 'Valle Central y Ambato',
  meeting_point        TEXT NOT NULL DEFAULT '',
  difficulty           TEXT NOT NULL DEFAULT 'Baja'
                       CHECK (difficulty IN ('Baja', 'Moderada', 'Exigente', 'Alta Montaña')),
  duration_label       TEXT NOT NULL DEFAULT '4 horas',
  price_ars            INTEGER NOT NULL DEFAULT 65000 CHECK (price_ars >= 0),
  capacity_per_date    INTEGER NOT NULL DEFAULT 12 CHECK (capacity_per_date >= 1),
  dates                JSONB NOT NULL DEFAULT '[]'::jsonb,
  status               TEXT NOT NULL DEFAULT 'publicada'
                       CHECK (status IN ('borrador', 'publicada')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiencias_club_slug ON public.experiencias_club(slug);

DROP TRIGGER IF EXISTS experiencias_club_updated_at ON public.experiencias_club;
CREATE TRIGGER experiencias_club_updated_at
  BEFORE UPDATE ON public.experiencias_club
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Semilla idempotente de la experiencia inaugural de Kayak
INSERT INTO public.experiencias_club (
  id,
  slug,
  title,
  short_title,
  tagline,
  description,
  region,
  meeting_point,
  difficulty,
  duration_label,
  price_ars,
  capacity_per_date,
  dates,
  status
)
VALUES (
  'exp-kayak',
  'kayak',
  'Travesía en Kayak & Sunset en el Dique El Jumeal',
  'Travesía en Kayak',
  'Remada guiada al atardecer con brindis de productos catamarqueños.',
  'Remada guiada en kayak en aguas calmas rodeadas de quebradas y vegetación de yungas andinas. Presenciamos la caída del sol reflejada en el dique y cerramos con un brindis.',
  'Valle Central y Ambato',
  'Club Náutico Dique El Jumeal',
  'Baja',
  '4 horas',
  65000,
  12,
  jsonb_build_array(
    to_char((CURRENT_DATE + INTERVAL '9 days'), 'YYYY-MM-DD'),
    to_char((CURRENT_DATE + INTERVAL '16 days'), 'YYYY-MM-DD'),
    to_char((CURRENT_DATE + INTERVAL '23 days'), 'YYYY-MM-DD')
  ),
  'publicada'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.experiencias_club ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica de experiencias_club" ON public.experiencias_club;
CREATE POLICY "Permitir lectura publica de experiencias_club"
  ON public.experiencias_club
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir crear y editar experiencias_club" ON public.experiencias_club;
CREATE POLICY "Permitir crear y editar experiencias_club"
  ON public.experiencias_club
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.experiencias_club TO anon, authenticated;

-- ============================================================
-- 6. TABLA: Pagos por Transferencia & Comprobantes en Cloudflare R2 (public.pagos_transferencias)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagos_transferencias (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reference                TEXT NOT NULL UNIQUE,
  experience_id            TEXT NOT NULL,
  experience_title         TEXT NOT NULL,
  date                     TEXT NOT NULL,
  participants             INTEGER NOT NULL CHECK (participants BETWEEN 1 AND 6),
  amount_ars               INTEGER NOT NULL CHECK (amount_ars >= 0),
  discount_code            TEXT,
  discount_ars             INTEGER DEFAULT 0,
  full_name                TEXT NOT NULL,
  email                    TEXT NOT NULL,
  dni                      TEXT NOT NULL,
  phone                    TEXT NOT NULL,
  socio_id                 UUID REFERENCES public.socios(id) ON DELETE SET NULL,
  receipt_file_name        TEXT NOT NULL,
  receipt_mime_type        TEXT NOT NULL,
  receipt_size_bytes       INTEGER NOT NULL CHECK (receipt_size_bytes > 0),
  receipt_url              TEXT NOT NULL,
  receipt_storage_key      TEXT,
  receipt_storage_provider TEXT NOT NULL DEFAULT 'r2'
                           CHECK (receipt_storage_provider IN ('r2', 'supabase', 'local')),
  status                   TEXT NOT NULL DEFAULT 'pendiente'
                           CHECK (status IN ('pendiente', 'aprobado', 'rechazado')),
  rejection_reason         TEXT,
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at              TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_transferencias_email         ON public.pagos_transferencias(email);
CREATE INDEX IF NOT EXISTS idx_pagos_transferencias_experience    ON public.pagos_transferencias(experience_id, date);
CREATE INDEX IF NOT EXISTS idx_pagos_transferencias_status        ON public.pagos_transferencias(status);
CREATE INDEX IF NOT EXISTS idx_pagos_transferencias_reference     ON public.pagos_transferencias(reference);

DROP TRIGGER IF EXISTS pagos_transferencias_updated_at ON public.pagos_transferencias;
CREATE TRIGGER pagos_transferencias_updated_at
  BEFORE UPDATE ON public.pagos_transferencias
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Normalización de email y DNI al insertar/actualizar pagos
CREATE OR REPLACE FUNCTION public.normalize_pago_transferencia_row()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email = LOWER(TRIM(COALESCE(NEW.email, '')));
  NEW.full_name = TRIM(COALESCE(NEW.full_name, ''));
  NEW.dni = regexp_replace(COALESCE(NEW.dni, ''), '\D', '', 'g');
  NEW.phone = TRIM(COALESCE(NEW.phone, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pagos_transferencias_normalize_before_write ON public.pagos_transferencias;
CREATE TRIGGER pagos_transferencias_normalize_before_write
  BEFORE INSERT OR UPDATE ON public.pagos_transferencias
  FOR EACH ROW EXECUTE FUNCTION public.normalize_pago_transferencia_row();

ALTER TABLE public.pagos_transferencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura de pagos propios autenticados" ON public.pagos_transferencias;
CREATE POLICY "Permitir lectura de pagos propios autenticados"
  ON public.pagos_transferencias
  FOR SELECT
  TO authenticated
  USING (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = email);

-- RPC 6.1: Registrar pago por transferencia y comprobante (vincula con socio si existe)
CREATE OR REPLACE FUNCTION public.submit_experience_transfer(
  p_reference TEXT,
  p_experience_id TEXT,
  p_experience_title TEXT,
  p_date TEXT,
  p_participants INTEGER,
  p_amount_ars INTEGER,
  p_discount_code TEXT DEFAULT NULL,
  p_discount_ars INTEGER DEFAULT 0,
  p_full_name TEXT DEFAULT '',
  p_email TEXT DEFAULT '',
  p_dni TEXT DEFAULT '',
  p_phone TEXT DEFAULT '',
  p_receipt_file_name TEXT DEFAULT 'comprobante',
  p_receipt_mime_type TEXT DEFAULT 'image/jpeg',
  p_receipt_size_bytes INTEGER DEFAULT 1,
  p_receipt_url TEXT DEFAULT '',
  p_receipt_storage_key TEXT DEFAULT NULL,
  p_receipt_storage_provider TEXT DEFAULT 'r2'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_dni TEXT := regexp_replace(COALESCE(p_dni, ''), '\D', '', 'g');
  v_socio_id UUID := NULL;
  v_capacity INTEGER := 12;
  v_reserved INTEGER := 0;
  v_inserted public.pagos_transferencias%ROWTYPE;
BEGIN
  IF v_email = '' OR TRIM(COALESCE(p_full_name, '')) = '' OR TRIM(COALESCE(p_receipt_url, '')) = '' THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  -- El email del pago debe ser el de la sesión Auth; nunca aceptar un email
  -- arbitrario enviado desde el navegador.
  IF auth.uid() IS NULL
     OR LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', ''))) <> v_email THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;

  SELECT capacity_per_date INTO v_capacity
  FROM public.experiencias_club
  WHERE id = p_experience_id
  LIMIT 1;

  IF v_capacity IS NULL THEN
    v_capacity := 12;
  END IF;

  SELECT COALESCE(SUM(participants), 0) INTO v_reserved
  FROM public.pagos_transferencias
  WHERE experience_id = p_experience_id
    AND date = p_date
    AND status <> 'rechazado';

  IF (v_reserved + p_participants) > v_capacity THEN
    RETURN jsonb_build_object('status', 'no_seats_available', 'available', GREATEST(0, v_capacity - v_reserved));
  END IF;

  SELECT id INTO v_socio_id
  FROM public.socios
  WHERE email = v_email
  LIMIT 1;

  INSERT INTO public.pagos_transferencias (
    reference,
    experience_id,
    experience_title,
    date,
    participants,
    amount_ars,
    discount_code,
    discount_ars,
    full_name,
    email,
    dni,
    phone,
    socio_id,
    receipt_file_name,
    receipt_mime_type,
    receipt_size_bytes,
    receipt_url,
    receipt_storage_key,
    receipt_storage_provider,
    status
  )
  VALUES (
    UPPER(TRIM(p_reference)),
    p_experience_id,
    p_experience_title,
    p_date,
    p_participants,
    p_amount_ars,
    NULLIF(TRIM(COALESCE(p_discount_code, '')), ''),
    COALESCE(p_discount_ars, 0),
    TRIM(p_full_name),
    v_email,
    v_dni,
    TRIM(p_phone),
    v_socio_id,
    p_receipt_file_name,
    p_receipt_mime_type,
    GREATEST(1, COALESCE(p_receipt_size_bytes, 1)),
    p_receipt_url,
    p_receipt_storage_key,
    CASE WHEN p_receipt_storage_provider IN ('r2', 'supabase', 'local') THEN p_receipt_storage_provider ELSE 'r2' END,
    'pendiente'
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'status', 'created',
    'submission', to_jsonb(v_inserted)
  );
END;
$$;

-- RPC 6.2: Consultar cupos reservados por fecha de una experiencia sin exponer datos personales
CREATE OR REPLACE FUNCTION public.get_reserved_seats_by_experience(
  p_experience_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'date', sub.date,
        'reserved_seats', sub.reserved_seats
      )
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT date, SUM(participants)::INTEGER AS reserved_seats
    FROM public.pagos_transferencias
    WHERE experience_id = p_experience_id
      AND status <> 'rechazado'
    GROUP BY date
  ) sub;

  RETURN v_result;
END;
$$;

-- RPC 6.3: Obtener comprobantes y reservas de un socio autenticado o con registration_token válido
CREATE OR REPLACE FUNCTION public.get_member_transfer_submissions(
  p_email TEXT,
  p_registration_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_jwt_email TEXT := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
  v_auth_uid UUID := auth.uid();
  v_socio public.socios%ROWTYPE;
  v_authorized BOOLEAN := false;
  v_items JSONB;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('status', 'unauthorized', 'submissions', '[]'::jsonb);
  END IF;

  IF v_auth_uid IS NOT NULL AND v_jwt_email = v_email THEN
    v_authorized := true;
  ELSE
    SELECT * INTO v_socio
    FROM public.socios
    WHERE email = v_email
    LIMIT 1;

    IF FOUND THEN
      IF v_auth_uid IS NOT NULL AND v_socio.auth_user_id = v_auth_uid THEN
        v_authorized := true;
      ELSIF v_socio.google_linked = false
            AND p_registration_token IS NOT NULL
            AND v_socio.registration_token = p_registration_token THEN
        v_authorized := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('status', 'unauthorized', 'submissions', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.submitted_at DESC), '[]'::jsonb)
  INTO v_items
  FROM public.pagos_transferencias t
  WHERE t.email = v_email;

  RETURN jsonb_build_object('status', 'ok', 'submissions', v_items);
END;
$$;

-- RPC 6.4: Listar envíos de comprobantes para el panel de prestadores (/prestador/comprobantes)
CREATE OR REPLACE FUNCTION public.list_provider_transfer_submissions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.submitted_at DESC), '[]'::jsonb)
  INTO v_items
  FROM public.pagos_transferencias t;

  RETURN jsonb_build_object('status', 'ok', 'submissions', v_items);
END;
$$;

-- RPC 6.5: Aprobar o rechazar comprobante desde el panel de prestador (y ascender socio emergente a activo al aprobar)
CREATE OR REPLACE FUNCTION public.review_transfer_submission(
  p_submission_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.pagos_transferencias%ROWTYPE;
BEGIN
  IF p_status NOT IN ('aprobado', 'rechazado') THEN
    RETURN jsonb_build_object('status', 'invalid_status');
  END IF;

  UPDATE public.pagos_transferencias
  SET status = p_status,
      rejection_reason = CASE WHEN p_status = 'rechazado' THEN NULLIF(TRIM(COALESCE(p_rejection_reason, '')), '') ELSE NULL END,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Si se aprueba el pago de una experiencia, el socio emergente pasa automáticamente a socio activo
  IF p_status = 'aprobado' THEN
    UPDATE public.socios
    SET membership_tier = 'activo',
        updated_at = now()
    WHERE (id = v_updated.socio_id OR email = v_updated.email)
      AND membership_tier = 'emergente';
  END IF;

  RETURN jsonb_build_object('status', 'updated', 'submission', to_jsonb(v_updated));
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.pagos_transferencias TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_experience_transfer(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reserved_seats_by_experience(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_transfer_submissions(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_provider_transfer_submissions() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_transfer_submission(UUID, TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- 7. BUCKET DE RESPALDO EN SUPABASE STORAGE ('comprobantes')
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'comprobantes',
      'comprobantes',
      true,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    )
    ON CONFLICT (id) DO UPDATE
    SET public = true,
        file_size_limit = 5242880,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Aviso: No se pudo configurar storage.buckets automáticamente (%).', SQLERRM;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    DROP POLICY IF EXISTS "Permitir subir comprobantes" ON storage.objects;
    CREATE POLICY "Permitir subir comprobantes"
      ON storage.objects
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (bucket_id = 'comprobantes');

    DROP POLICY IF EXISTS "Permitir ver comprobantes" ON storage.objects;
    CREATE POLICY "Permitir ver comprobantes"
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'comprobantes');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Aviso: No se pudieron crear políticas en storage.objects (%).', SQLERRM;
END;
$$;

-- ============================================================
-- 5. TABLA: Experiencias Oficiales del Club (public.experiencias_club)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.experiencias_club (
  id                   TEXT PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  short_title          TEXT,
  tagline              TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  region               TEXT NOT NULL DEFAULT 'Valle Central y Ambato',
  meeting_point        TEXT NOT NULL DEFAULT '',
  difficulty           TEXT NOT NULL DEFAULT 'Baja'
                       CHECK (difficulty IN ('Baja', 'Moderada', 'Exigente', 'Alta Montaña')),
  duration_label       TEXT NOT NULL DEFAULT '4 horas',
  price_ars            INTEGER NOT NULL DEFAULT 65000 CHECK (price_ars >= 0),
  capacity_per_date    INTEGER NOT NULL DEFAULT 12 CHECK (capacity_per_date >= 1),
  dates                JSONB NOT NULL DEFAULT '[]'::jsonb,
  status               TEXT NOT NULL DEFAULT 'publicada'
                       CHECK (status IN ('borrador', 'publicada')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_experiencias_club_slug ON public.experiencias_club(slug);

DROP TRIGGER IF EXISTS experiencias_club_updated_at ON public.experiencias_club;
CREATE TRIGGER experiencias_club_updated_at
  BEFORE UPDATE ON public.experiencias_club
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Semilla idempotente de la experiencia inaugural de Kayak
INSERT INTO public.experiencias_club (
  id,
  slug,
  title,
  short_title,
  tagline,
  description,
  region,
  meeting_point,
  difficulty,
  duration_label,
  price_ars,
  capacity_per_date,
  dates,
  status
)
VALUES (
  'exp-kayak',
  'kayak',
  'Travesía en Kayak & Sunset en Las Pirquitas',
  'Travesía en Kayak',
  'Remada guiada al atardecer con brindis de productos catamarqueños.',
  'Remada guiada en kayak en aguas calmas rodeadas de quebradas y vegetación de yungas andinas. Presenciamos la caída del sol reflejada en el dique y cerramos con un brindis.',
  'Valle Central y Ambato',
  'Club Náutico Dique Las Pirquitas',
  'Baja',
  '4 horas',
  65000,
  12,
  jsonb_build_array(
    to_char((CURRENT_DATE + INTERVAL '9 days'), 'YYYY-MM-DD'),
    to_char((CURRENT_DATE + INTERVAL '16 days'), 'YYYY-MM-DD'),
    to_char((CURRENT_DATE + INTERVAL '23 days'), 'YYYY-MM-DD')
  ),
  'publicada'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.experiencias_club ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura publica de experiencias_club" ON public.experiencias_club;
CREATE POLICY "Permitir lectura publica de experiencias_club"
  ON public.experiencias_club
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir crear y editar experiencias_club" ON public.experiencias_club;
CREATE POLICY "Permitir crear y editar experiencias_club"
  ON public.experiencias_club
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.experiencias_club TO anon, authenticated;

-- ============================================================
-- 6. TABLA: Pagos por Transferencia & Comprobantes en Cloudflare R2 (public.pagos_transferencias)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagos_transferencias (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reference                TEXT NOT NULL UNIQUE,
  experience_id            TEXT NOT NULL,
  experience_title         TEXT NOT NULL,
  date                     TEXT NOT NULL,
  participants             INTEGER NOT NULL CHECK (participants BETWEEN 1 AND 6),
  amount_ars               INTEGER NOT NULL CHECK (amount_ars >= 0),
  discount_code            TEXT,
  discount_ars             INTEGER DEFAULT 0,
  full_name                TEXT NOT NULL,
  email                    TEXT NOT NULL,
  dni                      TEXT NOT NULL,
  phone                    TEXT NOT NULL,
  socio_id                 UUID REFERENCES public.socios(id) ON DELETE SET NULL,
  receipt_file_name        TEXT NOT NULL,
  receipt_mime_type        TEXT NOT NULL,
  receipt_size_bytes       INTEGER NOT NULL CHECK (receipt_size_bytes > 0),
  receipt_url              TEXT NOT NULL,
  receipt_storage_key      TEXT,
  receipt_storage_provider TEXT NOT NULL DEFAULT 'r2'
                           CHECK (receipt_storage_provider IN ('r2', 'supabase', 'local')),
  status                   TEXT NOT NULL DEFAULT 'pendiente'
                           CHECK (status IN ('pendiente', 'aprobado', 'rechazado')),
  rejection_reason         TEXT,
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at              TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_transferencias_email         ON public.pagos_transferencias(email);
CREATE INDEX IF NOT EXISTS idx_pagos_transferencias_experience    ON public.pagos_transferencias(experience_id, date);
CREATE INDEX IF NOT EXISTS idx_pagos_transferencias_status        ON public.pagos_transferencias(status);
CREATE INDEX IF NOT EXISTS idx_pagos_transferencias_reference     ON public.pagos_transferencias(reference);

DROP TRIGGER IF EXISTS pagos_transferencias_updated_at ON public.pagos_transferencias;
CREATE TRIGGER pagos_transferencias_updated_at
  BEFORE UPDATE ON public.pagos_transferencias
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Normalización de email y DNI al insertar/actualizar pagos
CREATE OR REPLACE FUNCTION public.normalize_pago_transferencia_row()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email = LOWER(TRIM(COALESCE(NEW.email, '')));
  NEW.full_name = TRIM(COALESCE(NEW.full_name, ''));
  NEW.dni = regexp_replace(COALESCE(NEW.dni, ''), '\D', '', 'g');
  NEW.phone = TRIM(COALESCE(NEW.phone, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pagos_transferencias_normalize_before_write ON public.pagos_transferencias;
CREATE TRIGGER pagos_transferencias_normalize_before_write
  BEFORE INSERT OR UPDATE ON public.pagos_transferencias
  FOR EACH ROW EXECUTE FUNCTION public.normalize_pago_transferencia_row();

ALTER TABLE public.pagos_transferencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura de pagos propios autenticados" ON public.pagos_transferencias;
CREATE POLICY "Permitir lectura de pagos propios autenticados"
  ON public.pagos_transferencias
  FOR SELECT
  TO authenticated
  USING (LOWER(COALESCE(auth.jwt() ->> 'email', '')) = email);

-- RPC 6.1: Registrar pago por transferencia y comprobante (vincula con socio si existe)
CREATE OR REPLACE FUNCTION public.submit_experience_transfer(
  p_reference TEXT,
  p_experience_id TEXT,
  p_experience_title TEXT,
  p_date TEXT,
  p_participants INTEGER,
  p_amount_ars INTEGER,
  p_discount_code TEXT DEFAULT NULL,
  p_discount_ars INTEGER DEFAULT 0,
  p_full_name TEXT DEFAULT '',
  p_email TEXT DEFAULT '',
  p_dni TEXT DEFAULT '',
  p_phone TEXT DEFAULT '',
  p_receipt_file_name TEXT DEFAULT 'comprobante',
  p_receipt_mime_type TEXT DEFAULT 'image/jpeg',
  p_receipt_size_bytes INTEGER DEFAULT 1,
  p_receipt_url TEXT DEFAULT '',
  p_receipt_storage_key TEXT DEFAULT NULL,
  p_receipt_storage_provider TEXT DEFAULT 'r2'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_dni TEXT := regexp_replace(COALESCE(p_dni, ''), '\D', '', 'g');
  v_socio_id UUID := NULL;
  v_capacity INTEGER := 12;
  v_reserved INTEGER := 0;
  v_inserted public.pagos_transferencias%ROWTYPE;
BEGIN
  IF v_email = '' OR TRIM(COALESCE(p_full_name, '')) = '' OR TRIM(COALESCE(p_receipt_url, '')) = '' THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  SELECT capacity_per_date INTO v_capacity
  FROM public.experiencias_club
  WHERE id = p_experience_id
  LIMIT 1;

  IF v_capacity IS NULL THEN
    v_capacity := 12;
  END IF;

  SELECT COALESCE(SUM(participants), 0) INTO v_reserved
  FROM public.pagos_transferencias
  WHERE experience_id = p_experience_id
    AND date = p_date
    AND status <> 'rechazado';

  IF (v_reserved + p_participants) > v_capacity THEN
    RETURN jsonb_build_object('status', 'no_seats_available', 'available', GREATEST(0, v_capacity - v_reserved));
  END IF;

  SELECT id INTO v_socio_id
  FROM public.socios
  WHERE email = v_email
  LIMIT 1;

  INSERT INTO public.pagos_transferencias (
    reference,
    experience_id,
    experience_title,
    date,
    participants,
    amount_ars,
    discount_code,
    discount_ars,
    full_name,
    email,
    dni,
    phone,
    socio_id,
    receipt_file_name,
    receipt_mime_type,
    receipt_size_bytes,
    receipt_url,
    receipt_storage_key,
    receipt_storage_provider,
    status
  )
  VALUES (
    UPPER(TRIM(p_reference)),
    p_experience_id,
    p_experience_title,
    p_date,
    p_participants,
    p_amount_ars,
    NULLIF(TRIM(COALESCE(p_discount_code, '')), ''),
    COALESCE(p_discount_ars, 0),
    TRIM(p_full_name),
    v_email,
    v_dni,
    TRIM(p_phone),
    v_socio_id,
    p_receipt_file_name,
    p_receipt_mime_type,
    GREATEST(1, COALESCE(p_receipt_size_bytes, 1)),
    p_receipt_url,
    p_receipt_storage_key,
    CASE WHEN p_receipt_storage_provider IN ('r2', 'supabase', 'local') THEN p_receipt_storage_provider ELSE 'r2' END,
    'pendiente'
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'status', 'created',
    'submission', to_jsonb(v_inserted)
  );
END;
$$;

-- RPC 6.2: Consultar cupos reservados por fecha de una experiencia sin exponer datos personales
CREATE OR REPLACE FUNCTION public.get_reserved_seats_by_experience(
  p_experience_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'date', sub.date,
        'reserved_seats', sub.reserved_seats
      )
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT date, SUM(participants)::INTEGER AS reserved_seats
    FROM public.pagos_transferencias
    WHERE experience_id = p_experience_id
      AND status <> 'rechazado'
    GROUP BY date
  ) sub;

  RETURN v_result;
END;
$$;

-- RPC 6.3: Obtener comprobantes y reservas de un socio autenticado o con registration_token válido
CREATE OR REPLACE FUNCTION public.get_member_transfer_submissions(
  p_email TEXT,
  p_registration_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_jwt_email TEXT := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
  v_auth_uid UUID := auth.uid();
  v_socio public.socios%ROWTYPE;
  v_authorized BOOLEAN := false;
  v_items JSONB;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('status', 'unauthorized', 'submissions', '[]'::jsonb);
  END IF;

  IF v_auth_uid IS NOT NULL AND v_jwt_email = v_email THEN
    v_authorized := true;
  ELSE
    SELECT * INTO v_socio
    FROM public.socios
    WHERE email = v_email
    LIMIT 1;

    IF FOUND THEN
      IF v_auth_uid IS NOT NULL AND v_socio.auth_user_id = v_auth_uid THEN
        v_authorized := true;
      ELSIF v_socio.google_linked = false
            AND p_registration_token IS NOT NULL
            AND v_socio.registration_token = p_registration_token THEN
        v_authorized := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('status', 'unauthorized', 'submissions', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.submitted_at DESC), '[]'::jsonb)
  INTO v_items
  FROM public.pagos_transferencias t
  WHERE t.email = v_email;

  RETURN jsonb_build_object('status', 'ok', 'submissions', v_items);
END;
$$;

-- RPC 6.4: Listar envíos de comprobantes para el panel de prestadores (/prestador/comprobantes)
CREATE OR REPLACE FUNCTION public.list_provider_transfer_submissions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.submitted_at DESC), '[]'::jsonb)
  INTO v_items
  FROM public.pagos_transferencias t;

  RETURN jsonb_build_object('status', 'ok', 'submissions', v_items);
END;
$$;

-- RPC 6.5: Aprobar o rechazar comprobante desde el panel de prestador (y ascender socio emergente a activo al aprobar)
CREATE OR REPLACE FUNCTION public.review_transfer_submission(
  p_submission_id UUID,
  p_status TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.pagos_transferencias%ROWTYPE;
BEGIN
  IF p_status NOT IN ('aprobado', 'rechazado') THEN
    RETURN jsonb_build_object('status', 'invalid_status');
  END IF;

  UPDATE public.pagos_transferencias
  SET status = p_status,
      rejection_reason = CASE WHEN p_status = 'rechazado' THEN NULLIF(TRIM(COALESCE(p_rejection_reason, '')), '') ELSE NULL END,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Si se aprueba el pago de una experiencia, el socio emergente pasa automáticamente a socio activo
  IF p_status = 'aprobado' THEN
    UPDATE public.socios
    SET membership_tier = 'activo',
        updated_at = now()
    WHERE (id = v_updated.socio_id OR email = v_updated.email)
      AND membership_tier = 'emergente';
  END IF;

  RETURN jsonb_build_object('status', 'updated', 'submission', to_jsonb(v_updated));
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.pagos_transferencias TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_experience_transfer(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reserved_seats_by_experience(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_transfer_submissions(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_provider_transfer_submissions() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_transfer_submission(UUID, TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- 7. BUCKET DE RESPALDO EN SUPABASE STORAGE ('comprobantes')
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'comprobantes',
      'comprobantes',
      true,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    )
    ON CONFLICT (id) DO UPDATE
    SET public = true,
        file_size_limit = 5242880,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Aviso: No se pudo configurar storage.buckets automáticamente (%).', SQLERRM;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    DROP POLICY IF EXISTS "Permitir subir comprobantes" ON storage.objects;
    CREATE POLICY "Permitir subir comprobantes"
      ON storage.objects
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (bucket_id = 'comprobantes');

    DROP POLICY IF EXISTS "Permitir ver comprobantes" ON storage.objects;
    CREATE POLICY "Permitir ver comprobantes"
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'comprobantes');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Aviso: No se pudieron crear políticas en storage.objects (%).', SQLERRM;
END;
$$;

-- ============================================================
-- 006_admin_access_and_google_converted.sql
-- EXPERIENCIAS.CLUB • Panel de Administración & Definición de Conversión (Pago Realizado)
-- ============================================================

-- 1. Actualización retroactiva de Google vinculado
UPDATE public.waitlist w
SET google_linked = true
FROM public.socios s
WHERE LOWER(TRIM(w.email)) = LOWER(TRIM(s.email))
  AND (s.google_linked = true OR s.auth_user_id IS NOT NULL);

UPDATE public.waitlist w
SET google_linked = true
FROM auth.users u
WHERE LOWER(TRIM(w.email)) = LOWER(TRIM(u.email));

-- 2. DEFINICIÓN DE CONVERTIDO: Un socio o prospecto está convertido SI Y SOLO SI
--    pagó al menos una experiencia / envió un comprobante de pago en public.pagos_transferencias
UPDATE public.waitlist
SET converted = EXISTS (
  SELECT 1 FROM public.pagos_transferencias p
  WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(public.waitlist.email))
);

-- 3. Trigger en public.pagos_transferencias para marcar converted = true al enviar comprobante
CREATE OR REPLACE FUNCTION public.handle_pago_transferencia_submitted()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.waitlist (email, converted, google_linked)
  VALUES (LOWER(TRIM(NEW.email)), true, false)
  ON CONFLICT (email) DO UPDATE
  SET converted = true;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_pago_transferencia_mark_converted ON public.pagos_transferencias;
CREATE TRIGGER on_pago_transferencia_mark_converted
  AFTER INSERT ON public.pagos_transferencias
  FOR EACH ROW EXECUTE FUNCTION public.handle_pago_transferencia_submitted();

-- 4. Normalización estricta de waitlist (email minúsculas)
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

-- 5. Trigger cuando auth.users recibe login de Google (solo actualiza google_linked, no converted)
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

-- 6. Tabla de accesos administrativos autorizados (admin.experiencias.club)
CREATE TABLE IF NOT EXISTS public.admin_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'superadmin',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir consultar su propio acceso admin" ON public.admin_access;
CREATE POLICY "Permitir consultar su propio acceso admin"
  ON public.admin_access
  FOR SELECT
  TO authenticated
  USING (LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')) AND active = true);

DROP POLICY IF EXISTS "Permitir consulta de emails autorizados admin" ON public.admin_access;
CREATE POLICY "Permitir consulta de emails autorizados admin"
  ON public.admin_access
  FOR SELECT
  TO anon, authenticated
  USING (active = true);

GRANT SELECT ON public.admin_access TO anon, authenticated;

-- Insertar administrador principal
INSERT INTO public.admin_access (email, name, role, active)
VALUES 
  ('gonzagramaglia@gmail.com', 'Gonzalo Gramaglia', 'superadmin', true),
  ('admin@experiencias.club', 'Administrador Experiencias', 'superadmin', true)
ON CONFLICT (email) DO UPDATE 
SET active = true,
    name = EXCLUDED.name,
    role = EXCLUDED.role;

-- 7. RPC Administrativa: Obtener nómina unificada indicando si pagó / envió comprobante
CREATE OR REPLACE FUNCTION public.get_admin_all_members()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_socios JSONB;
  v_waitlist JSONB;
BEGIN
  -- Socios con ficha oficial completa:
  -- converted = true si tienen al menos 1 comprobante de pago enviado
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'type', 'socio',
        'email', s.email,
        'fullName', s.full_name,
        'dni', s.dni,
        'phone', s.phone,
        'position', s.position,
        'membershipTier', s.membership_tier,
        'googleLinked', COALESCE(s.google_linked, s.auth_user_id IS NOT NULL, false),
        'converted', EXISTS (
          SELECT 1 FROM public.pagos_transferencias p
          WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(s.email))
        ),
        'paymentsCount', (
          SELECT COUNT(*)::INTEGER FROM public.pagos_transferencias p
          WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(s.email))
        ),
        'experiencesWishlist', COALESCE(s.experiences_wishlist, '[]'::jsonb),
        'experiencesOther', s.experiences_other,
        'createdAt', s.created_at
      )
      ORDER BY s.position ASC NULLS LAST, s.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_socios
  FROM public.socios s;

  -- Prospectos de lista de espera (solo email):
  -- converted = true si tienen comprobante enviado
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', w.id,
        'type', 'waitlist',
        'email', w.email,
        'fullName', NULL,
        'dni', NULL,
        'phone', NULL,
        'position', NULL,
        'membershipTier', 'waitlist',
        'googleLinked', COALESCE(w.google_linked, false),
        'converted', (
          COALESCE(w.converted, false) OR EXISTS (
            SELECT 1 FROM public.pagos_transferencias p
            WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(w.email))
          )
        ),
        'paymentsCount', (
          SELECT COUNT(*)::INTEGER FROM public.pagos_transferencias p
          WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(w.email))
        ),
        'experiencesWishlist', '[]'::jsonb,
        'experiencesOther', NULL,
        'createdAt', w.created_at
      )
      ORDER BY w.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_waitlist
  FROM public.waitlist w
  WHERE NOT EXISTS (
    SELECT 1 FROM public.socios s WHERE LOWER(TRIM(s.email)) = LOWER(TRIM(w.email))
  );

  RETURN jsonb_build_object(
    'socios', v_socios,
    'waitlist', v_waitlist,
    'total_socios', jsonb_array_length(v_socios),
    'total_waitlist', jsonb_array_length(v_waitlist)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_all_members() TO anon, authenticated;

-- 8. RPC Administrativa: Obtener todos los comprobantes y transferencias enviadas
CREATE OR REPLACE FUNCTION public.get_admin_all_submissions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subs JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'reference', p.reference,
        'experienceId', p.experience_id,
        'experienceTitle', p.experience_title,
        'date', p.date,
        'participants', p.participants,
        'amountArs', p.amount_ars,
        'discountCode', p.discount_code,
        'discountArs', p.discount_ars,
        'fullName', p.full_name,
        'email', p.email,
        'dni', p.dni,
        'phone', p.phone,
        'socioId', p.socio_id,
        'receipt', jsonb_build_object(
          'fileName', p.receipt_file_name,
          'mimeType', p.receipt_mime_type,
          'sizeBytes', p.receipt_size_bytes,
          'url', p.receipt_url,
          'storageKey', p.receipt_storage_key,
          'provider', p.receipt_storage_provider
        ),
        'status', p.status,
        'rejectionReason', p.rejection_reason,
        'submittedAt', p.submitted_at,
        'reviewedAt', p.reviewed_at
      )
      ORDER BY p.submitted_at DESC
    ),
    '[]'::jsonb
  ) INTO v_subs
  FROM public.pagos_transferencias p;

  RETURN v_subs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_all_submissions() TO anon, authenticated;

-- ============================================================
-- 9. Registro atómico sin bloqueo si el email ya existe (actualiza y da la bienvenida)
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_socio_atomic(
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
  v_dni TEXT := TRIM(COALESCE(p_dni, ''));
  v_phone TEXT := TRIM(COALESCE(p_phone, ''));
  v_jwt_email TEXT := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
  v_auth_uid UUID := auth.uid();
  v_inserted public.socios%ROWTYPE;
BEGIN
  IF v_email = '' OR v_name = '' OR length(v_dni) < 7 OR length(v_dni) > 9 OR v_phone = '' THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  -- Si el socio ya existe por email, actualizar sus datos y confirmar como éxito
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

GRANT EXECUTE ON FUNCTION public.register_socio_atomic(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;

-- ============================================================
-- 10. Políticas RLS y permisos para lectura administrativa y gestión de postulaciones
-- ============================================================
DROP POLICY IF EXISTS "Permitir lectura general de socios" ON public.socios;
CREATE POLICY "Permitir lectura general de socios"
  ON public.socios
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Permitir lectura general de waitlist" ON public.waitlist;
CREATE POLICY "Permitir lectura general de waitlist"
  ON public.waitlist
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.socios TO anon, authenticated;
GRANT SELECT ON public.waitlist TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.postulaciones_prestadores TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.postulaciones_fundadores TO anon, authenticated;


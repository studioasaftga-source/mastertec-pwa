-- FASE 1: preparar as novas RPCs sem derrubar o PWA antigo.
-- Não revoga as RPCs antigas nem altera políticas ainda.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_funcionario_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id
  FROM public.usuarios AS u
  WHERE u.auth_user_id = auth.uid()
    AND u.ativo IS TRUE
    AND u.role = 'funcionario'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_funcionario_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_funcionario_id() TO authenticated;

CREATE INDEX IF NOT EXISTS usuarios_auth_user_id_ativo_idx
  ON public.usuarios (auth_user_id)
  WHERE ativo IS TRUE;

CREATE INDEX IF NOT EXISTS ordens_servico_empresa_responsavel_idx
  ON public.ordens_servico (empresa_id, responsavel_id);

CREATE OR REPLACE FUNCTION public.buscar_minhas_ordens()
RETURNS SETOF public.ordens_servico
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT os.*
  FROM public.ordens_servico AS os
  WHERE os.empresa_id = public.get_my_empresa_id()
    AND os.responsavel_id = public.get_my_funcionario_id()
  ORDER BY os.data_entrada DESC;
$$;

REVOKE ALL ON FUNCTION public.buscar_minhas_ordens() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_minhas_ordens() TO authenticated;

CREATE OR REPLACE FUNCTION public.finalizar_minha_os(
  p_ordem_servico_id uuid,
  p_valor_servicos numeric DEFAULT NULL,
  p_valor_pecas numeric DEFAULT NULL
)
RETURNS public.ordens_servico
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_funcionario_id uuid;
  v_ordem public.ordens_servico%ROWTYPE;
BEGIN
  v_funcionario_id := public.get_my_funcionario_id();

  IF v_funcionario_id IS NULL THEN
    RAISE EXCEPTION 'Sessão de funcionário inválida.';
  END IF;

  UPDATE public.ordens_servico AS os
  SET
    status = 'servico_finalizado',
    valor_servicos = COALESCE(p_valor_servicos, os.valor_servicos, 0),
    valor_pecas = COALESCE(p_valor_pecas, os.valor_pecas, 0),
    valor_total =
      COALESCE(p_valor_servicos, os.valor_servicos, 0)
      + COALESCE(p_valor_pecas, os.valor_pecas, 0),
    valor_comissao = ROUND(
      (
        COALESCE(p_valor_servicos, os.valor_servicos, 0)
        * COALESCE(os.percentual_comissao, 0)
      ) / 100,
      2
    ),
    data_conclusao = now(),
    updated_at = now()
  WHERE os.id = p_ordem_servico_id
    AND os.empresa_id = public.get_my_empresa_id()
    AND os.responsavel_id = v_funcionario_id
  RETURNING os.* INTO v_ordem;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O.S. não encontrada ou não pertence ao funcionário conectado.';
  END IF;

  RETURN v_ordem;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_minha_os(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_minha_os(uuid, numeric, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.criar_os_da_entrada_autenticada(
  p_entrada_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_funcionario_id uuid;
  v_empresa_id uuid;
BEGIN
  SELECT e.funcionario_id, e.empresa_id
    INTO v_funcionario_id, v_empresa_id
  FROM public.entradas_veiculos AS e
  WHERE e.id = p_entrada_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrada não encontrada.';
  END IF;

  IF v_funcionario_id IS DISTINCT FROM public.get_my_funcionario_id()
     OR v_empresa_id IS DISTINCT FROM public.get_my_empresa_id() THEN
    RAISE EXCEPTION 'A entrada não pertence ao funcionário conectado.';
  END IF;

  -- Reaproveita a lógica existente de criação e anti-duplicidade.
  RETURN public.criar_os_da_entrada(p_entrada_id);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_os_da_entrada_autenticada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_os_da_entrada_autenticada(uuid) TO authenticated;

COMMIT;

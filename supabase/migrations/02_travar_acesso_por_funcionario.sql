-- FASE 2: executar somente depois que o PWA novo estiver publicado e testado.
-- Esta fase encerra o acesso antigo por código e limita dados por funcionário.
BEGIN;

-- Usuários: administrador vê a empresa; funcionário vê só a si.
DROP POLICY IF EXISTS usuarios_select_empresa ON public.usuarios;
DROP POLICY IF EXISTS usuarios_select_admin ON public.usuarios;
DROP POLICY IF EXISTS usuarios_select_proprio ON public.usuarios;

CREATE POLICY usuarios_select_admin
ON public.usuarios
FOR SELECT
TO authenticated
USING (
  empresa_id = public.get_my_empresa_id()
  AND public.is_admin()
);

CREATE POLICY usuarios_select_proprio
ON public.usuarios
FOR SELECT
TO authenticated
USING (
  auth_user_id = auth.uid()
  AND ativo IS TRUE
);

-- O.S.: administrador vê a empresa; técnico vê apenas as O.S. atribuídas a ele.
DROP POLICY IF EXISTS os_select_empresa ON public.ordens_servico;
DROP POLICY IF EXISTS os_select_admin ON public.ordens_servico;
DROP POLICY IF EXISTS os_select_tecnico_propria ON public.ordens_servico;

CREATE POLICY os_select_admin
ON public.ordens_servico
FOR SELECT
TO authenticated
USING (
  empresa_id = public.get_my_empresa_id()
  AND public.is_admin()
);

CREATE POLICY os_select_tecnico_propria
ON public.ordens_servico
FOR SELECT
TO authenticated
USING (
  empresa_id = public.get_my_empresa_id()
  AND responsavel_id = public.get_my_funcionario_id()
);

-- Tarefas: remover três políticas antigas abertas a anon/authenticated.
DROP POLICY IF EXISTS "funcionario pode atualizar tarefas" ON public.os_tarefas;
DROP POLICY IF EXISTS "funcionario pode inserir tarefas da sua os" ON public.os_tarefas;
DROP POLICY IF EXISTS "funcionario pode visualizar tarefas" ON public.os_tarefas;

DROP POLICY IF EXISTS tarefas_select_admin ON public.os_tarefas;
DROP POLICY IF EXISTS tarefas_select_tecnico ON public.os_tarefas;
DROP POLICY IF EXISTS tarefas_insert_admin ON public.os_tarefas;
DROP POLICY IF EXISTS tarefas_insert_tecnico ON public.os_tarefas;
DROP POLICY IF EXISTS tarefas_update_admin ON public.os_tarefas;
DROP POLICY IF EXISTS tarefas_update_tecnico ON public.os_tarefas;
DROP POLICY IF EXISTS tarefas_delete_admin ON public.os_tarefas;
DROP POLICY IF EXISTS tarefas_delete_tecnico ON public.os_tarefas;

CREATE POLICY tarefas_select_admin
ON public.os_tarefas
FOR SELECT TO authenticated
USING (
  public.is_admin()
  AND EXISTS (
    SELECT 1 FROM public.ordens_servico AS os
    WHERE os.id = os_tarefas.ordem_servico_id
      AND os.empresa_id = public.get_my_empresa_id()
  )
);

CREATE POLICY tarefas_select_tecnico
ON public.os_tarefas
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ordens_servico AS os
    WHERE os.id = os_tarefas.ordem_servico_id
      AND os.empresa_id = public.get_my_empresa_id()
      AND os.responsavel_id = public.get_my_funcionario_id()
  )
);

CREATE POLICY tarefas_insert_admin
ON public.os_tarefas
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  AND EXISTS (
    SELECT 1 FROM public.ordens_servico AS os
    WHERE os.id = os_tarefas.ordem_servico_id
      AND os.empresa_id = public.get_my_empresa_id()
  )
);

CREATE POLICY tarefas_insert_tecnico
ON public.os_tarefas
FOR INSERT TO authenticated
WITH CHECK (
  responsavel_id = public.get_my_funcionario_id()
  AND EXISTS (
    SELECT 1 FROM public.ordens_servico AS os
    WHERE os.id = os_tarefas.ordem_servico_id
      AND os.empresa_id = public.get_my_empresa_id()
      AND os.responsavel_id = public.get_my_funcionario_id()
  )
);

CREATE POLICY tarefas_update_admin
ON public.os_tarefas
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  AND EXISTS (
    SELECT 1 FROM public.ordens_servico AS os
    WHERE os.id = os_tarefas.ordem_servico_id
      AND os.empresa_id = public.get_my_empresa_id()
  )
)
WITH CHECK (
  public.is_admin()
  AND EXISTS (
    SELECT 1 FROM public.ordens_servico AS os
    WHERE os.id = os_tarefas.ordem_servico_id
      AND os.empresa_id = public.get_my_empresa_id()
  )
);

CREATE POLICY tarefas_update_tecnico
ON public.os_tarefas
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ordens_servico AS os
    WHERE os.id = os_tarefas.ordem_servico_id
      AND os.empresa_id = public.get_my_empresa_id()
      AND os.responsavel_id = public.get_my_funcionario_id()
  )
)
WITH CHECK (
  responsavel_id = public.get_my_funcionario_id()
  AND EXISTS (
    SELECT 1 FROM public.ordens_servico AS os
    WHERE os.id = os_tarefas.ordem_servico_id
      AND os.empresa_id = public.get_my_empresa_id()
      AND os.responsavel_id = public.get_my_funcionario_id()
  )
);

CREATE POLICY tarefas_delete_admin
ON public.os_tarefas
FOR DELETE TO authenticated
USING (
  public.is_admin()
  AND EXISTS (
    SELECT 1 FROM public.ordens_servico AS os
    WHERE os.id = os_tarefas.ordem_servico_id
      AND os.empresa_id = public.get_my_empresa_id()
  )
);

CREATE POLICY tarefas_delete_tecnico
ON public.os_tarefas
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ordens_servico AS os
    WHERE os.id = os_tarefas.ordem_servico_id
      AND os.empresa_id = public.get_my_empresa_id()
      AND os.responsavel_id = public.get_my_funcionario_id()
  )
);

-- Entradas: bloquear visitantes anônimos. A leitura da empresa é mantida
-- temporariamente para preservar a consulta de placa já usada no formulário.
DROP POLICY IF EXISTS "entrada pode ser inserida" ON public.entradas_veiculos;
DROP POLICY IF EXISTS "entrada pode ser visualizada" ON public.entradas_veiculos;
DROP POLICY IF EXISTS entradas_select_empresa_authenticated ON public.entradas_veiculos;
DROP POLICY IF EXISTS entradas_insert_funcionario ON public.entradas_veiculos;
DROP POLICY IF EXISTS entradas_insert_admin ON public.entradas_veiculos;

CREATE POLICY entradas_select_empresa_authenticated
ON public.entradas_veiculos
FOR SELECT TO authenticated
USING (empresa_id = public.get_my_empresa_id());

CREATE POLICY entradas_insert_funcionario
ON public.entradas_veiculos
FOR INSERT TO authenticated
WITH CHECK (
  funcionario_id = public.get_my_funcionario_id()
  AND empresa_id = public.get_my_empresa_id()
);

CREATE POLICY entradas_insert_admin
ON public.entradas_veiculos
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  AND empresa_id = public.get_my_empresa_id()
);

-- Upload de fotos: exigir sessão autenticada. O bucket continua público para
-- preservar as URLs já gravadas; a privatização será feita em etapa separada.
DROP POLICY IF EXISTS "pwa pode enviar fotos de entrada" ON storage.objects;
DROP POLICY IF EXISTS "funcionario autenticado envia fotos de entrada" ON storage.objects;

CREATE POLICY "funcionario autenticado envia fotos de entrada"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fotos-entrada'
  AND (storage.foldername(name))[1] = 'entradas'
  AND (
    public.get_my_funcionario_id() IS NOT NULL
    OR public.is_admin()
  )
);

-- Remover privilégios anônimos diretos sobre as tabelas do fluxo.
REVOKE ALL ON TABLE public.usuarios FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.ordens_servico FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.os_tarefas FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.entradas_veiculos FROM PUBLIC, anon;

-- Fechar os endpoints antigos que aceitavam o código como prova de identidade.
REVOKE ALL ON FUNCTION public.buscar_funcionario_por_codigo(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buscar_usa_comissao_por_codigo(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buscar_minhas_ordens_por_codigo(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalizar_os_funcionario(uuid, uuid, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_os_da_entrada(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;

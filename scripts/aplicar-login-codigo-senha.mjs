import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appPath = resolve(process.cwd(), 'src', 'App.tsx')
let source = readFileSync(appPath, 'utf8')

function replaceExactly(label, oldText, newText, expected = 1) {
  const count = source.split(oldText).length - 1
  if (count !== expected) {
    throw new Error(
      `Não foi possível aplicar "${label}". Encontrado(s): ${count}; esperado(s): ${expected}. Nenhuma alteração foi gravada.`,
    )
  }
  source = source.replace(oldText, newText)
}

function replaceBetween(label, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker)
  if (start < 0) {
    throw new Error(`Marcador inicial não encontrado em "${label}". Nenhuma alteração foi gravada.`)
  }

  const end = source.indexOf(endMarker, start + startMarker.length)
  if (end < 0) {
    throw new Error(`Marcador final não encontrado em "${label}". Nenhuma alteração foi gravada.`)
  }

  source = source.slice(0, start) + replacement + source.slice(end)
}

// 1) Estado do formulário de login.
replaceExactly(
  'estado da senha',
  `  const [
    codigoFuncionario,
    setCodigoFuncionario,
  ] = useState('')

  const [
    buscandoFuncionario,
    setBuscandoFuncionario,
  ] = useState(false)`,
  `  const [
    codigoFuncionario,
    setCodigoFuncionario,
  ] = useState('')

  const [
    senhaFuncionario,
    setSenhaFuncionario,
  ] = useState('')

  const [
    buscandoFuncionario,
    setBuscandoFuncionario,
  ] = useState(false)

  const [
    verificandoSessao,
    setVerificandoSessao,
  ] = useState(true)`,
)

// 2) A restauração valida a sessão real do Supabase e consulta apenas o próprio cadastro.
replaceBetween(
  'restauração de sessão autenticada',
  `  useEffect(() => {
    async function restaurarFuncionario() {`,
  `  useEffect(() => {
    if (funcionario && !funcionario.usa_comissao`,
  `  useEffect(() => {
    let ativo = true

    async function restaurarFuncionario() {
      // Remove a identificação antiga, que era confiada apenas por estar no navegador.
      localStorage.removeItem(FUNCIONARIO_STORAGE_KEY)

      try {
        const {
          data: { session },
          error: erroSessao,
        } = await supabase.auth.getSession()

        if (erroSessao) throw erroSessao
        if (!session?.user) return

        const { data, error } = await supabase
          .from('usuarios')
          .select('id,nome,codigo_acesso,empresa_id,usa_comissao')
          .eq('auth_user_id', session.user.id)
          .eq('ativo', true)
          .eq('role', 'funcionario')
          .maybeSingle()

        if (error) throw error

        if (!data) {
          await supabase.auth.signOut()
          return
        }

        if (ativo) {
          setFuncionario({
            id: data.id,
            nome: data.nome,
            codigo_acesso: data.codigo_acesso,
            empresa_id: data.empresa_id ?? null,
            usa_comissao: Boolean(data.usa_comissao),
          })
        }
      } catch (error) {
        console.error('ERRO AO RESTAURAR SESSÃO DO FUNCIONÁRIO:', error)
        await supabase.auth.signOut()
      } finally {
        if (ativo) setVerificandoSessao(false)
      }
    }

    void restaurarFuncionario()

    return () => {
      ativo = false
    }
  }, [])

`,
)

// 3) Login por código + senha. O e-mail interno não é exibido ao funcionário.
replaceBetween(
  'login código e senha',
  `  async function entrarComoFuncionario() {`,
  `  async function anexarNomesClientes(`,
  `  async function entrarComoFuncionario() {
    const codigo = codigoFuncionario
      .trim()
      .replace(/\\D/g, '')
      .slice(0, 3)

    const senha = senhaFuncionario

    setErroFuncionario('')

    if (codigo.length !== 3) {
      setErroFuncionario('Digite o código de 3 números do funcionário.')
      return
    }

    if (!senha) {
      setErroFuncionario('Digite sua senha.')
      return
    }

    setBuscandoFuncionario(true)

    try {
      const emailInterno =
        'funcionario-' + codigo + '@ujkfefwchnfsaurycube.supabase.co'

      const {
        data: sessao,
        error: erroLogin,
      } = await supabase.auth.signInWithPassword({
        email: emailInterno,
        password: senha,
      })

      if (erroLogin || !sessao.user) {
        throw new Error('Código ou senha incorretos, ou funcionário inativo.')
      }

      const {
        data: perfil,
        error: erroPerfil,
      } = await supabase
        .from('usuarios')
        .select('id,nome,codigo_acesso,empresa_id,usa_comissao')
        .eq('auth_user_id', sessao.user.id)
        .eq('ativo', true)
        .eq('role', 'funcionario')
        .maybeSingle()

      if (erroPerfil || !perfil) {
        await supabase.auth.signOut()
        throw new Error('Não foi possível validar o cadastro deste funcionário.')
      }

      const funcionarioLocal: FuncionarioLocal = {
        id: perfil.id,
        nome: perfil.nome,
        codigo_acesso: perfil.codigo_acesso,
        empresa_id: perfil.empresa_id ?? null,
        usa_comissao: Boolean(perfil.usa_comissao),
      }

      // A identificação não é mais salva no localStorage.
      setFuncionario(funcionarioLocal)
      setCodigoFuncionario('')
      setSenhaFuncionario('')
      setErroFuncionario('')
    } catch (error) {
      console.error('ERRO AO AUTENTICAR FUNCIONÁRIO:', error)
      setErroFuncionario(
        error instanceof Error
          ? error.message
          : 'Não foi possível entrar. Confira o código e a senha.',
      )
    } finally {
      setBuscandoFuncionario(false)
    }
  }

  async function trocarFuncionario() {
    if (enviando) return

    const confirmar = window.confirm(
      'Deseja sair da conta deste funcionário neste celular?',
    )

    if (!confirmar) return

    const { error } = await supabase.auth.signOut()

    if (error) {
      alert('Não foi possível encerrar a sessão. Tente novamente.')
      console.error('ERRO AO SAIR:', error)
      return
    }

    localStorage.removeItem(FUNCIONARIO_STORAGE_KEY)
    setFuncionario(null)
    setCodigoFuncionario('')
    setSenhaFuncionario('')
    setErroFuncionario('')
    setTelaPrincipal('entrada')
    setMinhasOrdens([])
    setOrdemAberta(null)
    setEntradaDaOrdem(null)
  }

`,
)

// 4) As consultas deixam o banco identificar o funcionário pelo auth.uid().
const ordersRpcRegex = /await supabase\.rpc\(\s*'buscar_minhas_ordens_por_codigo',\s*\{\s*p_codigo:\s*funcionario\.codigo_acesso,\s*\},\s*\)/g
const ordersRpcCount = [...source.matchAll(ordersRpcRegex)].length
if (ordersRpcCount !== 2) {
  throw new Error(
    `Esperava encontrar 2 chamadas antigas de lista de O.S.; encontrei ${ordersRpcCount}. Nenhuma alteração foi gravada.`,
  )
}
source = source.replace(ordersRpcRegex, `await supabase.rpc('buscar_minhas_ordens')`)

replaceExactly(
  'remoção da validação por código na consulta de O.S.',
  `    if (!funcionario.codigo_acesso) {
      return null
    }

`,
  '',
)

// 5) A finalização não aceita ID de funcionário nem código enviados pelo navegador.
const finalizeRegex = /await supabase\.rpc\(\s*'finalizar_os_funcionario',\s*\{\s*p_ordem_servico_id:\s*ordemAberta\.id,\s*p_funcionario_id:\s*funcionario\.id,\s*p_codigo:\s*funcionario\.codigo_acesso,\s*p_valor_servicos:\s*totalServicosSalvo,\s*p_valor_pecas:\s*totalPecasSalvo,\s*\},\s*\)/g
if ([...source.matchAll(finalizeRegex)].length !== 1) {
  throw new Error('Não encontrei exatamente uma chamada antiga de finalização. Nenhuma alteração foi gravada.')
}
source = source.replace(
  finalizeRegex,
  `await supabase.rpc('finalizar_minha_os', {
          p_ordem_servico_id: ordemAberta.id,
          p_valor_servicos: totalServicosSalvo,
          p_valor_pecas: totalPecasSalvo,
        })`,
)

// 6) A criação automática da O.S. passa pela RPC que valida a sessão autenticada.
replaceExactly(
  'RPC de criação automática autenticada',
  `'criar_os_da_entrada'`,
  `'criar_os_da_entrada_autenticada'`,
)

// 7) Tela de login com os dois campos.
replaceBetween(
  'tela de login',
  `  if (!funcionario) {
    return (
      <main className="login-page">`,
  `  return (
    <>
      <style>`,
  `  if (!funcionario) {
    return (
      <main className="login-page">
        <section
          className="login-card"
          style={{
            maxWidth: '420px',
            width: '100%',
          }}
        >
          <div className="login-brand">
            <div className="login-logo">
              DC
            </div>

            <h1>
              DIESEL
              <span>CENTER</span>
            </h1>

            <p>
              {verificandoSessao
                ? 'Verificando sessão segura'
                : 'Acesso do funcionário'}
            </p>
          </div>

          <div
            style={{
              marginBottom: '20px',
              padding: '14px 16px',
              border: '1px solid #383838',
              borderLeft: '4px solid #d71920',
              borderRadius: '10px',
              background: '#151515',
              color: '#dddddd',
              fontSize: '14px',
              lineHeight: 1.5,
            }}
          >
            Para acessar, informe seu código de funcionário e sua senha individual.
          </div>

          <div className="form-group">
            <label htmlFor="codigoFuncionario">
              CÓDIGO DO FUNCIONÁRIO
            </label>

            <input
              id="codigoFuncionario"
              type="text"
              inputMode="numeric"
              maxLength={3}
              autoComplete="username"
              value={codigoFuncionario}
              onChange={event => {
                const valor = event.target.value
                  .replace(/\\D/g, '')
                  .slice(0, 3)

                setCodigoFuncionario(valor)
                setErroFuncionario('')
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  document.getElementById('senhaFuncionario')?.focus()
                }
              }}
              placeholder="Ex.: 004"
              autoFocus
            />

            <small>
              Digite os 3 números do seu código.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="senhaFuncionario">
              SENHA INDIVIDUAL
            </label>

            <input
              id="senhaFuncionario"
              type="password"
              autoComplete="current-password"
              value={senhaFuncionario}
              onChange={event => {
                setSenhaFuncionario(event.target.value)
                setErroFuncionario('')
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void entrarComoFuncionario()
                }
              }}
              placeholder="Digite sua senha"
            />
          </div>

          {erroFuncionario && (
            <div
              className="login-error"
              style={{
                marginBottom: '14px',
              }}
            >
              {erroFuncionario}
            </div>
          )}

          <button
            type="button"
            className="login-button"
            onClick={() => void entrarComoFuncionario()}
            disabled={buscandoFuncionario || verificandoSessao}
          >
            {verificandoSessao
              ? 'VERIFICANDO...'
              : buscandoFuncionario
                ? 'ENTRANDO...'
                : 'ENTRAR'}
          </button>
        </section>
      </main>
    )
  }

`,
)

if (
  source.includes('buscar_funcionario_por_codigo') ||
  source.includes('buscar_usa_comissao_por_codigo') ||
  source.includes('buscar_minhas_ordens_por_codigo') ||
  source.includes('finalizar_os_funcionario') ||
  source.includes("'criar_os_da_entrada'")
) {
  throw new Error('Ainda restou uma chamada antiga baseada somente no código. Nenhuma alteração foi gravada.')
}

// Grava somente depois de todas as substituições terem sido verificadas.
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = `${appPath}.backup-login-${timestamp}`
copyFileSync(appPath, backupPath)
writeFileSync(appPath, source, 'utf8')

console.log('Alteração aplicada em src/App.tsx.')
console.log(`Backup criado em: ${backupPath}`)
console.log('Próximo passo: npm run build')

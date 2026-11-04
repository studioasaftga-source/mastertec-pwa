import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente antes de executar.',
  )
}

const projectDomain = new URL(SUPABASE_URL).host
const codigoFiltro = process.argv[2]
  ? process.argv[2].replace(/\D/g, '').padStart(3, '0')
  : null

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function criarSenhaInicial() {
  // Senha aleatória e exclusiva para cada funcionário.
  return `${randomBytes(18).toString('base64url')}A7!`
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

async function main() {
  const { data: funcionarios, error: erroConsulta } = await supabase
    .from('usuarios')
    .select('id,nome,codigo_acesso,role,ativo,auth_user_id')
    .eq('ativo', true)
    .eq('role', 'funcionario')
    .order('codigo_acesso', { ascending: true })

  if (erroConsulta) throw erroConsulta

  const selecionados = (funcionarios ?? []).filter((item) => {
    if (!item.codigo_acesso) return false
    if (
      codigoFiltro &&
      String(item.codigo_acesso).padStart(3, '0') !== codigoFiltro
    ) {
      return false
    }
    return true
  })

  if (selecionados.length === 0) {
    throw new Error(
      codigoFiltro
        ? `Nenhum funcionário ativo com o código ${codigoFiltro} e role funcionario foi encontrado.`
        : 'Nenhum funcionário ativo com role funcionario foi encontrado.',
    )
  }

  const { data: listaAuth, error: erroListaAuth } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })

  if (erroListaAuth) throw erroListaAuth

  const usuariosAuthPorEmail = new Map(
    (listaAuth.users ?? []).map((user) => [
      String(user.email ?? '').toLowerCase(),
      user,
    ]),
  )

  const credenciaisGeradas = []
  const ignorados = []
  const falhas = []

  for (const funcionario of selecionados) {
    const codigo = String(funcionario.codigo_acesso).padStart(3, '0')

    if (funcionario.auth_user_id) {
      ignorados.push(`${codigo} - já possui auth_user_id`)
      continue
    }

    const email = `funcionario-${codigo}@${projectDomain}`
    const senha = criarSenhaInicial()

    let authUser = usuariosAuthPorEmail.get(email.toLowerCase())
    let usuarioFoiCriadoAgora = false

    if (authUser) {
      const { data, error } = await supabase.auth.admin.updateUserById(
        authUser.id,
        {
          password: senha,
          email_confirm: true,
          user_metadata: {
            mastertec_funcionario_id: funcionario.id,
            mastertec_codigo: codigo,
          },
        },
      )

      if (error) {
        falhas.push(
          `${codigo} - não foi possível atualizar usuário Auth: ${error.message}`,
        )
        continue
      }

      authUser = data.user
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: {
          mastertec_funcionario_id: funcionario.id,
          mastertec_codigo: codigo,
        },
      })

      if (error || !data.user) {
        falhas.push(
          `${codigo} - não foi possível criar usuário Auth: ${error?.message ?? 'usuário não retornado'}`,
        )
        continue
      }

      authUser = data.user
      usuarioFoiCriadoAgora = true
    }

    const { data: vinculo, error: erroVinculo } = await supabase
      .from('usuarios')
      .update({ auth_user_id: authUser.id })
      .eq('id', funcionario.id)
      .is('auth_user_id', null)
      .select('id')
      .maybeSingle()

    if (erroVinculo || !vinculo) {
      if (usuarioFoiCriadoAgora) {
        await supabase.auth.admin.deleteUser(authUser.id)
      }

      falhas.push(
        `${codigo} - falha ao vincular auth_user_id: ${erroVinculo?.message ?? 'o cadastro já foi alterado'}`,
      )
      continue
    }

    credenciaisGeradas.push({
      codigo,
      nome: funcionario.nome,
      email_interno: email,
      senha_inicial: senha,
    })

    console.log(`Conta vinculada: ${codigo} - ${funcionario.nome}`)
  }

  if (credenciaisGeradas.length > 0) {
    const arquivo = join(
      tmpdir(),
      `mastertec-senhas-iniciais-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
    )

    const linhas = [
      ['codigo', 'nome', 'email_interno', 'senha_inicial'].join(';'),
      ...credenciaisGeradas.map((item) =>
        [
          item.codigo,
          item.nome,
          item.email_interno,
          item.senha_inicial,
        ]
          .map(csvCell)
          .join(';'),
      ),
    ]

    writeFileSync(arquivo, '\uFEFF' + linhas.join('\r\n'), 'utf8')

    console.log('')
    console.log(`Credenciais salvas em arquivo temporário: ${arquivo}`)
    console.log('Guarde esse arquivo em local seguro e entregue cada senha somente ao respectivo funcionário.')
    console.log('O arquivo não é salvo dentro do projeto.')
  }

  if (ignorados.length > 0) {
    console.log('\nIgnorados:')
    for (const item of ignorados) console.log(`- ${item}`)
  }

  if (falhas.length > 0) {
    console.error('\nFalhas:')
    for (const item of falhas) console.error(`- ${item}`)
    process.exitCode = 1
  }

  console.log(
    `\nFinalizado. Novas contas vinculadas: ${credenciaisGeradas.length}; já vinculadas: ${ignorados.length}; falhas: ${falhas.length}.`,
  )
}

main().catch((error) => {
  console.error('ERRO NO PROVISIONAMENTO:', error)
  process.exitCode = 1
})

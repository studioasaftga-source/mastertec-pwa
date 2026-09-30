import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'

import './App.css'

import { supabase } from './lib/supabase'

type TipoEntrada = 'veiculo' | 'peca'

type TipoPeca =
  | 'bomba'
  | 'bico'
  | 'turbina'
  | 'outro'

type TelaPrincipal =
  | 'entrada'
  | 'ordens'
  | 'comissoes'

type VeiculoEncontrado = {
  id: string
  placa: string | null
  modelo: string | null
  frota: string | null
  cliente_nome: string | null
  telefone: string | null
}

type FuncionarioLocal = {
  id: string
  nome: string
  codigo_acesso: string
  empresa_id: string | null
  usa_comissao: boolean
}

type DadosSalvos = {
  tipoEntrada: TipoEntrada

  placa: string
  modelo: string
  frota: string

  tiposPeca: TipoPeca[]

  descricaoPeca: string

  cliente: string
  telefone: string

  observacao: string

  foto1Base64: string | null
  foto1Nome: string | null
  foto1Tipo: string | null

  foto2Base64: string | null
  foto2Nome: string | null
  foto2Tipo: string | null
}

type OrdemServicoPWA = {
  id: string
  empresa_id: string
  entrada_id: string | null
  responsavel_id: string | null
  numero: number | null
  titulo: string
  cliente_nome: string | null
  descricao: string | null
  status: string
  prioridade: string
  data_entrada: string
  data_inicio: string | null
  data_conclusao: string | null
  observacoes: string | null
  percentual_comissao: number | null
  valor_servicos: number | null
  valor_pecas: number | null
  valor_total: number | null
  valor_comissao: number | null
  updated_at: string
}

type EntradaOS = {
  id: string
  empresa_id: string
  placa: string | null
  ano: number | null
  modelo: string | null
  cliente_nome: string | null
  telefone: string | null
  observacao: string | null
  frota: string | null
  criado_em: string | null
  tipo_entrada: string | null
  tipo_peca: string | null
  descricao_peca: string | null
  foto_url: string | null
  foto_url_2: string | null
}

type LinhaServico = {
  id: string
  descricao: string
  quantidade: string
  valor: string
}

type TarefaExistente = {
  id: string
  ordem_servico_id: string
  responsavel_id: string | null
  titulo: string | null
  descricao: string | null
  quantidade: number | null
  valor_unitario: number | null
  valor_total: number | null
  ordem: number | null
  tipo: 'servico' | 'peca' | null
}

const STORAGE_KEY =
  'mastertec_entrada_em_andamento'

const FUNCIONARIO_STORAGE_KEY =
  'mastertec_funcionario'

function criarLinhaServico(): LinhaServico {
  return {
    id: '',
    descricao: '',
    quantidade: '1',
    valor: '',
  }
}

const SERVICOS_BASE_SUGESTAO = [
  'Diagnóstico',
  'Reparar e regular bomba',
  'Reparar e regular bico',
  'Reparar e regular unidade',
  'Remoção e instalação de bomba',
  'Remoção e instalação de bico',
  'Remoção e instalação de unidade',
]

const SERVICOS_MEMORIA_STORAGE_KEY =
  'mastertec_servicos_memoria'

function normalizarTextoBusca(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

function converterNumero(valor: string) {
  if (!valor) {
    return 0
  }

  let texto = valor
    .trim()
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')

  if (texto.includes(',')) {
    texto = texto.replace(/\./g, '')
    texto = texto.replace(',', '.')
  }

  const numero = Number(texto)

  return Number.isFinite(numero)
    ? numero
    : 0
}

function formatarMoedaNumero(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

function statusOSFechada(
  status: string | null | undefined,
) {
  // 'servico_finalizado' significa que o funcionário enviou o serviço
  // para o painel. A O.S. continua editável até o responsável do painel
  // realmente encerrá-la.
  return (
    status === 'concluida' ||
    status === 'encerrada' ||
    status === 'cancelada'
  )
}

function statusEntraNaComissao(
  status: string | null | undefined,
) {
  return status === 'concluida' || status === 'encerrada'
}

function obterMesAtualCuiaba() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cuiaba',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function obterMesDaDataCuiaba(
  data: string | null | undefined,
) {
  if (!data) return ''

  const date = new Date(data)

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cuiaba',
    year: 'numeric',
    month: '2-digit',
  }).format(date)
}

function formatarMesAtual(mes: string) {
  const [ano, numeroMes] = mes.split('-').map(Number)

  if (!ano || !numeroMes) return mes

  const data = new Date(Date.UTC(ano, numeroMes - 1, 1))

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(data)
}

function App() {
  const [
    funcionario,
    setFuncionario,
  ] = useState<FuncionarioLocal | null>(null)

  const [
    codigoFuncionario,
    setCodigoFuncionario,
  ] = useState('')

  const [
    buscandoFuncionario,
    setBuscandoFuncionario,
  ] = useState(false)

  const [
    erroFuncionario,
    setErroFuncionario,
  ] = useState('')

  const [
    telaPrincipal,
    setTelaPrincipal,
  ] = useState<TelaPrincipal>('entrada')

  const [
    minhasOrdens,
    setMinhasOrdens,
  ] = useState<OrdemServicoPWA[]>([])

  const [
    carregandoOrdens,
    setCarregandoOrdens,
  ] = useState(false)

  const [
    erroOrdens,
    setErroOrdens,
  ] = useState('')

  const [
    mesComissao,
    setMesComissao,
  ] = useState(obterMesAtualCuiaba())

  const [
    ordemAberta,
    setOrdemAberta,
  ] = useState<OrdemServicoPWA | null>(null)

  const [
    entradaDaOrdem,
    setEntradaDaOrdem,
  ] = useState<EntradaOS | null>(null)

  const [
    carregandoDetalhesOS,
    setCarregandoDetalhesOS,
  ] = useState(false)

  const [
    linhasServico,
    setLinhasServico,
  ] = useState<LinhaServico[]>([
    criarLinhaServico(),
  ])

  const [
    linhasPecas,
    setLinhasPecas,
  ] = useState<LinhaServico[]>([])

  const [
    finalizandoOS,
    setFinalizandoOS,
  ] = useState(false)

  const [
    tarefasOriginais,
    setTarefasOriginais,
  ] = useState<TarefaExistente[]>([])

  const [
    servicosMemoria,
    setServicosMemoria,
  ] = useState<string[]>([])

  const [
    indiceServicoComSugestao,
    setIndiceServicoComSugestao,
  ] = useState<number | null>(null)

  const cameraInput1Ref =
    useRef<HTMLInputElement>(null)

  const cameraInput2Ref =
    useRef<HTMLInputElement>(null)

  const [
    tipoEntrada,
    setTipoEntrada,
  ] = useState<TipoEntrada>('veiculo')

  const [
    foto1,
    setFoto1,
  ] = useState<string | null>(null)

  const [
    arquivoFoto1,
    setArquivoFoto1,
  ] = useState<File | null>(null)

  const [
    foto2,
    setFoto2,
  ] = useState<string | null>(null)

  const [
    arquivoFoto2,
    setArquivoFoto2,
  ] = useState<File | null>(null)

  const [
    placa,
    setPlaca,
  ] = useState('')

  const [
    modelo,
    setModelo,
  ] = useState('')

  const [
    frota,
    setFrota,
  ] = useState('')

  const [
    tiposPeca,
    setTiposPeca,
  ] = useState<TipoPeca[]>([])

  const [
    descricaoPeca,
    setDescricaoPeca,
  ] = useState('')

  const [
    cliente,
    setCliente,
  ] = useState('')

  const [
    telefone,
    setTelefone,
  ] = useState('')

  const [
    observacao,
    setObservacao,
  ] = useState('')

  const [
    enviando,
    setEnviando,
  ] = useState(false)

  const [
    consultandoPlaca,
    setConsultandoPlaca,
  ] = useState(false)

  const [
    veiculoEncontrado,
    setVeiculoEncontrado,
  ] = useState<VeiculoEncontrado | null>(null)

  const [
    mostrarVeiculoEncontrado,
    setMostrarVeiculoEncontrado,
  ] = useState(false)

  const ultimaPlacaConsultada = useRef('')

  const restauracaoConcluida = useRef(false)

  const finalizacaoEmAndamento = useRef(false)

  useEffect(() => {
    async function restaurarFuncionario() {
      try {
        const salvo = localStorage.getItem(
          FUNCIONARIO_STORAGE_KEY,
        )

        if (!salvo) {
          return
        }

        const dados =
          JSON.parse(salvo) as Partial<FuncionarioLocal>

        if (
          dados &&
          dados.id &&
          dados.nome &&
          dados.codigo_acesso
        ) {
          const funcionarioBase: FuncionarioLocal = {
            id: dados.id,
            nome: dados.nome,
            codigo_acesso: dados.codigo_acesso,
            empresa_id: dados.empresa_id ?? null,
            usa_comissao: Boolean(dados.usa_comissao),
          }

          setFuncionario(funcionarioBase)

          try {
            const { data: permissao, error: erroPermissao } = await supabase.rpc(
              'buscar_usa_comissao_por_codigo',
              { p_codigo: dados.codigo_acesso },
            )

            if (erroPermissao) throw erroPermissao

            const atualizado = {
              ...funcionarioBase,
              usa_comissao: Boolean(permissao),
            }

            localStorage.setItem(
              FUNCIONARIO_STORAGE_KEY,
              JSON.stringify(atualizado),
            )
            setFuncionario(atualizado)
          } catch (erroPermissao) {
            console.warn(
              'Não foi possível atualizar a permissão de comissão; mantendo o estado local:',
              erroPermissao,
            )
          }
        }
      } catch (error) {
        console.error(
          'ERRO AO RESTAURAR FUNCIONÁRIO:',
          error,
        )

        localStorage.removeItem(
          FUNCIONARIO_STORAGE_KEY,
        )
      }
    }

    void restaurarFuncionario()
  }, [])

  useEffect(() => {
    if (funcionario && !funcionario.usa_comissao && telaPrincipal !== 'entrada') {
      setTelaPrincipal('entrada')
      setOrdemAberta(null)
    }
  }, [funcionario, telaPrincipal])

  async function entrarComoFuncionario() {
    const codigo = codigoFuncionario
      .trim()
      .replace(/\D/g, '')
      .slice(0, 3)

    setErroFuncionario('')

    if (!codigo) {
      setErroFuncionario(
        'Digite o código do funcionário.',
      )

      return
    }

    setBuscandoFuncionario(true)

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        'buscar_funcionario_por_codigo',
        {
          p_codigo: codigo,
        },
      )

      if (error) {
        console.error(
          'ERRO AO BUSCAR FUNCIONÁRIO:',
          error,
        )

        setErroFuncionario(
          `Não foi possível identificar o funcionário: ${error.message}`,
        )

        return
      }

      const funcionarioEncontrado =
        Array.isArray(data) ? data[0] : null

      if (!funcionarioEncontrado) {
        setErroFuncionario(
          'Código não encontrado ou funcionário inativo.',
        )

        return
      }

      const {
        data: usaComissao,
        error: erroPermissao,
      } = await supabase.rpc(
        'buscar_usa_comissao_por_codigo',
        {
          p_codigo: funcionarioEncontrado.codigo_acesso,
        },
      )

      if (erroPermissao) {
        throw erroPermissao
      }

      const funcionarioLocal: FuncionarioLocal =
        {
          id: funcionarioEncontrado.id,
          nome: funcionarioEncontrado.nome,
          codigo_acesso:
            funcionarioEncontrado.codigo_acesso,
          empresa_id:
            funcionarioEncontrado.empresa_id ??
            null,
          usa_comissao: Boolean(usaComissao),
        }

      localStorage.setItem(
        FUNCIONARIO_STORAGE_KEY,
        JSON.stringify(funcionarioLocal),
      )

      setFuncionario(funcionarioLocal)

      setCodigoFuncionario('')
      setErroFuncionario('')
    } catch (error) {
      console.error(
        'ERRO AO IDENTIFICAR FUNCIONÁRIO:',
        error,
      )

      setErroFuncionario(
        'Não foi possível identificar o funcionário.',
      )
    } finally {
      setBuscandoFuncionario(false)
    }
  }

  function trocarFuncionario() {
    if (enviando) {
      return
    }

    const confirmar = window.confirm(
      'Deseja trocar o funcionário deste celular?',
    )

    if (!confirmar) {
      return
    }

    localStorage.removeItem(
      FUNCIONARIO_STORAGE_KEY,
    )

    setFuncionario(null)
    setCodigoFuncionario('')
    setErroFuncionario('')
    setTelaPrincipal('entrada')
  }

  async function anexarNomesClientes(
    ordens: OrdemServicoPWA[],
  ): Promise<OrdemServicoPWA[]> {
    const entradasIds = Array.from(
      new Set(
        ordens
          .map(ordem => ordem.entrada_id)
          .filter((id): id is string => !!id),
      ),
    )

    if (entradasIds.length === 0) {
      return ordens
    }

    try {
      const { data, error } = await supabase
        .from('entradas_veiculos')
        .select('id,cliente_nome')
        .in('id', entradasIds)

      if (error) {
        console.warn(
          'Não foi possível carregar os nomes dos clientes das O.S.:',
          error,
        )
        return ordens
      }

      const clientes = new Map<string, string | null>(
        (data ?? []).map(item => [
          item.id,
          item.cliente_nome ?? null,
        ]),
      )

      return ordens.map(ordem => ({
        ...ordem,
        cliente_nome: ordem.entrada_id
          ? clientes.get(ordem.entrada_id) ?? ordem.cliente_nome ?? null
          : ordem.cliente_nome ?? null,
      }))
    } catch (error) {
      console.warn(
        'Erro ao anexar nomes dos clientes às O.S.:',
        error,
      )
      return ordens
    }
  }

  const ordemAbertaIdAtual = ordemAberta?.id ?? null

  const carregarMinhasOrdens =
    useCallback(async (mostrarCarregando = true) => {
      if (
        !funcionario?.id ||
        !funcionario.codigo_acesso ||
        !funcionario.usa_comissao
      ) {
        return
      }

      try {
        if (mostrarCarregando) {
          setCarregandoOrdens(true)
        }

        setErroOrdens('')

        const {
          data,
          error,
        } = await supabase.rpc(
          'buscar_minhas_ordens_por_codigo',
          {
            p_codigo:
              funcionario.codigo_acesso,
          },
        )

        if (error) {
          throw error
        }

        let ordensAtualizadas =
          await anexarNomesClientes(
            (data ?? []) as OrdemServicoPWA[],
          )

        // Para a O.S. atualmente aberta, consulta também a tabela diretamente.
        // Isso evita que o PWA fique com status antigo quando o painel acabou
        // de encerrar a O.S. ou alterou o responsável.
        if (ordemAbertaIdAtual) {
          try {
            const { data: ordemDireta, error: erroDireto } =
              await supabase
                .from('ordens_servico')
                .select(
                  `
                  id,
                  empresa_id,
                  entrada_id,
                  responsavel_id,
                  numero,
                  titulo,
                  descricao,
                  status,
                  prioridade,
                  data_entrada,
                  data_inicio,
                  data_conclusao,
                  observacoes,
                  percentual_comissao,
                  valor_servicos,
                  valor_pecas,
                  valor_total,
                  valor_comissao,
                  updated_at
                `,
                )
                .eq('id', ordemAbertaIdAtual)
                .maybeSingle()

            if (!erroDireto && ordemDireta) {
              const ordemDiretaComCliente =
                (await anexarNomesClientes([
                  ordemDireta as OrdemServicoPWA,
                ]))[0]

              const indice = ordensAtualizadas.findIndex(
                ordem => ordem.id === ordemAbertaIdAtual,
              )

              ordensAtualizadas =
                indice >= 0
                  ? ordensAtualizadas.map(ordem =>
                      ordem.id === ordemAbertaIdAtual
                        ? ordemDiretaComCliente
                        : ordem,
                    )
                  : [ordemDiretaComCliente, ...ordensAtualizadas]

              setOrdemAberta(ordemDiretaComCliente)
            } else {
              setOrdemAberta(atual => {
                if (!atual) return atual
                return (
                  ordensAtualizadas.find(
                    ordem => ordem.id === atual.id,
                  ) || atual
                )
              })
            }
          } catch (error) {
            console.warn(
              'Não foi possível sincronizar diretamente a O.S. aberta:',
              error,
            )

            setOrdemAberta(atual => {
              if (!atual) return atual
              return (
                ordensAtualizadas.find(
                  ordem => ordem.id === atual.id,
                ) || atual
              )
            })
          }
        }

        setMinhasOrdens(ordensAtualizadas)
      } catch (error: any) {
        console.error(
          'ERRO AO CARREGAR MINHAS OS:',
          error,
        )

        if (mostrarCarregando) {
          setMinhasOrdens([])
        }

        setErroOrdens(
          error?.message ||
            'Não foi possível carregar suas Ordens de Serviço.',
        )
      } finally {
        if (mostrarCarregando) {
          setCarregandoOrdens(false)
        }
      }
    }, [
      funcionario?.id,
      funcionario?.codigo_acesso,
      ordemAbertaIdAtual,
    ])

  useEffect(() => {
    if (
      !funcionario?.id ||
      telaPrincipal !== 'ordens'
    ) {
      return
    }

    void carregarMinhasOrdens()

    // Consulta periodicamente o status real da O.S. no banco.
    // Isso evita que o PWA continue editável usando um status antigo
    // depois que o painel encerrou a O.S.
    const intervalo = window.setInterval(() => {
      void carregarMinhasOrdens(false)
    }, 5000)

    return () => {
      window.clearInterval(intervalo)
    }
  }, [
    funcionario?.id,
    telaPrincipal,
    carregarMinhasOrdens,
  ])

  const mesAtual = obterMesAtualCuiaba()

  const ordensVisiveis = useMemo(() => {
    const abertas = minhasOrdens.filter(
      ordem => !statusOSFechada(ordem.status),
    )

    const encerradasDoMes = minhasOrdens.filter(
      ordem =>
        statusOSFechada(ordem.status) &&
        obterMesDaDataCuiaba(ordem.data_conclusao) === mesAtual,
    )

    const ordenarMaisRecentes = (
      primeira: OrdemServicoPWA,
      segunda: OrdemServicoPWA,
      campo: 'data_entrada' | 'data_conclusao',
    ) => {
      const dataPrimeira = new Date(
        primeira[campo] || 0,
      ).getTime()
      const dataSegunda = new Date(
        segunda[campo] || 0,
      ).getTime()

      return dataSegunda - dataPrimeira
    }

    abertas.sort((a, b) =>
      ordenarMaisRecentes(a, b, 'data_entrada'),
    )

    encerradasDoMes.sort((a, b) =>
      ordenarMaisRecentes(a, b, 'data_conclusao'),
    )

    return [...abertas, ...encerradasDoMes]
  }, [minhasOrdens, mesAtual])

  const comissoesDoMes = minhasOrdens.filter(ordem =>
    statusEntraNaComissao(ordem.status) &&
    obterMesDaDataCuiaba(ordem.data_conclusao) === mesComissao,
  )

  const resumoMinhasComissoes = useMemo(() => {
    const clientesMap = new Map<
      string,
      {
        nome: string
        ordens: number
        servicos: number
        valorServicos: number
        comissao: number
      }
    >()

    let totalServicos = 0
    let totalComissao = 0

    for (const ordem of comissoesDoMes) {
      const cliente =
        ordem.cliente_nome?.trim() || 'Cliente não informado'
      const chave = cliente.toLocaleLowerCase('pt-BR')

      const valorServicos = Number(ordem.valor_servicos ?? 0)
      const valorComissao = Number(ordem.valor_comissao ?? 0)

      totalServicos += valorServicos
      totalComissao += valorComissao

      const atual = clientesMap.get(chave)

      if (atual) {
        atual.ordens += 1
        atual.servicos += valorServicos > 0 ? 1 : 0
        atual.valorServicos += valorServicos
        atual.comissao += valorComissao
      } else {
        clientesMap.set(chave, {
          nome: cliente,
          ordens: 1,
          servicos: valorServicos > 0 ? 1 : 0,
          valorServicos,
          comissao: valorComissao,
        })
      }
    }

    return {
      ordens: comissoesDoMes.length,
      clientes: Array.from(clientesMap.values()).sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR'),
      ),
      totalServicos,
      totalComissao,
    }
  }, [comissoesDoMes])

  async function buscarOrdemAtualPorCodigo(
    ordemId: string,
  ): Promise<OrdemServicoPWA | null> {
    if (!funcionario?.id) {
      return null
    }

    // Primeiro lê diretamente a O.S. pelo ID. O status retornado aqui é o
    // estado atual do banco, inclusive depois que o painel a encerrou.
    try {
      const { data: ordemDireta, error: erroDireto } =
        await supabase
          .from('ordens_servico')
          .select(
            `
            id,
            empresa_id,
            entrada_id,
            responsavel_id,
            numero,
            titulo,
            descricao,
            status,
            prioridade,
            data_entrada,
            data_inicio,
            data_conclusao,
            observacoes,
            percentual_comissao,
            valor_servicos,
            valor_pecas,
            valor_total,
            valor_comissao,
            updated_at
          `,
          )
          .eq('id', ordemId)
          .maybeSingle()

      if (!erroDireto && ordemDireta) {
        const ordemComCliente =
          (await anexarNomesClientes([
            ordemDireta as OrdemServicoPWA,
          ]))[0]

        setMinhasOrdens(anterior => {
          const existe = anterior.some(
            ordem => ordem.id === ordemId,
          )

          return existe
            ? anterior.map(ordem =>
                ordem.id === ordemId
                  ? ordemComCliente
                  : ordem,
              )
            : [ordemComCliente, ...anterior]
        })

        setOrdemAberta(ordemComCliente)
        return ordemComCliente
      }
    } catch (error) {
      console.warn(
        'Consulta direta da O.S. falhou; usando a RPC como fallback:',
        error,
      )
    }

    if (!funcionario.codigo_acesso) {
      return null
    }

    const {
      data,
      error,
    } = await supabase.rpc(
      'buscar_minhas_ordens_por_codigo',
      {
        p_codigo:
          funcionario.codigo_acesso,
      },
    )

    if (error) {
      throw error
    }

    const ordensAtualizadas =
      await anexarNomesClientes(
        (data ?? []) as OrdemServicoPWA[],
      )

    const ordemAtual =
      ordensAtualizadas.find(
        ordem => ordem.id === ordemId,
      ) || null

    setMinhasOrdens(ordensAtualizadas)

    if (ordemAtual) {
      setOrdemAberta(ordemAtual)
    }

    return ordemAtual
  }

  async function abrirMinhaOS(
    ordem: OrdemServicoPWA,
  ) {
    if (!funcionario?.usa_comissao) {
      return
    }
    try {
      setCarregandoDetalhesOS(true)
      setErroOrdens('')

      // Nunca abrimos a O.S. usando apenas o status antigo que veio
      // da lista. Primeiro buscamos o status atual no banco.
      const ordemAtual =
        await buscarOrdemAtualPorCodigo(ordem.id)

      const ordemParaAbrir =
        ordemAtual || ordem

      setOrdemAberta(ordemParaAbrir)
      setEntradaDaOrdem(null)
      setTarefasOriginais([])

      const entradaPromise =
        ordemParaAbrir.entrada_id
          ? supabase
              .from('entradas_veiculos')
              .select(
                `
                id,
                empresa_id,
                placa,
                ano,
                modelo,
                cliente_nome,
                telefone,
                observacao,
                frota,
                criado_em,
                tipo_entrada,
                tipo_peca,
                descricao_peca,
                foto_url,
                foto_url_2
              `,
              )
              .eq('id', ordemParaAbrir.entrada_id)
              .maybeSingle()
          : Promise.resolve({
              data: null,
              error: null,
            })

      const tarefasPromise =
        supabase
          .from('os_tarefas')
          .select(
            `
            id,
            ordem_servico_id,
            responsavel_id,
            titulo,
            descricao,
            quantidade,
            valor_unitario,
            valor_total,
            ordem,
            tipo
          `,
          )
          .eq(
            'ordem_servico_id',
            ordemParaAbrir.id,
          )
          .order('ordem', {
            ascending: true,
          })

      const [
        entradaResult,
        tarefasResult,
      ] = await Promise.all([
        entradaPromise,
        tarefasPromise,
      ])

      if (entradaResult.error) {
        throw entradaResult.error
      }

      if (tarefasResult.error) {
        throw tarefasResult.error
      }

      setEntradaDaOrdem(
        entradaResult.data as EntradaOS | null,
      )

      const tarefas =
        (tarefasResult.data ??
          []) as TarefaExistente[]

      setTarefasOriginais(tarefas)

      const converterTarefaParaLinha = (
        tarefa: TarefaExistente,
      ): LinhaServico => ({
        id: tarefa.id,
        descricao:
          tarefa.descricao?.trim() ||
          tarefa.titulo?.trim() ||
          '',
        quantidade: String(
          tarefa.quantidade ?? 1,
        ),
        valor: Number(
          tarefa.valor_unitario ??
            tarefa.valor_total ??
            0,
        )
          .toFixed(2)
          .replace('.', ','),
      })

      const servicosExistentes = tarefas
        .filter(tarefa => tarefa.tipo !== 'peca')
        .map(converterTarefaParaLinha)

      const pecasExistentes = tarefas
        .filter(tarefa => tarefa.tipo === 'peca')
        .map(converterTarefaParaLinha)

      if (servicosExistentes.length === 0) {
        servicosExistentes.push(
          criarLinhaServico(),
        )
      } else if (
        !statusOSFechada(ordemParaAbrir.status)
      ) {
        servicosExistentes.push(
          criarLinhaServico(),
        )
      }

      setLinhasServico(
        servicosExistentes,
      )

      setLinhasPecas(
        pecasExistentes,
      )
    } catch (error: any) {
      console.error(
        'ERRO AO ABRIR OS:',
        error,
      )

      setErroOrdens(
        error?.message ||
          'Não foi possível abrir a Ordem de Serviço.',
      )

      setLinhasServico([
        criarLinhaServico(),
      ])

      setLinhasPecas([])
    } finally {
      setCarregandoDetalhesOS(false)
    }
  }

  const osEditavel =
    !!ordemAberta &&
    !statusOSFechada(ordemAberta.status)

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(
        SERVICOS_MEMORIA_STORAGE_KEY,
      )

      if (!salvo) {
        return
      }

      const lista = JSON.parse(salvo)

      if (!Array.isArray(lista)) {
        return
      }

      const limpa = lista
        .filter(
          item =>
            typeof item === 'string' &&
            item.trim().length > 0,
        )
        .map(item => item.trim())

      setServicosMemoria(limpa)
    } catch (error) {
      console.warn(
        'Não foi possível carregar a memória de serviços:',
        error,
      )
    }
  }, [])

  function listaCompletaDeServicos() {
    const nomes = [
      ...SERVICOS_BASE_SUGESTAO,
      ...servicosMemoria,
    ]

    const vistos = new Set<string>()
    const resultado: string[] = []

    for (const nome of nomes) {
      const texto = String(nome || '').trim()
      const chave = normalizarTextoBusca(texto)

      if (!texto || vistos.has(chave)) {
        continue
      }

      vistos.add(chave)
      resultado.push(texto)
    }

    return resultado
  }

  function obterSugestoesServico(
    texto: string,
  ) {
    const busca = normalizarTextoBusca(texto)

    if (!busca) {
      return []
    }

    return listaCompletaDeServicos()
      .filter(item => {
        const nome = normalizarTextoBusca(item)
        return nome.includes(busca)
      })
      .sort((a, b) => {
        const nomeA = normalizarTextoBusca(a)
        const nomeB = normalizarTextoBusca(b)
        const comecaA = nomeA.startsWith(busca)
        const comecaB = nomeB.startsWith(busca)

        if (comecaA !== comecaB) {
          return comecaA ? -1 : 1
        }

        return a.localeCompare(b, 'pt-BR')
      })
      .slice(0, 7)
  }

  function memorizarServico(descricao: string) {
    const texto = descricao.trim()

    if (!texto) {
      return
    }

    setServicosMemoria(anterior => {
      const existente = anterior.some(
        item =>
          normalizarTextoBusca(item) ===
          normalizarTextoBusca(texto),
      )

      const novaLista = existente
        ? anterior
        : [texto, ...anterior].slice(0, 80)

      try {
        localStorage.setItem(
          SERVICOS_MEMORIA_STORAGE_KEY,
          JSON.stringify(novaLista),
        )
      } catch (error) {
        console.warn(
          'Não foi possível salvar a memória de serviços:',
          error,
        )
      }

      return novaLista
    })
  }

  function selecionarSugestaoServico(
    index: number,
    descricao: string,
  ) {
    atualizarLinha(
      'servico',
      index,
      'descricao',
      descricao,
    )
    memorizarServico(descricao)
    setIndiceServicoComSugestao(null)
  }

  function adicionarLinha(
    tipo: 'servico' | 'peca',
  ) {
    if (!osEditavel) {
      return
    }

    if (tipo === 'servico') {
      setLinhasServico(anterior => [
        ...anterior,
        criarLinhaServico(),
      ])
      return
    }

    setLinhasPecas(anterior => [
      ...anterior,
      criarLinhaServico(),
    ])
  }

  function atualizarLinha(
    tipo: 'servico' | 'peca',
    index: number,
    campo:
      | 'descricao'
      | 'quantidade'
      | 'valor',
    valor: string,
  ) {
    if (!osEditavel) {
      return
    }

    const setter =
      tipo === 'servico'
        ? setLinhasServico
        : setLinhasPecas

    setter(anterior => {
      const novas = [...anterior]

      novas[index] = {
        ...novas[index],
        [campo]: valor,
      }

      return novas
    })
  }

  function totalDasLinhas(
    linhas: LinhaServico[],
  ) {
    return linhas.reduce(
      (total, linha) => {
        const quantidade =
          converterNumero(
            linha.quantidade,
          ) || 1

        const valor =
          converterNumero(linha.valor)

        return total + quantidade * valor
      },
      0,
    )
  }

  const totalServicos =
    totalDasLinhas(linhasServico)

  const totalPecas =
    totalDasLinhas(linhasPecas)

  const totalOrdemAberta =
    totalServicos + totalPecas

  async function finalizarEnviarOS() {
    if (
      !ordemAberta ||
      !funcionario
    ) {
      return
    }

    // Protege contra dois toques rápidos no botão. Sem esta trava,
    // duas requisições podem inserir a mesma linha de serviço.
    if (finalizacaoEmAndamento.current) {
      return
    }

    if (!osEditavel) {
      alert(
        'Esta O.S. está encerrada e está disponível somente para visualização.',
      )

      return
    }

    try {
      finalizacaoEmAndamento.current = true
      setFinalizandoOS(true)

      // CONFIRMA O STATUS REAL ANTES DE ALTERAR QUALQUER TAREFA.
      // Se o painel já encerrou a O.S., o PWA para imediatamente
      // e não envia nenhuma alteração.
      const ordemAtual =
        await buscarOrdemAtualPorCodigo(ordemAberta.id)

      if (!ordemAtual) {
        throw new Error(
          'Esta O.S. não está mais disponível para este funcionário.',
        )
      }

      if (statusOSFechada(ordemAtual.status)) {
        setOrdemAberta(ordemAtual)
        await abrirMinhaOS(ordemAtual)

        alert(
          'Esta O.S. já foi encerrada pelo painel. Não é mais possível fazer alterações.',
        )

        return
      }

      // Usa o estado recém-consultado como fonte da verdade.
      setOrdemAberta(ordemAtual)

      const linhasPreenchidas = [
        ...linhasServico.map(linha => ({
          ...linha,
          tipo: 'servico' as const,
        })),
        ...linhasPecas.map(linha => ({
          ...linha,
          tipo: 'peca' as const,
        })),
      ]
        .map((linha, index) => {
          const quantidade =
            converterNumero(
              linha.quantidade,
            )

          const valor =
            converterNumero(linha.valor)

          return {
            ...linha,
            index,
            descricao:
              linha.descricao.trim(),
            quantidadeNumero:
              quantidade > 0
                ? quantidade
                : 1,
            valorNumero: valor,
          }
        })
        .filter(
          linha =>
            linha.descricao ||
            linha.valorNumero > 0,
        )

      let totalServicosSalvo = 0
      let totalPecasSalvo = 0

      const idsMantidos =
        new Set<string>()

      for (
        let i = 0;
        i < linhasPreenchidas.length;
        i++
      ) {
        const linha =
          linhasPreenchidas[i]

        const quantidade =
          linha.quantidadeNumero

        const valor =
          linha.valorNumero

        const valorTotal =
          quantidade * valor

        if (linha.tipo === 'servico') {
          totalServicosSalvo += valorTotal
        } else {
          totalPecasSalvo += valorTotal
        }

        if (linha.id) {
          idsMantidos.add(
            linha.id,
          )

          const { error } =
            await supabase
              .from('os_tarefas')
              .update({
                responsavel_id:
                  funcionario.id,
                titulo:
                  linha.descricao ||
                  (linha.tipo === 'peca'
                    ? 'Peça / Produto'
                    : 'Serviço'),
                descricao:
                  linha.descricao ||
                  null,
                tipo: linha.tipo,
                quantidade,
                valor_unitario:
                  valor,
                valor_total:
                  valorTotal,
                ordem: i + 1,
                status: 'concluida',
                data_conclusao:
                  new Date().toISOString(),
                updated_at:
                  new Date().toISOString(),
              })
              .eq(
                'id',
                linha.id,
              )
              .eq(
                'ordem_servico_id',
                ordemAberta.id,
              )

          if (error) {
            throw error
          }
        } else {
          const {
            data: novaTarefa,
            error,
          } = await supabase
            .from('os_tarefas')
            .insert({
              ordem_servico_id:
                ordemAberta.id,
              servico_id: null,
              responsavel_id:
                funcionario.id,
              titulo:
                linha.descricao ||
                (linha.tipo === 'peca'
                  ? 'Peça / Produto'
                  : 'Serviço'),
              descricao:
                linha.descricao ||
                null,
              tipo: linha.tipo,
              status: 'concluida',
              prioridade: 'normal',
              ordem: i + 1,
              quantidade,
              valor_unitario:
                valor,
              valor_total:
                valorTotal,
              data_conclusao:
                new Date().toISOString(),
              updated_at:
                new Date().toISOString(),
            })
            .select('id')
            .maybeSingle()

          if (error) {
            throw error
          }

          if (novaTarefa?.id) {
            idsMantidos.add(
              novaTarefa.id,
            )
          }
        }
      }

      const idsAntigos =
        tarefasOriginais.map(
          tarefa => tarefa.id,
        )

      const idsParaExcluir =
        idsAntigos.filter(
          tarefaId =>
            !idsMantidos.has(
              tarefaId,
            ),
        )

      if (idsParaExcluir.length > 0) {
        const {
          error: erroExclusao,
        } = await supabase
          .from('os_tarefas')
          .delete()
          .in('id', idsParaExcluir)
          .eq(
            'ordem_servico_id',
            ordemAberta.id,
          )

        if (erroExclusao) {
          console.warn(
            'Não foi possível excluir tarefas removidas:',
            erroExclusao,
          )
        }
      }

      const agora =
        new Date().toISOString()

      const { error: erroOS } =
        await supabase
          .from('ordens_servico')
          .update({
            status: 'servico_finalizado',
            responsavel_id:
              funcionario.id,
            valor_servicos: totalServicosSalvo,
            valor_pecas: totalPecasSalvo,
            valor_total:
              totalServicosSalvo + totalPecasSalvo,
            data_conclusao: agora,
            updated_at: agora,
          })
          .eq('id', ordemAberta.id)
          .eq(
            'responsavel_id',
            funcionario.id,
          )

      if (erroOS) {
        throw erroOS
      }

      const osAtualizada: OrdemServicoPWA = {
        ...ordemAberta,
        status: 'servico_finalizado',
        responsavel_id:
          funcionario.id,
        valor_servicos: totalServicosSalvo,
        valor_pecas: totalPecasSalvo,
        valor_total:
          totalServicosSalvo + totalPecasSalvo,
        data_conclusao: agora,
        updated_at: agora,
      }

      setMinhasOrdens(anterior =>
        anterior.map(ordem =>
          ordem.id === ordemAberta.id
            ? {
                ...ordem,
                status:
                  'servico_finalizado',
                responsavel_id:
                  funcionario.id,
                valor_servicos: totalServicosSalvo,
                valor_pecas: totalPecasSalvo,
                valor_total:
                  totalServicosSalvo + totalPecasSalvo,
                data_conclusao:
                  agora,
                updated_at: agora,
              }
            : ordem,
        ),
      )

      await abrirMinhaOS(osAtualizada)

      for (const linha of linhasPreenchidas) {
        if (linha.tipo === 'servico' && linha.descricao) {
          memorizarServico(linha.descricao)
        }
      }

      alert(
        'O.S. finalizada e enviada com sucesso!',
      )
    } catch (error: any) {
      console.error(
        'ERRO AO FINALIZAR OS:',
        error,
      )

      alert(
        error?.message ||
          'Não foi possível finalizar a O.S.',
      )
    } finally {
      finalizacaoEmAndamento.current = false
      setFinalizandoOS(false)
    }
  }

  function formatarDataHora(
    data: string | null,
  ) {
    if (!data) {
      return ''
    }

    const date = new Date(data)

    if (
      Number.isNaN(date.getTime())
    ) {
      return ''
    }

    return new Intl.DateTimeFormat(
      'pt-BR',
      {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Cuiaba',
      },
    ).format(date)
  }

  function formatarMoeda(
    valor:
      | number
      | string
      | null
      | undefined,
  ) {
    const numero = Number(valor || 0)

    return new Intl.NumberFormat(
      'pt-BR',
      {
        style: 'currency',
        currency: 'BRL',
      },
    ).format(numero)
  }

  function arquivoParaBase64(
    arquivo: File,
  ): Promise<string> {
    return new Promise(
      (
        resolve,
        reject,
      ) => {
        const reader =
          new FileReader()

        reader.onload = () => {
          if (
            typeof reader.result ===
            'string'
          ) {
            resolve(reader.result)
          } else {
            reject(
              new Error(
                'Não foi possível ler a foto.',
              ),
            )
          }
        }

        reader.onerror = () => {
          reject(
            new Error(
              'Erro ao ler a foto.',
            ),
          )
        }

        reader.readAsDataURL(
          arquivo,
        )
      },
    )
  }

  function base64ParaArquivo(
    base64: string,
    nome: string,
    tipo: string,
  ): File {
    const partes =
      base64.split(',')

    const dados = atob(
      partes[1],
    )

    const bytes =
      new Uint8Array(
        dados.length,
      )

    for (
      let i = 0;
      i < dados.length;
      i++
    ) {
      bytes[i] =
        dados.charCodeAt(i)
    }

    return new File(
      [bytes],
      nome,
      {
        type:
          tipo ||
          'image/jpeg',
      },
    )
  }

  async function salvarFormulario(
    fotosAtuais?: {
      foto1?: {
        base64: string
        nome: string
        tipo: string
      } | null

      foto2?: {
        base64: string
        nome: string
        tipo: string
      } | null
    } | null,
  ) {
    if (
      !restauracaoConcluida.current
    ) {
      return
    }

    try {
      const dados: DadosSalvos = {
        tipoEntrada,
        placa,
        modelo,
        frota,
        tiposPeca,
        descricaoPeca,
        cliente,
        telefone,
        observacao,

        foto1Base64:
          fotosAtuais?.foto1?.base64 ??
          (foto1 &&
          foto1.startsWith('data:')
            ? foto1
            : null),

        foto1Nome:
          fotosAtuais?.foto1?.nome ??
          arquivoFoto1?.name ??
          null,

        foto1Tipo:
          fotosAtuais?.foto1?.tipo ??
          arquivoFoto1?.type ??
          null,

        foto2Base64:
          fotosAtuais?.foto2?.base64 ??
          (foto2 &&
          foto2.startsWith('data:')
            ? foto2
            : null),

        foto2Nome:
          fotosAtuais?.foto2?.nome ??
          arquivoFoto2?.name ??
          null,

        foto2Tipo:
          fotosAtuais?.foto2?.tipo ??
          arquivoFoto2?.type ??
          null,
      }

      const existeAlgumDado =
        dados.placa.trim() ||
        dados.modelo.trim() ||
        dados.frota.trim() ||
        dados.tiposPeca.length > 0 ||
        dados.descricaoPeca.trim() ||
        dados.cliente.trim() ||
        dados.telefone.trim() ||
        dados.observacao.trim() ||
        dados.foto1Base64 ||
        dados.foto2Base64

      if (!existeAlgumDado) {
        localStorage.removeItem(
          STORAGE_KEY,
        )

        return
      }

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(dados),
      )
    } catch (error) {
      console.error(
        'ERRO AO SALVAR FORMULÁRIO:',
        error,
      )
    }
  }

  useEffect(() => {
    async function restaurarFormulario() {
      try {
        const salvo =
          localStorage.getItem(
            STORAGE_KEY,
          )

        if (!salvo) {
          restauracaoConcluida.current =
            true

          return
        }

        const dados =
          JSON.parse(
            salvo,
          ) as Partial<DadosSalvos>

        if (dados.tipoEntrada) {
          setTipoEntrada(
            dados.tipoEntrada,
          )
        }

        setPlaca(dados.placa || '')
        setModelo(dados.modelo || '')
        setFrota(dados.frota || '')

        setTiposPeca(
          Array.isArray(
            dados.tiposPeca,
          )
            ? dados.tiposPeca
            : [],
        )

        setDescricaoPeca(
          dados.descricaoPeca ||
            '',
        )

        setCliente(
          dados.cliente || '',
        )

        setTelefone(
          dados.telefone || '',
        )

        setObservacao(
          dados.observacao ||
            '',
        )

        if (dados.foto1Base64) {
          setFoto1(
            dados.foto1Base64,
          )

          if (
            dados.foto1Nome &&
            dados.foto1Tipo
          ) {
            setArquivoFoto1(
              base64ParaArquivo(
                dados.foto1Base64,
                dados.foto1Nome,
                dados.foto1Tipo,
              ),
            )
          }
        }

        if (dados.foto2Base64) {
          setFoto2(
            dados.foto2Base64,
          )

          if (
            dados.foto2Nome &&
            dados.foto2Tipo
          ) {
            setArquivoFoto2(
              base64ParaArquivo(
                dados.foto2Base64,
                dados.foto2Nome,
                dados.foto2Tipo,
              ),
            )
          }
        }

        if (
          dados.placa &&
          dados.placa.length === 7
        ) {
          ultimaPlacaConsultada.current =
            dados.placa
        }
      } catch (error) {
        console.error(
          'ERRO AO RESTAURAR FORMULÁRIO:',
          error,
        )

        localStorage.removeItem(
          STORAGE_KEY,
        )
      } finally {
        restauracaoConcluida.current =
          true
      }
    }

    void restaurarFormulario()
  }, [])

  useEffect(() => {
    if (
      !restauracaoConcluida.current
    ) {
      return
    }

    const timer =
      window.setTimeout(() => {
        void salvarFormulario()
      }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    tipoEntrada,
    placa,
    modelo,
    frota,
    tiposPeca,
    descricaoPeca,
    cliente,
    telefone,
    observacao,
    foto1,
    arquivoFoto1,
    foto2,
    arquivoFoto2,
  ])

  function abrirCamera1() {
    if (enviando) {
      return
    }

    cameraInput1Ref.current?.click()
  }

  function abrirCamera2() {
    if (enviando) {
      return
    }

    cameraInput2Ref.current?.click()
  }

  async function selecionarFoto1(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const arquivo =
      event.target.files?.[0]

    if (!arquivo) {
      return
    }

    try {
      const base64 =
        await arquivoParaBase64(
          arquivo,
        )

      setArquivoFoto1(
        arquivo,
      )

      setFoto1(base64)

      await salvarFormulario({
        foto1: {
          base64,
          nome: arquivo.name,
          tipo:
            arquivo.type ||
            'image/jpeg',
        },
      })
    } catch (error) {
      console.error(
        'ERRO FOTO 1:',
        error,
      )

      alert(
        'Não foi possível salvar a primeira foto.',
      )
    }

    if (
      cameraInput1Ref.current
    ) {
      cameraInput1Ref.current.value =
        ''
    }
  }

  async function selecionarFoto2(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const arquivo =
      event.target.files?.[0]

    if (!arquivo) {
      return
    }

    try {
      const base64 =
        await arquivoParaBase64(
          arquivo,
        )

      setArquivoFoto2(
        arquivo,
      )

      setFoto2(base64)

      await salvarFormulario({
        foto2: {
          base64,
          nome: arquivo.name,
          tipo:
            arquivo.type ||
            'image/jpeg',
        },
      })
    } catch (error) {
      console.error(
        'ERRO FOTO 2:',
        error,
      )

      alert(
        'Não foi possível salvar a segunda foto.',
      )
    }

    if (
      cameraInput2Ref.current
    ) {
      cameraInput2Ref.current.value =
        ''
    }
  }

  async function consultarPlaca(
    placaDigitada: string,
  ) {
    const placaLimpa =
      placaDigitada
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')

    if (placaLimpa.length !== 7) {
      return
    }

    if (
      ultimaPlacaConsultada.current ===
      placaLimpa
    ) {
      return
    }

    ultimaPlacaConsultada.current =
      placaLimpa

    setConsultandoPlaca(true)

    try {
      const {
        data,
        error,
      } = await supabase
        .from('entradas_veiculos')
        .select(
          `
          id,
          placa,
          modelo,
          frota,
          cliente_nome,
          telefone
        `,
        )
        .eq('placa', placaLimpa)
        .order('criado_em', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error(
          'ERRO AO CONSULTAR PLACA:',
          error,
        )

        return
      }

      if (!data) {
        return
      }

      setVeiculoEncontrado(
        data as VeiculoEncontrado,
      )

      setMostrarVeiculoEncontrado(true)
    } catch (error) {
      console.error(
        'ERRO GERAL PLACA:',
        error,
      )
    } finally {
      setConsultandoPlaca(false)
    }
  }

  function alterarPlaca(valor: string) {
    const placaFormatada =
      valor
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 7)

    setPlaca(placaFormatada)

    if (placaFormatada.length < 7) {
      ultimaPlacaConsultada.current =
        ''

      setVeiculoEncontrado(null)

      setMostrarVeiculoEncontrado(false)

      return
    }

    void consultarPlaca(
      placaFormatada,
    )
  }

  function usarCadastroEncontrado() {
    if (!veiculoEncontrado) {
      return
    }

    setPlaca(
      veiculoEncontrado.placa?.toUpperCase() ||
        '',
    )

    setModelo(
      veiculoEncontrado.modelo || '',
    )

    setFrota(
      veiculoEncontrado.frota || '',
    )

    setCliente(
      veiculoEncontrado.cliente_nome ||
        '',
    )

    setTelefone(
      veiculoEncontrado.telefone ||
        '',
    )

    setMostrarVeiculoEncontrado(false)
  }

  function cadastrarOutroVeiculo() {
    setMostrarVeiculoEncontrado(false)
  }

  function trocarTipoEntrada(
    tipo: TipoEntrada,
  ) {
    setTipoEntrada(tipo)

    if (tipo === 'veiculo') {
      setTiposPeca([])
      setDescricaoPeca('')
    }

    if (tipo === 'peca') {
      setPlaca('')
      setFrota('')

      ultimaPlacaConsultada.current =
        ''

      setVeiculoEncontrado(null)
      setMostrarVeiculoEncontrado(false)
    }
  }

  function alternarTipoPeca(
    tipo: TipoPeca,
  ) {
    setTiposPeca(atual => {
      if (atual.includes(tipo)) {
        return atual.filter(
          item => item !== tipo,
        )
      }

      return [...atual, tipo]
    })
  }

  function limparFormulario() {
    setFoto1(null)
    setArquivoFoto1(null)

    setFoto2(null)
    setArquivoFoto2(null)

    setPlaca('')
    setModelo('')
    setFrota('')

    setTiposPeca([])

    setDescricaoPeca('')

    setCliente('')
    setTelefone('')

    setObservacao('')

    setTipoEntrada('veiculo')

    ultimaPlacaConsultada.current =
      ''

    setVeiculoEncontrado(null)
    setMostrarVeiculoEncontrado(false)

    localStorage.removeItem(
      STORAGE_KEY,
    )

    if (
      cameraInput1Ref.current
    ) {
      cameraInput1Ref.current.value =
        ''
    }

    if (
      cameraInput2Ref.current
    ) {
      cameraInput2Ref.current.value =
        ''
    }
  }

  function nomeTipoPeca(
    tipo: TipoPeca,
  ) {
    switch (tipo) {
      case 'bomba':
        return 'BOMBA'

      case 'bico':
        return 'BICO'

      case 'turbina':
        return 'TURBINA'

      case 'outro':
        return 'OUTRO'

      default:
        return tipo
    }
  }

  async function enviar() {
    if (!funcionario) {
      alert(
        'Identifique o funcionário antes de registrar a entrada.',
      )

      return
    }

    if (!arquivoFoto1) {
      alert(
        tipoEntrada === 'veiculo'
          ? 'Tire a primeira foto da frente do veículo com a placa.'
          : 'Tire uma foto da peça antes de enviar.',
      )

      return
    }

    if (
      tipoEntrada === 'veiculo' &&
      !arquivoFoto2
    ) {
      alert(
        'Tire a segunda foto da lateral do veículo, mostrando o modelo.',
      )

      return
    }

    if (
      tipoEntrada === 'veiculo'
    ) {
      if (!placa.trim()) {
        alert(
          'Digite a placa do veículo.',
        )

        return
      }

      if (!modelo.trim()) {
        alert(
          'Digite o modelo do veículo.',
        )

        return
      }
    }

    if (tipoEntrada === 'peca') {
      if (tiposPeca.length === 0) {
        alert(
          'Selecione pelo menos um tipo de peça.',
        )

        return
      }

      if (!descricaoPeca.trim()) {
        alert(
          'Digite a descrição da peça.',
        )

        return
      }

      if (!modelo.trim()) {
        alert(
          'Digite o modelo do veículo onde a peça está aplicada.',
        )

        return
      }
    }

    if (!cliente.trim()) {
      alert(
        'Digite o nome do cliente.',
      )

      return
    }

    setEnviando(true)

    try {
      const extensao1 =
        arquivoFoto1.name
          .split('.')
          .pop()
          ?.toLowerCase() ||
        'jpg'

      const nomeArquivo1 =
        `${tipoEntrada}_frente_${Date.now()}.${extensao1}`

      const caminho1 =
        `entradas/${new Date().getFullYear()}/${nomeArquivo1}`

      const {
        error: erroFoto1,
      } = await supabase.storage
        .from('fotos-entrada')
        .upload(
          caminho1,
          arquivoFoto1,
          {
            contentType:
              arquivoFoto1.type ||
              'image/jpeg',
            upsert: false,
          },
        )

      if (erroFoto1) {
        throw erroFoto1
      }

      const {
        data: fotoPublica1,
      } = supabase.storage
        .from('fotos-entrada')
        .getPublicUrl(caminho1)

      let fotoPublica2:
        string | null = null

      if (
        tipoEntrada === 'veiculo' &&
        arquivoFoto2
      ) {
        const extensao2 =
          arquivoFoto2.name
            .split('.')
            .pop()
            ?.toLowerCase() ||
          'jpg'

        const nomeArquivo2 =
          `${tipoEntrada}_lateral_${Date.now()}.${extensao2}`

        const caminho2 =
          `entradas/${new Date().getFullYear()}/${nomeArquivo2}`

        const {
          error: erroFoto2,
        } = await supabase.storage
          .from('fotos-entrada')
          .upload(
            caminho2,
            arquivoFoto2,
            {
              contentType:
                arquivoFoto2.type ||
                'image/jpeg',
              upsert: false,
            },
          )

        if (erroFoto2) {
          throw erroFoto2
        }

        const {
          data: fotoPublica2Data,
        } = supabase.storage
          .from('fotos-entrada')
          .getPublicUrl(caminho2)

        fotoPublica2 =
          fotoPublica2Data.publicUrl
      }

      const dadosEntrada = {
        empresa_id:
          funcionario.empresa_id ||
          '128d621e-4ee5-4f65-9790-0328a3658230',

        funcionario_id:
          funcionario.id,

        tipo_entrada:
          tipoEntrada,

        placa: placa.trim()
          ? placa.trim().toUpperCase()
          : null,

        modelo:
          modelo.trim() || null,

        frota:
          frota.trim()
            ? frota.trim()
            : null,

        tipo_peca:
          tipoEntrada === 'peca'
            ? tiposPeca
                .map(nomeTipoPeca)
                .join(', ')
            : null,

        tipos_peca:
          tipoEntrada === 'peca'
            ? tiposPeca
            : [],

        descricao_peca:
          tipoEntrada === 'peca'
            ? descricaoPeca.trim()
            : null,

        cliente_nome:
          cliente.trim(),

        telefone:
          telefone.trim() || null,

        observacao:
          observacao.trim() ||
          null,

        foto_url:
          fotoPublica1.publicUrl,

        foto_url_2:
          fotoPublica2,
      }

      const {
        data: entradaCriada,
        error: erroEntrada,
      } = await supabase
        .from('entradas_veiculos')
        .insert(dadosEntrada)
        .select('id')
        .single()

      if (erroEntrada) {
        throw erroEntrada
      }

      // =====================================================
      // O.S. AUTOMÁTICA PARA TÉCNICO COM COMISSÃO
      // =====================================================
      // Somente entrada de veículo.
      // A RPC usa o funcionario_id da entrada para preencher
      // automaticamente o responsavel_id da O.S.
      // A própria RPC também impede O.S. duplicada.
      if (
        tipoEntrada === 'veiculo' &&
        funcionario.usa_comissao &&
        entradaCriada?.id
      ) {
        const {
          data: ordemServicoId,
          error: erroCriacaoOS,
        } = await supabase.rpc(
          'criar_os_da_entrada',
          {
            p_entrada_id:
              entradaCriada.id,
          },
        )

        if (erroCriacaoOS) {
          console.error(
            'ERRO AO CRIAR O.S. AUTOMÁTICA:',
            erroCriacaoOS,
          )

          alert(
            'A entrada foi registrada, mas não foi possível criar a O.S. automaticamente.\n\nAvise o responsável do painel antes de fazer uma nova entrada.',
          )

          limparFormulario()
          setTelaPrincipal('entrada')

          return
        }

        alert(
          `Entrada do veículo registrada!\n\nResponsável: ${funcionario.nome}\nO.S. criada automaticamente.`,
        )

        limparFormulario()

        // Leva o técnico diretamente para Minhas O.S.
        setTelaPrincipal('ordens')

        console.log(
          'O.S. criada automaticamente:',
          ordemServicoId,
        )

        return
      }

      // Fluxo normal para peça e para funcionários sem comissão.
      alert(
        tipoEntrada === 'veiculo'
          ? `Entrada do veículo registrada!\n\nResponsável: ${funcionario.nome}`
          : `Entrada da peça registrada com sucesso!\n\nResponsável: ${funcionario.nome}`,
      )

      limparFormulario()

      setTelaPrincipal('entrada')
    } catch (error: any) {
      console.error(
        'ERRO AO REGISTRAR ENTRADA:',
        error,
      )

      alert(
        error?.message ||
          'Não foi possível registrar a entrada.',
      )
    } finally {
      setEnviando(false)
    }
  }

  if (!funcionario) {
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
              Identificação do funcionário
            </p>
          </div>

          <div
            style={{
              marginBottom: '20px',
              padding: '14px 16px',
              border: '1px solid #383838',
              borderLeft:
                '4px solid #d71920',
              borderRadius: '10px',
              background: '#151515',
              color: '#dddddd',
              fontSize: '14px',
              lineHeight: 1.5,
            }}
          >
            Digite seu código para acessar
            as entradas e as Ordens de
            Serviço atribuídas a você.
          </div>

          <div className="form-group">
            <label htmlFor="codigoFuncionario">
              ID DO FUNCIONÁRIO
            </label>

            <input
              id="codigoFuncionario"
              type="text"
              inputMode="numeric"
              maxLength={3}
              value={
                codigoFuncionario
              }
              onChange={event => {
                const valor =
                  event.target.value
                    .replace(/\D/g, '')
                    .slice(0, 3)

                setCodigoFuncionario(
                  valor,
                )

                setErroFuncionario('')
              }}
              onKeyDown={event => {
                if (
                  event.key ===
                  'Enter'
                ) {
                  event.preventDefault()

                  void entrarComoFuncionario()
                }
              }}
              placeholder="Ex.: 005"
              autoFocus
            />

            <small>
              Use o código de 3 números
              fornecido pela empresa.
            </small>
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
            onClick={() =>
              void entrarComoFuncionario()
            }
            disabled={
              buscandoFuncionario
            }
          >
            {buscandoFuncionario
              ? 'IDENTIFICANDO...'
              : 'ENTRAR'}
          </button>
        </section>
      </main>
    )
  }

  return (
    <>
      <style>
        {`html,
          body,
          #root {
            width: 100%;
            max-width: 100%;
            margin: 0;
            padding: 0;
            overflow-x: hidden !important;
          }

          *,
          *::before,
          *::after {
            box-sizing: border-box;
          }

          .mastertec-os-servicos {
            width: 100%;
            max-width: 100%;
            overflow: hidden;
          }

          .mastertec-os-cabecalho {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 80px 120px;
            gap: 8px;
            width: 100%;
            max-width: 100%;
          }

          .mastertec-os-linha {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 80px 120px;
            gap: 8px;
            width: 100%;
            max-width: 100%;
          }

          .mastertec-os-linha input {
            width: 100%;
            max-width: 100%;
            min-width: 0;
          }

          .mastertec-label-mobile {
            display: none;
          }

          .mastertec-info-compacta-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 7px 14px;
            width: 100%;
            max-width: 100%;
          }

          @media (max-width: 600px) {
            .mastertec-os-cabecalho {
              grid-template-columns: minmax(0, 1fr) 70px 100px;
              gap: 6px;
            }

            .mastertec-os-linha {
              grid-template-columns: minmax(0, 1fr) 70px 100px;
              gap: 6px;
            }

            .mastertec-info-compacta-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 6px 10px;
            }
          }

          @media (max-width: 430px) {
            .mastertec-os-cabecalho {
              grid-template-columns: minmax(0, 1fr) 66px 94px;
              gap: 5px;
            }

            .mastertec-os-linha {
              grid-template-columns: minmax(0, 1fr) 66px 94px;
              gap: 5px;
            }

            .mastertec-info-compacta-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 6px 8px;
            }
          }

          @media (max-width: 380px) {
            .mastertec-os-cabecalho {
              display: none;
            }

            .mastertec-os-linha {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(75px, 90px);
              gap: 8px;
              padding: 10px;
              border: 1px solid #333;
              border-radius: 10px;
              background: #101010;
              width: 100%;
              max-width: 100%;
            }

            .mastertec-os-linha input:first-child {
              grid-column: 1 / -1;
              width: 100%;
            }

            .mastertec-os-total-linha {
              display: block;
              grid-column: 1 / -1;
            }

            .mastertec-label-mobile {
              display: block;
              color: #777;
              font-size: 9px;
              font-weight: 800;
              margin-bottom: 4px;
            }

            .mastertec-mobile-field {
              min-width: 0;
            }

            .mastertec-info-compacta-grid {
              grid-template-columns: minmax(0, 1fr);
              gap: 6px;
            }
          }
        `}
      </style>

      <main className="app">
        <header className="header">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              width: '100%',
              maxWidth: '100%',
            }}
          >
            <div
              style={{
                minWidth: 0,
              }}
            >
              <div className="logo">
                DIESEL
                <span>CENTER</span>
              </div>

              <div className="subtitle">
                Controle de Oficina
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems:
                  'center',
                gap: '8px',
                padding:
                  '8px 10px',
                border:
                  '1px solid #3b3b3b',
                borderRadius:
                  '10px',
                background:
                  '#151515',
                maxWidth: '100%',
              }}
            >
              <div
                style={{
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 800,
                  overflow: 'hidden',
                  textOverflow:
                    'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                👤 {funcionario.nome}
              </div>

              <button
                type="button"
                onClick={
                  trocarFuncionario
                }
                disabled={enviando}
                style={{
                  padding: '6px 8px',
                  border:
                    '1px solid #555',
                  borderRadius: '7px',
                  background:
                    '#222',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                TROCAR
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                '1fr 1fr',
              gap: '10px',
              marginTop: '16px',
              width: '100%',
              maxWidth: '100%',
            }}
          >
            <button
              type="button"
              onClick={() =>
                setTelaPrincipal(
                  'entrada',
                )
              }
              style={{
                width: '100%',
                minWidth: 0,
                padding: '12px 8px',
                border:
                  telaPrincipal ===
                  'entrada'
                    ? '2px solid #d71920'
                    : '1px solid #444',
                borderRadius: '10px',
                background:
                  telaPrincipal ===
                  'entrada'
                    ? 'rgba(215,25,32,0.16)'
                    : '#181818',
                color: '#fff',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              🚚 NOVA ENTRADA
            </button>

            {funcionario.usa_comissao && (
            <button
              type="button"
              onClick={() =>
                setTelaPrincipal(
                  'ordens',
                )
              }
              style={{
                width: '100%',
                minWidth: 0,
                padding: '12px 8px',
                border:
                  telaPrincipal ===
                  'ordens'
                    ? '2px solid #2563eb'
                    : '1px solid #444',
                borderRadius: '10px',
                background:
                  telaPrincipal ===
                  'ordens'
                    ? 'rgba(37,99,235,0.16)'
                    : '#181818',
                color: '#fff',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              🛠️ MINHAS O.S.
            </button>
            )}

            {funcionario.usa_comissao && (
            <button
              type="button"
              onClick={() =>
                setTelaPrincipal(
                  'comissoes',
                )
              }
              style={{
                width: '100%',
                minWidth: 0,
                padding: '11px 8px',
                border:
                  telaPrincipal ===
                  'comissoes'
                    ? '2px solid #22c55e'
                    : '1px solid #444',
                borderRadius: '10px',
                background:
                  telaPrincipal ===
                  'comissoes'
                    ? 'rgba(34,197,94,0.14)'
                    : '#181818',
                color: '#fff',
                fontWeight: 900,
                cursor: 'pointer',
                gridColumn: '1 / -1',
              }}
            >
              💰 MINHAS COMISSÕES
            </button>
            )}
          </div>
        </header>

        {funcionario.usa_comissao && telaPrincipal ===
          'ordens' && (
          <section
            className="card"
            style={{
              maxWidth: '700px',
              width: '100%',
              overflow: 'hidden',
            }}
          >
            {!ordemAberta ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom:
                      '18px',
                  }}
                >
                  <div
                    style={{
                      minWidth: 0,
                    }}
                  >
                    <h1
                      style={{
                        margin: 0,
                      }}
                    >
                      Minhas O.S.
                    </h1>

                    <p
                      className="description"
                      style={{
                        marginBottom: '4px',
                      }}
                    >
                      O.S. atribuídas a{' '}
                      <strong
                        style={{
                          color: '#fff',
                        }}
                      >
                        {funcionario.nome}
                      </strong>
                    </p>

                    <div
                      style={{
                        color: '#72dc7d',
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}
                    >
                      MÊS ATUAL: {formatarMesAtual(mesAtual)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void carregarMinhasOrdens()
                    }
                    disabled={
                      carregandoOrdens
                    }
                    style={{
                      padding:
                        '10px 14px',
                      border:
                        '1px solid #444',
                      borderRadius:
                        '9px',
                      background:
                        '#202020',
                      color: '#fff',
                      fontWeight: 800,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {carregandoOrdens
                      ? 'Atualizando...'
                      : '↻ Atualizar'}
                  </button>
                </div>

                {erroOrdens && (
                  <div
                    style={{
                      padding: '12px',
                      marginBottom: '15px',
                      border:
                        '1px solid #7f1d1d',
                      borderRadius:
                        '9px',
                      background:
                        '#2a1010',
                      color:
                        '#ff7b7b',
                      fontSize: '13px',
                    }}
                  >
                    {erroOrdens}
                  </div>
                )}

                {carregandoOrdens ? (
                  <div
                    style={{
                      padding:
                        '50px 20px',
                      textAlign:
                        'center',
                      color: '#999',
                    }}
                  >
                    Carregando suas O.S....
                  </div>
                ) : ordensVisiveis.length ===
                  0 ? (
                  <div
                    style={{
                      padding:
                        '45px 20px',
                      textAlign:
                        'center',
                      border:
                        '1px dashed #444',
                      borderRadius:
                        '12px',
                      background:
                        '#111',
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          '42px',
                      }}
                    >
                      🛠️
                    </div>

                    <h3
                      style={{
                        color: '#fff',
                        marginBottom:
                          '6px',
                      }}
                    >
                      Nenhuma O.S. do mês atual
                    </h3>

                    <p
                      style={{
                        color: '#888',
                        margin: 0,
                      }}
                    >
                      O.S. em andamento continuam
                      aparecendo. O.S. encerradas de
                      meses anteriores ficam no histórico
                      de Minhas Comissões.
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display:
                        'grid',
                      gap: '10px',
                      width: '100%',
                    }}
                  >
                    {ordensVisiveis.map(
                      ordem => {
                        const encerrada =
                          statusOSFechada(
                            ordem.status,
                          )

                        return (
                          <button
                            key={
                              ordem.id
                            }
                            type="button"
                            onClick={() =>
                              void abrirMinhaOS(
                                ordem,
                              )
                            }
                            style={{
                              width: '100%',
                              minWidth: 0,
                              padding:
                                '16px',
                              textAlign:
                                'left',
                              border:
                                encerrada
                                  ? '1px solid #355534'
                                  : '1px solid #363636',
                              borderRadius:
                                '10px',
                              background:
                                '#121212',
                              color: '#fff',
                              cursor:
                                'pointer',
                              overflow:
                                'hidden',
                            }}
                          >
                            <div
                              style={{
                                display:
                                  'flex',
                                alignItems:
                                  'center',
                                justifyContent:
                                  'space-between',
                                gap: '10px',
                              }}
                            >
                              <div
                                style={{
                                  minWidth: 0,
                                  display: 'flex',
                                  alignItems: 'baseline',
                                  gap: '8px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <strong
                                  style={{
                                    fontSize:
                                      '17px',
                                  }}
                                >
                                  {ordem.numero
                                    ? `O.S. #${ordem.numero}`
                                    : 'O.S.'}
                                </strong>

                                {ordem.cliente_nome && (
                                  <span
                                    style={{
                                      color: '#f0f0f0',
                                      fontSize: '13px',
                                      fontWeight: 800,
                                      overflowWrap: 'anywhere',
                                    }}
                                  >
                                    {ordem.cliente_nome}
                                  </span>
                                )}
                              </div>

                              <span
                                style={{
                                  fontSize:
                                    '10px',
                                  fontWeight:
                                    900,
                                  padding:
                                    '5px 8px',
                                  borderRadius:
                                    '999px',
                                  background:
                                    encerrada
                                      ? '#16351a'
                                      : '#292929',
                                  color:
                                    encerrada
                                      ? '#70d77c'
                                      : '#aaa',
                                  whiteSpace:
                                    'nowrap',
                                  flexShrink:
                                    0,
                                }}
                              >
                                {encerrada
                                  ? 'ENCERRADA'
                                  : ordem.status === 'servico_finalizado'
                                    ? 'AGUARDANDO PAINEL'
                                    : 'EM ANDAMENTO'}
                              </span>
                            </div>

                            <div
                              style={{
                                marginTop:
                                  '6px',
                                color:
                                  '#aaa',
                                overflowWrap:
                                  'anywhere',
                              }}
                            >
                              {ordem.titulo}
                            </div>

                            {encerrada && (
                              <div
                                style={{
                                  marginTop: '9px',
                                  display: 'flex',
                                  alignItems: 'flex-end',
                                  justifyContent: 'space-between',
                                  gap: '10px',
                                }}
                              >
                                <div
                                  style={{
                                    color: '#70d77c',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    lineHeight: 1.35,
                                    minWidth: 0,
                                  }}
                                >
                                  Toque para visualizar o histórico.
                                </div>

                                <div
                                  style={{
                                    flexShrink: 0,
                                    textAlign: 'right',
                                  }}
                                >
                                  <div
                                    style={{
                                      color: '#777',
                                      fontSize: '8px',
                                      fontWeight: 900,
                                      letterSpacing: 0.4,
                                    }}
                                  >
                                    COMISSÃO
                                  </div>

                                  <div
                                    style={{
                                      marginTop: '2px',
                                      color: '#74e889',
                                      fontSize: '13px',
                                      fontWeight: 900,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    💰 {formatarMoeda(ordem.valor_comissao)}
                                  </div>
                                </div>
                              </div>
                            )}
                          </button>
                        )
                      },
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setOrdemAberta(null)
                    setEntradaDaOrdem(
                      null,
                    )
                    setTarefasOriginais(
                      [],
                    )
                  }}
                  style={{
                    marginBottom:
                      '16px',
                    border: 'none',
                    background:
                      'transparent',
                    color: '#60a5fa',
                    fontWeight: 800,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  ← Voltar para minhas O.S.
                </button>

                {carregandoDetalhesOS ? (
                  <div
                    style={{
                      padding:
                        '50px 20px',
                      textAlign:
                        'center',
                      color: '#999',
                    }}
                  >
                    Carregando O.S....
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        width: '100%',
                        maxWidth:
                          '100%',
                        padding: '14px',
                        border:
                          '1px solid #383838',
                        borderRadius:
                          '12px',
                        background:
                          '#111',
                        marginBottom:
                          '16px',
                        overflow:
                          'hidden',
                      }}
                    >
                      <div
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          justifyContent:
                            'space-between',
                          gap: '10px',
                          flexWrap:
                            'wrap',
                        }}
                      >
                        <div
                          style={{
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              color:
                                '#888',
                              fontSize:
                                '10px',
                              fontWeight:
                                800,
                            }}
                          >
                            ORDEM DE SERVIÇO
                          </div>

                          <div
                            style={{
                              marginTop: '4px',
                              display: 'flex',
                              alignItems: 'baseline',
                              gap: '9px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <h2
                              style={{
                                margin: 0,
                                color: '#fff',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {ordemAberta.numero
                                ? `O.S. #${ordemAberta.numero}`
                                : 'O.S.'}
                            </h2>

                            {ordemAberta.cliente_nome && (
                              <span
                                style={{
                                  color: '#f0f0f0',
                                  fontSize: '14px',
                                  fontWeight: 800,
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {ordemAberta.cliente_nome}
                              </span>
                            )}
                          </div>
                        </div>

                        {ordemAberta.status === 'servico_finalizado' && (
                          <div
                            style={{
                              padding:
                                '7px 10px',
                              border:
                                '1px solid #5d4a1d',
                              borderRadius:
                                '999px',
                              background:
                                '#2a2110',
                              color:
                                '#f5cc73',
                              fontSize:
                                '10px',
                              fontWeight:
                                900,
                              whiteSpace:
                                'nowrap',
                            }}
                          >
                            🕒 AGUARDANDO PAINEL
                          </div>
                        )}

                        {statusOSFechada(
                          ordemAberta.status,
                        ) && (
                          <div
                            style={{
                              padding:
                                '7px 10px',
                              border:
                                '1px solid #315f36',
                              borderRadius:
                                '999px',
                              background:
                                '#153519',
                              color:
                                '#72dc7d',
                              fontSize:
                                '10px',
                              fontWeight:
                                900,
                              whiteSpace:
                                'nowrap',
                            }}
                          >
                            ✅ O.S. ENCERRADA
                          </div>
                        )}
                      </div>

                      {/* CABEÇALHO COMPACTO */}

                      <div
                        className="mastertec-info-compacta-grid"
                        style={{
                          marginTop:
                            '12px',
                          padding:
                            '10px',
                          border:
                            '1px solid #303030',
                          borderRadius:
                            '9px',
                          background:
                            '#101010',
                        }}
                      >
                        <InfoCompacta
                          label="CLIENTE"
                          valor={
                            entradaDaOrdem?.cliente_nome ||
                            ''
                          }
                        />

                        <InfoCompacta
                          label="TELEFONE"
                          valor={
                            entradaDaOrdem?.telefone ||
                            ''
                          }
                        />

                        <InfoCompacta
                          label="VEÍCULO"
                          valor={
                            entradaDaOrdem?.modelo ||
                            ''
                          }
                        />

                        <InfoCompacta
                          label="PLACA"
                          valor={
                            entradaDaOrdem?.placa ||
                            ''
                          }
                        />

                        <InfoCompacta
                          label="ANO"
                          valor={
                            entradaDaOrdem?.ano
                              ? String(
                                  entradaDaOrdem.ano,
                                )
                              : ''
                          }
                        />

                        <InfoCompacta
                          label="FROTA"
                          valor={
                            entradaDaOrdem?.frota ||
                            ''
                          }
                        />

                        <div
                          style={{
                            gridColumn:
                              '1 / -1',
                          }}
                        >
                          <InfoCompacta
                            label="OBSERVAÇÃO"
                            valor={
                              entradaDaOrdem?.observacao ||
                              ''
                            }
                          />
                        </div>

                        <div
                          style={{
                            gridColumn:
                              '1 / -1',
                          }}
                        >
                          <InfoCompacta
                            label="ENTRADA"
                            valor={formatarDataHora(
                              entradaDaOrdem?.criado_em ||
                                ordemAberta.data_entrada,
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    {!osEditavel && (
                      <div
                        style={{
                          marginBottom:
                            '16px',
                          padding:
                            '14px',
                          border:
                            '1px solid #315f36',
                          borderRadius:
                            '10px',
                          background:
                            '#122616',
                          color:
                            '#bcebc1',
                          fontSize:
                            '13px',
                          lineHeight:
                            1.5,
                        }}
                      >
                        <strong>
                          O.S. encerrada.
                        </strong>
                        <br />
                        Esta tela está em modo
                        somente visualização.
                        Para fazer alterações,
                        a O.S. precisa ser reaberta
                        pelo painel.
                      </div>
                    )}

                    <div
                      className="mastertec-os-servicos"
                      style={{
                        padding:
                          '18px',
                        border:
                          '1px solid #383838',
                        borderRadius:
                          '12px',
                        background:
                          '#151515',
                      }}
                    >
                      <h3
                        style={{
                          margin:
                            '0 0 15px',
                          color:
                            '#fff',
                        }}
                      >
                        SERVIÇOS E PEÇAS
                      </h3>

                      <div
                        style={{
                          padding: '14px',
                          border: '1px solid #303030',
                          borderRadius: '10px',
                          background: '#111',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                            flexWrap: 'wrap',
                            marginBottom: '10px',
                          }}
                        >
                          <div>
                            <div
                              style={{
                                color: '#fff',
                                fontSize: '15px',
                                fontWeight: 900,
                              }}
                            >
                              🔧 SERVIÇOS
                            </div>
                            <div
                              style={{
                                color: '#777',
                                fontSize: '11px',
                                marginTop: '3px',
                              }}
                            >
                              Tudo que for mão de obra ou serviço.
                            </div>
                          </div>

                          <div
                            style={{
                              color: '#fff',
                              fontSize: '14px',
                              fontWeight: 900,
                            }}
                          >
                            {formatarMoedaNumero(totalServicos)}
                          </div>
                        </div>

                        <div className="mastertec-os-cabecalho">
                          <div style={{ color: '#777', fontSize: '10px', fontWeight: 800 }}>
                            DESCRIÇÃO DO SERVIÇO
                          </div>
                          <div style={{ color: '#777', fontSize: '10px', fontWeight: 800, textAlign: 'center' }}>
                            QTD.
                          </div>
                          <div style={{ color: '#777', fontSize: '10px', fontWeight: 800, textAlign: 'right' }}>
                            PREÇO
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gap: '8px',
                            marginTop: '6px',
                            width: '100%',
                          }}
                        >
                          {linhasServico.map((linha, index) => {
                            const quantidade = converterNumero(linha.quantidade) || 1
                            const valor = converterNumero(linha.valor)
                            const totalLinha = quantidade * valor

                            return (
                              <div
                                key={linha.id || `servico-${index}`}
                                className="mastertec-os-linha"
                              >
                                <div
                                  style={{
                                    position: 'relative',
                                    gridColumn: '1 / -1',
                                    width: '100%',
                                    minWidth: 0,
                                    zIndex:
                                      indiceServicoComSugestao === index
                                        ? 50
                                        : 1,
                                  }}
                                >
                                  <input
                                    type="text"
                                    value={linha.descricao}
                                    onFocus={() =>
                                      setIndiceServicoComSugestao(index)
                                    }
                                    onChange={event => {
                                      atualizarLinha(
                                        'servico',
                                        index,
                                        'descricao',
                                        event.target.value,
                                      )
                                      setIndiceServicoComSugestao(index)
                                    }}
                                    onKeyDown={event => {
                                      if (event.key === 'Escape') {
                                        setIndiceServicoComSugestao(null)
                                      }

                                      if (event.key === 'Enter') {
                                        const sugestoes = obterSugestoesServico(
                                          linha.descricao,
                                        )

                                        if (sugestoes.length > 0) {
                                          event.preventDefault()
                                          selecionarSugestaoServico(
                                            index,
                                            sugestoes[0],
                                          )
                                        }
                                      }
                                    }}
                                    onBlur={() => {
                                      window.setTimeout(() => {
                                        setIndiceServicoComSugestao(atual =>
                                          atual === index ? null : atual,
                                        )
                                      }, 180)
                                    }}
                                    placeholder={
                                      osEditavel
                                        ? 'Digite o serviço e escolha uma sugestão'
                                        : '-'
                                    }
                                    disabled={
                                      !osEditavel ||
                                      finalizandoOS
                                    }
                                    autoCorrect="off"
                                    spellCheck={false}
                                    autoCapitalize="sentences"
                                    style={{
                                      minWidth: 0,
                                      width: '100%',
                                      maxWidth: '100%',
                                      boxSizing: 'border-box',
                                    }}
                                  />

                                  {osEditavel &&
                                    !finalizandoOS &&
                                    indiceServicoComSugestao === index &&
                                    obterSugestoesServico(linha.descricao).length > 0 && (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          top: 'calc(100% + 4px)',
                                          left: 0,
                                          right: 0,
                                          width: '100%',
                                          maxHeight: '230px',
                                          overflowY: 'auto',
                                          background: '#101010',
                                          border: '1px solid #3a3a3a',
                                          borderRadius: '10px',
                                          boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
                                          padding: '5px',
                                        }}
                                      >
                                        {obterSugestoesServico(linha.descricao).map(
                                          sugestao => (
                                            <button
                                              key={sugestao}
                                              type="button"
                                              onMouseDown={event =>
                                                event.preventDefault()
                                              }
                                              onPointerDown={event => {
                                                event.preventDefault()
                                                selecionarSugestaoServico(
                                                  index,
                                                  sugestao,
                                                )
                                              }}
                                              style={{
                                                display: 'block',
                                                width: '100%',
                                                textAlign: 'left',
                                                border: '0',
                                                borderRadius: '8px',
                                                padding: '11px 12px',
                                                background: 'transparent',
                                                color: '#fff',
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                              }}
                                            >
                                              {sugestao}
                                            </button>
                                          ),
                                        )}
                                      </div>
                                    )}
                                </div>

                                <div className="mastertec-mobile-field" style={{ minWidth: 0 }}>
                                  <div className="mastertec-label-mobile">QUANTIDADE</div>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={linha.quantidade}
                                    onChange={event =>
                                      atualizarLinha('servico', index, 'quantidade', event.target.value)
                                    }
                                    placeholder="1"
                                    disabled={!osEditavel || finalizandoOS}
                                    style={{ width: '100%', maxWidth: '100%', minWidth: 0, textAlign: 'center' }}
                                  />
                                </div>

                                <div className="mastertec-mobile-field" style={{ minWidth: 0 }}>
                                  <div className="mastertec-label-mobile">PREÇO</div>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={linha.valor}
                                    onChange={event =>
                                      atualizarLinha('servico', index, 'valor', event.target.value)
                                    }
                                    placeholder="R$ 0,00"
                                    disabled={!osEditavel || finalizandoOS}
                                    style={{ width: '100%', maxWidth: '100%', minWidth: 0, textAlign: 'right' }}
                                  />
                                </div>

                                <div
                                  className="mastertec-os-total-linha"
                                  style={{ color: '#999', fontSize: '11px', fontWeight: 700, textAlign: 'right' }}
                                >
                                  Total: {formatarMoedaNumero(totalLinha)}
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {osEditavel && (
                          <button
                            type="button"
                            onClick={() => adicionarLinha('servico')}
                            disabled={finalizandoOS}
                            style={{
                              width: '100%',
                              marginTop: '12px',
                              padding: '12px',
                              border: '1px dashed #555',
                              borderRadius: '8px',
                              background: '#181818',
                              color: '#fff',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            + ADICIONAR SERVIÇO
                          </button>
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: '14px',
                          padding: '14px',
                          border: '1px solid #303030',
                          borderRadius: '10px',
                          background: '#111',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                            flexWrap: 'wrap',
                            marginBottom: '10px',
                          }}
                        >
                          <div>
                            <div
                              style={{
                                color: '#fff',
                                fontSize: '15px',
                                fontWeight: 900,
                              }}
                            >
                              📦 PEÇAS / PRODUTOS
                            </div>
                            <div
                              style={{
                                color: '#777',
                                fontSize: '11px',
                                marginTop: '3px',
                              }}
                            >
                              Peças, produtos, materiais e combustíveis. Não geram comissão.
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => adicionarLinha('peca')}
                            disabled={!osEditavel || finalizandoOS}
                            style={{
                              border: '1px solid #555',
                              borderRadius: '8px',
                              background: '#1b1b1b',
                              color: '#fff',
                              padding: '10px 12px',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            + ADICIONAR PEÇA
                          </button>
                        </div>

                        {linhasPecas.length === 0 ? (
                          <div
                            style={{
                              padding: '14px',
                              borderRadius: '8px',
                              background: '#171717',
                              color: '#777',
                              textAlign: 'center',
                              fontSize: '12px',
                            }}
                          >
                            Nenhuma peça ou produto lançado.
                          </div>
                        ) : (
                          <>
                            <div className="mastertec-os-cabecalho">
                              <div style={{ color: '#777', fontSize: '10px', fontWeight: 800 }}>
                                DESCRIÇÃO DA PEÇA / PRODUTO
                              </div>
                              <div style={{ color: '#777', fontSize: '10px', fontWeight: 800, textAlign: 'center' }}>
                                QTD.
                              </div>
                              <div style={{ color: '#777', fontSize: '10px', fontWeight: 800, textAlign: 'right' }}>
                                PREÇO
                              </div>
                            </div>

                            <div
                              style={{
                                display: 'grid',
                                gap: '8px',
                                marginTop: '6px',
                                width: '100%',
                              }}
                            >
                              {linhasPecas.map((linha, index) => {
                                const quantidade = converterNumero(linha.quantidade) || 1
                                const valor = converterNumero(linha.valor)
                                const totalLinha = quantidade * valor

                                return (
                                  <div
                                    key={linha.id || `peca-${index}`}
                                    className="mastertec-os-linha"
                                  >
                                    <input
                                      type="text"
                                      value={linha.descricao}
                                      onChange={event =>
                                        atualizarLinha('peca', index, 'descricao', event.target.value)
                                      }
                                      placeholder={osEditavel ? 'Descrição da peça / produto' : '-'}
                                      disabled={!osEditavel || finalizandoOS}
                                      autoCorrect="off"
                                      spellCheck={false}
                                      autoCapitalize="sentences"
                                      style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}
                                    />

                                    <div className="mastertec-mobile-field" style={{ minWidth: 0 }}>
                                      <div className="mastertec-label-mobile">QUANTIDADE</div>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={linha.quantidade}
                                        onChange={event =>
                                          atualizarLinha('peca', index, 'quantidade', event.target.value)
                                        }
                                        placeholder="1"
                                        disabled={!osEditavel || finalizandoOS}
                                        style={{ width: '100%', maxWidth: '100%', minWidth: 0, textAlign: 'center' }}
                                      />
                                    </div>

                                    <div className="mastertec-mobile-field" style={{ minWidth: 0 }}>
                                      <div className="mastertec-label-mobile">PREÇO</div>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={linha.valor}
                                        onChange={event =>
                                          atualizarLinha('peca', index, 'valor', event.target.value)
                                        }
                                        placeholder="R$ 0,00"
                                        disabled={!osEditavel || finalizandoOS}
                                        style={{ width: '100%', maxWidth: '100%', minWidth: 0, textAlign: 'right' }}
                                      />
                                    </div>

                                    <div
                                      className="mastertec-os-total-linha"
                                      style={{ color: '#999', fontSize: '11px', fontWeight: 700, textAlign: 'right' }}
                                    >
                                      Total: {formatarMoedaNumero(totalLinha)}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}

                        <div
                          style={{
                            marginTop: '12px',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: 900,
                          }}
                        >
                          TOTAL DE PEÇAS: {formatarMoedaNumero(totalPecas)}
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: '18px',
                          paddingTop: '15px',
                          borderTop: '1px solid #333',
                          display: 'grid',
                          gap: '8px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            color: '#aaa',
                            fontSize: '13px',
                          }}
                        >
                          <span>TOTAL DE SERVIÇOS</span>
                          <strong>{formatarMoedaNumero(totalServicos)}</strong>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            color: '#aaa',
                            fontSize: '13px',
                          }}
                        >
                          <span>TOTAL DE PEÇAS</span>
                          <strong>{formatarMoedaNumero(totalPecas)}</strong>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            color: '#fff',
                            fontSize: '21px',
                            fontWeight: 900,
                          }}
                        >
                          <span>TOTAL DA O.S.</span>
                          <strong>
                            {osEditavel
                              ? formatarMoedaNumero(totalOrdemAberta)
                              : formatarMoeda(ordemAberta.valor_total ?? totalOrdemAberta)}
                          </strong>
                        </div>
                      </div>

                      {osEditavel && (
                        <button
                          type="button"
                          onClick={() =>
                            void finalizarEnviarOS()
                          }
                          disabled={
                            finalizandoOS
                          }
                          style={{
                            width:
                              '100%',
                            maxWidth:
                              '100%',
                            marginTop:
                              '18px',
                            padding:
                              '16px',
                            border:
                              'none',
                            borderRadius:
                              '10px',
                            background:
                              '#16a34a',
                            color:
                              '#fff',
                            fontWeight:
                              900,
                            fontSize:
                              '16px',
                            cursor:
                              'pointer',
                          }}
                        >
                          {finalizandoOS
                            ? 'ENVIANDO...'
                            : ordemAberta.status === 'servico_finalizado'
                              ? 'ATUALIZAR E ENVIAR'
                              : 'FINALIZAR E ENVIAR'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}

        {funcionario.usa_comissao && telaPrincipal ===
          'comissoes' && (
          <section
            className="card"
            style={{
              maxWidth: '700px',
              width: '100%',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '18px',
              }}
            >
              <div>
                <h1 style={{ margin: 0 }}>Minhas Comissões</h1>
                <p
                  className="description"
                  style={{ marginBottom: 0 }}
                >
                  Comissão das O.S. encerradas de {funcionario.nome}.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void carregarMinhasOrdens()}
                disabled={carregandoOrdens}
                style={{
                  padding: '10px 14px',
                  border: '1px solid #444',
                  borderRadius: '9px',
                  background: '#202020',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {carregandoOrdens ? 'Atualizando...' : '↻ Atualizar'}
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gap: '7px',
                marginBottom: '16px',
              }}
            >
              <label
                style={{
                  color: '#888',
                  fontSize: '10px',
                  fontWeight: 900,
                }}
              >
                MÊS
              </label>

              <input
                type="month"
                value={mesComissao}
                onChange={event => setMesComissao(event.target.value)}
                style={{
                  width: '100%',
                  minHeight: '42px',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  border: '1px solid #3b3b3b',
                  borderRadius: '9px',
                  background: '#181818',
                  color: '#fff',
                  colorScheme: 'dark',
                }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '10px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  padding: '14px',
                  border: '1px solid #2f5f37',
                  borderRadius: '10px',
                  background: '#111a13',
                }}
              >
                <div
                  style={{
                    color: '#777',
                    fontSize: '9px',
                    fontWeight: 900,
                  }}
                >
                  COMISSÃO NO MÊS
                </div>

                <div
                  style={{
                    marginTop: '6px',
                    color: '#74e889',
                    fontSize: '24px',
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatarMoeda(
                    resumoMinhasComissoes.totalComissao,
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: '14px',
                  border: '1px solid #2e2e2e',
                  borderRadius: '10px',
                  background: '#111',
                }}
              >
                <div
                  style={{
                    color: '#777',
                    fontSize: '9px',
                    fontWeight: 900,
                  }}
                >
                  O.S. ENCERRADAS
                </div>

                <div
                  style={{
                    marginTop: '6px',
                    color: '#fff',
                    fontSize: '24px',
                    fontWeight: 900,
                  }}
                >
                  {resumoMinhasComissoes.ordens}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                border: '1px solid #2e2e2e',
                borderRadius: '12px',
                background: '#111',
              }}
            >
              <div
                style={{
                  marginBottom: '12px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 900,
                  letterSpacing: 0.5,
                }}
              >
                COMISSÕES POR CLIENTE
              </div>

              {resumoMinhasComissoes.clientes.length === 0 ? (
                <div
                  style={{
                    padding: '25px 10px',
                    textAlign: 'center',
                    color: '#777',
                    fontSize: '12px',
                  }}
                >
                  Nenhuma O.S. encerrada com comissão neste mês.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gap: '8px',
                  }}
                >
                  {resumoMinhasComissoes.clientes.map(cliente => (
                    <div
                      key={cliente.nome}
                      style={{
                        padding: '12px',
                        border: '1px solid #292929',
                        borderRadius: '9px',
                        background: '#151515',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              color: '#fff',
                              fontSize: '13px',
                              fontWeight: 800,
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {cliente.nome}
                          </div>

                          <div
                            style={{
                              marginTop: '4px',
                              color: '#777',
                              fontSize: '10px',
                            }}
                          >
                            {cliente.ordens} O.S. • Serviços {formatarMoeda(cliente.valorServicos)}
                          </div>
                        </div>

                        <div
                          style={{
                            flexShrink: 0,
                            textAlign: 'right',
                          }}
                        >
                          <div
                            style={{
                              color: '#777',
                              fontSize: '8px',
                              fontWeight: 900,
                            }}
                          >
                            COMISSÃO
                          </div>

                          <div
                            style={{
                              marginTop: '2px',
                              color: '#74e889',
                              fontSize: '15px',
                              fontWeight: 900,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatarMoeda(cliente.comissao)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {resumoMinhasComissoes.clientes.length > 0 && (
                <div
                  style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid #333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <strong style={{ color: '#fff', fontSize: '12px' }}>TOTAL</strong>
                  <strong
                    style={{
                      color: '#74e889',
                      fontSize: '16px',
                    }}
                  >
                    {formatarMoeda(
                      resumoMinhasComissoes.totalComissao,
                    )}
                  </strong>
                </div>
              )}
            </div>
          </section>
        )}

        {telaPrincipal ===
          'entrada' && (
          <section className="card">
            <h1>
              Registro de Entrada
            </h1>

            <p className="description">
              Funcionário responsável:{' '}
              <strong
                style={{
                  color: '#fff',
                }}
              >
                {funcionario.nome}
              </strong>
            </p>

            <div className="entry-type">
              <label className="entry-type-title">
                O que está entrando?
              </label>

              <div className="entry-type-options">
                <button
                  type="button"
                  className={
                    tipoEntrada ===
                    'veiculo'
                      ? 'entry-type-button active'
                      : 'entry-type-button'
                  }
                  onClick={() =>
                    trocarTipoEntrada(
                      'veiculo',
                    )
                  }
                  disabled={enviando}
                >
                  <span className="entry-icon">
                    🚗
                  </span>

                  <span>Veículo</span>

                  <small>
                    Caminhão, pickup etc.
                  </small>
                </button>

                <button
                  type="button"
                  className={
                    tipoEntrada ===
                    'peca'
                      ? 'entry-type-button active'
                      : 'entry-type-button'
                  }
                  onClick={() =>
                    trocarTipoEntrada(
                      'peca',
                    )
                  }
                  disabled={enviando}
                >
                  <span className="entry-icon">
                    🔧
                  </span>

                  <span>Peça avulsa</span>

                  <small>
                    Bomba, bico, turbina etc.
                  </small>
                </button>
              </div>
            </div>

            <input
              ref={cameraInput1Ref}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={selecionarFoto1}
              hidden
            />

            <input
              ref={cameraInput2Ref}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={selecionarFoto2}
              hidden
            />

            {tipoEntrada ===
              'veiculo' && (
              <div
                style={{
                  display:
                    'grid',
                  gap: '14px',
                  width: '100%',
                  maxWidth: '100%',
                }}
              >
                <button
                  type="button"
                  className="camera-area camera-clickable"
                  onClick={abrirCamera1}
                  disabled={enviando}
                >
                  {foto1 ? (
                    <img
                      src={foto1}
                      alt="Frente do veículo"
                      className="plate-photo"
                    />
                  ) : (
                    <div className="camera-placeholder">
                      <span className="camera-icon">
                        📷
                      </span>

                      <strong>
                        FOTO 1 — FRENTE / PLACA
                      </strong>

                      <small>
                        Fotografe a frente do
                        veículo mostrando bem a
                        placa.
                      </small>
                    </div>
                  )}

                  {foto1 && (
                    <div className="camera-overlay">
                      📷 Toque para tirar outra
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  className="camera-area camera-clickable"
                  onClick={abrirCamera2}
                  disabled={enviando}
                >
                  {foto2 ? (
                    <img
                      src={foto2}
                      alt="Lateral do veículo"
                      className="plate-photo"
                    />
                  ) : (
                    <div className="camera-placeholder">
                      <span className="camera-icon">
                        📷
                      </span>

                      <strong>
                        FOTO 2 — LATERAL / MODELO
                      </strong>

                      <small>
                        Fotografe a lateral do
                        veículo mostrando o modelo.
                      </small>
                    </div>
                  )}

                  {foto2 && (
                    <div className="camera-overlay">
                      📷 Toque para tirar outra
                    </div>
                  )}
                </button>
              </div>
            )}

            {tipoEntrada ===
              'peca' && (
              <button
                type="button"
                className="camera-area camera-clickable"
                onClick={abrirCamera1}
                disabled={enviando}
              >
                {foto1 ? (
                  <img
                    src={foto1}
                    alt="Foto da peça"
                    className="plate-photo"
                  />
                ) : (
                  <div className="camera-placeholder">
                    <span className="camera-icon">
                      📷
                    </span>

                    <strong>
                      Toque aqui para tirar a
                      foto
                    </strong>

                    <small>
                      Fotografe a peça
                    </small>
                  </div>
                )}

                {foto1 && (
                  <div className="camera-overlay">
                    📷 Toque para tirar outra foto
                  </div>
                )}
              </button>
            )}

            {tipoEntrada ===
              'veiculo' && (
              <>
                <div className="form-group">
                  <label>PLACA *</label>

                  <input
                    type="text"
                    value={placa}
                    onChange={event =>
                      alterarPlaca(
                        event.target.value,
                      )
                    }
                    maxLength={7}
                    disabled={enviando}
                    placeholder="ABC1D23"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />

                  <small>
                    {consultandoPlaca
                      ? '🔎 Procurando veículo no cadastro...'
                      : 'Digite a placa completa para verificar o cadastro.'}
                  </small>
                </div>

                <div className="form-group">
                  <label>MODELO *</label>

                  <input
                    type="text"
                    value={modelo}
                    onChange={event =>
                      setModelo(
                        event.target.value,
                      )
                    }
                    disabled={enviando}
                    placeholder="Modelo do veículo"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>

                <div className="form-group">
                  <label>FROTA</label>

                  <input
                    type="text"
                    value={frota}
                    onChange={event =>
                      setFrota(
                        event.target.value,
                      )
                    }
                    disabled={enviando}
                    placeholder="Número da frota, se houver"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              </>
            )}

            {tipoEntrada ===
              'peca' && (
              <>
                <div className="divider">
                  <span>
                    Dados da peça
                  </span>
                </div>

                <div className="form-group">
                  <label>
                    QUAIS PEÇAS ESTÃO ENTRANDO? *
                  </label>

                  <div
                    style={{
                      display:
                        'grid',
                      gridTemplateColumns:
                        '1fr 1fr',
                      gap: '10px',
                      width: '100%',
                    }}
                  >
                    {(
                      [
                        [
                          'bomba',
                          '🔧',
                          'Bomba',
                        ],
                        [
                          'bico',
                          '🔩',
                          'Bico',
                        ],
                        [
                          'turbina',
                          '🌀',
                          'Turbina',
                        ],
                        [
                          'outro',
                          '⚙️',
                          'Outro',
                        ],
                      ] as [
                        TipoPeca,
                        string,
                        string,
                      ][]
                    ).map(
                      (
                        [
                          tipo,
                          icone,
                          nome,
                        ],
                      ) => {
                        const selecionado =
                          tiposPeca.includes(
                            tipo,
                          )

                        return (
                          <button
                            key={
                              tipo
                            }
                            type="button"
                            onClick={() =>
                              alternarTipoPeca(
                                tipo,
                              )
                            }
                            disabled={enviando}
                            style={{
                              padding:
                                '14px 10px',
                              border:
                                selecionado
                                  ? '2px solid #d71920'
                                  : '1px solid #444',
                              borderRadius:
                                '10px',
                              background:
                                selecionado
                                  ? 'rgba(215,25,32,0.16)'
                                  : '#181818',
                              color:
                                '#fff',
                              fontWeight:
                                800,
                            }}
                          >
                            {icone}{' '}
                            {nome}
                          </button>
                        )
                      },
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    MODELO DO VEÍCULO *
                  </label>

                  <input
                    type="text"
                    value={modelo}
                    onChange={event =>
                      setModelo(
                        event.target.value,
                      )
                    }
                    disabled={enviando}
                    placeholder="Ex.: Volvo FH 540"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>

                <div className="form-group">
                  <label>
                    PLACA DO VEÍCULO
                  </label>

                  <input
                    type="text"
                    value={placa}
                    onChange={event =>
                      alterarPlaca(
                        event.target.value,
                      )
                    }
                    maxLength={7}
                    disabled={enviando}
                    placeholder="ABC1D23 — opcional"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>

                <div className="form-group">
                  <label>FROTA</label>

                  <input
                    type="text"
                    value={frota}
                    onChange={event =>
                      setFrota(
                        event.target.value,
                      )
                    }
                    disabled={enviando}
                    placeholder="Número da frota"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>

                <div className="form-group">
                  <label>
                    DESCRIÇÃO / IDENTIFICAÇÃO DA PEÇA *
                  </label>

                  <textarea
                    value={descricaoPeca}
                    onChange={event =>
                      setDescricaoPeca(
                        event.target.value,
                      )
                    }
                    rows={3}
                    disabled={enviando}
                    placeholder="Ex.: Bomba Bosch CP4 + 6 bicos"
                    autoCorrect="off"
                    spellCheck={false}
                    autoCapitalize="sentences"
                  />
                </div>
              </>
            )}

            <div className="divider">
              <span>
                Dados do cliente
              </span>
            </div>

            <div className="form-group">
              <label>
                NOME COMPLETO DO CLIENTE *
              </label>

              <input
                type="text"
                value={cliente}
                onChange={event =>
                  setCliente(
                    event.target.value,
                  )
                }
                disabled={enviando}
                placeholder="Nome completo"
                autoCorrect="off"
                spellCheck={false}
                autoCapitalize="words"
              />
            </div>

            <div className="form-group">
              <label>TELEFONE</label>

              <input
                type="tel"
                value={telefone}
                onChange={event =>
                  setTelefone(
                    event.target.value,
                  )
                }
                disabled={enviando}
                placeholder="(00) 00000-0000"
              />
            </div>

            <div className="form-group">
              <label>OBSERVAÇÃO</label>

              <textarea
                value={observacao}
                onChange={event =>
                  setObservacao(
                    event.target.value,
                  )
                }
                rows={4}
                disabled={enviando}
                placeholder="Detalhes importantes da entrada..."
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <button
              type="button"
              className="submit-button"
              onClick={() =>
                void enviar()
              }
              disabled={enviando}
            >
              {enviando
                ? 'ENVIANDO...'
                : 'ENVIAR ENTRADA'}
            </button>
          </section>
        )}

        {mostrarVeiculoEncontrado &&
          veiculoEncontrado && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems:
                  'center',
                justifyContent:
                  'center',
                padding: '20px',
                background:
                  'rgba(0,0,0,0.78)',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth:
                    '440px',
                  padding: '24px',
                  border:
                    '1px solid #444',
                  borderTop:
                    '4px solid #d71920',
                  borderRadius:
                    '16px',
                  background:
                    '#1b1b1b',
                  overflow:
                    'hidden',
                }}
              >
                <div
                  style={{
                    textAlign:
                      'center',
                    marginBottom:
                      '20px',
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        '42px',
                    }}
                  >
                    🚗
                  </div>

                  <h2
                    style={{
                      color:
                        '#fff',
                      margin:
                        0,
                    }}
                  >
                    VEÍCULO ENCONTRADO
                  </h2>
                </div>

                <CampoOS
                  label="PLACA"
                  valor={
                    veiculoEncontrado.placa ||
                    ''
                  }
                />

                <CampoOS
                  label="MODELO"
                  valor={
                    veiculoEncontrado.modelo ||
                    ''
                  }
                />

                <CampoOS
                  label="FROTA"
                  valor={
                    veiculoEncontrado.frota ||
                    ''
                  }
                />

                <CampoOS
                  label="CLIENTE"
                  valor={
                    veiculoEncontrado.cliente_nome ||
                    ''
                  }
                />

                <CampoOS
                  label="TELEFONE"
                  valor={
                    veiculoEncontrado.telefone ||
                    ''
                  }
                />

                <button
                  type="button"
                  onClick={
                    usarCadastroEncontrado
                  }
                  style={{
                    width: '100%',
                    marginTop:
                      '18px',
                    padding:
                      '14px',
                    border: 'none',
                    borderRadius:
                      '10px',
                    background:
                      '#d71920',
                    color: '#fff',
                    fontWeight:
                      900,
                  }}
                >
                  ✓ USAR ESTE CADASTRO
                </button>

                <button
                  type="button"
                  onClick={
                    cadastrarOutroVeiculo
                  }
                  style={{
                    width: '100%',
                    marginTop:
                      '10px',
                    padding:
                      '14px',
                    border:
                      '1px solid #555',
                    borderRadius:
                      '10px',
                    background:
                      '#292929',
                    color: '#fff',
                    fontWeight:
                      800,
                  }}
                >
                  NÃO, CADASTRAR OUTRO
                </button>
              </div>
            </div>
          )}
      </main>
    </>
  )
}

function InfoCompacta(
  props: {
    label: string
    valor: string
  },
) {
  return (
    <div
      style={{
        minWidth: 0,
        width: '100%',
        overflow: 'hidden',
        lineHeight: 1.35,
      }}
    >
      <span
        style={{
          color: '#777',
          fontSize: '9px',
          fontWeight: 900,
          marginRight: '5px',
        }}
      >
        {props.label}:
      </span>

      <span
        style={{
          color: '#fff',
          fontSize: '12px',
          fontWeight: 700,
          overflowWrap:
            'anywhere',
          wordBreak:
            'break-word',
        }}
      >
        {props.valor || '—'}
      </span>
    </div>
  )
}

function CampoOS(
  props: {
    label: string
    valor: string
  },
) {
  return (
    <div
      style={{
        padding:
          '11px 12px',
        marginBottom:
          '8px',
        background:
          '#101010',
        border:
          '1px solid #303030',
        borderRadius:
          '8px',
        width:
          '100%',
        maxWidth:
          '100%',
        overflow:
          'hidden',
      }}
    >
      <div
        style={{
          color:
            '#777',
          fontSize:
            '10px',
          fontWeight:
            800,
          marginBottom:
            '4px',
        }}
      >
        {props.label}
      </div>

      <div
        style={{
          color:
            '#fff',
          fontSize:
            '13px',
          fontWeight:
            700,
          overflowWrap:
            'anywhere',
          wordBreak:
            'break-word',
          minHeight:
            '16px',
        }}
      >
        {props.valor}
      </div>
    </div>
  )
}

export default App

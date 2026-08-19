import {
  useEffect,
  useRef,
  useState,
} from 'react';

import './App.css';

import { supabase } from './lib/supabase';

type TipoEntrada =
  | 'veiculo'
  | 'peca';

type VeiculoEncontrado = {
  id: string;
  placa: string | null;
  modelo: string | null;
  frota: string | null;
  cliente_nome: string | null;
  telefone: string | null;
};

type DadosSalvos = {
  tipoEntrada: TipoEntrada;

  placa: string;
  modelo: string;
  frota: string;

  descricaoPeca: string;

  cliente: string;
  telefone: string;

  observacao: string;

  foto1Base64: string | null;
  foto1Nome: string | null;
  foto1Tipo: string | null;

  foto2Base64: string | null;
  foto2Nome: string | null;
  foto2Tipo: string | null;
};

const STORAGE_KEY =
  'mastertec_entrada_em_andamento';

function App() {

  // ==========================================
  // INPUTS DAS CÂMERAS
  // ==========================================

  const cameraInput1Ref =
    useRef<HTMLInputElement>(null);

  const cameraInput2Ref =
    useRef<HTMLInputElement>(null);

  // ==========================================
  // TIPO DE ENTRADA
  // ==========================================

  const [tipoEntrada, setTipoEntrada] =
    useState<TipoEntrada>('veiculo');

  // ==========================================
  // FOTO 1
  // ==========================================

  const [foto1, setFoto1] =
    useState<string | null>(null);

  const [arquivoFoto1, setArquivoFoto1] =
    useState<File | null>(null);

  // ==========================================
  // FOTO 2
  // ==========================================

  const [foto2, setFoto2] =
    useState<string | null>(null);

  const [arquivoFoto2, setArquivoFoto2] =
    useState<File | null>(null);

  // ==========================================
  // VEÍCULO
  // ==========================================

  const [placa, setPlaca] =
    useState('');

  const [modelo, setModelo] =
    useState('');

  const [frota, setFrota] =
    useState('');

  // ==========================================
  // PEÇA
  // ==========================================

  const [descricaoPeca, setDescricaoPeca] =
    useState('');

  // ==========================================
  // CLIENTE
  // ==========================================

  const [cliente, setCliente] =
    useState('');

  const [telefone, setTelefone] =
    useState('');

  // ==========================================
  // OBSERVAÇÃO
  // ==========================================

  const [observacao, setObservacao] =
    useState('');

  // ==========================================
  // ENVIO
  // ==========================================

  const [enviando, setEnviando] =
    useState(false);

  // ==========================================
  // BUSCA INTELIGENTE DA PLACA
  // ==========================================

  const [consultandoPlaca, setConsultandoPlaca] =
    useState(false);

  const [veiculoEncontrado, setVeiculoEncontrado] =
    useState<VeiculoEncontrado | null>(null);

  const [mostrarVeiculoEncontrado, setMostrarVeiculoEncontrado] =
    useState(false);

  // ==========================================
  // CONTROLE DA ÚLTIMA PLACA CONSULTADA
  // ==========================================

  const ultimaPlacaConsultada =
    useRef('');

  // ==========================================
  // CONTROLE DA RESTAURAÇÃO
  // ==========================================

  const restauracaoConcluida =
    useRef(false);

  // ==========================================
  // CONVERTER FILE PARA BASE64
  // ==========================================

  function arquivoParaBase64(
    arquivo: File
  ): Promise<string> {

    return new Promise(
      (resolve, reject) => {

        const reader =
          new FileReader();

        reader.onload = () => {

          if (
            typeof reader.result ===
            'string'
          ) {

            resolve(
              reader.result
            );

          } else {

            reject(
              new Error(
                'Não foi possível ler a foto.'
              )
            );
          }
        };

        reader.onerror = () => {

          reject(
            new Error(
              'Erro ao ler a foto.'
            )
          );
        };

        reader.readAsDataURL(
          arquivo
        );
      }
    );
  }

  // ==========================================
  // CONVERTER BASE64 PARA FILE
  // ==========================================

  function base64ParaArquivo(
    base64: string,
    nome: string,
    tipo: string
  ): File {

    const partes =
      base64.split(',');

    const dados =
      atob(partes[1]);

    const bytes =
      new Uint8Array(
        dados.length
      );

    for (
      let i = 0;
      i < dados.length;
      i++
    ) {

      bytes[i] =
        dados.charCodeAt(i);
    }

    return new File(
      [bytes],
      nome,
      {
        type:
          tipo ||
          'image/jpeg',
      }
    );
  }

  // ==========================================
  // SALVAR FORMULÁRIO LOCALMENTE
  // ==========================================

  async function salvarFormulario(
    fotosAtuais?: {
      foto1?: {
        base64: string;
        nome: string;
        tipo: string;
      } | null;

      foto2?: {
        base64: string;
        nome: string;
        tipo: string;
      } | null;
    } | null
  ) {

    if (
      !restauracaoConcluida.current
    ) {
      return;
    }

    try {

      const dados: DadosSalvos = {

        tipoEntrada,

        placa,

        modelo,

        frota,

        descricaoPeca,

        cliente,

        telefone,

        observacao,

        // FOTO 1
        foto1Base64:
          fotosAtuais?.foto1?.base64 ??
          (
            foto1 &&
            foto1.startsWith('data:')
              ? foto1
              : null
          ),

        foto1Nome:
          fotosAtuais?.foto1?.nome ??
          arquivoFoto1?.name ??
          null,

        foto1Tipo:
          fotosAtuais?.foto1?.tipo ??
          arquivoFoto1?.type ??
          null,

        // FOTO 2
        foto2Base64:
          fotosAtuais?.foto2?.base64 ??
          (
            foto2 &&
            foto2.startsWith('data:')
              ? foto2
              : null
          ),

        foto2Nome:
          fotosAtuais?.foto2?.nome ??
          arquivoFoto2?.name ??
          null,

        foto2Tipo:
          fotosAtuais?.foto2?.tipo ??
          arquivoFoto2?.type ??
          null,
      };

      const existeAlgumDado =
        dados.placa.trim() ||
        dados.modelo.trim() ||
        dados.frota.trim() ||
        dados.descricaoPeca.trim() ||
        dados.cliente.trim() ||
        dados.telefone.trim() ||
        dados.observacao.trim() ||
        dados.foto1Base64 ||
        dados.foto2Base64;

      if (!existeAlgumDado) {

        localStorage.removeItem(
          STORAGE_KEY
        );

        return;
      }

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(dados)
      );

    } catch (error) {

      console.error(
        'Erro ao salvar formulário localmente:',
        error
      );
    }
  }

  // ==========================================
  // RESTAURAR FORMULÁRIO
  // ==========================================

  useEffect(() => {

    async function restaurarFormulario() {

      try {

        const salvo =
          localStorage.getItem(
            STORAGE_KEY
          );

        if (!salvo) {

          restauracaoConcluida.current =
            true;

          return;
        }

        const dados =
          JSON.parse(
            salvo
          ) as DadosSalvos;

        // ======================================
        // TIPO
        // ======================================

        if (
          dados.tipoEntrada
        ) {

          setTipoEntrada(
            dados.tipoEntrada
          );
        }

        // ======================================
        // VEÍCULO
        // ======================================

        setPlaca(
          dados.placa || ''
        );

        setModelo(
          dados.modelo || ''
        );

        setFrota(
          dados.frota || ''
        );

        // ======================================
        // PEÇA
        // ======================================

        setDescricaoPeca(
          dados.descricaoPeca || ''
        );

        // ======================================
        // CLIENTE
        // ======================================

        setCliente(
          dados.cliente || ''
        );

        setTelefone(
          dados.telefone || ''
        );

        // ======================================
        // OBSERVAÇÃO
        // ======================================

        setObservacao(
          dados.observacao || ''
        );

        // ======================================
        // FOTO 1
        // ======================================

        if (
          dados.foto1Base64
        ) {

          setFoto1(
            dados.foto1Base64
          );

          if (
            dados.foto1Nome &&
            dados.foto1Tipo
          ) {

            const arquivo =
              base64ParaArquivo(
                dados.foto1Base64,
                dados.foto1Nome,
                dados.foto1Tipo
              );

            setArquivoFoto1(
              arquivo
            );
          }
        }

        // ======================================
        // FOTO 2
        // ======================================

        if (
          dados.foto2Base64
        ) {

          setFoto2(
            dados.foto2Base64
          );

          if (
            dados.foto2Nome &&
            dados.foto2Tipo
          ) {

            const arquivo =
              base64ParaArquivo(
                dados.foto2Base64,
                dados.foto2Nome,
                dados.foto2Tipo
              );

            setArquivoFoto2(
              arquivo
            );
          }
        }

        // ======================================
        // CONTROLE DE PLACA
        // ======================================

        if (
          dados.placa &&
          dados.placa.length === 7
        ) {

          ultimaPlacaConsultada.current =
            dados.placa;
        }

        console.log(
          'Formulário anterior restaurado.'
        );

      } catch (error) {

        console.error(
          'Erro ao restaurar formulário:',
          error
        );

        localStorage.removeItem(
          STORAGE_KEY
        );

      } finally {

        restauracaoConcluida.current =
          true;
      }
    }

    restaurarFormulario();

  }, []);

  // ==========================================
  // SALVAR AUTOMATICAMENTE
  // ==========================================

  useEffect(() => {

    if (
      !restauracaoConcluida.current
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {

          salvarFormulario();

        },
        300
      );

    return () => {

      window.clearTimeout(
        timer
      );
    };

  }, [
    tipoEntrada,
    placa,
    modelo,
    frota,
    descricaoPeca,
    cliente,
    telefone,
    observacao,
    foto1,
    arquivoFoto1,
    foto2,
    arquivoFoto2,
  ]);

  // ==========================================
  // ABRIR CÂMERA 1
  // ==========================================

  function abrirCamera1() {

    if (enviando) {
      return;
    }

    cameraInput1Ref.current?.click();
  }

  // ==========================================
  // ABRIR CÂMERA 2
  // ==========================================

  function abrirCamera2() {

    if (enviando) {
      return;
    }

    cameraInput2Ref.current?.click();
  }

  // ==========================================
  // SELECIONAR FOTO 1
  // ==========================================

  async function selecionarFoto1(
    event: React.ChangeEvent<HTMLInputElement>
  ) {

    const arquivo =
      event.target.files?.[0];

    if (!arquivo) {
      return;
    }

    try {

      const base64 =
        await arquivoParaBase64(
          arquivo
        );

      setArquivoFoto1(
        arquivo
      );

      setFoto1(
        base64
      );

      await salvarFormulario({
        foto1: {
          base64,
          nome:
            arquivo.name,
          tipo:
            arquivo.type ||
            'image/jpeg',
        },
      });

    } catch (error) {

      console.error(
        'Erro ao salvar foto 1:',
        error
      );

      alert(
        'Não foi possível salvar a primeira foto. Tente novamente.'
      );
    }

    if (
      cameraInput1Ref.current
    ) {

      cameraInput1Ref.current.value =
        '';
    }
  }

  // ==========================================
  // SELECIONAR FOTO 2
  // ==========================================

  async function selecionarFoto2(
    event: React.ChangeEvent<HTMLInputElement>
  ) {

    const arquivo =
      event.target.files?.[0];

    if (!arquivo) {
      return;
    }

    try {

      const base64 =
        await arquivoParaBase64(
          arquivo
        );

      setArquivoFoto2(
        arquivo
      );

      setFoto2(
        base64
      );

      await salvarFormulario({
        foto2: {
          base64,
          nome:
            arquivo.name,
          tipo:
            arquivo.type ||
            'image/jpeg',
        },
      });

    } catch (error) {

      console.error(
        'Erro ao salvar foto 2:',
        error
      );

      alert(
        'Não foi possível salvar a segunda foto. Tente novamente.'
      );
    }

    if (
      cameraInput2Ref.current
    ) {

      cameraInput2Ref.current.value =
        '';
    }
  }

  // ==========================================
  // CONSULTAR PLACA
  // ==========================================

  async function consultarPlaca(
    placaDigitada: string
  ) {

    const placaLimpa =
      placaDigitada
        .trim()
        .toUpperCase()
        .replace(
          /[^A-Z0-9]/g,
          ''
        );

    if (
      placaLimpa.length !== 7
    ) {

      return;
    }

    if (
      ultimaPlacaConsultada.current ===
      placaLimpa
    ) {

      return;
    }

    ultimaPlacaConsultada.current =
      placaLimpa;

    setConsultandoPlaca(
      true
    );

    try {

      console.log(
        'Consultando placa:',
        placaLimpa
      );

      const {
        data,
        error,
      } =
        await supabase
          .from(
            'entradas_veiculos'
          )
          .select(
            `
              id,
              placa,
              modelo,
              frota,
              cliente_nome,
              telefone
            `
          )
          .eq(
            'placa',
            placaLimpa
          )
          .order(
            'criado_em',
            {
              ascending:
                false,
            }
          )
          .limit(1)
          .maybeSingle();

      if (error) {

        console.error(
          'ERRO AO CONSULTAR PLACA:',
          error
        );

        return;
      }

      if (!data) {

        console.log(
          'Placa não encontrada no banco.'
        );

        return;
      }

      console.log(
        'VEÍCULO ENCONTRADO:',
        data
      );

      setVeiculoEncontrado(
        data as VeiculoEncontrado
      );

      setMostrarVeiculoEncontrado(
        true
      );

    } catch (error) {

      console.error(
        'ERRO GERAL AO CONSULTAR PLACA:',
        error
      );

    } finally {

      setConsultandoPlaca(
        false
      );
    }
  }

  // ==========================================
  // ALTERAR PLACA
  // ==========================================

  function alterarPlaca(
    valor: string
  ) {

    const placaFormatada =
      valor
        .toUpperCase()
        .replace(
          /[^A-Z0-9]/g,
          ''
        )
        .slice(
          0,
          7
        );

    setPlaca(
      placaFormatada
    );

    if (
      placaFormatada.length < 7
    ) {

      ultimaPlacaConsultada.current =
        '';

      setVeiculoEncontrado(
        null
      );

      setMostrarVeiculoEncontrado(
        false
      );

      return;
    }

    consultarPlaca(
      placaFormatada
    );
  }

  // ==========================================
  // USAR CADASTRO ENCONTRADO
  // ==========================================

  function usarCadastroEncontrado() {

    if (!veiculoEncontrado) {
      return;
    }

    setPlaca(
      veiculoEncontrado.placa
        ?.toUpperCase() || ''
    );

    setModelo(
      veiculoEncontrado.modelo || ''
    );

    setFrota(
      veiculoEncontrado.frota || ''
    );

    setCliente(
      veiculoEncontrado.cliente_nome ||
      ''
    );

    setTelefone(
      veiculoEncontrado.telefone ||
      ''
    );

    setMostrarVeiculoEncontrado(
      false
    );

    console.log(
      'Cadastro anterior utilizado.'
    );
  }

  // ==========================================
  // NÃO USAR CADASTRO
  // ==========================================

  function cadastrarOutroVeiculo() {

    setMostrarVeiculoEncontrado(
      false
    );

    console.log(
      'Usuário escolheu cadastrar outro veículo.'
    );
  }

  // ==========================================
  // TROCAR TIPO
  // ==========================================

  function trocarTipoEntrada(
    tipo: TipoEntrada
  ) {

    setTipoEntrada(
      tipo
    );

    if (
      tipo === 'veiculo'
    ) {

      setDescricaoPeca(
        ''
      );
    }

    if (
      tipo === 'peca'
    ) {

      setPlaca(
        ''
      );

      setFrota(
        ''
      );

      ultimaPlacaConsultada.current =
        '';

      setVeiculoEncontrado(
        null
      );

      setMostrarVeiculoEncontrado(
        false
      );
    }
  }

  // ==========================================
  // LIMPAR FORMULÁRIO
  // ==========================================

  function limparFormulario() {

    setFoto1(
      null
    );

    setArquivoFoto1(
      null
    );

    setFoto2(
      null
    );

    setArquivoFoto2(
      null
    );

    setPlaca(
      ''
    );

    setModelo(
      ''
    );

    setFrota(
      ''
    );

    setDescricaoPeca(
      ''
    );

    setCliente(
      ''
    );

    setTelefone(
      ''
    );

    setObservacao(
      ''
    );

    ultimaPlacaConsultada.current =
      '';

    setVeiculoEncontrado(
      null
    );

    setMostrarVeiculoEncontrado(
      false
    );

    localStorage.removeItem(
      STORAGE_KEY
    );

    if (
      cameraInput1Ref.current
    ) {

      cameraInput1Ref.current.value =
        '';
    }

    if (
      cameraInput2Ref.current
    ) {

      cameraInput2Ref.current.value =
        '';
    }
  }

  // ==========================================
  // ENVIAR
  // ==========================================

  async function enviar() {

    // ========================================
    // VALIDAR FOTO 1
    // ========================================

    if (!arquivoFoto1) {

      alert(
        tipoEntrada === 'veiculo'
          ? 'Tire a primeira foto da frente do veículo com a placa.'
          : 'Tire uma foto da peça antes de enviar.'
      );

      return;
    }

    // ========================================
    // VALIDAR FOTO 2 PARA VEÍCULO
    // ========================================

    if (
      tipoEntrada === 'veiculo' &&
      !arquivoFoto2
    ) {

      alert(
        'Tire a segunda foto da lateral do veículo, mostrando o modelo.'
      );

      return;
    }

    // ========================================
    // VALIDAR VEÍCULO
    // ========================================

    if (
      tipoEntrada === 'veiculo'
    ) {

      if (
        !placa.trim()
      ) {

        alert(
          'Digite a placa do veículo.'
        );

        return;
      }

      if (
        !modelo.trim()
      ) {

        alert(
          'Digite o modelo do veículo.'
        );

        return;
      }
    }

    // ========================================
    // VALIDAR PEÇA
    // ========================================

    if (
      tipoEntrada === 'peca'
    ) {

      if (
        !descricaoPeca.trim()
      ) {

        alert(
          'Digite a descrição da peça.'
        );

        return;
      }

      if (
        !modelo.trim()
      ) {

        alert(
          'Digite o modelo ou código da peça.'
        );

        return;
      }
    }

    // ========================================
    // VALIDAR CLIENTE
    // ========================================

    if (
      !cliente.trim()
    ) {

      alert(
        'Digite o nome do cliente.'
      );

      return;
    }

    // ========================================
    // TELEFONE NÃO É MAIS OBRIGATÓRIO
    // ========================================

    setEnviando(
      true
    );

    try {

      // ======================================
      // 1. ENVIAR FOTO 1
      // ======================================

      const extensao1 =
        arquivoFoto1.name
          .split('.')
          .pop()
          ?.toLowerCase() ||
        'jpg';

      const nomeArquivo1 =
        `${tipoEntrada}_frente_${Date.now()}.${extensao1}`;

      const caminho1 =
        `entradas/${new Date().getFullYear()}/${nomeArquivo1}`;

      console.log(
        'Enviando foto 1:',
        caminho1
      );

      const {
        error: erroFoto1,
      } =
        await supabase.storage
          .from(
            'fotos-entrada'
          )
          .upload(
            caminho1,
            arquivoFoto1,
            {
              contentType:
                arquivoFoto1.type ||
                'image/jpeg',

              upsert:
                false,
            }
          );

      if (erroFoto1) {

        console.error(
          'ERRO STORAGE FOTO 1:',
          erroFoto1
        );

        alert(
          `ERRO AO ENVIAR FOTO 1:\n\n${erroFoto1.message}`
        );

        throw erroFoto1;
      }

      // ======================================
      // 2. URL FOTO 1
      // ======================================

      const {
        data: fotoPublica1,
      } =
        supabase.storage
          .from(
            'fotos-entrada'
          )
          .getPublicUrl(
            caminho1
          );

      console.log(
        'URL FOTO 1:',
        fotoPublica1.publicUrl
      );

      // ======================================
      // 3. FOTO 2
      // ======================================

      let fotoPublica2:
        string | null = null;

      if (
        tipoEntrada === 'veiculo' &&
        arquivoFoto2
      ) {

        const extensao2 =
          arquivoFoto2.name
            .split('.')
            .pop()
            ?.toLowerCase() ||
          'jpg';

        const nomeArquivo2 =
          `${tipoEntrada}_lateral_${Date.now()}.${extensao2}`;

        const caminho2 =
          `entradas/${new Date().getFullYear()}/${nomeArquivo2}`;

        console.log(
          'Enviando foto 2:',
          caminho2
        );

        const {
          error: erroFoto2,
        } =
          await supabase.storage
            .from(
              'fotos-entrada'
            )
            .upload(
              caminho2,
              arquivoFoto2,
              {
                contentType:
                  arquivoFoto2.type ||
                  'image/jpeg',

                upsert:
                  false,
              }
            );

        if (erroFoto2) {

          console.error(
            'ERRO STORAGE FOTO 2:',
            erroFoto2
          );

          alert(
            `ERRO AO ENVIAR FOTO 2:\n\n${erroFoto2.message}`
          );

          throw erroFoto2;
        }

        const {
          data: fotoPublica2Data,
        } =
          supabase.storage
            .from(
              'fotos-entrada'
            )
            .getPublicUrl(
              caminho2
            );

        fotoPublica2 =
          fotoPublica2Data.publicUrl;

        console.log(
          'URL FOTO 2:',
          fotoPublica2
        );
      }

      // ======================================
      // 4. MONTAR DADOS
      // ======================================

      const dadosEntrada = {

        tipo_entrada:
          tipoEntrada,

        placa:
          tipoEntrada === 'veiculo'
            ? placa
                .trim()
                .toUpperCase()
            : null,

        modelo:
          modelo.trim() ||
          null,

        frota:
          tipoEntrada === 'veiculo' &&
          frota.trim()
            ? frota.trim()
            : null,

        tipo_peca:
          null,

        descricao_peca:
          tipoEntrada === 'peca'
            ? descricaoPeca.trim()
            : null,

        cliente_nome:
          cliente.trim(),

        telefone:
          telefone.trim() ||
          null,

        observacao:
          observacao.trim() ||
          null,

        foto_url:
          fotoPublica1.publicUrl,

        foto_url_2:
          fotoPublica2,
      };

      console.log(
        'DADOS DA ENTRADA:',
        dadosEntrada
      );

      // ======================================
      // 5. INSERT NO SUPABASE
      // ======================================

      const {
        data: entradaCriada,
        error: erroEntrada,
      } =
        await supabase
          .from(
            'entradas_veiculos'
          )
          .insert(
            dadosEntrada
          )
          .select()
          .single();

      // ======================================
      // ERRO BANCO
      // ======================================

      if (erroEntrada) {

        console.error(
          'ERRO BANCO:',
          erroEntrada
        );

        console.error(
          'Código:',
          erroEntrada.code
        );

        console.error(
          'Mensagem:',
          erroEntrada.message
        );

        console.error(
          'Detalhes:',
          erroEntrada.details
        );

        console.error(
          'Hint:',
          erroEntrada.hint
        );

        alert(
          `ERRO AO GRAVAR ENTRADA:\n\n` +
          `Mensagem: ${erroEntrada.message}\n\n` +
          `Código: ${erroEntrada.code || 'N/A'}\n\n` +
          `Detalhes: ${erroEntrada.details || 'N/A'}`
        );

        throw erroEntrada;
      }

      console.log(
        'ENTRADA CRIADA:',
        entradaCriada
      );

      // ======================================
      // 6. SUCESSO
      // ======================================

      alert(
        tipoEntrada === 'veiculo'
          ? 'Entrada do veículo registrada com as duas fotos!'
          : 'Entrada da peça registrada com sucesso!'
      );

      // ======================================
      // 7. LIMPAR
      // ======================================

      limparFormulario();

    } catch (error) {

      console.error(
        'ERRO GERAL AO REGISTRAR ENTRADA:',
        error
      );

      if (
        error &&
        typeof error === 'object' &&
        'message' in error
      ) {

        return;
      }

      alert(
        'Não foi possível registrar a entrada.'
      );

    } finally {

      setEnviando(
        false
      );
    }
  }

  // ==========================================
  // INTERFACE
  // ==========================================

  return (
    <main className="app">

      {/* ======================================
          CABEÇALHO
      ====================================== */}

      <header className="header">

        <div className="logo">
          DIESEL<span>CENTER</span>
        </div>

        <div className="subtitle">
          Controle de Oficina
        </div>

      </header>

      {/* ======================================
          CARD
      ====================================== */}

      <section className="card">

        <h1>
          Registro de Entrada
        </h1>

        <p className="description">
          Selecione o que está entrando
          na oficina.
        </p>

        {/* ====================================
            TIPO DE ENTRADA
        ==================================== */}

        <div className="entry-type">

          <label className="entry-type-title">
            O que está entrando?
          </label>

          <div className="entry-type-options">

            <button
              type="button"
              className={
                tipoEntrada === 'veiculo'
                  ? 'entry-type-button active'
                  : 'entry-type-button'
              }
              onClick={() =>
                trocarTipoEntrada(
                  'veiculo'
                )
              }
              disabled={enviando}
            >

              <span className="entry-icon">
                🚗
              </span>

              <span>
                Veículo
              </span>

              <small>
                Caminhão, pickup etc.
              </small>

            </button>

            <button
              type="button"
              className={
                tipoEntrada === 'peca'
                  ? 'entry-type-button active'
                  : 'entry-type-button'
              }
              onClick={() =>
                trocarTipoEntrada(
                  'peca'
                )
              }
              disabled={enviando}
            >

              <span className="entry-icon">
                🔧
              </span>

              <span>
                Peça avulsa
              </span>

              <small>
                Bomba, bico, turbina etc.
              </small>

            </button>

          </div>

        </div>

        {/* ====================================
            INPUT FOTO 1
        ==================================== */}

        <input
          ref={cameraInput1Ref}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={selecionarFoto1}
          hidden
        />

        {/* ====================================
            INPUT FOTO 2
        ==================================== */}

        <input
          ref={cameraInput2Ref}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={selecionarFoto2}
          hidden
        />

        {/* ====================================
            FOTOS DO VEÍCULO
        ==================================== */}

        {tipoEntrada === 'veiculo' && (

          <div
            style={{
              display: 'grid',
              gap: '14px',
            }}
          >

            {/* FOTO 1 */}

            <button
              type="button"
              className="camera-area camera-clickable"
              onClick={abrirCamera1}
              disabled={enviando}
              aria-label={
                foto1
                  ? 'Tirar outra foto da frente'
                  : 'Tirar foto da frente'
              }
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
                    Fotografe a frente do veículo
                    mostrando bem a placa.
                  </small>

                </div>

              )}

              {foto1 && (
                <div className="camera-overlay">
                  📷 Toque para tirar outra
                </div>
              )}

            </button>

            {/* FOTO 2 */}

            <button
              type="button"
              className="camera-area camera-clickable"
              onClick={abrirCamera2}
              disabled={enviando}
              aria-label={
                foto2
                  ? 'Tirar outra foto da lateral'
                  : 'Tirar foto da lateral'
              }
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
                    Fotografe a lateral do veículo
                    mostrando o modelo.
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

        {/* ====================================
            FOTO DA PEÇA
        ==================================== */}

        {tipoEntrada === 'peca' && (

          <>

            <button
              type="button"
              className="camera-area camera-clickable"
              onClick={abrirCamera1}
              disabled={enviando}
              aria-label={
                foto1
                  ? 'Tirar outra foto da peça'
                  : 'Tirar foto da peça'
              }
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
                    Toque aqui para tirar a foto
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

          </>
        )}

        {/* ====================================
            CAMPOS DO VEÍCULO
        ==================================== */}

        {tipoEntrada === 'veiculo' && (
          <>

            <div className="form-group">

              <label htmlFor="placa">
                PLACA *
              </label>

              <input
                id="placa"
                type="text"
                value={placa}
                onChange={(e) =>
                  alterarPlaca(
                    e.target.value
                  )
                }
                placeholder="ABC1D23"
                maxLength={7}
                disabled={enviando}
              />

              <small>
                {consultandoPlaca
                  ? '🔎 Procurando veículo no cadastro...'
                  : 'Digite a placa completa para verificar se o veículo já está cadastrado.'}
              </small>

            </div>

            <div className="form-group">

              <label htmlFor="modelo">
                MODELO *
              </label>

              <input
                id="modelo"
                type="text"
                value={modelo}
                onChange={(e) =>
                  setModelo(
                    e.target.value
                  )
                }
                placeholder="Modelo do veículo"
                disabled={enviando}
              />

            </div>

            <div className="form-group">

              <label htmlFor="frota">
                FROTA
              </label>

              <input
                id="frota"
                type="text"
                value={frota}
                onChange={(e) =>
                  setFrota(
                    e.target.value
                  )
                }
                placeholder="Número da frota, se houver"
                disabled={enviando}
              />

              <small>
                Preencha somente se o veículo possuir número de frota.
              </small>

            </div>

          </>
        )}

        {/* ====================================
            CAMPOS DA PEÇA
        ==================================== */}

        {tipoEntrada === 'peca' && (
          <>

            <div className="divider">

              <span>
                Dados da peça
              </span>

            </div>

            <div className="form-group">

              <label htmlFor="descricaoPeca">
                DESCRIÇÃO DA PEÇA *
              </label>

              <textarea
                id="descricaoPeca"
                value={descricaoPeca}
                onChange={(e) =>
                  setDescricaoPeca(
                    e.target.value
                  )
                }
                placeholder="Ex.: Bomba e bicos injetores Bosch"
                rows={3}
                disabled={enviando}
              />

              <small>
                Descreva livremente a peça
                que está entrando na oficina.
              </small>

            </div>

            <div className="form-group">

              <label htmlFor="modeloPeca">
                MODELO OU CÓDIGO DA PEÇA *
              </label>

              <input
                id="modeloPeca"
                type="text"
                value={modelo}
                onChange={(e) =>
                  setModelo(
                    e.target.value
                  )
                }
                placeholder="Modelo ou código da peça"
                disabled={enviando}
              />

            </div>

          </>
        )}

        {/* ====================================
            DADOS DO CLIENTE
        ==================================== */}

        <div className="divider">

          <span>
            Dados do cliente
          </span>

        </div>

        <div className="form-group">

          <label htmlFor="cliente">
            NOME COMPLETO DO CLIENTE *
          </label>

          <input
            id="cliente"
            type="text"
            value={cliente}
            onChange={(e) =>
              setCliente(
                e.target.value
              )
            }
            placeholder="Nome completo"
            disabled={enviando}
          />

        </div>

        {/* ====================================
            TELEFONE
        ==================================== */}

        <div className="form-group">

          <label htmlFor="telefone">
            TELEFONE
          </label>

          <input
            id="telefone"
            type="tel"
            value={telefone}
            onChange={(e) =>
              setTelefone(
                e.target.value
              )
            }
            placeholder="(00) 00000-0000"
            disabled={enviando}
          />

          <small>
            Opcional.
          </small>

        </div>

        {/* ====================================
            OBSERVAÇÃO
        ==================================== */}

        <div className="form-group">

          <label htmlFor="observacao">
            OBSERVAÇÃO
          </label>

          <textarea
            id="observacao"
            value={observacao}
            onChange={(e) =>
              setObservacao(
                e.target.value
              )
            }
            placeholder={
              tipoEntrada === 'veiculo'
                ? 'Ex.: Caminhão chegou com o para-brisa quebrado...'
                : 'Ex.: Peça chegou com riscos, amassados ou outros detalhes...'
            }
            rows={4}
            disabled={enviando}
          />

          <small>
            Registre qualquer detalhe importante
            sobre o estado em que o veículo ou
            peça chegou à oficina.
          </small>

        </div>

        {/* ====================================
            ENVIAR
        ==================================== */}

        <button
          type="button"
          className="submit-button"
          onClick={enviar}
          disabled={enviando}
        >

          {enviando
            ? 'ENVIANDO...'
            : 'ENVIAR ENTRADA'}

        </button>

      </section>

      {/* ======================================
          MODAL - VEÍCULO ENCONTRADO
      ====================================== */}

      {mostrarVeiculoEncontrado &&
        veiculoEncontrado && (

          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,

              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',

              padding: '20px',

              background:
                'rgba(0, 0, 0, 0.78)',
            }}
          >

            <div
              style={{
                width: '100%',
                maxWidth: '440px',

                padding: '24px',

                border:
                  '1px solid #444444',

                borderTop:
                  '4px solid #d71920',

                borderRadius: '16px',

                background: '#1b1b1b',

                boxShadow:
                  '0 20px 60px rgba(0,0,0,0.6)',
              }}
            >

              <div
                style={{
                  textAlign: 'center',
                  marginBottom: '20px',
                }}
              >

                <div
                  style={{
                    fontSize: '42px',
                    marginBottom: '8px',
                  }}
                >
                  🚗
                </div>

                <h2
                  style={{
                    margin: 0,
                    color: '#ffffff',
                    fontSize: '22px',
                    fontWeight: 900,
                  }}
                >
                  VEÍCULO ENCONTRADO
                </h2>

                <p
                  style={{
                    margin:
                      '8px 0 0',
                    color: '#999999',
                    fontSize: '14px',
                    lineHeight: 1.4,
                  }}
                >
                  Já existe um cadastro
                  desse veículo no sistema.
                </p>

              </div>

              <div
                style={{
                  padding: '16px',
                  border:
                    '1px solid #383838',
                  borderRadius: '12px',
                  background: '#101010',
                }}
              >

                <div
                  style={{
                    marginBottom: '14px',
                  }}
                >

                  <div
                    style={{
                      color: '#888888',
                      fontSize: '12px',
                      fontWeight: 700,
                      marginBottom: '4px',
                      textTransform:
                        'uppercase',
                    }}
                  >
                    Placa
                  </div>

                  <div
                    style={{
                      color: '#ffffff',
                      fontSize: '23px',
                      fontWeight: 900,
                      letterSpacing:
                        '1.5px',
                    }}
                  >
                    {veiculoEncontrado.placa ||
                      '-'}
                  </div>

                </div>

                <div
                  style={{
                    marginBottom: '14px',
                  }}
                >

                  <div
                    style={{
                      color: '#888888',
                      fontSize: '12px',
                      fontWeight: 700,
                      marginBottom: '4px',
                      textTransform:
                        'uppercase',
                    }}
                  >
                    Modelo
                  </div>

                  <div
                    style={{
                      color: '#ffffff',
                      fontSize: '17px',
                      fontWeight: 800,
                    }}
                  >
                    {veiculoEncontrado.modelo ||
                      '-'}
                  </div>

                </div>

                <div
                  style={{
                    marginBottom: '14px',
                  }}
                >

                  <div
                    style={{
                      color: '#888888',
                      fontSize: '12px',
                      fontWeight: 700,
                      marginBottom: '4px',
                      textTransform:
                        'uppercase',
                    }}
                  >
                    Frota
                  </div>

                  <div
                    style={{
                      color: '#ffffff',
                      fontSize: '16px',
                      fontWeight: 700,
                    }}
                  >
                    {veiculoEncontrado.frota ||
                      'Não informada'}
                  </div>

                </div>

                <div
                  style={{
                    marginBottom: '14px',
                  }}
                >

                  <div
                    style={{
                      color: '#888888',
                      fontSize: '12px',
                      fontWeight: 700,
                      marginBottom: '4px',
                      textTransform:
                        'uppercase',
                    }}
                  >
                    Cliente
                  </div>

                  <div
                    style={{
                      color: '#ffffff',
                      fontSize: '17px',
                      fontWeight: 800,
                    }}
                  >
                    {veiculoEncontrado.cliente_nome ||
                      '-'}
                  </div>

                </div>

                <div>

                  <div
                    style={{
                      color: '#888888',
                      fontSize: '12px',
                      fontWeight: 700,
                      marginBottom: '4px',
                      textTransform:
                        'uppercase',
                    }}
                  >
                    Telefone
                  </div>

                  <div
                    style={{
                      color: '#ffffff',
                      fontSize: '16px',
                      fontWeight: 700,
                    }}
                  >
                    {veiculoEncontrado.telefone ||
                      'Não informado'}
                  </div>

                </div>

              </div>

              <p
                style={{
                  margin:
                    '18px 0',
                  color: '#aaaaaa',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  textAlign: 'center',
                }}
              >
                Se for o mesmo veículo,
                podemos preencher os dados
                automaticamente.
              </p>

              <button
                type="button"
                onClick={
                  usarCadastroEncontrado
                }
                style={{
                  width: '100%',
                  padding: '15px',
                  border: 'none',
                  borderRadius: '10px',
                  background: '#d71920',
                  color: '#ffffff',
                  fontSize: '15px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  marginBottom: '10px',
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
                  padding: '14px',
                  border:
                    '1px solid #555555',
                  borderRadius: '10px',
                  background: '#292929',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                NÃO, CADASTRAR OUTRO
              </button>

            </div>

          </div>

        )}

    </main>
  );
}

export default App;
interface Props {
  onSelect: (tipo: 'veiculo' | 'peca') => void
}

export default function TipoEntrada({
  onSelect,
}: Props) {
  return (
    <section className="entrada-inicial">

      <h1>Nova entrada</h1>

      <p>
        O que chegou na oficina?
      </p>

      <div className="tipo-grid">

        <button
          className="tipo-card"
          onClick={() => onSelect('veiculo')}
        >
          <span>🚛</span>

          <strong>
            Veículo
          </strong>

          <small>
            Entrada de caminhão,
            pickup ou outro veículo
          </small>
        </button>

        <button
          className="tipo-card"
          onClick={() => onSelect('peca')}
        >
          <span>🔧</span>

          <strong>
            Peça avulsa
          </strong>

          <small>
            Bomba, bicos, turbina,
            motor ou componente
          </small>
        </button>

      </div>

    </section>
  )
}
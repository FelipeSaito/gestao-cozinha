"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  Calculator,
  Droplets,
  Egg,
  FlaskConical,
  PlayCircle,
  Thermometer,
  Wheat,
} from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

import {
  calcularReceitaMassa,
  validarQuantidadeMassa,
  type ResultadoCalculoMassa,
} from "@/lib/receita-massa";

import styles from "./MassProductionPlanner.module.css";

export interface MassProductionPlannerPayload
  extends ResultadoCalculoMassa {
  quantidadeDesejadaKg: number;
  aguaMlPorBatelada: number;
  temperaturaC: number;
}

interface MassProductionPlannerProps {
  onConfirm: (
    payload: MassProductionPlannerPayload,
  ) => void;
}

const QUANTIDADES_RAPIDAS = [
  50,
  100,
  150,
  200,
];

const formatadorNumero =
  new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  });

function formatarNumero(
  valor: number,
): string {
  return formatadorNumero.format(valor);
}

function formatarPeso(
  quantidadeG: number,
): string {
  if (quantidadeG >= 1000) {
    return `${formatarNumero(
      quantidadeG / 1000,
    )} kg`;
  }

  return `${formatarNumero(
    quantidadeG,
  )} g`;
}

function formatarVolume(
  quantidadeMl: number,
): string {
  if (quantidadeMl >= 1000) {
    return `${formatarNumero(
      quantidadeMl / 1000,
    )} L`;
  }

  return `${formatarNumero(
    quantidadeMl,
  )} ml`;
}

export function MassProductionPlanner({
  onConfirm,
}: MassProductionPlannerProps) {
  const [
    quantidadeDesejada,
    setQuantidadeDesejada,
  ] = useState("100");

  const [temperatura, setTemperatura] =
    useState("15");

  const [
    aguaPorBatelada,
    setAguaPorBatelada,
  ] = useState("3350");

  const [erroEnvio, setErroEnvio] =
    useState<string | null>(null);

  const calculo = useMemo(() => {
    if (
      quantidadeDesejada.trim() === ""
    ) {
      return {
        resultado: null,
        erro: "Informe a quantidade de massa.",
      };
    }

    const quantidadeKg = Number(
      quantidadeDesejada,
    );

    const erroQuantidade =
      validarQuantidadeMassa(
        quantidadeKg,
      );

    if (erroQuantidade) {
      return {
        resultado: null,
        erro: erroQuantidade,
      };
    }

    const aguaMl = Number(
      aguaPorBatelada,
    );

    if (
      aguaPorBatelada.trim() === "" ||
      !Number.isFinite(aguaMl) ||
      aguaMl <= 0
    ) {
      return {
        resultado: null,
        erro:
          "Informe uma quantidade de água maior que zero.",
      };
    }

    const temperaturaC = Number(
      temperatura,
    );

    if (
      temperatura.trim() === "" ||
      !Number.isFinite(temperaturaC)
    ) {
      return {
        resultado: null,
        erro:
          "Informe a temperatura do ambiente.",
      };
    }

    try {
      return {
        resultado:
          calcularReceitaMassa({
            quantidadeDesejadaKg:
              quantidadeKg,
            aguaMlPorBatelada:
              aguaMl,
            temperaturaC,
          }),
        erro: null,
      };
    } catch (error) {
      return {
        resultado: null,
        erro:
          error instanceof Error
            ? error.message
            : "Não foi possível calcular a receita.",
      };
    }
  }, [
    quantidadeDesejada,
    aguaPorBatelada,
    temperatura,
  ]);

  function selecionarQuantidade(
    quantidade: number,
  ) {
    setQuantidadeDesejada(
      String(quantidade),
    );
    setErroEnvio(null);
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setErroEnvio(null);

    if (
      calculo.erro ||
      !calculo.resultado
    ) {
      setErroEnvio(
        calculo.erro ??
          "Revise os dados da produção.",
      );
      return;
    }

    onConfirm({
      quantidadeDesejadaKg: Number(
        quantidadeDesejada,
      ),
      aguaMlPorBatelada: Number(
        aguaPorBatelada,
      ),
      temperaturaC: Number(
        temperatura,
      ),
      receitaPorBatelada:
        calculo.resultado
          .receitaPorBatelada,
      totais:
        calculo.resultado.totais,
    });
  }

  const totais =
    calculo.resultado?.totais;

  return (
    <form
      className={styles.card}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className={styles.header}>
        <span
          className={styles.headerIcon}
          aria-hidden="true"
        >
          <Calculator size={26} />
        </span>

        <div>
          <h2>
            Planejar produção de massa
          </h2>

          <p>
            Informe quantos quilos serão
            produzidos para calcular a
            receita completa.
          </p>
        </div>
      </div>

      <fieldset
        className={styles.quickOptions}
      >
        <legend>
          Escolha uma quantidade rápida
        </legend>

        <div
          className={
            styles.quickButtons
          }
        >
          {QUANTIDADES_RAPIDAS.map(
            (quantidade) => {
              const selecionada =
                Number(
                  quantidadeDesejada,
                ) === quantidade;

              return (
                <button
                  key={quantidade}
                  type="button"
                  className={
                    selecionada
                      ? styles.quickActive
                      : styles.quickButton
                  }
                  aria-pressed={
                    selecionada
                  }
                  onClick={() =>
                    selecionarQuantidade(
                      quantidade,
                    )
                  }
                >
                  {quantidade} kg
                </button>
              );
            },
          )}
        </div>
      </fieldset>

      <div className={styles.fields}>
        <Input
          label="Quantidade de massa"
          type="number"
          inputMode="numeric"
          min={10}
          step={10}
          value={quantidadeDesejada}
          onChange={(event) => {
            setQuantidadeDesejada(
              event.target.value,
            );
            setErroEnvio(null);
          }}
          hint="Utilize múltiplos de 10 kg."
          leftIcon={
            <Wheat size={20} />
          }
        />

        <Input
          label="Temperatura do ambiente"
          type="number"
          inputMode="decimal"
          step={0.5}
          value={temperatura}
          onChange={(event) => {
            setTemperatura(
              event.target.value,
            );
            setErroEnvio(null);
          }}
          hint="Referência atual: 15 °C."
          leftIcon={
            <Thermometer size={20} />
          }
        />

        <Input
          label="Água por batelada"
          type="number"
          inputMode="numeric"
          min={1}
          step={50}
          value={aguaPorBatelada}
          onChange={(event) => {
            setAguaPorBatelada(
              event.target.value,
            );
            setErroEnvio(null);
          }}
          hint="Pode variar conforme o clima."
          leftIcon={
            <Droplets size={20} />
          }
        />
      </div>

      <Alert
        variant="info"
        title="Atenção à quantidade de água"
      >
        A referência é 3.350 ml por
        batelada quando a temperatura
        estiver em torno de 15 °C. O
        funcionário deve confirmar a
        quantidade de acordo com o clima
        e a experiência da produção.
      </Alert>

      {(erroEnvio || calculo.erro) && (
        <Alert
          variant="danger"
          title="Revise os dados"
        >
          {erroEnvio ?? calculo.erro}
        </Alert>
      )}

      {totais && (
        <section
          className={styles.result}
          aria-live="polite"
          aria-labelledby="titulo-receita"
        >
          <div
            className={
              styles.resultHeader
            }
          >
            <div>
              <span>
                Receita calculada
              </span>

              <h3 id="titulo-receita">
                {formatarNumero(
                  totais.quantidadeMassaKg,
                )}{" "}
                kg de massa
              </h3>
            </div>

            <strong
              className={
                styles.batchBadge
              }
            >
              {
                totais.quantidadeBateladas
              }{" "}
              bateladas
            </strong>
          </div>

          <div
            className={
              styles.summaryGrid
            }
          >
            <article
              className={
                styles.summaryItem
              }
            >
              <Wheat
                size={22}
                aria-hidden="true"
              />

              <span>Farinha</span>

              <strong>
                {
                  totais.quantidadeSacosFarinha
                }{" "}
                sacos
              </strong>

              <small>
                {formatarNumero(
                  totais.farinhaKg,
                )}{" "}
                kg no total
              </small>
            </article>

            <article
              className={
                styles.summaryItem
              }
            >
              <FlaskConical
                size={22}
                aria-hidden="true"
              />

              <span>
                Copos de tempero
              </span>

              <strong>
                {formatarNumero(
                  totais.coposTempero,
                )}
              </strong>

              <small>
                Um por batelada
              </small>
            </article>

            <article
              className={
                styles.summaryItem
              }
            >
              <Egg
                size={22}
                aria-hidden="true"
              />

              <span>
                Claras de ovo
              </span>

              <strong>
                {formatarNumero(
                  totais.clarasOvo,
                )}
              </strong>

              <small>
                Três por batelada
              </small>
            </article>

            <article
              className={
                styles.summaryItem
              }
            >
              <Droplets
                size={22}
                aria-hidden="true"
              />

              <span>Água</span>

              <strong>
                {formatarVolume(
                  totais.aguaMl,
                )}
              </strong>

              <small>
                Total estimado
              </small>
            </article>
          </div>

          <dl
            className={
              styles.ingredients
            }
          >
            <div>
              <dt>Ajinomoto</dt>
              <dd>
                {formatarPeso(
                  totais.ajinomotoG,
                )}
              </dd>
            </div>

            <div>
              <dt>Sal</dt>
              <dd>
                {formatarPeso(
                  totais.salG,
                )}
              </dd>
            </div>

            <div>
              <dt>Óleo</dt>
              <dd>
                {formatarVolume(
                  totais.oleoMl,
                )}
              </dd>
            </div>

            <div>
              <dt>Pinga</dt>
              <dd>
                {formatarVolume(
                  totais.pingaMl,
                )}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <div className={styles.footer}>
        <Button
          type="submit"
          variant="primary"
          size="large"
          leftIcon={
            <PlayCircle size={20} />
          }
          disabled={!totais}
        >
          Iniciar produção de massa
        </Button>
      </div>
    </form>
  );
}
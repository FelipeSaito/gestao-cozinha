/** Nome exibido para sabores antigos e novos. Não altera o ID nem gravações existentes. */
const NOMES: Record<string, string> = {
  "fc": "Frango Catupiry",
  "frango catupiry": "Frango Catupiry",
  "fq": "Frango com Queijo",
  "frango com queijo": "Frango com Queijo",
  "c/q": "Carne com Queijo",
  "carne com queijo": "Carne com Queijo",
  "c.chded": "Carne com Cheddar",
  "carne com chedder": "Carne com Cheddar",
  "carne com cheddar": "Carne com Cheddar",
  "chcolate": "Chocolate",
  "chocolate": "Chocolate",
};

export function nomeSabor(nome: string): string {
  const limpo = nome.trim();
  const chave = limpo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  return NOMES[chave] ?? (limpo ? limpo[0].toLocaleUpperCase("pt-BR") + limpo.slice(1) : limpo);
}

/** Compara abreviações antigas com a escrita completa sem mudar os dados salvos. */
export function chaveSabor(nome: string): string {
  return nomeSabor(nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

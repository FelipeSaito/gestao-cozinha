import type { Production } from "@/types";

export const producoes: Production[] = [
  {
    id: "prd-1",
    codigo: "PRD-2026-0104",
    prato: "Pastel de carne",
    categoria: "Salgados",
    quantidade: 120,
    unidade: "unidades",
    responsavel: "Mariana Costa",
    dataProducao: "2026-09-12",
    status: "em-andamento",
    insumos: [
      { id: "pi-1", nome: "Massa para pastel", quantidade: 8, unidade: "kg" },
      { id: "pi-2", nome: "Carne moída", quantidade: 5, unidade: "kg" },
    ],
  },
  {
    id: "prd-2",
    codigo: "PRD-2026-0103",
    prato: "Pastel de queijo",
    categoria: "Salgados",
    quantidade: 90,
    unidade: "unidades",
    responsavel: "Mariana Costa",
    dataProducao: "2026-09-12",
    status: "planejada",
    insumos: [
      { id: "pi-3", nome: "Massa para pastel", quantidade: 6, unidade: "kg" },
      { id: "pi-4", nome: "Queijo muçarela", quantidade: 4, unidade: "kg" },
    ],
  },
  {
    id: "prd-3",
    codigo: "PRD-2026-0102",
    prato: "Batata frita porção",
    categoria: "Acompanhamentos",
    quantidade: 60,
    unidade: "porções",
    responsavel: "João Oliveira",
    dataProducao: "2026-09-11",
    status: "concluida",
    insumos: [
      { id: "pi-5", nome: "Óleo de soja", quantidade: 4, unidade: "litros" },
    ],
  },
  {
    id: "prd-4",
    codigo: "PRD-2026-0101",
    prato: "Misto quente",
    categoria: "Lanches",
    quantidade: 45,
    unidade: "unidades",
    responsavel: "Mariana Costa",
    dataProducao: "2026-09-11",
    status: "concluida",
    insumos: [
      { id: "pi-6", nome: "Presunto", quantidade: 2, unidade: "kg" },
      { id: "pi-7", nome: "Queijo muçarela", quantidade: 2, unidade: "kg" },
    ],
  },
];
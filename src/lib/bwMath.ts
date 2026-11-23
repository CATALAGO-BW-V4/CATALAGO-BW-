import type { FiadoInstallmentPayment, SalePaymentMethod } from '../types';

export const BW_CONFIG = {
  TAXA_CARTAO: 0.12,
  FATOR_CARTAO: 0.88,
  MARGEM_PADRAO: 40,
  FRETE_PADRAO: 30,
  DESLOC_PADRAO: 15,
  ESTOQUE_CRITICO: 2,
} as const;

export function roundCurrency(valor: number | string | undefined | null): number {
  const n = typeof valor === 'number' ? valor : parseFloat(String(valor ?? 0));
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatCurrencyBRL(valor: number | string | undefined | null): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(roundCurrency(valor));
}

export function formatDateISOToBR(dataISO?: string | null): string {
  if (!dataISO) return '---';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataISO.trim());
  if (!match) return dataISO;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getMonthRange(yearMonth: string): {
  startISO: string;
  endISO: string;
  label: string;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  const now = new Date();
  const y = match ? parseInt(match[1], 10) : now.getFullYear();
  const mIdx = match ? parseInt(match[2], 10) - 1 : now.getMonth();
  const lastDay = new Date(y, mIdx + 1, 0).getDate();
  const mm = String(mIdx + 1).padStart(2, '0');
  const label = new Date(y, mIdx, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return {
    startISO: `${y}-${mm}-01`,
    endISO: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  };
}

export interface ProductPricingBreakdown {
  totalCusto: number;
  precoBase: number;
  vPix: number;
  vCartao: number;
  taxaCartaoPerc: number;
  taxaCartaoReais: number;
  fatorAcrescimo: number;
  lucro: number;
  margemR100: number;
  precoR100Pix: number;
  precoR100Cartao: number;
}

export function calculateProductPricing(
  custo: number | string,
  frete: number | string,
  desloc: number | string,
  margem: number | string,
  taxaCartaoPerc: number | string = BW_CONFIG.TAXA_CARTAO * 100
): ProductPricingBreakdown {
  const c = Math.max(0, parseFloat(String(custo)) || 0);
  const f = Math.max(0, parseFloat(String(frete)) || 0);
  const d = Math.max(0, parseFloat(String(desloc)) || 0);
  const m = Math.max(0, parseFloat(String(margem)) || 0);
  const parsedTaxa = parseFloat(String(taxaCartaoPerc));
  const taxa = Math.min(
    200,
    Math.max(0, Number.isFinite(parsedTaxa) ? parsedTaxa : BW_CONFIG.TAXA_CARTAO * 100)
  );
  const fatorAcrescimo = 1 + taxa / 100;

  const totalCusto = roundCurrency(c + f + d);
  const precoBase = roundCurrency(totalCusto * (1 + m / 100));
  const vPix = roundCurrency(precoBase);
  const vCartao = roundCurrency(vPix * fatorAcrescimo);
  const taxaCartaoReais = roundCurrency(Math.max(0, vCartao - vPix));
  const lucro = roundCurrency(vPix - totalCusto);

  const margemR100 = totalCusto > 0 ? (100 / totalCusto) * 100 : 0;
  const precoR100Pix = roundCurrency(totalCusto * (1 + margemR100 / 100));
  const precoR100Cartao = roundCurrency(precoR100Pix * fatorAcrescimo);

  return {
    totalCusto,
    precoBase,
    vPix,
    vCartao,
    taxaCartaoPerc: taxa,
    taxaCartaoReais,
    fatorAcrescimo,
    lucro,
    margemR100,
    precoR100Pix,
    precoR100Cartao,
  };
}

export interface ProductPriceAudit {
  taxaPerc: number;
  fatorAcrescimo: number;
  liquidoCartao: number;
  taxaDescontadaReais: number;
  lucroPix: number;
  lucroCartao: number;
  margemPixPerc: number;
  margemCartaoPerc: number;
  cartaoIdealParaPix: number;
  cartaoAbaixoDoMinimo: boolean;
  prejuizoPix: boolean;
  prejuizoCartao: boolean;
}

export function auditProductPrices(
  custoTotal: number,
  precoCartao: number,
  precoPix: number,
  taxaCartaoPerc: number | string = BW_CONFIG.TAXA_CARTAO * 100
): ProductPriceAudit {
  const parsedTaxa = parseFloat(String(taxaCartaoPerc));
  const taxaPerc = Math.min(
    200,
    Math.max(0, Number.isFinite(parsedTaxa) ? parsedTaxa : BW_CONFIG.TAXA_CARTAO * 100)
  );
  const fatorAcrescimo = 1 + taxaPerc / 100;
  const fatorLiquido = Math.max(0, 1 - taxaPerc / 100);
  const custo = Math.max(0, roundCurrency(custoTotal));
  const card = Math.max(0, roundCurrency(precoCartao));
  const pix = Math.max(0, roundCurrency(precoPix));

  const liquidoCartao = roundCurrency(card * fatorLiquido);
  const taxaDescontadaReais = roundCurrency(Math.max(0, card - liquidoCartao));
  const lucroPix = roundCurrency(pix - custo);
  const lucroCartao = roundCurrency(liquidoCartao - custo);
  const margemPixPerc = custo > 0 ? ((pix - custo) / custo) * 100 : 0;
  const margemCartaoPerc = custo > 0 ? ((liquidoCartao - custo) / custo) * 100 : 0;
  const cartaoIdealParaPix = pix > 0 ? roundCurrency(pix * fatorAcrescimo) : 0;

  return {
    taxaPerc,
    fatorAcrescimo,
    liquidoCartao,
    taxaDescontadaReais,
    lucroPix,
    lucroCartao,
    margemPixPerc,
    margemCartaoPerc,
    cartaoIdealParaPix,
    cartaoAbaixoDoMinimo: pix > 0 && card > 0 && card + 0.02 < cartaoIdealParaPix,
    prejuizoPix: custo > 0 && pix > 0 && pix < custo,
    prejuizoCartao: custo > 0 && card > 0 && liquidoCartao < custo,
  };
}

export function calculateDiscountedTotal(
  itemsTotal: number,
  descTipo: 'reais' | 'porcento',
  descValor: number
): { totalBruto: number; descReais: number; totalFinal: number } {
  const totalBruto = Math.max(0, roundCurrency(itemsTotal));
  const cleanVal = Math.max(0, Number.isFinite(descValor) ? descValor : 0);
  const rawDesc =
    descTipo === 'reais'
      ? cleanVal
      : roundCurrency((Math.min(100, cleanVal) / 100) * totalBruto);
  const descReais = roundCurrency(Math.min(rawDesc, totalBruto));
  const totalFinal = roundCurrency(Math.max(0, totalBruto - descReais));
  return { totalBruto, descReais, totalFinal };
}

export function calculatePaymentNet(
  valorCliente: number,
  pagamento: SalePaymentMethod
): { taxaPerc: number; taxaReais: number; valorLiquido: number } {
  const cleanTotal = Math.max(0, roundCurrency(valorCliente));
  if (pagamento === 'Cartão') {
    const taxaPerc = 12;
    const taxaReais = roundCurrency(cleanTotal * BW_CONFIG.TAXA_CARTAO);
    const valorLiquido = roundCurrency(cleanTotal - taxaReais);
    return { taxaPerc, taxaReais, valorLiquido };
  }
  return { taxaPerc: 0, taxaReais: 0, valorLiquido: cleanTotal };
}

export interface InstallmentRow {
  numero: number;
  dataPrevista: string;
  valorParcela: number;
  valorPago: number;
  falta: number;
  status: 'paga' | 'parcial' | 'vencida' | 'pendente';
  dataPagamento?: string;
}

/**
 * Allocates cumulative payments sequentially across installments 1..N.
 * Fixes edge cases from legacy code where partial or multi-installment
 * payments drifted or left remainder cents unaccounted for.
 */
export function buildInstallmentBreakdown(
  totalLiquido: number,
  parcelasTotais: number,
  datasParcelas: string[],
  historicoParc: FiadoInstallmentPayment[]
): {
  rows: InstallmentRow[];
  totalPago: number;
  saldoRestante: number;
  parcelasQuitadas: number;
  porcentagem: number;
} {
  const total = Math.max(0, roundCurrency(totalLiquido));
  const n = Math.max(1, Math.floor(parcelasTotais || 1));
  const totalPago = roundCurrency(
    historicoParc.reduce((sum, h) => sum + Math.max(0, parseFloat(String(h.valorPago || 0)) || 0), 0)
  );
  const saldoRestante = roundCurrency(Math.max(0, total - totalPago));
  const porcentagem = total > 0 ? Math.min(100, Math.round((totalPago / total) * 100)) : 0;

  const baseVal = roundCurrency(Math.floor((total / n) * 100) / 100);
  let remainingPool = totalPago;
  let parcelasQuitadas = 0;
  const today = getTodayISO();

  const rows: InstallmentRow[] = [];
  for (let i = 0; i < n; i++) {
    const numero = i + 1;
    const valorParcela =
      i === n - 1 ? roundCurrency(Math.max(0, total - baseVal * (n - 1))) : baseVal;
    const pagoNesta = roundCurrency(Math.min(valorParcela, Math.max(0, remainingPool)));
    remainingPool = roundCurrency(Math.max(0, remainingPool - pagoNesta));
    const falta = roundCurrency(Math.max(0, valorParcela - pagoNesta));
    const dataPrevista = datasParcelas[i] || '';
    const histEntry = historicoParc.find((h) => h.parcela === numero);

    let status: InstallmentRow['status'] = 'pendente';
    if (falta <= 0.009) {
      status = 'paga';
      parcelasQuitadas++;
    } else if (pagoNesta > 0) {
      status = 'parcial';
    } else if (dataPrevista && dataPrevista < today) {
      status = 'vencida';
    }

    rows.push({
      numero,
      dataPrevista,
      valorParcela,
      valorPago: pagoNesta,
      falta,
      status,
      dataPagamento: histEntry?.dataPago,
    });
  }

  return { rows, totalPago, saldoRestante, parcelasQuitadas, porcentagem };
}

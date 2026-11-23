import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import {
  BW_CONFIG,
  buildInstallmentBreakdown,
  formatCurrencyBRL,
  formatDateISOToBR,
  getMonthISO,
  getMonthRange,
  roundCurrency,
} from '../lib/bwMath';
import type { Order, Product, ProductCost, SaleBw } from '../types';

interface AdminRelatoriosSectionProps {
  sales: SaleBw[];
  orders: Order[];
  products: Product[];
  productCosts: Record<string, ProductCost>;
  onNavigateTab?: (tab: 'pedidos' | 'fiados' | 'vender') => void;
}

function shiftMonthISO(yearMonth: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  const now = new Date();
  const y = m ? parseInt(m[1], 10) : now.getFullYear();
  const mo = m ? parseInt(m[2], 10) - 1 : now.getMonth();
  const shifted = new Date(y, mo + delta, 1);
  return getMonthISO(shifted);
}

function resolveSaleLucro(s: SaleBw): number {
  if (typeof s.lucroEstimado === 'number' && Number.isFinite(s.lucroEstimado)) {
    return roundCurrency(s.lucroEstimado);
  }
  const liquido = Number(s.valorLiquido ?? s.valor ?? 0);
  const custo = Number(s.custoTotal || 0);
  const frete = s.retirada ? 0 : Number(s.freteTotal || 0);
  const desloc = Number(s.deslocTotal || 0);
  return roundCurrency(liquido - custo - frete - desloc);
}

export const AdminRelatoriosSection: React.FC<AdminRelatoriosSectionProps> = ({
  sales,
  orders,
  products,
  productCosts,
  onNavigateTab,
}) => {
  const currentMonth = getMonthISO();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const initialRange = getMonthRange(currentMonth);
  const [dateStart, setDateStart] = useState(initialRange.startISO);
  const [dateEnd, setDateEnd] = useState(initialRange.endISO);

  const handleSelectMonth = (ym: string) => {
    setSelectedMonth(ym);
    const range = getMonthRange(ym);
    setDateStart(range.startISO);
    setDateEnd(range.endISO);
  };

  // Monthly 6-month series ending at selectedMonth
  const monthlySeries = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => shiftMonthISO(selectedMonth, -(5 - i)));
    return months.map((ym) => {
      const { startISO, endISO } = getMonthRange(ym);
      const shortLabel = new Date(
        parseInt(ym.slice(0, 4), 10),
        parseInt(ym.slice(5, 7), 10) - 1,
        1
      )
        .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        .replace('.', '');

      let totalVendido = 0;
      let caixaRecebido = 0;
      let lucroEstimado = 0;
      let count = 0;

      sales.forEach((s) => {
        const d = (s.data || '').slice(0, 10);
        const valLiq = Number(s.valorLiquido ?? s.valor ?? 0);
        const inMonth = d >= startISO && d <= endISO;
        if (inMonth) {
          totalVendido += valLiq;
          lucroEstimado += resolveSaleLucro(s);
          count++;
          if (s.status === 'Pago' && s.pagamento !== 'Fiado') {
            caixaRecebido += valLiq;
          } else if (
            s.status === 'Pago' &&
            s.pagamento === 'Fiado' &&
            (!Array.isArray(s.historicoParc) || s.historicoParc.length === 0)
          ) {
            // Legacy paid fiado without installment timestamps
            caixaRecebido += valLiq;
          }
        }

        // Fiado installment receipts actually received in this month
        if (Array.isArray(s.historicoParc) && s.historicoParc.length > 0) {
          const explicitSum = s.historicoParc.reduce(
            (acc, h) => acc + (h.valorPago !== undefined && h.valorPago !== null ? Number(h.valorPago || 0) : 0),
            0
          );
          const missingCount = s.historicoParc.filter(
            (h) => h.valorPago === undefined || h.valorPago === null
          ).length;
          const fallbackEach =
            missingCount > 0 && s.status === 'Pago'
              ? roundCurrency(Math.max(0, valLiq - explicitSum) / missingCount)
              : 0;

          s.historicoParc.forEach((h) => {
            const hd = (h.dataPago || '').slice(0, 10);
            if (hd >= startISO && hd <= endISO) {
              const vp =
                h.valorPago !== undefined && h.valorPago !== null
                  ? Number(h.valorPago || 0)
                  : fallbackEach;
              caixaRecebido += vp;
            }
          });
        }
      });

      return {
        ym,
        shortLabel: shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1),
        totalVendido: roundCurrency(totalVendido),
        caixaRecebido: roundCurrency(caixaRecebido),
        lucroEstimado: roundCurrency(lucroEstimado),
        count,
      };
    });
  }, [sales, selectedMonth]);

  const maxMonthlyVal = useMemo(
    () => Math.max(...monthlySeries.map((m) => Math.max(m.totalVendido, m.caixaRecebido)), 1),
    [monthlySeries]
  );

  // Full period breakdown (strictly without double-counting Fiados)
  const report = useMemo(() => {
    let totalVendido = 0;
    let totalPix = 0;
    let totalCartaoLiq = 0;
    let totalCartaoBruto = 0;
    let totalTaxas = 0;
    let totalDinheiro = 0;
    let totalFiadoVendidoNoPeriodo = 0;
    let fiadoRecebidoNoPeriodo = 0;
    let totalDescontos = 0;
    let custoProdutos = 0;
    let freteEntregas = 0;
    let deslocTotal = 0;
    let lucroTotal = 0;

    // General receivables across all open Fiados (kept strictly separate from period revenue!)
    let fiadoPendenteGeral = 0;
    let fiadoPendenteCount = 0;
    let parcelasVencendoPeriodo = 0;
    let valorParcelasVencendoPeriodo = 0;

    const prodQtyCounts: Record<string, { nome: string; qtd: number; receita: number }> = {};
    const periodSales: SaleBw[] = [];
    const fiadoReceiptsInPeriod: Array<{
      saleId: string;
      cliente: string;
      perfume: string;
      parcela: number;
      dataPago: string;
      valorPago: number;
    }> = [];

    const start = dateStart || '0000-01-01';
    const end = dateEnd || '9999-12-31';

    sales.forEach((s) => {
      const d = (s.data || '').slice(0, 10);
      const inPeriod = d >= start && d <= end;
      const valLiq = Number(s.valorLiquido ?? s.valor ?? 0);
      const valBruto = Number(s.valorCliente ?? valLiq);

      if (inPeriod) {
        periodSales.push(s);
        totalVendido += valLiq;
        totalDescontos += Number(s.desconto || 0);
        custoProdutos += Number(s.custoTotal || 0);
        freteEntregas += s.retirada ? 0 : Number(s.freteTotal || 0);
        deslocTotal += Number(s.deslocTotal || 0);
        lucroTotal += resolveSaleLucro(s);

        if (s.pagamento === 'PIX') {
          totalPix += valLiq;
        } else if (s.pagamento === 'Dinheiro') {
          totalDinheiro += valLiq;
        } else if (s.pagamento === 'Cartão') {
          totalCartaoLiq += valLiq;
          totalCartaoBruto += valBruto;
          totalTaxas += Number(s.taxaCartaoReais || 0);
        } else if (s.pagamento === 'Fiado') {
          totalFiadoVendidoNoPeriodo += valLiq;
          if (s.status === 'Pago' && (!Array.isArray(s.historicoParc) || s.historicoParc.length === 0)) {
            fiadoRecebidoNoPeriodo += valLiq;
          }
        }

        // Accurate unit quantity counting (fixes legacy bug that counted orders instead of bottles)
        if (Array.isArray(s.itens) && s.itens.length > 0) {
          s.itens.forEach((it) => {
            const key = (it.nome || 'Perfume').trim().toUpperCase();
            if (!prodQtyCounts[key]) {
              prodQtyCounts[key] = { nome: it.nome || 'Perfume', qtd: 0, receita: 0 };
            }
            prodQtyCounts[key].qtd += Math.max(1, Number(it.qtd || 1));
            prodQtyCounts[key].receita += Number(it.valorTotal || 0);
          });
        } else if (s.perfume) {
          const parts = s.perfume.split(/\s*\+\s*|,\s*/).filter(Boolean);
          parts.forEach((part) => {
            const m = /^(\d+)\s*[x×]\s*(.+)$/i.exec(part.trim());
            const q = m ? Math.max(1, parseInt(m[1], 10)) : 1;
            const nomeLimpo = m ? m[2].trim() : part.trim();
            const key = nomeLimpo.toUpperCase();
            if (!prodQtyCounts[key]) {
              prodQtyCounts[key] = { nome: nomeLimpo, qtd: 0, receita: 0 };
            }
            prodQtyCounts[key].qtd += q;
          });
        }
      }

      // Cash receipts from Fiado installments paid inside [start, end]
      if (Array.isArray(s.historicoParc) && s.historicoParc.length > 0) {
        const explicitSum = s.historicoParc.reduce(
          (acc, h) => acc + (h.valorPago !== undefined && h.valorPago !== null ? Number(h.valorPago || 0) : 0),
          0
        );
        const missingCount = s.historicoParc.filter(
          (h) => h.valorPago === undefined || h.valorPago === null
        ).length;
        const fallbackEach =
          missingCount > 0 && s.status === 'Pago'
            ? roundCurrency(Math.max(0, valLiq - explicitSum) / missingCount)
            : 0;

        s.historicoParc.forEach((h) => {
          const hd = (h.dataPago || '').slice(0, 10);
          if (hd >= start && hd <= end) {
            const vp =
              h.valorPago !== undefined && h.valorPago !== null
                ? Number(h.valorPago || 0)
                : fallbackEach;
            fiadoRecebidoNoPeriodo += vp;
            fiadoReceiptsInPeriod.push({
              saleId: s.id,
              cliente: s.cliente,
              perfume: s.perfume,
              parcela: h.parcela,
              dataPago: hd,
              valorPago: vp,
            });
          }
        });
      }

      // Open Fiados (Geral) + installments due in period
      if (s.status === 'Pendente') {
        const bd = buildInstallmentBreakdown(
          valLiq,
          s.parcelasTotais || 1,
          s.datasParcelas || [],
          s.historicoParc || []
        );
        fiadoPendenteGeral += bd.saldoRestante;
        fiadoPendenteCount++;
        bd.rows.forEach((r) => {
          if (r.status !== 'paga' && r.dataPrevista >= start && r.dataPrevista <= end) {
            parcelasVencendoPeriodo++;
            valorParcelasVencendoPeriodo += r.falta;
          }
        });
      }
    });

    const caixaRecebido = roundCurrency(
      totalPix + totalCartaoLiq + totalDinheiro + fiadoRecebidoNoPeriodo
    );

    const rankingProdutos = Object.values(prodQtyCounts).sort((a, b) => b.qtd - a.qtd);
    const maisVendido = rankingProdutos[0] || null;

    periodSales.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    fiadoReceiptsInPeriod.sort((a, b) => b.dataPago.localeCompare(a.dataPago));

    return {
      totalVendido: roundCurrency(totalVendido),
      caixaRecebido,
      totalPix: roundCurrency(totalPix),
      totalCartaoLiq: roundCurrency(totalCartaoLiq),
      totalCartaoBruto: roundCurrency(totalCartaoBruto),
      totalTaxas: roundCurrency(totalTaxas),
      totalDinheiro: roundCurrency(totalDinheiro),
      totalFiadoVendidoNoPeriodo: roundCurrency(totalFiadoVendidoNoPeriodo),
      fiadoRecebidoNoPeriodo: roundCurrency(fiadoRecebidoNoPeriodo),
      totalDescontos: roundCurrency(totalDescontos),
      custoProdutos: roundCurrency(custoProdutos),
      freteEntregas: roundCurrency(freteEntregas),
      deslocTotal: roundCurrency(deslocTotal),
      lucroTotal: roundCurrency(lucroTotal),
      fiadoPendenteGeral: roundCurrency(fiadoPendenteGeral),
      fiadoPendenteCount,
      parcelasVencendoPeriodo,
      valorParcelasVencendoPeriodo: roundCurrency(valorParcelasVencendoPeriodo),
      rankingProdutos: rankingProdutos.slice(0, 6),
      maisVendido,
      periodSales,
      fiadoReceiptsInPeriod,
    };
  }, [sales, dateStart, dateEnd]);

  // Stock & Online Storefront health summary
  const inventoryStats = useMemo(() => {
    let totalUnits = 0;
    let totalCostValue = 0;
    let totalPixValue = 0;
    products.forEach((p) => {
      if (p.ativo === false) return;
      const qty = Math.max(0, Number(p.estoqueQtd ?? p.estoque ?? p.stock ?? 0) || 0);
      totalUnits += qty;
      const costRec = productCosts[p.id];
      if (costRec) {
        totalCostValue += qty * Number(costRec.custoUnitario || costRec.custoBase || costRec.custo || 0);
      }
      const pix = Number(p.precoPix ?? p.pix ?? p.preco ?? 0) || 0;
      totalPixValue += qty * pix;
    });
    const unpostedOnlineOrders = orders.filter(
      (o) => o.status !== 'cancelado' && !o.lancadoCaixa
    );
    return {
      totalUnits,
      totalCostValue: roundCurrency(totalCostValue),
      totalPixValue: roundCurrency(totalPixValue),
      unpostedOnlineCount: unpostedOnlineOrders.length,
      unpostedOnlineTotal: roundCurrency(
        unpostedOnlineOrders.reduce((sum, o) => sum + Number(o.total || 0), 0)
      ),
    };
  }, [products, productCosts, orders]);

  return (
    <div className="space-y-6">
      {/* Month & Date Range Bar */}
      <div className="bg-white border border-[#E6DFD5] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
              Dashboard Financeiro Mês a Mês
            </h2>
            <p className="text-xs text-[#7A6E65]">
              Faturamento, caixa real recebido (PIX, Dinheiro, Cartão −{BW_CONFIG.TAXA_CARTAO * 100}% e parcelas de Fiado), custos e lucro líquido sem duplicação.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleSelectMonth(shiftMonthISO(selectedMonth, -1))}
              className="p-2 rounded-lg border border-[#E0D9CF] bg-[#FAF8F5] hover:border-[#9A7437]"
              title="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4 text-[#1E1712]" />
            </button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => e.target.value && handleSelectMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#E0D9CF] bg-[#FAF8F5] text-xs font-semibold text-[#1E1712]"
            />
            <button
              type="button"
              onClick={() => handleSelectMonth(shiftMonthISO(selectedMonth, 1))}
              className="p-2 rounded-lg border border-[#E0D9CF] bg-[#FAF8F5] hover:border-[#9A7437]"
              title="Próximo mês"
            >
              <ChevronRight className="w-4 h-4 text-[#1E1712]" />
            </button>
            {selectedMonth !== currentMonth && (
              <button
                type="button"
                onClick={() => handleSelectMonth(currentMonth)}
                className="px-3 py-1.5 rounded-lg bg-[#1E1712] text-white text-xs font-semibold"
              >
                Mês Atual
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-[#F2EDE6]">
          <div>
            <label className="block text-[11px] font-medium text-[#7A6E65] mb-1">Início do Período</label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="px-3 py-1.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#7A6E65] mb-1">Fim do Período</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="px-3 py-1.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-xs"
            />
          </div>
          <span className="text-xs text-[#7A6E65] pb-1.5">
            Exibindo de <strong>{formatDateISOToBR(dateStart)}</strong> até{' '}
            <strong>{formatDateISOToBR(dateEnd)}</strong>
          </span>
        </div>
      </div>

      {/* 6-month Comparison Chart */}
      <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#9A7437]" />
            <h3 className="text-xs uppercase tracking-[0.14em] text-[#7A6E65] font-semibold">
              Evolução Mensal (Clique no mês para abrir)
            </h3>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[#5C5147]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#1E1712]" /> Vendido
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#1F6E43]" /> Caixa Recebido
            </span>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2 sm:gap-4 h-44 items-end">
          {monthlySeries.map((m) => {
            const hVend = Math.max(4, Math.round((m.totalVendido / maxMonthlyVal) * 100));
            const hCaixa = Math.max(4, Math.round((m.caixaRecebido / maxMonthlyVal) * 100));
            const isSelected = m.ym === selectedMonth;
            return (
              <button
                key={m.ym}
                type="button"
                onClick={() => handleSelectMonth(m.ym)}
                className={`flex flex-col items-center justify-end h-full rounded-lg p-1.5 transition-colors ${
                  isSelected ? 'bg-[#FAF8F5] ring-1 ring-[#9A7437]' : 'hover:bg-[#FAF8F5]'
                }`}
              >
                <span className="text-[10px] font-semibold text-[#9A7437] tabular-nums mb-1 truncate max-w-full">
                  {m.totalVendido > 0 ? `R$${Math.round(m.totalVendido)}` : '—'}
                </span>
                <div className="w-full flex items-end justify-center gap-1 h-28">
                  <div
                    style={{ height: `${hVend}%` }}
                    className="w-3.5 sm:w-5 bg-[#1E1712] rounded-t"
                    title={`Vendido: ${formatCurrencyBRL(m.totalVendido)}`}
                  />
                  <div
                    style={{ height: `${hCaixa}%` }}
                    className="w-3.5 sm:w-5 bg-[#1F6E43] rounded-t"
                    title={`Caixa recebido: ${formatCurrencyBRL(m.caixaRecebido)}`}
                  />
                </div>
                <span className="text-[11px] font-medium text-[#1E1712] mt-1.5">{m.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Period Highlight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-[#7A6E65]">Total Vendido no Período</p>
          <p className="text-2xl font-bold text-[#1E1712] tabular-nums mt-1">
            {formatCurrencyBRL(report.totalVendido)}
          </p>
          <p className="text-xs text-[#7A6E65] mt-1 tabular-nums">
            {report.periodSales.length} {report.periodSales.length === 1 ? 'venda' : 'vendas'} · Inclui{' '}
            {formatCurrencyBRL(report.totalFiadoVendidoNoPeriodo)} em Fiado
          </p>
        </div>

        <div className="bg-white border border-[#1F6E43]/30 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-[#1F6E43] font-semibold">
            Caixa Recebido no Período
          </p>
          <p className="text-2xl font-bold text-[#1F6E43] tabular-nums mt-1">
            {formatCurrencyBRL(report.caixaRecebido)}
          </p>
          <p className="text-xs text-[#7A6E65] mt-1 tabular-nums">
            À vista/cartão + {formatCurrencyBRL(report.fiadoRecebidoNoPeriodo)} recebidos de Fiado
          </p>
        </div>

        <div className="bg-white border border-[#9A7437]/40 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-[#9A7437] font-semibold">
            Lucro Líquido Estimado
          </p>
          <p
            className={`text-2xl font-bold tabular-nums mt-1 ${
              report.lucroTotal >= 0 ? 'text-[#1E1712]' : 'text-[#A93226]'
            }`}
          >
            {formatCurrencyBRL(report.lucroTotal)}
          </p>
          <p className="text-[11px] text-[#7A6E65] mt-1 tabular-nums">
            Custos: {formatCurrencyBRL(report.custoProdutos)} · Frete: {formatCurrencyBRL(report.freteEntregas)} · Desloc: {formatCurrencyBRL(report.deslocTotal)}
          </p>
        </div>
      </div>

      {/* Payment & Receivable Breakdown Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-4">
          <p className="text-[11px] text-[#7A6E65] uppercase tracking-wider">Total PIX</p>
          <p className="text-lg font-bold text-[#1E1712] tabular-nums mt-1">
            {formatCurrencyBRL(report.totalPix)}
          </p>
        </div>
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-4">
          <p className="text-[11px] text-[#7A6E65] uppercase tracking-wider">Cartão Líquido</p>
          <p className="text-lg font-bold text-[#1E1712] tabular-nums mt-1">
            {formatCurrencyBRL(report.totalCartaoLiq)}
          </p>
          <p className="text-[11px] text-[#7A6E65] tabular-nums">
            Bruto {formatCurrencyBRL(report.totalCartaoBruto)} · Taxa {formatCurrencyBRL(report.totalTaxas)}
          </p>
        </div>
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-4">
          <p className="text-[11px] text-[#7A6E65] uppercase tracking-wider">Dinheiro</p>
          <p className="text-lg font-bold text-[#1E1712] tabular-nums mt-1">
            {formatCurrencyBRL(report.totalDinheiro)}
          </p>
        </div>
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-4">
          <p className="text-[11px] text-[#7A6E65] uppercase tracking-wider">Descontos Concedidos</p>
          <p className="text-lg font-bold text-[#9A7437] tabular-nums mt-1">
            {formatCurrencyBRL(report.totalDescontos)}
          </p>
        </div>
      </div>

      {/* Fiado Geral + Top Product + Online Orders Notice */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-[#A93226]/30 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#A93226] font-semibold">
              Fiado em Aberto (Geral a Receber)
            </p>
            <p className="text-2xl font-bold text-[#A93226] tabular-nums mt-1">
              {formatCurrencyBRL(report.fiadoPendenteGeral)}
            </p>
            <p className="text-xs text-[#7A6E65] mt-1 tabular-nums">
              {report.fiadoPendenteCount} conta(s) em aberto · {report.parcelasVencendoPeriodo} parcela(s) vencendo no período ({formatCurrencyBRL(report.valorParcelasVencendoPeriodo)})
            </p>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('fiados')}
              className="mt-3 text-left text-xs font-semibold text-[#9A7437] hover:underline"
            >
              Abrir Aba de Fiados →
            </button>
          )}
        </div>

        <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-[#7A6E65] font-semibold">
            Ranking do Período (Unidades Reais)
          </p>
          {report.rankingProdutos.length === 0 ? (
            <p className="text-xs text-[#7A6E65] mt-2">Nenhuma venda registrada no período.</p>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              {report.rankingProdutos.map((item, idx) => (
                <div key={item.nome} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-[#1E1712]">
                    <strong className="text-[#9A7437] mr-1">{idx + 1}.</strong>
                    {item.nome}
                  </span>
                  <span className="font-bold text-[#1E1712] tabular-nums shrink-0">
                    {item.qtd} un
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E6DFD5] rounded-xl p-5 flex flex-col justify-between space-y-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#7A6E65] font-semibold">
              Patrimônio em Estoque & Loja Online
            </p>
            <p className="text-sm font-semibold text-[#1E1712] tabular-nums mt-1.5">
              {inventoryStats.totalUnits} frascos ativos · Valor PIX {formatCurrencyBRL(inventoryStats.totalPixValue)}
            </p>
            {inventoryStats.totalCostValue > 0 && (
              <p className="text-xs text-[#7A6E65] tabular-nums">
                Custo investido estimado: {formatCurrencyBRL(inventoryStats.totalCostValue)}
              </p>
            )}
            <p className="text-xs text-[#5C5147] mt-2">
              Pedidos Online ainda não lançados no Caixa:{' '}
              <strong className="text-[#9A7437]">
                {inventoryStats.unpostedOnlineCount} ({formatCurrencyBRL(inventoryStats.unpostedOnlineTotal)})
              </strong>
            </p>
          </div>
          {inventoryStats.unpostedOnlineCount > 0 && onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('pedidos')}
              className="text-left text-xs font-semibold text-[#9A7437] hover:underline"
            >
              Lançar Pedidos Online no Caixa →
            </button>
          )}
        </div>
      </div>

      {/* Sales & Fiado Receipts Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#1E1712] mb-3">
            Vendas do Período ({report.periodSales.length})
          </h3>
          {report.periodSales.length === 0 ? (
            <p className="text-xs text-[#7A6E65]">Nenhuma venda lançada neste período.</p>
          ) : (
            <div className="divide-y divide-[#F2EDE6] max-h-96 overflow-y-auto pr-1">
              {report.periodSales.map((s) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1E1712] truncate">
                      {s.cliente} · <span className="text-[#7A6E65] font-normal">{formatDateISOToBR(s.data)}</span>
                    </p>
                    <p className="text-[11px] text-[#5C5147] truncate">{s.perfume}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-[#1E1712] tabular-nums">
                      {formatCurrencyBRL(s.valorLiquido ?? s.valor ?? 0)}
                    </p>
                    <p className="text-[11px] text-[#9A7437]">
                      {s.pagamento} · {s.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#1E1712] mb-3">
            Recebimentos de Parcelas de Fiado no Período ({report.fiadoReceiptsInPeriod.length})
          </h3>
          {report.fiadoReceiptsInPeriod.length === 0 ? (
            <p className="text-xs text-[#7A6E65]">Nenhum pagamento de parcela registrado neste intervalo.</p>
          ) : (
            <div className="divide-y divide-[#F2EDE6] max-h-96 overflow-y-auto pr-1">
              {report.fiadoReceiptsInPeriod.map((r, idx) => (
                <div key={`${r.saleId}_${idx}`} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1E1712] truncate">
                      {r.cliente} · Parcela {r.parcela}
                    </p>
                    <p className="text-[11px] text-[#7A6E65] truncate">
                      Pago em {formatDateISOToBR(r.dataPago)} · {r.perfume}
                    </p>
                  </div>
                  <span className="font-bold text-[#1F6E43] tabular-nums shrink-0">
                    +{formatCurrencyBRL(r.valorPago)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

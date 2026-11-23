import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  MessageCircle,
  Pencil,
  RotateCcw,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  buildInstallmentBreakdown,
  formatCurrencyBRL,
  formatDateISOToBR,
  getTodayISO,
  roundCurrency,
} from '../lib/bwMath';
import { cleanDigits, normalizeText } from '../lib/format';
import type { FiadoInstallmentPayment, SaleBw } from '../types';

interface AdminFiadosSectionProps {
  sales: SaleBw[];
  loading: boolean;
  onRefreshSales: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'er' | 'ts') => void;
}

export const AdminFiadosSection: React.FC<AdminFiadosSectionProps> = ({
  sales,
  loading,
  onRefreshSales,
  onToast,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'atrasados' | 'hoje'>('todos');

  // Payment modal state
  const [payModalSale, setPayModalSale] = useState<SaleBw | null>(null);
  const [payAmountInput, setPayAmountInput] = useState('');
  const [payDateInput, setPayDateInput] = useState(getTodayISO());
  const [submittingPay, setSubmittingPay] = useState(false);

  // Edit dates/installments modal state
  const [editModalSale, setEditModalSale] = useState<SaleBw | null>(null);
  const [editParcelasCount, setEditParcelasCount] = useState(1);
  const [editDatas, setEditDatas] = useState<string[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Inline confirmations
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    type: 'quitar' | 'estornar' | 'excluir';
  } | null>(null);

  const pendingSales = useMemo(
    () => sales.filter((s) => s.status === 'Pendente'),
    [sales]
  );

  const today = getTodayISO();

  const summary = useMemo(() => {
    let totalAberto = 0;
    let overdueCount = 0;

    pendingSales.forEach((f) => {
      const vLiquido = Number(f.valorLiquido || f.valor || 0);
      const breakdown = buildInstallmentBreakdown(
        vLiquido,
        f.parcelasTotais || 1,
        f.datasParcelas || [],
        f.historicoParc || []
      );
      totalAberto += breakdown.saldoRestante;
      if (breakdown.rows.some((r) => r.status === 'vencida')) {
        overdueCount++;
      }
    });

    return {
      totalAberto: roundCurrency(totalAberto),
      qtdClientes: pendingSales.length,
      overdueCount,
    };
  }, [pendingSales]);

  const filteredFiados = useMemo(() => {
    const q = normalizeText(search);
    return pendingSales.filter((f) => {
      const matchesText =
        !q ||
        normalizeText(f.cliente).includes(q) ||
        normalizeText(f.perfume).includes(q);
      if (!matchesText) return false;

      if (statusFilter === 'todos') return true;
      const vLiquido = Number(f.valorLiquido || f.valor || 0);
      const breakdown = buildInstallmentBreakdown(
        vLiquido,
        f.parcelasTotais || 1,
        f.datasParcelas || [],
        f.historicoParc || []
      );
      if (statusFilter === 'atrasados') {
        return breakdown.rows.some((r) => r.status === 'vencida');
      }
      if (statusFilter === 'hoje') {
        return breakdown.rows.some(
          (r) => r.status !== 'paga' && r.dataPrevista === today
        );
      }
      return true;
    });
  }, [pendingSales, search, statusFilter, today]);

  const openPayModal = (f: SaleBw) => {
    const vLiquido = Number(f.valorLiquido || f.valor || 0);
    const breakdown = buildInstallmentBreakdown(
      vLiquido,
      f.parcelasTotais || 1,
      f.datasParcelas || [],
      f.historicoParc || []
    );
    if (breakdown.saldoRestante <= 0) {
      onToast('Este fiado já está quitado!', 'ok');
      return;
    }
    const nextRow = breakdown.rows.find((r) => r.status !== 'paga');
    const suggested = nextRow
      ? Math.min(nextRow.falta, breakdown.saldoRestante)
      : breakdown.saldoRestante;

    setPayModalSale(f);
    setPayAmountInput(suggested.toFixed(2));
    setPayDateInput(getTodayISO());
  };

  const handleConfirmPayment = async () => {
    if (!payModalSale) return;
    const rawVal = parseFloat(payAmountInput);
    if (isNaN(rawVal) || rawVal <= 0) {
      onToast('Informe um valor válido maior que zero.', 'er');
      return;
    }

    setSubmittingPay(true);
    try {
      const ref = doc(db, 'vendas_bw', payModalSale.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        onToast('Registro não encontrado.', 'er');
        return;
      }
      const f = snap.data() as SaleBw;
      const vLiquido = Number(f.valorLiquido || f.valor || 0);
      const totais = f.parcelasTotais || 1;
      const historico: FiadoInstallmentPayment[] = [...(f.historicoParc || [])];

      const before = buildInstallmentBreakdown(
        vLiquido,
        totais,
        f.datasParcelas || [],
        historico
      );

      if (before.saldoRestante <= 0) {
        onToast('Este fiado já está quitado!', 'ok');
        setPayModalSale(null);
        return;
      }

      const valorFinal = roundCurrency(Math.min(rawVal, before.saldoRestante));
      const firstOpenRow = before.rows.find((r) => r.status !== 'paga');
      const targetParcela = firstOpenRow ? firstOpenRow.numero : totais;

      historico.push({
        parcela: targetParcela,
        dataPago: payDateInput || getTodayISO(),
        valorPago: valorFinal,
      });

      const after = buildInstallmentBreakdown(
        vLiquido,
        totais,
        f.datasParcelas || [],
        historico
      );

      await updateDoc(ref, {
        parcelasPagas: after.parcelasQuitadas,
        historicoParc: historico,
        status: after.saldoRestante <= 0.009 ? 'Pago' : 'Pendente',
        saldoRestante: after.saldoRestante <= 0.009 ? 0 : after.saldoRestante,
        atualizadoEm: new Date().toISOString(),
      });

      setPayModalSale(null);
      onToast(
        after.saldoRestante <= 0.009
          ? `Fiado quitado! Recebido: ${formatCurrencyBRL(valorFinal)}`
          : `Recebido ${formatCurrencyBRL(valorFinal)} · Falta: ${formatCurrencyBRL(
              after.saldoRestante
            )}`,
        'ok'
      );
      await onRefreshSales();
    } catch (err) {
      onToast(`Erro ao registrar pagamento: ${(err as Error).message}`, 'er');
    } finally {
      setSubmittingPay(false);
    }
  };

  const handleQuitarTotal = async (f: SaleBw) => {
    try {
      const ref = doc(db, 'vendas_bw', f.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const curr = snap.data() as SaleBw;
      const vLiquido = Number(curr.valorLiquido || curr.valor || 0);
      const totais = curr.parcelasTotais || 1;
      const historico: FiadoInstallmentPayment[] = [...(curr.historicoParc || [])];
      const before = buildInstallmentBreakdown(
        vLiquido,
        totais,
        curr.datasParcelas || [],
        historico
      );

      if (before.saldoRestante > 0) {
        const firstOpen = before.rows.find((r) => r.status !== 'paga');
        historico.push({
          parcela: firstOpen ? firstOpen.numero : totais,
          dataPago: getTodayISO(),
          valorPago: before.saldoRestante,
        });
      }

      await updateDoc(ref, {
        parcelasPagas: totais,
        historicoParc: historico,
        status: 'Pago',
        saldoRestante: 0,
        atualizadoEm: new Date().toISOString(),
      });

      setConfirmAction(null);
      onToast('Fiado quitado com sucesso!', 'ok');
      await onRefreshSales();
    } catch (err) {
      onToast(`Erro ao quitar fiado: ${(err as Error).message}`, 'er');
    }
  };

  const handleEstornarUltimo = async (f: SaleBw) => {
    try {
      const ref = doc(db, 'vendas_bw', f.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const curr = snap.data() as SaleBw;
      const historico: FiadoInstallmentPayment[] = [...(curr.historicoParc || [])];
      if (historico.length === 0) {
        setConfirmAction(null);
        onToast('Nenhum pagamento para estornar.', 'er');
        return;
      }
      historico.pop();

      const vLiquido = Number(curr.valorLiquido || curr.valor || 0);
      const totais = curr.parcelasTotais || 1;
      const after = buildInstallmentBreakdown(
        vLiquido,
        totais,
        curr.datasParcelas || [],
        historico
      );

      await updateDoc(ref, {
        status: after.saldoRestante <= 0.009 ? 'Pago' : 'Pendente',
        parcelasPagas: after.parcelasQuitadas,
        historicoParc: historico,
        saldoRestante: after.saldoRestante,
        atualizadoEm: new Date().toISOString(),
      });

      setConfirmAction(null);
      onToast(
        `Último pagamento estornado! Saldo em aberto: ${formatCurrencyBRL(after.saldoRestante)}`,
        'ts'
      );
      await onRefreshSales();
    } catch (err) {
      onToast(`Erro ao estornar: ${(err as Error).message}`, 'er');
    }
  };

  const handleExcluirFiado = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'vendas_bw', id));
      setConfirmAction(null);
      onToast('Fiado excluído do banco de dados.', 'ok');
      await onRefreshSales();
    } catch (err) {
      onToast(`Erro ao excluir fiado: ${(err as Error).message}`, 'er');
    }
  };

  const openEditModal = (f: SaleBw) => {
    const totais = f.parcelasTotais || 1;
    const baseDatas = [...(f.datasParcelas || [])];
    const normalized: string[] = [];
    for (let i = 0; i < totais; i++) {
      if (baseDatas[i]) {
        normalized.push(baseDatas[i]);
      } else {
        const d = new Date();
        d.setMonth(d.getMonth() + i + 1);
        normalized.push(d.toISOString().split('T')[0]);
      }
    }
    setEditModalSale(f);
    setEditParcelasCount(totais);
    setEditDatas(normalized);
  };

  const handleEditCountChange = (count: number) => {
    const clamped = Math.max(1, Math.min(24, count || 1));
    setEditParcelasCount(clamped);
    setEditDatas((prev) => {
      const next: string[] = [];
      for (let i = 0; i < clamped; i++) {
        if (prev[i]) {
          next.push(prev[i]);
        } else {
          const d = new Date();
          d.setMonth(d.getMonth() + i + 1);
          next.push(d.toISOString().split('T')[0]);
        }
      }
      return next;
    });
  };

  const handleSaveEditDates = async () => {
    if (!editModalSale) return;
    for (let i = 0; i < editParcelasCount; i++) {
      if (!editDatas[i]) {
        onToast(`Informe a data da parcela ${i + 1}.`, 'er');
        return;
      }
    }
    setSubmittingEdit(true);
    try {
      const ref = doc(db, 'vendas_bw', editModalSale.id);
      const vLiquido = Number(editModalSale.valorLiquido || editModalSale.valor || 0);
      const breakdown = buildInstallmentBreakdown(
        vLiquido,
        editParcelasCount,
        editDatas.slice(0, editParcelasCount),
        editModalSale.historicoParc || []
      );
      await updateDoc(ref, {
        parcelasTotais: editParcelasCount,
        datasParcelas: editDatas.slice(0, editParcelasCount),
        parcelasPagas: breakdown.parcelasQuitadas,
        status: breakdown.saldoRestante <= 0.009 ? 'Pago' : 'Pendente',
        saldoRestante: breakdown.saldoRestante,
        atualizadoEm: new Date().toISOString(),
      });
      setEditModalSale(null);
      onToast('Parcelas e datas atualizadas!', 'ok');
      await onRefreshSales();
    } catch (err) {
      onToast(`Erro ao atualizar parcelas: ${(err as Error).message}`, 'er');
    } finally {
      setSubmittingEdit(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Resumo Fiados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
          <p className="text-xs text-[#7A6E65] uppercase tracking-wider">Total em Aberto</p>
          <p className="text-2xl font-bold text-[#A93226] tabular-nums mt-1">
            {formatCurrencyBRL(summary.totalAberto)}
          </p>
        </div>
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
          <p className="text-xs text-[#7A6E65] uppercase tracking-wider">Fiados Pendentes</p>
          <p className="text-2xl font-bold text-[#9A7437] tabular-nums mt-1">
            {summary.qtdClientes}
          </p>
        </div>
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-5">
          <p className="text-xs text-[#7A6E65] uppercase tracking-wider">Com Parcela Vencida</p>
          <p className="text-2xl font-bold text-[#D06A00] tabular-nums mt-1">
            {summary.overdueCount}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar fiado por cliente ou perfume..."
          className="px-3.5 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs min-w-[230px]"
        />
        <div className="flex gap-1.5">
          {[
            { id: 'todos', label: 'Todos em aberto' },
            { id: 'atrasados', label: 'Vencidos' },
            { id: 'hoje', label: 'Vencem hoje' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                statusFilter === tab.id
                  ? 'bg-[#1E1712] text-white border-[#1E1712]'
                  : 'bg-white text-[#5C5147] border-[#E0D9CF]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-[#7A6E65]">Carregando fiados...</p>
      ) : filteredFiados.length === 0 ? (
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-10 text-center space-y-1">
          <CheckCircle2 className="w-8 h-8 text-[#1F6E43] mx-auto" />
          <p className="text-sm font-semibold text-[#1F6E43]">
            {pendingSales.length === 0
              ? 'Nenhum fiado pendente!'
              : 'Nenhum fiado encontrado neste filtro.'}
          </p>
          <p className="text-xs text-[#7A6E65]">
            {pendingSales.length === 0 && 'Todos os clientes estão em dia.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredFiados.map((f) => {
            const vLiquido = Number(f.valorLiquido || f.valor || 0);
            const vCliente = Number(f.valorCliente || f.valor || 0);
            const isCartao = f.pagamento === 'Cartão';
            const taxa = isCartao ? roundCurrency(vCliente - vLiquido) : 0;
            const historico = f.historicoParc || [];
            const breakdown = buildInstallmentBreakdown(
              vLiquido,
              f.parcelasTotais || 1,
              f.datasParcelas || [],
              historico
            );

            const cleanPhone = cleanDigits(f.contato);
            const nextDue = breakdown.rows.find((r) => r.status !== 'paga');
            const reminderMsg = `Olá ${f.cliente}! Tudo bem? Passando para lembrar da parcela ${
              nextDue ? `${nextDue.numero}/${f.parcelasTotais || 1}` : ''
            } referente à sua compra na *BW Parfum Imports* (${f.perfume}). Saldo em aberto: *${formatCurrencyBRL(
              breakdown.saldoRestante
            )}*${
              nextDue?.dataPrevista
                ? ` · Vencimento: ${formatDateISOToBR(nextDue.dataPrevista)}`
                : ''
            }.`;

            return (
              <div
                key={f.id}
                className="bg-white border border-[#E6DFD5] rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-[#F2EDE6]">
                  <div>
                    <h3 className="text-base font-semibold text-[#1E1712]">{f.cliente}</h3>
                    <p className="text-xs text-[#5C5147] mt-0.5">{f.perfume}</p>
                    <p className="text-[11px] text-[#7A6E65] mt-1">
                      Venda em {formatDateISOToBR(f.data)}
                      {f.contato ? ` · ${f.contato}` : ''}
                      {f.endereco ? ` · ${f.endereco}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[#5C5147] block tabular-nums">
                      Total: <strong>{formatCurrencyBRL(vCliente)}</strong>
                    </span>
                    {isCartao && taxa > 0 && (
                      <span className="text-[11px] text-[#A93226] block tabular-nums">
                        Taxa cartão: -{formatCurrencyBRL(taxa)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between text-[11px] text-[#7A6E65] mb-1">
                    <span>Progresso do pagamento</span>
                    <span className="font-bold text-[#9A7437] tabular-nums">
                      {breakdown.porcentagem}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#F2EDE6] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${breakdown.porcentagem}%` }}
                      className={`h-full transition-all ${
                        breakdown.porcentagem >= 100
                          ? 'bg-[#1F6E43]'
                          : breakdown.porcentagem >= 50
                            ? 'bg-[#9A7437]'
                            : 'bg-[#A93226]'
                      }`}
                    />
                  </div>
                </div>

                {/* Saldo Box */}
                <div
                  className={`rounded-xl p-3.5 flex items-center justify-between border ${
                    breakdown.saldoRestante <= 0
                      ? 'bg-[#E8F5EE] border-[#A8D5B8]'
                      : 'bg-[#FDF0EE] border-[#F0B8B3]'
                  }`}
                >
                  <div>
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider block ${
                        breakdown.saldoRestante <= 0 ? 'text-[#1F6E43]' : 'text-[#A93226]'
                      }`}
                    >
                      {breakdown.saldoRestante <= 0 ? 'Quitado' : 'Em Aberto'}
                    </span>
                    <span className="text-xs text-[#5C5147] tabular-nums">
                      Pago: {formatCurrencyBRL(breakdown.totalPago)}
                    </span>
                  </div>
                  <span
                    className={`text-xl font-bold tabular-nums ${
                      breakdown.saldoRestante <= 0 ? 'text-[#1F6E43]' : 'text-[#A93226]'
                    }`}
                  >
                    {formatCurrencyBRL(breakdown.saldoRestante)}
                  </span>
                </div>

                {/* Parcelas */}
                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-[#7A6E65]">
                    Parcelas ({breakdown.parcelasQuitadas}/{f.parcelasTotais || 1} pagas)
                  </p>
                  {breakdown.rows.map((r) => (
                    <div
                      key={r.numero}
                      className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 border-l-4 ${
                        r.status === 'paga'
                          ? 'bg-[#E8F5EE] border-[#1F6E43]'
                          : r.status === 'parcial'
                            ? 'bg-[#FFF3E0] border-[#D06A00]'
                            : r.status === 'vencida'
                              ? 'bg-[#FDF0EE] border-[#A93226]'
                              : 'bg-[#FAF8F5] border-[#D0C8BC]'
                      }`}
                    >
                      <span className="font-semibold text-[#1E1712]">
                        Parcela {r.numero}/{f.parcelasTotais || 1} · {formatCurrencyBRL(r.valorParcela)}
                      </span>
                      <span className="text-[#5C5147] tabular-nums">
                        Venc: {formatDateISOToBR(r.dataPrevista)}
                      </span>
                      <span className="font-bold tabular-nums text-right">
                        {r.status === 'paga' ? (
                          <span className="text-[#1F6E43]">
                            Pago {r.dataPagamento ? `(${formatDateISOToBR(r.dataPagamento)})` : ''}
                          </span>
                        ) : r.status === 'parcial' ? (
                          <span className="text-[#D06A00]">
                            Pago {formatCurrencyBRL(r.valorPago)} · Falta {formatCurrencyBRL(r.falta)}
                          </span>
                        ) : r.status === 'vencida' ? (
                          <span className="text-[#A93226]">Vencida</span>
                        ) : (
                          <span className="text-[#7A6E65]">Pendente</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Histórico Recebimentos */}
                {historico.length > 0 && (
                  <div className="bg-[#E8F5EE]/70 border border-[#A8D5B8] rounded-xl p-3 space-y-1">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-[#1F6E43]">
                      Recebimentos Registrados
                    </p>
                    {historico.map((h, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-xs text-[#1E1712] py-0.5 border-b border-[#A8D5B8]/40 last:border-0"
                      >
                        <span>
                          #{idx + 1} · Parcela {h.parcela} · {formatDateISOToBR(h.dataPago)}
                        </span>
                        <span className="font-bold text-[#1F6E43] tabular-nums">
                          + {formatCurrencyBRL(h.valorPago)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Botões */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openPayModal(f)}
                    className="px-3.5 py-2 rounded-lg bg-[#1F6E43] text-white text-xs font-semibold hover:bg-[#175533] inline-flex items-center gap-1.5"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Pagar Parcela
                  </button>

                  {confirmAction?.id === f.id && confirmAction.type === 'quitar' ? (
                    <div className="inline-flex items-center gap-1.5 bg-[#FFFBF0] border border-[#9A7437]/40 rounded-lg px-2.5 py-1">
                      <button
                        type="button"
                        onClick={() => handleQuitarTotal(f)}
                        className="px-2 py-1 rounded bg-[#9A7437] text-white text-xs font-semibold"
                      >
                        Confirmar Quitação
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction(null)}
                        className="px-2 py-1 text-xs text-[#5C5147]"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ id: f.id, type: 'quitar' })}
                      className="px-3.5 py-2 rounded-lg border border-[#9A7437]/40 bg-[#FFFBF0] text-[#9A7437] text-xs font-semibold hover:bg-[#9A7437]/10 inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Quitar Tudo
                    </button>
                  )}

                  {historico.length > 0 &&
                    (confirmAction?.id === f.id && confirmAction.type === 'estornar' ? (
                      <div className="inline-flex items-center gap-1.5 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg px-2.5 py-1">
                        <button
                          type="button"
                          onClick={() => handleEstornarUltimo(f)}
                          className="px-2 py-1 rounded bg-[#6B3FA0] text-white text-xs font-semibold"
                        >
                          Estornar último
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmAction(null)}
                          className="px-2 py-1 text-xs text-[#5C5147]"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ id: f.id, type: 'estornar' })}
                        className="px-3 py-2 rounded-lg border border-[#6B3FA0]/30 text-[#6B3FA0] text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Estornar Último
                      </button>
                    ))}

                  <button
                    type="button"
                    onClick={() => openEditModal(f)}
                    className="px-3 py-2 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#5C5147] hover:border-[#9A7437] inline-flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar Datas
                  </button>

                  {confirmAction?.id === f.id && confirmAction.type === 'excluir' ? (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleExcluirFiado(f.id)}
                        className="px-2.5 py-2 rounded-lg bg-[#A93226] text-white text-xs font-semibold"
                      >
                        Confirmar Exclusão
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction(null)}
                        className="px-2 py-2 rounded-lg border border-[#E0D9CF] text-xs text-[#5C5147]"
                      >
                        Voltar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ id: f.id, type: 'excluir' })}
                      className="px-3 py-2 rounded-lg border border-[#A93226]/30 text-[#A93226] text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </button>
                  )}

                  {cleanPhone && (
                    <a
                      href={`https://wa.me/${
                        cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`
                      }?text=${encodeURIComponent(reminderMsg)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto px-3 py-2 rounded-lg border border-[#1F6E43]/30 text-[#1F6E43] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#E8F5EE]"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Cobrar WhatsApp
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Registrar Pagamento */}
      {payModalSale && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E6DFD5] rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#F2EDE6] pb-3">
              <h3 className="font-display text-xl font-semibold text-[#1E1712]">
                Registrar Pagamento
              </h3>
              <button
                type="button"
                onClick={() => setPayModalSale(null)}
                className="p-1 text-[#7A6E65]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#5C5147]">
              <strong>{payModalSale.cliente}</strong> · {payModalSale.perfume}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#5C5147] mb-1">
                  Valor Recebido (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={payAmountInput}
                  onChange={(e) => setPayAmountInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-base font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5C5147] mb-1">
                  Data do Recebimento
                </label>
                <input
                  type="date"
                  value={payDateInput}
                  onChange={(e) => setPayDateInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-xs"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayModalSale(null)}
                className="flex-1 py-2.5 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#5C5147]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submittingPay}
                onClick={handleConfirmPayment}
                className="flex-1 py-2.5 rounded-lg bg-[#1F6E43] text-white text-xs font-semibold hover:bg-[#175533] disabled:opacity-50"
              >
                {submittingPay ? 'Salvando...' : 'Confirmar Recebimento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Parcelas & Datas */}
      {editModalSale && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E6DFD5] rounded-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F2EDE6] pb-3">
              <h3 className="font-display text-xl font-semibold text-[#1E1712]">
                Editar Fiado
              </h3>
              <button
                type="button"
                onClick={() => setEditModalSale(null)}
                className="p-1 text-[#7A6E65]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#5C5147]">
              <strong>{editModalSale.cliente}</strong> · {editModalSale.perfume}
            </p>
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Número de Parcelas
              </label>
              <input
                type="number"
                min={1}
                max={24}
                value={editParcelasCount}
                onChange={(e) => handleEditCountChange(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
            <div className="space-y-2.5">
              {editDatas.slice(0, editParcelasCount).map((dt, idx) => (
                <div key={idx}>
                  <label className="block text-[11px] font-medium text-[#7A6E65] mb-1">
                    Vencimento Parcela {idx + 1}/{editParcelasCount}
                  </label>
                  <input
                    type="date"
                    value={dt}
                    onChange={(e) => {
                      const next = [...editDatas];
                      next[idx] = e.target.value;
                      setEditDatas(next);
                    }}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-xs"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditModalSale(null)}
                className="flex-1 py-2.5 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#5C5147]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submittingEdit}
                onClick={handleSaveEditDates}
                className="flex-1 py-2.5 rounded-lg bg-[#1E1712] text-white text-xs font-semibold hover:bg-[#9A7437] disabled:opacity-50"
              >
                {submittingEdit ? 'Salvando...' : 'Salvar Parcelas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

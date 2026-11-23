import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  calculatePaymentNet,
  formatCurrencyBRL,
  formatDateISOToBR,
  getTodayISO,
  roundCurrency,
} from '../lib/bwMath';
import { normalizeText } from '../lib/format';
import type { SaleBw, SalePaymentMethod } from '../types';

interface AdminHistoricoBwSectionProps {
  sales: SaleBw[];
  loading: boolean;
  onRefreshSales: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'er' | 'ts') => void;
}

export const AdminHistoricoBwSection: React.FC<AdminHistoricoBwSectionProps> = ({
  sales,
  loading,
  onRefreshSales,
  onToast,
}) => {
  const [search, setSearch] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'todos' | SalePaymentMethod>('todos');

  // Inline 2-step confirmation
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    type: 'voltar' | 'excluir';
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Edit modal
  const [editingSale, setEditingSale] = useState<SaleBw | null>(null);
  const [editData, setEditData] = useState('');
  const [editCliente, setEditCliente] = useState('');
  const [editContato, setEditContato] = useState('');
  const [editEndereco, setEditEndereco] = useState('');
  const [editPerfume, setEditPerfume] = useState('');
  const [editValorCliente, setEditValorCliente] = useState('');
  const [editPagamento, setEditPagamento] = useState<SalePaymentMethod>('PIX');
  const [savingEdit, setSavingEdit] = useState(false);

  const paidSales = useMemo(() => {
    return sales
      .filter((s) => s.status === 'Pago')
      .sort((a, b) => {
        const cmp = (b.data || '').localeCompare(a.data || '');
        if (cmp !== 0) return cmp;
        return (b.criadoEm || '').localeCompare(a.criadoEm || '');
      });
  }, [sales]);

  const filteredSales = useMemo(() => {
    const q = normalizeText(search);
    return paidSales.filter((s) => {
      const matchText =
        !q ||
        normalizeText(s.cliente).includes(q) ||
        normalizeText(s.perfume).includes(q) ||
        normalizeText(s.contato).includes(q);
      const matchPay = paymentFilter === 'todos' || s.pagamento === paymentFilter;
      const matchStart = !dateStart || (s.data || '') >= dateStart;
      const matchEnd = !dateEnd || (s.data || '') <= dateEnd;
      return matchText && matchPay && matchStart && matchEnd;
    });
  }, [paidSales, search, paymentFilter, dateStart, dateEnd]);

  const summary = useMemo(() => {
    let totalLiquido = 0;
    let totalBruto = 0;
    let totalTaxas = 0;
    let totalLucro = 0;
    filteredSales.forEach((s) => {
      totalLiquido += Number(s.valorLiquido ?? s.valor ?? 0);
      totalBruto += Number(s.valorCliente ?? s.valorLiquido ?? s.valor ?? 0);
      totalTaxas += Number(s.taxaCartaoReais || 0);
      totalLucro += Number(s.lucroEstimado || 0);
    });
    return {
      count: filteredSales.length,
      totalLiquido: roundCurrency(totalLiquido),
      totalBruto: roundCurrency(totalBruto),
      totalTaxas: roundCurrency(totalTaxas),
      totalLucro: roundCurrency(totalLucro),
    };
  }, [filteredSales]);

  const openEditModal = (s: SaleBw) => {
    setEditingSale(s);
    setEditData(s.data || getTodayISO());
    setEditCliente(s.cliente || '');
    setEditContato(s.contato || '');
    setEditEndereco(s.endereco || '');
    setEditPerfume(s.perfume || '');
    setEditValorCliente(String(roundCurrency(s.valorCliente ?? s.valorLiquido ?? s.valor ?? 0)));
    setEditPagamento(s.pagamento || 'PIX');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;
    if (!editCliente.trim() || !editPerfume.trim()) {
      onToast('Informe o nome do cliente e do perfume.', 'er');
      return;
    }
    const valBruto = roundCurrency(parseFloat(editValorCliente) || 0);
    if (valBruto <= 0) {
      onToast('Informe um valor válido maior que zero.', 'er');
      return;
    }

    setSavingEdit(true);
    try {
      const { taxaPerc, taxaReais, valorLiquido } = calculatePaymentNet(valBruto, editPagamento);
      const custo = Number(editingSale.custoTotal || 0);
      const frete = editingSale.retirada ? 0 : Number(editingSale.freteTotal || 0);
      const desloc = Number(editingSale.deslocTotal || 0);
      const lucroEstimado = roundCurrency(valorLiquido - custo - frete - desloc);

      await updateDoc(doc(db, 'vendas_bw', editingSale.id), {
        data: editData || getTodayISO(),
        cliente: editCliente.trim().slice(0, 160),
        contato: editContato.trim().slice(0, 40),
        endereco: editEndereco.trim().slice(0, 300),
        perfume: editPerfume.trim().slice(0, 1000),
        valorCliente: valBruto,
        valorLiquido,
        valor: valorLiquido,
        taxaCartaoPerc: taxaPerc,
        taxaCartaoReais: taxaReais,
        pagamento: editPagamento,
        lucroEstimado,
        atualizadoEm: new Date().toISOString(),
      });

      setEditingSale(null);
      onToast('Venda atualizada com sucesso!', 'ok');
      await onRefreshSales();
    } catch (err) {
      onToast(`Erro ao atualizar venda: ${(err as Error).message}`, 'er');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRevertToFiado = async (s: SaleBw) => {
    setBusyId(s.id);
    try {
      const baseValor = roundCurrency(s.valorCliente || s.valorLiquido || s.valor || 0);
      const custo = Number(s.custoTotal || 0);
      const frete = s.retirada ? 0 : Number(s.freteTotal || 0);
      const desloc = Number(s.deslocTotal || 0);
      const lucroEstimado = roundCurrency(baseValor - custo - frete - desloc);
      const parcelasTotais = Math.max(1, s.parcelasTotais || 1);
      const datasParcelas =
        Array.isArray(s.datasParcelas) && s.datasParcelas.length === parcelasTotais
          ? s.datasParcelas
          : [s.data || getTodayISO()];

      await updateDoc(doc(db, 'vendas_bw', s.id), {
        status: 'Pendente',
        pagamento: 'Fiado',
        taxaCartaoPerc: 0,
        taxaCartaoReais: 0,
        valorCliente: baseValor,
        valorLiquido: baseValor,
        valor: baseValor,
        parcelasTotais,
        parcelasPagas: 0,
        datasParcelas,
        historicoParc: [],
        saldoRestante: baseValor,
        lucroEstimado,
        atualizadoEm: new Date().toISOString(),
      });
      setConfirmAction(null);
      onToast('Venda movida de volta para Fiados pendentes.', 'ok');
      await onRefreshSales();
    } catch (err) {
      onToast(`Erro ao reverter venda: ${(err as Error).message}`, 'er');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteSale = async (id: string) => {
    setBusyId(id);
    try {
      await deleteDoc(doc(db, 'vendas_bw', id));
      setConfirmAction(null);
      onToast('Venda excluída do histórico.', 'ok');
      await onRefreshSales();
    } catch (err) {
      onToast(`Erro ao excluir venda: ${(err as Error).message}`, 'er');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white border border-[#E6DFD5] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
              Histórico de Vendas Concluídas
            </h2>
            <p className="text-xs text-[#7A6E65]">
              Consulte, filtre, edite valores ou estorne vendas já liquidadas do PDV e da loja.
            </p>
          </div>
          {(search || dateStart || dateEnd || paymentFilter !== 'todos') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setDateStart('');
                setDateEnd('');
                setPaymentFilter('todos');
              }}
              className="px-3 py-1.5 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#5C5147] hover:border-[#9A7437]"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#7A6E65] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente, perfume ou contato..."
              className="w-full pl-8 pr-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-xs"
            />
          </div>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as 'todos' | SalePaymentMethod)}
            className="px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-xs"
          >
            <option value="todos">Todas as formas</option>
            <option value="PIX">PIX</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Cartão">Cartão</option>
            <option value="Fiado">Fiado Quitado</option>
          </select>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            aria-label="Data inicial"
            className="px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-xs"
          />
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            aria-label="Data final"
            className="px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-xs"
          />
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-4">
          <p className="text-[11px] text-[#7A6E65] uppercase tracking-wider">Vendas no filtro</p>
          <p className="text-xl font-bold text-[#1E1712] tabular-nums mt-0.5">{summary.count}</p>
        </div>
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-4">
          <p className="text-[11px] text-[#7A6E65] uppercase tracking-wider">Total Líquido</p>
          <p className="text-xl font-bold text-[#1E1712] tabular-nums mt-0.5">
            {formatCurrencyBRL(summary.totalLiquido)}
          </p>
          {summary.totalTaxas > 0 && (
            <p className="text-[11px] text-[#7A6E65] tabular-nums">
              Bruto {formatCurrencyBRL(summary.totalBruto)} · Taxa {formatCurrencyBRL(summary.totalTaxas)}
            </p>
          )}
        </div>
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-4">
          <p className="text-[11px] text-[#7A6E65] uppercase tracking-wider">Lucro Estimado</p>
          <p
            className={`text-xl font-bold tabular-nums mt-0.5 ${
              summary.totalLucro >= 0 ? 'text-[#1F6E43]' : 'text-[#A93226]'
            }`}
          >
            {formatCurrencyBRL(summary.totalLucro)}
          </p>
        </div>
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-4">
          <p className="text-[11px] text-[#7A6E65] uppercase tracking-wider">Ticket Médio</p>
          <p className="text-xl font-bold text-[#9A7437] tabular-nums mt-0.5">
            {formatCurrencyBRL(summary.count > 0 ? summary.totalLiquido / summary.count : 0)}
          </p>
        </div>
      </div>

      {/* Sales List */}
      {loading ? (
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-8 text-center text-xs text-[#7A6E65]">
          Carregando histórico de vendas...
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="bg-white border border-[#E6DFD5] rounded-xl p-10 text-center text-xs text-[#7A6E65]">
          Nenhuma venda paga encontrada para os filtros selecionados.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSales.map((s) => {
            const isConfirmVoltar = confirmAction?.id === s.id && confirmAction.type === 'voltar';
            const isConfirmExcluir = confirmAction?.id === s.id && confirmAction.type === 'excluir';
            const valorLiquido = roundCurrency(s.valorLiquido ?? s.valor ?? 0);
            const valorCliente = roundCurrency(s.valorCliente ?? valorLiquido);
            const lucro = roundCurrency(s.lucroEstimado || 0);

            return (
              <div
                key={s.id}
                className="bg-white border border-[#E6DFD5] rounded-xl p-4 sm:p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#1E1712]">{s.cliente}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-[#FAF8F5] border border-[#E6DFD5] text-[#5C5147] tabular-nums">
                        {formatDateISOToBR(s.data)}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-[#1E1712] text-white font-semibold">
                        {s.pagamento}
                      </span>
                      {s.retirada && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-[#9A7437]/10 text-[#9A7437] font-semibold">
                          Retirada
                        </span>
                      )}
                      {s.origemPedidoId && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-[#1F6E43]/10 text-[#1F6E43] font-semibold">
                          Loja Online
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-[#4A3F30]">{s.perfume}</p>
                    {(s.contato || s.endereco) && (
                      <p className="text-[11px] text-[#7A6E65]">
                        {[s.contato, s.endereco].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-[#1E1712] tabular-nums">
                      {formatCurrencyBRL(valorLiquido)}
                    </p>
                    {s.pagamento === 'Cartão' && (s.taxaCartaoReais || 0) > 0 && (
                      <p className="text-[11px] text-[#7A6E65] tabular-nums">
                        Cliente {formatCurrencyBRL(valorCliente)} (−{formatCurrencyBRL(s.taxaCartaoReais)} taxa)
                      </p>
                    )}
                    {(s.desconto || 0) > 0 && (
                      <p className="text-[11px] text-[#9A7437] tabular-nums">
                        Desconto aplicado: {formatCurrencyBRL(s.desconto)}
                      </p>
                    )}
                    <p
                      className={`text-xs font-semibold tabular-nums mt-0.5 ${
                        lucro >= 0 ? 'text-[#1F6E43]' : 'text-[#A93226]'
                      }`}
                    >
                      Lucro: {formatCurrencyBRL(lucro)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F2EDE6]">
                  <button
                    type="button"
                    onClick={() => openEditModal(s)}
                    className="px-3 py-1.5 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#1E1712] hover:border-[#9A7437] inline-flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>

                  {isConfirmVoltar ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => handleRevertToFiado(s)}
                        className="px-3 py-1.5 rounded-lg bg-[#9A7437] text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {busyId === s.id ? 'Movendo...' : 'Confirmar p/ Fiado'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction(null)}
                        className="px-2.5 py-1.5 rounded-lg border border-[#E0D9CF] text-xs text-[#5C5147]"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ id: s.id, type: 'voltar' })}
                      className="px-3 py-1.5 rounded-lg border border-[#9A7437]/40 text-xs font-semibold text-[#9A7437] hover:bg-[#9A7437]/5 inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Voltar p/ Fiado
                    </button>
                  )}

                  {isConfirmExcluir ? (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => handleDeleteSale(s.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#A93226] text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {busyId === s.id ? 'Excluindo...' : 'Confirmar Exclusão'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction(null)}
                        className="px-2.5 py-1.5 rounded-lg border border-[#E0D9CF] text-xs text-[#5C5147]"
                      >
                        Voltar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ id: s.id, type: 'excluir' })}
                      className="ml-auto px-3 py-1.5 rounded-lg border border-[#A93226]/30 text-xs font-semibold text-[#A93226] hover:bg-[#A93226]/5 inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingSale && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border border-[#E6DFD5] rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#F2EDE6] pb-3">
              <div>
                <h3 className="font-display text-2xl font-semibold text-[#1E1712]">Editar Venda</h3>
                <p className="text-xs text-[#7A6E65]">
                  Recalcula taxa de cartão (12%), valor líquido e lucro estimado automaticamente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="p-1.5 rounded-lg hover:bg-[#FAF8F5] text-[#7A6E65]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#5C5147] mb-1">Data *</label>
                <input
                  type="date"
                  required
                  value={editData}
                  onChange={(e) => setEditData(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5C5147] mb-1">Pagamento *</label>
                <select
                  value={editPagamento}
                  onChange={(e) => setEditPagamento(e.target.value as SalePaymentMethod)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                >
                  <option value="PIX">PIX</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão">Cartão (-12%)</option>
                  <option value="Fiado">Fiado</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">Cliente *</label>
              <input
                type="text"
                required
                value={editCliente}
                onChange={(e) => setEditCliente(e.target.value)}
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#5C5147] mb-1">Contato / WhatsApp</label>
                <input
                  type="text"
                  value={editContato}
                  onChange={(e) => setEditContato(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5C5147] mb-1">
                  Valor Pago pelo Cliente (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editValorCliente}
                  onChange={(e) => setEditValorCliente(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">Endereço</label>
              <input
                type="text"
                value={editEndereco}
                onChange={(e) => setEditEndereco(e.target.value)}
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">Perfumes / Resumo *</label>
              <textarea
                rows={2}
                required
                value={editPerfume}
                onChange={(e) => setEditPerfume(e.target.value)}
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm resize-none"
              />
            </div>

            <div className="bg-[#FAF8F5] border border-[#E6DFD5] rounded-lg p-3 text-xs flex flex-wrap justify-between gap-2">
              <span className="text-[#5C5147]">Líquido calculado:</span>
              <span className="font-bold text-[#1E1712] tabular-nums">
                {formatCurrencyBRL(
                  calculatePaymentNet(parseFloat(editValorCliente) || 0, editPagamento).valorLiquido
                )}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="px-4 py-2 rounded-lg border border-[#E0D9CF] text-xs font-medium text-[#5C5147]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-4 py-2 rounded-lg bg-[#1E1712] text-white text-xs font-semibold hover:bg-[#9A7437] inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

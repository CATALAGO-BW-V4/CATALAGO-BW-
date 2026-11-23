import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  MessageCircle,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  BW_CONFIG,
  calculateDiscountedTotal,
  calculatePaymentNet,
  formatCurrencyBRL,
  formatDateISOToBR,
  getTodayISO,
  roundCurrency,
} from '../lib/bwMath';
import { cleanDigits, extractEstoque, extractNome, extractPreco, extractPrecoPix, normalizeText } from '../lib/format';
import type {
  ClientBw,
  Product,
  ProductCost,
  SaleBw,
  SaleCartItem,
  SalePaymentMethod,
} from '../types';

interface AdminPdvSectionProps {
  products: Product[];
  productCosts: Record<string, ProductCost>;
  clientsBw: ClientBw[];
  prefillProductId?: string | null;
  prefillClient?: ClientBw | null;
  onClearPrefill?: () => void;
  onRefreshStore: () => Promise<void>;
  onRefreshSales: () => Promise<void>;
  onRefreshClientsBw: () => Promise<void>;
  onToast: (msg: string, type?: 'ok' | 'er' | 'ts') => void;
}

export const AdminPdvSection: React.FC<AdminPdvSectionProps> = ({
  products,
  productCosts,
  clientsBw,
  prefillProductId,
  prefillClient,
  onClearPrefill,
  onRefreshStore,
  onRefreshSales,
  onRefreshClientsBw,
  onToast,
}) => {
  const [dataVenda, setDataVenda] = useState(getTodayISO());
  const [clienteNome, setClienteNome] = useState('');
  const [contato, setContato] = useState('');
  const [endereco, setEndereco] = useState('');
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);

  const [pagamento, setPagamento] = useState<SalePaymentMethod>('PIX');
  const [retirada, setRetirada] = useState(false);
  const [parcelas, setParcelas] = useState(1);
  const [datasParcelas, setDatasParcelas] = useState<string[]>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return [d.toISOString().split('T')[0]];
  });

  // Item selector state
  const [perfumeQuery, setPerfumeQuery] = useState('');
  const [selectedProdId, setSelectedProdId] = useState<string | null>(null);
  const [showProdSuggestions, setShowProdSuggestions] = useState(false);
  const [qtdItem, setQtdItem] = useState(1);
  const [valorUnitInput, setValorUnitInput] = useState('');

  const [cart, setCart] = useState<SaleCartItem[]>([]);
  const [descTipo, setDescTipo] = useState<'reais' | 'porcento'>('reais');
  const [descValor, setDescValor] = useState('');
  const [saving, setSaving] = useState(false);

  // Client update prompt if client exists with different phone/address
  const [clientUpdatePrompt, setClientUpdatePrompt] = useState<{
    clientId: string;
    nome: string;
    oldContato: string;
    newContato: string;
    oldEndereco: string;
    newEndereco: string;
  } | null>(null);

  // Post-sale WhatsApp modal
  const [completedSaleModal, setCompletedSaleModal] = useState<{
    perfumes: string;
    valorCliente: number;
    lucroEstimado: number;
    contato: string;
    msgWhats: string;
  } | null>(null);

  const getProductPriceForMethod = (p: Product, method: SalePaymentMethod): number => {
    const precoCartao = extractPreco(p);
    const precoPix = extractPrecoPix(p);
    if (method === 'Cartão') {
      return precoCartao > 0 ? precoCartao : precoPix;
    }
    return precoPix > 0 ? precoPix : precoCartao;
  };

  // Handle prefill product from Estoque
  useEffect(() => {
    if (!prefillProductId) return;
    const p = products.find((x) => x.id === prefillProductId);
    if (p) {
      setSelectedProdId(p.id);
      setPerfumeQuery(extractNome(p));
      const price = getProductPriceForMethod(p, pagamento);
      setValorUnitInput(price > 0 ? price.toFixed(2) : '');
      const est = extractEstoque(p);
      if (est === 0) onToast(`"${extractNome(p)}" está esgotado!`, 'er');
    }
    onClearPrefill?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillProductId]);

  // Handle prefill client from Clientes tab
  useEffect(() => {
    if (!prefillClient) return;
    setClienteNome(prefillClient.nome || '');
    setContato(prefillClient.contato || '');
    setEndereco(prefillClient.endereco || '');
    onClearPrefill?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillClient]);

  // Keep datasParcelas array synced with parcelas count
  const handleChangeParcelas = (n: number) => {
    const clamped = Math.max(1, Math.min(24, n || 1));
    setParcelas(clamped);
    setDatasParcelas((prev) => {
      const next: string[] = [];
      for (let i = 0; i < clamped; i++) {
        if (prev[i]) {
          next.push(prev[i]);
        } else {
          const d = new Date();
          d.setMonth(d.getMonth() + (i + 1));
          next.push(d.toISOString().split('T')[0]);
        }
      }
      return next;
    });
  };

  // Switch payment method -> update selected product input AND recalculate catalog cart items
  const handleChangePagamento = (nextMethod: SalePaymentMethod) => {
    setPagamento(nextMethod);

    if (selectedProdId) {
      const p = products.find((x) => x.id === selectedProdId);
      if (p) {
        const price = getProductPriceForMethod(p, nextMethod);
        setValorUnitInput(price > 0 ? price.toFixed(2) : '');
      }
    }

    if (cart.length > 0) {
      setCart((prev) =>
        prev.map((item) => {
          const p = products.find((x) => x.id === item.idProd);
          if (!p) return item;
          const nextPrice = roundCurrency(getProductPriceForMethod(p, nextMethod));
          if (nextPrice <= 0) return item;
          return {
            ...item,
            valorUnit: nextPrice,
            valorTotal: roundCurrency(nextPrice * item.qtd),
          };
        })
      );
      onToast(
        nextMethod === 'Cartão'
          ? 'Preços dos itens ajustados para tabela Cartão.'
          : 'Preços dos itens ajustados para tabela PIX / À Vista.',
        'ts'
      );
    }
  };

  const matchingClients = useMemo(() => {
    const q = normalizeText(clienteNome);
    if (!q) return clientsBw.slice(0, 6);
    return clientsBw.filter((c) => normalizeText(c.nome).includes(q)).slice(0, 8);
  }, [clientsBw, clienteNome]);

  const matchingProducts = useMemo(() => {
    const q = normalizeText(perfumeQuery);
    const list = q
      ? products.filter(
          (p) =>
            normalizeText(extractNome(p)).includes(q) ||
            normalizeText(p.marca || '').includes(q)
        )
      : products;
    return list.slice(0, 12);
  }, [products, perfumeQuery]);

  const handleSelectProduct = (p: Product) => {
    setSelectedProdId(p.id);
    setPerfumeQuery(extractNome(p));
    setShowProdSuggestions(false);
    const price = getProductPriceForMethod(p, pagamento);
    setValorUnitInput(price > 0 ? price.toFixed(2) : '');
    const est = extractEstoque(p);
    if (est === 0) {
      onToast(`"${extractNome(p)}" está esgotado no estoque.`, 'er');
    } else if (est <= BW_CONFIG.ESTOQUE_CRITICO) {
      onToast(`Atenção: apenas ${est} unidade(s) em estoque.`, 'ts');
    }
  };

  const handlePerfumeInputChange = (val: string) => {
    setPerfumeQuery(val);
    setShowProdSuggestions(true);
    const norm = normalizeText(val);
    if (!norm) {
      setSelectedProdId(null);
      setValorUnitInput('');
      return;
    }
    const exact = products.find((p) => normalizeText(extractNome(p)) === norm);
    if (exact) {
      setSelectedProdId(exact.id);
      const price = getProductPriceForMethod(exact, pagamento);
      setValorUnitInput(price > 0 ? price.toFixed(2) : '');
    } else {
      setSelectedProdId(null);
    }
  };

  const handleAddItem = () => {
    let targetProd = selectedProdId ? products.find((p) => p.id === selectedProdId) : undefined;
    if (!targetProd && perfumeQuery.trim()) {
      const q = normalizeText(perfumeQuery);
      targetProd = products.find((p) => normalizeText(extractNome(p)).includes(q));
    }
    if (!targetProd) {
      onToast('Selecione um perfume válido do estoque.', 'er');
      return;
    }

    const qtd = Math.max(1, Math.floor(qtdItem) || 1);
    const unitVal = roundCurrency(parseFloat(valorUnitInput) || getProductPriceForMethod(targetProd, pagamento));
    if (unitVal <= 0) {
      onToast('Informe um valor unitário válido.', 'er');
      return;
    }

    const estDisp = extractEstoque(targetProd);
    const alreadyInCart = cart.find((i) => i.idProd === targetProd!.id)?.qtd || 0;
    if (qtd + alreadyInCart > estDisp) {
      onToast(
        `Estoque insuficiente! Disponível para adicionar: ${Math.max(0, estDisp - alreadyInCart)} un.`,
        'er'
      );
      return;
    }

    const nomeProd = extractNome(targetProd);
    setCart((prev) => {
      const existing = prev.find((i) => i.idProd === targetProd!.id);
      if (existing) {
        return prev.map((i) =>
          i.idProd === targetProd!.id
            ? {
                ...i,
                qtd: i.qtd + qtd,
                valorUnit: unitVal,
                valorTotal: roundCurrency(unitVal * (i.qtd + qtd)),
              }
            : i
        );
      }
      return [
        ...prev,
        {
          idProd: targetProd!.id,
          nome: nomeProd,
          qtd,
          valorUnit: unitVal,
          valorTotal: roundCurrency(unitVal * qtd),
        },
      ];
    });

    setPerfumeQuery('');
    setSelectedProdId(null);
    setQtdItem(1);
    setValorUnitInput('');
    onToast(`${nomeProd} adicionado ao carrinho!`, 'ok');
  };

  const handleChangeCartQty = (idx: number, delta: number) => {
    const item = cart[idx];
    if (!item) return;
    const prod = products.find((p) => p.id === item.idProd);
    const estDisp = prod ? extractEstoque(prod) : 999;
    const nextQtd = item.qtd + delta;
    if (nextQtd <= 0) {
      setCart((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    if (nextQtd > estDisp) {
      onToast(`Máximo de ${estDisp} unidade(s) disponíveis no estoque.`, 'er');
      return;
    }
    setCart((prev) =>
      prev.map((c, i) =>
        i === idx ? { ...c, qtd: nextQtd, valorTotal: roundCurrency(c.valorUnit * nextQtd) } : c
      )
    );
  };

  const subtotal = useMemo(
    () => roundCurrency(cart.reduce((s, i) => s + i.valorTotal, 0)),
    [cart]
  );

  const { totalBruto, descReais, totalFinal: valorCliente } = useMemo(
    () => calculateDiscountedTotal(subtotal, descTipo, parseFloat(descValor) || 0),
    [subtotal, descTipo, descValor]
  );

  const { taxaPerc, taxaReais, valorLiquido } = useMemo(
    () => calculatePaymentNet(valorCliente, pagamento),
    [valorCliente, pagamento]
  );

  const handleFinalizarVenda = async () => {
    const cleanNome = clienteNome.toUpperCase().trim();
    if (!cleanNome) {
      onToast('Informe o nome do cliente.', 'er');
      return;
    }
    if (cart.length === 0) {
      onToast('Adicione pelo menos um perfume ao carrinho.', 'er');
      return;
    }
    if (valorCliente <= 0) {
      onToast('O valor final da venda deve ser maior que zero.', 'er');
      return;
    }
    if (pagamento === 'Fiado') {
      for (let i = 0; i < parcelas; i++) {
        if (!datasParcelas[i]) {
          onToast(`Informe o vencimento da parcela ${i + 1}.`, 'er');
          return;
        }
      }
    }

    setSaving(true);
    try {
      // 1. Validate live stock & gather real product costs
      let custoTotalVenda = 0;
      let freteTotalVenda = 0;
      let deslocTotalVenda = 0;

      const stockSnapshots: { id: string; currentStock: number; currentVendas: number }[] = [];

      for (const item of cart) {
        const prodRef = doc(db, 'produtos', item.idProd);
        const prodSnap = await getDoc(prodRef);
        if (!prodSnap.exists()) {
          onToast(`Produto "${item.nome}" não encontrado no banco.`, 'er');
          setSaving(false);
          return;
        }
        const pData = prodSnap.data() as Product;
        const currentStock = extractEstoque(pData);
        if (currentStock < item.qtd) {
          onToast(
            `Estoque insuficiente para ${item.nome}: disponível ${currentStock}, pedido ${item.qtd}.`,
            'er'
          );
          setSaving(false);
          return;
        }
        stockSnapshots.push({
          id: item.idProd,
          currentStock,
          currentVendas: Number(pData.vendas || 0),
        });

        // Costs from private custos_produtos collection (or fallback if legacy)
        let costObj = productCosts[item.idProd];
        if (!costObj) {
          const costSnap = await getDoc(doc(db, 'custos_produtos', item.idProd)).catch(() => null);
          if (costSnap && costSnap.exists()) {
            costObj = { id: item.idProd, ...costSnap.data() } as ProductCost;
          }
        }
        if (costObj) {
          custoTotalVenda += (Number(costObj.custo ?? costObj.custoUnitario) || 0) * item.qtd;
          freteTotalVenda += (Number(costObj.frete) || 0) * item.qtd;
          deslocTotalVenda += (Number(costObj.deslocamento) || 0) * item.qtd;
        }
      }

      const freteDespesa = retirada ? 0 : freteTotalVenda;
      const lucroEstimado = roundCurrency(
        valorLiquido - custoTotalVenda - freteDespesa - deslocTotalVenda
      );
      const perfumePrincipal = cart.map((i) => `${i.qtd}x ${i.nome}`).join(', ');
      const totalParcelas = pagamento === 'Fiado' ? parcelas : 1;
      const finalDatas = pagamento === 'Fiado' ? datasParcelas.slice(0, totalParcelas) : [];

      const vendaPayload: Omit<SaleBw, 'id'> = {
        data: dataVenda || getTodayISO(),
        cliente: cleanNome,
        contato: contato.trim(),
        endereco: endereco.trim(),
        perfume: perfumePrincipal.slice(0, 1000),
        itens: cart.map((i) => ({ ...i })),
        valorCliente: roundCurrency(valorCliente),
        valorLiquido: roundCurrency(valorLiquido),
        valor: roundCurrency(valorLiquido),
        taxaCartaoPerc: taxaPerc,
        taxaCartaoReais: roundCurrency(taxaReais),
        desconto: roundCurrency(descReais),
        pagamento,
        status: pagamento === 'Fiado' ? 'Pendente' : 'Pago',
        parcelasTotais: totalParcelas,
        parcelasPagas: 0,
        datasParcelas: finalDatas,
        historicoParc: [],
        saldoRestante: roundCurrency(valorLiquido),
        retirada,
        custoTotal: roundCurrency(custoTotalVenda),
        freteTotal: roundCurrency(freteTotalVenda),
        deslocTotal: roundCurrency(deslocTotalVenda),
        lucroEstimado,
        criadoEm: new Date().toISOString(),
      };

      // 2. Save or check cliente in clientes_bw
      const existingCliSnap = await getDocs(
        query(collection(db, 'clientes_bw'), where('nome', '==', cleanNome))
      );
      if (!existingCliSnap.empty) {
        const cDoc = existingCliSnap.docs[0];
        const cData = cDoc.data() as ClientBw;
        const cleanCont = contato.trim();
        const cleanEnd = endereco.trim();
        if (
          (cleanCont && cleanCont !== (cData.contato || '')) ||
          (cleanEnd && cleanEnd !== (cData.endereco || ''))
        ) {
          setClientUpdatePrompt({
            clientId: cDoc.id,
            nome: cleanNome,
            oldContato: cData.contato || '',
            newContato: cleanCont || cData.contato || '',
            oldEndereco: cData.endereco || '',
            newEndereco: cleanEnd || cData.endereco || '',
          });
        }
      } else {
        await addDoc(collection(db, 'clientes_bw'), {
          nome: cleanNome,
          contato: contato.trim(),
          endereco: endereco.trim(),
          criadoEm: new Date().toISOString(),
        });
      }

      // 3. Write sale to vendas_bw
      await addDoc(collection(db, 'vendas_bw'), vendaPayload);

      // 4. Decrement stock on produtos
      for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        const snap = stockSnapshots[i];
        const nextStock = Math.max(0, snap.currentStock - item.qtd);
        await updateDoc(doc(db, 'produtos', item.idProd), {
          estoqueQtd: nextStock,
          estoque: nextStock,
          vendas: snap.currentVendas + item.qtd,
          updAt: serverTimestamp(),
        });
      }

      // 5. Build WhatsApp receipt message
      let msgWhats = `🌸 *BW PARFUM IMPORTS*\n${'─'.repeat(22)}\n👤 *${cleanNome}*\n📅 Data: ${formatDateISOToBR(
        vendaPayload.data
      )}\n${'─'.repeat(22)}\n🛒 *Itens:*\n`;
      cart.forEach((item) => {
        msgWhats += `  • ${item.nome} × ${item.qtd} — ${formatCurrencyBRL(item.valorTotal)}\n`;
      });
      msgWhats += `${'─'.repeat(22)}\n`;
      if (descReais > 0) {
        msgWhats += `Subtotal: ${formatCurrencyBRL(totalBruto)}\n🏷️ Desconto: -${formatCurrencyBRL(
          descReais
        )}\n`;
      }
      msgWhats += `💰 *Total: ${formatCurrencyBRL(valorCliente)}*\n💳 Pagamento: ${pagamento}\n`;
      if (pagamento === 'Cartão') {
        msgWhats += `📉 Taxa (12%): -${formatCurrencyBRL(taxaReais)}\n✅ Líquido: ${formatCurrencyBRL(
          valorLiquido
        )}\n`;
      }
      if (pagamento === 'Fiado') {
        const porParc = roundCurrency(valorCliente / totalParcelas);
        msgWhats += `📋 ${totalParcelas}x de ${formatCurrencyBRL(porParc)}\n`;
        finalDatas.forEach((dt, idx) => {
          msgWhats += `  Parcela ${idx + 1}: ${formatDateISOToBR(dt)}\n`;
        });
      }
      msgWhats += `${'─'.repeat(22)}\n✅ Obrigado pela preferência!`;

      setCompletedSaleModal({
        perfumes: perfumePrincipal,
        valorCliente,
        lucroEstimado,
        contato: contato.trim(),
        msgWhats,
      });

      // Reset form
      setCart([]);
      setClienteNome('');
      setContato('');
      setEndereco('');
      setDescValor('');
      setRetirada(false);
      setPagamento('PIX');
      setParcelas(1);
      setDataVenda(getTodayISO());

      await Promise.all([onRefreshStore(), onRefreshSales(), onRefreshClientsBw()]);
    } catch (err) {
      console.error('Erro ao finalizar venda PDV:', err);
      onToast(`Erro ao finalizar venda: ${(err as Error).message}`, 'er');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E6DFD5] rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F2EDE6] pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#9A7437] font-semibold">
              Venda Manual / Balcão & WhatsApp
            </p>
            <h2 className="font-display text-2xl font-semibold text-[#1E1712]">
              Lançar Nova Venda (PDV)
            </h2>
          </div>
          <span className="text-xs text-[#7A6E65]">
            Baixa automática no estoque da vitrine
          </span>
        </div>

        {/* Dados do Cliente */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#7A6E65]">
            1. Dados do Cliente
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Data da Venda
              </label>
              <input
                type="date"
                value={dataVenda}
                onChange={(e) => setDataVenda(e.target.value)}
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>

            <div className="relative">
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Nome do Cliente *
              </label>
              <input
                type="text"
                value={clienteNome}
                onFocus={() => setShowClientSuggestions(true)}
                onBlur={() => setTimeout(() => setShowClientSuggestions(false), 180)}
                onChange={(e) => {
                  setClienteNome(e.target.value);
                  setShowClientSuggestions(true);
                }}
                placeholder="Digite ou selecione..."
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
              {showClientSuggestions && matchingClients.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#E0D9CF] rounded-lg shadow-lg z-30 max-h-48 overflow-y-auto">
                  {matchingClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setClienteNome(c.nome || '');
                        if (c.contato) setContato(c.contato);
                        if (c.endereco) setEndereco(c.endereco);
                        setShowClientSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-[#FAF8F5] border-b border-[#F2EDE6] last:border-0"
                    >
                      <span className="font-semibold text-[#1E1712] block">{c.nome}</span>
                      {(c.contato || c.endereco) && (
                        <span className="text-[11px] text-[#7A6E65]">
                          {[c.contato, c.endereco].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                WhatsApp
              </label>
              <input
                type="text"
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                placeholder="(99) 99999-9999"
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Endereço de Entrega
              </label>
              <input
                type="text"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="Rua, número, bairro"
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E0D9CF] rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        {/* Pagamento e Retirada */}
        <div className="space-y-4 pt-2 border-t border-[#F2EDE6]">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#7A6E65]">
            2. Pagamento & Entrega
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <label className="block text-xs font-medium text-[#5C5147] mb-1">
                Forma de Pagamento
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['PIX', 'Dinheiro', 'Cartão', 'Fiado'] as SalePaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => handleChangePagamento(method)}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                      pagamento === method
                        ? 'bg-[#1E1712] text-white border-[#1E1712]'
                        : 'bg-[#FAF8F5] text-[#5C5147] border-[#E0D9CF] hover:border-[#9A7437]'
                    }`}
                  >
                    {method === 'PIX'
                      ? 'PIX'
                      : method === 'Dinheiro'
                        ? 'Dinheiro'
                        : method === 'Cartão'
                          ? 'Cartão (-12%)'
                          : 'Fiado'}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E6DFD5] cursor-pointer hover:border-[#9A7437] mt-1 md:mt-5">
              <input
                type="checkbox"
                checked={retirada}
                onChange={(e) => setRetirada(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#9A7437]"
              />
              <div>
                <span className="text-xs font-semibold text-[#1E1712] block">
                  Cliente retirou pessoalmente
                </span>
                <span className="text-[11px] text-[#7A6E65]">
                  Marcado = frete não entra como despesa no cálculo de lucro
                </span>
              </div>
            </label>
          </div>

          {pagamento === 'Fiado' && (
            <div className="bg-[#FFFBF0] border border-[#E5D3A3] rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold text-[#9A7437] uppercase tracking-wider">
                  Configuração de Parcelas (Fiado)
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[#5C5147] font-medium">Parcelas:</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={parcelas}
                    onChange={(e) => handleChangeParcelas(parseInt(e.target.value, 10))}
                    className="w-20 px-2.5 py-1.5 bg-white border border-[#E0D9CF] rounded-lg text-sm font-semibold text-center"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {datasParcelas.slice(0, parcelas).map((dt, idx) => (
                  <div key={idx}>
                    <label className="block text-[11px] font-semibold text-[#7A6E65] mb-1">
                      Vencimento Parcela {idx + 1}/{parcelas}
                    </label>
                    <input
                      type="date"
                      value={dt}
                      onChange={(e) => {
                        const copy = [...datasParcelas];
                        copy[idx] = e.target.value;
                        setDatasParcelas(copy);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-[#E0D9CF] rounded-lg text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Adicionar Perfume ao Carrinho */}
        <div className="space-y-4 pt-2 border-t border-[#F2EDE6]">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#7A6E65]">
            3. Itens da Venda
          </p>

          <div className="bg-[#FAF8F5] border border-dashed border-[#D0C8BC] rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-6 relative">
                <label className="block text-xs font-medium text-[#5C5147] mb-1">
                  Perfume (digite parte do nome ou selecione)
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#7A6E65] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={perfumeQuery}
                    onFocus={() => setShowProdSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowProdSuggestions(false), 180)}
                    onChange={(e) => handlePerfumeInputChange(e.target.value)}
                    placeholder="Ex: Sauvage, 212 VIP, La Vie..."
                    className="w-full pl-8 pr-3 py-2 bg-white border border-[#E0D9CF] rounded-lg text-sm"
                  />
                </div>
                {showProdSuggestions && matchingProducts.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#E0D9CF] rounded-lg shadow-lg z-30 max-h-60 overflow-y-auto">
                    {matchingProducts.map((p) => {
                      const est = extractEstoque(p);
                      const preco = getProductPriceForMethod(p, pagamento);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectProduct(p);
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-[#FAF8F5] border-b border-[#F2EDE6] last:border-0 flex items-center justify-between gap-2"
                        >
                          <span className="font-semibold text-[#1E1712] truncate">
                            {extractNome(p)}
                          </span>
                          <span className="flex items-center gap-2 shrink-0 tabular-nums">
                            <span
                              className={`text-[11px] font-semibold ${
                                est === 0
                                  ? 'text-[#A93226]'
                                  : est <= BW_CONFIG.ESTOQUE_CRITICO
                                    ? 'text-[#D06A00]'
                                    : 'text-[#1F6E43]'
                              }`}
                            >
                              {est === 0 ? 'Esgotado' : `${est} un`}
                            </span>
                            <span className="font-bold text-[#9A7437]">
                              {formatCurrencyBRL(preco)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[#5C5147] mb-1">
                  Qtd
                </label>
                <input
                  type="number"
                  min={1}
                  value={qtdItem}
                  onChange={(e) => setQtdItem(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full px-3 py-2 bg-white border border-[#E0D9CF] rounded-lg text-sm tabular-nums"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[#5C5147] mb-1">
                  Valor Unit. (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={valorUnitInput}
                  onChange={(e) => setValorUnitInput(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2 bg-white border border-[#E0D9CF] rounded-lg text-sm tabular-nums"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full py-2.5 px-3 rounded-lg bg-[#1F6E43] text-white text-xs font-semibold hover:bg-[#175533] inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </button>
              </div>
            </div>
          </div>

          {/* Lista do Carrinho */}
          {cart.length > 0 && (
            <div className="space-y-3">
              <div className="border border-[#E6DFD5] rounded-xl divide-y divide-[#F2EDE6] overflow-hidden">
                {cart.map((item, idx) => (
                  <div
                    key={item.idProd}
                    className="p-3.5 bg-white flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1E1712] truncate">
                        {item.nome}
                      </p>
                      <p className="text-xs text-[#7A6E65] tabular-nums">
                        {formatCurrencyBRL(item.valorUnit)} / un
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="inline-flex items-center border border-[#E0D9CF] rounded-lg bg-[#FAF8F5]">
                        <button
                          type="button"
                          onClick={() => handleChangeCartQty(idx, -1)}
                          className="p-1.5 text-[#5C5147] hover:text-[#1E1712]"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2.5 text-xs font-bold tabular-nums">{item.qtd}</span>
                        <button
                          type="button"
                          onClick={() => handleChangeCartQty(idx, 1)}
                          className="p-1.5 text-[#5C5147] hover:text-[#1E1712]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="text-sm font-bold text-[#9A7437] tabular-nums min-w-[90px] text-right">
                        {formatCurrencyBRL(item.valorTotal)}
                      </span>

                      <button
                        type="button"
                        onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-[#A93226] hover:bg-[#A93226]/10 rounded-lg"
                        title="Remover item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desconto e Totais */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#FAF8F5] border border-[#E6DFD5] rounded-xl p-4 space-y-2.5">
                  <label className="block text-xs font-semibold text-[#5C5147]">
                    Aplicar Desconto (Opcional)
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={descTipo}
                      onChange={(e) => setDescTipo(e.target.value as 'reais' | 'porcento')}
                      className="px-3 py-2 bg-white border border-[#E0D9CF] rounded-lg text-xs font-semibold"
                    >
                      <option value="reais">R$ Reais</option>
                      <option value="porcento">% Porcento</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={descValor}
                      onChange={(e) => setDescValor(e.target.value)}
                      placeholder="0,00"
                      className="flex-1 px-3 py-2 bg-white border border-[#E0D9CF] rounded-lg text-sm tabular-nums"
                    />
                  </div>
                  {descReais > 0 && (
                    <div className="text-xs space-y-1 pt-1 border-t border-[#E6DFD5]">
                      <div className="flex justify-between text-[#7A6E65]">
                        <span>Subtotal:</span>
                        <span className="tabular-nums">{formatCurrencyBRL(totalBruto)}</span>
                      </div>
                      <div className="flex justify-between text-[#A93226] font-semibold">
                        <span>Desconto:</span>
                        <span className="tabular-nums">-{formatCurrencyBRL(descReais)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-[#FFFBF0] border border-[#E5D3A3] rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#5C5147]">
                      Total da Venda
                    </span>
                    <span className="text-2xl font-bold text-[#9A7437] tabular-nums">
                      {formatCurrencyBRL(valorCliente)}
                    </span>
                  </div>

                  {pagamento === 'Cartão' ? (
                    <div className="pt-2 border-t border-[#E5D3A3] space-y-1 text-xs">
                      <div className="flex justify-between text-[#A93226]">
                        <span>Taxa operadora (12%):</span>
                        <span className="tabular-nums">-{formatCurrencyBRL(taxaReais)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-[#1E1712] text-sm">
                        <span>Você recebe líquido:</span>
                        <span className="tabular-nums text-[#1F6E43]">
                          {formatCurrencyBRL(valorLiquido)}
                        </span>
                      </div>
                    </div>
                  ) : pagamento === 'Fiado' ? (
                    <div className="pt-2 border-t border-[#E5D3A3] space-y-1 text-xs">
                      <div className="flex justify-between text-[#5C5147]">
                        <span>Parcelamento:</span>
                        <span className="font-semibold tabular-nums">
                          {parcelas}x de {formatCurrencyBRL(roundCurrency(valorCliente / parcelas))}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-[#E5D3A3] flex justify-between text-xs font-bold text-[#1F6E43]">
                      <span>Você recebe ({pagamento}):</span>
                      <span className="tabular-nums">{formatCurrencyBRL(valorLiquido)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={saving || cart.length === 0}
          onClick={handleFinalizarVenda}
          className="w-full py-3.5 px-5 rounded-xl bg-[#1E1712] text-white text-xs font-semibold uppercase tracking-widest hover:bg-[#9A7437] disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors"
        >
          <ShoppingBag className="w-4 h-4" />
          {saving ? 'Finalizando Venda...' : 'Finalizar Venda'}
        </button>
      </div>

      {/* Modal: Atualizar dados do cliente existente */}
      {clientUpdatePrompt && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E6DFD5] rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-[#9A7437]">
              <UserCheck className="w-5 h-5" />
              <h3 className="text-base font-semibold text-[#1E1712]">
                Atualizar cadastro de {clientUpdatePrompt.nome}?
              </h3>
            </div>
            <p className="text-xs text-[#5C5147]">
              Este cliente já estava cadastrado com dados diferentes. Deseja atualizar?
            </p>
            <div className="bg-[#FAF8F5] rounded-lg p-3 text-xs space-y-1">
              <p>
                <strong>Contato anterior:</strong> {clientUpdatePrompt.oldContato || '—'} →{' '}
                <strong className="text-[#1F6E43]">{clientUpdatePrompt.newContato || '—'}</strong>
              </p>
              <p>
                <strong>Endereço anterior:</strong> {clientUpdatePrompt.oldEndereco || '—'} →{' '}
                <strong className="text-[#1F6E43]">{clientUpdatePrompt.newEndereco || '—'}</strong>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setClientUpdatePrompt(null)}
                className="flex-1 py-2.5 rounded-lg border border-[#E0D9CF] text-xs font-semibold text-[#5C5147]"
              >
                Manter antigos
              </button>
              <button
                type="button"
                onClick={async () => {
                  await updateDoc(doc(db, 'clientes_bw', clientUpdatePrompt.clientId), {
                    contato: clientUpdatePrompt.newContato,
                    endereco: clientUpdatePrompt.newEndereco,
                    atualizadoEm: new Date().toISOString(),
                  });
                  setClientUpdatePrompt(null);
                  onToast('Dados do cliente atualizados!', 'ok');
                  await onRefreshClientsBw();
                }}
                className="flex-1 py-2.5 rounded-lg bg-[#1E1712] text-white text-xs font-semibold hover:bg-[#9A7437]"
              >
                Atualizar Dados
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Venda Finalizada + WhatsApp */}
      {completedSaleModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E6DFD5] rounded-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCompletedSaleModal(null)}
                className="p-1 text-[#7A6E65] hover:text-[#1E1712]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <CheckCircle2 className="w-12 h-12 text-[#1F6E43] mx-auto -mt-4" />
            <div>
              <h3 className="font-display text-2xl font-semibold text-[#1E1712]">
                Venda Finalizada!
              </h3>
              <p className="text-xs text-[#5C5147] mt-1">{completedSaleModal.perfumes}</p>
              <p className="text-2xl font-bold text-[#9A7437] tabular-nums mt-2">
                {formatCurrencyBRL(completedSaleModal.valorCliente)}
              </p>
            </div>

            <div className="bg-[#E8F5EE] border border-[#A8D5B8] rounded-xl p-3 text-xs font-semibold text-[#1F6E43]">
              Lucro estimado nesta venda: {formatCurrencyBRL(completedSaleModal.lucroEstimado)}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {cleanDigits(completedSaleModal.contato) && (
                <a
                  href={`https://wa.me/${
                    cleanDigits(completedSaleModal.contato).startsWith('55')
                      ? cleanDigits(completedSaleModal.contato)
                      : `55${cleanDigits(completedSaleModal.contato)}`
                  }?text=${encodeURIComponent(completedSaleModal.msgWhats)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setCompletedSaleModal(null)}
                  className="w-full py-3 rounded-xl bg-[#1F6E43] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#175533]"
                >
                  <MessageCircle className="w-4 h-4" />
                  Enviar Comprovante pelo WhatsApp
                </a>
              )}
              <button
                type="button"
                onClick={() => setCompletedSaleModal(null)}
                className="w-full py-2.5 rounded-xl border border-[#E0D9CF] text-xs font-semibold text-[#5C5147]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

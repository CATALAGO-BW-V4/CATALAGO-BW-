export type OrderStatus =
  | 'pendente'
  | 'confirmado'
  | 'em_preparo'
  | 'enviado'
  | 'saiu_entrega'
  | 'entregue'
  | 'cancelado';

export interface FirestoreTimestampLike {
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
}

export interface Product {
  id: string;
  nome?: string;
  name?: string;
  titulo?: string;
  marca?: string;
  brand?: string;
  preco?: number;
  price?: number;
  precoCartao?: number;
  vendaCartao?: number;
  precoPix?: number;
  pix?: number;
  vendaPix?: number;
  precoOld?: number;
  de?: number;
  estoqueQtd?: number;
  estoque?: number;
  stock?: number;
  est?: string;
  vol?: string;
  ml?: string;
  tamanho?: string;
  cat?: string;
  categoria?: string;
  category?: string;
  notas?: string;
  desc?: string;
  descricao?: string;
  description?: string;
  estoqueAlerta?: number;
  ordem?: number;
  ativo?: boolean;
  dest?: boolean;
  destaque?: boolean;
  promo?: boolean;
  promocao?: boolean;
  imgUrl?: string;
  imgPath?: string;
  img?: string;
  image?: string;
  views?: number;
  vendas?: number;
  criadoEm?: FirestoreTimestampLike;
  updAt?: FirestoreTimestampLike;
  syncedAt?: FirestoreTimestampLike;
}

export interface Category {
  id: string;
  nome: string;
  name?: string;
  slug: string;
  ico?: string;
  icon?: string;
  img?: string;
  imgUrl?: string;
  hidden?: boolean;
  ativo?: boolean;
}

export interface Banner {
  titulo?: string;
  desc?: string;
  sub?: string;
  tag?: string;
  btnTxt?: string;
  link?: string;
  img?: string;
  bg?: string;
  fit?: 'cover' | 'contain';
  pos?: 'center' | 'top' | 'bottom';
  somenteImagem?: boolean;
  visivel?: boolean;
}

export interface StoreSettings {
  nome?: string;
  slogan?: string;
  wpp?: string;
  logo?: string;
  topbar?: string;
  parcelas?: number;
  freteGratis?: number;
  estoqueAlerta?: number;
  msgPedido?: string;
  msgBoasVindas?: string;
  msgStatusPedido?: string;
  lojaAberta?: boolean;
  mostraPix?: boolean;
  loginObrig?: boolean;
}

export interface CartItem {
  id: string;
  qty: number;
}

export interface OrderItem {
  id: string;
  nome: string;
  qty: number;
  preco: number;
}

export interface OrderTracking {
  tipo?: string;
  transportadora?: string;
  codigo?: string;
  codigoRastreio?: string;
  url?: string;
  urlRastreio?: string;
  previsao?: string;
}

export interface OrderStatusHistory {
  status: OrderStatus | string;
  msg?: string;
  criadoEm?: string | FirestoreTimestampLike;
  porUid?: string;
}

export interface Order {
  id: string;
  pedidoGlobalId?: string;
  uid?: string | null;
  nome?: string;
  wpp?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  complemento?: string;
  pagamento?: 'pix' | 'cartao' | string;
  pag?: string;
  parcelas?: number;
  valorParcela?: number;
  total?: number;
  subtotal?: number;
  desconto?: number;
  frete?: number;
  obs?: string;
  observacoes?: string;
  itens?: OrderItem[];
  resumo?: string;
  status?: OrderStatus;
  rastreio?: OrderTracking | string;
  entrega?: OrderTracking | string;
  historicoStatus?: OrderStatusHistory[];
  criadoEm?: FirestoreTimestampLike;
  updAt?: FirestoreTimestampLike;
  entregueEm?: FirestoreTimestampLike | null;
  data?: string;
  lancadoCaixa?: boolean;
}

export interface ProductCost {
  id: string;
  custo: number;
  frete: number;
  deslocamento: number;
  margem: number;
  custoBase: number;
  custoUnitario: number;
  vendaPix: number;
  vendaCartao: number;
  atualizadoEm?: string;
}

export type SalePaymentMethod = 'PIX' | 'Dinheiro' | 'Cartão' | 'Fiado';

export interface SaleCartItem {
  idProd: string;
  nome: string;
  qtd: number;
  valorUnit: number;
  valorTotal: number;
}

export interface FiadoInstallmentPayment {
  parcela: number;
  dataPago: string;
  valorPago: number;
}

export interface SaleBw {
  id: string;
  data: string;
  cliente: string;
  contato?: string;
  endereco?: string;
  perfume: string;
  itens?: SaleCartItem[];
  valorCliente: number;
  valorLiquido: number;
  valor: number;
  taxaCartaoPerc?: number;
  taxaCartaoReais?: number;
  desconto?: number;
  pagamento: SalePaymentMethod;
  status: 'Pago' | 'Pendente';
  parcelasTotais?: number;
  parcelasPagas?: number;
  datasParcelas?: string[];
  historicoParc?: FiadoInstallmentPayment[];
  saldoRestante?: number;
  retirada?: boolean;
  custoTotal?: number;
  freteTotal?: number;
  deslocTotal?: number;
  lucroEstimado?: number;
  origemPedidoId?: string;
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface ClientBw {
  id: string;
  nome: string;
  contato?: string;
  endereco?: string;
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface Review {
  id: string;
  prodId: string;
  prodNome?: string;
  produtoId?: string;
  autor?: string;
  nome?: string;
  nota: number;
  texto?: string;
  txt?: string;
  status?: 'pending' | 'approved' | 'rejected';
  uid?: string | null;
  criadoEm?: FirestoreTimestampLike;
}

export interface ClientProfile {
  id: string;
  nome?: string;
  email?: string;
  wpp?: string;
  cep?: string;
  endereco?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  favoritos?: string[];
  criadoEm?: FirestoreTimestampLike;
}

export type AppView =
  | 'home'
  | 'catalogo'
  | 'feminino'
  | 'masculino'
  | 'unissex'
  | 'kits'
  | 'como'
  | 'sobre'
  | 'conta'
  | 'admin';

export interface ToastMessage {
  id: string;
  text: string;
  type: 'ok' | 'er' | 'ts';
}

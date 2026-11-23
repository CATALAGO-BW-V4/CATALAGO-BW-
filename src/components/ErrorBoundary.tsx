import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Ocorreu um erro inesperado.',
    };
  }

  override componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF8F5] text-[#1E1712] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E6DFD5] rounded-2xl p-8 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-[#9A7437] mb-3 font-semibold">
              BW Parfum Imports
            </p>
            <h1 className="font-display text-3xl font-semibold mb-3">
              Algo não saiu como esperado
            </h1>
            <p className="text-sm text-[#6B5E53] mb-6 leading-relaxed">
              Não foi possível concluir a operação no momento. Recarregue a página para tentar novamente.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-[#1E1712] text-white text-sm font-semibold rounded-lg hover:bg-[#332820] transition-colors"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

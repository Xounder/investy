import { splitCsv } from './csv-parser.js';

export interface NotaItem {
  direction: 'C' | 'V'; symbol: string; qty: bigint; unitPriceCents: bigint;
  dayTrade: boolean; tradeDate?: string; type?: 'split' | 'jcp'; factor?: number;
}
export interface NotaData {
  broker: string; notaNumber: string; tradeDate: string; items: NotaItem[];
  fees: { liquidacao: bigint; corretagem: bigint; emolumentos: bigint; iss: bigint; irrf: bigint };
}

function cents(raw: string): bigint {
  const value = raw.trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`Valor monetário inválido: ${raw}`);
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function date(raw: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ||
    new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) throw new Error('Data da nota inválida');
  return iso;
}
function item(direction: string, symbol: string, qty: string, price: string, dayTrade = '', tradeDate?: string): NotaItem {
  const q = qty.trim();
  if (!/^(C|V)$/i.test(direction.trim()) || !/^[A-Z0-9.-]{2,30}$/i.test(symbol.trim()) ||
    !/^\d+$/.test(q) || BigInt(q) <= 0n) throw new Error('Negócio inválido: direção, ativo ou quantidade');
  const unitPriceCents = cents(price);
  if (unitPriceCents <= 0n) throw new Error('Preço deve ser positivo');
  return { direction: direction.trim().toUpperCase() as 'C' | 'V', symbol: symbol.trim().toUpperCase(),
    qty: BigInt(q), unitPriceCents, dayTrade: /^(1|s|sim|true|d)$/i.test(dayTrade.trim()),
    ...(tradeDate ? { tradeDate: date(tradeDate) } : {}) };
}
function action(kind: string, symbol: string, qty: string, price: string): NotaItem {
  if (!/^[A-Z0-9.-]{2,30}$/i.test(symbol.trim())) throw new Error('Ativo do evento inválido');
  if (/^(split|desdobramento)$/i.test(kind)) {
    const factor = Number(qty);
    if (!/^\d+$/.test(qty) || !Number.isSafeInteger(factor) || factor < 2 || factor > 1_000_000) {
      throw new Error('Fator de desdobramento inválido');
    }
    return { type: 'split', factor, direction: 'C', symbol: symbol.toUpperCase(), qty: 0n,
      unitPriceCents: 0n, dayTrade: false };
  }
  const result = item('C', symbol, qty, price);
  return { ...result, type: 'jcp' };
}
const feeNames = ['liquidacao', 'corretagem', 'emolumentos', 'iss', 'irrf'] as const;
function blankFees(): NotaData['fees'] {
  return { liquidacao: 0n, corretagem: 0n, emolumentos: 0n, iss: 0n, irrf: 0n };
}
function finish(broker: string, number: string, tradeDate: string, items: NotaItem[], fees: NotaData['fees']): NotaData {
  if (!broker.trim() || !number.trim() || number.length > 40 || !items.length || items.length > 200) {
    throw new Error('Nota requer corretora, número e 1 a 200 negócios');
  }
  return { broker: broker.trim(), notaNumber: number.trim(), tradeDate: date(tradeDate), items, fees };
}
function checkTradeTotal(items: NotaItem[], declared: string): void {
  if (declared && items.filter((i) => !i.type).reduce((sum, i) => sum + i.qty * i.unitPriceCents, 0n) !== cents(declared)) {
    throw new Error('Total dos negócios da nota divergente');
  }
}
function parseTable(text: string): NotaData {
  const rows = splitCsv(text.replace(/^\uFEFF/, ''));
  const headers = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  const field = (row: string[], key: string) => row[headers.indexOf(key)]?.trim() ?? '';
  if (['broker', 'notanumber', 'tradedate', 'direction', 'symbol', 'qty', 'unitprice'].some((k) => !headers.includes(k))) {
    throw new Error('Colunas obrigatórias da nota ausentes');
  }
  const allowed = new Set(['broker', 'notanumber', 'tradedate', 'direction', 'symbol', 'qty', 'unitprice',
    'daytrade', 'eventtype', 'totalfees', 'totaltrades', 'totalvalue', ...feeNames]);
  if (new Set(headers).size !== headers.length || headers.some((key) => !allowed.has(key))) {
    throw new Error('Coluna financeira CSV duplicada ou não suportada');
  }
  const data = rows.filter((r) => r.some((v) => v.trim()));
  if (!data.length) throw new Error('Nota sem negócios');
  const first = data[0]!;
  const fees = blankFees();
  const items = data.map((row) => {
    if (row.length !== headers.length || field(row, 'broker') !== field(first, 'broker') ||
      field(row, 'notanumber') !== field(first, 'notanumber')) {
      throw new Error('Cabeçalhos de notas diferentes no mesmo arquivo');
    }
    for (const name of feeNames) if (field(row, name)) fees[name] += cents(field(row, name));
    const kind = field(row, 'eventtype');
    if (kind) {
      if (!/^(split|desdobramento|jcp)$/i.test(kind)) throw new Error('Evento da nota não suportado');
      return action(kind, field(row, 'symbol'), field(row, 'qty'), field(row, 'unitprice'));
    }
    return item(field(row, 'direction'), field(row, 'symbol'), field(row, 'qty'), field(row, 'unitprice'),
      field(row, 'daytrade'), field(row, 'tradedate'));
  });
  if (headers.includes('totalfees') && data.some((row) => field(row, 'totalfees')) &&
    Object.values(fees).reduce((sum, fee) => sum + fee, 0n) !== cents(field(first, 'totalfees'))) {
    throw new Error('Total de taxas da nota divergente');
  }
  checkTradeTotal(items, field(first, 'totaltrades') || field(first, 'totalvalue'));
  return finish(field(first, 'broker'), field(first, 'notanumber'), field(first, 'tradedate'), items, fees);
}
function parseXml(text: string): NotaData {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML com entidades não é permitido');
  const value = (block: string, tag: string) => {
    const match = new RegExp(`<${tag}\\b[^>]*>([^<]*)<\\/${tag}>`, 'i').exec(block);
    return match?.[1]?.trim() ?? '';
  };
  if (!/^\s*(?:<\?xml\b|<(?:nota|notaCorretagem|sinacor)\b)/i.test(text)) throw new Error('XML da nota inválido');
  const matches = [...text.matchAll(/<(negocio|item|operacao|evento)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  const items = matches.map((m) => {
    const block = m[2]!;
    const kind = value(block, 'eventType') || value(block, 'eventoTipo');
    const symbol = value(block, 'symbol') || value(block, 'ativo') || value(block, 'codigoAtivo');
    const qty = value(block, 'qty') || value(block, 'quantidade') || value(block, 'fator');
    const price = value(block, 'unitPrice') || value(block, 'preco') || value(block, 'precoUnitario');
    if (kind) {
      if (!/^(split|desdobramento|jcp)$/i.test(kind)) throw new Error('Evento XML não suportado');
      return action(kind, symbol, qty, price);
    }
    const parsed = item(value(block, 'direction') || value(block, 'tipo') || value(block, 'compraVenda'),
      symbol, qty, price, value(block, 'dayTrade'), value(block, 'tradeDate') || undefined);
    if (value(block, 'valorTotal') && parsed.qty * parsed.unitPriceCents !== cents(value(block, 'valorTotal'))) {
      throw new Error('Total do negócio XML divergente');
    }
    return parsed;
  });
  const rest = matches.reduce((remaining, match) => remaining.replace(match[0], ''), text);
  if (/<(?:negocio|item|operacao|evento|trade|negociacao|lancamento|provento|compraVenda|codigoAtivo|precoUnitario|quantidade|valorTotal|fator|despesas|encargos|fee\w*|custo\w*)\b/i.test(rest)) {
    throw new Error('Estrutura financeira XML não reconhecida');
  }
  const fees = blankFees();
  const feeAliases: Record<keyof NotaData['fees'], string[]> = {
    liquidacao: ['liquidacao', 'taxaLiquidacao'], corretagem: ['corretagem', 'valorCorretagem'],
    emolumentos: ['emolumentos', 'taxaEmolumentos'], iss: ['iss'], irrf: ['irrf'],
  };
  for (const name of feeNames) for (const alias of feeAliases[name]) {
    for (const match of text.matchAll(new RegExp(`<${alias}\\b[^>]*>([^<]*)<\\/${alias}>`, 'gi'))) fees[name] += cents(match[1]!);
  }
  for (const tag of text.matchAll(/<(taxa\w+|valorCorretagem|custo\w+)\b/gi)) {
    if (!Object.values(feeAliases).flat().some((alias) => alias.toLowerCase() === tag[1]!.toLowerCase()) &&
      tag[1]!.toLowerCase() !== 'taxastotal') throw new Error(`Taxa XML não reconhecida: ${tag[1]}`);
  }
  const xmlTags = new Set(['nota', 'notacorretagem', 'sinacor', 'cabecalho', 'negocios', 'itens', 'operacoes',
    'negocio', 'item', 'operacao', 'evento', 'broker', 'corretora', 'notanumber', 'numero', 'tradedate',
    'datapregao', 'data', 'direction', 'tipo', 'compravenda', 'symbol', 'ativo', 'codigoativo', 'qty',
    'quantidade', 'fator', 'unitprice', 'preco', 'precounitario', 'valortotal', 'daytrade',
    'eventtype', 'eventotipo', 'liquidacao', 'taxaliquidacao', 'corretagem', 'valorcorretagem',
    'emolumentos', 'taxaemolumentos', 'iss', 'irrf', 'totaltaxas', 'totalnegocios', 'totaloperacoes']);
  for (const tag of text.matchAll(/<([a-z][a-z0-9]*)\b/gi)) if (!xmlTags.has(tag[1]!.toLowerCase())) {
    throw new Error(`Campo XML não suportado: ${tag[1]}`);
  }
  if (value(text, 'totalTaxas') && Object.values(fees).reduce((a, b) => a + b, 0n) !== cents(value(text, 'totalTaxas'))) {
    throw new Error('Total de taxas da nota divergente');
  }
  checkTradeTotal(items, value(text, 'totalNegocios') || value(text, 'totalOperacoes'));
  return finish(value(text, 'broker') || value(text, 'corretora'), value(text, 'notaNumber') || value(text, 'numero'),
    value(text, 'tradeDate') || value(text, 'dataPregao') || value(text, 'data'), items, fees);
}
function parseText(text: string): NotaData {
  const header = (pattern: RegExp) => pattern.exec(text)?.[1]?.trim() ?? '';
  const broker = header(/(?:Corretora|Broker)\s*:\s*([^\r\n]+)/i);
  const number = header(/(?:N[úu]mero\s*(?:da\s*)?Nota|Nota\s*(?:N[ºo.]|Number))\s*:\s*([\w./-]+)/i);
  const tradeDate = header(/(?:Data\s*(?:do\s*)?(?:Preg[ãa]o|Neg[óo]cio|Nota)|Trade\s*Date)\s*:\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
  const items: NotaItem[] = [];
  const headings = /^(?:neg[óo]cios\s+realizados|resumo\s+(?:dos\s+)?neg[óo]cios|resumo\s+financeiro|especifica[çc][ãa]o\s+do\s+t[íi]tulo|taxas\s+e\s+custos)$/i;
  let financialSection = false;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (headings.test(line.trim())) { financialSection = true; continue; }
    const match = /^\s*(C|V)\s+([A-Z0-9.-]{2,30})\s+(\d+)\s+([\d.,]+)(?:\s+(D|DAYTRADE|SIM))?\s*$/i.exec(line);
    if (match) items.push(item(match[1]!, match[2]!, match[3]!, match[4]!, match[5]));
    else if (/^\s*(?:SPLIT|DESDOBRAMENTO|JCP)\s+/i.test(line)) {
      const event = /^\s*(SPLIT|DESDOBRAMENTO|JCP)\s+([A-Z0-9.-]{2,30})\s+(\d+)(?:\s+([\d.,]+))?\s*$/i.exec(line);
      if (!event) throw new Error(`Evento não reconhecido na linha ${index + 1}`);
      items.push(action(event[1]!, event[2]!, event[3]!, event[4] ?? ''));
    }
    else if (/^\s*\d+-BOVESPA\s+/i.test(line)) {
      const trade = /^\s*\d+-BOVESPA\s+(C|V)\s+VISTA\s+([A-Z0-9.-]+)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)(?:\s+(D))?\s*$/i.exec(line);
      if (!trade) throw new Error(`Negócio Sinacor não reconhecido na linha ${index + 1}`);
      const parsed = item(trade[1]!, trade[2]!, trade[3]!, trade[4]!, trade[6]);
      if (parsed.qty * parsed.unitPriceCents !== cents(trade[5]!)) throw new Error('Total do negócio Sinacor divergente');
      items.push(parsed);
    }
    else if (/^\s*(?:C|V)\s+\S/i.test(line) || /^\s*(?:neg[óo]cio|opera[çc][ãa]o)\b/i.test(line)) {
      throw new Error(`Negócio não reconhecido na linha ${index + 1}`);
    }
    else if (/^\s*(?:\d+\s*[-–]\s*\S+\s+|\d+\s+\S+\s+(?:C|V)\s+|\d+\s+(?:C|V)\s+|[A-Z]{4}\d{1,2}\s+\d+\s+[\d.,]+|(?:compra|venda|desdobramento|bonifica[çc][ãa]o|provento|dividendo|rendimento|juros\s+sobre\s+capital)\b)/i.test(line)) {
      throw new Error(`Registro financeiro não reconhecido na linha ${index + 1}`);
    }
    else if (/^\s*(?:taxas?|custos?)\b/i.test(line) && !/^\s*(?:taxas?|custos?)\s*:/i.test(line)) {
      throw new Error(`Taxa não reconhecida na linha ${index + 1}`);
    }
    else if (/^\s*(?:neg[óo]cios|resumo|especifica[çc][ãa]o)\b/i.test(line) && !headings.test(line.trim()) &&
      !/^\s*(?:total\s+(?:de\s+)?(?:taxas|custos|neg[óo]cios)|taxas?\s*:|custos?\s*:)/i.test(line)) {
      throw new Error(`Seção financeira não reconhecida na linha ${index + 1}`);
    }
    else if (financialSection && line.trim() && !/^\s*(?:Corretora|Broker|N[úu]mero\s*(?:da\s*)?Nota|Nota\s*N|Data\s*(?:do\s*)?(?:Preg[ãa]o|Neg[óo]cio|Nota)|Trade\s*Date|Total\s*(?:de\s*)?(?:Taxas|Custos|Neg[óo]cios|Opera[çc][õo]es)|liquida[çc][ãa]o|corretagem|emolumentos|iss|irrf)\s*:/i.test(line) &&
      !/^\s*(?:C\/V\s+|[-=]+\s*$)/i.test(line)) {
      throw new Error(`Linha financeira não reconhecida na linha ${index + 1}`);
    }
    else if (/^\s*[^:]+:\s*(?:R\$\s*)?[\d.,]+\s*$/.test(line) &&
      !/^\s*(?:Corretora|Broker|N[úu]mero\s*(?:da\s*)?Nota|Nota\s*N|Data\s*(?:do\s*)?(?:Preg[ãa]o|Neg[óo]cio|Nota)|Trade\s*Date|Total\s*(?:de\s*)?(?:Taxas|Custos|Neg[óo]cios|Opera[çc][õo]es)|liquida[çc][ãa]o|corretagem|emolumentos|iss|irrf)\s*:/i.test(line)) {
      throw new Error(`Valor financeiro não reconhecido na linha ${index + 1}`);
    }
  }
  const fees = blankFees();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const fee = /^\s*(liquida[çc][ãa]o|corretagem|emolumentos|iss|irrf)\s*:\s*(.*?)\s*$/i.exec(line);
    if (fee) {
      const name = /^liquida/i.test(fee[1]!) ? 'liquidacao' : fee[1]!.toLowerCase() as keyof NotaData['fees'];
      fees[name] += cents(fee[2]!);
    } else if (/^\s*(?:liquida[çc][ãa]o|corretagem|emolumentos|iss|irrf|taxas?|custos?)\b/i.test(line)) {
      throw new Error(`Taxa não reconhecida na linha ${index + 1}`);
    }
  }
  const total = header(/(?:Total\s*(?:de\s*)?(?:Taxas|Custos))\s*:\s*([^\r\n]+)/i);
  if (total && Object.values(fees).reduce((sum, fee) => sum + fee, 0n) !== cents(total)) {
    throw new Error('Total de taxas da nota divergente');
  }
  checkTradeTotal(items, header(/(?:Total\s*(?:de\s*)?(?:Neg[óo]cios|Opera[çc][õo]es))\s*:\s*([^\r\n]+)/i));
  return finish(broker, number, tradeDate, items, fees);
}
export function parseNota(text: string, format: 'csv' | 'xml' | 'text'): NotaData {
  return format === 'csv' ? parseTable(text) : format === 'xml' ? parseXml(text) : parseText(text);
}

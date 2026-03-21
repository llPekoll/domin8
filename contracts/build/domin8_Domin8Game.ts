import {
    Cell,
    Slice,
    Address,
    Builder,
    beginCell,
    ComputeError,
    TupleItem,
    TupleReader,
    Dictionary,
    contractAddress,
    address,
    ContractProvider,
    Sender,
    Contract,
    ContractABI,
    ABIType,
    ABIGetter,
    ABIReceiver,
    TupleBuilder,
    DictionaryValue
} from '@ton/core';

export type DataSize = {
    $$type: 'DataSize';
    cells: bigint;
    bits: bigint;
    refs: bigint;
}

export function storeDataSize(src: DataSize) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.cells, 257);
        b_0.storeInt(src.bits, 257);
        b_0.storeInt(src.refs, 257);
    };
}

export function loadDataSize(slice: Slice) {
    const sc_0 = slice;
    const _cells = sc_0.loadIntBig(257);
    const _bits = sc_0.loadIntBig(257);
    const _refs = sc_0.loadIntBig(257);
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function loadTupleDataSize(source: TupleReader) {
    const _cells = source.readBigNumber();
    const _bits = source.readBigNumber();
    const _refs = source.readBigNumber();
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function loadGetterTupleDataSize(source: TupleReader) {
    const _cells = source.readBigNumber();
    const _bits = source.readBigNumber();
    const _refs = source.readBigNumber();
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function storeTupleDataSize(source: DataSize) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.cells);
    builder.writeNumber(source.bits);
    builder.writeNumber(source.refs);
    return builder.build();
}

export function dictValueParserDataSize(): DictionaryValue<DataSize> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDataSize(src)).endCell());
        },
        parse: (src) => {
            return loadDataSize(src.loadRef().beginParse());
        }
    }
}

export type SignedBundle = {
    $$type: 'SignedBundle';
    signature: Buffer;
    signedData: Slice;
}

export function storeSignedBundle(src: SignedBundle) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeBuffer(src.signature);
        b_0.storeBuilder(src.signedData.asBuilder());
    };
}

export function loadSignedBundle(slice: Slice) {
    const sc_0 = slice;
    const _signature = sc_0.loadBuffer(64);
    const _signedData = sc_0;
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function loadTupleSignedBundle(source: TupleReader) {
    const _signature = source.readBuffer();
    const _signedData = source.readCell().asSlice();
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function loadGetterTupleSignedBundle(source: TupleReader) {
    const _signature = source.readBuffer();
    const _signedData = source.readCell().asSlice();
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function storeTupleSignedBundle(source: SignedBundle) {
    const builder = new TupleBuilder();
    builder.writeBuffer(source.signature);
    builder.writeSlice(source.signedData.asCell());
    return builder.build();
}

export function dictValueParserSignedBundle(): DictionaryValue<SignedBundle> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSignedBundle(src)).endCell());
        },
        parse: (src) => {
            return loadSignedBundle(src.loadRef().beginParse());
        }
    }
}

export type StateInit = {
    $$type: 'StateInit';
    code: Cell;
    data: Cell;
}

export function storeStateInit(src: StateInit) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeRef(src.code);
        b_0.storeRef(src.data);
    };
}

export function loadStateInit(slice: Slice) {
    const sc_0 = slice;
    const _code = sc_0.loadRef();
    const _data = sc_0.loadRef();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function loadTupleStateInit(source: TupleReader) {
    const _code = source.readCell();
    const _data = source.readCell();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function loadGetterTupleStateInit(source: TupleReader) {
    const _code = source.readCell();
    const _data = source.readCell();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function storeTupleStateInit(source: StateInit) {
    const builder = new TupleBuilder();
    builder.writeCell(source.code);
    builder.writeCell(source.data);
    return builder.build();
}

export function dictValueParserStateInit(): DictionaryValue<StateInit> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeStateInit(src)).endCell());
        },
        parse: (src) => {
            return loadStateInit(src.loadRef().beginParse());
        }
    }
}

export type Context = {
    $$type: 'Context';
    bounceable: boolean;
    sender: Address;
    value: bigint;
    raw: Slice;
}

export function storeContext(src: Context) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeBit(src.bounceable);
        b_0.storeAddress(src.sender);
        b_0.storeInt(src.value, 257);
        b_0.storeRef(src.raw.asCell());
    };
}

export function loadContext(slice: Slice) {
    const sc_0 = slice;
    const _bounceable = sc_0.loadBit();
    const _sender = sc_0.loadAddress();
    const _value = sc_0.loadIntBig(257);
    const _raw = sc_0.loadRef().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function loadTupleContext(source: TupleReader) {
    const _bounceable = source.readBoolean();
    const _sender = source.readAddress();
    const _value = source.readBigNumber();
    const _raw = source.readCell().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function loadGetterTupleContext(source: TupleReader) {
    const _bounceable = source.readBoolean();
    const _sender = source.readAddress();
    const _value = source.readBigNumber();
    const _raw = source.readCell().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function storeTupleContext(source: Context) {
    const builder = new TupleBuilder();
    builder.writeBoolean(source.bounceable);
    builder.writeAddress(source.sender);
    builder.writeNumber(source.value);
    builder.writeSlice(source.raw.asCell());
    return builder.build();
}

export function dictValueParserContext(): DictionaryValue<Context> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeContext(src)).endCell());
        },
        parse: (src) => {
            return loadContext(src.loadRef().beginParse());
        }
    }
}

export type SendParameters = {
    $$type: 'SendParameters';
    mode: bigint;
    body: Cell | null;
    code: Cell | null;
    data: Cell | null;
    value: bigint;
    to: Address;
    bounce: boolean;
}

export function storeSendParameters(src: SendParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        if (src.code !== null && src.code !== undefined) { b_0.storeBit(true).storeRef(src.code); } else { b_0.storeBit(false); }
        if (src.data !== null && src.data !== undefined) { b_0.storeBit(true).storeRef(src.data); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeAddress(src.to);
        b_0.storeBit(src.bounce);
    };
}

export function loadSendParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _code = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _data = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _to = sc_0.loadAddress();
    const _bounce = sc_0.loadBit();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function loadTupleSendParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _code = source.readCellOpt();
    const _data = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function loadGetterTupleSendParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _code = source.readCellOpt();
    const _data = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function storeTupleSendParameters(source: SendParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeCell(source.code);
    builder.writeCell(source.data);
    builder.writeNumber(source.value);
    builder.writeAddress(source.to);
    builder.writeBoolean(source.bounce);
    return builder.build();
}

export function dictValueParserSendParameters(): DictionaryValue<SendParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSendParameters(src)).endCell());
        },
        parse: (src) => {
            return loadSendParameters(src.loadRef().beginParse());
        }
    }
}

export type MessageParameters = {
    $$type: 'MessageParameters';
    mode: bigint;
    body: Cell | null;
    value: bigint;
    to: Address;
    bounce: boolean;
}

export function storeMessageParameters(src: MessageParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeAddress(src.to);
        b_0.storeBit(src.bounce);
    };
}

export function loadMessageParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _to = sc_0.loadAddress();
    const _bounce = sc_0.loadBit();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function loadTupleMessageParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function loadGetterTupleMessageParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function storeTupleMessageParameters(source: MessageParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeNumber(source.value);
    builder.writeAddress(source.to);
    builder.writeBoolean(source.bounce);
    return builder.build();
}

export function dictValueParserMessageParameters(): DictionaryValue<MessageParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeMessageParameters(src)).endCell());
        },
        parse: (src) => {
            return loadMessageParameters(src.loadRef().beginParse());
        }
    }
}

export type DeployParameters = {
    $$type: 'DeployParameters';
    mode: bigint;
    body: Cell | null;
    value: bigint;
    bounce: boolean;
    init: StateInit;
}

export function storeDeployParameters(src: DeployParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeBit(src.bounce);
        b_0.store(storeStateInit(src.init));
    };
}

export function loadDeployParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _bounce = sc_0.loadBit();
    const _init = loadStateInit(sc_0);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function loadTupleDeployParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _bounce = source.readBoolean();
    const _init = loadTupleStateInit(source);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function loadGetterTupleDeployParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _bounce = source.readBoolean();
    const _init = loadGetterTupleStateInit(source);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function storeTupleDeployParameters(source: DeployParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeNumber(source.value);
    builder.writeBoolean(source.bounce);
    builder.writeTuple(storeTupleStateInit(source.init));
    return builder.build();
}

export function dictValueParserDeployParameters(): DictionaryValue<DeployParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeployParameters(src)).endCell());
        },
        parse: (src) => {
            return loadDeployParameters(src.loadRef().beginParse());
        }
    }
}

export type StdAddress = {
    $$type: 'StdAddress';
    workchain: bigint;
    address: bigint;
}

export function storeStdAddress(src: StdAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.workchain, 8);
        b_0.storeUint(src.address, 256);
    };
}

export function loadStdAddress(slice: Slice) {
    const sc_0 = slice;
    const _workchain = sc_0.loadIntBig(8);
    const _address = sc_0.loadUintBig(256);
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function loadTupleStdAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readBigNumber();
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function loadGetterTupleStdAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readBigNumber();
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function storeTupleStdAddress(source: StdAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.workchain);
    builder.writeNumber(source.address);
    return builder.build();
}

export function dictValueParserStdAddress(): DictionaryValue<StdAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeStdAddress(src)).endCell());
        },
        parse: (src) => {
            return loadStdAddress(src.loadRef().beginParse());
        }
    }
}

export type VarAddress = {
    $$type: 'VarAddress';
    workchain: bigint;
    address: Slice;
}

export function storeVarAddress(src: VarAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.workchain, 32);
        b_0.storeRef(src.address.asCell());
    };
}

export function loadVarAddress(slice: Slice) {
    const sc_0 = slice;
    const _workchain = sc_0.loadIntBig(32);
    const _address = sc_0.loadRef().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function loadTupleVarAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readCell().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function loadGetterTupleVarAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readCell().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function storeTupleVarAddress(source: VarAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.workchain);
    builder.writeSlice(source.address.asCell());
    return builder.build();
}

export function dictValueParserVarAddress(): DictionaryValue<VarAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeVarAddress(src)).endCell());
        },
        parse: (src) => {
            return loadVarAddress(src.loadRef().beginParse());
        }
    }
}

export type BasechainAddress = {
    $$type: 'BasechainAddress';
    hash: bigint | null;
}

export function storeBasechainAddress(src: BasechainAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        if (src.hash !== null && src.hash !== undefined) { b_0.storeBit(true).storeInt(src.hash, 257); } else { b_0.storeBit(false); }
    };
}

export function loadBasechainAddress(slice: Slice) {
    const sc_0 = slice;
    const _hash = sc_0.loadBit() ? sc_0.loadIntBig(257) : null;
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function loadTupleBasechainAddress(source: TupleReader) {
    const _hash = source.readBigNumberOpt();
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function loadGetterTupleBasechainAddress(source: TupleReader) {
    const _hash = source.readBigNumberOpt();
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function storeTupleBasechainAddress(source: BasechainAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.hash);
    return builder.build();
}

export function dictValueParserBasechainAddress(): DictionaryValue<BasechainAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeBasechainAddress(src)).endCell());
        },
        parse: (src) => {
            return loadBasechainAddress(src.loadRef().beginParse());
        }
    }
}

export type Deploy = {
    $$type: 'Deploy';
    queryId: bigint;
}

export function storeDeploy(src: Deploy) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2490013878, 32);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadDeploy(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2490013878) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function loadTupleDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function loadGetterTupleDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function storeTupleDeploy(source: Deploy) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserDeploy(): DictionaryValue<Deploy> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeploy(src)).endCell());
        },
        parse: (src) => {
            return loadDeploy(src.loadRef().beginParse());
        }
    }
}

export type DeployOk = {
    $$type: 'DeployOk';
    queryId: bigint;
}

export function storeDeployOk(src: DeployOk) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2952335191, 32);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadDeployOk(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2952335191) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function loadTupleDeployOk(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function loadGetterTupleDeployOk(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function storeTupleDeployOk(source: DeployOk) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserDeployOk(): DictionaryValue<DeployOk> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeployOk(src)).endCell());
        },
        parse: (src) => {
            return loadDeployOk(src.loadRef().beginParse());
        }
    }
}

export type FactoryDeploy = {
    $$type: 'FactoryDeploy';
    queryId: bigint;
    cashback: Address;
}

export function storeFactoryDeploy(src: FactoryDeploy) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1829761339, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeAddress(src.cashback);
    };
}

export function loadFactoryDeploy(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1829761339) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _cashback = sc_0.loadAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function loadTupleFactoryDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _cashback = source.readAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function loadGetterTupleFactoryDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _cashback = source.readAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function storeTupleFactoryDeploy(source: FactoryDeploy) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeAddress(source.cashback);
    return builder.build();
}

export function dictValueParserFactoryDeploy(): DictionaryValue<FactoryDeploy> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeFactoryDeploy(src)).endCell());
        },
        parse: (src) => {
            return loadFactoryDeploy(src.loadRef().beginParse());
        }
    }
}

export type ChangeOwner = {
    $$type: 'ChangeOwner';
    queryId: bigint;
    newOwner: Address;
}

export function storeChangeOwner(src: ChangeOwner) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2174598809, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeAddress(src.newOwner);
    };
}

export function loadChangeOwner(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2174598809) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _newOwner = sc_0.loadAddress();
    return { $$type: 'ChangeOwner' as const, queryId: _queryId, newOwner: _newOwner };
}

export function loadTupleChangeOwner(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _newOwner = source.readAddress();
    return { $$type: 'ChangeOwner' as const, queryId: _queryId, newOwner: _newOwner };
}

export function loadGetterTupleChangeOwner(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _newOwner = source.readAddress();
    return { $$type: 'ChangeOwner' as const, queryId: _queryId, newOwner: _newOwner };
}

export function storeTupleChangeOwner(source: ChangeOwner) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeAddress(source.newOwner);
    return builder.build();
}

export function dictValueParserChangeOwner(): DictionaryValue<ChangeOwner> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeChangeOwner(src)).endCell());
        },
        parse: (src) => {
            return loadChangeOwner(src.loadRef().beginParse());
        }
    }
}

export type ChangeOwnerOk = {
    $$type: 'ChangeOwnerOk';
    queryId: bigint;
    newOwner: Address;
}

export function storeChangeOwnerOk(src: ChangeOwnerOk) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(846932810, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeAddress(src.newOwner);
    };
}

export function loadChangeOwnerOk(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 846932810) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _newOwner = sc_0.loadAddress();
    return { $$type: 'ChangeOwnerOk' as const, queryId: _queryId, newOwner: _newOwner };
}

export function loadTupleChangeOwnerOk(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _newOwner = source.readAddress();
    return { $$type: 'ChangeOwnerOk' as const, queryId: _queryId, newOwner: _newOwner };
}

export function loadGetterTupleChangeOwnerOk(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _newOwner = source.readAddress();
    return { $$type: 'ChangeOwnerOk' as const, queryId: _queryId, newOwner: _newOwner };
}

export function storeTupleChangeOwnerOk(source: ChangeOwnerOk) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeAddress(source.newOwner);
    return builder.build();
}

export function dictValueParserChangeOwnerOk(): DictionaryValue<ChangeOwnerOk> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeChangeOwnerOk(src)).endCell());
        },
        parse: (src) => {
            return loadChangeOwnerOk(src.loadRef().beginParse());
        }
    }
}

export type InitConfig = {
    $$type: 'InitConfig';
    treasury: Address;
    houseFee: bigint;
    minBet: bigint;
    maxBet: bigint;
    roundTime: bigint;
}

export function storeInitConfig(src: InitConfig) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2673672256, 32);
        b_0.storeAddress(src.treasury);
        b_0.storeUint(src.houseFee, 16);
        b_0.storeCoins(src.minBet);
        b_0.storeCoins(src.maxBet);
        b_0.storeUint(src.roundTime, 32);
    };
}

export function loadInitConfig(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2673672256) { throw Error('Invalid prefix'); }
    const _treasury = sc_0.loadAddress();
    const _houseFee = sc_0.loadUintBig(16);
    const _minBet = sc_0.loadCoins();
    const _maxBet = sc_0.loadCoins();
    const _roundTime = sc_0.loadUintBig(32);
    return { $$type: 'InitConfig' as const, treasury: _treasury, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime };
}

export function loadTupleInitConfig(source: TupleReader) {
    const _treasury = source.readAddress();
    const _houseFee = source.readBigNumber();
    const _minBet = source.readBigNumber();
    const _maxBet = source.readBigNumber();
    const _roundTime = source.readBigNumber();
    return { $$type: 'InitConfig' as const, treasury: _treasury, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime };
}

export function loadGetterTupleInitConfig(source: TupleReader) {
    const _treasury = source.readAddress();
    const _houseFee = source.readBigNumber();
    const _minBet = source.readBigNumber();
    const _maxBet = source.readBigNumber();
    const _roundTime = source.readBigNumber();
    return { $$type: 'InitConfig' as const, treasury: _treasury, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime };
}

export function storeTupleInitConfig(source: InitConfig) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.treasury);
    builder.writeNumber(source.houseFee);
    builder.writeNumber(source.minBet);
    builder.writeNumber(source.maxBet);
    builder.writeNumber(source.roundTime);
    return builder.build();
}

export function dictValueParserInitConfig(): DictionaryValue<InitConfig> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeInitConfig(src)).endCell());
        },
        parse: (src) => {
            return loadInitConfig(src.loadRef().beginParse());
        }
    }
}

export type Withdraw = {
    $$type: 'Withdraw';
    amount: bigint;
}

export function storeWithdraw(src: Withdraw) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(195467089, 32);
        b_0.storeCoins(src.amount);
    };
}

export function loadWithdraw(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 195467089) { throw Error('Invalid prefix'); }
    const _amount = sc_0.loadCoins();
    return { $$type: 'Withdraw' as const, amount: _amount };
}

export function loadTupleWithdraw(source: TupleReader) {
    const _amount = source.readBigNumber();
    return { $$type: 'Withdraw' as const, amount: _amount };
}

export function loadGetterTupleWithdraw(source: TupleReader) {
    const _amount = source.readBigNumber();
    return { $$type: 'Withdraw' as const, amount: _amount };
}

export function storeTupleWithdraw(source: Withdraw) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.amount);
    return builder.build();
}

export function dictValueParserWithdraw(): DictionaryValue<Withdraw> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeWithdraw(src)).endCell());
        },
        parse: (src) => {
            return loadWithdraw(src.loadRef().beginParse());
        }
    }
}

export type CreateGame = {
    $$type: 'CreateGame';
    mapId: bigint;
    commitHash: bigint;
}

export function storeCreateGame(src: CreateGame) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(3373137410, 32);
        b_0.storeUint(src.mapId, 8);
        b_0.storeUint(src.commitHash, 256);
    };
}

export function loadCreateGame(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 3373137410) { throw Error('Invalid prefix'); }
    const _mapId = sc_0.loadUintBig(8);
    const _commitHash = sc_0.loadUintBig(256);
    return { $$type: 'CreateGame' as const, mapId: _mapId, commitHash: _commitHash };
}

export function loadTupleCreateGame(source: TupleReader) {
    const _mapId = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    return { $$type: 'CreateGame' as const, mapId: _mapId, commitHash: _commitHash };
}

export function loadGetterTupleCreateGame(source: TupleReader) {
    const _mapId = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    return { $$type: 'CreateGame' as const, mapId: _mapId, commitHash: _commitHash };
}

export function storeTupleCreateGame(source: CreateGame) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mapId);
    builder.writeNumber(source.commitHash);
    return builder.build();
}

export function dictValueParserCreateGame(): DictionaryValue<CreateGame> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeCreateGame(src)).endCell());
        },
        parse: (src) => {
            return loadCreateGame(src.loadRef().beginParse());
        }
    }
}

export type SetGameConfig = {
    $$type: 'SetGameConfig';
    houseFee: bigint;
    minBet: bigint;
    maxBet: bigint;
    roundTime: bigint;
    mapId: bigint;
    commitHash: bigint;
}

export function storeSetGameConfig(src: SetGameConfig) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(793987244, 32);
        b_0.storeUint(src.houseFee, 16);
        b_0.storeCoins(src.minBet);
        b_0.storeCoins(src.maxBet);
        b_0.storeUint(src.roundTime, 32);
        b_0.storeUint(src.mapId, 8);
        b_0.storeUint(src.commitHash, 256);
    };
}

export function loadSetGameConfig(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 793987244) { throw Error('Invalid prefix'); }
    const _houseFee = sc_0.loadUintBig(16);
    const _minBet = sc_0.loadCoins();
    const _maxBet = sc_0.loadCoins();
    const _roundTime = sc_0.loadUintBig(32);
    const _mapId = sc_0.loadUintBig(8);
    const _commitHash = sc_0.loadUintBig(256);
    return { $$type: 'SetGameConfig' as const, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, mapId: _mapId, commitHash: _commitHash };
}

export function loadTupleSetGameConfig(source: TupleReader) {
    const _houseFee = source.readBigNumber();
    const _minBet = source.readBigNumber();
    const _maxBet = source.readBigNumber();
    const _roundTime = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    return { $$type: 'SetGameConfig' as const, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, mapId: _mapId, commitHash: _commitHash };
}

export function loadGetterTupleSetGameConfig(source: TupleReader) {
    const _houseFee = source.readBigNumber();
    const _minBet = source.readBigNumber();
    const _maxBet = source.readBigNumber();
    const _roundTime = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    return { $$type: 'SetGameConfig' as const, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, mapId: _mapId, commitHash: _commitHash };
}

export function storeTupleSetGameConfig(source: SetGameConfig) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.houseFee);
    builder.writeNumber(source.minBet);
    builder.writeNumber(source.maxBet);
    builder.writeNumber(source.roundTime);
    builder.writeNumber(source.mapId);
    builder.writeNumber(source.commitHash);
    return builder.build();
}

export function dictValueParserSetGameConfig(): DictionaryValue<SetGameConfig> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSetGameConfig(src)).endCell());
        },
        parse: (src) => {
            return loadSetGameConfig(src.loadRef().beginParse());
        }
    }
}

export type PlaceBet = {
    $$type: 'PlaceBet';
    skin: bigint;
    posX: bigint;
    posY: bigint;
}

export function storePlaceBet(src: PlaceBet) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2856584092, 32);
        b_0.storeUint(src.skin, 8);
        b_0.storeUint(src.posX, 16);
        b_0.storeUint(src.posY, 16);
    };
}

export function loadPlaceBet(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2856584092) { throw Error('Invalid prefix'); }
    const _skin = sc_0.loadUintBig(8);
    const _posX = sc_0.loadUintBig(16);
    const _posY = sc_0.loadUintBig(16);
    return { $$type: 'PlaceBet' as const, skin: _skin, posX: _posX, posY: _posY };
}

export function loadTuplePlaceBet(source: TupleReader) {
    const _skin = source.readBigNumber();
    const _posX = source.readBigNumber();
    const _posY = source.readBigNumber();
    return { $$type: 'PlaceBet' as const, skin: _skin, posX: _posX, posY: _posY };
}

export function loadGetterTuplePlaceBet(source: TupleReader) {
    const _skin = source.readBigNumber();
    const _posX = source.readBigNumber();
    const _posY = source.readBigNumber();
    return { $$type: 'PlaceBet' as const, skin: _skin, posX: _posX, posY: _posY };
}

export function storeTuplePlaceBet(source: PlaceBet) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.skin);
    builder.writeNumber(source.posX);
    builder.writeNumber(source.posY);
    return builder.build();
}

export function dictValueParserPlaceBet(): DictionaryValue<PlaceBet> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storePlaceBet(src)).endCell());
        },
        parse: (src) => {
            return loadPlaceBet(src.loadRef().beginParse());
        }
    }
}

export type RevealAndEnd = {
    $$type: 'RevealAndEnd';
    secret: bigint;
}

export function storeRevealAndEnd(src: RevealAndEnd) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1984275175, 32);
        b_0.storeUint(src.secret, 256);
    };
}

export function loadRevealAndEnd(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1984275175) { throw Error('Invalid prefix'); }
    const _secret = sc_0.loadUintBig(256);
    return { $$type: 'RevealAndEnd' as const, secret: _secret };
}

export function loadTupleRevealAndEnd(source: TupleReader) {
    const _secret = source.readBigNumber();
    return { $$type: 'RevealAndEnd' as const, secret: _secret };
}

export function loadGetterTupleRevealAndEnd(source: TupleReader) {
    const _secret = source.readBigNumber();
    return { $$type: 'RevealAndEnd' as const, secret: _secret };
}

export function storeTupleRevealAndEnd(source: RevealAndEnd) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.secret);
    return builder.build();
}

export function dictValueParserRevealAndEnd(): DictionaryValue<RevealAndEnd> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeRevealAndEnd(src)).endCell());
        },
        parse: (src) => {
            return loadRevealAndEnd(src.loadRef().beginParse());
        }
    }
}

export type ClaimPrize = {
    $$type: 'ClaimPrize';
}

export function storeClaimPrize(src: ClaimPrize) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2639554183, 32);
    };
}

export function loadClaimPrize(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2639554183) { throw Error('Invalid prefix'); }
    return { $$type: 'ClaimPrize' as const };
}

export function loadTupleClaimPrize(source: TupleReader) {
    return { $$type: 'ClaimPrize' as const };
}

export function loadGetterTupleClaimPrize(source: TupleReader) {
    return { $$type: 'ClaimPrize' as const };
}

export function storeTupleClaimPrize(source: ClaimPrize) {
    const builder = new TupleBuilder();
    return builder.build();
}

export function dictValueParserClaimPrize(): DictionaryValue<ClaimPrize> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeClaimPrize(src)).endCell());
        },
        parse: (src) => {
            return loadClaimPrize(src.loadRef().beginParse());
        }
    }
}

export type CreateLobby = {
    $$type: 'CreateLobby';
    mapId: bigint;
    skin: bigint;
    commitHash: bigint;
}

export function storeCreateLobby(src: CreateLobby) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(3976891980, 32);
        b_0.storeUint(src.mapId, 8);
        b_0.storeUint(src.skin, 8);
        b_0.storeUint(src.commitHash, 256);
    };
}

export function loadCreateLobby(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 3976891980) { throw Error('Invalid prefix'); }
    const _mapId = sc_0.loadUintBig(8);
    const _skin = sc_0.loadUintBig(8);
    const _commitHash = sc_0.loadUintBig(256);
    return { $$type: 'CreateLobby' as const, mapId: _mapId, skin: _skin, commitHash: _commitHash };
}

export function loadTupleCreateLobby(source: TupleReader) {
    const _mapId = source.readBigNumber();
    const _skin = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    return { $$type: 'CreateLobby' as const, mapId: _mapId, skin: _skin, commitHash: _commitHash };
}

export function loadGetterTupleCreateLobby(source: TupleReader) {
    const _mapId = source.readBigNumber();
    const _skin = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    return { $$type: 'CreateLobby' as const, mapId: _mapId, skin: _skin, commitHash: _commitHash };
}

export function storeTupleCreateLobby(source: CreateLobby) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mapId);
    builder.writeNumber(source.skin);
    builder.writeNumber(source.commitHash);
    return builder.build();
}

export function dictValueParserCreateLobby(): DictionaryValue<CreateLobby> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeCreateLobby(src)).endCell());
        },
        parse: (src) => {
            return loadCreateLobby(src.loadRef().beginParse());
        }
    }
}

export type SetLobbyConfig = {
    $$type: 'SetLobbyConfig';
    playerA: Address;
    amount: bigint;
    houseFee: bigint;
    mapId: bigint;
    skinA: bigint;
    commitHash: bigint;
}

export function storeSetLobbyConfig(src: SetLobbyConfig) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2415301961, 32);
        b_0.storeAddress(src.playerA);
        b_0.storeCoins(src.amount);
        b_0.storeUint(src.houseFee, 16);
        b_0.storeUint(src.mapId, 8);
        b_0.storeUint(src.skinA, 8);
        b_0.storeUint(src.commitHash, 256);
    };
}

export function loadSetLobbyConfig(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2415301961) { throw Error('Invalid prefix'); }
    const _playerA = sc_0.loadAddress();
    const _amount = sc_0.loadCoins();
    const _houseFee = sc_0.loadUintBig(16);
    const _mapId = sc_0.loadUintBig(8);
    const _skinA = sc_0.loadUintBig(8);
    const _commitHash = sc_0.loadUintBig(256);
    return { $$type: 'SetLobbyConfig' as const, playerA: _playerA, amount: _amount, houseFee: _houseFee, mapId: _mapId, skinA: _skinA, commitHash: _commitHash };
}

export function loadTupleSetLobbyConfig(source: TupleReader) {
    const _playerA = source.readAddress();
    const _amount = source.readBigNumber();
    const _houseFee = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _skinA = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    return { $$type: 'SetLobbyConfig' as const, playerA: _playerA, amount: _amount, houseFee: _houseFee, mapId: _mapId, skinA: _skinA, commitHash: _commitHash };
}

export function loadGetterTupleSetLobbyConfig(source: TupleReader) {
    const _playerA = source.readAddress();
    const _amount = source.readBigNumber();
    const _houseFee = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _skinA = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    return { $$type: 'SetLobbyConfig' as const, playerA: _playerA, amount: _amount, houseFee: _houseFee, mapId: _mapId, skinA: _skinA, commitHash: _commitHash };
}

export function storeTupleSetLobbyConfig(source: SetLobbyConfig) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.playerA);
    builder.writeNumber(source.amount);
    builder.writeNumber(source.houseFee);
    builder.writeNumber(source.mapId);
    builder.writeNumber(source.skinA);
    builder.writeNumber(source.commitHash);
    return builder.build();
}

export function dictValueParserSetLobbyConfig(): DictionaryValue<SetLobbyConfig> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSetLobbyConfig(src)).endCell());
        },
        parse: (src) => {
            return loadSetLobbyConfig(src.loadRef().beginParse());
        }
    }
}

export type JoinLobby = {
    $$type: 'JoinLobby';
    skin: bigint;
}

export function storeJoinLobby(src: JoinLobby) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(4223482501, 32);
        b_0.storeUint(src.skin, 8);
    };
}

export function loadJoinLobby(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 4223482501) { throw Error('Invalid prefix'); }
    const _skin = sc_0.loadUintBig(8);
    return { $$type: 'JoinLobby' as const, skin: _skin };
}

export function loadTupleJoinLobby(source: TupleReader) {
    const _skin = source.readBigNumber();
    return { $$type: 'JoinLobby' as const, skin: _skin };
}

export function loadGetterTupleJoinLobby(source: TupleReader) {
    const _skin = source.readBigNumber();
    return { $$type: 'JoinLobby' as const, skin: _skin };
}

export function storeTupleJoinLobby(source: JoinLobby) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.skin);
    return builder.build();
}

export function dictValueParserJoinLobby(): DictionaryValue<JoinLobby> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeJoinLobby(src)).endCell());
        },
        parse: (src) => {
            return loadJoinLobby(src.loadRef().beginParse());
        }
    }
}

export type SettleLobby = {
    $$type: 'SettleLobby';
    lobbyId: bigint;
    secret: bigint;
}

export function storeSettleLobby(src: SettleLobby) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1018103688, 32);
        b_0.storeUint(src.lobbyId, 64);
        b_0.storeUint(src.secret, 256);
    };
}

export function loadSettleLobby(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1018103688) { throw Error('Invalid prefix'); }
    const _lobbyId = sc_0.loadUintBig(64);
    const _secret = sc_0.loadUintBig(256);
    return { $$type: 'SettleLobby' as const, lobbyId: _lobbyId, secret: _secret };
}

export function loadTupleSettleLobby(source: TupleReader) {
    const _lobbyId = source.readBigNumber();
    const _secret = source.readBigNumber();
    return { $$type: 'SettleLobby' as const, lobbyId: _lobbyId, secret: _secret };
}

export function loadGetterTupleSettleLobby(source: TupleReader) {
    const _lobbyId = source.readBigNumber();
    const _secret = source.readBigNumber();
    return { $$type: 'SettleLobby' as const, lobbyId: _lobbyId, secret: _secret };
}

export function storeTupleSettleLobby(source: SettleLobby) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.lobbyId);
    builder.writeNumber(source.secret);
    return builder.build();
}

export function dictValueParserSettleLobby(): DictionaryValue<SettleLobby> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSettleLobby(src)).endCell());
        },
        parse: (src) => {
            return loadSettleLobby(src.loadRef().beginParse());
        }
    }
}

export type RescueLobby = {
    $$type: 'RescueLobby';
    lobbyId: bigint;
}

export function storeRescueLobby(src: RescueLobby) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(680795721, 32);
        b_0.storeUint(src.lobbyId, 64);
    };
}

export function loadRescueLobby(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 680795721) { throw Error('Invalid prefix'); }
    const _lobbyId = sc_0.loadUintBig(64);
    return { $$type: 'RescueLobby' as const, lobbyId: _lobbyId };
}

export function loadTupleRescueLobby(source: TupleReader) {
    const _lobbyId = source.readBigNumber();
    return { $$type: 'RescueLobby' as const, lobbyId: _lobbyId };
}

export function loadGetterTupleRescueLobby(source: TupleReader) {
    const _lobbyId = source.readBigNumber();
    return { $$type: 'RescueLobby' as const, lobbyId: _lobbyId };
}

export function storeTupleRescueLobby(source: RescueLobby) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.lobbyId);
    return builder.build();
}

export function dictValueParserRescueLobby(): DictionaryValue<RescueLobby> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeRescueLobby(src)).endCell());
        },
        parse: (src) => {
            return loadRescueLobby(src.loadRef().beginParse());
        }
    }
}

export type InternalGameEnded = {
    $$type: 'InternalGameEnded';
    gameId: bigint;
    winner: Address;
    prize: bigint;
    fee: bigint;
}

export function storeInternalGameEnded(src: InternalGameEnded) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(3996933768, 32);
        b_0.storeUint(src.gameId, 64);
        b_0.storeAddress(src.winner);
        b_0.storeCoins(src.prize);
        b_0.storeCoins(src.fee);
    };
}

export function loadInternalGameEnded(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 3996933768) { throw Error('Invalid prefix'); }
    const _gameId = sc_0.loadUintBig(64);
    const _winner = sc_0.loadAddress();
    const _prize = sc_0.loadCoins();
    const _fee = sc_0.loadCoins();
    return { $$type: 'InternalGameEnded' as const, gameId: _gameId, winner: _winner, prize: _prize, fee: _fee };
}

export function loadTupleInternalGameEnded(source: TupleReader) {
    const _gameId = source.readBigNumber();
    const _winner = source.readAddress();
    const _prize = source.readBigNumber();
    const _fee = source.readBigNumber();
    return { $$type: 'InternalGameEnded' as const, gameId: _gameId, winner: _winner, prize: _prize, fee: _fee };
}

export function loadGetterTupleInternalGameEnded(source: TupleReader) {
    const _gameId = source.readBigNumber();
    const _winner = source.readAddress();
    const _prize = source.readBigNumber();
    const _fee = source.readBigNumber();
    return { $$type: 'InternalGameEnded' as const, gameId: _gameId, winner: _winner, prize: _prize, fee: _fee };
}

export function storeTupleInternalGameEnded(source: InternalGameEnded) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.gameId);
    builder.writeAddress(source.winner);
    builder.writeNumber(source.prize);
    builder.writeNumber(source.fee);
    return builder.build();
}

export function dictValueParserInternalGameEnded(): DictionaryValue<InternalGameEnded> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeInternalGameEnded(src)).endCell());
        },
        parse: (src) => {
            return loadInternalGameEnded(src.loadRef().beginParse());
        }
    }
}

export type InternalLobbySettled = {
    $$type: 'InternalLobbySettled';
    lobbyId: bigint;
    winner: Address;
    prize: bigint;
    fee: bigint;
}

export function storeInternalLobbySettled(src: InternalLobbySettled) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2568781984, 32);
        b_0.storeUint(src.lobbyId, 64);
        b_0.storeAddress(src.winner);
        b_0.storeCoins(src.prize);
        b_0.storeCoins(src.fee);
    };
}

export function loadInternalLobbySettled(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2568781984) { throw Error('Invalid prefix'); }
    const _lobbyId = sc_0.loadUintBig(64);
    const _winner = sc_0.loadAddress();
    const _prize = sc_0.loadCoins();
    const _fee = sc_0.loadCoins();
    return { $$type: 'InternalLobbySettled' as const, lobbyId: _lobbyId, winner: _winner, prize: _prize, fee: _fee };
}

export function loadTupleInternalLobbySettled(source: TupleReader) {
    const _lobbyId = source.readBigNumber();
    const _winner = source.readAddress();
    const _prize = source.readBigNumber();
    const _fee = source.readBigNumber();
    return { $$type: 'InternalLobbySettled' as const, lobbyId: _lobbyId, winner: _winner, prize: _prize, fee: _fee };
}

export function loadGetterTupleInternalLobbySettled(source: TupleReader) {
    const _lobbyId = source.readBigNumber();
    const _winner = source.readAddress();
    const _prize = source.readBigNumber();
    const _fee = source.readBigNumber();
    return { $$type: 'InternalLobbySettled' as const, lobbyId: _lobbyId, winner: _winner, prize: _prize, fee: _fee };
}

export function storeTupleInternalLobbySettled(source: InternalLobbySettled) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.lobbyId);
    builder.writeAddress(source.winner);
    builder.writeNumber(source.prize);
    builder.writeNumber(source.fee);
    return builder.build();
}

export function dictValueParserInternalLobbySettled(): DictionaryValue<InternalLobbySettled> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeInternalLobbySettled(src)).endCell());
        },
        parse: (src) => {
            return loadInternalLobbySettled(src.loadRef().beginParse());
        }
    }
}

export type InternalUnlock = {
    $$type: 'InternalUnlock';
}

export function storeInternalUnlock(src: InternalUnlock) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2698052650, 32);
    };
}

export function loadInternalUnlock(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2698052650) { throw Error('Invalid prefix'); }
    return { $$type: 'InternalUnlock' as const };
}

export function loadTupleInternalUnlock(source: TupleReader) {
    return { $$type: 'InternalUnlock' as const };
}

export function loadGetterTupleInternalUnlock(source: TupleReader) {
    return { $$type: 'InternalUnlock' as const };
}

export function storeTupleInternalUnlock(source: InternalUnlock) {
    const builder = new TupleBuilder();
    return builder.build();
}

export function dictValueParserInternalUnlock(): DictionaryValue<InternalUnlock> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeInternalUnlock(src)).endCell());
        },
        parse: (src) => {
            return loadInternalUnlock(src.loadRef().beginParse());
        }
    }
}

export type BetInfo = {
    $$type: 'BetInfo';
    player: Address;
    amount: bigint;
    skin: bigint;
    posX: bigint;
    posY: bigint;
}

export function storeBetInfo(src: BetInfo) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.player);
        b_0.storeCoins(src.amount);
        b_0.storeUint(src.skin, 8);
        b_0.storeUint(src.posX, 16);
        b_0.storeUint(src.posY, 16);
    };
}

export function loadBetInfo(slice: Slice) {
    const sc_0 = slice;
    const _player = sc_0.loadAddress();
    const _amount = sc_0.loadCoins();
    const _skin = sc_0.loadUintBig(8);
    const _posX = sc_0.loadUintBig(16);
    const _posY = sc_0.loadUintBig(16);
    return { $$type: 'BetInfo' as const, player: _player, amount: _amount, skin: _skin, posX: _posX, posY: _posY };
}

export function loadTupleBetInfo(source: TupleReader) {
    const _player = source.readAddress();
    const _amount = source.readBigNumber();
    const _skin = source.readBigNumber();
    const _posX = source.readBigNumber();
    const _posY = source.readBigNumber();
    return { $$type: 'BetInfo' as const, player: _player, amount: _amount, skin: _skin, posX: _posX, posY: _posY };
}

export function loadGetterTupleBetInfo(source: TupleReader) {
    const _player = source.readAddress();
    const _amount = source.readBigNumber();
    const _skin = source.readBigNumber();
    const _posX = source.readBigNumber();
    const _posY = source.readBigNumber();
    return { $$type: 'BetInfo' as const, player: _player, amount: _amount, skin: _skin, posX: _posX, posY: _posY };
}

export function storeTupleBetInfo(source: BetInfo) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.player);
    builder.writeNumber(source.amount);
    builder.writeNumber(source.skin);
    builder.writeNumber(source.posX);
    builder.writeNumber(source.posY);
    return builder.build();
}

export function dictValueParserBetInfo(): DictionaryValue<BetInfo> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeBetInfo(src)).endCell());
        },
        parse: (src) => {
            return loadBetInfo(src.loadRef().beginParse());
        }
    }
}

export type GameState = {
    $$type: 'GameState';
    gameId: bigint;
    status: bigint;
    mapId: bigint;
    startDate: bigint;
    endDate: bigint;
    totalPot: bigint;
    betCount: bigint;
    userCount: bigint;
    winner: Address | null;
    winnerPrize: bigint;
    prizeSent: boolean;
}

export function storeGameState(src: GameState) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(src.gameId, 64);
        b_0.storeUint(src.status, 8);
        b_0.storeUint(src.mapId, 8);
        b_0.storeUint(src.startDate, 64);
        b_0.storeUint(src.endDate, 64);
        b_0.storeCoins(src.totalPot);
        b_0.storeUint(src.betCount, 32);
        b_0.storeUint(src.userCount, 32);
        b_0.storeAddress(src.winner);
        b_0.storeCoins(src.winnerPrize);
        b_0.storeBit(src.prizeSent);
    };
}

export function loadGameState(slice: Slice) {
    const sc_0 = slice;
    const _gameId = sc_0.loadUintBig(64);
    const _status = sc_0.loadUintBig(8);
    const _mapId = sc_0.loadUintBig(8);
    const _startDate = sc_0.loadUintBig(64);
    const _endDate = sc_0.loadUintBig(64);
    const _totalPot = sc_0.loadCoins();
    const _betCount = sc_0.loadUintBig(32);
    const _userCount = sc_0.loadUintBig(32);
    const _winner = sc_0.loadMaybeAddress();
    const _winnerPrize = sc_0.loadCoins();
    const _prizeSent = sc_0.loadBit();
    return { $$type: 'GameState' as const, gameId: _gameId, status: _status, mapId: _mapId, startDate: _startDate, endDate: _endDate, totalPot: _totalPot, betCount: _betCount, userCount: _userCount, winner: _winner, winnerPrize: _winnerPrize, prizeSent: _prizeSent };
}

export function loadTupleGameState(source: TupleReader) {
    const _gameId = source.readBigNumber();
    const _status = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _startDate = source.readBigNumber();
    const _endDate = source.readBigNumber();
    const _totalPot = source.readBigNumber();
    const _betCount = source.readBigNumber();
    const _userCount = source.readBigNumber();
    const _winner = source.readAddressOpt();
    const _winnerPrize = source.readBigNumber();
    const _prizeSent = source.readBoolean();
    return { $$type: 'GameState' as const, gameId: _gameId, status: _status, mapId: _mapId, startDate: _startDate, endDate: _endDate, totalPot: _totalPot, betCount: _betCount, userCount: _userCount, winner: _winner, winnerPrize: _winnerPrize, prizeSent: _prizeSent };
}

export function loadGetterTupleGameState(source: TupleReader) {
    const _gameId = source.readBigNumber();
    const _status = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _startDate = source.readBigNumber();
    const _endDate = source.readBigNumber();
    const _totalPot = source.readBigNumber();
    const _betCount = source.readBigNumber();
    const _userCount = source.readBigNumber();
    const _winner = source.readAddressOpt();
    const _winnerPrize = source.readBigNumber();
    const _prizeSent = source.readBoolean();
    return { $$type: 'GameState' as const, gameId: _gameId, status: _status, mapId: _mapId, startDate: _startDate, endDate: _endDate, totalPot: _totalPot, betCount: _betCount, userCount: _userCount, winner: _winner, winnerPrize: _winnerPrize, prizeSent: _prizeSent };
}

export function storeTupleGameState(source: GameState) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.gameId);
    builder.writeNumber(source.status);
    builder.writeNumber(source.mapId);
    builder.writeNumber(source.startDate);
    builder.writeNumber(source.endDate);
    builder.writeNumber(source.totalPot);
    builder.writeNumber(source.betCount);
    builder.writeNumber(source.userCount);
    builder.writeAddress(source.winner);
    builder.writeNumber(source.winnerPrize);
    builder.writeBoolean(source.prizeSent);
    return builder.build();
}

export function dictValueParserGameState(): DictionaryValue<GameState> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeGameState(src)).endCell());
        },
        parse: (src) => {
            return loadGameState(src.loadRef().beginParse());
        }
    }
}

export type LobbyState = {
    $$type: 'LobbyState';
    lobbyId: bigint;
    status: bigint;
    playerA: Address;
    playerB: Address | null;
    amount: bigint;
    mapId: bigint;
    skinA: bigint;
    skinB: bigint;
    winner: Address | null;
    createdAt: bigint;
}

export function storeLobbyState(src: LobbyState) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(src.lobbyId, 64);
        b_0.storeUint(src.status, 8);
        b_0.storeAddress(src.playerA);
        b_0.storeAddress(src.playerB);
        b_0.storeCoins(src.amount);
        b_0.storeUint(src.mapId, 8);
        b_0.storeUint(src.skinA, 8);
        b_0.storeUint(src.skinB, 8);
        b_0.storeAddress(src.winner);
        const b_1 = new Builder();
        b_1.storeUint(src.createdAt, 64);
        b_0.storeRef(b_1.endCell());
    };
}

export function loadLobbyState(slice: Slice) {
    const sc_0 = slice;
    const _lobbyId = sc_0.loadUintBig(64);
    const _status = sc_0.loadUintBig(8);
    const _playerA = sc_0.loadAddress();
    const _playerB = sc_0.loadMaybeAddress();
    const _amount = sc_0.loadCoins();
    const _mapId = sc_0.loadUintBig(8);
    const _skinA = sc_0.loadUintBig(8);
    const _skinB = sc_0.loadUintBig(8);
    const _winner = sc_0.loadMaybeAddress();
    const sc_1 = sc_0.loadRef().beginParse();
    const _createdAt = sc_1.loadUintBig(64);
    return { $$type: 'LobbyState' as const, lobbyId: _lobbyId, status: _status, playerA: _playerA, playerB: _playerB, amount: _amount, mapId: _mapId, skinA: _skinA, skinB: _skinB, winner: _winner, createdAt: _createdAt };
}

export function loadTupleLobbyState(source: TupleReader) {
    const _lobbyId = source.readBigNumber();
    const _status = source.readBigNumber();
    const _playerA = source.readAddress();
    const _playerB = source.readAddressOpt();
    const _amount = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _skinA = source.readBigNumber();
    const _skinB = source.readBigNumber();
    const _winner = source.readAddressOpt();
    const _createdAt = source.readBigNumber();
    return { $$type: 'LobbyState' as const, lobbyId: _lobbyId, status: _status, playerA: _playerA, playerB: _playerB, amount: _amount, mapId: _mapId, skinA: _skinA, skinB: _skinB, winner: _winner, createdAt: _createdAt };
}

export function loadGetterTupleLobbyState(source: TupleReader) {
    const _lobbyId = source.readBigNumber();
    const _status = source.readBigNumber();
    const _playerA = source.readAddress();
    const _playerB = source.readAddressOpt();
    const _amount = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _skinA = source.readBigNumber();
    const _skinB = source.readBigNumber();
    const _winner = source.readAddressOpt();
    const _createdAt = source.readBigNumber();
    return { $$type: 'LobbyState' as const, lobbyId: _lobbyId, status: _status, playerA: _playerA, playerB: _playerB, amount: _amount, mapId: _mapId, skinA: _skinA, skinB: _skinB, winner: _winner, createdAt: _createdAt };
}

export function storeTupleLobbyState(source: LobbyState) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.lobbyId);
    builder.writeNumber(source.status);
    builder.writeAddress(source.playerA);
    builder.writeAddress(source.playerB);
    builder.writeNumber(source.amount);
    builder.writeNumber(source.mapId);
    builder.writeNumber(source.skinA);
    builder.writeNumber(source.skinB);
    builder.writeAddress(source.winner);
    builder.writeNumber(source.createdAt);
    return builder.build();
}

export function dictValueParserLobbyState(): DictionaryValue<LobbyState> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeLobbyState(src)).endCell());
        },
        parse: (src) => {
            return loadLobbyState(src.loadRef().beginParse());
        }
    }
}

export type MasterConfig = {
    $$type: 'MasterConfig';
    admin: Address;
    treasury: Address;
    houseFee: bigint;
    minBet: bigint;
    maxBet: bigint;
    roundTime: bigint;
    currentRound: bigint;
    lobbyCount: bigint;
    locked: boolean;
}

export function storeMasterConfig(src: MasterConfig) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.admin);
        b_0.storeAddress(src.treasury);
        b_0.storeUint(src.houseFee, 16);
        b_0.storeCoins(src.minBet);
        b_0.storeCoins(src.maxBet);
        b_0.storeUint(src.roundTime, 32);
        b_0.storeUint(src.currentRound, 64);
        b_0.storeUint(src.lobbyCount, 64);
        b_0.storeBit(src.locked);
    };
}

export function loadMasterConfig(slice: Slice) {
    const sc_0 = slice;
    const _admin = sc_0.loadAddress();
    const _treasury = sc_0.loadAddress();
    const _houseFee = sc_0.loadUintBig(16);
    const _minBet = sc_0.loadCoins();
    const _maxBet = sc_0.loadCoins();
    const _roundTime = sc_0.loadUintBig(32);
    const _currentRound = sc_0.loadUintBig(64);
    const _lobbyCount = sc_0.loadUintBig(64);
    const _locked = sc_0.loadBit();
    return { $$type: 'MasterConfig' as const, admin: _admin, treasury: _treasury, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, currentRound: _currentRound, lobbyCount: _lobbyCount, locked: _locked };
}

export function loadTupleMasterConfig(source: TupleReader) {
    const _admin = source.readAddress();
    const _treasury = source.readAddress();
    const _houseFee = source.readBigNumber();
    const _minBet = source.readBigNumber();
    const _maxBet = source.readBigNumber();
    const _roundTime = source.readBigNumber();
    const _currentRound = source.readBigNumber();
    const _lobbyCount = source.readBigNumber();
    const _locked = source.readBoolean();
    return { $$type: 'MasterConfig' as const, admin: _admin, treasury: _treasury, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, currentRound: _currentRound, lobbyCount: _lobbyCount, locked: _locked };
}

export function loadGetterTupleMasterConfig(source: TupleReader) {
    const _admin = source.readAddress();
    const _treasury = source.readAddress();
    const _houseFee = source.readBigNumber();
    const _minBet = source.readBigNumber();
    const _maxBet = source.readBigNumber();
    const _roundTime = source.readBigNumber();
    const _currentRound = source.readBigNumber();
    const _lobbyCount = source.readBigNumber();
    const _locked = source.readBoolean();
    return { $$type: 'MasterConfig' as const, admin: _admin, treasury: _treasury, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, currentRound: _currentRound, lobbyCount: _lobbyCount, locked: _locked };
}

export function storeTupleMasterConfig(source: MasterConfig) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.admin);
    builder.writeAddress(source.treasury);
    builder.writeNumber(source.houseFee);
    builder.writeNumber(source.minBet);
    builder.writeNumber(source.maxBet);
    builder.writeNumber(source.roundTime);
    builder.writeNumber(source.currentRound);
    builder.writeNumber(source.lobbyCount);
    builder.writeBoolean(source.locked);
    return builder.build();
}

export function dictValueParserMasterConfig(): DictionaryValue<MasterConfig> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeMasterConfig(src)).endCell());
        },
        parse: (src) => {
            return loadMasterConfig(src.loadRef().beginParse());
        }
    }
}

export type Domin8Game$Data = {
    $$type: 'Domin8Game$Data';
    parent: Address;
    gameId: bigint;
    configured: boolean;
    houseFee: bigint;
    minBet: bigint;
    maxBet: bigint;
    roundTime: bigint;
    mapId: bigint;
    commitHash: bigint;
    status: bigint;
    startDate: bigint;
    endDate: bigint;
    totalPot: bigint;
    betCount: bigint;
    userCount: bigint;
    winner: Address | null;
    winnerPrize: bigint;
    prizeSent: boolean;
    bets: Dictionary<number, BetInfo>;
    playerBetCounts: Dictionary<Address, number>;
}

export function storeDomin8Game$Data(src: Domin8Game$Data) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.parent);
        b_0.storeUint(src.gameId, 64);
        b_0.storeBit(src.configured);
        b_0.storeUint(src.houseFee, 16);
        b_0.storeCoins(src.minBet);
        b_0.storeCoins(src.maxBet);
        b_0.storeUint(src.roundTime, 32);
        b_0.storeUint(src.mapId, 8);
        b_0.storeUint(src.commitHash, 256);
        b_0.storeUint(src.status, 8);
        b_0.storeUint(src.startDate, 64);
        const b_1 = new Builder();
        b_1.storeUint(src.endDate, 64);
        b_1.storeCoins(src.totalPot);
        b_1.storeUint(src.betCount, 32);
        b_1.storeUint(src.userCount, 32);
        b_1.storeAddress(src.winner);
        b_1.storeCoins(src.winnerPrize);
        b_1.storeBit(src.prizeSent);
        b_1.storeDict(src.bets, Dictionary.Keys.Uint(32), dictValueParserBetInfo());
        b_1.storeDict(src.playerBetCounts, Dictionary.Keys.Address(), Dictionary.Values.Uint(32));
        b_0.storeRef(b_1.endCell());
    };
}

export function loadDomin8Game$Data(slice: Slice) {
    const sc_0 = slice;
    const _parent = sc_0.loadAddress();
    const _gameId = sc_0.loadUintBig(64);
    const _configured = sc_0.loadBit();
    const _houseFee = sc_0.loadUintBig(16);
    const _minBet = sc_0.loadCoins();
    const _maxBet = sc_0.loadCoins();
    const _roundTime = sc_0.loadUintBig(32);
    const _mapId = sc_0.loadUintBig(8);
    const _commitHash = sc_0.loadUintBig(256);
    const _status = sc_0.loadUintBig(8);
    const _startDate = sc_0.loadUintBig(64);
    const sc_1 = sc_0.loadRef().beginParse();
    const _endDate = sc_1.loadUintBig(64);
    const _totalPot = sc_1.loadCoins();
    const _betCount = sc_1.loadUintBig(32);
    const _userCount = sc_1.loadUintBig(32);
    const _winner = sc_1.loadMaybeAddress();
    const _winnerPrize = sc_1.loadCoins();
    const _prizeSent = sc_1.loadBit();
    const _bets = Dictionary.load(Dictionary.Keys.Uint(32), dictValueParserBetInfo(), sc_1);
    const _playerBetCounts = Dictionary.load(Dictionary.Keys.Address(), Dictionary.Values.Uint(32), sc_1);
    return { $$type: 'Domin8Game$Data' as const, parent: _parent, gameId: _gameId, configured: _configured, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, mapId: _mapId, commitHash: _commitHash, status: _status, startDate: _startDate, endDate: _endDate, totalPot: _totalPot, betCount: _betCount, userCount: _userCount, winner: _winner, winnerPrize: _winnerPrize, prizeSent: _prizeSent, bets: _bets, playerBetCounts: _playerBetCounts };
}

export function loadTupleDomin8Game$Data(source: TupleReader) {
    const _parent = source.readAddress();
    const _gameId = source.readBigNumber();
    const _configured = source.readBoolean();
    const _houseFee = source.readBigNumber();
    const _minBet = source.readBigNumber();
    const _maxBet = source.readBigNumber();
    const _roundTime = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    const _status = source.readBigNumber();
    const _startDate = source.readBigNumber();
    const _endDate = source.readBigNumber();
    const _totalPot = source.readBigNumber();
    const _betCount = source.readBigNumber();
    source = source.readTuple();
    const _userCount = source.readBigNumber();
    const _winner = source.readAddressOpt();
    const _winnerPrize = source.readBigNumber();
    const _prizeSent = source.readBoolean();
    const _bets = Dictionary.loadDirect(Dictionary.Keys.Uint(32), dictValueParserBetInfo(), source.readCellOpt());
    const _playerBetCounts = Dictionary.loadDirect(Dictionary.Keys.Address(), Dictionary.Values.Uint(32), source.readCellOpt());
    return { $$type: 'Domin8Game$Data' as const, parent: _parent, gameId: _gameId, configured: _configured, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, mapId: _mapId, commitHash: _commitHash, status: _status, startDate: _startDate, endDate: _endDate, totalPot: _totalPot, betCount: _betCount, userCount: _userCount, winner: _winner, winnerPrize: _winnerPrize, prizeSent: _prizeSent, bets: _bets, playerBetCounts: _playerBetCounts };
}

export function loadGetterTupleDomin8Game$Data(source: TupleReader) {
    const _parent = source.readAddress();
    const _gameId = source.readBigNumber();
    const _configured = source.readBoolean();
    const _houseFee = source.readBigNumber();
    const _minBet = source.readBigNumber();
    const _maxBet = source.readBigNumber();
    const _roundTime = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    const _status = source.readBigNumber();
    const _startDate = source.readBigNumber();
    const _endDate = source.readBigNumber();
    const _totalPot = source.readBigNumber();
    const _betCount = source.readBigNumber();
    const _userCount = source.readBigNumber();
    const _winner = source.readAddressOpt();
    const _winnerPrize = source.readBigNumber();
    const _prizeSent = source.readBoolean();
    const _bets = Dictionary.loadDirect(Dictionary.Keys.Uint(32), dictValueParserBetInfo(), source.readCellOpt());
    const _playerBetCounts = Dictionary.loadDirect(Dictionary.Keys.Address(), Dictionary.Values.Uint(32), source.readCellOpt());
    return { $$type: 'Domin8Game$Data' as const, parent: _parent, gameId: _gameId, configured: _configured, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, mapId: _mapId, commitHash: _commitHash, status: _status, startDate: _startDate, endDate: _endDate, totalPot: _totalPot, betCount: _betCount, userCount: _userCount, winner: _winner, winnerPrize: _winnerPrize, prizeSent: _prizeSent, bets: _bets, playerBetCounts: _playerBetCounts };
}

export function storeTupleDomin8Game$Data(source: Domin8Game$Data) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.parent);
    builder.writeNumber(source.gameId);
    builder.writeBoolean(source.configured);
    builder.writeNumber(source.houseFee);
    builder.writeNumber(source.minBet);
    builder.writeNumber(source.maxBet);
    builder.writeNumber(source.roundTime);
    builder.writeNumber(source.mapId);
    builder.writeNumber(source.commitHash);
    builder.writeNumber(source.status);
    builder.writeNumber(source.startDate);
    builder.writeNumber(source.endDate);
    builder.writeNumber(source.totalPot);
    builder.writeNumber(source.betCount);
    builder.writeNumber(source.userCount);
    builder.writeAddress(source.winner);
    builder.writeNumber(source.winnerPrize);
    builder.writeBoolean(source.prizeSent);
    builder.writeCell(source.bets.size > 0 ? beginCell().storeDictDirect(source.bets, Dictionary.Keys.Uint(32), dictValueParserBetInfo()).endCell() : null);
    builder.writeCell(source.playerBetCounts.size > 0 ? beginCell().storeDictDirect(source.playerBetCounts, Dictionary.Keys.Address(), Dictionary.Values.Uint(32)).endCell() : null);
    return builder.build();
}

export function dictValueParserDomin8Game$Data(): DictionaryValue<Domin8Game$Data> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDomin8Game$Data(src)).endCell());
        },
        parse: (src) => {
            return loadDomin8Game$Data(src.loadRef().beginParse());
        }
    }
}

export type Domin8Lobby$Data = {
    $$type: 'Domin8Lobby$Data';
    parent: Address;
    lobbyId: bigint;
    configured: boolean;
    playerA: Address;
    playerB: Address | null;
    amount: bigint;
    houseFee: bigint;
    mapId: bigint;
    skinA: bigint;
    skinB: bigint;
    commitHash: bigint;
    status: bigint;
    winner: Address | null;
    createdAt: bigint;
}

export function storeDomin8Lobby$Data(src: Domin8Lobby$Data) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.parent);
        b_0.storeUint(src.lobbyId, 64);
        b_0.storeBit(src.configured);
        b_0.storeAddress(src.playerA);
        b_0.storeAddress(src.playerB);
        b_0.storeCoins(src.amount);
        b_0.storeUint(src.houseFee, 16);
        b_0.storeUint(src.mapId, 8);
        b_0.storeUint(src.skinA, 8);
        const b_1 = new Builder();
        b_1.storeUint(src.skinB, 8);
        b_1.storeUint(src.commitHash, 256);
        b_1.storeUint(src.status, 8);
        b_1.storeAddress(src.winner);
        b_1.storeUint(src.createdAt, 64);
        b_0.storeRef(b_1.endCell());
    };
}

export function loadDomin8Lobby$Data(slice: Slice) {
    const sc_0 = slice;
    const _parent = sc_0.loadAddress();
    const _lobbyId = sc_0.loadUintBig(64);
    const _configured = sc_0.loadBit();
    const _playerA = sc_0.loadAddress();
    const _playerB = sc_0.loadMaybeAddress();
    const _amount = sc_0.loadCoins();
    const _houseFee = sc_0.loadUintBig(16);
    const _mapId = sc_0.loadUintBig(8);
    const _skinA = sc_0.loadUintBig(8);
    const sc_1 = sc_0.loadRef().beginParse();
    const _skinB = sc_1.loadUintBig(8);
    const _commitHash = sc_1.loadUintBig(256);
    const _status = sc_1.loadUintBig(8);
    const _winner = sc_1.loadMaybeAddress();
    const _createdAt = sc_1.loadUintBig(64);
    return { $$type: 'Domin8Lobby$Data' as const, parent: _parent, lobbyId: _lobbyId, configured: _configured, playerA: _playerA, playerB: _playerB, amount: _amount, houseFee: _houseFee, mapId: _mapId, skinA: _skinA, skinB: _skinB, commitHash: _commitHash, status: _status, winner: _winner, createdAt: _createdAt };
}

export function loadTupleDomin8Lobby$Data(source: TupleReader) {
    const _parent = source.readAddress();
    const _lobbyId = source.readBigNumber();
    const _configured = source.readBoolean();
    const _playerA = source.readAddress();
    const _playerB = source.readAddressOpt();
    const _amount = source.readBigNumber();
    const _houseFee = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _skinA = source.readBigNumber();
    const _skinB = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    const _status = source.readBigNumber();
    const _winner = source.readAddressOpt();
    const _createdAt = source.readBigNumber();
    return { $$type: 'Domin8Lobby$Data' as const, parent: _parent, lobbyId: _lobbyId, configured: _configured, playerA: _playerA, playerB: _playerB, amount: _amount, houseFee: _houseFee, mapId: _mapId, skinA: _skinA, skinB: _skinB, commitHash: _commitHash, status: _status, winner: _winner, createdAt: _createdAt };
}

export function loadGetterTupleDomin8Lobby$Data(source: TupleReader) {
    const _parent = source.readAddress();
    const _lobbyId = source.readBigNumber();
    const _configured = source.readBoolean();
    const _playerA = source.readAddress();
    const _playerB = source.readAddressOpt();
    const _amount = source.readBigNumber();
    const _houseFee = source.readBigNumber();
    const _mapId = source.readBigNumber();
    const _skinA = source.readBigNumber();
    const _skinB = source.readBigNumber();
    const _commitHash = source.readBigNumber();
    const _status = source.readBigNumber();
    const _winner = source.readAddressOpt();
    const _createdAt = source.readBigNumber();
    return { $$type: 'Domin8Lobby$Data' as const, parent: _parent, lobbyId: _lobbyId, configured: _configured, playerA: _playerA, playerB: _playerB, amount: _amount, houseFee: _houseFee, mapId: _mapId, skinA: _skinA, skinB: _skinB, commitHash: _commitHash, status: _status, winner: _winner, createdAt: _createdAt };
}

export function storeTupleDomin8Lobby$Data(source: Domin8Lobby$Data) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.parent);
    builder.writeNumber(source.lobbyId);
    builder.writeBoolean(source.configured);
    builder.writeAddress(source.playerA);
    builder.writeAddress(source.playerB);
    builder.writeNumber(source.amount);
    builder.writeNumber(source.houseFee);
    builder.writeNumber(source.mapId);
    builder.writeNumber(source.skinA);
    builder.writeNumber(source.skinB);
    builder.writeNumber(source.commitHash);
    builder.writeNumber(source.status);
    builder.writeAddress(source.winner);
    builder.writeNumber(source.createdAt);
    return builder.build();
}

export function dictValueParserDomin8Lobby$Data(): DictionaryValue<Domin8Lobby$Data> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDomin8Lobby$Data(src)).endCell());
        },
        parse: (src) => {
            return loadDomin8Lobby$Data(src.loadRef().beginParse());
        }
    }
}

export type Domin8$Data = {
    $$type: 'Domin8$Data';
    owner: Address;
    treasury: Address;
    houseFee: bigint;
    minBet: bigint;
    maxBet: bigint;
    roundTime: bigint;
    currentRound: bigint;
    lobbyCount: bigint;
    locked: boolean;
}

export function storeDomin8$Data(src: Domin8$Data) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.owner);
        b_0.storeAddress(src.treasury);
        b_0.storeUint(src.houseFee, 16);
        b_0.storeCoins(src.minBet);
        b_0.storeCoins(src.maxBet);
        b_0.storeUint(src.roundTime, 32);
        b_0.storeUint(src.currentRound, 64);
        b_0.storeUint(src.lobbyCount, 64);
        b_0.storeBit(src.locked);
    };
}

export function loadDomin8$Data(slice: Slice) {
    const sc_0 = slice;
    const _owner = sc_0.loadAddress();
    const _treasury = sc_0.loadAddress();
    const _houseFee = sc_0.loadUintBig(16);
    const _minBet = sc_0.loadCoins();
    const _maxBet = sc_0.loadCoins();
    const _roundTime = sc_0.loadUintBig(32);
    const _currentRound = sc_0.loadUintBig(64);
    const _lobbyCount = sc_0.loadUintBig(64);
    const _locked = sc_0.loadBit();
    return { $$type: 'Domin8$Data' as const, owner: _owner, treasury: _treasury, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, currentRound: _currentRound, lobbyCount: _lobbyCount, locked: _locked };
}

export function loadTupleDomin8$Data(source: TupleReader) {
    const _owner = source.readAddress();
    const _treasury = source.readAddress();
    const _houseFee = source.readBigNumber();
    const _minBet = source.readBigNumber();
    const _maxBet = source.readBigNumber();
    const _roundTime = source.readBigNumber();
    const _currentRound = source.readBigNumber();
    const _lobbyCount = source.readBigNumber();
    const _locked = source.readBoolean();
    return { $$type: 'Domin8$Data' as const, owner: _owner, treasury: _treasury, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, currentRound: _currentRound, lobbyCount: _lobbyCount, locked: _locked };
}

export function loadGetterTupleDomin8$Data(source: TupleReader) {
    const _owner = source.readAddress();
    const _treasury = source.readAddress();
    const _houseFee = source.readBigNumber();
    const _minBet = source.readBigNumber();
    const _maxBet = source.readBigNumber();
    const _roundTime = source.readBigNumber();
    const _currentRound = source.readBigNumber();
    const _lobbyCount = source.readBigNumber();
    const _locked = source.readBoolean();
    return { $$type: 'Domin8$Data' as const, owner: _owner, treasury: _treasury, houseFee: _houseFee, minBet: _minBet, maxBet: _maxBet, roundTime: _roundTime, currentRound: _currentRound, lobbyCount: _lobbyCount, locked: _locked };
}

export function storeTupleDomin8$Data(source: Domin8$Data) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.owner);
    builder.writeAddress(source.treasury);
    builder.writeNumber(source.houseFee);
    builder.writeNumber(source.minBet);
    builder.writeNumber(source.maxBet);
    builder.writeNumber(source.roundTime);
    builder.writeNumber(source.currentRound);
    builder.writeNumber(source.lobbyCount);
    builder.writeBoolean(source.locked);
    return builder.build();
}

export function dictValueParserDomin8$Data(): DictionaryValue<Domin8$Data> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDomin8$Data(src)).endCell());
        },
        parse: (src) => {
            return loadDomin8$Data(src.loadRef().beginParse());
        }
    }
}

 type Domin8Game_init_args = {
    $$type: 'Domin8Game_init_args';
    parent: Address;
    gameId: bigint;
}

function initDomin8Game_init_args(src: Domin8Game_init_args) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.parent);
        b_0.storeInt(src.gameId, 257);
    };
}

async function Domin8Game_init(parent: Address, gameId: bigint) {
    const __code = Cell.fromHex('b5ee9c7241021f0100087d00022cff008e88f4a413f4bcf2c80bed53208e8130e1ed43d9010902027102070201660305026db3c57b513434800063893e9020404075c01640b4405b5b5c1c151c00151c00151c0014c01b484384440395475c00b8c376cf1b2edb26e00a0400185612547bda547cba547cba2c02d9b3f1fb513434800063893e9020404075c01640b4405b5b5c1c151c00151c00151c0014c01b484384440395475c00b8c34444c4450444c4448444c44484444444844444440444444403c44403d543b6cf15c417c3db10481ba48c1b66481bbcb4201bc95bc178881ba48c1b77a00a06004c8020230259f40f6fa192306ddf206e92306d8e11d0fa40fa00d307d30fd30f55406c156f05e202adbe5b476a268690000c7127d20408080eb802c816880b6b6b8382a38002a38002a380029803690870888072a8eb80171868889888a088988890889888908888889088888880888888807888807aa876d9e2b882f87b620c0a08004281010b220280204133f40a6fa19401d70130925b6de2206e923070e0206ef2d08004eaeda2edfb01d072d721d200d200fa4021103450666f04f86102f862ed44d0d200018e24fa40810101d7005902d1016d6d707054700054700054700053006d210e11100e551d7002e30d1115945f0f5f06e01113d70d1ff2e0822182102f5348acbae302218210aa44039cbae3022182107645a2e7ba0a0b0c0f00defa40d33fd200d30ffa00fa00d31fd307d3ffd307d33fd401d0d33ffa00d31fd31fd72c01916d93fa4001e201fa00d200f404f404300911140909111309091112090911110909111009109f109e109d109c109b109a57141112111311121111111211111110111111100f11100f550e01a4313a3a3a3a3a3a04d30ffa00fa00d31fd307d3ff30820085d6f8425613c705f2f481513c1110b301111001f2f41110111211100f11110f7f111105111005104f103e4dc0104b108a107910681036454043301d01fe31d307d30fd30f308200a1ea5613f2f4f8416f24306c12820afaf080a18200f5972ec302f2f4813640215614bef2f482009ae4215613bbf2f4817e822a8103e8b9f2f470561981010b2480204133f40a6fa19401d70130925b6de2206eb3983120206ef2d08001de801e238208989680b993308014de228200b22e02b9f2f40d01fe2f9d3d3d3d71f823f8235612a04feddf82008155f8232fbbf2f46e9309a409de802023513048135076c855405045ce58fa02cb07cb0fcb0fc902111702542490206e953059f45b30944133f417e207a45088a081010b1115a40311160302111502011115018020216e955b59f4593098c801cf014133f441e21111111311110e014e1110111211100f11110f0e11100e10df10ce10bd10ac109b108a107910681067105610354430121d04fce3022182109d546687bae302018210946a98b6ba8ee7d33f30c8018210aff90f5758cb1fcb3fc91112111411121111111311111110111211100f11110f0e11100e10df10ce10bd10ac109b108a10791068105710461035443012f84270705003804201503304c8cf8580ca00cf8440ce01fa02806acf40f400c901fb00e010191d1e04f631d3ff30820085d6f8425614c705f2f48109e92ac001f2f48200adfaf82329bef2f481082926c200f2f41112111311121111111211111110111111100f11100f10ef10de10cd10bc10ab109a108910781067105610451034111441305614db3c8133943c2cba1bf2f47225c001e30f111211131112111111121111111214180026c8cbffc9d09b9320d74a91d5e868f90400da1101fe333357122180207059f40f6fa192306ddf206e92306d8e11d0fa40fa00d307d30fd30f55406c156f05e2206ef2d0806f255f038208989680716f00c801308210a0d1042a01cb1fc9561555205a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c913000601fb00019c111427a9087020935308b98eb82380202259f40f6fa192306ddf206e92306d8e11d0fa40fa00d307d30fd30f55406c156f05e2206ef2d0806f255f0313a05303bce30232a4e85f030111130141331501fa10235f033333535ea8812710a9045360a1218208989680a07125206ef2d0805615524306c855308210ee3c5e885005cb1f13cb3fce01fa0201fa02c956150350445a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0011121113111216014e1111111211111110111111100f11100f10ef10de10cd10bc10ab108910781067105610454433021700c8c87f01ca001114111311121111111055e0011113011114ce01111101cb3f1fca001dcb0f500bfa025009fa0217cb1f15cb0713cbffcb07cb3f01c8cb3f58fa0212cb1f12cb1f58206e9430cf84809201cee258fa0212ca0012f40012f400cdc9ed54db3101441110111111100f11100f10ef10de10cd10bc10ab102a1089107810671056503304051d03fe5b8200f2f829c002f2f481560e01b3f2f48160d9226eb3f2f4f8428200a5c323206ef2d0805220c70592317f95015612c705e2f2f47f22206ef2d080718824595a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00708100a088561455201a1b1c002000000000446f6d696e38205072697a65001a0000000047616d6520446f6e65019c5a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb001111111311111110111211100f11110f0e11100e10df551c1d00c4c87f01ca001114111311121111111055e0011113011114ce01111101cb3f1fca001dcb0f500bfa025009fa0217cb1f15cb0713cbffcb07cb3f01c8cb3f58fa0212cb1f12cb1f58206e9430cf84809201cee258fa0212ca0012f40012f400cdc9ed54000e5f0f5f06f2c08291727b86');
    const builder = beginCell();
    builder.storeUint(0, 1);
    initDomin8Game_init_args({ $$type: 'Domin8Game_init_args', parent, gameId })(builder);
    const __data = builder.endCell();
    return { code: __code, data: __data };
}

export const Domin8Game_errors = {
    2: { message: "Stack underflow" },
    3: { message: "Stack overflow" },
    4: { message: "Integer overflow" },
    5: { message: "Integer out of expected range" },
    6: { message: "Invalid opcode" },
    7: { message: "Type check error" },
    8: { message: "Cell overflow" },
    9: { message: "Cell underflow" },
    10: { message: "Dictionary error" },
    11: { message: "'Unknown' error" },
    12: { message: "Fatal error" },
    13: { message: "Out of gas error" },
    14: { message: "Virtualization error" },
    32: { message: "Action list is invalid" },
    33: { message: "Action list is too long" },
    34: { message: "Action is invalid or not supported" },
    35: { message: "Invalid source address in outbound message" },
    36: { message: "Invalid destination address in outbound message" },
    37: { message: "Not enough Toncoin" },
    38: { message: "Not enough extra currencies" },
    39: { message: "Outbound message does not fit into a cell after rewriting" },
    40: { message: "Cannot process a message" },
    41: { message: "Library reference is null" },
    42: { message: "Library change action error" },
    43: { message: "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree" },
    50: { message: "Account state size exceeded limits" },
    128: { message: "Null reference exception" },
    129: { message: "Invalid serialization prefix" },
    130: { message: "Invalid incoming message" },
    131: { message: "Constraints error" },
    132: { message: "Access denied" },
    133: { message: "Contract stopped" },
    134: { message: "Invalid argument" },
    135: { message: "Code of a contract was not found" },
    136: { message: "Invalid standard address" },
    138: { message: "Not a basechain address" },
    2089: { message: "No bets" },
    2537: { message: "Not open" },
    3519: { message: "Fee > 10%" },
    4134: { message: "Not expired" },
    6698: { message: "Can't self-play" },
    9306: { message: "Must match bet" },
    10881: { message: "Above max" },
    12600: { message: "Bad round time" },
    13204: { message: "Bad reveal" },
    13888: { message: "Below min bet" },
    19745: { message: "Min = 0" },
    20796: { message: "Already configured" },
    22030: { message: "Already sent" },
    24793: { message: "No winner" },
    25893: { message: "Locked" },
    26156: { message: "Below min" },
    32386: { message: "Max bets reached" },
    33109: { message: "Betting ended" },
    33511: { message: "No player B" },
    34262: { message: "Only parent" },
    39652: { message: "Above max bet" },
    40356: { message: "Not ready" },
    41450: { message: "Not configured" },
    42435: { message: "Not authorized" },
    44538: { message: "Not ended yet" },
    45614: { message: "User bet limit" },
    48958: { message: "Max <= min" },
    62200: { message: "Not closed" },
    62871: { message: "Game closed" },
} as const

export const Domin8Game_errors_backward = {
    "Stack underflow": 2,
    "Stack overflow": 3,
    "Integer overflow": 4,
    "Integer out of expected range": 5,
    "Invalid opcode": 6,
    "Type check error": 7,
    "Cell overflow": 8,
    "Cell underflow": 9,
    "Dictionary error": 10,
    "'Unknown' error": 11,
    "Fatal error": 12,
    "Out of gas error": 13,
    "Virtualization error": 14,
    "Action list is invalid": 32,
    "Action list is too long": 33,
    "Action is invalid or not supported": 34,
    "Invalid source address in outbound message": 35,
    "Invalid destination address in outbound message": 36,
    "Not enough Toncoin": 37,
    "Not enough extra currencies": 38,
    "Outbound message does not fit into a cell after rewriting": 39,
    "Cannot process a message": 40,
    "Library reference is null": 41,
    "Library change action error": 42,
    "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree": 43,
    "Account state size exceeded limits": 50,
    "Null reference exception": 128,
    "Invalid serialization prefix": 129,
    "Invalid incoming message": 130,
    "Constraints error": 131,
    "Access denied": 132,
    "Contract stopped": 133,
    "Invalid argument": 134,
    "Code of a contract was not found": 135,
    "Invalid standard address": 136,
    "Not a basechain address": 138,
    "No bets": 2089,
    "Not open": 2537,
    "Fee > 10%": 3519,
    "Not expired": 4134,
    "Can't self-play": 6698,
    "Must match bet": 9306,
    "Above max": 10881,
    "Bad round time": 12600,
    "Bad reveal": 13204,
    "Below min bet": 13888,
    "Min = 0": 19745,
    "Already configured": 20796,
    "Already sent": 22030,
    "No winner": 24793,
    "Locked": 25893,
    "Below min": 26156,
    "Max bets reached": 32386,
    "Betting ended": 33109,
    "No player B": 33511,
    "Only parent": 34262,
    "Above max bet": 39652,
    "Not ready": 40356,
    "Not configured": 41450,
    "Not authorized": 42435,
    "Not ended yet": 44538,
    "User bet limit": 45614,
    "Max <= min": 48958,
    "Not closed": 62200,
    "Game closed": 62871,
} as const

const Domin8Game_types: ABIType[] = [
    {"name":"DataSize","header":null,"fields":[{"name":"cells","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"bits","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"refs","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"SignedBundle","header":null,"fields":[{"name":"signature","type":{"kind":"simple","type":"fixed-bytes","optional":false,"format":64}},{"name":"signedData","type":{"kind":"simple","type":"slice","optional":false,"format":"remainder"}}]},
    {"name":"StateInit","header":null,"fields":[{"name":"code","type":{"kind":"simple","type":"cell","optional":false}},{"name":"data","type":{"kind":"simple","type":"cell","optional":false}}]},
    {"name":"Context","header":null,"fields":[{"name":"bounceable","type":{"kind":"simple","type":"bool","optional":false}},{"name":"sender","type":{"kind":"simple","type":"address","optional":false}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"raw","type":{"kind":"simple","type":"slice","optional":false}}]},
    {"name":"SendParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"code","type":{"kind":"simple","type":"cell","optional":true}},{"name":"data","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"MessageParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"DeployParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}},{"name":"init","type":{"kind":"simple","type":"StateInit","optional":false}}]},
    {"name":"StdAddress","header":null,"fields":[{"name":"workchain","type":{"kind":"simple","type":"int","optional":false,"format":8}},{"name":"address","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"VarAddress","header":null,"fields":[{"name":"workchain","type":{"kind":"simple","type":"int","optional":false,"format":32}},{"name":"address","type":{"kind":"simple","type":"slice","optional":false}}]},
    {"name":"BasechainAddress","header":null,"fields":[{"name":"hash","type":{"kind":"simple","type":"int","optional":true,"format":257}}]},
    {"name":"Deploy","header":2490013878,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"DeployOk","header":2952335191,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"FactoryDeploy","header":1829761339,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"cashback","type":{"kind":"simple","type":"address","optional":false}}]},
    {"name":"ChangeOwner","header":2174598809,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"newOwner","type":{"kind":"simple","type":"address","optional":false}}]},
    {"name":"ChangeOwnerOk","header":846932810,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"newOwner","type":{"kind":"simple","type":"address","optional":false}}]},
    {"name":"InitConfig","header":2673672256,"fields":[{"name":"treasury","type":{"kind":"simple","type":"address","optional":false}},{"name":"houseFee","type":{"kind":"simple","type":"uint","optional":false,"format":16}},{"name":"minBet","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"maxBet","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"roundTime","type":{"kind":"simple","type":"uint","optional":false,"format":32}}]},
    {"name":"Withdraw","header":195467089,"fields":[{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}}]},
    {"name":"CreateGame","header":3373137410,"fields":[{"name":"mapId","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"commitHash","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"SetGameConfig","header":793987244,"fields":[{"name":"houseFee","type":{"kind":"simple","type":"uint","optional":false,"format":16}},{"name":"minBet","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"maxBet","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"roundTime","type":{"kind":"simple","type":"uint","optional":false,"format":32}},{"name":"mapId","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"commitHash","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"PlaceBet","header":2856584092,"fields":[{"name":"skin","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"posX","type":{"kind":"simple","type":"uint","optional":false,"format":16}},{"name":"posY","type":{"kind":"simple","type":"uint","optional":false,"format":16}}]},
    {"name":"RevealAndEnd","header":1984275175,"fields":[{"name":"secret","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"ClaimPrize","header":2639554183,"fields":[]},
    {"name":"CreateLobby","header":3976891980,"fields":[{"name":"mapId","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"skin","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"commitHash","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"SetLobbyConfig","header":2415301961,"fields":[{"name":"playerA","type":{"kind":"simple","type":"address","optional":false}},{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"houseFee","type":{"kind":"simple","type":"uint","optional":false,"format":16}},{"name":"mapId","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"skinA","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"commitHash","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"JoinLobby","header":4223482501,"fields":[{"name":"skin","type":{"kind":"simple","type":"uint","optional":false,"format":8}}]},
    {"name":"SettleLobby","header":1018103688,"fields":[{"name":"lobbyId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"secret","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"RescueLobby","header":680795721,"fields":[{"name":"lobbyId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"InternalGameEnded","header":3996933768,"fields":[{"name":"gameId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"winner","type":{"kind":"simple","type":"address","optional":false}},{"name":"prize","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"fee","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}}]},
    {"name":"InternalLobbySettled","header":2568781984,"fields":[{"name":"lobbyId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"winner","type":{"kind":"simple","type":"address","optional":false}},{"name":"prize","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"fee","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}}]},
    {"name":"InternalUnlock","header":2698052650,"fields":[]},
    {"name":"BetInfo","header":null,"fields":[{"name":"player","type":{"kind":"simple","type":"address","optional":false}},{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"skin","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"posX","type":{"kind":"simple","type":"uint","optional":false,"format":16}},{"name":"posY","type":{"kind":"simple","type":"uint","optional":false,"format":16}}]},
    {"name":"GameState","header":null,"fields":[{"name":"gameId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"status","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"mapId","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"startDate","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"endDate","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"totalPot","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"betCount","type":{"kind":"simple","type":"uint","optional":false,"format":32}},{"name":"userCount","type":{"kind":"simple","type":"uint","optional":false,"format":32}},{"name":"winner","type":{"kind":"simple","type":"address","optional":true}},{"name":"winnerPrize","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"prizeSent","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"LobbyState","header":null,"fields":[{"name":"lobbyId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"status","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"playerA","type":{"kind":"simple","type":"address","optional":false}},{"name":"playerB","type":{"kind":"simple","type":"address","optional":true}},{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"mapId","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"skinA","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"skinB","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"winner","type":{"kind":"simple","type":"address","optional":true}},{"name":"createdAt","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"MasterConfig","header":null,"fields":[{"name":"admin","type":{"kind":"simple","type":"address","optional":false}},{"name":"treasury","type":{"kind":"simple","type":"address","optional":false}},{"name":"houseFee","type":{"kind":"simple","type":"uint","optional":false,"format":16}},{"name":"minBet","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"maxBet","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"roundTime","type":{"kind":"simple","type":"uint","optional":false,"format":32}},{"name":"currentRound","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"lobbyCount","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"locked","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"Domin8Game$Data","header":null,"fields":[{"name":"parent","type":{"kind":"simple","type":"address","optional":false}},{"name":"gameId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"configured","type":{"kind":"simple","type":"bool","optional":false}},{"name":"houseFee","type":{"kind":"simple","type":"uint","optional":false,"format":16}},{"name":"minBet","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"maxBet","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"roundTime","type":{"kind":"simple","type":"uint","optional":false,"format":32}},{"name":"mapId","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"commitHash","type":{"kind":"simple","type":"uint","optional":false,"format":256}},{"name":"status","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"startDate","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"endDate","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"totalPot","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"betCount","type":{"kind":"simple","type":"uint","optional":false,"format":32}},{"name":"userCount","type":{"kind":"simple","type":"uint","optional":false,"format":32}},{"name":"winner","type":{"kind":"simple","type":"address","optional":true}},{"name":"winnerPrize","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"prizeSent","type":{"kind":"simple","type":"bool","optional":false}},{"name":"bets","type":{"kind":"dict","key":"uint","keyFormat":32,"value":"BetInfo","valueFormat":"ref"}},{"name":"playerBetCounts","type":{"kind":"dict","key":"address","value":"uint","valueFormat":32}}]},
    {"name":"Domin8Lobby$Data","header":null,"fields":[{"name":"parent","type":{"kind":"simple","type":"address","optional":false}},{"name":"lobbyId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"configured","type":{"kind":"simple","type":"bool","optional":false}},{"name":"playerA","type":{"kind":"simple","type":"address","optional":false}},{"name":"playerB","type":{"kind":"simple","type":"address","optional":true}},{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"houseFee","type":{"kind":"simple","type":"uint","optional":false,"format":16}},{"name":"mapId","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"skinA","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"skinB","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"commitHash","type":{"kind":"simple","type":"uint","optional":false,"format":256}},{"name":"status","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"winner","type":{"kind":"simple","type":"address","optional":true}},{"name":"createdAt","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"Domin8$Data","header":null,"fields":[{"name":"owner","type":{"kind":"simple","type":"address","optional":false}},{"name":"treasury","type":{"kind":"simple","type":"address","optional":false}},{"name":"houseFee","type":{"kind":"simple","type":"uint","optional":false,"format":16}},{"name":"minBet","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"maxBet","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"roundTime","type":{"kind":"simple","type":"uint","optional":false,"format":32}},{"name":"currentRound","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"lobbyCount","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"locked","type":{"kind":"simple","type":"bool","optional":false}}]},
]

const Domin8Game_opcodes = {
    "Deploy": 2490013878,
    "DeployOk": 2952335191,
    "FactoryDeploy": 1829761339,
    "ChangeOwner": 2174598809,
    "ChangeOwnerOk": 846932810,
    "InitConfig": 2673672256,
    "Withdraw": 195467089,
    "CreateGame": 3373137410,
    "SetGameConfig": 793987244,
    "PlaceBet": 2856584092,
    "RevealAndEnd": 1984275175,
    "ClaimPrize": 2639554183,
    "CreateLobby": 3976891980,
    "SetLobbyConfig": 2415301961,
    "JoinLobby": 4223482501,
    "SettleLobby": 1018103688,
    "RescueLobby": 680795721,
    "InternalGameEnded": 3996933768,
    "InternalLobbySettled": 2568781984,
    "InternalUnlock": 2698052650,
}

const Domin8Game_getters: ABIGetter[] = [
    {"name":"state","methodId":77589,"arguments":[],"returnType":{"kind":"simple","type":"GameState","optional":false}},
    {"name":"bet","methodId":81863,"arguments":[{"name":"index","type":{"kind":"simple","type":"int","optional":false,"format":257}}],"returnType":{"kind":"simple","type":"BetInfo","optional":true}},
    {"name":"playerBets","methodId":117608,"arguments":[{"name":"player","type":{"kind":"simple","type":"address","optional":false}}],"returnType":{"kind":"simple","type":"int","optional":false,"format":257}},
]

export const Domin8Game_getterMapping: { [key: string]: string } = {
    'state': 'getState',
    'bet': 'getBet',
    'playerBets': 'getPlayerBets',
}

const Domin8Game_receivers: ABIReceiver[] = [
    {"receiver":"internal","message":{"kind":"typed","type":"SetGameConfig"}},
    {"receiver":"internal","message":{"kind":"typed","type":"PlaceBet"}},
    {"receiver":"internal","message":{"kind":"typed","type":"RevealAndEnd"}},
    {"receiver":"internal","message":{"kind":"typed","type":"ClaimPrize"}},
    {"receiver":"internal","message":{"kind":"typed","type":"Deploy"}},
]


export class Domin8Game implements Contract {
    
    public static readonly storageReserve = 0n;
    public static readonly errors = Domin8Game_errors_backward;
    public static readonly opcodes = Domin8Game_opcodes;
    
    static async init(parent: Address, gameId: bigint) {
        return await Domin8Game_init(parent, gameId);
    }
    
    static async fromInit(parent: Address, gameId: bigint) {
        const __gen_init = await Domin8Game_init(parent, gameId);
        const address = contractAddress(0, __gen_init);
        return new Domin8Game(address, __gen_init);
    }
    
    static fromAddress(address: Address) {
        return new Domin8Game(address);
    }
    
    readonly address: Address; 
    readonly init?: { code: Cell, data: Cell };
    readonly abi: ContractABI = {
        types:  Domin8Game_types,
        getters: Domin8Game_getters,
        receivers: Domin8Game_receivers,
        errors: Domin8Game_errors,
    };
    
    constructor(address: Address, init?: { code: Cell, data: Cell }) {
        this.address = address;
        this.init = init;
    }
    
    async send(provider: ContractProvider, via: Sender, args: { value: bigint, bounce?: boolean| null | undefined }, message: SetGameConfig | PlaceBet | RevealAndEnd | ClaimPrize | Deploy) {
        
        let body: Cell | null = null;
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'SetGameConfig') {
            body = beginCell().store(storeSetGameConfig(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'PlaceBet') {
            body = beginCell().store(storePlaceBet(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'RevealAndEnd') {
            body = beginCell().store(storeRevealAndEnd(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ClaimPrize') {
            body = beginCell().store(storeClaimPrize(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Deploy') {
            body = beginCell().store(storeDeploy(message)).endCell();
        }
        if (body === null) { throw new Error('Invalid message type'); }
        
        await provider.internal(via, { ...args, body: body });
        
    }
    
    async getState(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('state', builder.build())).stack;
        const result = loadGetterTupleGameState(source);
        return result;
    }
    
    async getBet(provider: ContractProvider, index: bigint) {
        const builder = new TupleBuilder();
        builder.writeNumber(index);
        const source = (await provider.get('bet', builder.build())).stack;
        const result_p = source.readTupleOpt();
        const result = result_p ? loadTupleBetInfo(result_p) : null;
        return result;
    }
    
    async getPlayerBets(provider: ContractProvider, player: Address) {
        const builder = new TupleBuilder();
        builder.writeAddress(player);
        const source = (await provider.get('playerBets', builder.build())).stack;
        const result = source.readBigNumber();
        return result;
    }
    
}
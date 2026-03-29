import {
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  scValToNative,
  nativeToScVal,
  rpc as SorobanRpc,
  xdr
} from "@stellar/stellar-sdk";
import {
  getAddress,
  isConnected,
  requestAccess,
  signTransaction
} from "@stellar/freighter-api";

const RPC_URL =
  import.meta.env.VITE_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  import.meta.env.VITE_SOROBAN_NETWORK_PASSPHRASE ??
  Networks.TESTNET;
const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID ?? "";

const server = new SorobanRpc.Server(RPC_URL);

type Primitive = string | number | boolean;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    if ("message" in error && typeof (error as any).message === "string") {
      return (error as any).message;
    }
    try {
      return JSON.stringify(error, (_, val) => {
        if (typeof val === "bigint") return val.toString();
        return val;
      });
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function toScVal(value: Primitive): xdr.ScVal {
  return nativeToScVal(value, {
    type: typeof value === "number" ? "u64" : undefined
  });
}

function requireContractId() {
  if (!CONTRACT_ID) {
    throw new Error("Missing VITE_CONTRACT_ID in frontend/.env");
  }
}

export async function connectWallet(): Promise<string> {
  const connected = await isConnected();
  if (connected.error) {
    throw new Error(`Freighter connection check failed: ${connected.error}`);
  }

  if (!connected.isConnected) {
    const access = await requestAccess();
    if (access.error) {
      throw new Error(`Freighter access denied: ${access.error}`);
    }
    if (access.address) {
      return access.address;
    }
  }

  const address = await getAddress();
  if (address.error) {
    throw new Error(`Freighter getAddress failed: ${address.error}`);
  }
  if (!address.address) {
    throw new Error(
      "Freighter did not return an address. Unlock Freighter and select an active account, then try again."
    );
  }
  return address.address;
}

export async function invokeRead<T>(
  method: string,
  args: Primitive[],
  sourceAddress: string
): Promise<T> {
  requireContractId();

  const account = await server.getAccount(sourceAddress);
  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: method,
        args: args.map((v) => toScVal(v))
      })
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${formatError(sim.error)}`);
  }

  const retval = sim.result?.retval;
  if (!retval) {
    throw new Error("No value returned from simulation");
  }

  return scValToNative(retval) as T;
}

async function waitForSuccess(hash: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    try {
      const txResult = await server.getTransaction(hash);
      if (txResult.status === "SUCCESS") {
        return;
      }
      if (txResult.status === "FAILED") {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Some RPC/SDK version combos can fail to decode transaction status.
      // If that happens, continue without blocking the write flow.
      if (message.includes("Bad union switch")) {
        console.warn("Unable to decode transaction status from RPC; proceeding with submitted hash.");
        return;
      }

      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error("Timed out waiting for transaction confirmation");
}

export async function invokeWrite(method: string, args: Primitive[]): Promise<string> {
  requireContractId();

  const source = await connectWallet();
  const account = await server.getAccount(source);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: method,
        args: args.map((v) => toScVal(v))
      })
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${formatError(sim.error)}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE
  });

  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error ?? "Unable to sign transaction with Freighter");
  }

  const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE);
  const submitted = await server.sendTransaction(signedTx);

  if (submitted.errorResult) {
    throw new Error("Send transaction failed");
  }

  await waitForSuccess(submitted.hash);
  return submitted.hash;
}

export async function invokeWriteWithResult<T>(
  method: string,
  args: Primitive[]
): Promise<{ hash: string; result: T }> {
  requireContractId();

  const source = await connectWallet();
  const account = await server.getAccount(source);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: method,
        args: args.map((v) => toScVal(v))
      })
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${formatError(sim.error)}`);
  }

  // Extract result from simulation before sending
  const retval = sim.result?.retval;
  if (!retval) {
    throw new Error("No return value from contract function");
  }
  const result = scValToNative(retval) as T;

  const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE
  });

  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error ?? "Unable to sign transaction with Freighter");
  }

  const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE);
  const submitted = await server.sendTransaction(signedTx);

  if (submitted.errorResult) {
    throw new Error("Send transaction failed");
  }

  await waitForSuccess(submitted.hash);
  return { hash: submitted.hash, result };
}

export function getConfig() {
  return {
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    contractId: CONTRACT_ID
  };
}

export function createDemoAddress(): string {
  return Keypair.random().publicKey();
}

export async function checkConnection(): Promise<boolean> {
  const connected = await isConnected();
  if (connected.error) {
    throw new Error(`Freighter connection check failed: ${connected.error}`);
  }

  if (connected.isConnected) {
    return true;
  }

  const access = await requestAccess();
  if (access.error) {
    return false;
  }

  return Boolean(access.address);
}

export async function retrievePublicKey(): Promise<string> {
  const address = await getAddress();
  if (address.error) {
    throw new Error(`Freighter getAddress failed: ${address.error}`);
  }
  if (address.address) {
    return address.address;
  }

  const access = await requestAccess();
  if (access.error || !access.address) {
    throw new Error(
      access.error ??
        "Freighter did not return an address. Unlock Freighter and select an active account, then try again."
    );
  }

  return access.address;
}

export async function getBalance(publicKey?: string): Promise<string> {
  const accountId = publicKey ?? (await retrievePublicKey());
  const response = await fetch(`https://horizon-testnet.stellar.org/accounts/${accountId}`);

  if (!response.ok) {
    throw new Error(`Unable to fetch balance for ${accountId}`);
  }

  const account = (await response.json()) as {
    balances?: Array<{ asset_type: string; balance: string }>;
  };

  const native = account.balances?.find((asset) => asset.asset_type === "native");
  return native?.balance ?? "0";
}
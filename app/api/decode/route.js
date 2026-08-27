import { NextResponse } from "next/server";
import { isMulticallData } from "../../utils/multicall.js";
import { decodeMulticall } from "../../utils/multicallDecoder.js";
import { decodeUniversalRouter } from "../../utils/universalRouter.js";
import { decodeFunctionWithCandidates } from "../../utils/decodeWithCandidates.js";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const data = searchParams.get("data");

  if (!data) {
    return NextResponse.json(
      { error: "Missing data parameter" },
      { status: 400 },
    );
  }

  try {
    return await handleDecode(data, searchParams);
  } catch (err) {
    console.error("Failed to decode calldata:", err);
    return NextResponse.json(
      { error: "Failed to decode calldata" },
      { status: 500 },
    );
  }
}

async function handleDecode(data, searchParams) {
  const withAbi = searchParams.get("with_abi") === "true";
  const withSign = searchParams.get("with_sign") === "true";

  if (isMulticallData(data)) {
    const mc = decodeMulticall(data);
    if (mc) {
      const inner_calls = await decodeInnerCalls(mc.inner_calls);
      return NextResponse.json({
        msg: "ok",
        data: [
          {
            func: mc.func,
            args: mc.args,
            inner_calls,
            multicall_type: mc.multicall_type,
            source: "client",
          },
        ],
      });
    }

    const ur = decodeUniversalRouter(data);
    if (ur) {
      return NextResponse.json({
        msg: "ok",
        data: [
          {
            func: ur.func,
            args: ur.args,
            inner_calls: ur.inner_calls,
            multicall_type: ur.multicall_type,
            source: "client",
          },
        ],
      });
    }
  }

  const decoded = await decodeFunctionWithCandidates(data);
  if (!decoded) {
    return NextResponse.json({ msg: "not found", data: null });
  }

  const hex = data.startsWith("0x") ? data : "0x" + data;
  const item = {
    func: decoded.func,
    args: decoded.args,
    source: decoded.source,
  };
  if (withSign) item.sign = hex.slice(0, 10);
  if (withAbi) item.abi = decoded.abi;

  return NextResponse.json({ msg: "ok", data: [item] });
}

// Decode each multicall inner call's raw data via the candidate merge (best-effort).
async function decodeInnerCalls(inner_calls) {
  return Promise.all(
    inner_calls.map(async (call) => {
      const d = call.data;
      if (!d || d === "0x" || d.length < 10) return call;
      const decoded = await decodeFunctionWithCandidates(d);
      return decoded
        ? {
            ...call,
            decoded: {
              func: decoded.func,
              args: decoded.args,
              source: decoded.source,
            },
          }
        : call;
    }),
  );
}

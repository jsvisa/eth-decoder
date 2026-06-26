from multicall.eth_decode import eth_decode_log_as_dict


def serialize_value(value):
    if isinstance(value, int):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [serialize_value(v) for v in value]
    if isinstance(value, dict):
        return {k: serialize_value(v) for k, v in value.items()}
    return value


def decode_event_log(abi, topics, data):
    parameter = eth_decode_log_as_dict(abi, topics, data or "0x")
    if parameter is None:
        raise ValueError("ABI type mismatch or unsupported event")
    return {"event": abi.get("name"), "args": serialize_value(parameter)}

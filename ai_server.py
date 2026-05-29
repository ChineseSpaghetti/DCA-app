import json
import mimetypes
import os
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


HOST = "127.0.0.1"
PORT = 8080


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path != "/api/extract":
            self.send_error(404)
            return

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            self.write_json(
                {"error": "Set GEMINI_API_KEY before starting ai_server.py."},
                status=500,
            )
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length))
            image = body.get("image")
            if not image or not image.startswith("data:image/"):
                self.write_json({"error": "Missing image data URL."}, status=400)
                return

            result = extract_transaction(api_key, image)
            self.write_json(result)
        except Exception as exc:
            self.write_json({"error": str(exc)}, status=500)

    def do_GET(self):
        if self.path.startswith("/api/fx"):
            try:
                self.write_json(fetch_fx_rate())
            except Exception as exc:
                self.write_json({"error": str(exc)}, status=500)
            return
        if self.path.startswith("/api/quotes"):
            try:
                query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                items = query.get("items", [""])[0]
                self.write_json(fetch_quotes(items))
            except Exception as exc:
                self.write_json({"error": str(exc)}, status=500)
            return
        super().do_GET()

    def write_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def extract_transaction(api_key, image_data_url):
    image_header, image_base64 = image_data_url.split(",", 1)
    mime_type = image_header.split(";")[0].replace("data:", "")
    schema = {
        "type": "OBJECT",
        "properties": {
            "symbol": {"type": "STRING"},
            "side": {"type": "STRING", "enum": ["buy", "sell", "unknown"]},
            "currency": {"type": "STRING"},
            "price": {"type": "NUMBER"},
            "shares": {"type": "NUMBER"},
            "stockValue": {"type": "NUMBER"},
            "commission": {"type": "NUMBER"},
            "vat": {"type": "NUMBER"},
            "fee": {"type": "NUMBER"},
            "date": {"type": "STRING"},
            "confidence": {"type": "NUMBER"},
            "notes": {"type": "STRING"},
        },
        "required": [
            "symbol",
            "side",
            "currency",
            "price",
            "shares",
            "stockValue",
            "commission",
            "vat",
            "fee",
            "date",
            "confidence",
            "notes",
        ],
        "propertyOrdering": [
            "symbol",
            "side",
            "currency",
            "price",
            "shares",
            "stockValue",
            "commission",
            "vat",
            "fee",
            "date",
            "confidence",
            "notes",
        ],
    }

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "Extract a brokerage stock transaction from this screenshot. "
                            "It may contain Thai labels. Map ราคาที่ได้จริง to price, "
                            "จำนวนหุ้น to shares, มูลค่าหุ้น to stockValue, "
                            "ค่าคอมมิชชั่น to commission, VAT to vat, and fee = commission + vat. "
                            "Return numbers only, no currency symbols. Convert Thai Buddhist years to ISO yyyy-mm-dd. "
                            "If uncertain, use empty string for text fields and 0 for numbers, and explain in notes."
                        ),
                    },
                    {"inline_data": {"mime_type": mime_type, "data": image_base64}},
                ],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema,
            "temperature": 0,
        },
    }

    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"Gemini API error {exc.code}: {detail}") from exc

    text = ""
    candidates = data.get("candidates", [])
    if candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        for part in parts:
            if "text" in part:
                text = part["text"]
                break
    if not text:
        raise RuntimeError("No structured output returned by Gemini.")
    return json.loads(text)


def fetch_fx_rate():
    try:
        yahoo_request = urllib.request.Request(
            "https://query1.finance.yahoo.com/v8/finance/chart/USDTHB=X?range=1d&interval=1m",
            headers={
                "Accept": "application/json",
                "User-Agent": "DCA-Ledger/0.1 local portfolio app",
            },
            method="GET",
        )
        with urllib.request.urlopen(yahoo_request, timeout=20) as response:
            yahoo_data = json.loads(response.read().decode("utf-8"))
        result = yahoo_data.get("chart", {}).get("result", [{}])[0]
        meta = result.get("meta", {})
        quote = result.get("indicators", {}).get("quote", [{}])[0]
        closes = [value for value in quote.get("close", []) if isinstance(value, (int, float))]
        rate = meta.get("regularMarketPrice") or (closes[-1] if closes else None) or meta.get("previousClose")
        if isinstance(rate, (int, float)):
            market_time = meta.get("regularMarketTime")
            return {
                "base": "USD",
                "quote": "THB",
                "rate": rate,
                "date": datetime.fromtimestamp(market_time).isoformat() if market_time else "",
                "source": "Yahoo Finance",
                "sourceUrl": "https://finance.yahoo.com/quote/USDTHB=X/",
            }
    except Exception:
        pass

    request = urllib.request.Request(
        "https://api.frankfurter.dev/v2/rate/USD/THB",
        headers={
            "Accept": "application/json",
            "User-Agent": "DCA-Ledger/0.1 local portfolio app",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        data = json.loads(response.read().decode("utf-8"))

    return {
        "base": "USD",
        "quote": "THB",
        "rate": data["rate"],
        "date": data.get("date", ""),
        "source": "Frankfurter",
        "sourceUrl": "https://frankfurter.dev/",
    }


def provider_symbol(symbol, currency):
    clean = symbol.strip().upper()
    if "." in clean or clean.startswith("^"):
        return clean
    if currency == "THB":
        return f"{clean}.BK"
    return clean


def fetch_quote(symbol, currency):
    yahoo_symbol = provider_symbol(symbol, currency)
    encoded = urllib.parse.quote(yahoo_symbol, safe="")
    request = urllib.request.Request(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?range=1d&interval=1d",
        headers={
            "Accept": "application/json",
            "User-Agent": "DCA-Ledger/0.1 local portfolio app",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        data = json.loads(response.read().decode("utf-8"))

    error = data.get("chart", {}).get("error")
    if error:
        raise RuntimeError(error.get("description") or error.get("code") or "Quote unavailable")

    result = data.get("chart", {}).get("result", [])
    if not result:
        raise RuntimeError("Quote unavailable")

    meta = result[0].get("meta", {})
    price = meta.get("regularMarketPrice") or meta.get("previousClose")
    if price is None:
        raise RuntimeError("Price unavailable")

    return {
        "symbol": symbol,
        "providerSymbol": yahoo_symbol,
        "price": price,
        "currency": meta.get("currency") or currency,
        "exchange": meta.get("exchangeName") or "",
        "marketTime": meta.get("regularMarketTime") or 0,
        "source": "Yahoo Finance chart",
    }


def fetch_quotes(items):
    quotes = {}
    errors = {}
    for item in filter(None, items.split(",")):
        parts = item.split(":")
        symbol = parts[0].strip().upper()
        currency = parts[1].strip().upper() if len(parts) > 1 else "USD"
        if not symbol:
            continue
        try:
            quotes[symbol] = fetch_quote(symbol, currency)
        except Exception as exc:
            errors[symbol] = str(exc)

    return {
        "quotes": quotes,
        "errors": errors,
        "source": "Yahoo Finance chart",
        "sourceUrl": "https://finance.yahoo.com/",
    }


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    mime = mimetypes.types_map
    mime[".js"] = "text/javascript"
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving DCA Ledger with Gemini AI extraction at http://{HOST}:{PORT}/standalone.html")
    server.serve_forever()

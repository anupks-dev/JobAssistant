import { AppConfig } from "../config/AppConfig";

export class CurrencyConverter {
  public toUsd(amount: number, currency: string, rates: AppConfig["currencyRates"]): number | null {
    const code: string = currency.trim().toUpperCase();
    const rate: number | null = this.rateFor(code, rates);
    if (rate === null) {
      return null;
    }
    return amount * rate;
  }

  private rateFor(code: string, rates: AppConfig["currencyRates"]): number | null {
    if (code === "USD") {
      return rates.USD;
    }
    if (code === "EUR") {
      return rates.EUR;
    }
    if (code === "GBP") {
      return rates.GBP;
    }
    if (code === "CAD") {
      return rates.CAD;
    }
    if (code === "AUD") {
      return rates.AUD;
    }
    if (code === "SGD") {
      return rates.SGD;
    }
    if (code === "AED") {
      return rates.AED;
    }
    if (code === "INR") {
      return rates.INR;
    }
    return null;
  }
}

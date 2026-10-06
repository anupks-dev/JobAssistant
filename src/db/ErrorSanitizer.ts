// Fetcher errors sometimes echo the request URL, which can contain an API key.
export class ErrorSanitizer {
  public sanitize(message: string): string {
    const withoutUserInfo: string = this.redactUserInfo(message);
    const withoutQuerySecrets: string = this.redactQuerySecrets(withoutUserInfo);
    const withoutAssignments: string = this.redactAssignments(withoutQuerySecrets);
    const withoutBearer: string = this.redactBearer(withoutAssignments);
    const withoutAuthorization: string = this.redactAuthorization(withoutBearer);
    const withoutPrefixedKeys: string = this.redactPrefixedKeys(withoutAuthorization);
    const withoutNvidiaKeys: string = this.redactNvidiaKeys(withoutPrefixedKeys);
    return withoutNvidiaKeys;
  }

  private redactUserInfo(message: string): string {
    return message.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[redacted]@");
  }

  private redactQuerySecrets(message: string): string {
    return message.replace(
      /([?&](?:app_id|app_key|api[_-]?key|access_token|token|secret|password|auth|signature|key)=)[^&#\s]*/gi,
      "$1[redacted]",
    );
  }

  private redactAssignments(message: string): string {
    return message.replace(
      /\b((?:app_id|app_key|api[_-]?key|access_token|token|secret|password|auth|signature)\s*[:=]\s*)([^\s&]+)/gi,
      "$1[redacted]",
    );
  }

  private redactBearer(message: string): string {
    return message.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]");
  }

  private redactAuthorization(message: string): string {
    return message.replace(/\bAuthorization\s*:\s*\S+/gi, "Authorization: [redacted]");
  }

  private redactPrefixedKeys(message: string): string {
    return message.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]");
  }

  private redactNvidiaKeys(message: string): string {
    return message.replace(/\bnvapi-[A-Za-z0-9_-]+\b/gi, "[redacted]");
  }
}

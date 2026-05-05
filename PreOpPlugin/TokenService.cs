using System;
using System.Collections.Concurrent;
using Microsoft.Xrm.Sdk;

namespace vip.AzureMonitor
{
    /// <summary>
    /// In-memory token cache shared across plugin executions.
    /// Per https://techcommunity.microsoft.com/blog/microsoftmissioncriticalblog/token-cache-service-inside-d365-ce-plugin-base/4447321
    /// Static field survives plugin re-instantiation as long as the AppDomain is loaded.
    /// </summary>
    public sealed class TokenService
    {
        private readonly ITracingService _trace;
        private static readonly ConcurrentDictionary<Guid, CachedAccessToken> Cache = new ConcurrentDictionary<Guid, CachedAccessToken>();

        public TokenService(ITracingService trace) { _trace = trace; }

        public string GetAccessToken(Guid key)
        {
            if (Cache.TryGetValue(key, out var t))
            {
                var minutesLeft = (t.Expiry - DateTime.UtcNow).TotalMinutes;
                if (minutesLeft > 2)
                {
                    _trace.Trace($"TokenCache HIT key={key} exp={t.Expiry:o} minLeft={minutesLeft:F1}");
                    return t.Token;
                }
                _trace.Trace($"TokenCache STALE key={key} (left={minutesLeft:F1} min)");
            }
            else
            {
                _trace.Trace($"TokenCache MISS key={key}");
            }
            return null;
        }

        public void SetAccessToken(Guid key, string token, DateTime expiryUtc)
        {
            Cache[key] = new CachedAccessToken(token, expiryUtc);
            _trace.Trace($"TokenCache SET key={key} exp={expiryUtc:o}");
        }

        private sealed class CachedAccessToken
        {
            public string Token { get; }
            public DateTime Expiry { get; }
            public CachedAccessToken(string token, DateTime expiry) { Token = token; Expiry = expiry; }
        }
    }
}

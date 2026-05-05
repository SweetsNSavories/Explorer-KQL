using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.PluginTelemetry;

namespace vip.AzureMonitor
{
    /// <summary>
    /// Decorator that wraps the platform-supplied <see cref="ITracingService"/> and
    /// forwards every Trace call to <see cref="ILogger"/> (Application Insights),
    /// without requiring any change to existing plugin code.
    ///
    /// Pattern from: https://techcommunity.microsoft.com/blog/microsoftmissioncriticalblog/seamless-blend-of-ilogger-with-itracingservice-inside-d365-ce-plugins/4447276
    ///
    /// Per the post's "Final Thoughts": tracing the same message to BOTH sinks
    /// doubles WorkerCommunication pressure when plugins emit large strings in
    /// loops. We forward to both by default for parity with Plugin Trace Logs;
    /// flip <see cref="DualSink"/> to false to send Application Insights only.
    /// </summary>
    internal sealed class LoggerTracingServiceDecorator : ITracingService
    {
        private readonly ITracingService _tracing;
        private readonly ILogger _logger;
        public bool DualSink { get; set; } = true;

        public LoggerTracingServiceDecorator(ITracingService tracing, ILogger logger)
        {
            _tracing = tracing;
            _logger = logger;
        }

        public void Trace(string format, params object[] args)
        {
            if (DualSink) _tracing?.Trace(format, args);
            _logger?.LogInformation(format, args);
        }
    }

    public abstract class PluginBase : IPlugin
    {
        protected string UnsecureConfig { get; }
        protected string SecureConfig   { get; }

        protected PluginBase() { }
        protected PluginBase(string unsecureConfig, string secureConfig)
        {
            UnsecureConfig = unsecureConfig;
            SecureConfig   = secureConfig;
        }

        protected internal class LocalPluginContext
        {
            public IServiceProvider ServiceProvider { get; }
            public IPluginExecutionContext PluginExecutionContext { get; }
            public ITracingService TracingService { get; }
            public ILogger Logger { get; }
            public IOrganizationService InitiatingUserService { get; }
            public IOrganizationService SystemUserService { get; }
            public TokenService TokenService { get; }

            public LocalPluginContext(IServiceProvider sp)
            {
                ServiceProvider = sp;
                PluginExecutionContext = (IPluginExecutionContext)sp.GetService(typeof(IPluginExecutionContext));

                // Wrap ITracingService with the ILogger decorator so every existing
                // Trace(...) call also lands in Application Insights traces table.
                var standardTracing = (ITracingService)sp.GetService(typeof(ITracingService));
                Logger = (ILogger)sp.GetService(typeof(ILogger));
                TracingService = Logger != null
                    ? new LoggerTracingServiceDecorator(standardTracing, Logger)
                    : standardTracing;

                var f = (IOrganizationServiceFactory)sp.GetService(typeof(IOrganizationServiceFactory));
                InitiatingUserService = f.CreateOrganizationService(PluginExecutionContext.InitiatingUserId);
                SystemUserService     = f.CreateOrganizationService(null);
                TokenService = new TokenService(TracingService);
            }

            public void Trace(string m) => TracingService?.Trace(m);
        }

        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null) throw new ArgumentNullException(nameof(serviceProvider));
            var ctx = new LocalPluginContext(serviceProvider);
            try
            {
                ctx.Trace($"{GetType().Name} starting.");
                ExecutePlugin(ctx);
                ctx.Trace($"{GetType().Name} completed.");
            }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception ex)
            {
                ctx.Trace($"Unhandled: {ex}");
                throw new InvalidPluginExecutionException(ex.Message, ex);
            }
        }

        protected abstract void ExecutePlugin(LocalPluginContext ctx);
    }
}

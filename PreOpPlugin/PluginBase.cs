using System;
using Microsoft.Xrm.Sdk;

namespace vip.AzureMonitor
{
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
            public IOrganizationService InitiatingUserService { get; }
            public IOrganizationService SystemUserService { get; }
            public TokenService TokenService { get; }

            public LocalPluginContext(IServiceProvider sp)
            {
                ServiceProvider = sp;
                PluginExecutionContext = (IPluginExecutionContext)sp.GetService(typeof(IPluginExecutionContext));
                TracingService = (ITracingService)sp.GetService(typeof(ITracingService));
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

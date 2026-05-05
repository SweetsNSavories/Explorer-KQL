using System.Collections.Generic;

namespace vip.AzureMonitor
{
    /// <summary>
    /// Built-in saved queries returned by the 'savedqueries' operation.
    /// Empty by default — customers add their own via the saved-queries menu in the
    /// PCF or by editing this list and re-shipping the assembly.
    /// </summary>
    internal static class SavedQueries
    {
        public static readonly Dictionary<string, string> Queries = new Dictionary<string, string>
        {
            ["Top 10 slowest requests"] =
@"requests
| where timestamp >= _startTime and timestamp <= _endTime
| top 10 by duration desc
| project timestamp, name, duration, resultCode, operation_Id",

            ["Failed requests by name"] =
@"requests
| where timestamp >= _startTime and timestamp <= _endTime
| where success == false
| summarize failures = count() by name
| top 20 by failures",

            ["Exception count over time"] =
@"exceptions
| where timestamp >= _startTime and timestamp <= _endTime
| summarize count() by bin(timestamp, 1h), type
| order by timestamp asc",

            ["Top exception types"] =
@"exceptions
| where timestamp >= _startTime and timestamp <= _endTime
| summarize count() by type, outerMessage
| top 20 by count_",

            ["Request volume per hour"] =
@"requests
| where timestamp >= _startTime and timestamp <= _endTime
| summarize count() by bin(timestamp, 1h)
| order by timestamp asc",

            ["Dependency failures"] =
@"dependencies
| where timestamp >= _startTime and timestamp <= _endTime
| where success == false
| summarize failures = count() by target, type
| top 20 by failures",

            ["Trace messages (last 100)"] =
@"traces
| where timestamp >= _startTime and timestamp <= _endTime
| project timestamp, severityLevel, message, operation_Id
| order by timestamp desc
| take 100",
        };
    }
}

# Datadog Grok Tester Documentation

Welcome to the **Datadog Grok Tester**! This tool allows you to write, test, and manage Datadog-flavoured Grok rules for your log parsing pipelines.

## How to Use the Tool

1. **Write Match Rules:** In the "Test" tab, enter your Grok rules in the **Match Rules** editor. The format is typically `rule_name %{MATCHER:capture_name}`. Datadog built-in matchers will be highlighted, and you can use autocomplete to find available matchers and filters.
2. **Add Log Samples:** In the **Log Samples** section, click "Add Sample" to paste raw log lines you want to test. The tool will parse each line automatically against your Match Rules.
3. **Save and Manage Sessions:** You can optionally name your session and save it to the **History** tab. This allows you to manage different rulesets (for example, for different services) and easily load them back for future edits.
4. **Export as Terraform:** Once your rules are perfected, you can export them as a `.tfvars` string to easily drop into your Datadog Terraform configuration.

## How to Download Datadog Library Rules

If you want to use the official Datadog Integration parsing rules:

1. **Get the Integration JSON:** You can download the JSON export of a Datadog Integration Pipeline directly from the Datadog UI. Navigate to **Logs -> Configuration -> Pipelines**, find the integration you want, and export it as JSON.
2. **Import into the Tester:** Go to the **History** tab in this tool. Click the **Import Datadog Integrations** button and select the exported JSON file.
3. **Select Rules to Keep:** The tool will find all the Grok parsing processors in the file and let you cherry-pick the ones you want to save as sessions in your History.

## Available Matchers

Matchers define the regex patterns that capture segments of your logs.

| Matcher | Description |
|---|---|
| `date` | Parse date → Unix timestamp |
| `regex` | Match a custom regex |
| `notSpace` | Any string up to next space |
| `boolean` | true / false (case-insensitive) |
| `numberStr` | Float → string |
| `number` | Float → double |
| `numberExtStr` | Float w/ sci-notation → string |
| `numberExt` | Float w/ sci-notation → double |
| `integerStr` | Integer → string |
| `integer` | Integer → integer |
| `integerExtStr` | Integer w/ sci-notation → string |
| `integerExt` | Integer w/ sci-notation → integer |
| `word` | Word boundary token (`\b\w+\b`) |
| `doubleQuotedString` | Double-quoted string |
| `singleQuotedString` | Single-quoted string |
| `quotedString` | Single- or double-quoted string |
| `uuid` | UUID |
| `mac` | MAC address |
| `ipv4` | IPv4 address |
| `ipv6` | IPv6 address |
| `ip` | IPv4 or IPv6 address |
| `hostname` | Hostname |
| `ipOrHost` | Hostname or IP |
| `port` | Port number |
| `data` | Any string incl. spaces (`.*`) |

## Available Filters

Filters modify the data that has been captured by a matcher. They are added after the capture name, like `%{MATCHER:capture_name:filter}`.

| Filter | Description |
|---|---|
| `number` | Parse as double |
| `integer` | Parse as integer |
| `boolean` | Parse true/false string |
| `nullIf` | Null if equals value |
| `json` | Parse JSON |
| `rubyhash` | Parse Ruby hash |
| `useragent` | Parse user-agent string |
| `querystring` | Parse URL query string |
| `decodeuricomponent` | Decode URI component |
| `lowercase` | Lowercase string |
| `uppercase` | Uppercase string |
| `keyvalue` | Parse key=value pairs |
| `xml` | Parse XML |
| `csv` | Parse CSV / TSV |
| `scale` | Multiply by factor |
| `array` | Parse list into array |
| `url` | Parse URL into components |
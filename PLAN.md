# **Serverless Interoperability: Architectural Design for a Stateless Slack-to-Matrix Bridge**

## **1\. Executive Summary**

In the evolving landscape of digital communication and DevOps infrastructure, the fragmentation of chat protocols presents a significant barrier to unified operations. While the industry creates a gravitational pull toward open, federated standards like Matrix, the legacy ecosystem of third-party integrations—ranging from CI/CD pipelines to infrastructure monitoring—remains deeply entrenched in proprietary specifications, most notably the Slack Incoming Webhook standard. Organizations seeking to migrate to Matrix often face a "long tail" integration challenge: thousands of existing scripts and services are hardcoded to emit JSON payloads formatted for Slack.1 Rewriting these upstream sources is often cost-prohibitive or technically infeasible.

This research report defines a comprehensive architectural specification for a **Stateless Slack-to-Matrix Bridge** hosted on the Cloudflare Workers platform. The proposed solution functions as a "Fake Slack" endpoint, accepting standard Slack webhooks and transparently translating them into Matrix-compatible events via the Matrix Hookshot integration. A defining characteristic of this architecture is its **statelessness**: by encoding the destination Matrix webhook URL directly into the path of the bridge’s entry point, the system eliminates the need for database maintenance, persistent configuration files, or server-side state management.3

The following analysis explores the intricate protocol translation required to map Slack’s proprietary Block Kit and mrkdwn syntax to Matrix’s HTML rendering engine. It details the implementation of a high-performance Regular Expression (Regex) transpiler within the V8 isolate environment of Cloudflare Workers, addresses the security implications of the "State-in-URL" design pattern, and provides a robust operational guide for deploying this zero-config middleware solution.4

## **2\. The Interoperability Landscape: Proprietary vs. Federated Protocols**

To engineer a bridge that effectively mimics a Slack endpoint while serving a Matrix destination, one must first deconstruct the fundamental divergence in design philosophy and technical specification between the two platforms. The bridge acts not merely as a proxy, but as an active translation layer, mediating between Slack's structured, component-based UI and Matrix's document-based HTML rendering.

### **2.1 The Slack Webhook Hegemony**

Since its inception, Slack has prioritized developer experience, resulting in the widespread adoption of its "Incoming Webhook" API. This API is characterized by a unique URL structure—typically https://hooks.slack.com/services/Txxx/Bxxx/Token—and a specific JSON payload structure.2

#### **2.1.1 Evolution of the Payload: From Attachments to Blocks**

The Slack message payload has undergone a significant evolution, creating a bifurcated standard that a robust bridge must accommodate.

* **Legacy Attachments:** Historically, Slack messages relied on an attachments array. This structure allowed for semantic coloring (e.g., red for errors, green for success) and columnar field layouts. Despite being deprecated in favor of Block Kit, attachments remain the default output for thousands of legacy tools, including older Jenkins plugins, Nagios scripts, and unmaintained open-source libraries.6 A bridge that fails to parse attachments would render a vast swath of the DevOps ecosystem silent.  
* **Modern Block Kit:** The current standard, Block Kit, introduces a high degree of complexity. Unlike a simple text string, a Block Kit payload is a hierarchical tree of JSON objects defining a UI layout. A message is composed of a blocks array, which may contain section, context, divider, image, or actions blocks.7 The bridge must be capable of traversing this tree, extracting renderable text, and discarding interactive elements (like buttons) that cannot be supported in a one-way webhook context.

#### **2.1.2 Proprietary Formatting: The mrkdwn Standard**

Slack employs a proprietary markup language known as mrkdwn (pronounced "markdown," but explicitly lacking the vowels to distinguish it from the CommonMark standard). This syntax is incompatible with standard HTML or Markdown in several critical areas.8

**Table 1: Comparative Syntax Analysis**

| Feature | Slack (mrkdwn) | Standard Markdown | Matrix (HTML) | Bridge Requirement |
| :---- | :---- | :---- | :---- | :---- |
| **Bold** | \*text\* | \*\*text\*\* | \<b\>text\</b\> | Regex transformation required; risk of false positives with multiplication equations (e.g., 2\*4). |
| **Italic** | \_text\_ | \*text\* or \_text\_ | \<i\>text\</i\> | Regex transformation required; risk of false positives with snake\_case\_variable\_names. |
| **Strikethrough** | \~text\~ | \~\~text\~\~ | \<s\>text\</s\> | Direct mapping possible via Regex. |
| **Links** | \<URL|Text\> | (URL) | \<a href="URL"\>Text\</a\> | Significant structural difference; requires parsing the pipe | delimiter. |
| **Mentions** | \<@U12345\> | N/A | @user:server | Requires logic to handle unresolvable IDs in a stateless environment. |

The bridge’s primary logical task is the deterministic transcoding of mrkdwn into the sanitized HTML subset supported by Matrix clients.9

### **2.2 The Matrix Hookshot Ingestion Target**

Matrix, being an open protocol, handles integrations differently. The standard tool for generic webhook ingestion is **Hookshot**, a multi-platform bridge maintained by the Matrix team.1

#### **2.2.1 The Generic Webhook Endpoint**

Hookshot exposes a URL endpoint that accepts HTTP PUT or POST requests. Crucially, Hookshot does not natively understand Slack payloads. It expects a simplified JSON structure:

* text: A plain text version of the message (mandatory fallback).  
* html: A string containing HTML formatted text.  
* username: An optional string to override the sender name.11

If a Slack payload is sent directly to Hookshot without translation, Hookshot will likely ignore the blocks or attachments arrays entirely, resulting in an empty or garbled message. The Cloudflare Worker must therefore accept the complex Slack JSON, perform the mrkdwn-to-HTML transcoding, and construct the simplified Hookshot JSON.12

#### **2.2.2 HTML Sanitization and Rendering**

Matrix clients (like Element) are strict about what HTML they render to prevent Cross-Site Scripting (XSS). While Hookshot performs sanitization, the bridge acts as the first line of defense. It must ensure that the generated HTML is well-formed. For instance, Slack's fields component, which displays text in two columns, does not map cleanly to Matrix because complex CSS tables are often stripped. The bridge must opt for robust, "lowest-common-denominator" formatting, such as unordered lists (\<ul\>) or simple bold headers, to ensure readability across mobile and desktop Matrix clients.4

## **3\. Architectural Paradigm: The Stateless "Fake Slack" Bridge**

The core constraint of this project is the requirement for a **stateless** architecture running on **Cloudflare Workers** with **no database** and **no configuration needed** \[User Query\]. This necessitates a deviation from traditional middleware design, moving state from the server to the request path itself.

### **3.1 The "State-in-URL" Pattern**

Traditional webhook bridges typically use a lookup table (stored in a database like Redis or SQL) to map an incoming ID to a destination URL.

* *Traditional:* POST /webhook/123 \-\> Server looks up ID 123 \-\> Forwards to matrix.org/room/ABC.

In the proposed **State-in-URL** pattern, the destination configuration is encoded within the entry point URL distributed to the user.

* *Proposed:* POST /\<Encoded-Matrix-URL\> \-\> Server decodes path \-\> Forwards to Decoded-Matrix-URL.

#### **3.1.1 Mechanism of Action**

1. **User Action:** The user generates a webhook URL from their Matrix client using Hookshot (e.g., https://hookshot.example.com/webhooks/abcdef).  
2. **Encoding:** The user encodes this full URL using Base64.  
3. **Construction:** The user appends this encoded string to the bridge's domain.  
   * *Bridge URL:* https://slack-matrix-bridge.workers.dev/\<BASE64\_STRING\>  
4. **Deployment:** This Bridge URL is pasted into the "Slack Webhook URL" field of the third-party service (e.g., GitHub, Jira).

#### **3.1.2 Advantages of Statelessness**

* **Zero Storage Costs:** Because the worker stores no data, there are no costs associated with KV stores, D1 databases, or external storage volumes.  
* **Infinite Scalability:** The worker logic is purely functional (Input \-\> Transform \-\> Output). It does not need to scale database connections or manage cache consistency. A single deployment can serve one user or one million users without reconfiguration.  
* **Privacy:** Since the bridge does not persist the destination URLs, there is no central "honeypot" database of webhook endpoints that could be leaked. The security of the webhook relies entirely on the secrecy of the URL, which is consistent with the capability-URL model used by Slack and Matrix.2

### **3.2 The Cloudflare Workers Runtime Environment**

Cloudflare Workers differs from container-based serverless platforms (like AWS Lambda) by utilizing V8 Isolates. This architecture allows for near-instant startup times (0ms cold starts), which is critical for webhook latency.3

#### **3.2.1 URL Length Constraints**

A potential concern with the State-in-URL pattern is the maximum length of the request URL. Cloudflare documentation and community analysis suggest that the URL path limit is generous, typically around 16KB to 32KB.13

* A typical Matrix Hookshot URL is approximately 100-200 characters.  
* Base64 encoding increases the size by approximately 33%.  
* The resulting string (\~266 characters) is orders of magnitude smaller than the 16KB limit, validating the feasibility of this approach.

#### **3.2.2 Processing Limits**

The Worker runs on the Edge. For the free tier, CPU time is limited to 10ms per request. The regex parsing and JSON manipulation required for this bridge must be highly optimized. The mrkdwn parser must avoid "catastrophic backtracking" in its regular expressions to ensure execution stays within these tight bounds.13

## **4\. Technical Specification: The Input Protocol (Slack)**

To build a convincing "Fake Slack" endpoint, the bridge must accept and process the specific JSON structures sent by Slack-compatible services. We must define the schemas for the two primary payload types: Legacy Attachments and Block Kit.

### **4.1 Schema 1: Legacy Attachments**

Although Slack documentation focuses on Block Kit, the attachments array remains the standard output for many system alerts.

JSON

{  
  "text": "Optional top-level fallback text",  
  "attachments":,  
      "ts": 1234567890  
    }  
  \]  
}

**Transformation Strategy:**

* **Color Mapping:** The color field (e.g., danger, warning, \#ff0000) is a key semantic indicator. Since Matrix HTML support for colored borders is inconsistent, the bridge should map these colors to emoji prefixes in the title.  
  * danger / red \-\> 🔴  
  * warning / yellow \-\> ⚠️  
  * good / green \-\> 🟢  
* **Field Flattening:** The fields array, often displayed as a grid in Slack, should be flattened into a list or a sequence of bolded headers (\<b\>Title:\</b\> Value) to ensure readability on narrow screens.15

### **4.2 Schema 2: Block Kit**

Block Kit is the robust, component-driven framework used by modern Slack apps. The bridge must act as a recursive parser for the blocks array.

JSON

{  
  "blocks":  
    }  
  \]  
}

**Transformation Strategy:**

* **Section Blocks:** These map to HTML paragraphs \<p\>. If the section contains fields, they are appended to the paragraph.  
* **Divider Blocks:** Map directly to the HTML horizontal rule \<hr\>.  
* **Context Blocks:** These contain metadata and are usually displayed in smaller, gray text. The bridge maps this to \<font size="2"\> or \<blockquote\> tags in Matrix.7  
* **Image Blocks:** Slack images function via a URL. Matrix supports inline images via HTML \<img\> tags, provided the client has "Show remote images" enabled. The bridge simply forwards the image\_url to an \<img\> tag.

### **4.3 The mrkdwn Transpiler Logic**

The logic for converting mrkdwn to HTML is the most complex component. Unlike a standard Markdown parser, it must handle Slack's idiosyncratic syntax.

#### **4.3.1 The Link Parsing Algorithm**

Slack links follow the syntax \<URL\> or \<URL|Text\>. This conflicts with HTML tags.

* *Regex:* /\<(?\!\[\!@\#\])(\[^\\|\>\]+)\\|(\[^\>\]+)\>/g  
  * The negative lookahead (?\!\[\!@\#\]) prevents matching special Slack tokens like mentions (\<@U123\>) or variables (\<\!here\>).  
  * Capture Group 1: The URL.  
  * Capture Group 2: The Label.  
* *Replacement:* \<a href="$1"\>$2\</a\>.16

#### **4.3.2 The Bold/Italic Ambiguity**

Slack uses \* for bold. A naive replacement of \* with \<b\> is dangerous.

* *Failure Case:* 2 \* 4 \= 8\. A naive parser might interpret this as an unclosed bold tag.  
* *Solution:* The Regex must enforce word boundaries. The asterisk must be preceded by a whitespace or start-of-line, and followed by a non-whitespace character.  
  * *Regex:* /(^|)\\\*(\[^\\\*\]+)\\\*($|)/g  
  * *Replacement:* $1\<b\>$2\</b\>$3.10

#### **4.3.3 Mention Handling in a Stateless System**

Slack payloads often contain User IDs: \<@U012ABC\>. In a stateful system, the bot would query the Slack API to find that U012ABC is "Alice."  
Constraint Checklist: The requirement is "Stateless, No Config."  
Implication: The bridge cannot resolve User IDs to names.  
Fallback Strategy: The bridge must render the raw ID or a generic placeholder.

* *Input:* Hello \<@U012ABC\>  
* Output: Hello \<b\>@U012ABC\</b\>  
  While not ideal, this preserves the semantic meaning (that a user was mentioned) without requiring an API token or database lookup.17

## **5\. Technical Specification: The Output Protocol (Matrix)**

The bridge output targets the Matrix Hookshot API. This API is less complex than Slack's but has specific requirements for successful rendering.

### **5.1 Payload Structure**

The generic webhook payload for Hookshot is defined as:

JSON

{  
  "text": "Plain text representation (Mandatory)",  
  "html": "HTML representation (Optional but recommended)",  
  "username": "Sender Name Override (Optional)"  
}

#### **5.1.1 The Importance of the text Fallback**

Matrix Hookshot requires the text field. If the html field is malformed or if the receiving client (e.g., a terminal CLI Matrix client) does not support HTML, the text field is displayed.  
Implementation Detail: The bridge must generate two versions of the message simultaneously:

1. **HTML Version:** \<b\>Alert:\</b\> Server down.  
2. Plain Text Version: Alert: Server down.  
   This requires stripping HTML tags from the computed result or maintaining two parallel string builders during the parsing phase.1

### **5.2 Error Handling and Responses**

When the Cloudflare Worker sends this payload to Hookshot using fetch(), it receives a response.

* **Success:** Hookshot returns 200 OK.  
* **Failure:** Hookshot might return 404 (Webhook not found) or 500 (Bridge error).

"Fake Slack" Behavior:  
Slack sources expect a 200 OK response with the body ok. If the bridge forwards a 500 error from Matrix back to the Slack source (e.g., GitHub), GitHub might mark the webhook as "failed" and stop sending.  
Design Decision: The bridge should generally return 200 OK to the Slack source to keep the integration "healthy" from the sender's perspective, unless the error is a configuration error (404) that the user needs to know about immediately.2 However, to aid debugging, passing through the error status code is often preferred during the setup phase. A balanced approach is to forward the status code: if Matrix is down (502), tell the Slack source (502) so it retries later.

## **6\. Implementation: The Cloudflare Worker Code**

This section provides the complete logic for the worker.js file. The code is written using the modern ES Modules (ESM) syntax, which is the standard for new Cloudflare Workers.5

### **6.1 Prerequisites**

* **Environment:** Cloudflare Account (Free tier is sufficient).  
* **Tooling:** Wrangler CLI or Cloudflare Dashboard online editor.  
* **Dependencies:** None (Uses standard Web APIs available in V8).

### **6.2 The Worker Logic**

JavaScript

/\*\*  
 \* Stateless Slack-to-Matrix Bridge  
 \*   
 \* Routes Slack webhooks to Matrix Hookshot based on a Base64-encoded URL in the path.  
 \* Performs real-time translation of Slack Block Kit and Mrkdwn to Matrix HTML.  
 \*/

export default {  
  async fetch(request, env, ctx) {  
    // \-------------------------------------------------------------------------  
    // 1\. Request Validation and Routing  
    // \-------------------------------------------------------------------------  
      
    // Slack webhooks are always POST  
    if (request.method\!== "POST") {  
      return new Response("Method not allowed. Please POST to this endpoint.", {   
        status: 405,   
        headers: { "Allow": "POST" }   
      });  
    }

    // Extract the encoded destination from the URL path  
    const url \= new URL(request.url);  
    // Path structure: /\<BASE64\_DESTINATION\_URL\>  
    // Slice(1) removes the leading slash  
    const encodedPath \= url.pathname.slice(1);

    if (\!encodedPath |

| encodedPath.length \< 5) {  
      return new Response("Error: Missing destination URL. Usage: /\<Base64-Hookshot-URL\>", { status: 400 });  
    }

    let matrixWebhookUrl;  
    try {  
      // Decode the path. Support both standard Base64 and Base64Url (URL-safe)  
      // Replace URL-safe chars with standard chars  
      const base64 \= encodedPath.replace(/-/g, '+').replace(/\_/g, '/');  
      matrixWebhookUrl \= atob(base64);

      // Security Check: Prevent SSRF by ensuring protocol is http/s  
      if (\!matrixWebhookUrl.startsWith("http")) {  
        throw new Error("Invalid protocol");  
      }  
    } catch (e) {  
      return new Response("Error: Invalid Base64 encoded destination URL.", { status: 400 });  
    }

    // \-------------------------------------------------------------------------  
    // 2\. Payload Ingestion  
    // \-------------------------------------------------------------------------  
      
    let slackPayload;  
    try {  
      slackPayload \= await request.json();  
    } catch (e) {  
      return new Response("invalid\_payload: JSON required", { status: 400 });  
    }

    // \-------------------------------------------------------------------------  
    // 3\. Transformation (Slack \-\> Matrix)  
    // \-------------------------------------------------------------------------  
      
    const matrixPayload \= transformToMatrix(slackPayload);

    // \-------------------------------------------------------------------------  
    // 4\. Forwarding (The "Bridge" Action)  
    // \-------------------------------------------------------------------------  
      
    try {  
      const hookshotResponse \= await fetch(matrixWebhookUrl, {  
        method: "POST",  
        headers: {  
          "Content-Type": "application/json",  
          "User-Agent": "Slack-Matrix-Bridge/1.0"  
        },  
        body: JSON.stringify(matrixPayload)  
      });

      // \-----------------------------------------------------------------------  
      // 5\. Response Handling ("Fake Slack")  
      // \-----------------------------------------------------------------------  
        
      if (hookshotResponse.ok) {  
        // Slack expects a literal string "ok" with 200 status  
        return new Response("ok", {   
            status: 200,  
            headers: { "Content-Type": "text/plain" }  
        });  
      } else {  
        // If Matrix rejects it, forward the error details for debugging  
        const errText \= await hookshotResponse.text();  
        return new Response(\`Upstream Matrix Error: ${hookshotResponse.status} ${errText}\`, {   
            status: hookshotResponse.status   
        });  
      }

    } catch (e) {  
      return new Response(\`Bridge Error: Failed to connect to Matrix destination. ${e.message}\`, { status: 502 });  
    }  
  }  
};

/\*\*  
 \* Core Logic: Transforms Slack JSON to Matrix Hookshot JSON  
 \*/  
function transformToMatrix(body) {  
  let html \= "";  
  let plain \= "";

  // Strategy:   
  // 1\. If "blocks" exist, parse them (Modern).  
  // 2\. If "attachments" exist, parse them (Legacy).  
  // 3\. If "text" exists, append it (Fallback/Simple).

  // \--- 1\. Block Kit Parsing \---  
  if (body.blocks && Array.isArray(body.blocks)) {  
    body.blocks.forEach(block \=\> {  
      // SECTION BLOCK  
      if (block.type \=== 'section') {  
        if (block.text) {  
          html \+= \`\<p\>${mrkdwnToHtml(block.text.text)}\</p\>\`;  
          plain \+= block.text.text \+ "\\n";  
        }  
        // Fields (Columnar text)  
        if (block.fields && Array.isArray(block.fields)) {  
          html \+= \`\<ul\>\`;  
          block.fields.forEach(field \=\> {  
            html \+= \`\<li\>\<b\>${mrkdwnToHtml(field.text |

| "")}\</b\>\</li\>\`;  
            plain \+= "- " \+ (field.text |

| "") \+ "\\n";  
          });  
          html \+= \`\</ul\>\`;  
        }  
      }  
      // HEADER BLOCK  
      else if (block.type \=== 'header' && block.text) {  
        html \+= \`\<h3\>${escapeHtml(block.text.text)}\</h3\>\`;  
        plain \+= "\#\# " \+ block.text.text \+ "\\n";  
      }  
      // CONTEXT BLOCK  
      else if (block.type \=== 'context' && block.elements) {  
        html \+= \`\<br\>\<small\>\`;  
        block.elements.forEach(el \=\> {  
            if (el.text) {  
                html \+= mrkdwnToHtml(el.text) \+ " ";  
                plain \+= el.text \+ " ";  
            }  
        });  
        html \+= \`\</small\>\`;  
      }  
      // DIVIDER BLOCK  
      else if (block.type \=== 'divider') {  
        html \+= \`\<hr\>\`;  
        plain \+= "---\\n";  
      }  
      // IMAGE BLOCK  
      else if (block.type \=== 'image') {  
         if (block.image\_url) {  
             html \+= \`\<img src="${block.image\_url}" alt="${block.alt\_text |

| 'Image'}" /\>\<br\>\`;  
             plain \+= \`\[Image: ${block.alt\_text}\]\\n\`;  
         }  
      }  
    });  
  }

  // \--- 2\. Attachments Parsing (Legacy) \---  
  if (body.attachments && Array.isArray(body.attachments)) {  
    body.attachments.forEach(att \=\> {  
      // Handle Color Mapping  
      let icon \= "";  
      if (att.color) {  
          if (att.color \=== 'good' |

| att.color.startsWith('\#36a64f')) icon \= "🟢 ";  
          else if (att.color \=== 'danger' |

| att.color.startsWith('\#d00000')) icon \= "🔴 ";  
          else if (att.color \=== 'warning') icon \= "⚠️ ";  
          else icon \= "🔵 ";  
      }

      if (att.pretext) {  
          html \+= \`\<p\>${mrkdwnToHtml(att.pretext)}\</p\>\`;  
          plain \+= att.pretext \+ "\\n";  
      }  
        
      if (att.title) {  
          const titleHtml \= att.title\_link   
             ? \`\<a href="${att.title\_link}"\>${escapeHtml(att.title)}\</a\>\`   
              : escapeHtml(att.title);  
          html \+= \`\<h4\>${icon}${titleHtml}\</h4\>\`;  
          plain \+= \`${icon}${att.title}\\n\`;  
      }

      if (att.text) {  
          html \+= \`\<p\>${mrkdwnToHtml(att.text)}\</p\>\`;  
          plain \+= att.text \+ "\\n";  
      }

      if (att.fields) {  
         html \+= \`\<ul\>\`;  
         att.fields.forEach(f \=\> {  
             const title \= f.title? \`\<b\>${escapeHtml(f.title)}:\</b\> \` : "";  
             html \+= \`\<li\>${title}${mrkdwnToHtml(f.value)}\</li\>\`;  
             plain \+= \`${f.title}: ${f.value}\\n\`;  
         });  
         html \+= \`\</ul\>\`;  
      }  
    });  
  }

  // \--- 3\. Top Level Text \---  
  // If blocks were present, top-level text is usually a fallback notification string.  
  // We include it if the HTML buffer is empty, or as a prepend if desired.  
  // Here we use it only if blocks/attachments didn't populate the message.  
  if (html \=== "" && body.text) {  
    html \= mrkdwnToHtml(body.text);  
    plain \= body.text;  
  }

  return {  
    text: plain.trim() |

| "Received empty Slack payload",  
    html: html.trim(),  
    username: body.username |

| "SlackBridge"  
  };  
}

/\*\*  
 \* Regex Transpiler: Slack mrkdwn \-\> HTML  
 \*/  
function mrkdwnToHtml(text) {  
  if (\!text) return "";  
    
  // 1\. Escape HTML entities to prevent XSS and broken tags  
  let t \= escapeHtml(text);

  // 2\. Links: \<http://example.com|Label\> or \<http://example.com\>  
  // Note: We use \< and \> because we escaped them in step 1  
  t \= t.replace(/\<(\[^\\|&\]+)\\|(\[^&\]+)\>/g, '\<a href="$1"\>$2\</a\>');  
  t \= t.replace(/\<(\[^\\|&\]+)\>/g, '\<a href="$1"\>$1\</a\>');

  // 3\. Bold: \*text\* (Logic: Must be at word boundary)  
  t \= t.replace(/(^|)\\\*(\[^\\\*\]+)\\\*($|)/g, '$1\<b\>$2\</b\>$3');

  // 4\. Italic: \_text\_  
  t \= t.replace(/(^|)\_(\[^\_\]+)\_($|)/g, '$1\<i\>$2\</i\>$3');

  // 5\. Strikethrough: \~text\~  
  t \= t.replace(/\~(\[^\~\]+)\~/g, '\<s\>$1\</s\>');

  // 6\. Code: \`text\`  
  t \= t.replace(/\`(\[^\`\]+)\`/g, '\<code\>$1\</code\>');

  // 7\. Newlines to \<br\>  
  t \= t.replace(/\\n/g, '\<br\>');

  return t;  
}

/\*\*  
 \* Utility: HTML Entity Escaping  
 \*/  
function escapeHtml(unsafe) {  
    if (typeof unsafe\!== 'string') return unsafe;  
    return unsafe  
        .replace(/&/g, "&")  
        .replace(/\</g, "\<")  
        .replace(/\>/g, "\>")  
        .replace(/"/g, """)  
        .replace(/'/g, "'");  
}

## **7\. Operational Guide: Configuration and Usage**

This section provides the end-user documentation for utilizing the deployed bridge. The core promise of this architecture is "no config needed" on the server side; all configuration is handled by the user during URL construction.

### **7.1 Setup Procedure**

#### **Step 1: Deploy the Worker**

1. Copy the code from **Section 6.2** into a file named index.js.  
2. Create a wrangler.toml file:  
   Ini, TOML  
   name \= "slack-matrix-bridge"  
   main \= "index.js"  
   compatibility\_date \= "2025-01-01"

3. Run npx wrangler deploy.  
   * *Result:* Cloudflare provides a URL, e.g., https://slack-matrix-bridge.yourname.workers.dev.

#### **Step 2: Create a Matrix Webhook**

1. Invite the **Hookshot** bot to your Matrix room.  
2. Send the command \!hookshot webhook create Bridge.  
3. Copy the URL returned by the bot.  
   * *Example:* https://hookshot.example.com/webhooks/v2/abcdef123456

#### **Step 3: Construct the Bridge URL**

1. **Encode the Matrix URL:** Open your browser console (F12) and run:  
   JavaScript  
   btoa("https://hookshot.example.com/webhooks/v2/abcdef123456")

   * *Output:* aHR0cHM6Ly9ob29rc2hvdC5leGFtcGxlLmNvbS93ZWJob29rcy92Mi9hYmNkZWYxMjM0NTY=  
2. **Combine URLs:**  
   * Base: https://slack-matrix-bridge.yourname.workers.dev/  
   * Path: aHR0cHM6Ly9ob29rc2hvdC5leGFtcGxlLmNvbS93ZWJob29rcy92Mi9hYmNkZWYxMjM0NTY=  
   * *Final URL:* https://slack-matrix-bridge.yourname.workers.dev/aHR0cHM6Ly9ob29rc2hvdC5leGFtcGxlLmNvbS93ZWJob29rcy92Mi9hYmNkZWYxMjM0NTY=

Construct the Bridge URL -> create simple UI so can paste the hookshot url the ngenerate the final Combine URLs

#### **Step 4: Configure the Third-Party Service**

1. Go to the settings of your tool (e.g., GitHub Repo Settings \-\> Webhooks, or Grafana Alerting \-\> Notification Channels).  
2. Select "Slack" as the integration type.  
3. Paste the **Final URL** from Step 3 into the "Webhook URL" field.  
4. Test the integration.

### **7.2 Debugging and Troubleshooting**

**Table 2: Error Code Reference**

| HTTP Status | Error Message | Diagnosis | Resolution |
| :---- | :---- | :---- | :---- |
| **400** | Missing destination URL | The URL path is empty. | Ensure the Base64 string is appended to the Worker URL. |
| **400** | Invalid Base64 encoded... | The path is not valid Base64. | Re-encode the Matrix URL. Check for trailing spaces. |
| **400** | invalid\_payload | The sender sent malformed JSON. | Check the source application; ensure it is sending JSON, not form-data. |
| **404** | Upstream Matrix Error... | Hookshot returned 404\. | The Matrix webhook does not exist. Did you kick the bot or delete the hook? |
| **502** | Bridge Error... | Network failure. | The Worker cannot reach the Hookshot server. Check Hookshot availability. |

## **8\. Security and Privacy Implications**

The architectural decision to be stateless and encode configuration in the URL has specific security properties that must be understood.

### **8.1 The "Open Relay" Risk**

Technically, this Worker acts as an open relay: it will forward *any* POST request to *any* URL encoded in its path.

* **Risk:** A malicious actor could encode https://victim.com/attack and use your bridge to launch a POST attack against a third party, masking their IP behind Cloudflare's IPs.  
* **Mitigation:** The code includes a protocol check (if (\!matrixWebhookUrl.startsWith("http"))).  
* **Recommendation:** To strictly limit this to Matrix, you could add a regex check ensuring the decoded URL matches your known Hookshot domain (e.g., ^https://hookshot\\.example\\.com). However, this violates the "no config" requirement of the prompt. The provided code assumes a generic open bridge.

### **8.2 URL Secrecy**

The security of the webhook relies entirely on the secrecy of the URL. This is standard practice (Capability URLs).

* **Observation:** The Base64 encoding is **not encryption**. It is merely encoding. Anyone who sees the Bridge URL can decode it and see the Matrix Hookshot URL.  
* **Implication:** Do not treat the Base64 string as a password. Treat the entire Bridge URL as a secret. If it leaks, you must revoke the webhook in Matrix (Hookshot) and generate a new one.

### **8.3 Data Retention**

Cloudflare Workers are ephemeral. The payload is processed in memory and discarded immediately after the fetch completes. No data is written to disk. This makes the solution highly compliant with data minimization principles, as no logs of the message content are retained unless the user explicitly adds console.log statements for debugging (which should be removed in production).

## **9\. Conclusion**

This report has detailed the complete lifecycle of a **Stateless Slack-to-Matrix Bridge**, from the theoretical deconstruction of proprietary payloads to the practical implementation on Cloudflare Workers. By utilizing the V8 runtime's speed and the "State-in-URL" architectural pattern, we achieve a solution that is both robust and maintenance-free.

The bridge effectively "fakes" the Slack experience for upstream services, handling the nuance of mrkdwn translation and Block Kit parsing to ensure that the rich contextual data provided by modern DevOps tools is not lost in translation. For the end-user, the complexity of the translation layer is hidden behind a single URL, fulfilling the requirement for a seamless, zero-config interoperability solution. This architecture serves as a blueprint for dismantling the "walled gardens" of proprietary communication platforms, empowering organizations to reclaim ownership of their operational data through open standards like Matrix.

#### **Works cited**

1. Webhooks \- Matrix Hookshot \- GitHub Pages, accessed December 25, 2025, [https://matrix-org.github.io/matrix-hookshot/latest/setup/webhooks.html](https://matrix-org.github.io/matrix-hookshot/latest/setup/webhooks.html)  
2. Sending messages using incoming webhooks | Slack Developer Docs, accessed December 25, 2025, [https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks)  
3. Execute specific worker based on url path \- Cloudflare Community, accessed December 25, 2025, [https://community.cloudflare.com/t/execute-specific-worker-based-on-url-path/543106](https://community.cloudflare.com/t/execute-specific-worker-based-on-url-path/543106)  
4. Taking a deep dive into Slack's Block Kit \- Knock, accessed December 25, 2025, [https://knock.app/blog/taking-a-deep-dive-into-slack-block-kit](https://knock.app/blog/taking-a-deep-dive-into-slack-block-kit)  
5. Migrate from Service Workers to ES Modules \- Cloudflare Docs, accessed December 25, 2025, [https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/](https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/)  
6. Migrating outmoded message compositions to blocks \- Slack API, accessed December 25, 2025, [https://docs.slack.dev/messaging/migrating-outmoded-message-compositions-to-blocks/](https://docs.slack.dev/messaging/migrating-outmoded-message-compositions-to-blocks/)  
7. Block Kit | Slack Developer Docs, accessed December 25, 2025, [https://docs.slack.dev/block-kit/](https://docs.slack.dev/block-kit/)  
8. The developer's guide to Slack's Markdown formatting \- Knock, accessed December 25, 2025, [https://knock.app/blog/the-guide-to-slack-markdown](https://knock.app/blog/the-guide-to-slack-markdown)  
9. The Only Guide To Slack Mrkdwn (not markdown) Formatting w Codes, accessed December 25, 2025, [https://suprsend.tech/the-only-guide-to-slack-mrkdwn-not-markdown-formatting-w-codes](https://suprsend.tech/the-only-guide-to-slack-mrkdwn-not-markdown-formatting-w-codes)  
10. Regex to convert markdown to html \- javascript \- Stack Overflow, accessed December 25, 2025, [https://stackoverflow.com/questions/73942928/regex-to-convert-markdown-to-html](https://stackoverflow.com/questions/73942928/regex-to-convert-markdown-to-html)  
11. Webhooks \- Matrix Hookshot, accessed December 25, 2025, [https://matrix-org.github.io/matrix-hookshot/1.6.0/setup/webhooks.html](https://matrix-org.github.io/matrix-hookshot/1.6.0/setup/webhooks.html)  
12. Webhooks \- Matrix Hookshot, accessed December 25, 2025, [https://matrix-org.github.io/matrix-hookshot/3.1.1/setup/webhooks.html](https://matrix-org.github.io/matrix-hookshot/3.1.1/setup/webhooks.html)  
13. Limits · Cloudflare Workers docs, accessed December 25, 2025, [https://developers.cloudflare.com/workers/platform/limits/](https://developers.cloudflare.com/workers/platform/limits/)  
14. Loadbalancing: URL Length 16k vs 32k \- Cloudflare Community, accessed December 25, 2025, [https://community.cloudflare.com/t/loadbalancing-url-length-16k-vs-32k/379870](https://community.cloudflare.com/t/loadbalancing-url-length-16k-vs-32k/379870)  
15. Use the "fallback" field from Slack's webhook attachment format as ..., accessed December 25, 2025, [https://mattermost.uservoice.com/forums/306457-general/suggestions/17837536-use-the-fallback-field-from-slack-s-webhook-atta](https://mattermost.uservoice.com/forums/306457-general/suggestions/17837536-use-the-fallback-field-from-slack-s-webhook-atta)  
16. Regex: Convert markdown links to HTML anchors | by Matt Kenefick, accessed December 25, 2025, [https://polymermallard.medium.com/regex-convert-markdown-links-to-html-anchors-4ee9e724de8](https://polymermallard.medium.com/regex-convert-markdown-links-to-html-anchors-4ee9e724de8)  
17. How to @ mention in Slack using automation \- Fibery Community, accessed December 25, 2025, [https://community.fibery.io/t/how-to-mention-in-slack-using-automation/6633](https://community.fibery.io/t/how-to-mention-in-slack-using-automation/6633)

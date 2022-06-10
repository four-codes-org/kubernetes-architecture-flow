_product policies_

```xml
<policies>
    <inbound>
        <retry condition="@(context.Response.StatusCode == 401)" count="2" interval="1">
            <choose>
                <when condition="@(context.Variables.GetValueOrDefault("calledAPIMProductOnce", false))">
                    <cache-remove-value key="oauth2audtoken" />
                </when>
            </choose>
            <cache-lookup-value key="oauth2audtoken" default-value="noToken" variable-name="oauth2audtoken" />
            <choose>
                <when condition="@((string)context.Variables["oauth2audtoken"] == "noToken")">
                    <send-request ignore-error="false" timeout="20" response-variable-name="oauth2audtoken" mode="new">
                        <set-url>https://ky-core-001.vault.azure.net/secrets/oauth2-scopeid-for-jwtaud-key?api-version=7.0</set-url>
                        <set-method>GET</set-method>
                        <authentication-managed-identity resource="https://vault.azure.net" />
                    </send-request>
                    <set-variable name="oauth2audtoken" value="@{ var secret = ((IResponse)context.Variables["oauth2audtoken"]).Body.As<JObject>(); return secret["value"].ToString(); }" />
                    <cache-store-value key="oauth2audtoken" value="@((string)context.Variables["oauth2audtoken"])" duration="604800" />
                </when>
            </choose>
            <validate-jwt header-name="Authorization" failed-validation-httpcode="401" failed-validation-error-message="Unauthorized. Access token is missing or invalid.">
                <openid-config url="https://login.microsoftonline.com/xxxxxx/v2.0/.well-known/openid-configuration" />
                <issuers>
                    <issuer>https://sts.windows.net/xxxxxx-xxxx-xxxxx-xxxx-xxxxxxx/</issuer>
                </issuers>
                <required-claims>
                    <claim name="aud">
                        <value>@((string)context.Variables["oauth2audtoken"])</value>
                    </claim>
                </required-claims>
            </validate-jwt>
            <set-variable name="calledAPIMProductOnce" value="@(true)" />
        </retry>
        <base />
    </inbound>
    <backend>
        <base />
    </backend>
    <outbound>
        <base />
    </outbound>
    <on-error>
        <base />
    </on-error>
</policies>
```

_all api policies_

```xml
<policies>
    <inbound>
        <cors allow-credentials="true">
            <allowed-origins>
                <origin>https://apim.xxx.xxx.xxx.com</origin>
            </allowed-origins>
            <allowed-methods preflight-result-max-age="300">
                <method>*</method>
            </allowed-methods>
            <allowed-headers>
                <header>*</header>
            </allowed-headers>
            <expose-headers>
                <header>*</header>
            </expose-headers>
        </cors>
        <choose>
            <when condition="@(context.sbscription != null && context.sbscription.Id == "master")">
                <return-response>
                    <set-status code="400" reason="Bad Request" />
                    <set-header name="Content-Type" exists-action="override">
                        <value>application/json; charset=UTF-8</value>
                    </set-header>
                    <set-body>{"message": "Access denied due to invalid sbscription key."}</set-body>
                </return-response>
            </when>
        </choose>
    </inbound>
    <backend>
        <forward-request />
    </backend>
    <outbound />
    <on-error />
</policies>
```

_product based redirection_

```xml
<policies>
    <inbound>
        <choose>
            <when condition="@(context.Product.Name.Equals("dodo-xx-sb") || context.Product.Name.Equals("dodo-xx-pb")  )">
                <set-backend-service base-url="http://mo.xxx.xxxx.com:5555/xxxService" />
                <retry condition="@(context.Response.StatusCode == 401)" count="1" interval="1">
                    <choose>
                        <when condition="@(context.Variables.GetValueOrDefault("calledOnce", false))">
                            <cache-remove-value key="soa-01-op-xxxxsvc-basicauth-un-for-apim" />
                            <cache-remove-value key="soa-01-op-xxxxsvc-basicauth-password-for-apim" />
                        </when>
                    </choose>
                    <cache-lookup-value key="soa-01-op-xxxxsvc-basicauth-un-for-apim" default-value="noToken" variable-name="soa-01-op-xxxxsvc-basicauth-un-for-apim" />
                    <choose>
                        <when condition="@((string)context.Variables["soa-01-op-xxxxsvc-basicauth-un-for-apim"] == "noToken")">
                            <send-request ignore-error="false" timeout="20" response-variable-name="soa-01-op-xxxxsvc-basicauth-un-for-apim" mode="new">
                                <set-url>https://kyt-dodo.vault.azure.net/secrets/soa-01-op-xxxxsvc-basicauth-un-for-apim?api-version=7.0</set-url>
                                <set-method>GET</set-method>
                                <authentication-managed-identity resource="https://vault.azure.net" />
                            </send-request>
                            <set-variable name="soa-01-op-xxxxsvc-basicauth-un-for-apim" value="@{ var secret = ((IResponse)context.Variables["soa-01-op-xxxxsvc-basicauth-un-for-apim"]).Body.As<JObject>(); return secret["value"].ToString(); }" />
                            <cache-store-value key="soa-01-op-xxxxsvc-basicauth-un-for-apim" value="@((string)context.Variables["soa-01-op-xxxxsvc-basicauth-un-for-apim"])" duration="86400" />
                        </when>
                    </choose>
                    <cache-lookup-value key="soa-01-op-xxxxsvc-basicauth-password-for-apim" default-value="noToken" variable-name="soa-01-op-xxxxsvc-basicauth-password-for-apim" />
                    <choose>
                        <when condition="@((string)context.Variables["soa-01-op-xxxxsvc-basicauth-password-for-apim"] == "noToken")">
                            <send-request ignore-error="false" timeout="20" response-variable-name="soa-01-op-xxxxsvc-basicauth-password-for-apim" mode="new">
                                <set-url>https://kyt-dodo.vault.azure.net/secrets/soa-01-op-xxxxsvc-basicauth-password-for-apim?api-version=7.0</set-url>
                                <set-method>GET</set-method>
                                <authentication-managed-identity resource="https://vault.azure.net" />
                            </send-request>
                            <set-variable name="soa-01-op-xxxxsvc-basicauth-password-for-apim" value="@{ var secret = ((IResponse)context.Variables["soa-01-op-xxxxsvc-basicauth-password-for-apim"]).Body.As<JObject>(); return secret["value"].ToString(); }" />
                            <cache-store-value key="soa-01-op-xxxxsvc-basicauth-password-for-apim" value="@((string)context.Variables["soa-01-op-xxxxsvc-basicauth-password-for-apim"])" duration="86400" />
                        </when>
                    </choose>
                    <set-variable name="calledOnce" value="@(true)" />
                </retry>
                <authentication-basic un="@((string)context.Variables["soa-01-op-xxxxsvc-basicauth-un-for-apim"])" password="@((string)context.Variables["soa-01-op-xxxxsvc-basicauth-password-for-apim"])" />
            </when>
        </choose>
        <base />
    </inbound>
    <backend>
        <base />
    </backend>
    <outbound>
        <base />
    </outbound>
    <on-error>
        <base />
    </on-error>
</policies>
```

_Basic authentication username verification_

```xml
<policies>
    <inbound>
        <!--Get credentials from header-->
        <set-variable name="decodedHeader" value="@{string authHeader=context.Request.Headers.GetValueOrDefault("Authorization",""); authHeader=authHeader.sbstring(authHeader.IndexOf(" ")); authHeader=Encoding.UTF8.GetString(Convert.FromBase64String(authHeader)); return authHeader;}" />
        <set-variable name="un" value="@{ string user=(string)context.Variables["decodedHeader"]; user=user.sbstring(0,user.IndexOf(":")); return user;}" />
        <set-variable name="password" value="@{ string pwd=(string)context.Variables["decodedHeader"]; pwd=pwd.sbstring(pwd.IndexOf(":")+1); return pwd;}" />
        <!--Get un from keyvault-->
        <retry condition="@(context.Response.StatusCode == 401)" count="1" interval="1">
            <choose>
                <when condition="@(context.Variables.GetValueOrDefault("calledOnce", false))">
                    <cache-remove-value key="soa-01-op-dodo-basicauth-un-for-apim" />
                    <cache-remove-value key="soa-01-op-dodo-basicauth-password-for-apim" />
                </when>
            </choose>
            <cache-lookup-value key="soa-01-op-dodo-basicauth-un-for-apim" default-value="noToken" variable-name="soa-01-op-dodo-basicauth-un-for-apim" />
            <choose>
                <when condition="@((string)context.Variables["soa-01-op-dodo-basicauth-un-for-apim"] == "noToken")">
                    <send-request ignore-error="false" timeout="20" response-variable-name="soa-01-op-dodo-basicauth-un-for-apim" mode="new">
                        <set-url>https://kyt-dodo.vault.azure.net/secrets/soa-01-op-dodo-basicauth-un-for-apim?api-version=7.0</set-url>
                        <set-method>GET</set-method>
                        <authentication-managed-identity resource="https://vault.azure.net" />
                    </send-request>
                    <set-variable name="soa-01-op-dodo-basicauth-un-for-apim" value="@{ var secret = ((IResponse)context.Variables["soa-01-op-dodo-basicauth-un-for-apim"]).Body.As<JObject>(); return secret["value"].ToString(); }" />
                    <cache-store-value key="soa-01-op-dodo-basicauth-un-for-apim" value="@((string)context.Variables["soa-01-op-dodo-basicauth-un-for-apim"])" duration="86400" />
                </when>
            </choose>
            <cache-lookup-value key="soa-01-op-dodo-basicauth-password-for-apim" default-value="noToken" variable-name="soa-01-op-dodo-basicauth-password-for-apim" />
            <choose>
                <when condition="@((string)context.Variables["soa-01-op-dodo-basicauth-password-for-apim"] == "noToken")">
                    <send-request ignore-error="false" timeout="20" response-variable-name="soa-01-op-dodo-basicauth-password-for-apim" mode="new">
                        <set-url>https://kyt-dodo.vault.azure.net/secrets/soa-01-op-dodo-basicauth-password-for-apim?api-version=7.0</set-url>
                        <set-method>GET</set-method>
                        <authentication-managed-identity resource="https://vault.azure.net" />
                    </send-request>
                    <set-variable name="soa-01-op-dodo-basicauth-password-for-apim" value="@{ var secret = ((IResponse)context.Variables["soa-01-op-dodo-basicauth-password-for-apim"]).Body.As<JObject>(); return secret["value"].ToString(); }" />
                    <cache-store-value key="soa-01-op-dodo-basicauth-password-for-apim" value="@((string)context.Variables["soa-01-op-dodo-basicauth-password-for-apim"])" duration="86400" />
                </when>
            </choose>
            <choose>
                <when condition="@((string)context.Variables["un"] == (string)context.Variables["soa-01-op-dodo-basicauth-un-for-apim"])">
                    <choose>
                        <when condition="@((string)context.Variables["password"] == (string)context.Variables["soa-01-op-dodo-basicauth-password-for-apim"])" />
                        <otherwise>
                            <return-response>
                                <set-status code="401" reason="Unauthorized Password" />
                            </return-response>
                        </otherwise>
                    </choose>
                </when>
                <otherwise>
                    <return-response>
                        <set-status code="401" reason="Unauthorized" />
                    </return-response>
                </otherwise>
            </choose>
            <set-variable name="calledOnce" value="@(true)" />
        </retry>
        <set-body>@{ String str=context.Request.Body.As<String>(preserveContent:true);  str=str.Replace(str.sbstring(str.IndexOf("xmlns=")+7,str.IndexOf(" xmlns:soapenv")-26), "" ) ;  return str;}</set-body>
        <set-header name="Authorization" exists-action="delete" />
        <base />
    </inbound>
    <backend>
        <base />
    </backend>
    <outbound>
        <base />
    </outbound>
    <on-error>
        <base />
    </on-error>
</policies>

```

_soap body Replace_

```xml
<policies>
    <inbound>
        <base />
        <set-variable name="body" value="@(context.Request.Body.AsSoap(true).Body.Contents.ToString())" />
        <set-body template="liquid">
			<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://www.aqssolutions.com/xxxxAdministration/2012/09" xmlns:wsa="http://www.w3.org/2005/08/addressing">
				<soap:Header>
					<wsa:Action soap:mustUnderstand="true">http://www.xxx.com/xxxxAdministration/2012/09/IxxxxAdministration/ApplyChange</wsa:Action>
					<wsa:To soap:mustUnderstand="true">https://xxx.xxxx.xxxx.com/AQS.xxxxService/xxxxAdministrationService.svc</wsa:To>
				</soap:Header>
				<soap:Body>
                    {{context.Variables["body"]}}
				</soap:Body>
			</soap:Envelope>
		</set-body>
    </inbound>
    <backend>
        <base />
    </backend>
    <outbound>
        <base />
    </outbound>
    <on-error>
        <base />
    </on-error>
</policies>
```

_basic authentication policies_

```xml
<policies>
    <inbound>
        <base />
        <retry condition="@(context.Response.StatusCode == 401)" count="1" interval="1">
            <choose>
                <when condition="@(context.Variables.GetValueOrDefault("calledOnce", false))">
                    <cache-remove-value key="soa-00-op-xxxx-basicauth-un-for-apim" />
                    <cache-remove-value key="soa-00-op-xxxx-basicauth-password-for-apim" />
                </when>
            </choose>
            <cache-lookup-value key="soa-00-op-xxxx-basicauth-un-for-apim" default-value="noToken" variable-name="soa-00-op-xxxx-basicauth-un-for-apim" />
            <choose>
                <when condition="@((string)context.Variables["soa-00-op-xxxx-basicauth-un-for-apim"] == "noToken")">
                    <send-request ignore-error="false" timeout="20" response-variable-name="soa-00-op-xxxx-basicauth-un-for-apim" mode="new">
                        <set-url>https://kyt-dodo.vault.azure.net/secrets/soa-00-op-xxxx-basicauth-un-for-apim?api-version=7.0</set-url>
                        <set-method>GET</set-method>
                        <authentication-managed-identity resource="https://vault.azure.net" />
                    </send-request>
                    <set-variable name="soa-00-op-xxxx-basicauth-un-for-apim" value="@{ var secret = ((IResponse)context.Variables["soa-00-op-xxxx-basicauth-un-for-apim"]).Body.As<JObject>(); return secret["value"].ToString(); }" />
                    <cache-store-value key="soa-00-op-xxxx-basicauth-un-for-apim" value="@((string)context.Variables["soa-00-op-xxxx-basicauth-un-for-apim"])" duration="86400" />
                </when>
            </choose>
            <cache-lookup-value key="soa-00-op-xxxx-basicauth-password-for-apim" default-value="noToken" variable-name="soa-00-op-xxxx-basicauth-password-for-apim" />
            <choose>
                <when condition="@((string)context.Variables["soa-00-op-xxxx-basicauth-password-for-apim"] == "noToken")">
                    <send-request ignore-error="false" timeout="20" response-variable-name="soa-00-op-xxxx-basicauth-password-for-apim" mode="new">
                        <set-url>https://kyt-dodo.vault.azure.net/secrets/soa-00-op-xxxx-basicauth-password-for-apim?api-version=7.0</set-url>
                        <set-method>GET</set-method>
                        <authentication-managed-identity resource="https://vault.azure.net" />
                    </send-request>
                    <set-variable name="soa-00-op-xxxx-basicauth-password-for-apim" value="@{ var secret = ((IResponse)context.Variables["soa-00-op-xxxx-basicauth-password-for-apim"]).Body.As<JObject>(); return secret["value"].ToString(); }" />
                    <cache-store-value key="soa-00-op-xxxx-basicauth-password-for-apim" value="@((string)context.Variables["soa-00-op-xxxx-basicauth-password-for-apim"])" duration="86400" />
                </when>
            </choose>
            <set-variable name="calledOnce" value="@(true)" />
        </retry>
        <authentication-basic un="@((string)context.Variables["soa-00-op-xxxx-basicauth-un-for-apim"])" password="@((string)context.Variables["soa-00-op-xxxx-basicauth-password-for-apim"])" />
    </inbound>
    <backend>
        <base />
    </backend>
    <outbound>
        <base />
    </outbound>
    <on-error>
        <base />
    </on-error>
</policies>
```

_rest to soap conversion_

```xml
<policies>
    <inbound>
        <base />
        <!-- <rewrite-uri template="/xxx/xxxx.svc" copy-unmatched-params="false" /> -->
        <set-header name="SOAPAction" exists-action="override">
            <value>"http://tempuri.org/zzzz/pBM"</value>
        </set-header>
        <set-body template="liquid">
			<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
				<soapenv:Header />
				<soapenv:Body>
					<tem:pBM>
                        {% if body.pBM.BillingType %}
                        <tem:BillingType>{{body.pBM.BillingType}}</tem:BillingType>
                        {% else %}
                        <tem:BillingType />
                        {% endif %}
                        {% if body.pBM.xxxxNumber %}
                        <tem:xxxxNumber>{{body.pBM.xxxxNumber}}</tem:xxxxNumber>
                        {% else %}
                       <tem:xxxxNumber />
                        {% endif %}
                        {% if body.pBM.RequestType %}
                        <tem:RequestType>{{body.pBM.RequestType}}</tem:RequestType>
                        {% else %}
                        <tem:RequestType />
                        {% endif %}
                        {% if body.pBM.TransactionId %}
                        <tem:TransactionId>{{body.pBM.TransactionId}}</tem:TransactionId>
                        {% else %}
                       <tem:TransactionId />
                        {% endif %}
                    </tem:pBM>
				</soapenv:Body>
			</soapenv:Envelope>
		</set-body>
        <set-header name="Content-Type" exists-action="override">
            <value>text/xml</value>
        </set-header>
    </inbound>
    <backend>
        <base />
    </backend>
    <outbound>
        <base />
        <choose>
            <when condition="@(context.Response.StatusCode < 400)">
                <set-body template="liquid">
        {
            "pBMResponse":
            {
                "status": {% if body.envelope.body.pBMResponse.Status %}"{{body.envelope.body.pBMResponse.Status | Replace: '\r', '\r' | Replace: '\n', '\n' | Replace: '([^\\](\\\\)*)"', '$1\"'}}"{% else %} null {% endif %}
            }
        }</set-body>
            </when>
            <otherwise>
                <set-variable name="old-body" value="@(context.Response.Body.As<string>(preserveContent: true))" />
                <!-- Error response as per https://github.com/Microsoft/api-guidelines/blob/master/Guidelines.md#7102-error-condition-responses -->
                <set-body template="liquid">{
            "error": {
                "code": "{{body.envelope.body.fault.faultcode}}",
                "message": "{{body.envelope.body.fault.faultstring}}"
            }
        }</set-body>
                <choose>
                    <when condition="@(string.IsNullOrEmpty(context.Response.Body.As<JObject>(preserveContent: true)["error"]["code"].ToString()) && string.IsNullOrEmpty(context.Response.Body.As<JObject>(preserveContent: true)["error"]["message"].ToString()))">
                        <set-body>@{
                    var newResponseBody = new JObject();
                    newResponseBody["error"] = new JObject();
                    newResponseBody["error"]["code"] = "InvalidErrorResponseBody";
                    if (string.IsNullOrEmpty((string)context.Variables["old-body"]))
                    {
                        newResponseBody["error"]["message"] = "The error response body was not a valid SOAP error response. The response body was empty.";
                    }
                    else
                    {
                        newResponseBody["error"]["message"] = "The error response body was not a valid SOAP error response. The response body was: '" + context.Variables["old-body"] + "'.";
                    }
                    return newResponseBody.ToString();
                }</set-body>
                    </when>
                </choose>
            </otherwise>
        </choose>
        <set-header name="Content-Type" exists-action="override">
            <value>application/json</value>
        </set-header>
    </outbound>
    <on-error>
        <base />
    </on-error>
</policies>
```
